// Edge Function: device-ingress
// Point d'entrée des box HAI-P200. Remplace le workflow n8n « Ingestion » (X33NGxNIjpyUNvvS).
// Contrat côté box : docs/device-provisioning.md.
//
// Routes (sous /functions/v1/device-ingress) :
//   POST /provision/<hostname>                 body { mac }            -> 200 | 400 | 404 | 410
//   POST /<hostname>/status                    Bearer <jeton box>      -> 200
//   POST /<hostname>/report/<period>           Bearer <jeton box>      -> 200   (period = daily | weekly)
//   (préfixe historique /ingress/... toujours accepté, ex. /ingress/<hostname>/status)
//
// À déployer avec verify_jwt = false : le Bearer est le jeton de la box, pas un JWT Supabase.
//
// COMPATIBILITÉ FIRMWARE — ne pas « corriger » sans mettre à jour les box :
//   n8n répondait 200 à /ingress/* AVANT tout traitement, même si le jeton est inconnu.
//   Or le firmware, sur 401/403, efface son jeton et se ré-enregistre ; il reçoit alors 410
//   et reste bloqué. On garde donc 200 dans tous les cas pour /ingress/* ; un jeton inconnu
//   est simplement ignoré (et journalisé).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const N8N_ACK = { message: "Workflow was started" }; // corps que renvoyait n8n

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export const MAC_RE = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/;

// « 20/04/2026 00:00 → 21/04/2026 00:00 (UTC+02:00) » -> dates ISO (début inclus, fin exclue).
export function parsePeriod(periodStr: unknown): {
  start: string | null;
  end: string | null;
} {
  if (typeof periodStr !== "string") return { start: null, end: null };
  const m = periodStr.match(
    /^(\d{2})\/(\d{2})\/(\d{4}) \d{2}:\d{2} → (\d{2})\/(\d{2})\/(\d{4}) \d{2}:\d{2}/,
  );
  if (!m) return { start: null, end: null };
  return { start: `${m[3]}-${m[2]}-${m[1]}`, end: `${m[6]}-${m[5]}-${m[4]}` };
}

function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function bearer(req: Request): string {
  return (req.headers.get("authorization") ?? "").replace("Bearer ", "");
}

async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const b = await req.json();
    return b && typeof b === "object" ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function background(p: Promise<unknown>) {
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(p);
}

async function provision(req: Request): Promise<Response> {
  const body = (await readJson(req)) ?? {};
  const mac = String(body.mac ?? "").trim();
  if (!MAC_RE.test(mac)) return json(400, { error: "invalid mac format" });

  const { data, error } = await admin.rpc("provision_device", {
    p_mac: mac,
    p_candidate_token: newToken(),
  });
  if (error) {
    console.error("provision_device", error.message);
    return json(500, { error: "unknown state" });
  }
  const row = Array.isArray(data) ? data[0] : null;
  if (!row?.id) return json(404, { error: "device not registered" });
  if (row.already_provisioned)
    return json(410, { error: "already provisioned, contact admin" });
  if (row.new_token) {
    console.log("provisioned", row.id);
    return json(200, { token: row.new_token, id: row.id, name: row.name });
  }
  return json(500, { error: "unknown state" });
}

async function analyze(reportId: string) {
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/analyze-report`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ report_id: reportId }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok)
      console.error(
        "analyze-report",
        reportId,
        r.status,
        (await r.text()).slice(0, 200),
      );
  } catch (e) {
    console.error("analyze-report", reportId, String(e));
  }
}

async function ingest(
  req: Request,
  hostname: string,
  period: string,
): Promise<unknown> {
  const token = bearer(req);
  const payload = await readJson(req);
  if (!payload) {
    console.warn("ingress: corps JSON invalide", hostname, period);
    return;
  }

  if (period === "status") {
    const { data, error } = await admin.rpc("ingest_status", {
      p_token: token,
      p_payload: payload,
    });
    if (error) console.error("ingest_status", hostname, error.message);
    else if (!data) console.warn("ingress status: jeton inconnu", hostname);
    // Pilotage à distance : la box n'envoie le bloc remote que si « Enable remote management » est actif.
    // Sans bloc remote -> réponse historique (les anciens firmwares ignorent le corps).
    const remote = payload.remote;
    if (error || !data || !remote || typeof remote !== "object") return;
    const device = (payload.device ?? {}) as Record<string, unknown>;
    const { data: commands, error: rErr } = await admin.rpc("ingest_remote", {
      p_token: token,
      p_remote: remote,
      p_running_version: typeof device.version === "string" ? device.version : null,
    });
    if (rErr) {
      console.error("ingest_remote", hostname, rErr.message);
      return { commands: [] };
    }
    const list = Array.isArray(commands) ? commands : [];
    if (list.length) console.log("remote: commandes servies", hostname, list.map((c) => c.type).join(","));
    return { commands: list };
  }

  if (period !== "daily" && period !== "weekly") {
    console.warn("ingress: période non gérée", hostname, period);
    return;
  }
  const metadata = (payload.metadata ?? {}) as Record<string, unknown>;
  const { start, end } = parsePeriod(metadata.period_str);
  const { data: reportId, error } = await admin.rpc("ingest_report", {
    p_token: token,
    p_type: period,
    p_payload: payload,
    p_period_start: start,
    p_period_end: end,
  });
  if (error) {
    console.error("ingest_report", hostname, period, error.message);
    return;
  }
  if (!reportId) {
    console.warn(
      "ingress report: rien écrit (jeton inconnu ou quota 0)",
      hostname,
      period,
    );
    return;
  }
  background(analyze(reportId as string));
}

Deno.serve(async (req) => {
  const path = new URL(req.url).pathname.replace(/^.*?\/device-ingress/, "");
  const parts = path.split("/").filter(Boolean).map(decodeURIComponent);

  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  // /provision/<hostname>
  if (parts[0] === "provision" && parts.length === 2) return provision(req);

  // /<hostname>/status  et  /<hostname>/report/<period>
  // (le préfixe historique /ingress, hérité de n8n, est toujours accepté)
  const r = parts[0] === "ingress" ? parts.slice(1) : parts;
  if (r.length >= 2) {
    const hostname = r[0];
    let period: string | null = null;
    if (r.length === 2 && r[1] === "status") period = "status";
    if (r.length === 3 && r[1] === "report") period = r[2];
    if (period) {
      try {
        const body = await ingest(req, hostname, period);
        if (body) return json(200, body); // objet JSON (pas un tableau), cf. doc firmware piège n°1
      } catch (e) {
        console.error("ingress", hostname, period, String(e));
      }
      return json(200, N8N_ACK);
    }
  }

  return json(404, { error: "not found" });
});

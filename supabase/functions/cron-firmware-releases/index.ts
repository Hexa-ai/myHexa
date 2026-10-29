// Edge Function: cron-firmware-releases
// Lit l'index du dépôt APT public des box et enregistre les versions du paquet hai-pxxx-ai
// dans firmware_releases. Le portail peut ainsi proposer une mise à jour même quand la box n'a
// pas rafraîchi sa propre liste de paquets.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const REPO =
  Deno.env.get("FIRMWARE_REPO_URL") ??
  "https://s3.hexa-ai.fr/hai-pxxx-ai-packages";
const PACKAGE = "hai-pxxx-ai";

export function parsePackages(text: string, pkg = PACKAGE) {
  const out: {
    version: string;
    description: string | null;
    size_bytes: number | null;
  }[] = [];
  for (const stanza of text.split(/\n\s*\n/)) {
    const f: Record<string, string> = {};
    for (const line of stanza.split("\n")) {
      const m = line.match(/^([A-Za-z-]+):\s*(.*)$/);
      if (m) f[m[1]] = m[2];
    }
    if (
      f.Package !== pkg ||
      !/^[0-9][0-9A-Za-z.~+-]{0,39}$/.test(f.Version ?? "")
    )
      continue;
    out.push({
      version: f.Version,
      description: f.Description ? f.Description.slice(0, 500) : null,
      size_bytes: f.Size ? Number(f.Size) || null : null,
    });
  }
  return out;
}

if (import.meta.main)
  Deno.serve(async (req) => {
    if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET)
      return new Response("Unauthorized", { status: 401 });
    const json = (o: unknown, status = 200) =>
      new Response(JSON.stringify(o), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    try {
      const r = await fetch(
        `${REPO}/dists/bookworm/main/binary-arm64/Packages`,
        {
          signal: AbortSignal.timeout(20000),
        },
      );
      if (!r.ok)
        return json({ ok: false, error: `dépôt HTTP ${r.status}` }, 502);
      const releases = parsePackages(await r.text());
      if (!releases.length)
        return json({ ok: false, error: "aucune version lue" }, 502);
      const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
        auth: { persistSession: false },
      });
      // first_seen_at n'est posé qu'à la première vue (pas dans la liste des colonnes mises à jour)
      const { error } = await admin
        .from("firmware_releases")
        .upsert(releases, { onConflict: "version" });
      if (error) return json({ ok: false, error: error.message }, 500);
      return json({ ok: true, versions: releases.map((x) => x.version) });
    } catch (e) {
      return json(
        { ok: false, error: e instanceof Error ? e.message : String(e) },
        500,
      );
    }
  });

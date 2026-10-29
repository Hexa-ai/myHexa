// Edge Function: cron-connectivity-alerts
// Alertes de perte / retour de liaison des box (seul cas que la box ne peut pas signaler elle-même).
// Réglages par entreprise (companies.connectivity_alerts_enabled / connectivity_delay_minutes),
// destinataires choisis box par box (connectivity_subscriptions), mode maintenance par box
// (devices.alerts_paused_until). Un seul mail par personne et par passage, qui regroupe toutes
// les box concernées. Sans configuration Gmail (projet de test) : aucun envoi, réponse « dry_run ».
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendMail, closeMailer, mailerConfigured } from "../_shared/mailer.ts";
import {
  buildEmail,
  computeTransitions,
  type CompanyCfg,
  type Transition,
} from "./logic.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const APP_URL = Deno.env.get("APP_URL") ?? "https://my.hexa-ai.fr";
// Garde-fou optionnel : n'écrire qu'aux adresses de ce domaine (ex. hexa-ai.fr pendant les essais)
const ALLOW_DOMAIN = (Deno.env.get("ALERT_MAIL_ALLOW_DOMAIN") ?? "")
  .trim()
  .toLowerCase();

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

interface Recipient {
  id: string;
  contact_email: string;
  name: string | null;
  portal_access: boolean;
  auth_user_id: string | null;
}

async function makeMagicLink(
  email: string,
  redirectTo: string,
): Promise<string | null> {
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo },
  });
  if (error) {
    console.error("[connectivity-alerts] generateLink failed", error.message);
    return null;
  }
  return data?.properties?.action_link ?? null;
}

Deno.serve(async (req) => {
  const provided = req.headers.get("x-cron-secret") ?? "";
  if (!CRON_SECRET || provided !== CRON_SECRET)
    return new Response("Unauthorized", { status: 401 });
  const startedAt = Date.now();
  const json = (o: unknown, status = 200) =>
    new Response(JSON.stringify(o), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  const [
    { data: comps, error: cErr },
    { data: devs, error: dErr },
    { data: alerts, error: aErr },
  ] = await Promise.all([
    admin
      .from("companies")
      .select("id, connectivity_alerts_enabled, connectivity_delay_minutes"),
    admin.from("devices").select("id, company_id, name, alerts_paused_until"),
    admin
      .from("connectivity_alerts")
      .select("device_id, state, last_notified_at"),
  ]);
  const err = cErr ?? dErr ?? aErr;
  if (err) {
    console.error("[connectivity-alerts] load failed", err.message);
    return json({ ok: false, error: err.message }, 500);
  }
  const companies = new Map<string, CompanyCfg>();
  for (const c of comps ?? [])
    companies.set(c.id, {
      enabled: !!c.connectivity_alerts_enabled,
      delayMin: Number(c.connectivity_delay_minutes) || 60,
    });
  const devices = (devs ?? [])
    .filter((d) => d.company_id)
    .map((d) => ({
      id: d.id as string,
      company_id: d.company_id as string,
      name: d.name as string | null,
      paused_until: d.alerts_paused_until as string | null,
    }));
  const notified = new Map<
    string,
    { state: "lost" | "recovered"; at: string | null }
  >();
  for (const a of alerts ?? [])
    notified.set(a.device_id, { state: a.state, at: a.last_notified_at });

  // Dernier status de chaque box surveillée : une requête par box (limit 1)
  const lastSeen = new Map<string, string>();
  const watched = devices.filter((d) => companies.get(d.company_id)?.enabled);
  for (let i = 0; i < watched.length; i += 20) {
    await Promise.all(
      watched.slice(i, i + 20).map(async (d) => {
        const { data } = await admin
          .from("reports")
          .select("received_at")
          .eq("type", "status")
          .eq("device_id", d.id)
          .order("received_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data?.received_at) lastSeen.set(d.id, data.received_at);
      }),
    );
  }

  const transitions = computeTransitions(
    devices,
    lastSeen,
    notified,
    companies,
    Date.now(),
  );
  if (!transitions.length)
    return json({
      ok: true,
      transitions: 0,
      duration_ms: Date.now() - startedAt,
    });

  const { data: subs, error: sErr } = await admin
    .from("connectivity_subscriptions")
    .select(
      "device_id, recipients(id, contact_email, name, portal_access, auth_user_id)",
    )
    .in(
      "device_id",
      transitions.map((t) => t.device_id),
    );
  if (sErr) {
    console.error("[connectivity-alerts] subscriptions failed", sErr.message);
    return json({ ok: false, error: sErr.message }, 500);
  }
  const byRecipient = new Map<string, { r: Recipient; ts: Transition[] }>();
  for (const s of subs ?? []) {
    // deno-lint-ignore no-explicit-any
    const r = (s as any).recipients as Recipient | null;
    if (!r?.contact_email) continue;
    const t = transitions.find((x) => x.device_id === s.device_id);
    if (!t) continue;
    const e = byRecipient.get(r.id) ?? { r, ts: [] };
    e.ts.push(t);
    byRecipient.set(r.id, e);
  }

  const dryRun = !mailerConfigured();
  let mailsSent = 0,
    mailsFailed = 0,
    mailsSkipped = 0;
  const planned: {
    recipient_id: string;
    devices: string[];
    subject: string;
  }[] = [];
  for (const { r, ts } of byRecipient.values()) {
    if (
      ALLOW_DOMAIN &&
      !r.contact_email.toLowerCase().endsWith("@" + ALLOW_DOMAIN)
    ) {
      mailsSkipped++;
      continue;
    }
    let link: string | null = null;
    if (r.portal_access) {
      const path =
        ts.length === 1
          ? `/admin/devices/${ts[0].device_id}`
          : "/admin/devices";
      link = `${APP_URL}${path}`;
      if (r.auth_user_id && !dryRun)
        link =
          (await makeMagicLink(
            r.contact_email,
            `${APP_URL}/auth/callback?next=${encodeURIComponent(path)}`,
          )) ?? link;
    }
    const { subject, html } = buildEmail(ts, r, link);
    planned.push({
      recipient_id: r.id,
      devices: ts.map((t) => t.device_id),
      subject,
    });
    if (dryRun) continue;
    try {
      await sendMail({ to: r.contact_email, subject, html });
      mailsSent++;
    } catch (e) {
      mailsFailed++;
      console.error(
        "[connectivity-alerts] sendMail failed",
        e instanceof Error ? e.message : String(e),
      );
    }
  }
  // État mémorisé même sans destinataire : la même transition n'est jamais renvoyée
  const { error: upErr } = await admin.from("connectivity_alerts").upsert(
    transitions.map((t) => ({
      device_id: t.device_id,
      state: t.transition,
      last_notified_at: new Date().toISOString(),
    })),
  );
  if (upErr)
    console.error("[connectivity-alerts] upsert state failed", upErr.message);
  await closeMailer();
  return json({
    ok: true,
    dry_run: dryRun,
    transitions: transitions.length,
    mails_planned: planned.length,
    mails_sent: mailsSent,
    mails_failed: mailsFailed,
    mails_skipped_domain: mailsSkipped,
    planned: dryRun ? planned : undefined,
    duration_ms: Date.now() - startedAt,
  });
});

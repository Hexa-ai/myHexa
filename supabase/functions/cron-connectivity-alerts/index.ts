// Edge Function: cron-connectivity-alerts (modèle unifié)
// Triggered every 15min by pg_cron via net.http_post. CRON_SECRET header.
// Plus de tokens : on génère un magic link Supabase Auth par recipient.
//
// Flow :
//   1. Lire les states devices + dernier received_at
//   2. Compute transitions lost↔recovered (seuil 1h)
//   3. Pour chaque transition : trouver les recipients qui ont accès au
//      device (compagnie native OU shared_devices), générer un magic link,
//      envoyer mail, upsert connectivity_alerts.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendMail, closeMailer } from '../_shared/mailer.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? ''
const APP_URL = Deno.env.get('APP_URL') ?? 'https://my.hexa-ai.fr'
const LOST_THRESHOLD_MS = 60 * 60 * 1000

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

interface DeviceState { id: string; company_id: string; name: string | null; last_seen_at: string | null; last_notified_state: 'lost' | 'recovered' | null }
interface Transition { device_id: string; hostname: string; company_id: string; last_seen_at: string; transition: 'lost' | 'recovered'; offline_minutes: number }
interface Recipient { id: string; contact_email: string; name: string | null; company_id: string | null; restrict_to_devices: string[] | null; shared_devices: string[] | null; auth_user_id: string }

function escapeHtml(s: string): string { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!)) }
function formatDateTime(iso: string): string { const d = new Date(iso); if (Number.isNaN(d.getTime())) return '—'; return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }) }
function formatDuration(minutes: number): string { if (minutes < 60) return `${minutes} min`; const h = Math.floor(minutes / 60); const m = minutes % 60; if (h < 24) return m ? `${h}h ${m}min` : `${h}h`; const d = Math.floor(h / 24); const rh = h % 24; return rh ? `${d}j ${rh}h` : `${d}j` }

async function makeMagicLink(email: string, redirectTo: string): Promise<string | null> {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo } })
  if (error) { console.error('[connectivity-alerts] generateLink failed for', email, error.message); return null }
  return data?.properties?.action_link ?? null
}

function buildEmail(t: Transition, recipient: Recipient, viewUrl: string) {
  const isLost = t.transition === 'lost'
  const subjectIcon = isLost ? '🔴' : '🟢'
  const subjectText = isLost ? 'Équipement perdu' : 'Équipement reconnecté'
  const subject = `${subjectIcon} ${subjectText} : ${t.hostname}`
  const heading = isLost
    ? `Connexion perdue avec <strong>${escapeHtml(t.hostname)}</strong>`
    : `Connexion rétablie avec <strong>${escapeHtml(t.hostname)}</strong>`
  const detail = isLost
    ? `Aucune donnée reçue depuis le ${escapeHtml(formatDateTime(t.last_seen_at))} (soit ${escapeHtml(formatDuration(t.offline_minutes))}).`
    : `L'équipement a recommencé à émettre des données (interruption d'environ ${escapeHtml(formatDuration(t.offline_minutes))}).`
  const banner = isLost
    ? `<div style="background:#fef2f2;border:1px solid #fecaca;color:#991b1b;padding:14px 18px;border-radius:8px;margin-bottom:20px;font-size:14px;">⚠ ${detail}</div>`
    : `<div style="background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;padding:14px 18px;border-radius:8px;margin-bottom:20px;font-size:14px;">✓ ${detail}</div>`
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>${escapeHtml(subjectText)}</title></head><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#111;background:#fafafa;margin:0;padding:20px 24px;"><div style="max-width:600px;margin:0 auto;"><h1 style="margin:0 0 16px 0;font-size:22px;color:#111;letter-spacing:-0.5px;">${heading}</h1><p style="margin:0 0 8px 0;color:#6b7280;font-size:14px;">Bonjour ${escapeHtml(recipient.name ?? '')},</p>${banner}<p style="margin:0 0 20px 0;"><a href="${viewUrl}" style="display:inline-block;background:#00d4aa;color:#0a0f14;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;">Voir l'équipement →</a></p></div></body></html>`
  return { subject, html }
}

Deno.serve(async (req) => {
  const provided = req.headers.get('x-cron-secret') ?? ''
  if (!CRON_SECRET || provided !== CRON_SECRET) return new Response('Unauthorized', { status: 401 })
  const startedAt = Date.now()

  const { data: devs, error: devErr } = await admin.from('devices').select('id, company_id, name, connectivity_alerts(state)')
  if (devErr) { console.error('[connectivity-alerts] load failed', devErr); return new Response(JSON.stringify({ ok: false, error: devErr.message }), { status: 500 }) }
  const ids = (devs ?? []).map((d) => d.id)
  const { data: reps } = await admin.from('reports').select('device_id, received_at').eq('type', 'status').in('device_id', ids).order('received_at', { ascending: false })
  const lastSeenById = new Map<string, string>()
  for (const r of reps ?? []) { if (!lastSeenById.has(r.device_id)) lastSeenById.set(r.device_id, r.received_at as string) }
  const deviceStates: DeviceState[] = (devs ?? []).map((d: any) => ({
    id: d.id,
    company_id: d.company_id,
    name: d.name,
    last_seen_at: lastSeenById.get(d.id) ?? null,
    last_notified_state: (d.connectivity_alerts?.[0]?.state ?? null) as 'lost' | 'recovered' | null,
  }))

  const now = Date.now()
  const transitions: Transition[] = []
  for (const d of deviceStates) {
    if (!d.last_seen_at) continue
    const lastSeenMs = new Date(d.last_seen_at).getTime()
    const isLost = now - lastSeenMs > LOST_THRESHOLD_MS
    const lastState = d.last_notified_state
    let next: 'lost' | 'recovered' | null = null
    if (isLost && lastState !== 'lost') next = 'lost'
    else if (!isLost && lastState === 'lost') next = 'recovered'
    if (next) transitions.push({
      device_id: d.id,
      hostname: d.name ?? d.id,
      company_id: d.company_id,
      last_seen_at: d.last_seen_at,
      transition: next,
      offline_minutes: Math.floor((now - lastSeenMs) / 60000),
    })
  }

  if (transitions.length === 0) {
    return new Response(JSON.stringify({ ok: true, transitions: 0, duration_ms: Date.now() - startedAt }), { headers: { 'Content-Type': 'application/json' } })
  }

  let mailsSent = 0
  let mailsFailed = 0
  for (const t of transitions) {
    // Tous les recipients dont l'accès couvre ce device :
    //   (company_id = t.company_id ET (restrict_to_devices NULL OR includes t.device_id))
    //   OR t.device_id ∈ shared_devices
    const { data: recipients, error: recErr } = await admin
      .from('recipients')
      .select('id, contact_email, name, company_id, restrict_to_devices, shared_devices, auth_user_id')
      .not('contact_email', 'is', null)
    if (recErr) {
      console.error('[connectivity-alerts] recipients fetch failed', recErr)
      continue
    }
    const targets: Recipient[] = (recipients ?? [])
      .filter((r: any): r is Recipient => !!r.contact_email && !!r.auth_user_id)
      .filter((r) => {
        const inCompany =
          r.company_id === t.company_id &&
          (r.restrict_to_devices === null || r.restrict_to_devices.includes(t.device_id))
        const shared = (r.shared_devices ?? []).includes(t.device_id)
        return inCompany || shared
      })

    for (const r of targets) {
      const targetPath = `/admin/devices/${t.device_id}`
      const link = await makeMagicLink(r.contact_email, `${APP_URL}/auth/callback?next=${encodeURIComponent(targetPath)}`)
      const viewUrl = link ?? `${APP_URL}${targetPath}`
      const { subject, html } = buildEmail(t, r, viewUrl)
      try {
        await sendMail({ to: r.contact_email, subject, html })
        mailsSent++
        console.log('[connectivity-alerts] sent', t.transition, 'to', r.contact_email)
      } catch (e) {
        mailsFailed++
        console.error('[connectivity-alerts] sendMail failed for', r.contact_email, e instanceof Error ? e.message : String(e))
      }
    }

    const { error: upErr } = await admin
      .from('connectivity_alerts')
      .upsert({
        device_id: t.device_id,
        state: t.transition,
        last_notified_at: new Date().toISOString(),
      })
    if (upErr) console.error('[connectivity-alerts] upsert state failed', upErr)
  }

  await closeMailer()
  return new Response(JSON.stringify({
    ok: true,
    transitions: transitions.length,
    mails_sent: mailsSent,
    mails_failed: mailsFailed,
    duration_ms: Date.now() - startedAt,
  }), { headers: { 'Content-Type': 'application/json' } })
})

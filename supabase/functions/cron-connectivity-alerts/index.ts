// Edge Function: cron-connectivity-alerts
//
// Replaces the n8n workflow "Connectivity Alerts" (B9C7aWfXjagRyyMP).
// Triggered every 15 minutes by pg_cron via net.http_post.
//
// Flow:
//   1. Load each device's last status received_at and last notified state.
//   2. Compute transitions lost↔recovered using a 1h threshold.
//   3. For each transition: fanout to company recipients (respecting
//      allowed_device_ids), generate a 24h report token, store it, send a
//      lost/recovered email via Gmail SMTP, upsert connectivity_alerts.
//
// Auth: verify_jwt is disabled because pg_cron can't easily attach a JWT.
// We protect the endpoint with a shared CRON_SECRET header instead.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendMail, closeMailer } from '../_shared/mailer.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? ''
const APP_URL = Deno.env.get('APP_URL') ?? 'https://my.hexa-ai.fr'
const LOST_THRESHOLD_MS = 60 * 60 * 1000 // 1h
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000 // 24h

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
})

interface DeviceState {
  id: string
  company_id: string
  name: string | null
  last_seen_at: string | null
  last_notified_state: 'lost' | 'recovered' | null
}

interface Transition {
  device_id: string
  hostname: string
  company_id: string
  last_seen_at: string
  transition: 'lost' | 'recovered'
  offline_minutes: number
}

interface Recipient {
  id: string
  contact_email: string
  name: string | null
  allowed_device_ids: string[] | null
}

function escapeHtml(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!
  ))
}
function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris',
  })
}
function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h < 24) return m ? `${h}h ${m}min` : `${h}h`
  const d = Math.floor(h / 24)
  const rh = h % 24
  return rh ? `${d}j ${rh}h` : `${d}j`
}
function genToken(): string {
  const a = new Uint8Array(16)
  crypto.getRandomValues(a)
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('')
}

function buildEmail(t: Transition, recipient: Recipient, token: string, expiresAt: string) {
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
  const viewUrl = `${APP_URL}/report?t=${encodeURIComponent(token)}&d=${encodeURIComponent(t.device_id)}`
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>${escapeHtml(subjectText)}</title></head><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#111;background:#fafafa;margin:0;padding:20px 24px;"><div style="max-width:600px;margin:0 auto;"><h1 style="margin:0 0 16px 0;font-size:22px;color:#111;letter-spacing:-0.5px;">${heading}</h1><p style="margin:0 0 8px 0;color:#6b7280;font-size:14px;">Bonjour ${escapeHtml(recipient.name ?? '')},</p>${banner}<p style="margin:0 0 20px 0;"><a href="${viewUrl}" style="display:inline-block;background:#00d4aa;color:#0a0f14;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;">Voir l'équipement →</a></p><p style="margin:24px 0 0 0;color:#9ca3af;font-size:12px;text-align:center;">Lien valide jusqu'au ${escapeHtml(formatDateTime(expiresAt))}</p></div></body></html>`
  return { subject, html }
}

Deno.serve(async (req) => {
  // Shared-secret auth (since verify_jwt is disabled for cron)
  const provided = req.headers.get('x-cron-secret') ?? ''
  if (!CRON_SECRET || provided !== CRON_SECRET) {
    return new Response('Unauthorized', { status: 401 })
  }

  const startedAt = Date.now()

  // 1. Load device states (last status received_at + last notified state)
  const { data: devicesRaw, error: devErr } = await admin.rpc('connectivity_states')
  let deviceStates: DeviceState[]
  if (devErr) {
    // Fallback: do it inline if the RPC doesn't exist (first deploy)
    const { data, error } = await admin
      .from('devices')
      .select(`
        id, company_id, name,
        connectivity_alerts(state)
      `)
    if (error) {
      console.error('[connectivity-alerts] load failed', error)
      return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 })
    }
    // Need last_seen_at per device from reports.received_at — fetch in batch
    const ids = (data ?? []).map((d) => d.id)
    const { data: reps } = await admin
      .from('reports')
      .select('device_id, received_at')
      .eq('type', 'status')
      .in('device_id', ids)
      .order('received_at', { ascending: false })
    const lastSeenById = new Map<string, string>()
    for (const r of reps ?? []) {
      if (!lastSeenById.has(r.device_id)) lastSeenById.set(r.device_id, r.received_at as string)
    }
    deviceStates = (data ?? []).map((d) => ({
      id: d.id,
      company_id: d.company_id,
      name: d.name,
      last_seen_at: lastSeenById.get(d.id) ?? null,
      last_notified_state: (d.connectivity_alerts?.[0]?.state ?? null) as 'lost' | 'recovered' | null,
    }))
  } else {
    deviceStates = (devicesRaw as DeviceState[]) ?? []
  }

  // 2. Compute transitions
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
    if (next) {
      transitions.push({
        device_id: d.id,
        hostname: d.name ?? d.id,
        company_id: d.company_id,
        last_seen_at: d.last_seen_at,
        transition: next,
        offline_minutes: Math.floor((now - lastSeenMs) / 60000),
      })
    }
  }

  if (transitions.length === 0) {
    return new Response(JSON.stringify({
      ok: true,
      transitions: 0,
      duration_ms: Date.now() - startedAt,
    }), { headers: { 'Content-Type': 'application/json' } })
  }

  // 3. For each transition, fanout recipients + send mail + upsert state
  let mailsSent = 0
  let mailsFailed = 0
  for (const t of transitions) {
    const { data: recipients, error: recErr } = await admin
      .from('recipients')
      .select('id, contact_email, name, allowed_device_ids')
      .eq('company_id', t.company_id)
      .not('contact_email', 'is', null)
    if (recErr) {
      console.error('[connectivity-alerts] recipients fetch failed', recErr)
      continue
    }
    const targets: Recipient[] = (recipients ?? [])
      .filter((r) => !r.allowed_device_ids || r.allowed_device_ids.includes(t.device_id))
      .filter((r): r is Recipient => !!r.contact_email)

    for (const r of targets) {
      const token = genToken()
      const expiresAt = new Date(now + TOKEN_TTL_MS).toISOString()
      const { error: insErr } = await admin
        .from('report_tokens')
        .insert({
          token,
          recipient_id: r.id,
          device_ids: t.device_id,
          expires_at: expiresAt,
        })
      if (insErr) {
        console.error('[connectivity-alerts] token insert failed', insErr)
        continue
      }
      const { subject, html } = buildEmail(t, r, token, expiresAt)
      try {
        await sendMail({ to: r.contact_email, subject, html })
        mailsSent++
      } catch (e) {
        mailsFailed++
        console.error('[connectivity-alerts] sendMail failed', e)
      }
    }

    // Upsert the new state (only once per transition, after fanout)
    const { error: upErr } = await admin
      .from('connectivity_alerts')
      .upsert({
        device_id: t.device_id,
        state: t.transition,
        last_notified_at: new Date().toISOString(),
      })
    if (upErr) {
      console.error('[connectivity-alerts] upsert state failed', upErr)
    }
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

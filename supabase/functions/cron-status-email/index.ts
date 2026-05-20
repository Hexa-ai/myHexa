// Edge Function: cron-status-email
//
// Replaces the n8n workflow "Daily Status Email" (lNN8H7GWvv4dYcqc).
// Triggered every day at 7h Europe/Paris by pg_cron. Decides per company:
//   - frequency = 'none'    → skip
//   - frequency = 'daily'   → always include
//   - frequency = 'weekly'  → include only on Tuesday (Europe/Paris)
//
// For each included recipient:
//   1. Cleanup expired tokens.
//   2. Get devices + latest status for that recipient (respecting
//      allowed_device_ids).
//   3. Generate 8-day token, store it.
//   4. Build AI prompt, call Gemini 2.5 Flash REST, parse JSON
//      { brief, watchlist }.
//   5. Build email HTML and send via Gmail SMTP.
//
// Auth: shared CRON_SECRET in x-cron-secret header.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendMail, closeMailer } from '../_shared/mailer.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? ''
const APP_URL = Deno.env.get('APP_URL') ?? 'https://my.hexa-ai.fr'
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? ''
const GEMINI_MODEL = 'gemini-2.5-flash'
const TOKEN_TTL_MS = 8 * 24 * 60 * 60 * 1000 // 8 days

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

interface InvokeBody {
  company_id?: string
}

// CORS for browser-initiated manual sends
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

interface Recipient {
  id: string
  company_id: string
  name: string | null
  contact_email: string
  role: string | null
  allowed_device_ids: string[] | null
  auth_user_id: string | null
}

interface DeviceWithStatus {
  id: string
  name: string | null
  address: string | null
  status: unknown
  status_received_at: string | null
}

interface AiOutput {
  brief: string
  watchlist: string[]
}

function escapeHtml(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!
  ))
}
function genToken(): string {
  const a = new Uint8Array(16)
  crypto.getRandomValues(a)
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('')
}

function getConnectivity(d: DeviceWithStatus): 'online' | 'offline' {
  const ts = d.status_received_at
  if (!ts) return 'offline'
  const mins = (Date.now() - new Date(ts).getTime()) / 60000
  return mins >= 30 ? 'offline' : 'online'
}
function alarmCount(status: unknown): number {
  const vars = (status as { variables?: { category?: string; value: unknown }[] })?.variables
  if (!Array.isArray(vars)) return 0
  return vars.filter((v) => v?.category === 'alarm' && v?.value !== 0 && v?.value !== null && v?.value !== false).length
}
function summarizeForPrompt(d: DeviceWithStatus): string {
  const s = (d.status ?? {}) as {
    device?: { hostname?: string }
    variables?: { category?: string; value: unknown; name?: string }[]
    network?: Record<string, { connected?: boolean }>
  }
  const lastSeen = d.status_received_at
  const minsAgo = lastSeen ? Math.floor((Date.now() - new Date(lastSeen).getTime()) / 60000) : null
  const isOnline = minsAgo !== null && minsAgo < 30
  const alarms = (s.variables ?? []).filter((v) => v?.category === 'alarm' && v?.value !== 0 && v?.value !== null && v?.value !== false)
  const networks: string[] = []
  const n = s.network ?? {}
  if (n.eth0?.connected || n.eth1?.connected) networks.push('Ethernet')
  if (n.wlan0?.connected) networks.push('Wi-Fi')
  if (n.wwan0?.connected) networks.push('4G')
  if (n.tailscale?.connected) networks.push('Tailscale')
  const hostname = s.device?.hostname || d.name || '?'
  const lastSeenStr = minsAgo === null
    ? 'jamais'
    : minsAgo < 60 ? `${minsAgo} min`
    : minsAgo < 1440 ? `${Math.floor(minsAgo / 60)}h`
    : `${Math.floor(minsAgo / 1440)}j`
  return `- ${hostname} : ${isOnline ? 'En ligne' : 'Inactif'}, dernier status il y a ${lastSeenStr}, réseau ${networks.join('+') || 'aucun'}, ${alarms.length} alarme(s) active(s)${alarms.length > 0 ? ' [' + alarms.map((a) => a.name).join(', ') + ']' : ''}`
}

function buildPrompt(devices: DeviceWithStatus[]): string {
  const lines = devices.map(summarizeForPrompt).join('\n')
  const dateStr = new Date().toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' })
  return `Tu rédiges la synthèse hebdomadaire d'un responsable d'exploitation supervisant des équipements industriels. Il doit pouvoir la lire en moins de 30 secondes.

Voici l'état des ${devices.length} équipement(s) au ${dateStr} :

${lines}

Produit un objet JSON STRICT :
{
  "brief": "<1 à 2 phrases courtes en français qui résument l'état général. Max 30 mots au total. Ton concret et naturel, comme un échange entre collègues.>",
  "watchlist": ["<point 1 court et actionnable>", "<point 2>", ...]
}

Règles :
- 'brief' : 1 à 2 phrases courtes, max 30 mots. Si tout va bien, dis-le simplement (ex. 'Tout est nominal ce matin, rien à signaler.'). Si problème, va droit au but en mentionnant les équipements concernés.
- 'watchlist' : 0 à 4 items, chacun max 15 mots. Format actionnable, mentionne le nom précis de l'équipement. Tableau vide [] si rien à surveiller.
- Pas de markdown, pas de backticks, pas d'introduction. JSON pur uniquement.`
}

async function callGemini(prompt: string): Promise<AiOutput> {
  if (!GEMINI_API_KEY) return { brief: '', watchlist: [] }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 1500 },
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    console.error('[status-email] gemini http', res.status, await res.text())
    return { brief: '', watchlist: [] }
  }
  const json = await res.json() as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
  }
  const raw = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? ''
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  if (!cleaned) return { brief: '', watchlist: [] }
  try {
    const parsed = JSON.parse(cleaned) as { brief?: string; watchlist?: string[] }
    return {
      brief: (parsed.brief ?? '').trim(),
      watchlist: Array.isArray(parsed.watchlist)
        ? parsed.watchlist.filter((s) => typeof s === 'string' && s).slice(0, 4)
        : [],
    }
  } catch (e) {
    console.error('[status-email] gemini parse', e, cleaned.slice(0, 200))
    return { brief: '', watchlist: [] }
  }
}

function linkifyDevices(text: string, devices: DeviceWithStatus[], token: string): string {
  if (!text) return ''
  let result = escapeHtml(text)
  const sorted = devices.slice().sort((a, b) => {
    const ah = ((a.status as { device?: { hostname?: string } })?.device?.hostname ?? a.name ?? '').length
    const bh = ((b.status as { device?: { hostname?: string } })?.device?.hostname ?? b.name ?? '').length
    return bh - ah
  })
  const seen = new Set<string>()
  for (const dev of sorted) {
    const hostname = (dev.status as { device?: { hostname?: string } })?.device?.hostname || dev.name
    if (!hostname || !dev.id) continue
    const key = hostname.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const escName = escapeHtml(hostname).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp('(?<![a-zA-Z0-9_-])' + escName + '(?![a-zA-Z0-9_-])', 'gi')
    const url = `${APP_URL}/report?t=${encodeURIComponent(token)}&d=${encodeURIComponent(dev.id)}`
    result = result.replace(re, (match) => `<a href="${url}" style="color:#0a8068;text-decoration:none;font-weight:600;border-bottom:1px solid #0a8068;">${match}</a>`)
  }
  return result
}

function buildEmail(opts: {
  recipient: Recipient
  devices: DeviceWithStatus[]
  ai: AiOutput
  token: string
  expiresAt: string
}): { subject: string; html: string } {
  const { recipient, devices, ai, token, expiresAt } = opts
  const isAdmin = recipient.role === 'admin'
  const firstName = (recipient.name ?? '').split(' ')[0] ?? ''
  const enriched = devices.map((d) => ({ code: getConnectivity(d), hasAlarm: alarmCount(d.status) > 0 }))
  const nTotal = enriched.length
  const nOnline = enriched.filter((x) => x.code === 'online').length
  const nOffline = enriched.filter((x) => x.code === 'offline').length
  const nAlarm = enriched.filter((x) => x.hasAlarm).length

  const briefHtml = ai.brief ? `<p style="margin:0 0 24px 0;font-size:15.5px;line-height:1.7;color:#1f2937;">${linkifyDevices(ai.brief, devices, token)}</p>` : ''
  const watchlistHtml = ai.watchlist.length
    ? `<p style="margin:0 0 10px 0;font-size:14px;color:#111827;font-weight:600;">⚠️ À surveiller</p>
<ul style="margin:0 0 24px 0;padding:0;list-style:none;">
  ${ai.watchlist.map((item) => `<li style="margin:0 0 7px 0;padding:0 0 0 20px;position:relative;color:#1f2937;font-size:14.5px;line-height:1.65;"><span style="position:absolute;left:2px;top:0;color:#0a8068;font-weight:700;">→</span>${linkifyDevices(item, devices, token)}</li>`).join('')}
</ul>`
    : ''

  const statsBits = [
    `<strong>${nTotal}</strong> équipement${nTotal > 1 ? 's' : ''}`,
    `<span style="color:#16a34a;">●</span> <strong>${nOnline}</strong> en ligne`,
    `<span style="color:#9ca3af;">●</span> <strong>${nOffline}</strong> inactif${nOffline > 1 ? 's' : ''}`,
  ]
  if (nAlarm) statsBits.push(`<span style="color:#dc2626;">●</span> <strong>${nAlarm}</strong> alarme${nAlarm > 1 ? 's' : ''}`)
  const statsLine = `<p style="margin:0 0 22px 0;font-size:14px;color:#374151;line-height:1.6;">📊 ${statsBits.join(' &nbsp;·&nbsp; ')}</p>`

  // Liste de tous les équipements accessibles au destinataire — pour qu'un
  // externe (sans compte) puisse naviguer sur n'importe lequel directement
  // depuis le mail (le CTA principal ne pointe que sur un seul).
  const devicesListHtml = (() => {
    if (!devices.length) return ''
    const hasAccount = !!recipient.auth_user_id
    const rows = devices.map((d) => {
      const online = getConnectivity(d) === 'online'
      const alarms = alarmCount(d.status)
      const dotColor = online ? (alarms > 0 ? '#f59e0b' : '#16a34a') : '#9ca3af'
      const label = online ? (alarms > 0 ? `${alarms} alarme${alarms > 1 ? 's' : ''}` : 'En ligne') : 'Inactif'
      const labelColor = online ? (alarms > 0 ? '#92400e' : '#15803d') : '#6b7280'
      const url = hasAccount
        ? `${APP_URL}/admin/devices/${encodeURIComponent(d.id)}`
        : `${APP_URL}/report?t=${encodeURIComponent(token)}&d=${encodeURIComponent(d.id)}`
      const name = escapeHtml(d.name ?? d.id.slice(0, 8))
      return `<tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;"><a href="${url}" style="display:flex;align-items:center;justify-content:space-between;text-decoration:none;color:inherit;"><span style="display:inline-flex;align-items:center;gap:8px;font-size:14px;color:#111827;font-weight:500;"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${dotColor};"></span>${name}</span><span style="font-size:12px;color:${labelColor};font-weight:500;">${label} →</span></a></td></tr>`
    }).join('')
    return `<div style="margin:0 0 22px 0;"><p style="margin:0 0 8px 0;font-size:13px;font-weight:600;color:#111827;text-transform:uppercase;letter-spacing:0.04em;">Équipements</p><table style="width:100%;border-collapse:collapse;">${rows}</table></div>`
  })()

  // Pick one device for the dashboard CTA (first online, else first)
  // Recipients with an account land on their authenticated dashboard (their
  // session takes over). Token-only recipients (no auth_user_id) get the
  // single-device token-protected view as a fallback.
  const firstDev = devices.find((d) => getConnectivity(d) === 'online') ?? devices[0]
  const hasAccount = !!recipient.auth_user_id
  const dashUrl = hasAccount
    ? `${APP_URL}/admin/devices`
    : firstDev
      ? `${APP_URL}/report?t=${encodeURIComponent(token)}&d=${encodeURIComponent(firstDev.id)}`
      : `${APP_URL}/`
  const manageUrl = `${APP_URL}/admin/recipients`
  const ctaLine = `<p style="margin:0 0 24px 0;font-size:14.5px;color:#1f2937;line-height:1.7;">→ <a href="${dashUrl}" style="color:#0a8068;text-decoration:none;font-weight:600;border-bottom:1px solid #0a8068;">Voir le tableau de bord</a>${isAdmin ? `<br>→ <a href="${manageUrl}" style="color:#0a8068;text-decoration:none;font-weight:600;border-bottom:1px solid #0a8068;">Gérer les destinataires</a>` : ''}</p>`

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Rapport status</title></head><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;background:#ffffff;margin:0;padding:32px 16px;">
  <div style="max-width:580px;margin:0;">
    <p style="margin:0 0 18px 0;font-size:18px;color:#111827;font-weight:600;">Bonjour${firstName ? ' ' + escapeHtml(firstName) : ''} 👋</p>
    ${briefHtml}
    ${watchlistHtml}
    ${statsLine}
    ${devicesListHtml}
    ${ctaLine}
    <p style="margin:28px 0 16px 0;font-size:14.5px;color:#1f2937;line-height:1.5;">Bonne journée,</p>
    <div style="border-left:3px solid #00d4aa;padding:2px 0 2px 14px;margin:0 0 14px 0;">
      <p style="margin:0;font-size:14.5px;color:#111827;font-weight:700;letter-spacing:0.2px;">Julien Talbourdet</p>
      <p style="margin:6px 0 0 0;font-size:13px;color:#374151;line-height:1.65;">Fondateur — myHexa<br>📱 06 66 74 04 58<br>✉️ <a href="mailto:julien.talbourdet@hexa-ai.fr" style="color:#0a8068;text-decoration:none;">julien.talbourdet@hexa-ai.fr</a></p>
      <p style="margin:10px 0 0 0;font-size:12.5px;color:#6b7280;font-style:italic;line-height:1.5;">Connecter & exploiter tout le potentiel de vos installations<br><a href="https://www.hexa-ai.fr" style="color:#0a8068;text-decoration:none;font-weight:600;font-style:normal;">www.hexa-ai.fr</a></p>
    </div>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 12px 0;">
    <p style="margin:0;color:#9ca3af;font-size:11px;line-height:1.6;">Lien valide jusqu'au ${escapeHtml(new Date(expiresAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }))}${ai.brief ? ' · Brief rédigé par IA' : ''}</p>
  </div>
</body></html>`
  const subject = `Rapport status · ${nTotal} équipement${nTotal > 1 ? 's' : ''}${nAlarm ? ' · ' + nAlarm + ' alarme' + (nAlarm > 1 ? 's' : '') : ''}`
  return { subject, html }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  // Two auth paths :
  //   (a) cron call (pg_cron) → x-cron-secret header
  //   (b) manual call from the app (staff admin) → valid JWT + RPC check
  const cronProvided = req.headers.get('x-cron-secret') ?? ''
  const isCron = CRON_SECRET && cronProvided === CRON_SECRET

  let manualCompanyId: string | undefined
  if (!isCron) {
    const authHeader = req.headers.get('Authorization') ?? ''
    const jwt = authHeader.replace(/^Bearer\s+/i, '')
    if (!jwt) {
      return new Response(JSON.stringify({ ok: false, error: 'UNAUTHORIZED' }), { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
    }
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false },
    })
    const { data: userData, error: userErr } = await userClient.auth.getUser()
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ ok: false, error: 'INVALID_JWT' }), { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
    }
    const { data: staffOk } = await userClient.rpc('is_hexa_staff_admin')
    if (staffOk !== true) {
      return new Response(JSON.stringify({ ok: false, error: 'FORBIDDEN' }), { status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
    }
    const body = (await req.json().catch(() => ({}))) as InvokeBody
    manualCompanyId = body.company_id
    if (!manualCompanyId) {
      return new Response(JSON.stringify({ ok: false, error: 'company_id required' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
    }
  }

  const startedAt = Date.now()
  const parisNow = new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris', weekday: 'long' })
  const isTuesday = parisNow.startsWith('Tuesday')

  // Cleanup expired tokens (idempotent, only on cron runs)
  if (isCron) {
    const { error: clErr } = await admin.from('report_tokens').delete().lt('expires_at', new Date().toISOString())
    if (clErr) console.error('[status-email] cleanup tokens failed', clErr)
  }

  // Determine target companies
  let targetCompanyIds: string[]
  if (manualCompanyId) {
    // Bypass frequency filter for manual sends — just verify the company exists
    const { data: c, error: cErr } = await admin.from('companies').select('id').eq('id', manualCompanyId).maybeSingle()
    if (cErr || !c) {
      return new Response(JSON.stringify({ ok: false, error: 'company not found' }), { status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
    }
    targetCompanyIds = [manualCompanyId]
  } else {
    const { data: companies, error: cErr } = await admin.from('companies').select('id, status_email_frequency')
    if (cErr) {
      console.error('[status-email] companies load failed', cErr)
      return new Response(JSON.stringify({ ok: false, error: cErr.message }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
    }
    targetCompanyIds = (companies ?? [])
      .filter((c) => c.status_email_frequency === 'daily' || (c.status_email_frequency === 'weekly' && isTuesday))
      .map((c) => c.id)
  }

  if (targetCompanyIds.length === 0) {
    return new Response(JSON.stringify({ ok: true, recipients: 0, mails_sent: 0, duration_ms: Date.now() - startedAt }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
  }

  // 3. Get recipients of these companies
  const { data: recipients, error: rErr } = await admin
    .from('recipients')
    .select('id, company_id, name, contact_email, role, allowed_device_ids, auth_user_id')
    .in('company_id', targetCompanyIds)
    .not('contact_email', 'is', null)
  if (rErr) {
    console.error('[status-email] recipients load failed', rErr)
    return new Response(JSON.stringify({ ok: false, error: rErr.message }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
  }

  // Counters hoisted so cron mode can include them in the response.
  let mailsSent = 0
  let mailsFailed = 0

  // Heavy work (Gemini calls + SMTP sends) — long-running.
  // For manual sends we run it in background via EdgeRuntime.waitUntil so the
  // client gets feedback immediately. For cron we await it (pg_cron is async).
  const heavyWork = (async () => {
    const { data: rpcData, error: rpcErr } = await admin.rpc('devices_with_latest_status')
    if (rpcErr) {
      console.error('[status-email] devices_with_latest_status failed', rpcErr)
      return
    }
    const allDevices = (rpcData ?? []) as Array<{ id: string; company_id: string; name: string | null; address: string | null; status_payload: unknown; status_received_at: string | null }>

    // Compute AI brief ONCE per company (divides Gemini cost+latency by ~N).
    // Brief IA partagé entre recipients qui voient EXACTEMENT le même
    // ensemble de devices (signature = ids triés). Évite qu'un externe
    // restreint voie son brief mentionner des devices qu'il n'a pas le droit
    // de consulter.
    const aiBySignature = new Map<string, AiOutput>()

    for (const r of (recipients ?? []) as Recipient[]) {
      if (!r.contact_email) continue
      const devices: DeviceWithStatus[] = allDevices
        .filter((d) => d.company_id === r.company_id)
        .filter((d) => !r.allowed_device_ids || r.allowed_device_ids.includes(d.id))
        .map((d) => ({ id: d.id, name: d.name, address: d.address, status: d.status_payload, status_received_at: d.status_received_at }))
      if (!devices.length) continue
      const token = genToken()
      const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString()
      const deviceIdsCsv = devices.map((d) => d.id).join(',')
      const { error: tErr } = await admin.from('report_tokens').insert({ token, recipient_id: r.id, device_ids: deviceIdsCsv, expires_at: expiresAt })
      if (tErr) { console.error('[status-email] token insert failed', tErr); continue }
      const signature = devices.map((d) => d.id).slice().sort().join(',')
      let ai = aiBySignature.get(signature)
      if (!ai) {
        ai = await callGemini(buildPrompt(devices))
        aiBySignature.set(signature, ai)
      }
      const { subject, html } = buildEmail({ recipient: r, devices, ai, token, expiresAt })
      try {
        await sendMail({ to: r.contact_email, subject, html })
        mailsSent++
      } catch (e) {
        mailsFailed++
        console.error('[status-email] sendMail failed', e)
      }
    }

    await closeMailer()
    console.log('[status-email] done', { mode: manualCompanyId ? 'manual' : 'cron', mails_sent: mailsSent, mails_failed: mailsFailed, duration_ms: Date.now() - startedAt })
  })()

  // For cron we await (pg_cron polls anyway). For manual we fire-and-forget
  // via EdgeRuntime.waitUntil so the client gets feedback immediately.
  const recipientCount = (recipients ?? []).length
  if (isCron) {
    await heavyWork
    return new Response(JSON.stringify({
      ok: true,
      mode: 'cron',
      target_companies: targetCompanyIds.length,
      recipients: recipientCount,
      mails_sent: mailsSent,
      mails_failed: mailsFailed,
      is_tuesday: isTuesday,
      duration_ms: Date.now() - startedAt,
    }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
  }
  // @ts-expect-error EdgeRuntime is provided by Supabase Edge Runtime
  EdgeRuntime.waitUntil(heavyWork)
  return new Response(JSON.stringify({
    ok: true,
    mode: 'manual',
    target_companies: targetCompanyIds.length,
    recipients: recipientCount,
    queued: true,
    note: "Envoi en cours en arrière-plan ; les mails arrivent dans quelques secondes.",
  }), { status: 202, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
})

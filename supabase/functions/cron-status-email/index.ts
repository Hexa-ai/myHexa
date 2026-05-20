// Edge Function: cron-status-email (modèle unifié + magic link)
// Cron quotidien 7h Paris (pg_cron) OU trigger manuel par staff admin.
//
// Mode cron : x-cron-secret header, parcourt toutes les compagnies dont
//   status_email_frequency='daily' OU ('weekly' ET aujourd'hui=mardi).
// Mode manuel : JWT staff admin + body.company_id, envoi immédiat à la
//   compagnie ciblée, EdgeRuntime.waitUntil pour éviter le timeout 503.
//
// Visibilité devices par recipient (modèle unifié) :
//   (company_id = r.company_id ET (restrict_to_devices NULL OR contient))
//   OR shared_devices contient
//
// Plus de report_tokens.insert : on génère un magic link Supabase Auth.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendMail, closeMailer } from '../_shared/mailer.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? ''
const APP_URL = Deno.env.get('APP_URL') ?? 'https://my.hexa-ai.fr'
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? ''
const GEMINI_MODEL = 'gemini-2.5-flash'

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

interface Recipient {
  id: string
  company_id: string | null
  name: string | null
  contact_email: string
  role: string | null
  restrict_to_devices: string[] | null
  shared_devices: string[] | null
  auth_user_id: string
}
interface DeviceWithStatus {
  id: string
  company_id: string
  name: string | null
  address: string | null
  status: unknown
  status_received_at: string | null
}
interface AiOutput { brief: string; watchlist: string[] }

function escapeHtml(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

function getConnectivity(d: DeviceWithStatus): 'online' | 'offline' {
  const ts = d.status_received_at
  if (!ts) return 'offline'
  return (Date.now() - new Date(ts).getTime()) / 60000 >= 30 ? 'offline' : 'online'
}
function alarmCount(status: unknown): number {
  const vars = (status as { variables?: { category?: string; value: unknown }[] })?.variables
  if (!Array.isArray(vars)) return 0
  return vars.filter((v) => v?.category === 'alarm' && v?.value !== 0 && v?.value !== null && v?.value !== false).length
}
function summarizeForPrompt(d: DeviceWithStatus): string {
  const s = (d.status ?? {}) as { device?: { hostname?: string }; variables?: { category?: string; value: unknown; name?: string }[]; network?: Record<string, { connected?: boolean }> }
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
  const lastSeenStr = minsAgo === null ? 'jamais' : minsAgo < 60 ? `${minsAgo} min` : minsAgo < 1440 ? `${Math.floor(minsAgo / 60)}h` : `${Math.floor(minsAgo / 1440)}j`
  return `- ${hostname} : ${isOnline ? 'En ligne' : 'Inactif'}, dernier status il y a ${lastSeenStr}, réseau ${networks.join('+') || 'aucun'}, ${alarms.length} alarme(s) active(s)${alarms.length > 0 ? ' [' + alarms.map((a) => a.name).join(', ') + ']' : ''}`
}

function buildPrompt(devices: DeviceWithStatus[]): string {
  const lines = devices.map(summarizeForPrompt).join('\n')
  const dateStr = new Date().toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' })
  return `Tu rédiges la synthèse hebdomadaire d'un responsable d'exploitation supervisant des équipements industriels. Il doit pouvoir la lire en moins de 30 secondes.\n\nVoici l'état des ${devices.length} équipement(s) au ${dateStr} :\n\n${lines}\n\nProduit un objet JSON STRICT :\n{\n  "brief": "<1 à 2 phrases courtes en français qui résument l'état général. Max 30 mots au total.>",\n  "watchlist": ["<point 1>", "<point 2>", ...]\n}\n\nRègles : 'brief' 1-2 phrases max 30 mots. 'watchlist' 0-4 items max 15 mots chacun, mentionne le nom précis. Pas de markdown, pas de backticks. JSON pur.`
}

async function callGemini(prompt: string): Promise<AiOutput> {
  if (!GEMINI_API_KEY) return { brief: '', watchlist: [] }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4, maxOutputTokens: 1500 } }) })
  if (!res.ok) { console.error('[status-email] gemini http', res.status, await res.text()); return { brief: '', watchlist: [] } }
  const json = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
  const raw = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? ''
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  if (!cleaned) return { brief: '', watchlist: [] }
  try {
    const parsed = JSON.parse(cleaned) as { brief?: string; watchlist?: string[] }
    return { brief: (parsed.brief ?? '').trim(), watchlist: Array.isArray(parsed.watchlist) ? parsed.watchlist.filter((s) => typeof s === 'string' && s).slice(0, 4) : [] }
  } catch (e) { console.error('[status-email] gemini parse', e); return { brief: '', watchlist: [] } }
}

async function makeMagicLink(email: string, redirectTo: string): Promise<string | null> {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo } })
  if (error) { console.error('[status-email] generateLink failed for', email, error.message); return null }
  return data?.properties?.action_link ?? null
}

function linkifyDevices(text: string, devices: DeviceWithStatus[]): string {
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
    const url = `${APP_URL}/admin/devices/${encodeURIComponent(dev.id)}`
    result = result.replace(re, (match) => `<a href="${url}" style="color:#0a8068;text-decoration:none;font-weight:600;border-bottom:1px solid #0a8068;">${match}</a>`)
  }
  return result
}

function buildEmail(opts: { recipient: Recipient; devices: DeviceWithStatus[]; ai: AiOutput; dashUrl: string }): { subject: string; html: string } {
  const { recipient, devices, ai, dashUrl } = opts
  const firstName = (recipient.name ?? '').split(' ')[0] ?? ''
  const enriched = devices.map((d) => ({ code: getConnectivity(d), hasAlarm: alarmCount(d.status) > 0 }))
  const nTotal = enriched.length
  const nOnline = enriched.filter((x) => x.code === 'online').length
  const nOffline = enriched.filter((x) => x.code === 'offline').length
  const nAlarm = enriched.filter((x) => x.hasAlarm).length
  const briefHtml = ai.brief ? `<p style="margin:0 0 24px 0;font-size:15.5px;line-height:1.7;color:#1f2937;">${linkifyDevices(ai.brief, devices)}</p>` : ''
  const watchlistHtml = ai.watchlist.length
    ? `<p style="margin:0 0 10px 0;font-size:14px;color:#111827;font-weight:600;">⚠️ À surveiller</p>
<ul style="margin:0 0 24px 0;padding:0;list-style:none;">
  ${ai.watchlist.map((item) => `<li style="margin:0 0 7px 0;padding:0 0 0 20px;position:relative;color:#1f2937;font-size:14.5px;line-height:1.65;"><span style="position:absolute;left:2px;top:0;color:#0a8068;font-weight:700;">→</span>${linkifyDevices(item, devices)}</li>`).join('')}
</ul>`
    : ''
  const statsBits = [
    `<strong>${nTotal}</strong> équipement${nTotal > 1 ? 's' : ''}`,
    `<span style="color:#16a34a;">●</span> <strong>${nOnline}</strong> en ligne`,
    `<span style="color:#9ca3af;">●</span> <strong>${nOffline}</strong> inactif${nOffline > 1 ? 's' : ''}`,
  ]
  if (nAlarm) statsBits.push(`<span style="color:#dc2626;">●</span> <strong>${nAlarm}</strong> alarme${nAlarm > 1 ? 's' : ''}`)
  const statsLine = `<p style="margin:0 0 18px 0;font-size:14px;color:#374151;line-height:1.6;">📊 ${statsBits.join(' &nbsp;·&nbsp; ')}</p>`
  const ctaLine = `<p style="margin:0 0 24px 0;font-size:14.5px;color:#1f2937;line-height:1.7;">→ <a href="${dashUrl}" style="color:#0a8068;text-decoration:none;font-weight:600;border-bottom:1px solid #0a8068;">Voir le tableau de bord</a></p>`
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Rapport status</title></head><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;background:#ffffff;margin:0;padding:32px 16px;"><div style="max-width:580px;margin:0;"><p style="margin:0 0 18px 0;font-size:18px;color:#111827;font-weight:600;">Bonjour${firstName ? ' ' + escapeHtml(firstName) : ''} 👋</p>${briefHtml}${watchlistHtml}${statsLine}${ctaLine}<p style="margin:28px 0 16px 0;font-size:14.5px;color:#1f2937;line-height:1.5;">Bonne journée,</p><div style="border-left:3px solid #00d4aa;padding:2px 0 2px 14px;margin:0 0 14px 0;"><p style="margin:0;font-size:14.5px;color:#111827;font-weight:700;letter-spacing:0.2px;">Julien Talbourdet</p><p style="margin:6px 0 0 0;font-size:13px;color:#374151;line-height:1.65;">Fondateur — myHexa<br>📱 06 66 74 04 58<br>✉️ <a href="mailto:julien.talbourdet@hexa-ai.fr" style="color:#0a8068;text-decoration:none;">julien.talbourdet@hexa-ai.fr</a></p></div><hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 12px 0;"><p style="margin:0;color:#9ca3af;font-size:11px;line-height:1.6;">${ai.brief ? 'Brief rédigé par IA' : ''}</p></div></body></html>`
  const subject = `Rapport status · ${nTotal} équipement${nTotal > 1 ? 's' : ''}${nAlarm ? ' · ' + nAlarm + ' alarme' + (nAlarm > 1 ? 's' : '') : ''}`
  return { subject, html }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  const cronProvided = req.headers.get('x-cron-secret') ?? ''
  const isCron = !!CRON_SECRET && cronProvided === CRON_SECRET

  let manualCompanyId: string | undefined
  if (!isCron) {
    const authHeader = req.headers.get('Authorization') ?? ''
    const jwt = authHeader.replace(/^Bearer\s+/i, '')
    if (!jwt) return new Response(JSON.stringify({ ok: false, error: 'UNAUTHORIZED' }), { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } })
    const { data: userData, error: userErr } = await userClient.auth.getUser()
    if (userErr || !userData.user) return new Response(JSON.stringify({ ok: false, error: 'INVALID_JWT' }), { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
    const { data: staffOk } = await userClient.rpc('is_hexa_staff_admin')
    if (staffOk !== true) return new Response(JSON.stringify({ ok: false, error: 'FORBIDDEN' }), { status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
    const body = (await req.json().catch(() => ({}))) as { company_id?: string }
    manualCompanyId = body.company_id
    if (!manualCompanyId) return new Response(JSON.stringify({ ok: false, error: 'company_id required' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
  }

  const startedAt = Date.now()
  const parisNow = new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris', weekday: 'long' })
  const isTuesday = parisNow.startsWith('Tuesday')

  let targetCompanyIds: string[]
  if (manualCompanyId) {
    const { data: c, error: cErr } = await admin.from('companies').select('id').eq('id', manualCompanyId).maybeSingle()
    if (cErr || !c) return new Response(JSON.stringify({ ok: false, error: 'company not found' }), { status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
    targetCompanyIds = [manualCompanyId]
  } else {
    const { data: companies, error: cErr } = await admin.from('companies').select('id, status_email_frequency')
    if (cErr) { console.error('[status-email] companies load failed', cErr); return new Response(JSON.stringify({ ok: false, error: cErr.message }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }) }
    targetCompanyIds = (companies ?? []).filter((c) => c.status_email_frequency === 'daily' || (c.status_email_frequency === 'weekly' && isTuesday)).map((c) => c.id)
  }

  if (targetCompanyIds.length === 0) {
    return new Response(JSON.stringify({ ok: true, recipients: 0, mails_sent: 0, duration_ms: Date.now() - startedAt }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
  }

  // Recipients à notifier :
  //   - ceux dont company_id ∈ targetCompanyIds, OU
  //   - ceux qui ont des shared_devices appartenant à une compagnie cible (deviendra utile pour guests)
  const { data: recipientsCompany } = await admin
    .from('recipients')
    .select('id, company_id, name, contact_email, role, restrict_to_devices, shared_devices, auth_user_id')
    .in('company_id', targetCompanyIds)
    .not('contact_email', 'is', null)
  const { data: recipientsGuest } = await admin
    .from('recipients')
    .select('id, company_id, name, contact_email, role, restrict_to_devices, shared_devices, auth_user_id')
    .is('company_id', null)
    .not('shared_devices', 'is', null)
    .not('contact_email', 'is', null)
  const recipientsMap = new Map<string, Recipient>()
  for (const r of [...(recipientsCompany ?? []), ...(recipientsGuest ?? [])]) {
    if (!r.contact_email || !r.auth_user_id) continue
    recipientsMap.set(r.id, r as Recipient)
  }
  const recipients: Recipient[] = Array.from(recipientsMap.values())

  let mailsSent = 0
  let mailsFailed = 0
  const heavyWork = (async () => {
    const { data: rpcData, error: rpcErr } = await admin.rpc('devices_with_latest_status')
    if (rpcErr) { console.error('[status-email] devices_with_latest_status failed', rpcErr); return }
    const allDevices = (rpcData ?? []) as Array<{ id: string; company_id: string; name: string | null; address: string | null; status_payload: unknown; status_received_at: string | null }>

    // Cache brief IA par signature des devices visibles
    const aiBySignature = new Map<string, AiOutput>()

    for (const r of recipients) {
      const devices: DeviceWithStatus[] = allDevices
        .filter((d) => {
          const inCompany = r.company_id && d.company_id === r.company_id && (r.restrict_to_devices === null || r.restrict_to_devices.includes(d.id))
          const shared = (r.shared_devices ?? []).includes(d.id)
          return inCompany || shared
        })
        .map((d) => ({ id: d.id, company_id: d.company_id, name: d.name, address: d.address, status: d.status_payload, status_received_at: d.status_received_at }))
      if (!devices.length) continue

      const signature = devices.map((d) => d.id).slice().sort().join(',')
      let ai = aiBySignature.get(signature)
      if (!ai) {
        ai = await callGemini(buildPrompt(devices))
        aiBySignature.set(signature, ai)
      }

      const link = await makeMagicLink(r.contact_email, `${APP_URL}/auth/callback?next=${encodeURIComponent('/admin/devices')}`)
      const dashUrl = link ?? `${APP_URL}/admin/devices`
      const { subject, html } = buildEmail({ recipient: r, devices, ai, dashUrl })
      try {
        await sendMail({ to: r.contact_email, subject, html })
        mailsSent++
        console.log('[status-email] sent to', r.contact_email)
      } catch (e) {
        mailsFailed++
        console.error('[status-email] sendMail failed for', r.contact_email, e instanceof Error ? e.message : String(e))
      }
    }
    try { await closeMailer() } catch { /* no-op */ }
    console.log('[status-email] done', { mode: manualCompanyId ? 'manual' : 'cron', mails_sent: mailsSent, mails_failed: mailsFailed, duration_ms: Date.now() - startedAt })
  })()

  const recipientCount = recipients.length
  if (isCron) {
    await heavyWork
    return new Response(JSON.stringify({
      ok: true, mode: 'cron',
      target_companies: targetCompanyIds.length, recipients: recipientCount,
      mails_sent: mailsSent, mails_failed: mailsFailed,
      is_tuesday: isTuesday, duration_ms: Date.now() - startedAt,
    }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
  }
  // @ts-expect-error EdgeRuntime is provided by Supabase Edge Runtime
  EdgeRuntime.waitUntil(heavyWork)
  return new Response(JSON.stringify({
    ok: true, mode: 'manual',
    target_companies: targetCompanyIds.length, recipients: recipientCount,
    queued: true,
    note: 'Envoi en cours en arrière-plan ; les mails arrivent dans quelques secondes.',
  }), { status: 202, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
})

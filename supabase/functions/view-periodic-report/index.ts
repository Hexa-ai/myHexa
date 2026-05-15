// Edge Function: view-periodic-report
// Contract (compat with n8n workflow zEgQP1yDyWJr6N5X):
//   GET /functions/v1/view-periodic-report?t=<token>&d=<deviceId>&type=daily|weekly[&period=YYYY-MM-DD]

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { ok, fail, preflight } from '../_shared/response.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
)

interface Recipient {
  id: string
  company_id: string | null
  role: string | null
  allowed_device_ids: string[] | null
}

Deno.serve(async (req) => {
  const pf = preflight(req)
  if (pf) return pf

  const url = new URL(req.url)
  const token = url.searchParams.get('t')
  const deviceId = url.searchParams.get('d')
  const type = url.searchParams.get('type') ?? 'daily'
  const period = url.searchParams.get('period')

  if (!token) return fail('MISSING_TOKEN', 'Lien invalide', 400)
  if (!deviceId) return fail('MISSING_DEVICE', 'Équipement non spécifié', 400)
  if (type !== 'daily' && type !== 'weekly') {
    return fail('INVALID_TYPE', 'Type de rapport invalide', 400)
  }
  if (period && !/^\d{4}-\d{2}-\d{2}$/.test(period)) {
    return fail('INVALID_PERIOD', 'Période invalide', 400)
  }

  // 1) Token + recipient
  const { data: tokenRow, error: tokenErr } = await supabase
    .from('report_tokens')
    .select(
      'token, expires_at, recipient:recipients(id, company_id, role, allowed_device_ids)',
    )
    .eq('token', token)
    .maybeSingle()

  if (tokenErr) return fail('DB_ERROR', tokenErr.message, 500)
  if (!tokenRow) return fail('TOKEN_NOT_FOUND', 'Lien invalide', 410)
  if (new Date(tokenRow.expires_at) < new Date()) {
    return fail('TOKEN_EXPIRED', 'Ce lien a expiré', 410)
  }

  const recipient = (tokenRow as { recipient: Recipient | null }).recipient
  if (!recipient) return fail('RECIPIENT_MISSING', 'Destinataire introuvable', 410)

  // 2) Authorize device
  const { data: device, error: deviceErr } = await supabase
    .from('devices')
    .select('id, name, company_id')
    .eq('id', deviceId)
    .maybeSingle()
  if (deviceErr) return fail('DB_ERROR', deviceErr.message, 500)
  if (!device) return fail('UNAUTHORIZED_DEVICE', 'Équipement non autorisé', 410)

  const allowed = recipient.allowed_device_ids
  const isAuthorized = allowed && allowed.length > 0
    ? allowed.includes(device.id)
    : device.company_id === recipient.company_id
  if (!isAuthorized) {
    return fail('UNAUTHORIZED_DEVICE', 'Équipement non autorisé', 410)
  }

  // 3) Periods list + selected report in parallel
  const [periodsRes, reportRes] = await Promise.all([
    supabase
      .from('reports')
      .select('period_start, period_end')
      .eq('device_id', device.id)
      .eq('type', type)
      .not('period_start', 'is', null)
      .order('period_start', { ascending: false }),
    (() => {
      let q = supabase
        .from('reports')
        .select('payload, received_at, period_start, period_end')
        .eq('device_id', device.id)
        .eq('type', type)
        .order('period_start', { ascending: false, nullsFirst: false })
        .order('received_at', { ascending: false })
        .limit(1)
      if (period) q = q.eq('period_start', period)
      return q.maybeSingle()
    })(),
  ])

  if (periodsRes.error) return fail('DB_ERROR', periodsRes.error.message, 500)
  if (reportRes.error) return fail('DB_ERROR', reportRes.error.message, 500)

  const uniq = new Map<string, { period_start: string; period_end: string | null }>()
  for (const r of periodsRes.data ?? []) {
    if (r.period_start && !uniq.has(r.period_start)) {
      uniq.set(r.period_start, { period_start: r.period_start, period_end: r.period_end })
    }
  }

  return ok({
    type,
    deviceName: device.name,
    role: recipient.role ?? 'viewer',
    payload: reportRes.data?.payload ?? null,
    periodStart: reportRes.data?.period_start ?? null,
    periodEnd: reportRes.data?.period_end ?? null,
    periods: Array.from(uniq.values()),
  })
})

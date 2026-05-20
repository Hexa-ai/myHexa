// Edge Function: view-supervision
// Contract:
//   GET /functions/v1/view-supervision?t=<token>
//
// Renvoie les devices accessibles au destinataire d'un token de rapport
// (vue dashboard pour les externes sans compte). La vue Vue
// /report/supervision consomme ça pour afficher la liste + la carte.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { ok, fail, preflight } from '../_shared/response.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
)

interface RecipientRow {
  id: string
  name: string | null
  contact_email: string | null
  company_id: string
  role: string | null
  allowed_device_ids: string[] | null
  auth_user_id: string | null
}

Deno.serve(async (req) => {
  const pf = preflight(req)
  if (pf) return pf

  const url = new URL(req.url)
  const token = url.searchParams.get('t')
  if (!token) return fail('MISSING_TOKEN', 'Lien invalide', 400)

  const { data: tokenRow, error: tokenErr } = await supabase
    .from('report_tokens')
    .select('token, expires_at, recipient:recipients(id, name, contact_email, company_id, role, allowed_device_ids, auth_user_id)')
    .eq('token', token)
    .maybeSingle()
  if (tokenErr) return fail('DB_ERROR', tokenErr.message, 500)
  if (!tokenRow) return fail('TOKEN_NOT_FOUND', 'Lien invalide', 410)
  if (new Date(tokenRow.expires_at) < new Date()) return fail('TOKEN_EXPIRED', 'Ce lien a expiré', 410)

  const recipient = (tokenRow as { recipient: RecipientRow | null }).recipient
  if (!recipient) return fail('RECIPIENT_MISSING', 'Destinataire introuvable', 410)

  // Company info
  const { data: company, error: cErr } = await supabase
    .from('companies').select('id, name').eq('id', recipient.company_id).maybeSingle()
  if (cErr) return fail('DB_ERROR', cErr.message, 500)

  // Devices visible: membre = tous ceux de la compagnie ; externe = restreint
  // par allowed_device_ids si défini
  const { data: rpcData, error: rpcErr } = await supabase.rpc('devices_with_latest_status')
  if (rpcErr) return fail('DB_ERROR', rpcErr.message, 500)
  const allRows = (rpcData ?? []) as Array<{
    id: string
    company_id: string
    name: string | null
    address: string | null
    latitude: number | null
    longitude: number | null
    last_connection_at: string | null
    status_payload: unknown
    status_received_at: string | null
  }>
  const isMember = !!recipient.auth_user_id
  const visible = allRows
    .filter((d) => d.company_id === recipient.company_id)
    .filter((d) => isMember || !recipient.allowed_device_ids || recipient.allowed_device_ids.includes(d.id))

  function alarmCount(payload: unknown): number {
    const vars = (payload as { variables?: { category?: string; value: unknown }[] })?.variables
    if (!Array.isArray(vars)) return 0
    return vars.filter((v) => v?.category === 'alarm' && v?.value !== 0 && v?.value !== null && v?.value !== false).length
  }
  function isOnline(receivedAt: string | null): boolean {
    if (!receivedAt) return false
    return (Date.now() - new Date(receivedAt).getTime()) / 60000 < 30
  }

  const devices = visible.map((d) => ({
    id: d.id,
    name: d.name,
    address: d.address,
    latitude: d.latitude,
    longitude: d.longitude,
    last_status_at: d.status_received_at,
    online: isOnline(d.status_received_at),
    alarm_count: alarmCount(d.status_payload),
  }))

  return ok({
    recipient: { name: recipient.name, role: recipient.role },
    expiresAt: tokenRow.expires_at,
    company: { id: company?.id ?? recipient.company_id, name: company?.name ?? '' },
    devices,
  })
})

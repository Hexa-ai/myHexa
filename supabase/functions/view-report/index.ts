// Edge Function: view-report
// Contract (compatibility with existing n8n workflow K6gY6Zcxy29OOJ1v):
//   GET /functions/v1/view-report?t=<token>&d=<deviceId>
//
// Returns JSON describing the device + last status report so the Vue ReportView
// can render the same UI as the n8n HTML page.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { ok, fail, preflight } from '../_shared/response.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
)

Deno.serve(async (req) => {
  const pf = preflight(req)
  if (pf) return pf

  const url = new URL(req.url)
  const token = url.searchParams.get('t')
  const deviceId = url.searchParams.get('d')

  if (!token) return fail('MISSING_TOKEN', 'Lien invalide', 400)
  if (!deviceId) return fail('MISSING_DEVICE', 'Équipement non spécifié', 400)

  // 1) Token + recipient
  const { data: tokenRow, error: tokenErr } = await supabase
    .from('report_tokens')
    .select(
      'token, recipient_id, expires_at, recipient:recipients(id, contact_email, name, company_id, role, allowed_device_ids)',
    )
    .eq('token', token)
    .maybeSingle()

  if (tokenErr) return fail('DB_ERROR', tokenErr.message, 500)
  if (!tokenRow) return fail('TOKEN_NOT_FOUND', 'Lien invalide', 410)

  if (new Date(tokenRow.expires_at) < new Date()) {
    return fail('TOKEN_EXPIRED', 'Ce lien a expiré', 410)
  }

  const recipient = (tokenRow as { recipient: Recipient | null }).recipient
  if (!recipient) {
    return fail('RECIPIENT_MISSING', 'Destinataire introuvable', 410)
  }

  // 2) Authorization: device must belong to recipient
  //    - if allowed_device_ids is set, deviceId must be in that array
  //    - else device must be in the recipient's company
  const allowed = recipient.allowed_device_ids
  const { data: device, error: deviceErr } = await supabase
    .from('devices')
    .select('id, name, address, latitude, longitude, company_id')
    .eq('id', deviceId)
    .maybeSingle()

  if (deviceErr) return fail('DB_ERROR', deviceErr.message, 500)
  if (!device) return fail('UNAUTHORIZED_DEVICE', 'Équipement non autorisé', 410)

  const isAuthorized = allowed && allowed.length > 0
    ? allowed.includes(device.id)
    : device.company_id === recipient.company_id
  if (!isAuthorized) {
    return fail('UNAUTHORIZED_DEVICE', 'Équipement non autorisé', 410)
  }

  // 3) Last status report for this device
  const { data: lastStatus, error: statusErr } = await supabase
    .from('reports')
    .select('payload, received_at')
    .eq('device_id', device.id)
    .eq('type', 'status')
    .order('received_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (statusErr) return fail('DB_ERROR', statusErr.message, 500)

  return ok({
    token: tokenRow.token,
    expiresAt: tokenRow.expires_at,
    role: recipient.role ?? 'viewer',
    device: {
      id: device.id,
      name: device.name,
      address: device.address,
      latitude: device.latitude,
      longitude: device.longitude,
    },
    status: lastStatus
      ? { payload: lastStatus.payload, receivedAt: lastStatus.received_at }
      : null,
  })
})

interface Recipient {
  id: string
  contact_email: string | null
  name: string | null
  company_id: string | null
  role: string | null
  allowed_device_ids: string[] | null
}

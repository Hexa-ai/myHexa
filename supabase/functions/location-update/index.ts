// Edge Function: location-update
// Contract (compat with n8n workflow u85ZmX7GSWSUW15u):
//   POST /functions/v1/location-update  { token, deviceId, address }
//
// - Validates token (report_tokens, non-expired)
// - Checks deviceId is authorized for the recipient
// - Requires recipient.role === 'admin'
// - Geocodes via Nominatim (OpenStreetMap)
// - Updates devices.address / latitude / longitude
//
// Returns JSON ({ ok, data | error }). The Vue ReportView handles the UI redirect.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { ok, fail, preflight } from '../_shared/response.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
)

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const USER_AGENT = 'myHexa-edge/1.0 (julien.talbourdet@hexa-ai.fr)'

interface Recipient {
  id: string
  contact_email: string | null
  company_id: string | null
  role: string | null
  allowed_device_ids: string[] | null
}

interface NominatimResult {
  lat: string
  lon: string
  display_name?: string
}

Deno.serve(async (req) => {
  const pf = preflight(req)
  if (pf) return pf

  if (req.method !== 'POST') {
    return fail('METHOD_NOT_ALLOWED', 'Méthode non supportée', 405)
  }

  const body = await req.json().catch(() => null)
  const token = body?.token as string | undefined
  const deviceId = body?.deviceId as string | undefined
  const address = (body?.address as string | undefined)?.trim()

  if (!token || !deviceId) {
    return fail('MISSING_PARAMS', 'Paramètres manquants', 400)
  }
  if (!address) return fail('MISSING_ADDRESS', 'Adresse requise', 400)

  // 1) Token + recipient
  const { data: tokenRow, error: tokenErr } = await supabase
    .from('report_tokens')
    .select(
      'token, expires_at, recipient:recipients(id, contact_email, company_id, role, allowed_device_ids)',
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

  // 2) Authorization on deviceId
  const { data: device, error: deviceErr } = await supabase
    .from('devices')
    .select('id, company_id')
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

  // 3) Admin only
  if (recipient.role !== 'admin') {
    return fail('FORBIDDEN', 'Action réservée aux administrateurs', 403)
  }

  // 4) Geocode
  let geocoded: NominatimResult | null = null
  try {
    const url = new URL(NOMINATIM_URL)
    url.searchParams.set('q', address)
    url.searchParams.set('format', 'json')
    url.searchParams.set('limit', '1')
    url.searchParams.set('addressdetails', '1')
    const r = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
    if (r.ok) {
      const arr = (await r.json()) as NominatimResult[]
      if (Array.isArray(arr) && arr.length > 0 && arr[0].lat && arr[0].lon) {
        geocoded = arr[0]
      }
    }
  } catch (e) {
    console.error('[location-update] geocode error', e)
  }

  if (!geocoded) {
    return fail('GEOCODE_FAILED', 'Adresse introuvable', 422)
  }

  const lat = parseFloat(geocoded.lat)
  const lng = parseFloat(geocoded.lon)
  const displayName = geocoded.display_name || address

  // 5) Update
  const { error: updErr } = await supabase
    .from('devices')
    .update({ address: displayName, latitude: lat, longitude: lng })
    .eq('id', device.id)

  if (updErr) return fail('DB_ERROR', updErr.message, 500)

  return ok({
    deviceId: device.id,
    address: displayName,
    latitude: lat,
    longitude: lng,
  })
})

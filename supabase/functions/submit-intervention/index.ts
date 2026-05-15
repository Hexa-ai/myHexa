// Edge Function: submit-intervention
// POST /functions/v1/submit-intervention
//   { deviceId, technicianName, technicianContact?, category, severity, message? }
//
// Public endpoint hit from a QR code on the device. We validate the device
// exists and pass everything through to the database. Insert bypasses RLS via
// the service_role key (the table has no INSERT policy).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { ok, fail, preflight } from '../_shared/response.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
)

const VALID_CATEGORIES = ['intervention', 'incident', 'controle', 'autre'] as const
const VALID_SEVERITIES = ['info', 'warning', 'error'] as const
type Category = (typeof VALID_CATEGORIES)[number]
type Severity = (typeof VALID_SEVERITIES)[number]

Deno.serve(async (req) => {
  const pf = preflight(req)
  if (pf) return pf

  if (req.method !== 'POST') {
    return fail('METHOD_NOT_ALLOWED', 'Méthode non supportée', 405)
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return fail('INVALID_BODY', 'Corps invalide', 400)

  const deviceId = body.deviceId as string | undefined
  const technicianName = (body.technicianName as string | undefined)?.trim()
  const technicianContact = (body.technicianContact as string | undefined)?.trim() || null
  const category = body.category as Category | undefined
  const severity = body.severity as Severity | undefined
  const message = (body.message as string | undefined)?.trim() || null

  if (!deviceId) return fail('MISSING_DEVICE', 'Équipement non spécifié', 400)
  if (!technicianName) return fail('MISSING_NAME', 'Nom du technicien requis', 400)
  if (!category || !VALID_CATEGORIES.includes(category)) {
    return fail('INVALID_CATEGORY', 'Catégorie invalide', 400)
  }
  if (!severity || !VALID_SEVERITIES.includes(severity)) {
    return fail('INVALID_SEVERITY', 'Sévérité invalide', 400)
  }
  if (technicianName.length > 120) {
    return fail('TOO_LONG', 'Nom trop long', 400)
  }
  if (message && message.length > 4000) {
    return fail('TOO_LONG', 'Message trop long', 400)
  }

  // Verify the device exists (so we don't accept noise for random UUIDs)
  const { data: device, error: devErr } = await supabase
    .from('devices')
    .select('id, name')
    .eq('id', deviceId)
    .maybeSingle()
  if (devErr) return fail('DB_ERROR', devErr.message, 500)
  if (!device) return fail('DEVICE_NOT_FOUND', 'Équipement inconnu', 404)

  const { data: inserted, error: insErr } = await supabase
    .from('field_interventions')
    .insert({
      device_id: device.id,
      technician_name: technicianName,
      technician_contact: technicianContact,
      category,
      severity,
      message,
    })
    .select('id, created_at')
    .single()

  if (insErr) return fail('DB_ERROR', insErr.message, 500)

  return ok({
    id: inserted.id,
    createdAt: inserted.created_at,
    device: { id: device.id, name: device.name },
  })
})

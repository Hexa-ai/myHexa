// Edge Function: submit-intervention
// POST /functions/v1/submit-intervention
//   {
//     deviceId, technicianName, technicianContact?, category, severity,
//     message?, photos?: Array<{ name?, contentType?, dataBase64 }>
//   }
//
// Public endpoint hit from a QR code. Photos are stored in the private
// 'intervention-photos' bucket under {device_id}/{intervention_id}/<i>.<ext>.

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
const BUCKET = 'intervention-photos'
const MAX_PHOTOS = 5
const MAX_PHOTO_BYTES = 4 * 1024 * 1024 // 4 MB after client-side compression

interface PhotoInput {
  name?: string
  contentType?: string
  dataBase64: string
}

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function extFromContentType(ct: string | undefined): string {
  switch ((ct ?? '').toLowerCase()) {
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg'
    case 'image/png':
      return 'png'
    case 'image/webp':
      return 'webp'
    default:
      return 'jpg'
  }
}

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
  const photos = Array.isArray(body.photos) ? (body.photos as PhotoInput[]) : []

  if (!deviceId) return fail('MISSING_DEVICE', 'Équipement non spécifié', 400)
  if (!technicianName) return fail('MISSING_NAME', 'Nom du technicien requis', 400)
  if (!category || !VALID_CATEGORIES.includes(category)) {
    return fail('INVALID_CATEGORY', 'Catégorie invalide', 400)
  }
  if (!severity || !VALID_SEVERITIES.includes(severity)) {
    return fail('INVALID_SEVERITY', 'Sévérité invalide', 400)
  }
  if (technicianName.length > 120) return fail('TOO_LONG', 'Nom trop long', 400)
  if (message && message.length > 4000) return fail('TOO_LONG', 'Message trop long', 400)
  if (photos.length > MAX_PHOTOS) {
    return fail('TOO_MANY_PHOTOS', `Maximum ${MAX_PHOTOS} photos`, 400)
  }

  // Verify the device exists
  const { data: device, error: devErr } = await supabase
    .from('devices')
    .select('id, name')
    .eq('id', deviceId)
    .maybeSingle()
  if (devErr) return fail('DB_ERROR', devErr.message, 500)
  if (!device) return fail('DEVICE_NOT_FOUND', 'Équipement inconnu', 404)

  // Pre-generate the intervention id so we can use it in the storage paths
  const interventionId = crypto.randomUUID()
  const uploadedPaths: string[] = []

  for (let i = 0; i < photos.length; i++) {
    const p = photos[i]
    if (!p?.dataBase64 || typeof p.dataBase64 !== 'string') {
      return fail('INVALID_PHOTO', `Photo ${i + 1} invalide`, 400)
    }
    let bytes: Uint8Array
    try {
      bytes = decodeBase64(p.dataBase64)
    } catch {
      return fail('INVALID_PHOTO', `Photo ${i + 1} corrompue`, 400)
    }
    if (bytes.byteLength > MAX_PHOTO_BYTES) {
      return fail('PHOTO_TOO_LARGE', `Photo ${i + 1} trop volumineuse (max 4 MB)`, 400)
    }
    const ext = extFromContentType(p.contentType)
    const path = `${device.id}/${interventionId}/${i}.${ext}`
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, {
        contentType: p.contentType || 'image/jpeg',
        upsert: false,
      })
    if (upErr) {
      // Rollback : best-effort delete of anything we already uploaded
      if (uploadedPaths.length) {
        await supabase.storage.from(BUCKET).remove(uploadedPaths)
      }
      return fail('STORAGE_ERROR', upErr.message, 500)
    }
    uploadedPaths.push(path)
  }

  const { data: inserted, error: insErr } = await supabase
    .from('field_interventions')
    .insert({
      id: interventionId,
      device_id: device.id,
      technician_name: technicianName,
      technician_contact: technicianContact,
      category,
      severity,
      message,
      photo_paths: uploadedPaths,
    })
    .select('id, created_at')
    .single()

  if (insErr) {
    if (uploadedPaths.length) {
      await supabase.storage.from(BUCKET).remove(uploadedPaths)
    }
    return fail('DB_ERROR', insErr.message, 500)
  }

  return ok({
    id: inserted.id,
    createdAt: inserted.created_at,
    device: { id: device.id, name: device.name },
    photoCount: uploadedPaths.length,
  })
})

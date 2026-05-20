// Edge Function: share-device
//
// Partage un device avec un destinataire existant (peu importe sa compagnie
// d'origine) en ajoutant device_id à recipients.shared_devices.
//
// Contract:
//   POST /functions/v1/share-device
//   Headers: Authorization: Bearer <admin or staff JWT>
//   Body: { device_id: string, recipient_email: string }
//
// Permissions :
//   - Admin de la compagnie propriétaire du device, OU
//   - Staff Hexa admin
//
// Comportement :
//   - Trouve le recipient par email (404 si pas trouvé — pas de création)
//   - Vérifie unicité du partage (idempotent)
//   - Renvoie l'état du recipient mis à jour

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { ok, fail, preflight } from '../_shared/response.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

interface ShareBody {
  device_id?: string
  recipient_email?: string
  /** Optional: revoke=true → retire le partage au lieu de l'ajouter. */
  revoke?: boolean
}

Deno.serve(async (req) => {
  const pf = preflight(req)
  if (pf) return pf
  if (req.method !== 'POST') return fail('METHOD_NOT_ALLOWED', 'Méthode non supportée', 405)

  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.replace(/^Bearer\s+/i, '')
  if (!jwt) return fail('UNAUTHORIZED', 'JWT manquant', 401)
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData.user) return fail('UNAUTHORIZED', 'JWT invalide', 401)

  const body = (await req.json().catch(() => null)) as ShareBody | null
  if (!body?.device_id) return fail('BAD_REQUEST', 'device_id requis', 400)
  if (!body.recipient_email?.includes('@')) return fail('BAD_REQUEST', 'recipient_email requis', 400)
  const email = body.recipient_email.trim().toLowerCase()
  const revoke = !!body.revoke

  // 1. Vérifier le device et sa compagnie
  const { data: device, error: dErr } = await admin
    .from('devices')
    .select('id, company_id, name')
    .eq('id', body.device_id)
    .maybeSingle()
  if (dErr) return fail('DB_ERROR', dErr.message, 500)
  if (!device) return fail('DEVICE_NOT_FOUND', 'Équipement introuvable', 404)

  // 2. Vérifier que le caller a le droit (admin de la compagnie du device OU staff admin)
  const { data: isStaffAdmin } = await userClient.rpc('is_hexa_staff_admin')
  const { data: callerRcpt } = await admin
    .from('recipients')
    .select('company_id, role')
    .eq('auth_user_id', userData.user.id)
    .maybeSingle()
  const isOwnerAdmin = callerRcpt?.company_id === device.company_id && callerRcpt?.role === 'admin'
  if (!isStaffAdmin && !isOwnerAdmin) {
    return fail('FORBIDDEN', 'Seul un admin de la compagnie propriétaire ou le staff Hexa peut partager ce device', 403)
  }

  // 3. Trouver le recipient cible
  const { data: target, error: tErr } = await admin
    .from('recipients')
    .select('id, name, contact_email, shared_devices')
    .ilike('contact_email', email)
    .maybeSingle()
  if (tErr) return fail('DB_ERROR', tErr.message, 500)
  if (!target) {
    return fail('RECIPIENT_NOT_FOUND', `Aucun destinataire n'a l'email ${email}. Crée d'abord le destinataire dans une compagnie ou comme guest.`, 404)
  }

  // 4. Mise à jour shared_devices (idempotent)
  const current = target.shared_devices ?? []
  let nextList: string[] | null
  if (revoke) {
    nextList = current.filter((id) => id !== device.id)
    if (nextList.length === current.length) {
      return ok({ recipient_id: target.id, device_id: device.id, status: 'not_shared' })
    }
    if (nextList.length === 0) nextList = null
  } else {
    if (current.includes(device.id)) {
      return ok({ recipient_id: target.id, device_id: device.id, status: 'already_shared' })
    }
    nextList = [...current, device.id]
  }

  const { error: uErr } = await admin
    .from('recipients')
    .update({ shared_devices: nextList })
    .eq('id', target.id)
  if (uErr) return fail('DB_ERROR', uErr.message, 500)

  return ok({
    recipient_id: target.id,
    recipient_email: target.contact_email,
    device_id: device.id,
    device_name: device.name,
    action: revoke ? 'revoked' : 'shared',
  })
})

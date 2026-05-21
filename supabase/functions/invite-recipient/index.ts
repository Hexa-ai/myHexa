// Edge Function: invite-recipient
//
// Contract (modèle unifié — cf docs/superpowers/specs/2026-05-20-recipients-unified-model.md):
//   POST /functions/v1/invite-recipient
//   Headers: Authorization: Bearer <admin JWT>
//   Body: {
//     name: string,
//     contact_email: string,
//     phone?: string,
//     role: 'admin' | 'viewer',
//     company_id?: string | null,   // null = guest pur (réservé staff admin)
//     restrict_to_devices?: string[] | null,  // limite intra-compagnie
//     shared_devices?: string[] | null,       // partage depuis autres compagnies (réservé staff)
//     recipient_id?: string         // present = update d'un recipient existant
//   }
//
// Comportement :
//   - Tout recipient a un auth.users (crée si nouveau email, lie via inviteUserByEmail)
//   - Plus de distinction membre/externe — tout user a un compte
//   - Magic link disponible côté login → /auth/magic-link
//
// Permissions :
//   - Admin compagnie : peut créer un recipient avec company_id = sa compagnie,
//     définir restrict_to_devices parmi les devices de sa compagnie.
//   - Staff Hexa admin : tout autorisé (toute company_id, null inclus,
//     shared_devices avec n'importe quels devices).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { ok, fail, preflight } from '../_shared/response.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const APP_URL = Deno.env.get('APP_URL') ?? 'https://my.hexa-ai.fr'

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

interface InviteBody {
  name?: string
  contact_email?: string
  phone?: string | null
  role?: 'admin' | 'viewer'
  company_id?: string | null
  restrict_to_devices?: string[] | null
  shared_devices?: string[] | null
  recipient_id?: string
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

  // Caller info : recipient associé + flag staff
  const { data: callerRcpt, error: callerErr } = await admin
    .from('recipients')
    .select('id, company_id, role')
    .eq('auth_user_id', userData.user.id)
    .maybeSingle()
  if (callerErr) return fail('DB_ERROR', callerErr.message, 500)
  const { data: isStaffAdmin } = await userClient.rpc('is_hexa_staff_admin')

  if (!isStaffAdmin && (!callerRcpt || callerRcpt.role !== 'admin')) {
    return fail('FORBIDDEN', 'Réservé aux admins de la compagnie ou au staff Hexa-ai', 403)
  }

  const body = (await req.json().catch(() => null)) as InviteBody | null
  if (!body) return fail('BAD_REQUEST', 'Body JSON requis', 400)

  const email = (body.contact_email ?? '').trim().toLowerCase()
  const name = (body.name ?? '').trim()
  const role = body.role
  if (!name) return fail('INVALID_NAME', 'Nom requis', 400)
  if (!email.includes('@')) return fail('INVALID_EMAIL', 'Email invalide', 400)
  if (role !== 'admin' && role !== 'viewer') return fail('INVALID_ROLE', 'Rôle invalide', 400)

  // Résoudre company_id :
  //   - staff Hexa : libre (toute compagnie, null inclus)
  //   - admin compagnie : sa compagnie OU null (externe). Un externe doit recevoir
  //     au moins un shared_devices depuis sa compagnie (sinon il n'a rien à voir).
  let targetCompanyId: string | null
  if (isStaffAdmin) {
    targetCompanyId = body.company_id === undefined ? (callerRcpt?.company_id ?? null) : (body.company_id ?? null)
  } else {
    if (!callerRcpt) return fail('FORBIDDEN', 'Pas de compagnie associée', 403)
    if (body.company_id === null) {
      // Externe — il faut un partage explicite depuis la compagnie du caller
      if (!body.shared_devices || body.shared_devices.length === 0) {
        return fail('INVALID_GUEST', 'Un destinataire externe doit avoir au moins un équipement partagé', 400)
      }
      targetCompanyId = null
    } else if (body.company_id && body.company_id !== callerRcpt.company_id) {
      return fail('FORBIDDEN', 'Vous ne pouvez créer un destinataire que pour votre compagnie', 403)
    } else {
      targetCompanyId = callerRcpt.company_id
    }
  }

  // Validation : restrict_to_devices doivent appartenir à targetCompanyId
  if (body.restrict_to_devices && body.restrict_to_devices.length > 0) {
    if (!targetCompanyId) return fail('INVALID_RESTRICT', 'restrict_to_devices nécessite company_id', 400)
    const { data: devs, error: dErr } = await admin
      .from('devices')
      .select('id')
      .in('id', body.restrict_to_devices)
    if (dErr) return fail('DB_ERROR', dErr.message, 500)
    const { data: ownDevs } = await admin
      .from('devices')
      .select('id')
      .eq('company_id', targetCompanyId)
      .in('id', body.restrict_to_devices)
    if ((ownDevs?.length ?? 0) !== body.restrict_to_devices.length) {
      return fail('INVALID_RESTRICT', 'Certains devices ne sont pas dans la compagnie cible', 400)
    }
    if ((devs?.length ?? 0) !== body.restrict_to_devices.length) {
      return fail('INVALID_RESTRICT', 'Certains devices restrict_to_devices sont introuvables', 400)
    }
  }

  // Validation : shared_devices — un non-staff ne peut ajouter QUE des devices de sa compagnie
  if (body.shared_devices && body.shared_devices.length > 0 && !isStaffAdmin) {
    const callerCompanyId = callerRcpt!.company_id
    const { data: ok2 } = await admin
      .from('devices')
      .select('id')
      .eq('company_id', callerCompanyId)
      .in('id', body.shared_devices)
    if ((ok2?.length ?? 0) !== body.shared_devices.length) {
      return fail('INVALID_SHARED', 'Vous ne pouvez partager que des devices de votre compagnie', 403)
    }
  }

  // 1. Obtenir ou créer l'auth.users
  let authUserId: string | undefined
  let invited = false

  // Cherche un user existant par email (pas d'API directe, on tente create et fallback)
  const { data: existingUser } = await admin.auth.admin.listUsers({ perPage: 1, page: 1 })
  // listUsers ne filtre pas par email — on vérifie côté SQL recipients d'abord
  const { data: existingRecipient } = await admin
    .from('recipients')
    .select('id, auth_user_id, company_id')
    .ilike('contact_email', email)
    .maybeSingle()

  if (existingRecipient?.auth_user_id) {
    authUserId = existingRecipient.auth_user_id
  } else {
    // Aucune ligne recipient : on tente créer l'auth.users via invite (envoie un mail)
    const { data: invitedUser, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${APP_URL}/login`,
    })
    if (invErr) {
      // Si email existe déjà côté auth, récupérer via /auth/v1/admin/users?email=
      // Fallback : on cherche via SQL auth.users
      const { data: maybeUser } = await admin
        .from('recipients')
        .select('auth_user_id')
        .ilike('contact_email', email)
        .maybeSingle()
      if (maybeUser?.auth_user_id) {
        authUserId = maybeUser.auth_user_id
      } else {
        console.error('[invite-recipient] invite failed', invErr)
        return fail('INVITE_FAILED', invErr.message, 500)
      }
    } else {
      authUserId = invitedUser.user?.id
      invited = true
    }
    if (!authUserId) {
      return fail('INVITE_FAILED', 'Impossible de récupérer auth_user_id', 500)
    }
  }
  // Suppress unused
  void existingUser

  // 2. Upsert recipients
  let recipient
  if (body.recipient_id) {
    const { data: existing, error: e } = await admin
      .from('recipients').select('*').eq('id', body.recipient_id).maybeSingle()
    if (e) return fail('DB_ERROR', e.message, 500)
    if (!existing) return fail('NOT_FOUND', 'Destinataire introuvable', 404)
    if (!isStaffAdmin && existing.company_id !== callerRcpt!.company_id) {
      return fail('FORBIDDEN', 'Hors entreprise', 403)
    }
    const { data: updated, error: uErr } = await admin
      .from('recipients')
      .update({
        name,
        phone: body.phone ?? null,
        role,
        restrict_to_devices: body.restrict_to_devices ?? null,
        shared_devices: body.shared_devices ?? null,
      })
      .eq('id', existing.id)
      .select('*')
      .single()
    if (uErr) return fail('DB_ERROR', uErr.message, 500)
    recipient = updated
  } else {
    const { data: created, error: insErr } = await admin
      .from('recipients')
      .insert({
        company_id: targetCompanyId,
        auth_user_id: authUserId,
        name,
        contact_email: email,
        phone: body.phone ?? null,
        role,
        restrict_to_devices: body.restrict_to_devices ?? null,
        shared_devices: body.shared_devices ?? null,
      })
      .select('*')
      .single()
    if (insErr) {
      const code = insErr.code === '23P01' || insErr.code === '23505' ? 'EMAIL_DUPLICATE' : 'DB_ERROR'
      const status = code === 'EMAIL_DUPLICATE' ? 409 : 500
      return fail(code, insErr.message, status)
    }
    recipient = created
  }

  return ok({ recipient, invited })
})

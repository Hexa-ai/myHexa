// Edge Function: delete-recipient
// Contract:
//   POST /functions/v1/delete-recipient
//   Headers: Authorization: Bearer <admin or staff JWT>
//   Body: { recipient_id: string }
//
// Deletes a recipient row. If the recipient was a member (auth_user_id set)
// and no other recipient row references that auth user, also deletes the
// auth.users entry — preventing orphaned auth accounts that block re-invite.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { ok, fail, preflight } from '../_shared/response.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
})

interface DeleteBody {
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

  const body = (await req.json().catch(() => null)) as DeleteBody | null
  if (!body?.recipient_id) return fail('BAD_REQUEST', 'recipient_id requis', 400)

  const { data: target, error: tErr } = await admin
    .from('recipients')
    .select('id, company_id, auth_user_id, contact_email, shared_devices')
    .eq('id', body.recipient_id)
    .maybeSingle()
  if (tErr) return fail('DB_ERROR', tErr.message, 500)
  if (!target) return fail('NOT_FOUND', 'Destinataire introuvable', 404)

  // Authorization :
  //   - staff Hexa : tout supprimer
  //   - admin compagnie : peut supprimer un destinataire de SA compagnie,
  //     OU "retirer ses partages" d'un externe (company_id = null) — auquel
  //     cas on filtre shared_devices au lieu de delete. Si shared_devices
  //     devient vide après ce filtrage, on supprime quand même la ligne
  //     (plus personne ne lui partage rien).
  const { data: caller, error: cErr } = await admin
    .from('recipients')
    .select('company_id, role')
    .eq('auth_user_id', userData.user.id)
    .maybeSingle()
  if (cErr) return fail('DB_ERROR', cErr.message, 500)
  const { data: staff } = await admin.rpc('is_hexa_staff')
  const isStaff = staff === true
  const callerIsCompanyAdmin = !!caller && caller.role === 'admin'

  let mode: 'delete' | 'unshare' = 'delete'
  if (isStaff) {
    mode = 'delete'
  } else if (callerIsCompanyAdmin && caller!.company_id === target.company_id) {
    mode = 'delete'
  } else if (callerIsCompanyAdmin && target.company_id === null && caller!.company_id) {
    mode = 'unshare'
  } else {
    return fail('FORBIDDEN', 'Action non autorisée', 403)
  }

  if (mode === 'unshare') {
    // Retire de target.shared_devices les devices de la compagnie du caller.
    const { data: callerDevs, error: cdErr } = await admin
      .from('devices')
      .select('id')
      .eq('company_id', caller!.company_id!)
    if (cdErr) return fail('DB_ERROR', cdErr.message, 500)
    const callerDevSet = new Set((callerDevs ?? []).map((d) => d.id))
    const remaining = (target.shared_devices ?? []).filter((id) => !callerDevSet.has(id))

    if (remaining.length > 0) {
      const { error: uErr } = await admin
        .from('recipients')
        .update({ shared_devices: remaining })
        .eq('id', target.id)
      if (uErr) return fail('DB_ERROR', uErr.message, 500)
      return ok({ recipient_id: target.id, auth_user_deleted: false, mode: 'unshared' })
    }
    // remaining.length === 0 → fall through to delete
  }

  const { error: delErr } = await admin
    .from('recipients')
    .delete()
    .eq('id', target.id)
  if (delErr) return fail('DB_ERROR', delErr.message, 500)

  let authUserDeleted = false
  if (target.auth_user_id) {
    const { count, error: cntErr } = await admin
      .from('recipients')
      .select('id', { count: 'exact', head: true })
      .eq('auth_user_id', target.auth_user_id)
    if (cntErr) {
      console.error('[delete-recipient] count check failed', cntErr)
    } else if ((count ?? 0) === 0) {
      const { error: duErr } = await admin.auth.admin.deleteUser(target.auth_user_id)
      if (duErr) {
        console.error('[delete-recipient] auth.deleteUser failed', duErr)
      } else {
        authUserDeleted = true
      }
    }
  }

  return ok({ recipient_id: target.id, auth_user_deleted: authUserDeleted, mode: 'deleted' })
})

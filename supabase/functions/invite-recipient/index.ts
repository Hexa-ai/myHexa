// Edge Function: invite-recipient
// Contract:
//   POST /functions/v1/invite-recipient
//   Headers: Authorization: Bearer <admin JWT>
//   Body: {
//     name: string,
//     contact_email: string,
//     phone?: string,
//     role: 'admin' | 'viewer',
//     type: 'member' | 'external',
//     allowed_device_ids?: string[] | null,
//     recipient_id?: string  // present = promote existing external → member
//   }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { ok, fail, preflight } from '../_shared/response.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const APP_URL = Deno.env.get('APP_URL') ?? 'https://app.hexa-ai.fr'

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
})

interface InviteBody {
  name?: string
  contact_email?: string
  phone?: string | null
  role?: 'admin' | 'viewer'
  type?: 'member' | 'external'
  allowed_device_ids?: string[] | null
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

  const { data: callerRcpt, error: callerErr } = await admin
    .from('recipients')
    .select('id, company_id, role')
    .eq('auth_user_id', userData.user.id)
    .maybeSingle()
  if (callerErr) return fail('DB_ERROR', callerErr.message, 500)
  if (!callerRcpt) return fail('FORBIDDEN', 'Destinataire introuvable', 403)
  if (callerRcpt.role !== 'admin') return fail('FORBIDDEN', 'Réservé aux admins', 403)

  const body = (await req.json().catch(() => null)) as InviteBody | null
  if (!body) return fail('BAD_REQUEST', 'Body JSON requis', 400)

  const email = (body.contact_email ?? '').trim().toLowerCase()
  const name = (body.name ?? '').trim()
  const role = body.role
  const type = body.type
  if (!name) return fail('INVALID_NAME', 'Nom requis', 400)
  if (!email.includes('@')) return fail('INVALID_EMAIL', 'Email invalide', 400)
  if (role !== 'admin' && role !== 'viewer') return fail('INVALID_ROLE', 'Rôle invalide', 400)
  if (type !== 'member' && type !== 'external') return fail('INVALID_TYPE', 'Type invalide', 400)

  let recipient
  if (body.recipient_id) {
    const { data: existing, error: e } = await admin
      .from('recipients')
      .select('*')
      .eq('id', body.recipient_id)
      .maybeSingle()
    if (e) return fail('DB_ERROR', e.message, 500)
    if (!existing) return fail('NOT_FOUND', 'Destinataire introuvable', 404)
    if (existing.company_id !== callerRcpt.company_id) return fail('FORBIDDEN', 'Hors entreprise', 403)
    recipient = existing
  } else {
    const { data: created, error: insErr } = await admin
      .from('recipients')
      .insert({
        company_id: callerRcpt.company_id,
        name,
        contact_email: email,
        phone: body.phone ?? null,
        role,
        allowed_device_ids: body.allowed_device_ids ?? null,
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

  let invited = false
  if (type === 'member') {
    const { error: invErr } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${APP_URL}/login`,
    })
    if (invErr) {
      console.error('[invite-recipient] invite failed', invErr)
      return fail('INVITE_FAILED', invErr.message, 500)
    }
    invited = true
  }

  return ok({ recipient, invited })
})

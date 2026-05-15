// Edge Function: recover-link
// Contract (compat with n8n workflow HCXdZ8tnbQ2bDH09):
//   POST /functions/v1/recover-link  { email, from_url? }
//
// During the n8n→Vue double-run, this function delegates the token generation
// and email sending to the existing n8n webhook (Token Recovery). When the n8n
// workflow is retired, swap the delegation block for direct SMTP/Resend logic.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { ok, fail, preflight } from '../_shared/response.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
)

const N8N_WEBHOOK =
  Deno.env.get('N8N_TOKEN_RECOVERY_WEBHOOK') ??
  'https://srv1375596.hstgr.cloud/webhook/recover-link'

Deno.serve(async (req) => {
  const pf = preflight(req)
  if (pf) return pf

  if (req.method !== 'POST') {
    return fail('METHOD_NOT_ALLOWED', 'Méthode non supportée', 405)
  }

  const body = await req.json().catch(() => null)
  const email = body?.email as string | undefined
  const fromUrl = body?.from_url as string | undefined

  if (!email || !email.includes('@')) {
    return fail('INVALID_EMAIL', 'Email invalide', 400)
  }

  // Lookup recipient (case-insensitive). We do not leak existence: always reply ok.
  const { data: recipient, error } = await supabase
    .from('recipients')
    .select('id')
    .ilike('contact_email', email)
    .maybeSingle()

  if (error) return fail('DB_ERROR', error.message, 500)
  if (!recipient) return ok({ sent: true })

  // Delegate to n8n during double-run (fire-and-forget but await for error visibility)
  try {
    const r = await fetch(N8N_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, from_url: fromUrl ?? '' }),
    })
    if (!r.ok) {
      console.error('[recover-link] n8n delegation failed', r.status, await r.text())
    }
  } catch (e) {
    console.error('[recover-link] n8n fetch threw', e)
  }

  return ok({ sent: true })
})

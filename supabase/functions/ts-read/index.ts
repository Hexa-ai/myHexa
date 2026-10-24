// Edge Function: ts-read (PROTOTYPE, myHexa-test)
// Lit l'historique d'une box dans les fichiers Parquet, pour le portail.
//   POST { device, vars: string[], from: ms, to: ms }   (JWT utilisateur)
// Niveau choisi selon la plage, pour lire peu de fichiers :
//   ≤ 2 j    -> brut       (1 fichier par jour)
//   ≤ 21 j   -> agrégat 1 min (1 fichier par semaine)
//   ≤ 186 j  -> agrégat 1 h   (1 fichier par mois)
//   au-delà  -> agrégat 1 jour (1 fichier par an)
// Seules les variables demandées sont lues (row group par variable, requêtes HTTP Range sur URL signée).
// Puis réduction à ≤ MAX_POINTS cases par courbe (moyenne + min/max conservés).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { DAY, readSeries } from '../_shared/tsread.ts'
import { ok, fail, preflight } from '../_shared/response.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })
Deno.serve(async (req) => {
  const pf = preflight(req)
  if (pf) return pf
  if (req.method !== 'POST') return fail('METHOD_NOT_ALLOWED', 'Méthode non supportée', 405)
  const auth = req.headers.get('Authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return fail('UNAUTHORIZED', 'Connexion requise', 401)
  const user = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: auth } },
  })
  const t0 = Date.now()
  const body = (await req.json().catch(() => ({}))) as {
    device?: string
    vars?: string[]
    from?: number
    to?: number
    level?: string
    tz?: string
  }
  const { device } = body
  const from = Number(body.from)
  const to = Number(body.to)
  const vars = Array.isArray(body.vars) ? body.vars.filter((v) => typeof v === 'string').slice(0, 200) : []
  if (!device || !vars.length || !(to > from) || to - from > 5 * 366 * DAY) return fail('BAD_REQUEST', 'Paramètres invalides', 400)

  // droits : le catalogue renvoie null si la box n'est pas visible pour cet utilisateur
  const { data: catalog, error: ce } = await user.rpc('ts_catalog', { p_device: device })
  if (ce) return fail('UNAUTHORIZED', ce.message, 401)
  if (catalog === null) return fail('FORBIDDEN', 'Box non accessible', 403)
  const meta = new Map<string, { unit: string | null; category: string | null; description: string | null }>(
    (catalog as { var: string; unit: string | null; category: string | null; description: string | null }[]).map((c) => [c.var, c]),
  )

  try {
    const r = await readSeries(user, admin, device, vars, from, to, meta, { level: body.level, tz: body.tz })
    return ok({ ...r, ms: Date.now() - t0 })
  } catch (e) {
    return fail('ERROR', (e as Error).message, 500)
  }
})

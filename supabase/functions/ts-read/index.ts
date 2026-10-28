// Edge Function: ts-read (PROTOTYPE, myHexa-test)
// Lit l'historique d'une box dans les fichiers Parquet, pour le portail.
//   POST { device, vars: string[], from: ms, to: ms }   (JWT utilisateur)
// Niveau choisi selon la plage, pour lire peu de fichiers :
//   ≤ 2 j    -> brut       (1 fichier par jour)
//   ≤ 21 j   -> agrégat 1 min (1 fichier par semaine)
//   ≤ 186 j  -> agrégat 1 h   (1 fichier par mois)
//   au-delà  -> agrégat 1 jour (1 fichier par an)
//   + dashboard?: uuid  -> lecture au titre d'un TABLEAU PARTAGÉ (destinataire sans accès à la box) :
//     droits = dashboard_read_grant (box du tableau, variables / alarmes de ses blocs uniquement)
//   POST { mode: 'alarms', devices: string[], from, to, names?, severities?, limit? }
//     -> historique des alarmes (événements des rapports journaliers, fichiers events/) :
//        occurrences (début, fin, durée dans la plage, en cours), statistiques par alarme, totaux par gravité,
//        et la liste des alarmes connues (nom, gravité, description) pour les filtres.
// Seules les variables demandées sont lues (row group par variable, requêtes HTTP Range sur URL signée).
// Puis réduction à ≤ MAX_POINTS cases par courbe (moyenne + min/max conservés).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { DAY, readSeries } from '../_shared/tsread.ts'
import { loadEvents, occurrences, stats, type Filter, type Occurrence, type Severity } from '../_shared/alarms.ts'
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
    mode?: string
    devices?: string[]
    names?: string[]
    severities?: string[]
    limit?: number
    device?: string
    vars?: string[]
    from?: number
    to?: number
    level?: string
    tz?: string
    dashboard?: string
  }
  const { device } = body
  const from = Number(body.from)
  const to = Number(body.to)
  const dash = typeof body.dashboard === 'string' && UUID.test(body.dashboard) ? body.dashboard : null
  if (body.dashboard != null && !dash) return fail('BAD_REQUEST', 'Paramètres invalides', 400)
  if (body.mode === 'alarms') return alarms(user, body, from, to, t0, dash)
  let vars = Array.isArray(body.vars) ? body.vars.filter((v) => typeof v === 'string').slice(0, 200) : []
  if (!device || !vars.length || !(to > from) || to - from > 5 * 366 * DAY) return fail('BAD_REQUEST', 'Paramètres invalides', 400)

  if (dash) {
    // tableau partagé : seules les variables des blocs du tableau, pour une box du tableau
    const g = await grant(user, dash, device)
    if (g instanceof Response) return g
    const allowed = new Set(g.vars)
    vars = vars.filter((v) => allowed.has(v))
    if (!vars.length) return fail('FORBIDDEN', 'Variable non partagée', 403)
    const meta = new Map(g.catalog.map((c) => [c.var, c]))
    try {
      // droits vérifiés ci-dessus : lecture des fichiers avec le rôle service, limitée à `vars`
      const r = await readSeries(admin, admin, device, vars, from, to, meta, { level: body.level, tz: body.tz })
      return ok({ ...r, ms: Date.now() - t0 })
    } catch (e) {
      return fail('ERROR', (e as Error).message, 500)
    }
  }

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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
interface Grant {
  vars: string[]
  catalog: { var: string; unit: string | null; category: string | null; description: string | null }[]
  alarms: boolean
  alarm_names: string[] | null
}
/** droits d'un destinataire de tableau partagé sur une box (null côté base = aucun droit -> 403) */
async function grant(user: any, dash: string, device: string): Promise<Grant | Response> {
  if (!UUID.test(device)) return fail('BAD_REQUEST', 'Paramètres invalides', 400)
  const { data, error } = await user.rpc('dashboard_read_grant', { p_dashboard: dash, p_device: device })
  if (error) return fail('UNAUTHORIZED', error.message, 401)
  if (!data) return fail('FORBIDDEN', 'Tableau non partagé', 403)
  return data as Grant
}

const SEVS: Severity[] = ['error', 'warning', 'info']
async function alarms(user: any, body: any, from: number, to: number, t0: number, dash: string | null) {
  const devices = Array.isArray(body.devices) ? [...new Set(body.devices.filter((d: unknown) => typeof d === 'string'))].slice(0, 100) as string[] : []
  if (!devices.length || !(to > from) || to - from > 5 * 366 * DAY) return fail('BAD_REQUEST', 'Paramètres invalides', 400)
  const f: Filter = {
    names: Array.isArray(body.names) ? body.names.filter((x: unknown) => typeof x === 'string') : null,
    severities: Array.isArray(body.severities) ? body.severities.filter((x: Severity) => SEVS.includes(x)) : null,
  }
  const limit = Math.min(Math.max(Number(body.limit) || 500, 1), 5000)
  try {
    const occ: Occurrence[] = []
    const names = new Map<string, { name: string; severity: Severity; description: string; devices: string[] }>()
    for (const d of devices) {
      let evs: Awaited<ReturnType<typeof loadEvents>>
      let df: Filter = f
      if (dash) {
        // tableau partagé : la box doit porter un bloc alarmes du tableau ; noms limités à ceux du bloc
        const g = await grant(user, dash, d)
        if (g instanceof Response) return g
        if (!g.alarms) return fail('FORBIDDEN', 'Alarmes non partagées', 403)
        if (g.alarm_names) {
          const allowed = new Set(g.alarm_names)
          df = { ...f, names: (f.names ?? g.alarm_names).filter((n) => allowed.has(n)) }
        }
        evs = (await loadEvents(admin, admin, d, from, to)).filter((e) => !g.alarm_names || g.alarm_names.includes(e.name))
      } else {
        // droits : même contrôle que les courbes (null = box non visible pour cet utilisateur)
        const { data: cat, error: ce } = await user.rpc('ts_catalog', { p_device: d })
        if (ce) return fail('UNAUTHORIZED', ce.message, 401)
        if (cat === null) return fail('FORBIDDEN', 'Box non accessible', 403)
        evs = await loadEvents(user, admin, d, from, to)
      }
      for (const e of evs) {
        const n = names.get(e.name) ?? names.set(e.name, { name: e.name, severity: e.severity, description: e.description, devices: [] }).get(e.name)!
        if (!n.devices.includes(d)) n.devices.push(d)
      }
      occ.push(...occurrences(d, evs, from, to, df))
    }
    occ.sort((a, b) => b.start - a.start)
    const st = stats(occ, from, to)
    return ok({
      occurrences: occ.slice(0, limit),
      total: occ.length,
      stats: st.rows,
      totals: st.totals,
      names: [...names.values()].sort((a, b) => a.name.localeCompare(b.name)),
      ms: Date.now() - t0,
    })
  } catch (e) {
    return fail('ERROR', (e as Error).message, 500)
  }
}

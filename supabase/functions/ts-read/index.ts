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
import { aggregate, bestCurve, readVars, SRC, type TsRow } from '../_shared/tsparquet.ts'
import { ok, fail, preflight } from '../_shared/response.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })
const DAY = 86400e3
const MAX_POINTS = 1500
const NICE = [60, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400, 172800, 604800].map((s) => s * 1000)
const SRC_NAME: Record<number, string> = {
  [SRC.REPORT]: 'rapport',
  [SRC.WEEKLY]: 'rapport hebdo',
  [SRC.STATUS]: 'statut 30 min',
  [SRC.STATS]: 'stats du jour',
}

function pickLevel(span: number): 'raw' | '1m' | '1h' | '1d' {
  return span <= 2 * DAY ? 'raw' : span <= 21 * DAY ? '1m' : span <= 186 * DAY ? '1h' : '1d'
}
const LEVEL_MS: Record<string, number> = { raw: 0, '1m': 60e3, '1h': 3600e3, '1d': DAY }

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
  const body = (await req.json().catch(() => ({}))) as { device?: string; vars?: string[]; from?: number; to?: number; level?: string }
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
  const counters = new Set([...meta].filter(([, m]) => m.category === 'counter').map(([k]) => k))

  const level = (['raw', '1m', '1h', '1d'].includes(body.level ?? '') ? body.level : pickLevel(to - from)) as string
  const { data: files, error: fe } = await user
    .from('ts_files')
    .select('path, bytes, t_from, t_to')
    .eq('device_id', device)
    .eq('level', level)
    .lte('t_from', new Date(to).toISOString())
    .gte('t_to', new Date(from).toISOString())
    .order('t_from')
    .limit(400)
  if (fe) return fail('ERROR', fe.message, 500)

  let rows: TsRow[] = []
  if (files?.length) {
    const { data: signed, error: se } = await admin.storage.from('ts-archive').createSignedUrls(
      files.map((f) => f.path),
      120,
    )
    if (se) return fail('ERROR', se.message, 500)
    const parts = await Promise.all(
      files.map(async (f: { path: string; bytes: number }, i: number) => {
        const url = signed?.[i]?.signedUrl
        if (!url) return [] as TsRow[]
        const day = await readVars(url, f.bytes, vars)
        if (level !== 'raw') return day
        // brut (1 fichier = 1 jour) : meilleure source par variable ; sans courbe, les stats du jour
        const { curve, stats } = bestCurve(day)
        return [...curve, ...stats.filter((s) => !curve.some((c) => c.var === s.var))]
      }),
    )
    for (const p of parts) rows = rows.concat(p)
  }
  const tRead = Date.now() - t0
  rows = rows.filter((r) => r.ts >= from - LEVEL_MS[level] && r.ts <= to)

  // réduction à ≤ MAX_POINTS cases par variable
  const span = to - from
  const bucket = NICE.find((b) => b >= Math.max(LEVEL_MS[level], span / MAX_POINTS)) ?? NICE[NICE.length - 1]
  const perVar = new Map<string, TsRow[]>()
  for (const r of rows) {
    if (!perVar.has(r.var)) perVar.set(r.var, [])
    perVar.get(r.var)!.push(r)
  }
  const series = vars
    .filter((v) => perVar.has(v))
    .map((v) => {
      let pts = perVar.get(v)!
      const sources = [...new Set(pts.map((p) => SRC_NAME[p.src] ?? String(p.src)))]
      if (pts.length > MAX_POINTS || (level !== 'raw' && bucket > LEVEL_MS[level])) {
        // origine alignée sur l'heure locale approximative (minuit UTC suffit pour le proto)
        pts = aggregate(pts, bucket, counters)
      }
      pts.sort((a, b) => a.ts - b.ts)
      const m = meta.get(v)
      return {
        var: v,
        unit: m?.unit ?? null,
        category: m?.category ?? null,
        description: m?.description ?? null,
        sources,
        points: pts.map((p) => [p.ts, p.v, p.vmin ?? p.v, p.vmax ?? p.v]),
      }
    })
  return ok({
    level,
    bucket_s: level === 'raw' && !series.some((s) => s.points.length >= MAX_POINTS) ? 0 : bucket / 1000,
    files: files?.length ?? 0,
    bytes_files: (files ?? []).reduce((n: number, f: { bytes: number }) => n + f.bytes, 0),
    ms_read: tRead,
    ms: Date.now() - t0,
    series,
  })
})

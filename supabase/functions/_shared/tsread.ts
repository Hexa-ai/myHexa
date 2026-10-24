// Lecture de l'historique Parquet (partagée par ts-read et report-run).
// `db` : client utilisateur (RLS sur ts_files) ou client service ; `storage` : client service (URL signées).
// deno-lint-ignore-file no-explicit-any
import { aggregate, bestCurve, readVars, SRC, zonedMidnight, type TsRow } from './tsparquet.ts'

export const DAY = 86400e3
export const MAX_POINTS = 1500
const NICE = [60, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400, 172800, 604800].map((s) => s * 1000)
const SRC_NAME: Record<number, string> = {
  [SRC.REPORT]: 'rapport',
  [SRC.WEEKLY]: 'rapport hebdo',
  [SRC.STATUS]: 'statut 30 min',
  [SRC.DERIVED]: 'calculé',
  [SRC.STATS]: 'stats du jour',
}
export function pickLevel(span: number): 'raw' | '1m' | '1h' | '1d' {
  return span <= 2 * DAY ? 'raw' : span <= 21 * DAY ? '1m' : span <= 186 * DAY ? '1h' : '1d'
}
const LEVEL_MS: Record<string, number> = { raw: 0, '1m': 60e3, '1h': 3600e3, '1d': DAY }

export interface VarMeta {
  unit: string | null
  category: string | null
  description: string | null
}
export interface Series {
  var: string
  unit: string | null
  category: string | null
  description: string | null
  sources: string[]
  points: [number, number | null, number | null, number | null][]
}
export interface ReadResult {
  level: string
  bucket_s: number
  files: number
  bytes_files: number
  ms_read: number
  series: Series[]
}

export async function readSeries(
  db: any,
  storage: any,
  device: string,
  vars: string[],
  from: number,
  to: number,
  meta: Map<string, VarMeta>,
  opts: { level?: string; tz?: string } = {},
): Promise<ReadResult> {
  const t0 = Date.now()
  const counters = new Set([...meta].filter(([, m]) => m.category === 'counter').map(([k]) => k))
  const level = (['raw', '1m', '1h', '1d'].includes(opts.level ?? '') ? opts.level : pickLevel(to - from)) as string
  const { data: files, error: fe } = await db
    .from('ts_files')
    .select('path, bytes, t_from, t_to')
    .eq('device_id', device)
    .eq('level', level)
    .lte('t_from', new Date(to).toISOString())
    .gte('t_to', new Date(from).toISOString())
    .order('t_from')
    .limit(400)
  if (fe) throw new Error(fe.message)

  let rows: TsRow[] = []
  if (files?.length) {
    const { data: signed, error: se } = await storage.storage.from('ts-archive').createSignedUrls(
      files.map((f) => f.path),
      120,
    )
    if (se) throw new Error(se.message)
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
  let origin = 0
  try {
    // minuit local du lundi précédant `from` (décalage horaire de ce jour-là) : jours et semaines calés localement
    const d = new Date(from)
    const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7)))
    origin = zonedMidnight(monday.toISOString().slice(0, 10), opts.tz || 'Europe/Paris')
  } catch {
    origin = 0
  }
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
      if (counters.has(v)) {
        // compteurs / volumes : total par heure (≤ 3 j), par jour (≤ 4 mois), sinon par semaine, cases calées sur minuit local
        const cb = span <= 3 * DAY ? 3600e3 : span <= 124 * DAY ? DAY : 7 * DAY
        pts = aggregate(pts, Math.max(cb, LEVEL_MS[level]), counters, origin)
      } else if (pts.length > MAX_POINTS || (level !== 'raw' && bucket > LEVEL_MS[level])) {
        pts = aggregate(pts, bucket, counters, bucket >= DAY ? origin : 0)
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
  return {
    level,
    bucket_s: level === 'raw' && !series.some((s) => s.points.length >= MAX_POINTS) ? 0 : bucket / 1000,
    files: files?.length ?? 0,
    bytes_files: (files ?? []).reduce((n: number, f: { bytes: number }) => n + f.bytes, 0),
    ms_read: tRead,
    series: series as Series[],
  }
}

// Edge Function: ts-build (PROTOTYPE, myHexa-test)
// Construit l'historique Parquet des jours marqués dans ts_dirty :
//   1. brut du jour  raw/.../YYYY-MM-DD.parquet  = rapport journalier (courbes 5 min, compteurs horaires, changements
//      d'état, stats min/moy/max de toutes les favorites) + rapport hebdo (horaire) + statuts 30 min du tampon.
//      Fusion avec le fichier existant : une source présente remplace la même source, les autres sont conservées
//      (un rapport purgé de la base reste dans le Parquet).
//   2. agrégats du jour fusionnés dans : agg/1m (semaine ISO), agg/1h (mois), agg/1d (année).
// Appelée par pg_net à l'arrivée d'un rapport journalier ({device}) et par le cron horaire. Protégée par x-cron-secret.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { aggregate, bestCurve, isoWeek, readAll, SRC, writeTs, zonedMidnight, type TsRow } from '../_shared/tsparquet.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? ''
const BUCKET = 'ts-archive'
const DAY = 86400e3
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

type Json = Record<string, unknown>
interface VarMeta {
  category: string
  unit: string | null
  description: string | null
  res: number
}

const num = (x: unknown): number | null => {
  if (typeof x === 'number' && Number.isFinite(x)) return x
  if (typeof x === 'boolean') return x ? 1 : 0
  if (typeof x === 'string' && /^\s*-?\d+(\.\d+)?([eE][-+]?\d+)?\s*$/.test(x)) return Number(x)
  return null
}

async function download(path: string): Promise<ArrayBuffer | null> {
  const { data, error } = await admin.storage.from(BUCKET).download(path)
  if (error || !data) return null
  return await data.arrayBuffer()
}
async function upload(path: string, bytes: Uint8Array) {
  const { error } = await admin.storage
    .from(BUCKET)
    .upload(path, new Blob([bytes as BlobPart], { type: 'application/vnd.apache.parquet' }), { upsert: true })
  if (error) throw new Error(`upload ${path}: ${error.message}`)
}
async function index(device: string, level: string, period: string, path: string, rows: TsRow[], bytes: number) {
  const ts = rows.map((r) => r.ts)
  const { error } = await admin.from('ts_files').upsert({
    device_id: device,
    level,
    period,
    path,
    t_from: new Date(Math.min(...ts)).toISOString(),
    t_to: new Date(Math.max(...ts) + (rows[0]?.res ?? 0) * 1000).toISOString(),
    rows: rows.length,
    bytes,
    updated_at: new Date().toISOString(),
  })
  if (error) throw new Error(error.message)
}

/** Lignes issues d'un rapport journalier. */
function fromDaily(payload: Json, dayStart: number, meta: Map<string, VarMeta>): TsRow[] {
  const out: TsRow[] = []
  const vars = Array.isArray(payload.variables) ? (payload.variables as Json[]) : []
  for (const v of vars) {
    const name = typeof v.name === 'string' ? v.name : null
    const chart = (v.chart ?? {}) as Json
    const cat = String(v.category ?? 'measure').toLowerCase()
    if (!name || cat === 'position' || chart.type === 'map' || chart.type === 'text') continue
    const pts = Array.isArray(chart.points) ? (chart.points as Json[]) : []
    const stats = (v.stats ?? {}) as Json
    let res = 86400
    // courbe : 288 pts = 5 min ; barres compteur = 1 h ; step = changements d'état
    if (pts.length) {
      const step = pts.length > 1 ? Math.round((Number(pts[1].ts) - Number(pts[0].ts)) / 1000) : 0
      res = chart.type === 'step' ? 0 : step
      for (const p of pts) {
        const val = num(p.value)
        if (val === null || !Number.isFinite(Number(p.ts))) continue
        out.push({ ts: Number(p.ts), var: name, v: val, vmin: null, vmax: null, n: 1, res, src: SRC.REPORT })
      }
    }
    const mean = num(stats.mean) ?? num(stats.last)
    if (mean !== null || num(stats.max) !== null) {
      out.push({
        ts: dayStart,
        var: name,
        v: mean,
        vmin: num(stats.min),
        vmax: num(stats.max),
        n: Number(stats.count) || 1,
        res: 86400,
        src: SRC.STATS,
      })
    }
    const prev = meta.get(name)
    meta.set(name, {
      category: cat,
      unit: (v.unit as string) || prev?.unit || null,
      description: (v.description as string) || prev?.description || null,
      res: Math.min(prev?.res ?? 86400, res || 300),
    })
  }
  return out
}

/** Lignes du jour issues d'un rapport hebdo (courbes horaires, compteurs journaliers). */
function fromWeekly(payload: Json, dayStart: number, meta: Map<string, VarMeta>): TsRow[] {
  const out: TsRow[] = []
  const vars = Array.isArray(payload.variables) ? (payload.variables as Json[]) : []
  for (const v of vars) {
    const name = typeof v.name === 'string' ? v.name : null
    const chart = (v.chart ?? {}) as Json
    const cat = String(v.category ?? 'measure').toLowerCase()
    if (!name || cat === 'position') continue
    const pts = Array.isArray(chart.points) ? (chart.points as Json[]) : []
    for (const p of pts) {
      const t = Number(p.ts)
      const val = num(p.value)
      if (val === null || t < dayStart || t >= dayStart + DAY) continue
      const daily = chart.type === 'bar' && pts.length <= 7
      out.push({ ts: t, var: name, v: val, vmin: null, vmax: null, n: 1, res: daily ? 86400 : 3600, src: daily ? SRC.STATS : SRC.WEEKLY })
    }
    if (!meta.has(name)) meta.set(name, { category: cat, unit: (v.unit as string) || null, description: (v.description as string) || null, res: 3600 })
  }
  return out
}

/** Remplace dans `old` les (variable, source) présents dans `fresh`. */
function mergeSources(old: TsRow[], fresh: TsRow[]): TsRow[] {
  const keys = new Set(fresh.map((r) => r.var + '|' + r.src))
  return [...old.filter((r) => !keys.has(r.var + '|' + r.src)), ...fresh]
}
/** Remplace dans un fichier d'agrégat la tranche [from, to). */
function mergeRange(old: TsRow[], fresh: TsRow[], from: number, to: number): TsRow[] {
  return [...old.filter((r) => r.ts < from || r.ts >= to), ...fresh]
}

async function buildDay(device: string, company: string, day: string) {
  const [y, m] = day.split('-')
  const base = `company=${company}/device=${device}`
  const meta = new Map<string, VarMeta>()

  // fuseau : celui du dernier rapport journalier, sinon du statut, sinon Paris
  const { data: reps } = await admin
    .from('reports')
    .select('type, period_start, period_end, received_at, payload')
    .eq('device_id', device)
    .in('type', ['daily', 'weekly'])
    .lte('period_start', day)
    .gt('period_end', day)
    .order('received_at', { ascending: false })
  const daily = (reps ?? []).find((r) => r.type === 'daily' && r.period_start === day)
  const weekly = (reps ?? []).filter((r) => r.type === 'weekly')
  let dayStart: number
  const tr = (daily?.payload as Json | undefined)?.time_range as Json | undefined
  if (tr && Number(tr.start_ms)) dayStart = Number(tr.start_ms)
  else {
    const { data: st } = await admin.from('reports').select('payload').eq('device_id', device).eq('type', 'status').maybeSingle()
    const tz = (((st?.payload as Json | undefined)?.device as Json | undefined)?.timezone as string) || 'Europe/Paris'
    dayStart = zonedMidnight(day, tz)
  }

  const fresh: TsRow[] = []
  if (daily) fresh.push(...fromDaily(daily.payload as Json, dayStart, meta))
  for (const w of weekly) {
    const rows = fromWeekly(w.payload as Json, dayStart, meta)
    // une variable déjà couverte par le journalier ne prend pas l'hebdo
    fresh.push(...rows.filter((r) => !fresh.some((f) => f.var === r.var && f.src === (r.src === SRC.STATS ? SRC.STATS : SRC.REPORT))))
  }
  const { data: buf } = await admin.from('ts_buffer').select('var, ts, v').eq('device_id', device).eq('day', day).limit(50000)
  for (const b of buf ?? []) {
    fresh.push({ ts: Date.parse(b.ts as string), var: b.var as string, v: b.v as number, vmin: null, vmax: null, n: 1, res: 1800, src: SRC.STATUS })
    if (!meta.has(b.var as string)) meta.set(b.var as string, { category: '', unit: null, description: null, res: 1800 })
    else meta.get(b.var as string)!.res = Math.min(meta.get(b.var as string)!.res, 1800)
  }

  const rawPath = `raw/${base}/year=${y}/month=${m}/${day}.parquet`
  const oldRaw = await download(rawPath)
  const raw = mergeSources(oldRaw ? await readAll(oldRaw) : [], fresh)
  if (!raw.length) return { day, rows: 0 }
  const rawBytes = writeTs(raw, { level: 'raw', day })
  await upload(rawPath, rawBytes)
  await index(device, 'raw', day, rawPath, raw, rawBytes.length)

  // catégories connues (compteurs = somme)
  const { data: vrows } = await admin.from('ts_vars').select('var, category').eq('device_id', device)
  const counters = new Set<string>()
  for (const r of vrows ?? []) if (r.category === 'counter') counters.add(r.var as string)
  for (const [k, v] of meta) if (v.category === 'counter') counters.add(k)

  const { curve, stats } = bestCurve(raw)
  const dayEnd = dayStart + DAY
  const a1m = aggregate(curve, 60e3, counters)
  const a1h = aggregate(curve, 3600e3, counters)
  // 1 jour : stats du rapport (calculées sur le brut de la box) si présentes, sinon agrégat de la courbe ;
  // compteur : total calculé si on a la courbe
  const fromCurve = aggregate(curve, DAY, counters, dayStart)
  const a1d = [
    ...fromCurve.filter((r) => counters.has(r.var) || !stats.some((s) => s.var === r.var)),
    ...stats.filter((s) => !(counters.has(s.var) && fromCurve.some((r) => r.var === s.var))).map((s) => ({ ...s, ts: dayStart })),
  ]

  const wk = isoWeek(day)
  const levels: [string, string, string, TsRow[]][] = [
    ['1m', wk.key, `agg/1m/${base}/year=${wk.key.slice(0, 4)}/${wk.key}.parquet`, a1m],
    ['1h', `${y}-${m}`, `agg/1h/${base}/year=${y}/${y}-${m}.parquet`, a1h],
    ['1d', y, `agg/1d/${base}/${y}.parquet`, a1d],
  ]
  for (const [level, period, path, rows] of levels) {
    const old = await download(path)
    const merged = mergeRange(old ? await readAll(old) : [], rows, dayStart, dayEnd)
    if (!merged.length) continue
    const bytes = writeTs(merged, { level, period })
    await upload(path, bytes)
    await index(device, level, period, path, merged, bytes.length)
  }

  // catalogue
  const vars = [...new Set(raw.map((r) => r.var))]
  const { error } = await admin.rpc('ts_vars_touch', {
    p_device: device,
    p_day: day,
    p_vars: vars.map((v) => ({
      var: v,
      category: meta.get(v)?.category || null,
      unit: meta.get(v)?.unit ?? null,
      description: meta.get(v)?.description ?? null,
      res: Math.min(...raw.filter((r) => r.var === v && r.src !== SRC.STATS).map((r) => r.res || 300), 86400),
    })),
  })
  if (error) throw new Error(error.message)
  return { day, rows: raw.length, bytes: rawBytes.length }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })
  if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) return new Response('forbidden', { status: 403 })
  const body = (await req.json().catch(() => ({}))) as { device?: string; limit?: number }
  const limit = Math.min(Math.max(Number(body.limit) || 50, 1), 500)
  const started = Date.now()
  let q = admin.from('ts_dirty').select('device_id, day, since').order('day').limit(limit)
  if (body.device) q = q.eq('device_id', body.device)
  const { data: todo, error } = await q
  if (error) return Response.json({ error: error.message }, { status: 500 })
  const companies = new Map<string, string>()
  const done: unknown[] = []
  const failed: unknown[] = []
  for (const t of todo ?? []) {
    if (Date.now() - started > 120_000) break // le reste au prochain passage
    try {
      let c = companies.get(t.device_id)
      if (!c) {
        const { data } = await admin.from('devices').select('company_id').eq('id', t.device_id).single()
        c = data!.company_id as string
        companies.set(t.device_id, c)
      }
      done.push({ device: t.device_id, ...(await buildDay(t.device_id, c, t.day)) })
      // ne retire la marque que si elle n'a pas été renouvelée pendant la construction
      await admin.from('ts_dirty').delete().eq('device_id', t.device_id).eq('day', t.day).lte('since', t.since)
    } catch (e) {
      failed.push({ device: t.device_id, day: t.day, error: String(e) })
    }
  }
  await admin.rpc('ts_buffer_purge')
  return Response.json({ done: done.length, failed, items: done, ms: Date.now() - started })
})

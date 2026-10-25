// Edge Function: ts-build (PROTOTYPE, myHexa-test)
// Construit l'historique Parquet des jours marqués dans ts_dirty :
//   1. brut du jour  raw/.../YYYY-MM-DD.parquet  = deux sources seulement :
//        - le rapport journalier (courbes 5 min, compteurs horaires, changements d'état, stats min/moy/max) ;
//        - les statuts 30 min du tampon (toutes les variables numériques).
//      Le rapport hebdo n'est pas lu (doublon). Volumes / énergies : intégration de la courbe retenue, sans estimation.
//      Fusion avec le fichier existant : une source présente remplace la même source, les autres sont conservées
//      (un rapport purgé de la base reste dans le Parquet).
//   2. agrégats du jour fusionnés dans : agg/1m (semaine ISO), agg/1h (mois), agg/1d (année).
//   3. événements d'alarme du journalier dans events/…/YYYY-MM.parquet (le journalier remplace son jour).
//      POST {events_backfill: true, device?} : reprise unique de tous les journaliers + anciens hebdo
//      POST {rebuild_1d: true, device?} : supprime le niveau 1 j et remet tous les jours en file (passage aux journées UTC)
//      (un jour couvert par un journalier ne prend que les événements du journalier).
// Appelée par pg_net à l'arrivée d'un rapport journalier ({device}) et par le cron horaire. Protégée par x-cron-secret.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { aggregate, bestCurve, isoWeek, readAll, SRC, writeTs, zonedMidnight, type TsRow } from '../_shared/tsparquet.ts'
import { EV_SRC, eventsFromPayload, eventsPath, monthOf, readEvents, writeEvents, type AlarmEvent } from '../_shared/alarms.ts'

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
/** fichier devenu vide : supprimé du bucket et de l'index (sinon d'anciens points survivent) */
async function drop(device: string, level: string, period: string, path: string) {
  await admin.storage.from(BUCKET).remove([path])
  const { error } = await admin.from('ts_files').delete().eq('device_id', device).eq('level', level).eq('period', period)
  if (error) throw new Error('ts_files delete: ' + error.message)
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

/** Remplace dans `old` les (variable, source) présents dans `fresh`. */
function mergeSources(old: TsRow[], fresh: TsRow[]): TsRow[] {
  const keys = new Set(fresh.map((r) => r.var + '|' + r.src))
  return [...old.filter((r) => !keys.has(r.var + '|' + r.src)), ...fresh]
}
/** Remplace dans un fichier d'agrégat la tranche [from, to). */
function mergeRange(old: TsRow[], fresh: TsRow[], from: number, to: number): TsRow[] {
  return [...old.filter((r) => r.ts < from || r.ts >= to), ...fresh]
}

// ---- volumes / énergies dérivés (même règle que reports.derived_payload, migration 20260528003858) ----
const UNIT_FACTOR: Record<string, [number, string, 'flow' | 'power']> = {
  'm3/h': [1 / 3600, 'm³', 'flow'],
  'l/h': [1 / 3600, 'L', 'flow'],
  'l/min': [1 / 60, 'L', 'flow'],
  'l/s': [1, 'L', 'flow'],
  kw: [1 / 3600, 'kWh', 'power'],
  w: [1 / 3600, 'Wh', 'power'],
  kva: [1 / 3600, 'kVAh', 'power'],
}
const normUnit = (u: string | null) =>
  (u ?? '').toLowerCase().replace(/³/g, '3').replace(/\s*\/\s*/g, '/').replace(/\s+/g, '')

function derivedName(src: string, kind: 'flow' | 'power') {
  const re = kind === 'flow' ? /[_\s]*(debit|flow)[_\s]*/gi : /[_\s]*(puissance|power)[_\s]*/gi
  const base = src.replace(re, '_').replace(/^_+|_+$/g, '')
  return (kind === 'flow' ? 'Volume' : 'Energie') + '_' + (base || src)
}

/** Intègre chaque débit / puissance du jour en total horaire (trapèzes, pas de trou > max(15 min, 3 × pas médian),
 *  valeurs négatives ramenées à 0). Sans courbe exploitable : pas de volume (pas d'estimation). */
function deriveIntegrals(raw: TsRow[], meta: Map<string, VarMeta>, dayStart: number): TsRow[] {
  const out: TsRow[] = []
  const { curve } = bestCurve(raw.filter((r) => r.src !== SRC.DERIVED))
  const existing = new Set(raw.filter((r) => r.src !== SRC.DERIVED).map((r) => r.var.toLowerCase()))
  for (const [name, m] of meta) {
    const f = UNIT_FACTOR[normUnit(m.unit)]
    if (!f || m.category === 'counter') continue
    const [factor, outUnit, kind] = f
    const dn = derivedName(name, kind)
    if (existing.has(dn.toLowerCase())) continue // la box fournit déjà ce volume
    const pts = curve.filter((r) => r.var === name && r.v !== null && r.res > 0).sort((a, b) => a.ts - b.ts)
    if (pts.length >= 2) {
      const dts = pts.slice(1).map((p, i) => (p.ts - pts[i].ts) / 1000).sort((a, b) => a - b)
      const gap = Math.max(900, 3 * dts[Math.floor(dts.length / 2)])
      const hours = new Map<number, number>()
      for (let i = 1; i < pts.length; i++) {
        const dt = (pts[i].ts - pts[i - 1].ts) / 1000
        if (dt <= 0 || dt > gap) continue
        const inc = ((Math.max(pts[i - 1].v!, 0) + Math.max(pts[i].v!, 0)) / 2) * dt * factor
        const h = dayStart + Math.floor((pts[i - 1].ts - dayStart) / 3600e3) * 3600e3
        hours.set(h, (hours.get(h) ?? 0) + inc)
      }
      for (const [h, v] of hours) out.push({ ts: h, var: dn, v, vmin: null, vmax: null, n: 1, res: 3600, src: SRC.DERIVED })
      meta.set(dn, {
        category: 'counter',
        unit: outUnit,
        description: `Dérivé de '${name}' par intégration (pas ${Math.round(dts[Math.floor(dts.length / 2)] / 60)} min)`,
        res: 3600,
      })
    }
  }
  return out
}

/** analyse des dérives (analyze-report) d'une journée construite */
async function analyzeDay(reportId: string) {
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/analyze-report`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SERVICE_ROLE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ report_id: reportId }),
      signal: AbortSignal.timeout(60_000),
    })
    const j = (await r.json().catch(() => ({}))) as { data?: { inserted_count?: number } }
    return { report_id: reportId, status: r.status, inserted: j?.data?.inserted_count ?? null }
  } catch (e) {
    return { report_id: reportId, error: String(e) }
  }
}

// ---------- événements d'alarme ----------
async function putEvents(device: string, company: string, month: string, rows: AlarmEvent[], existed: boolean) {
  const path = eventsPath(company, device, month)
  if (!rows.length) {
    if (existed) await drop(device, 'events', month, path)
    return 0
  }
  const bytes = writeEvents(rows)
  await upload(path, bytes)
  const ts = rows.map((r) => r.ts)
  const { error } = await admin.from('ts_files').upsert({
    device_id: device,
    level: 'events',
    period: month,
    path,
    t_from: new Date(Math.min(...ts)).toISOString(),
    t_to: new Date(Math.max(...ts)).toISOString(),
    rows: rows.length,
    bytes: bytes.length,
    updated_at: new Date().toISOString(),
  })
  if (error) throw new Error('ts_files events: ' + error.message)
  return rows.length
}
/** le journalier du jour remplace les événements de ce jour dans le fichier du mois */
async function buildEvents(device: string, company: string, day: string, payload: Json) {
  const month = monthOf(day)
  const old = await download(eventsPath(company, device, month))
  const fresh = eventsFromPayload(payload, day, EV_SRC.DAILY)
  if (!old && !fresh.length) return 0
  const kept = old ? (await readEvents(old)).filter((e) => e.day !== day) : []
  await putEvents(device, company, month, [...kept, ...fresh], !!old)
  return fresh.length
}
async function backfillEvents(device: string, company: string) {
  const { data: reps, error } = await admin
    .from('reports')
    .select('type, period_start, ev:payload->alarm_events, tz:payload->metadata->>timezone')
    .eq('device_id', device)
    .in('type', ['daily', 'weekly'])
    .limit(5000)
  if (error) throw new Error(error.message)
  const dailyDays = new Set((reps ?? []).filter((r) => r.type === 'daily').map((r) => r.period_start as string))
  const all: AlarmEvent[] = []
  for (const r of reps ?? []) {
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: (r.tz as string) || 'Europe/Paris' })
    if (r.type === 'daily') all.push(...eventsFromPayload({ alarm_events: r.ev }, r.period_start as string, EV_SRC.DAILY))
    else all.push(...eventsFromPayload({ alarm_events: r.ev }, (ts) => fmt.format(new Date(ts)), EV_SRC.WEEKLY).filter((e) => !dailyDays.has(e.day)))
  }
  const byMonth = new Map<string, AlarmEvent[]>()
  for (const e of all) (byMonth.get(monthOf(e.day)) ?? byMonth.set(monthOf(e.day), []).get(monthOf(e.day))!).push(e)
  const { data: existing } = await admin.from('ts_files').select('period').eq('device_id', device).eq('level', 'events')
  const had = new Set((existing ?? []).map((x) => x.period as string))
  let n = 0
  for (const [month, rows] of byMonth) n += await putEvents(device, company, month, rows, had.has(month))
  for (const month of had) if (!byMonth.has(month)) await putEvents(device, company, month, [], true)
  return { device, months: byMonth.size, events: n }
}

// niveau 1 j = journées UTC pour toutes les box, quel que soit leur réglage de fuseau. Jours, semaines et mois
// dans le fuseau du lecteur (navigateur, modèle de rapport) : recalculés à la demande depuis le 1 h (ts-read).
const DAY_TZ = 'UTC'
const siteDate = (t: number) => new Date(t).toISOString().slice(0, 10)
const nextDate = (d: string) => new Date(Date.parse(d + 'T12:00:00Z') + DAY).toISOString().slice(0, 10)
/** journées UTC qui recoupent [from, to) : [date, début, fin] */
export function utcDays(from: number, to: number): [string, number, number][] {
  const out: [string, number, number][] = []
  let d = siteDate(from)
  for (let a = zonedMidnight(d, DAY_TZ); a < to; ) {
    const n = nextDate(d)
    const b = zonedMidnight(n, DAY_TZ)
    out.push([d, a, b])
    d = n
    a = b
  }
  return out
}
/** 1 j des journées UTC recoupant [from, to), recalculé depuis les fichiers 1 h (box réglée sur un autre fuseau que UTC) */
async function rebuildUtcDays(device: string, base: string, counters: Set<string>, from: number, to: number, extra: TsRow[] = []) {
  const days = utcDays(from, to)
  const lo = days[0][1]
  const hi = days[days.length - 1][2]
  // fichiers 1 h qui peuvent contenir ces heures (rangés par jour local de la box : mois voisins inclus)
  const months = new Set<string>()
  for (const t of [lo - DAY, lo, hi - 1, hi + DAY]) months.add(siteDate(t).slice(0, 7))
  const hours = new Map<string, TsRow>()
  for (const ym of months) {
    const buf = await download(`agg/1h/${base}/year=${ym.slice(0, 4)}/${ym}.parquet`)
    if (buf) for (const r of await readAll(buf)) if (r.ts >= lo && r.ts < hi) hours.set(r.var + '|' + r.ts, r)
  }
  const byYear = new Map<string, { rows: TsRow[]; lo: number; hi: number }>()
  for (const [d, a, b] of days) {
    const yr = byYear.get(d.slice(0, 4)) ?? byYear.set(d.slice(0, 4), { rows: [], lo: a, hi: b }).get(d.slice(0, 4))!
    yr.lo = Math.min(yr.lo, a)
    yr.hi = Math.max(yr.hi, b)
    yr.rows.push(...aggregate([...hours.values()].filter((r) => r.ts >= a && r.ts < b), DAY, counters, a))
    yr.rows.push(...extra.filter((r) => r.ts >= a && r.ts < b))
  }
  for (const [yy, { rows, lo: a, hi: b }] of byYear) {
    const path = `agg/1d/${base}/${yy}.parquet`
    const old = await download(path)
    if (!old && !rows.length) continue
    // garde les lignes d'autres variables déjà présentes ces jours-là (stats seules d'une journée voisine de la box),
    // si elles sont bien à minuit UTC
    const keys = new Set(rows.map((r) => r.var + '|' + r.ts))
    const prev = old ? await readAll(old) : []
    const kept = prev.filter((r) => r.ts >= a && r.ts < b && r.ts % DAY === 0 && !keys.has(r.var + '|' + r.ts))
    const merged = mergeRange(prev, [...rows, ...kept].sort((x, y) => x.ts - y.ts || (x.var < y.var ? -1 : 1)), a, b)
    if (!merged.length) {
      await drop(device, '1d', yy, path)
      continue
    }
    const bytes = writeTs(merged, { level: '1d', period: yy })
    await upload(path, bytes)
    await index(device, '1d', yy, path, merged, bytes.length)
  }
}

async function buildDay(device: string, company: string, day: string) {
  const [y, m] = day.split('-')
  const base = `company=${company}/device=${device}`
  const meta = new Map<string, VarMeta>()

  // fuseau : celui du dernier rapport journalier, sinon du statut, sinon Paris
  const { data: reps } = await admin
    .from('reports')
    .select('id, type, period_start, period_end, received_at, payload')
    .eq('device_id', device)
    .eq('type', 'daily')
    .eq('period_start', day)
    .order('received_at', { ascending: false })
  const daily = (reps ?? []).find((r) => r.type === 'daily' && r.period_start === day)
  let dayStart: number
  const tr = (daily?.payload as Json | undefined)?.time_range as Json | undefined
  if (tr && Number(tr.start_ms)) dayStart = Number(tr.start_ms)
  else {
    const { data: st } = await admin.from('reports').select('payload').eq('device_id', device).eq('type', 'status').maybeSingle()
    const tz = (((st?.payload as Json | undefined)?.device as Json | undefined)?.timezone as string) || 'Europe/Paris'
    dayStart = zonedMidnight(day, tz)
  }

  if (daily) await buildEvents(device, company, day, daily.payload as Json)
  const fresh: TsRow[] = []
  if (daily) fresh.push(...fromDaily(daily.payload as Json, dayStart, meta))
  const { data: buf } = await admin.from('ts_buffer').select('var, ts, v').eq('device_id', device).eq('day', day).limit(50000)
  for (const b of buf ?? []) {
    fresh.push({ ts: Date.parse(b.ts as string), var: b.var as string, v: b.v as number, vmin: null, vmax: null, n: 1, res: 1800, src: SRC.STATUS })
    if (!meta.has(b.var as string)) meta.set(b.var as string, { category: '', unit: null, description: null, res: 1800 })
    else meta.get(b.var as string)!.res = Math.min(meta.get(b.var as string)!.res, 1800)
  }

  const rawPath = `raw/${base}/year=${y}/month=${m}/${day}.parquet`
  const oldRaw = await download(rawPath)
  // anciens fichiers : on retire les points hebdo (source abandonnée)
  let raw = mergeSources(oldRaw ? (await readAll(oldRaw)).filter((r) => r.src !== SRC.WEEKLY) : [], fresh)
  if (!raw.length) {
    // plus rien pour ce jour (ex. ancien fichier purement hebdo) : brut et tranches d'agrégats retirés
    if (oldRaw) await drop(device, 'raw', day, rawPath)
    const wk0 = isoWeek(day)
    for (const [level, period, path] of [
      ['1m', wk0.key, `agg/1m/${base}/year=${wk0.key.slice(0, 4)}/${wk0.key}.parquet`],
      ['1h', `${y}-${m}`, `agg/1h/${base}/year=${y}/${y}-${m}.parquet`],
      ['1d', y, `agg/1d/${base}/${y}.parquet`],
    ]) {
      const old = await download(path)
      if (!old) continue
      const rows = await readAll(old)
      const kept = mergeRange(rows, [], dayStart, dayStart + DAY)
      if (kept.length === rows.length) continue
      if (!kept.length) await drop(device, level, period, path)
      else {
        const bytes = writeTs(kept, { level, period })
        await upload(path, bytes)
        await index(device, level, period, path, kept, bytes.length)
      }
    }
    return { day, rows: 0, report_id: null as string | null }
  }
  // les unités des anciennes variables viennent du catalogue
  const { data: cat } = await admin.from('ts_vars').select('var, category, unit, description').eq('device_id', device)
  for (const c of cat ?? []) {
    if (!meta.has(c.var as string) && !(c.var as string).match(/^(Volume|Energie)_/))
      meta.set(c.var as string, { category: (c.category as string) || '', unit: c.unit as string, description: c.description as string, res: 300 })
  }
  raw = [...raw.filter((r) => r.src !== SRC.DERIVED), ...deriveIntegrals(raw, meta, dayStart)]
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
  // 1 jour = journée UTC. Journalier d'une box réglée en UTC : pris tel quel (stats calculées par la box) ;
  // autre fuseau : le 1 j est recalculé depuis le 1 h pour les journées UTC touchées.
  const aligned = dayStart === zonedMidnight(day, DAY_TZ)
  const levels: [string, string, string, TsRow[]][] = [
    ['1m', wk.key, `agg/1m/${base}/year=${wk.key.slice(0, 4)}/${wk.key}.parquet`, a1m],
    ['1h', `${y}-${m}`, `agg/1h/${base}/year=${y}/${y}-${m}.parquet`, a1h],
    ...(aligned ? [['1d', y, `agg/1d/${base}/${y}.parquet`, a1d] as [string, string, string, TsRow[]]] : []),
  ]
  for (const [level, period, path, rows] of levels) {
    const old = await download(path)
    if (!old && !rows.length) continue
    const merged = mergeRange(old ? await readAll(old) : [], rows, dayStart, dayEnd)
    if (!merged.length) {
      await drop(device, level, period, path)
      continue
    }
    const bytes = writeTs(merged, { level, period })
    await upload(path, bytes)
    await index(device, level, period, path, merged, bytes.length)
  }
  if (!aligned) {
    // variables sans courbe (stats du rapport seules) : rattachées à la journée UTC la plus proche du début de la journée de la box
    const withHours = new Set(a1h.map((r) => r.var))
    const utcDay = Math.round(dayStart / DAY) * DAY
    const statOnly = a1d.filter((r) => !withHours.has(r.var)).map((r) => ({ ...r, ts: utcDay }))
    await rebuildUtcDays(device, base, counters, dayStart, dayEnd, statOnly)
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
  return { day, rows: raw.length, bytes: rawBytes.length, report_id: (daily?.id as string | undefined) ?? null }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })
  if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) return new Response('forbidden', { status: 403 })
  const body = (await req.json().catch(() => ({}))) as {
    device?: string
    limit?: number
    events_backfill?: boolean
    rebuild_1d?: boolean
    check?: boolean
  }
  if (body.rebuild_1d) {
    let q = admin.from('ts_files').select('device_id, level, period, path').in('level', ['1d', 'raw'])
    if (body.device) q = q.eq('device_id', body.device)
    const { data, error } = await q
    if (error) return Response.json({ error: error.message }, { status: 500 })
    const files = data ?? []
    for (const f of files.filter((f) => f.level === '1d')) await drop(f.device_id, '1d', f.period, f.path)
    const days = files.filter((f) => f.level === 'raw').map((f) => ({ device_id: f.device_id, day: f.period, since: new Date().toISOString() }))
    for (let i = 0; i < days.length; i += 500) {
      const { error: e } = await admin.from('ts_dirty').upsert(days.slice(i, i + 500), { onConflict: 'device_id,day' })
      if (e) return Response.json({ error: e.message }, { status: 500 })
    }
    return Response.json({ dropped_1d: files.filter((f) => f.level === '1d').length, queued_days: days.length })
  }
  if (body.check) {
    // contrôle : jours présents dans le brut mais absents d'un niveau d'agrégat (1 min, 1 h), par box
    let q = admin.from('ts_files').select('device_id, level, period, path').in('level', ['raw', '1m', '1h'])
    if (body.device) q = q.eq('device_id', body.device)
    const { data, error } = await q
    if (error) return Response.json({ error: error.message }, { status: 500 })
    const byDev = new Map<string, { raw: Set<string>; agg: Record<string, Set<string>> }>()
    for (const f of data ?? []) {
      const e = byDev.get(f.device_id) ?? { raw: new Set<string>(), agg: { '1m': new Set<string>(), '1h': new Set<string>() } }
      byDev.set(f.device_id, e)
      if (f.level === 'raw') e.raw.add(f.period as string)
      else {
        const buf = await download(f.path as string)
        if (buf) for (const r of await readAll(buf)) e.agg[f.level].add(new Date(r.ts).toISOString().slice(0, 10))
      }
    }
    const gaps = []
    for (const [dev, e] of byDev) {
      for (const lvl of ['1m', '1h']) {
        // un jour brut sans aucune ligne au niveau agrégé (on ignore aujourd'hui, en cours)
        const today = new Date().toISOString().slice(0, 10)
        const miss = [...e.raw].filter((d) => d < today && !e.agg[lvl].has(d)).sort()
        if (miss.length) gaps.push({ device: dev, level: lvl, missing: miss })
      }
    }
    return Response.json({ devices: byDev.size, gaps })
  }
  if (body.events_backfill) {
    // reprise des événements d'alarme : une box (device) ou toutes celles qui ont des rapports
    let dq = admin.from('devices').select('id, company_id').not('company_id', 'is', null)
    if (body.device) dq = dq.eq('id', body.device)
    const { data: devs, error: de } = await dq
    if (de) return Response.json({ error: de.message }, { status: 500 })
    const out = []
    for (const d of devs ?? []) {
      try {
        out.push(await backfillEvents(d.id as string, d.company_id as string))
      } catch (e) {
        out.push({ device: d.id, error: String(e) })
      }
    }
    return Response.json({ backfill: out.filter((x: any) => x.events || x.error) })
  }
  // quota CPU des Edge Functions : petits lots (≈ 8 jours-box par appel), le cron repasse toutes les 10 min
  const limit = Math.min(Math.max(Number(body.limit) || 8, 1), 20)
  const started = Date.now()
  let q = admin.from('ts_dirty').select('device_id, day, since').order('day').limit(limit)
  if (body.device) q = q.eq('device_id', body.device)
  const { data: todo, error } = await q
  if (error) return Response.json({ error: error.message }, { status: 500 })
  const companies = new Map<string, string>()
  const done: unknown[] = []
  const analyses: Promise<unknown>[] = []
  const failed: unknown[] = []
  const busy: unknown[] = []
  for (const t of todo ?? []) {
    if (Date.now() - started > 25_000) break // le reste au prochain passage
    // une seule construction à la fois par box : sinon deux appels réécrivent les mêmes fichiers
    // d'agrégats et le dernier efface les journées de l'autre. Box occupée : jour laissé en file.
    const { data: locked, error: le } = await admin.rpc('ts_build_try_lock', { p_device: t.device_id, p_ttl_s: 120 })
    if (le || !locked) {
      busy.push({ device: t.device_id, day: t.day })
      continue
    }
    try {
      let c = companies.get(t.device_id)
      if (!c) {
        const { data } = await admin.from('devices').select('company_id').eq('id', t.device_id).single()
        c = data!.company_id as string
        companies.set(t.device_id, c)
      }
      const r = await buildDay(t.device_id, c, t.day)
      done.push({ device: t.device_id, ...r })
      // analyse des dérives sur l'historique, une fois la journée construite (journées récentes seulement :
      // une reconstruction de l'historique ne doit pas produire des centaines d'alertes)
      if (r.report_id && Date.now() - Date.parse(t.day) < 4 * DAY) analyses.push(analyzeDay(r.report_id))
      // ne retire la marque que si elle n'a pas été renouvelée pendant la construction
      await admin.from('ts_dirty').delete().eq('device_id', t.device_id).eq('day', t.day).lte('since', t.since)
    } catch (e) {
      failed.push({ device: t.device_id, day: t.day, error: String(e) })
    } finally {
      await admin.rpc('ts_build_unlock', { p_device: t.device_id })
    }
  }
  await admin.rpc('ts_buffer_purge')
  const analyzed = await Promise.all(analyses)
  return Response.json({ done: done.length, failed, busy: busy.length, items: done, analyzed, ms: Date.now() - started })
})

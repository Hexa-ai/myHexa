// Edge Function: ts-archive (PROTOTYPE, myHexa-test)
// Exporte l'historique (table ts_series) en fichiers Parquet dans le bucket privé `ts-archive` :
//   raw/company=<c>/device=<d>/year=YYYY/month=MM/YYYY-MM-DD.parquet   (tous niveaux d'un jour, colonne level)
//   agg/1h/company=<c>/device=<d>/year=YYYY/YYYY-MM.parquet            (agrégats horaires du mois)
//   agg/1d/company=<c>/device=<d>/YYYY.parquet                         (agrégats journaliers de l'année)
// Format long : ts (TIMESTAMP ms UTC), var, level, src, v, vmin, vmax — trié var, level, ts.
// Déclenchée par cron (x-cron-secret). Idempotente : régénère seulement les jours modifiés (ts_archive_todo).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { parquetWriteBuffer } from 'npm:hyparquet-writer@0.17.0'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? ''
const BUCKET = 'ts-archive'
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

interface Row {
  var: string
  level: string
  src: string
  day: string
  t0: string
  step_s: number | null
  ts: number[] | null
  v_avg: (number | null)[]
  v_min: (number | null)[] | null
  v_max: (number | null)[] | null
}
interface Flat {
  ts: number
  var: string
  level: string
  src: string
  v: number | null
  vmin: number | null
  vmax: number | null
}

function flatten(rows: Row[]): Flat[] {
  const out: Flat[] = []
  for (const r of rows) {
    const t0 = new Date(r.t0).getTime()
    r.v_avg.forEach((v, i) => {
      if (v === null || v === undefined) return
      const ts =
        r.level === 'pt' ? t0 + (r.ts?.[i] ?? 0) * 1000 : r.step_s === -1 ? t0 : t0 + i * (r.step_s ?? 0) * 1000
      out.push({ ts, var: r.var, level: r.level, src: r.src, v, vmin: r.v_min?.[i] ?? v, vmax: r.v_max?.[i] ?? v })
    })
  }
  const order: Record<string, number> = { pt: 0, '5m': 1, '1h': 2, '1d': 3 }
  out.sort((a, b) => a.var.localeCompare(b.var) || order[a.level] - order[b.level] || a.ts - b.ts)
  return out
}

function toParquet(rows: Flat[]): Uint8Array {
  const buf = parquetWriteBuffer({
    columnData: [
      { name: 'ts', data: rows.map((r) => new Date(r.ts)), type: 'TIMESTAMP' },
      { name: 'var', data: rows.map((r) => r.var), type: 'STRING' },
      { name: 'level', data: rows.map((r) => r.level), type: 'STRING' },
      { name: 'src', data: rows.map((r) => r.src), type: 'STRING' },
      { name: 'v', data: rows.map((r) => r.v), type: 'DOUBLE' },
      { name: 'vmin', data: rows.map((r) => r.vmin), type: 'DOUBLE' },
      { name: 'vmax', data: rows.map((r) => r.vmax), type: 'DOUBLE' },
    ],
  })
  return new Uint8Array(buf)
}

async function put(path: string, bytes: Uint8Array) {
  const { error } = await admin.storage
    .from(BUCKET)
    .upload(path, new Blob([bytes], { type: 'application/vnd.apache.parquet' }), { upsert: true })
  if (error) throw new Error(`upload ${path}: ${error.message}`)
}

const COLS = 'var, level, src, day, t0, step_s, ts, v_avg, v_min, v_max'

async function fetchSeries(device: string, from: string, to: string, levels?: string[]): Promise<Row[]> {
  const all: Row[] = []
  for (let off = 0; ; off += 1000) {
    let q = admin.from('ts_series').select(COLS).eq('device_id', device).gte('day', from).lte('day', to)
    if (levels) q = q.in('level', levels)
    const { data, error } = await q.order('day').order('var').range(off, off + 999)
    if (error) throw new Error(error.message)
    all.push(...((data ?? []) as Row[]))
    if (!data || data.length < 1000) break
  }
  return all
}

// préférence rapport > statut pour un même (var, jour) dans les agrégats
function preferReport(rows: Row[]): Row[] {
  const best = new Map<string, Row>()
  for (const r of rows) {
    const k = `${r.var}|${r.day}`
    const cur = best.get(k)
    if (!cur || (cur.src === 's' && r.src === 'r')) best.set(k, r)
  }
  return [...best.values()]
}

async function archiveDay(device: string, company: string, day: string) {
  const [y, m] = day.split('-')
  const base = `company=${company}/device=${device}`
  const rows = flatten(await fetchSeries(device, day, day))
  const raw = `raw/${base}/year=${y}/month=${m}/${day}.parquet`
  const bytes = toParquet(rows)
  await put(raw, bytes)

  const monthEnd = new Date(Date.UTC(+y, +m, 0)).toISOString().slice(0, 10)
  const h = flatten(preferReport(await fetchSeries(device, `${y}-${m}-01`, monthEnd, ['1h'])))
  if (h.length) await put(`agg/1h/${base}/year=${y}/${y}-${m}.parquet`, toParquet(h))
  const d = flatten(preferReport(await fetchSeries(device, `${y}-01-01`, `${y}-12-31`, ['1d'])))
  if (d.length) await put(`agg/1d/${base}/${y}.parquet`, toParquet(d))

  const { error } = await admin
    .from('ts_archive')
    .upsert({ device_id: device, day, path: raw, rows: rows.length, bytes: bytes.length, archived_at: new Date().toISOString() })
  if (error) throw new Error(error.message)
  return { day, rows: rows.length, bytes: bytes.length }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })
  if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) return new Response('forbidden', { status: 403 })
  const body = await req.json().catch(() => ({}))
  const limit = Math.min(Math.max(Number(body.limit) || 30, 1), 200)
  const started = Date.now()
  const { data: todo, error } = await admin.rpc('ts_archive_todo', { p_limit: limit })
  if (error) return Response.json({ error: error.message }, { status: 500 })
  const done: unknown[] = []
  const failed: unknown[] = []
  for (const t of (todo ?? []) as { device_id: string; company_id: string; day: string }[]) {
    if (Date.now() - started > 100_000) break // reste pour le prochain passage
    try {
      done.push({ device: t.device_id, ...(await archiveDay(t.device_id, t.company_id, t.day)) })
    } catch (e) {
      failed.push({ device: t.device_id, day: t.day, error: String(e) })
    }
  }
  return Response.json({ done: done.length, failed, items: done, ms: Date.now() - started })
})

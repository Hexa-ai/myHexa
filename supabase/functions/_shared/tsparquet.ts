// Bibliothèque commune ts-build / ts-read : format Parquet de l'historique des box (PROTOTYPE).
// Format long, trié par variable puis temps, 1 row group par variable, et un index
// { var: [début, fin) } dans les métadonnées clé/valeur du pied de fichier : le lecteur
// lit le pied (1 requête HTTP Range) puis seulement les row groups des variables demandées.
import { parquetWriteBuffer } from 'npm:hyparquet-writer@0.17.0'
import { asyncBufferFromUrl, parquetMetadataAsync, parquetReadObjects } from 'npm:hyparquet@1.31.5'

/** Rang de la source (plus petit = meilleur). STATS = min/moy/max du jour fournis par le rapport. */
// DERIVED : volume / énergie calculé par ts-build (intégration d'un débit ou d'une puissance)
export const SRC = { REPORT: 1, WEEKLY: 2, STATUS: 3, DERIVED: 4, STATS: 9 } as const

export interface TsRow {
  ts: number // ms UTC (début de la case pour un agrégat)
  var: string
  v: number | null // moyenne (ou total pour un compteur)
  vmin: number | null
  vmax: number | null
  n: number // nombre d'échantillons agrégés
  res: number // résolution de la ligne en secondes (0 = événement)
  src: number // SRC.*
}

export const INDEX_KEY = 'myhexa.index'

export function writeTs(rows: TsRow[], meta: Record<string, string> = {}): Uint8Array {
  const sorted = [...rows].sort((a, b) => (a.var < b.var ? -1 : a.var > b.var ? 1 : a.ts - b.ts || a.src - b.src))
  const index: Record<string, [number, number]> = {}
  const groups: number[] = []
  sorted.forEach((r, i) => {
    const g = index[r.var]
    if (g) g[1] = i + 1
    else {
      index[r.var] = [i, i + 1]
    }
  })
  for (const k of Object.keys(index)) groups.push(index[k][1] - index[k][0])
  const buf = parquetWriteBuffer({
    columnData: [
      { name: 'ts', data: sorted.map((r) => new Date(r.ts)), type: 'TIMESTAMP' },
      { name: 'var', data: sorted.map((r) => r.var), type: 'STRING' },
      { name: 'v', data: sorted.map((r) => r.v), type: 'DOUBLE' },
      { name: 'vmin', data: sorted.map((r) => r.vmin), type: 'DOUBLE' },
      { name: 'vmax', data: sorted.map((r) => r.vmax), type: 'DOUBLE' },
      { name: 'n', data: sorted.map((r) => r.n), type: 'INT32' },
      { name: 'res', data: sorted.map((r) => r.res), type: 'INT32' },
      { name: 'src', data: sorted.map((r) => r.src), type: 'INT32' },
    ],
    rowGroupSize: groups.length ? [...groups, 1_000_000] : 1_000_000,
    kvMetadata: [
      { key: INDEX_KEY, value: JSON.stringify(index) },
      ...Object.entries(meta).map(([key, value]) => ({ key, value })),
    ],
  })
  return new Uint8Array(buf)
}

type Raw = { ts: Date | number | bigint; var: string; v: number | null; vmin: number | null; vmax: number | null; n: number; res: number; src: number }
const toRow = (o: Raw): TsRow => ({
  ts: o.ts instanceof Date ? o.ts.getTime() : Number(o.ts),
  var: o.var,
  v: o.v,
  vmin: o.vmin,
  vmax: o.vmax,
  n: Number(o.n),
  res: Number(o.res),
  src: Number(o.src),
})

/** Lit un fichier entier (petit, côté construction). */
export async function readAll(bytes: ArrayBuffer): Promise<TsRow[]> {
  const rows = (await parquetReadObjects({ file: bytes })) as Raw[]
  return rows.map(toRow)
}

/** Lit seulement les variables demandées d'un fichier distant (URL signée, requêtes Range). */
export async function readVars(url: string, byteLength: number, vars: string[]): Promise<TsRow[]> {
  const file = await asyncBufferFromUrl({ url, byteLength })
  const metadata = await parquetMetadataAsync(file)
  const kv = metadata.key_value_metadata?.find((k: { key: string }) => k.key === INDEX_KEY)
  const index: Record<string, [number, number]> = kv?.value ? JSON.parse(kv.value) : {}
  const out: TsRow[] = []
  await Promise.all(
    vars
      .filter((v) => index[v])
      .map(async (v) => {
        const [rowStart, rowEnd] = index[v]
        const rows = (await parquetReadObjects({ file, metadata, rowStart, rowEnd })) as Raw[]
        for (const r of rows) out.push(toRow(r))
      }),
  )
  return out
}

/** Agrège des lignes en cases de `bucketMs` alignées sur `origin` (moyenne pondérée, ou somme pour un compteur). */
export function aggregate(rows: TsRow[], bucketMs: number, counters: Set<string>, origin = 0): TsRow[] {
  const acc = new Map<string, { var: string; ts: number; s: number; w: number; mi: number; ma: number; n: number; src: number }>()
  for (const r of rows) {
    if (r.v === null || r.v === undefined || !Number.isFinite(r.v)) continue
    const ts = origin + Math.floor((r.ts - origin) / bucketMs) * bucketMs
    const k = r.var + '\u0000' + ts
    const w = Math.max(r.n || 1, 1)
    let a = acc.get(k)
    if (!a) {
      a = { var: r.var, ts, s: 0, w: 0, mi: Infinity, ma: -Infinity, n: 0, src: r.src }
      acc.set(k, a)
    }
    a.s += counters.has(r.var) ? r.v : r.v * w
    a.w += w
    a.n += w
    a.mi = Math.min(a.mi, r.vmin ?? r.v)
    a.ma = Math.max(a.ma, r.vmax ?? r.v)
    a.src = Math.min(a.src, r.src)
  }
  return [...acc.values()].map((a) => ({
    ts: a.ts,
    var: a.var,
    v: counters.has(a.var) ? a.s : a.s / a.w,
    vmin: a.mi,
    vmax: a.ma,
    n: a.n,
    res: bucketMs / 1000,
    src: a.src,
  }))
}

/** Pour chaque (variable, jour) garde la meilleure source de courbe ; les stats du jour à part. */
export function bestCurve(rows: TsRow[]): { curve: TsRow[]; stats: TsRow[] } {
  const best = new Map<string, number>()
  for (const r of rows) if (r.src !== SRC.STATS) best.set(r.var, Math.min(best.get(r.var) ?? 99, r.src))
  return {
    curve: rows.filter((r) => r.src !== SRC.STATS && r.src === best.get(r.var)),
    stats: rows.filter((r) => r.src === SRC.STATS),
  }
}

/** Minuit local (ms UTC) d'un jour YYYY-MM-DD dans le fuseau `tz`. */
export function zonedMidnight(day: string, tz: string): number {
  const utc = Date.parse(day + 'T00:00:00Z')
  let off = 0
  try {
    const f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
    for (let i = 0; i < 2; i++) {
      const p = Object.fromEntries(f.formatToParts(utc - off).map((x) => [x.type, x.value]))
      const local = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`)
      off = local - (utc - off) // décalage du fuseau à cet instant
    }
  } catch {
    off = 0
  }
  return utc - off
}

/** Semaine ISO « 2026-W43 » et ses bornes (lundi) pour un jour YYYY-MM-DD. */
export function isoWeek(day: string): { key: string; monday: string } {
  const d = new Date(day + 'T00:00:00Z')
  const dow = (d.getUTCDay() + 6) % 7
  const monday = new Date(d.getTime() - dow * 86400e3)
  const th = new Date(monday.getTime() + 3 * 86400e3)
  const y = th.getUTCFullYear()
  const w = 1 + Math.floor((th.getTime() - Date.UTC(y, 0, 1)) / 86400e3 / 7)
  return { key: `${y}-W${String(w).padStart(2, '0')}`, monday: monday.toISOString().slice(0, 10) }
}

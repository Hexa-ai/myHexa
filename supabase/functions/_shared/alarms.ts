// Événements d'alarme (PROTOTYPE) : stockage Parquet + calcul des occurrences et statistiques.
// Commun à ts-build (écriture), ts-read (lecture portail) et report-run (rapports).
//
// Fichier : un par box et par mois, trié par temps. Colonnes : ts, name, on (0/1), severity, label,
// description, day (jour du rapport source, YYYY-MM-DD), src (1 = journalier, 2 = ancien hebdo).
// Un journalier remplace toutes les lignes de son jour (idempotent).
import { parquetWriteBuffer } from 'npm:hyparquet-writer@0.17.0'
import { asyncBufferFromUrl, parquetReadObjects } from 'npm:hyparquet@1.31.5'

export type Severity = 'error' | 'warning' | 'info'
export interface AlarmEvent {
  ts: number
  name: string
  on: boolean
  severity: Severity
  label: string
  description: string
  day: string
  src: number
}
export const EV_SRC = { DAILY: 1, WEEKLY: 2 } as const
const DAY = 86400e3
type Json = Record<string, unknown>

export const sevOf = (s: unknown): Severity => {
  const v = String(s ?? '').toLowerCase()
  return v === 'warning' || v === 'warn' ? 'warning' : v === 'info' ? 'info' : 'error'
}

/** « trÃ¨s » -> « très » (UTF-8 relu en Latin-1 côté box) ; laissé tel quel si ce n'est pas le cas */
export function fixMojibake(s: string): string {
  if (!/[ÃÂ][\u0080-\u00bf]/.test(s) || [...s].some((c) => c.charCodeAt(0) > 255)) return s
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from([...s].map((c) => c.charCodeAt(0))))
  } catch {
    return s
  }
}

/** événements d'un payload de rapport */
export function eventsFromPayload(payload: Json, day: string | ((ts: number) => string), src: number): AlarmEvent[] {
  const list = Array.isArray(payload?.alarm_events) ? (payload.alarm_events as Json[]) : []
  const out: AlarmEvent[] = []
  for (const e of list) {
    const ts = Number(e.timestamp)
    const name = typeof e.name === 'string' ? fixMojibake(e.name.trim()) : ''
    if (!name || !Number.isFinite(ts) || ts <= 0) continue
    const label = String(e.state_label ?? '')
    const v = Number(e.value)
    out.push({
      ts,
      name,
      on: Number.isFinite(v) ? v !== 0 : /^on$/i.test(label),
      severity: sevOf(e.type_alarm),
      label,
      description: fixMojibake(String(e.description ?? '')),
      day: typeof day === 'string' ? day : day(ts),
      src,
    })
  }
  return out
}

/** dédoublonnage (nom, instant, état) + tri chronologique */
export function dedupe(rows: AlarmEvent[]): AlarmEvent[] {
  const m = new Map<string, AlarmEvent>()
  for (const r of rows) {
    const k = `${r.name}\u0000${r.ts}\u0000${r.on ? 1 : 0}`
    const prev = m.get(k)
    if (!prev || r.src < prev.src) m.set(k, r)
  }
  return [...m.values()].sort((a, b) => a.ts - b.ts || a.name.localeCompare(b.name) || Number(a.on) - Number(b.on))
}

export function writeEvents(rows: AlarmEvent[]): Uint8Array {
  const s = dedupe(rows)
  const buf = parquetWriteBuffer({
    columnData: [
      { name: 'ts', data: s.map((r) => new Date(r.ts)), type: 'TIMESTAMP' },
      { name: 'name', data: s.map((r) => r.name), type: 'STRING' },
      { name: 'on', data: s.map((r) => (r.on ? 1 : 0)), type: 'INT32' },
      { name: 'severity', data: s.map((r) => r.severity), type: 'STRING' },
      { name: 'label', data: s.map((r) => r.label), type: 'STRING' },
      { name: 'description', data: s.map((r) => r.description), type: 'STRING' },
      { name: 'day', data: s.map((r) => r.day), type: 'STRING' },
      { name: 'src', data: s.map((r) => r.src), type: 'INT32' },
    ],
    kvMetadata: [{ key: 'myhexa.kind', value: 'alarm_events' }],
  })
  return new Uint8Array(buf)
}

type Raw = { ts: Date | number | bigint; name: string; on: number; severity: string; label: string; description: string; day: string; src: number }
const toEv = (o: Raw): AlarmEvent => ({
  ts: o.ts instanceof Date ? o.ts.getTime() : Number(o.ts),
  name: o.name,
  on: Number(o.on) !== 0,
  severity: sevOf(o.severity),
  label: o.label ?? '',
  description: o.description ?? '',
  day: o.day ?? '',
  src: Number(o.src),
})
export async function readEvents(bytes: ArrayBuffer): Promise<AlarmEvent[]> {
  return ((await parquetReadObjects({ file: bytes })) as Raw[]).map(toEv)
}
export async function readEventsUrl(url: string, byteLength: number): Promise<AlarmEvent[]> {
  const file = await asyncBufferFromUrl({ url, byteLength })
  return ((await parquetReadObjects({ file })) as Raw[]).map(toEv)
}

export const monthOf = (day: string) => day.slice(0, 7)
export const eventsPath = (company: string, device: string, month: string) =>
  `events/company=${company}/device=${device}/year=${month.slice(0, 4)}/${month}.parquet`

/** lit les événements d'une box sur [from, to] ; `lookback` ms avant `from` pour connaître l'état au début */
export async function loadEvents(db: any, storage: any, device: string, from: number, to: number, lookback = 31 * DAY) {
  const { data: files, error } = await db
    .from('ts_files')
    .select('path, bytes, t_from, t_to')
    .eq('device_id', device)
    .eq('level', 'events')
    .lte('t_from', new Date(to).toISOString())
    .gte('t_to', new Date(from - lookback).toISOString())
    .order('t_from')
    .limit(200)
  if (error) throw new Error(error.message)
  if (!files?.length) return [] as AlarmEvent[]
  const { data: signed, error: se } = await storage.storage.from('ts-archive').createSignedUrls(
    files.map((f: { path: string }) => f.path),
    120,
  )
  if (se) throw new Error(se.message)
  const parts = await Promise.all(
    files.map((f: { bytes: number }, i: number) => (signed[i]?.signedUrl ? readEventsUrl(signed[i].signedUrl, f.bytes) : [])),
  )
  return dedupe(parts.flat()).filter((e) => e.ts >= from - lookback && e.ts <= to)
}

// ---------- occurrences et statistiques ----------
export interface Filter {
  names?: string[] | null
  severities?: Severity[] | null
}
export interface Occurrence {
  device: string
  name: string
  severity: Severity
  description: string
  start: number // début réel (peut précéder la plage)
  end: number | null // null = sans fin connue (en cours ou box muette)
  /** durée comptée DANS la plage (ms) */
  duration: number
  ongoing: boolean
  before: boolean // déjà active au début de la plage
}
export const matches = (e: { name: string; severity: Severity }, f: Filter) =>
  (!f.names?.length || f.names.includes(e.name)) && (!f.severities?.length || f.severities.includes(e.severity))

/** apparition -> disparition, par alarme. Bornage : une occurrence commencée avant la plage compte depuis
 *  le début de la plage ; sans fin connue, elle compte jusqu'à la fin de la plage (au plus `now`) et est « en cours ». */
export function occurrences(device: string, events: AlarmEvent[], from: number, to: number, f: Filter = {}, now = Date.now()): Occurrence[] {
  const byName = new Map<string, AlarmEvent[]>()
  for (const e of events) if (matches(e, f)) (byName.get(e.name) ?? byName.set(e.name, []).get(e.name)!).push(e)
  const stop = Math.min(to, now)
  const out: Occurrence[] = []
  for (const [name, list] of byName) {
    list.sort((a, b) => a.ts - b.ts)
    let open: AlarmEvent | null = null
    const push = (s: AlarmEvent, end: number | null, orphan = false) => {
      const a = Math.max(s.ts, from)
      const b = end === null ? stop : Math.min(end, to)
      if (b < from || s.ts > to) return
      out.push({
        device,
        name,
        severity: s.severity,
        description: s.description,
        start: s.ts,
        end,
        duration: Math.max(0, b - a),
        ongoing: end === null,
        before: orphan || s.ts < from,
      })
    }
    for (const e of list) {
      if (e.on) {
        if (!open) open = e // ON répété : on garde le premier
      } else if (open) {
        push(open, e.ts)
        open = null
      } else if (e.ts >= from && e.ts <= to) {
        // disparition sans apparition connue (début avant l'historique) : occurrence depuis le début de la plage
        push({ ...e, ts: from }, e.ts, true)
      }
    }
    if (open) push(open, null)
  }
  return out.sort((a, b) => b.start - a.start)
}

export interface StatRow {
  device: string
  name: string
  severity: Severity
  description: string
  count: number
  duration: number
  longest: number
  last: number | null
  ongoing: boolean
  share_count: number // % des occurrences filtrées
  share_duration: number // % de la durée cumulée filtrée
  presence: number // % du temps de la plage en alarme
}
/** une ligne par (box, alarme) ; count = occurrences qui COMMENCENT dans la plage (+ celle déjà active au début) */
export function stats(occ: Occurrence[], from: number, to: number, now = Date.now()): { rows: StatRow[]; totals: Record<Severity, { count: number; duration: number }> } {
  const span = Math.max(1, Math.min(to, now) - from)
  const m = new Map<string, StatRow>()
  for (const o of occ) {
    const k = o.device + '|' + o.name
    const r =
      m.get(k) ??
      m
        .set(k, { device: o.device, name: o.name, severity: o.severity, description: o.description, count: 0, duration: 0, longest: 0, last: null, ongoing: false, share_count: 0, share_duration: 0, presence: 0 })
        .get(k)!
    r.count++
    r.duration += o.duration
    r.longest = Math.max(r.longest, o.duration)
    r.last = Math.max(r.last ?? 0, o.start)
    r.ongoing ||= o.ongoing
  }
  const rows = [...m.values()]
  const nC = rows.reduce((a, r) => a + r.count, 0) || 1
  const nD = rows.reduce((a, r) => a + r.duration, 0) || 1
  for (const r of rows) {
    r.share_count = (r.count / nC) * 100
    r.share_duration = (r.duration / nD) * 100
    r.presence = Math.min(100, (r.duration / span) * 100)
  }
  rows.sort((a, b) => b.count - a.count || b.duration - a.duration)
  const totals = { error: { count: 0, duration: 0 }, warning: { count: 0, duration: 0 }, info: { count: 0, duration: 0 } }
  for (const r of rows) {
    totals[r.severity].count += r.count
    totals[r.severity].duration += r.duration
  }
  return { rows, totals }
}

export const SEV_LABEL: Record<Severity, string> = { error: 'Erreur', warning: 'Warning', info: 'Info' }
export const SEV_COLOR: Record<Severity, string> = { error: '#dc2626', warning: '#d97706', info: '#2563eb' }
export function fmtDur(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} s`
  const mn = Math.round(s / 60)
  if (mn < 60) return `${mn} min`
  const h = Math.floor(mn / 60)
  if (h < 48) return `${h} h ${String(mn % 60).padStart(2, '0')}`
  return `${Math.floor(h / 24)} j ${h % 24} h`
}

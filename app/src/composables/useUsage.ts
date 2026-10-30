import { supabase } from '@/lib/supabase'

// RPC récentes, absentes des types générés (src/types/supabase.ts) : on type juste ce qu'on utilise.
type Row = Record<string, unknown>
type RpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>
}
const sb = supabase as unknown as RpcClient

export interface UsageDevice {
  device_id: string
  device_name: string
  company_id: string | null
  company_name: string | null
  last_connection_at: string | null
  connected: boolean
  vars: number
  ts_files: number
  ts_bytes: number
  doc_files: number
  doc_bytes: number
  photo_files: number
  photo_bytes: number
  reports: number
  report_bytes: number
  status_24h: number
  daily_7d: number
  history_days: number
}
export interface UsagePlatform {
  db_bytes: number
  buckets: { bucket: string; files: number; bytes: number }[]
  company_files: { company_id: string; files: number; bytes: number }[]
  snapshot_days: number
  at: string
}
export interface UsageTrendRow {
  day: string
  boxes: number
  connected: number
  vars: number
  files: number
  bytes: number
  status_24h: number
}
/** Totaux d'un ensemble de box (client ou global). */
export interface UsageTotals {
  boxes: number
  connected: number
  active: number
  vars: number
  files: number
  bytes: number
  ts_bytes: number
  doc_bytes: number
  photo_bytes: number
  report_bytes: number
  status_24h: number
  /** croissance estimée de l'historique, octets par mois (box ayant de l'historique) */
  ts_month: number
}

const num = (x: unknown) => Number(x ?? 0) || 0

export async function loadUsageDevices(company?: string | null) {
  const { data, error } = await sb.rpc('usage_by_device', { p_company: company ?? null })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Row[]).map((r) => ({
    ...r,
    ts_bytes: num(r.ts_bytes),
    doc_bytes: num(r.doc_bytes),
    photo_bytes: num(r.photo_bytes),
    report_bytes: num(r.report_bytes),
  })) as unknown as UsageDevice[]
}
export async function loadUsagePlatform() {
  const { data, error } = await sb.rpc('usage_platform')
  if (error) throw new Error(error.message)
  return data as UsagePlatform
}
export async function loadUsageTrend(company?: string | null, days = 90) {
  const { data, error } = await sb.rpc('usage_trend', {
    p_company: company ?? null,
    p_days: days,
  })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Row[]).map((r) => ({ ...r, bytes: num(r.bytes) })) as unknown as UsageTrendRow[]
}

export function deviceBytes(d: UsageDevice) {
  return d.ts_bytes + d.doc_bytes + d.photo_bytes + d.report_bytes
}
export function deviceFiles(d: UsageDevice) {
  return d.ts_files + d.doc_files + d.photo_files
}
/** au-dessous, l'estimation mensuelle est trop bruitée (fichiers agrégés de taille fixe) */
export const MIN_HISTORY_DAYS = 7
/** octets d'historique par mois, à partir des jours d'historique couverts */
export function deviceTsMonth(d: UsageDevice) {
  return d.history_days >= MIN_HISTORY_DAYS ? (d.ts_bytes / d.history_days) * 30 : 0
}

export function totals(rows: UsageDevice[]): UsageTotals {
  const t: UsageTotals = {
    boxes: rows.length,
    connected: 0,
    active: 0,
    vars: 0,
    files: 0,
    bytes: 0,
    ts_bytes: 0,
    doc_bytes: 0,
    photo_bytes: 0,
    report_bytes: 0,
    status_24h: 0,
    ts_month: 0,
  }
  for (const d of rows) {
    if (d.connected) t.connected++
    if (deviceTsMonth(d) > 0) t.active++
    t.vars += d.vars
    t.files += deviceFiles(d)
    t.bytes += deviceBytes(d)
    t.ts_bytes += d.ts_bytes
    t.doc_bytes += d.doc_bytes
    t.photo_bytes += d.photo_bytes
    t.report_bytes += d.report_bytes
    t.status_24h += d.status_24h
    t.ts_month += deviceTsMonth(d)
  }
  return t
}

export function fmtBytes(b: number) {
  if (!b) return '0'
  const u = ['o', 'Ko', 'Mo', 'Go', 'To']
  let i = 0
  let v = b
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024
    i++
  }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1).replace('.', ',')} ${u[i]}`
}

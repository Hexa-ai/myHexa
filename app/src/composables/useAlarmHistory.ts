// Historique des alarmes : événements des rapports journaliers, stockés en Parquet (Edge Function ts-read, mode alarms).
// Les alarmes EN COURS viennent du dernier statut (30 min), pas d'ici.
import { supabase } from '@/lib/supabase'

export type Severity = 'error' | 'warning' | 'info'
export const SEVERITIES: Severity[] = ['error', 'warning', 'info']
export const SEV_LABEL: Record<Severity, string> = {
  error: 'Erreur',
  warning: 'Warning',
  info: 'Info',
}
export const SEV_COLOR: Record<Severity, string> = {
  error: '#dc2626',
  warning: '#d97706',
  info: '#2563eb',
}

/** durée d'alarme : secondes sous la minute, puis min, h, jours */
export function fmtDur(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} s`
  const mn = Math.round(s / 60)
  if (mn < 60) return `${mn} min`
  const h = Math.floor(mn / 60)
  if (h < 48) return `${h} h ${String(mn % 60).padStart(2, '0')}`
  return `${Math.floor(h / 24)} j ${h % 24} h`
}

export interface Occurrence {
  device: string
  name: string
  severity: Severity
  description: string
  start: number
  end: number | null
  duration: number
  ongoing: boolean
  before: boolean
}
export interface AlarmStat {
  device: string
  name: string
  severity: Severity
  description: string
  count: number
  duration: number
  longest: number
  last: number | null
  ongoing: boolean
  share_count: number
  share_duration: number
  presence: number
}
export interface AlarmName {
  name: string
  severity: Severity
  description: string
  devices: string[]
}
export interface AlarmResult {
  occurrences: Occurrence[]
  total: number
  stats: AlarmStat[]
  totals: Record<Severity, { count: number; duration: number }>
  names: AlarmName[]
}

export async function fetchAlarms(
  devices: string[],
  from: number,
  to: number,
  filter: { names?: string[] | null; severities?: Severity[] | null; limit?: number } = {},
): Promise<AlarmResult> {
  const empty: AlarmResult = {
    occurrences: [],
    total: 0,
    stats: [],
    totals: {
      error: { count: 0, duration: 0 },
      warning: { count: 0, duration: 0 },
      info: { count: 0, duration: 0 },
    },
    names: [],
  }
  if (!devices.length) return empty
  const { data, error } = await supabase.functions.invoke('ts-read', {
    body: {
      mode: 'alarms',
      devices,
      from: Math.round(from),
      to: Math.round(to),
      names: filter.names?.length ? filter.names : null,
      severities: filter.severities?.length ? filter.severities : null,
      limit: filter.limit ?? 500,
    },
  })
  if (error) {
    const ctx = (error as { context?: Response }).context
    const msg = ctx
      ? ((await ctx.json().catch(() => null)) as { error?: { message?: string } } | null)?.error
          ?.message
      : null
    throw new Error(msg ?? error.message)
  }
  const r = data as { ok: boolean; data?: AlarmResult; error?: { message: string } }
  if (!r.ok || !r.data) throw new Error(r.error?.message ?? 'lecture impossible')
  return r.data
}

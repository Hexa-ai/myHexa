import { supabase } from '@/lib/supabase'

/** [t_ms, moyenne (ou total pour un compteur), min, max] */
export type HistPoint = [number, number | null, number | null, number | null]

export interface HistVar {
  var: string
  unit: string | null
  category: string | null
  description: string | null
  first_day: string
  last_day: string
  days: number
  fine: boolean
}
export interface HistSeries {
  var: string
  unit: string | null
  category: string | null
  description: string | null
  sources: string[]
  points: HistPoint[]
}
export interface HistResult {
  level: 'raw' | '1m' | '1h' | '1d'
  /** taille des cases après réduction (0 = points bruts) */
  bucket_s: number
  files: number
  bytes_files: number
  ms: number
  series: HistSeries[]
}

export async function fetchCatalog(deviceId: string): Promise<HistVar[]> {
  const { data, error } = await supabase.rpc('ts_catalog' as never, { p_device: deviceId } as never)
  if (error) throw new Error(error.message)
  return (data as HistVar[] | null) ?? []
}

/** Lecture dans les fichiers Parquet (Edge Function ts-read). */
export async function fetchHistory(
  deviceId: string,
  vars: string[],
  from: number,
  to: number,
): Promise<HistResult> {
  const { data, error } = await supabase.functions.invoke('ts-read', {
    body: {
      device: deviceId,
      vars,
      from: Math.round(from),
      to: Math.round(to),
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
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
  const r = data as { ok: boolean; data?: HistResult; error?: { message: string } }
  if (!r.ok || !r.data) throw new Error(r.error?.message ?? 'lecture impossible')
  return r.data
}

/** Niveau de fichiers lu pour une plage (même règle que ts-read). */
export function autoLevel(from: number, to: number): HistResult['level'] {
  const d = (to - from) / 86400e3
  return d <= 2 ? 'raw' : d <= 21 ? '1m' : d <= 186 ? '1h' : '1d'
}

export const LEVEL_LABEL: Record<string, string> = {
  raw: 'brut (fichiers jour)',
  '1m': 'agrégat 1 min (fichiers semaine)',
  '1h': 'agrégat 1 h (fichiers mois)',
  '1d': 'agrégat 1 jour (fichiers année)',
}

export function bucketLabel(s: number): string {
  if (!s) return 'points bruts'
  if (s < 3600) return `${s / 60} min`
  if (s < 86400) return `${s / 3600} h`
  return `${s / 86400} j`
}

/** Origine lisible d'une série. */
export function sourceLabel(sources: string[]): string {
  return sources.join(' + ')
}

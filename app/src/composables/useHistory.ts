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
  level: '5m' | '1h' | '1d'
  series: HistSeries[]
}

export async function fetchCatalog(deviceId: string): Promise<HistVar[]> {
  const { data, error } = await supabase.rpc('ts_catalog' as never, { p_device: deviceId } as never)
  if (error) throw new Error(error.message)
  return (data as HistVar[] | null) ?? []
}

export async function fetchHistory(
  deviceId: string,
  vars: string[],
  from: number,
  to: number,
  level: string | null = null,
): Promise<HistResult> {
  const { data, error } = await supabase.rpc(
    'ts_query' as never,
    {
      p_device: deviceId,
      p_vars: vars,
      p_from: new Date(from).toISOString(),
      p_to: new Date(to).toISOString(),
      p_level: level,
    } as never,
  )
  if (error) throw new Error(error.message)
  return data as HistResult
}

/** Niveau choisi par le serveur pour une plage (même règle que ts_query). */
export function autoLevel(from: number, to: number): '5m' | '1h' | '1d' {
  const d = (to - from) / 86400e3
  return d <= 4 ? '5m' : d <= 62 ? '1h' : '1d'
}

export const LEVEL_LABEL: Record<string, string> = {
  '5m': '5 min',
  '1h': '1 heure',
  '1d': '1 jour',
}

/** Origine lisible d'une série : rapport (courbe fine / horaire / stats du jour) ou statut 30 min. */
export function sourceLabel(sources: string[]): string {
  const s = new Set(sources)
  const parts: string[] = []
  if (s.has('5m:r')) parts.push('courbe 5 min')
  if (s.has('1h:r')) parts.push('rapport, horaire')
  if (s.has('1d:r')) parts.push('stats du jour')
  if (s.has('pt:r')) parts.push('changements d’état')
  if (s.has('pt:s') || s.has('1h:s') || s.has('1d:s')) parts.push('statut 30 min')
  return parts.join(' + ')
}

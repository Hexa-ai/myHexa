// PROTOTYPE — tableaux de bord configurables (box, projet, liste libre de box).
// Les blocs sont les mêmes que ceux des futurs modèles de rapport : seule la période change (en direct / figée).
import { supabase } from '@/lib/supabase'
import {
  fetchHistory,
  type HistPoint,
  type HistSeries,
  type HistVar,
} from '@/composables/useHistory'

export type WidgetType =
  | 'curve'
  | 'bars'
  | 'value'
  | 'gauge'
  | 'status'
  | 'image'
  | 'states'
  | 'table'
  | 'text'
export type WidgetWidth = '1/4' | '1/3' | '1/2' | '2/3' | 'full'
export type Op = 'sum' | 'mean' | 'min' | 'max'
export type Stat = 'last' | 'mean' | 'min' | 'max' | 'total'

export interface Source {
  device: string
  var: string
}
export interface WidgetOptions {
  stat?: Stat
  /** décalage de période pour comparer : 'previous' (période précédente), 'year' (même période l'an dernier) */
  compare?: 'previous' | 'year' | null
  /** champs du bloc statut */
  fields?: string[]
  url?: string
  text?: string
  min?: number | null
  max?: number | null
  decimals?: number
}
export interface Widget {
  id?: string
  type: WidgetType
  width: WidgetWidth
  title: string | null
  sources: Source[]
  op: Op | null
  options: WidgetOptions
}
export interface Dashboard {
  id?: string
  company_id: string
  name: string
  scope: 'device' | 'project' | 'custom'
  device_id: string | null
  project_id: string | null
  device_ids: string[]
  period: string
  is_default: boolean
}

export const WIDGET_LABEL: Record<WidgetType, string> = {
  curve: 'Courbe',
  bars: 'Barres de consommation',
  value: 'Tuile valeur',
  gauge: 'Jauge',
  status: 'Statut',
  image: 'Image',
  states: 'Créneaux d\u2019états',
  table: 'Tableau min / moy / max',
  text: 'Texte',
}
export const STAT_LABEL: Record<Stat, string> = {
  last: 'Dernière valeur',
  mean: 'Moyenne',
  min: 'Minimum',
  max: 'Maximum',
  total: 'Total',
}
export const OP_LABEL: Record<Op, string> = {
  sum: 'Somme',
  mean: 'Moyenne',
  min: 'Minimum',
  max: 'Maximum',
}
export const STATUS_FIELDS: Record<string, string> = {
  online: 'Connexion',
  last_seen: 'Dernier contact',
  uptime: 'En marche depuis',
  version: 'Version',
  ip: 'Adresse IP',
  signal: 'Signal 4G',
  services: 'Services',
  hostname: 'Nom réseau',
}

export const PERIODS: Record<string, { label: string; range: (now: number) => [number, number] }> =
  {
    '24h': { label: '24 h', range: (n) => [n - 864e5, n] },
    '7d': { label: '7 jours', range: (n) => [n - 7 * 864e5, n] },
    '30d': { label: '30 jours', range: (n) => [n - 30 * 864e5, n] },
    today: {
      label: 'Aujourd\u2019hui',
      range: (n) => {
        const d = new Date(n)
        d.setHours(0, 0, 0, 0)
        return [d.getTime(), d.getTime() + 864e5]
      },
    },
    month: {
      label: 'Ce mois',
      range: (n) => {
        const d = new Date(n)
        const a = new Date(d.getFullYear(), d.getMonth(), 1).getTime()
        return [a, new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime()]
      },
    },
    year: {
      label: 'Cette année',
      range: (n) => {
        const y = new Date(n).getFullYear()
        return [new Date(y, 0, 1).getTime(), new Date(y + 1, 0, 1).getTime()]
      },
    },
  }

/** période décalée pour une comparaison */
export function shiftRange(
  [a, b]: [number, number],
  compare: WidgetOptions['compare'],
): [number, number] {
  if (compare === 'previous') return [a - (b - a), a]
  if (compare === 'year') {
    const s = (t: number) => {
      const d = new Date(t)
      d.setFullYear(d.getFullYear() - 1)
      return d.getTime()
    }
    return [s(a), s(b)]
  }
  return [a, b]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any

export async function loadDashboards(filter: {
  device?: string
  project?: string
  company?: string
}) {
  let q = sb.from('dashboards').select('*').order('is_default', { ascending: false }).order('name')
  if (filter.device) q = q.eq('device_id', filter.device)
  if (filter.project) q = q.eq('project_id', filter.project)
  if (filter.company) q = q.eq('company_id', filter.company)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []) as Dashboard[]
}

export async function loadWidgets(dashboardId: string) {
  const { data, error } = await sb
    .from('dashboard_widgets')
    .select('id, type, width, title, sources, op, options')
    .eq('dashboard_id', dashboardId)
    .order('position')
  if (error) throw new Error(error.message)
  return (data ?? []) as Widget[]
}

export async function saveDashboard(d: Dashboard, widgets: Widget[]): Promise<string> {
  const row = {
    company_id: d.company_id,
    name: d.name.trim() || 'Tableau de bord',
    scope: d.scope,
    device_id: d.device_id,
    project_id: d.project_id,
    device_ids: d.device_ids,
    period: d.period,
    is_default: d.is_default,
  }
  let id = d.id
  if (id) {
    const { error } = await sb.from('dashboards').update(row).eq('id', id)
    if (error) throw new Error(error.message)
  } else {
    const { data, error } = await sb.from('dashboards').insert(row).select('id').single()
    if (error) throw new Error(error.message)
    id = data.id as string
  }
  const payload = widgets.map((w) => ({
    type: w.type,
    width: w.width,
    title: w.title,
    sources: w.sources,
    op: w.op,
    options: w.options,
  }))
  const { error } = await sb.rpc('save_dashboard_widgets', { p_dashboard: id, p_widgets: payload })
  if (error) throw new Error(error.message)
  return id!
}

export async function deleteDashboard(id: string) {
  const { error } = await sb.from('dashboards').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

const isCounter = (v?: HistVar | null) => v?.category === 'counter'
const isState = (v?: HistVar | null) => v?.category === 'state' || v?.category === 'alarm'

/** Tableau de bord proposé par défaut (non enregistré tant que l'utilisateur ne l'a pas modifié). */
export function defaultWidgets(
  devices: { id: string }[],
  catalogs: Record<string, HistVar[]>,
  scope: Dashboard['scope'],
): Widget[] {
  const w: Widget[] = []
  const all = devices.flatMap((d) => (catalogs[d.id] ?? []).map((v) => ({ d: d.id, v })))
  const measures = all.filter(
    (x) => !isCounter(x.v) && !isState(x.v) && x.v.category !== 'position',
  )
  const fine = measures.filter((x) => x.v.fine)
  const pick = (fine.length ? fine : measures).slice(0, 4)
  w.push({
    type: 'status',
    width: scope === 'device' ? '1/3' : 'full',
    title: scope === 'device' ? 'Diagnostic' : 'Box du projet',
    sources: devices.map((d) => ({ device: d.id, var: '' })),
    op: null,
    options: {
      fields:
        scope === 'device'
          ? ['online', 'last_seen', 'uptime', 'version', 'ip', 'signal']
          : ['online', 'last_seen'],
    },
  })
  if (scope === 'device')
    w.push({
      type: 'image',
      width: '1/3',
      title: null,
      sources: [],
      op: null,
      options: { url: '/hai-p-gateway.png' },
    })
  if (scope === 'device' && pick[0])
    w.push({
      type: 'gauge',
      width: '1/3',
      title: null,
      sources: [{ device: pick[0].d, var: pick[0].v.var }],
      op: null,
      options: { stat: 'last' },
    })
  for (const x of pick)
    w.push({
      type: 'value',
      width: '1/4',
      title: null,
      sources: [{ device: x.d, var: x.v.var }],
      op: null,
      options: { stat: 'last' },
    })
  for (const x of pick.slice(0, 2))
    w.push({
      type: 'curve',
      width: '1/2',
      title: null,
      sources: [{ device: x.d, var: x.v.var }],
      op: null,
      options: {},
    })
  const vols = all.filter((x) => isCounter(x.v) && /^(Volume|Energie)_/.test(x.v.var))
  if (scope !== 'device' && vols.length > 1) {
    // agrégat inter-box : somme des volumes de même unité
    const unit = vols[0].v.unit
    const same = vols.filter((x) => x.v.unit === unit)
    w.push({
      type: 'bars',
      width: 'full',
      title: `Total ${unit ?? ''}`,
      sources: same.map((x) => ({ device: x.d, var: x.v.var })),
      op: 'sum',
      options: {},
    })
  } else {
    for (const x of vols.slice(0, 2))
      w.push({
        type: 'bars',
        width: '1/2',
        title: null,
        sources: [{ device: x.d, var: x.v.var }],
        op: null,
        options: {},
      })
  }
  w.push({
    type: 'table',
    width: 'full',
    title: 'Synthèse de la période',
    sources: pick.map((x) => ({ device: x.d, var: x.v.var })),
    op: null,
    options: {},
  })
  return w
}

// ---- données ----

export type SeriesMap = Map<string, HistSeries>
export const key = (s: Source) => s.device + '|' + s.var

/** Lit en un appel par box toutes les variables nécessaires aux blocs, pour une plage donnée. */
export async function fetchSources(
  sources: Source[],
  from: number,
  to: number,
): Promise<SeriesMap> {
  const byDev = new Map<string, Set<string>>()
  for (const s of sources)
    if (s.var) (byDev.get(s.device) ?? byDev.set(s.device, new Set()).get(s.device)!).add(s.var)
  const out: SeriesMap = new Map()
  await Promise.all(
    [...byDev].map(async ([dev, vars]) => {
      const r = await fetchHistory(dev, [...vars], from, to)
      for (const s of r.series) out.set(dev + '|' + s.var, s)
    }),
  )
  return out
}

/** Combine plusieurs séries (box différentes) par case de temps commune. */
export function combine(series: HistSeries[], op: Op): HistPoint[] {
  if (series.length === 1) return series[0].points
  const steps = series
    .map((s) => {
      const d = s.points
        .slice(1)
        .map((p, i) => p[0] - s.points[i][0])
        .sort((a, b) => a - b)
      return d[Math.floor(d.length / 2)] ?? 0
    })
    .filter((x) => x > 0)
  const step = Math.max(...steps, 60e3)
  const acc = new Map<number, number[]>()
  for (const s of series)
    for (const p of s.points) {
      if (p[1] === null) continue
      const k = Math.floor(p[0] / step) * step
      ;(acc.get(k) ?? acc.set(k, []).get(k)!).push(p[1])
    }
  return [...acc]
    .sort((a, b) => a[0] - b[0])
    .map(([t, vs]) => {
      const v =
        op === 'sum'
          ? vs.reduce((a, b) => a + b, 0)
          : op === 'mean'
            ? vs.reduce((a, b) => a + b, 0) / vs.length
            : op === 'min'
              ? Math.min(...vs)
              : Math.max(...vs)
      return [t, v, null, null] as HistPoint
    })
}

export function statOf(points: HistPoint[], stat: Stat, counter: boolean): number | null {
  const vals = points.filter((p) => p[1] !== null)
  if (!vals.length) return null
  if (stat === 'last') return vals[vals.length - 1][1]
  if (stat === 'total') return vals.reduce((a, p) => a + (p[1] ?? 0), 0)
  if (stat === 'mean')
    return counter
      ? vals.reduce((a, p) => a + (p[1] ?? 0), 0) / vals.length
      : vals.reduce((a, p) => a + (p[1] ?? 0), 0) / vals.length
  if (stat === 'min') return Math.min(...vals.map((p) => p[2] ?? p[1]!))
  return Math.max(...vals.map((p) => p[3] ?? p[1]!))
}

/** durée cumulée passée dans chaque valeur d'état sur [from, to] */
export function stateDurations(
  points: HistPoint[],
  from: number,
  to: number,
): { value: number; ms: number }[] {
  const pts = points.filter((p) => p[1] !== null && p[0] < to)
  const acc = new Map<number, number>()
  for (let i = 0; i < pts.length; i++) {
    const a = Math.max(pts[i][0], from)
    const b = Math.min(i + 1 < pts.length ? pts[i + 1][0] : to, to)
    if (b > a) acc.set(pts[i][1]!, (acc.get(pts[i][1]!) ?? 0) + (b - a))
  }
  return [...acc].map(([value, ms]) => ({ value, ms })).sort((x, y) => y.ms - x.ms)
}

export function fmtValue(v: number | null, decimals?: number): string {
  if (v === null || !Number.isFinite(v)) return '—'
  const d = decimals ?? (Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2)
  return v.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: d })
}

export function fmtDuration(ms: number): string {
  const m = Math.round(ms / 60e3)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h} h ${String(m % 60).padStart(2, '0')}`
  return `${Math.floor(h / 24)} j ${h % 24} h`
}

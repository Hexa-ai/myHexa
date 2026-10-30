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
  | 'indicator'
  | 'map'
  | 'status'
  | 'image'
  | 'document'
  | 'states'
  | 'table'
  | 'text'
  | 'alarm_history'
  | 'alarm_stats'
  | 'interventions'
  | 'weather'
  | 'synoptic'
export type WidgetWidth = '1/4' | '1/3' | '1/2' | '2/3' | 'full'
/**
 * Taille par défaut (colonnes sur 12 × rangées) d'un type de tuile à son choix dans l'éditeur.
 * Un type absent garde la taille actuelle de la tuile. Ex. à ajouter pour un grand synoptique :
 * `synoptic: { w: 12, h: 4 }`.
 */
export const DEFAULT_SIZE: Partial<Record<WidgetType, { w: number; h: number }>> = {
  // Un synoptique se lit en grand : pleine largeur, 4 rangées (~480 px)
  synoptic: { w: 12, h: 4 },
}
export type Op = 'sum' | 'mean' | 'min' | 'max'
export type Stat = 'last' | 'mean' | 'min' | 'max' | 'total'

export interface Source {
  device: string
  var: string
}
/** apparence d'un état pour le voyant */
export interface StateLook {
  value: number
  label: string
  color: string
  image?: string
}
export const DEFAULT_STATES: StateLook[] = [
  { value: 0, label: 'Arrêt', color: '#8a8f98' },
  { value: 1, label: 'Marche', color: '#16a34a' },
]
export const COMBINE_LABEL = {
  any: 'Au moins un actif',
  all: 'Tous actifs',
  max: 'Le plus élevé (priorité)',
} as const

/** synthèse d'états : any/all -> 0/1 (actif = valeur non nulle) ; max -> valeur la plus élevée */
export function combineStates(vals: (number | null)[], mode: 'any' | 'all' | 'max'): number | null {
  const v = vals.filter((x): x is number => x !== null)
  if (!v.length) return null
  if (mode === 'any') return v.some((x) => x !== 0) ? 1 : 0
  if (mode === 'all') return v.length === vals.length && v.every((x) => x !== 0) ? 1 : 0
  return Math.max(...v)
}

export const DEFAULT_ALARM_STATES: StateLook[] = [
  { value: 0, label: 'Normal', color: '#16a34a' },
  { value: 1, label: 'Défaut', color: '#dc2626' },
]

/** seuil tracé sur une courbe : trait horizontal pointillé, avec un libellé et sa valeur */
export interface Threshold {
  value: number
  label: string
  color: string
}
export const THRESHOLD_COLORS = [
  { color: '#dc2626', label: 'rouge' },
  { color: '#f59e0b', label: 'orange' },
  { color: '#2563eb', label: 'bleu' },
  { color: '#16a34a', label: 'vert' },
  { color: '#6b7280', label: 'gris' },
]

export interface WidgetOptions {
  /** taille libre sur la grille : colonnes (2-12) et rangées (1 = hauteur automatique, jusqu'à 6) */
  w?: number
  h?: number
  /** courbes / barres : seuils (traits horizontaux) */
  thresholds?: Threshold[]
  /** bloc signalements : types retenus, ouverts seulement (sinon : ceux de la période), photos affichées */
  kinds?: ('signalement' | 'intervention')[]
  openOnly?: boolean
  photos?: boolean
  /** documents : identifiants de device_documents affichés (plans, manuels, photos…) */
  docs?: string[]
  /** documents : présentation en fiches par format (défaut) ou en liste */
  docLayout?: 'cards' | 'list'
  /** voyant : une couleur, un libellé et éventuellement une image par valeur */
  states?: StateLook[]
  /** voyant : synthèse de plusieurs états en un seul (au moins un actif / tous actifs / le plus élevé) */
  combine?: 'any' | 'all' | 'max' | null
  stat?: Stat
  /** plusieurs variables sans opération : graphiques séparés au lieu d'une seule tuile superposée */
  separate?: boolean
  /** décalage de période pour comparer : 'previous' (période précédente), 'year' (même période l'an dernier) */
  compare?: 'previous' | 'year' | null
  /** champs du bloc statut */
  fields?: string[]
  url?: string
  text?: string
  min?: number | null
  max?: number | null
  decimals?: number
  /** blocs d'alarmes : alarmes retenues (vide = toutes), gravités, nb de lignes, graphique en barres */
  alarms?: string[]
  severities?: ('error' | 'warning' | 'info')[]
  limit?: number
  chart?: boolean
  /** météo : relevé actuel, prochaines 24 h ou 5 jours */
  weatherView?: 'now' | 'hours' | 'days'
  /** météo : contenus affichés (défaut selon la vue) */
  weatherFields?: import('@/composables/useWeather').WeatherField[]
  /** météo : pictogrammes animés, fixes ou masqués */
  weatherIcons?: import('@/composables/useWeather').WeatherIcons
  /** synoptique : identifiant (table synoptics) et variables reliées, annoncées au mode direct */
  synoptic_id?: string
  synoptic_vars?: string[]
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
  /** affichage permanent (écran mural) : direct lent sans limite de durée. Absent tant que la migration n'est pas passée. */
  live_display?: boolean
}

export const WIDGET_LABEL: Record<WidgetType, string> = {
  curve: 'Courbe',
  bars: 'Barres de consommation',
  value: 'Tuile valeur',
  gauge: 'Jauge',
  indicator: 'Voyant d\u2019état',
  map: 'Carte',
  status: 'Statut',
  image: 'Image',
  document: 'Documents',
  states: 'Créneaux d\u2019états',
  table: 'Tableau min / moy / max',
  text: 'Texte',
  alarm_history: 'Historique d\u2019alarmes',
  alarm_stats: 'Statistiques d\u2019alarmes',
  interventions: 'Signalements',
  weather: 'Météo',
  synoptic: 'Synoptique',
}
/** blocs d'alarmes : les sources ne portent que les box (var vide), le filtre est dans les options */
export const isAlarmWidget = (t: WidgetType) => t === 'alarm_history' || t === 'alarm_stats'
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

export async function loadDashboard(id: string) {
  const { data, error } = await sb.from('dashboards').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  return (data ?? null) as Dashboard | null
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
    // colonne ajoutée par la migration dashboards_live_display : n'écrire que si elle existe (front livré avant la base)
    ...(d.live_display !== undefined ? { live_display: d.live_display } : {}),
  }
  let id = d.id
  // un seul tableau par défaut par box / projet : les autres perdent la marque
  if (d.is_default && (d.device_id || d.project_id)) {
    let q = sb.from('dashboards').update({ is_default: false }).eq('is_default', true)
    q = d.device_id ? q.eq('device_id', d.device_id) : q.eq('project_id', d.project_id)
    if (id) q = q.neq('id', id)
    const { error } = await q
    if (error) throw new Error(error.message)
  }
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

/** Tableau de bord proposé par défaut (non enregistré tant que l'utilisateur ne l'a pas modifié).
 *  Aucun agrégat inter-box automatique : additionner des mesures de même unité n'a pas forcément de sens
 *  (ex. deux débits en série). Les sommes / moyennes ne se font que si l'utilisateur les choisit. */
export function defaultWidgets(
  devices: { id: string }[],
  catalogs: Record<string, HistVar[]>,
  scope: Dashboard['scope'],
): Widget[] {
  const w: Widget[] = []
  const measuresOf = (id: string) => {
    const m = (catalogs[id] ?? []).filter(
      (v) => !isCounter(v) && !isState(v) && v.category !== 'position',
    )
    const fine = m.filter((v) => v.fine)
    return fine.length ? fine : m
  }
  const volumesOf = (id: string) =>
    (catalogs[id] ?? []).filter((v) => isCounter(v) && /^(Volume|Energie)_/.test(v.var))

  if (scope === 'device') {
    const id = devices[0]?.id
    if (!id) return w
    const pick = measuresOf(id).slice(0, 4)
    w.push({
      type: 'status',
      width: '1/3',
      title: 'Diagnostic',
      sources: [{ device: id, var: '' }],
      op: null,
      options: { fields: ['online', 'last_seen', 'uptime', 'version', 'ip', 'signal'] },
    })
    w.push({
      type: 'image',
      width: '1/3',
      title: null,
      sources: [],
      op: null,
      options: { url: '/hai-p-gateway.png' },
    })
    if (pick[0])
      w.push({
        type: 'gauge',
        width: '1/3',
        title: null,
        sources: [{ device: id, var: pick[0].var }],
        op: null,
        options: { stat: 'last' },
      })
    const alarms = (catalogs[id] ?? []).filter((v) => v.category === 'alarm').slice(0, 8)
    const states = (catalogs[id] ?? []).filter((v) => v.category === 'state').slice(0, 8)
    if (states.length)
      w.push({
        type: 'indicator',
        width: alarms.length ? '1/2' : 'full',
        title: 'États',
        sources: states.map((v) => ({ device: id, var: v.var })),
        op: null,
        options: { states: DEFAULT_STATES },
      })
    if (alarms.length)
      w.push({
        type: 'indicator',
        width: states.length ? '1/2' : 'full',
        title: 'Défauts',
        sources: alarms.map((v) => ({ device: id, var: v.var })),
        op: null,
        options: { states: DEFAULT_ALARM_STATES },
      })
    for (const v of pick)
      w.push({
        type: 'value',
        width: '1/4',
        title: null,
        sources: [{ device: id, var: v.var }],
        op: null,
        options: { stat: 'last' },
      })
    for (const v of pick.slice(0, 2))
      w.push({
        type: 'curve',
        width: '1/2',
        title: null,
        sources: [{ device: id, var: v.var }],
        op: null,
        options: {},
      })
    for (const v of volumesOf(id).slice(0, 2))
      w.push({
        type: 'bars',
        width: '1/2',
        title: null,
        sources: [{ device: id, var: v.var }],
        op: null,
        options: {},
      })
    if (pick.length)
      w.push({
        type: 'table',
        width: 'full',
        title: 'Synthèse de la période',
        sources: pick.map((v) => ({ device: id, var: v.var })),
        op: null,
        options: {},
      })
    return w
  }

  // projet / liste : une ligne par box (sa mesure principale), chacune affichée séparément
  const list = devices.slice(0, 12)
  w.push({
    type: 'status',
    width: 'full',
    title: 'Box du projet',
    sources: list.map((d) => ({ device: d.id, var: '' })),
    op: null,
    options: { fields: ['online', 'last_seen'] },
  })
  const main = list.map((d) => ({ d: d.id, v: measuresOf(d.id)[0] })).filter((x) => !!x.v)
  const width: WidgetWidth = main.length <= 2 ? '1/2' : main.length === 3 ? '1/3' : '1/4'
  for (const x of main)
    w.push({
      type: 'value',
      width,
      title: null,
      sources: [{ device: x.d, var: x.v.var }],
      op: null,
      options: { stat: 'last' },
    })
  for (const x of main.slice(0, 4))
    w.push({
      type: 'curve',
      width: '1/2',
      title: null,
      sources: [{ device: x.d, var: x.v.var }],
      op: null,
      options: {},
    })
  const vols = list.map((d) => ({ d: d.id, v: volumesOf(d.id)[0] })).filter((x) => !!x.v)
  for (const x of vols.slice(0, 4))
    w.push({
      type: 'bars',
      width: '1/2',
      title: null,
      sources: [{ device: x.d, var: x.v.var }],
      op: null,
      options: {},
    })
  if (main.length)
    w.push({
      type: 'table',
      width: 'full',
      title: 'Synthèse de la période',
      sources: main.map((x) => ({ device: x.d, var: x.v.var })),
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

// ---- export CSV (Excel) ----

/** Lit les sources en fenêtres de 3 jours : ts-read renvoie alors le brut (5 min) et les compteurs par heure. */
export async function fetchDetailed(
  sources: Source[],
  from: number,
  to: number,
  onProgress?: (done: number, total: number) => void,
): Promise<SeriesMap> {
  const CHUNK = 3 * 864e5
  const byDev = new Map<string, string[]>()
  for (const s of sources)
    if (s.var) byDev.set(s.device, [...new Set([...(byDev.get(s.device) ?? []), s.var])])
  const jobs: { dev: string; vars: string[]; a: number; b: number }[] = []
  for (const [dev, vars] of byDev)
    for (let a = from; a < to; a += CHUNK) jobs.push({ dev, vars, a, b: Math.min(a + CHUNK, to) })
  const out: SeriesMap = new Map()
  let done = 0
  const queue = jobs.slice()
  async function worker() {
    for (let j = queue.shift(); j; j = queue.shift()) {
      const r = await fetchHistory(j.dev, j.vars, j.a, j.b)
      for (const s of r.series) {
        const k = j.dev + '|' + s.var
        const cur = out.get(k)
        const pts = s.points.filter((p) => p[0] >= j.a && p[0] < j.b)
        if (cur) cur.points.push(...pts)
        else out.set(k, { ...s, points: pts })
      }
      onProgress?.(++done, jobs.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, worker))
  for (const s of out.values()) s.points.sort((x, y) => x[0] - y[0])
  return out
}

const csvCell = (v: string) => (/[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v)
const fmtCsvNum = (v: number | null) =>
  v === null || !Number.isFinite(v) ? '' : String(+v.toPrecision(8)).replace('.', ',')
const pad = (n: number) => String(n).padStart(2, '0')
const fmtCsvDate = (t: number) => {
  const d = new Date(t)
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** CSV « Excel France » : séparateur ;, virgule décimale, BOM UTF-8, une ligne par horodatage, une colonne par variable.
 *  En-tête : nom de la box · variable (unité). Compteurs : total de la case (heure, jour…). */
export function toCsv(
  data: SeriesMap,
  sources: Source[],
  devName: (id: string) => string,
  catalogs: Record<string, HistVar[]>,
  meta: string[],
): string {
  const cols = sources
    .filter((s, i, a) => s.var && a.findIndex((x) => key(x) === key(s)) === i)
    .map((s) => {
      const m = catalogs[s.device]?.find((v) => v.var === s.var)
      const unit = m?.unit ?? data.get(key(s))?.unit ?? ''
      return { k: key(s), head: `${devName(s.device)} · ${s.var}${unit ? ` (${unit})` : ''}` }
    })
  const rows = new Map<number, (number | null)[]>()
  cols.forEach((c, i) => {
    for (const p of data.get(c.k)?.points ?? []) {
      if (p[1] === null) continue
      const r = rows.get(p[0]) ?? rows.set(p[0], Array(cols.length).fill(null)).get(p[0])!
      r[i] = p[1]
    }
  })
  const lines = [
    ...meta.map((m) => csvCell(m)),
    ['Date', ...cols.map((c) => c.head)].map(csvCell).join(';'),
  ]
  for (const [t, r] of [...rows].sort((a, b) => a[0] - b[0]))
    lines.push([fmtCsvDate(t), ...r.map(fmtCsvNum)].join(';'))
  return '\ufeff' + lines.join('\r\n') + '\r\n'
}

export function downloadText(name: string, text: string, mime = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

// ---- partage de tableaux en lecture seule (entre organisations) ----
export interface DashboardShare {
  recipient_id: string
  name: string | null
  email: string | null
  company: string | null
  created_at: string
}
export interface SharedDashboard {
  id: string
  name: string
  company: string | null
  scope: string
  shared_at: string
}
export async function shareDashboard(id: string, email: string) {
  const { error } = await sb.rpc('share_dashboard', { p_dashboard: id, p_email: email })
  if (error) throw new Error(error.message)
}
export async function unshareDashboard(id: string, recipientId: string) {
  const { error } = await sb.rpc('unshare_dashboard', { p_dashboard: id, p_recipient: recipientId })
  if (error) throw new Error(error.message)
}
export async function listShares(id: string) {
  const { data, error } = await sb.rpc('dashboard_shares_list', { p_dashboard: id })
  if (error) throw new Error(error.message)
  return (data ?? []) as DashboardShare[]
}
export async function sharedWithMe() {
  const { data, error } = await sb.rpc('shared_dashboards_for_me')
  if (error) throw new Error(error.message)
  return (data ?? []) as SharedDashboard[]
}
/** tout l'affichage d'un tableau partagé : box (nom, état réduit aux variables des blocs) et catalogues */
export async function loadSharedBundle(id: string) {
  const { data, error } = await sb.rpc('shared_dashboard_bundle', { p_dashboard: id })
  if (error) throw new Error(error.message)
  return data as {
    devices: {
      id: string
      name: string
      last_connection_at: string | null
      latitude: number | null
      longitude: number | null
      status_payload: Record<string, unknown>
    }[]
    catalogs: Record<string, HistVar[]>
  }
}

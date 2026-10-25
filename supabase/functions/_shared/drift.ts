// Détection des dérives sur l'historique journalier (fonctions pures, testées par drift_test.ts)
export const SHORT_DAYS = 28 // base de comparaison du court terme
export const WEEKS = 12 // fenêtre du long terme et de la confirmation
export const MIN_SHORT = 7 // jours d'historique minimum pour le court terme
export const MIN_WEEKS = 6 // semaines minimum pour le long terme

export type Json = Record<string, unknown>
export interface Insight {
  kind: 'anomaly' | 'trend' | 'alarm_burst'
  variable_name: string | null
  severity: number
  score: number | null
  evidence: Json
  fallbackTitle: string
}

// ---------- statistiques ----------
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN)
function stddev(xs: number[]) {
  if (xs.length < 2) return 0
  const m = mean(xs)
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1))
}
function median(xs: number[]) {
  if (!xs.length) return NaN
  const s = [...xs].sort((a, b) => a - b)
  const k = Math.floor(s.length / 2)
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2
}
const mad = (xs: number[]) => median(xs.map((x) => Math.abs(x - median(xs))))
const MAD_CONST = 1.4826
/** centre et dispersion robustes (médiane / MAD, repli sur moyenne / écart-type) */
export function robust(xs: number[]): { center: number; sd: number; method: string } {
  const r = mad(xs) * MAD_CONST
  if (r > 0) return { center: median(xs), sd: r, method: 'robust_mad' }
  return { center: mean(xs), sd: stddev(xs), method: 'fallback_stddev' }
}
function slope(ys: number[]) {
  const n = ys.length
  const xm = (n - 1) / 2
  const ym = mean(ys)
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (i - xm) * (ys[i] - ym)
    den += (i - xm) ** 2
  }
  return den ? num / den : 0
}
const r3 = (x: number) => Number(x.toFixed(3))
const zSeverity = (z: number) => (z >= 4 ? 5 : z >= 3 ? 4 : z >= 2.5 ? 3 : z >= 2 ? 2 : 0)

// ---------- détecteurs ----------
/** court terme : la journée face aux SHORT_DAYS jours précédents */
/** minPct : écart relatif minimal (une grandeur très stable donne des z-scores énormes pour quelques %) */
export function shortTerm(name: string, cur: number, base: number[], minPct = 5): Insight | null {
  if (base.length < MIN_SHORT) return null
  const { center, sd, method } = robust(base)
  if (!sd) return null
  const z = Math.abs(cur - center) / sd
  const severity = zSeverity(z)
  if (!severity) return null
  const deltaPct = center ? ((cur - center) / Math.abs(center)) * 100 : null
  if (deltaPct !== null && Math.abs(deltaPct) < minPct) return null
  return {
    kind: 'anomaly',
    variable_name: name,
    severity,
    score: Number(z.toFixed(2)),
    evidence: {
      horizon: 'court_terme',
      current: r3(cur),
      baseline_median: r3(median(base)),
      baseline_mad: r3(mad(base)),
      baseline_n: base.length,
      method,
      z_score: Number(z.toFixed(2)),
      delta_pct: deltaPct === null ? null : Number(deltaPct.toFixed(1)),
      direction: cur > center ? 'up' : 'down',
    },
    fallbackTitle: `Journée inhabituelle sur ${name} (${deltaPct !== null ? (deltaPct > 0 ? '+' : '') + deltaPct.toFixed(0) + ' %' : 'z=' + z.toFixed(1)})`,
  }
}

/** confirmation : parmi les 7 derniers jours (jour analysé compris), combien s'écartent dans le même sens
 *  de la même base de 28 jours ? Un seul jour = pic isolé (déclassé), 3 jours ou plus = écart confirmé.
 *  `days` : un point par jour (NaN si absent), le dernier = jour analysé. */
export function confirm(ins: Insight, days: number[]) {
  const ev = ins.evidence
  const n = days.length
  const base = days.slice(Math.max(0, n - 7 - SHORT_DAYS), n - 7).filter(Number.isFinite)
  const last7 = days.slice(-7).filter(Number.isFinite)
  if (base.length < MIN_SHORT || last7.length < 4) {
    ev.consolidation = 'no_7d_history'
    return
  }
  const { center, sd } = robust(base)
  if (!sd) {
    ev.consolidation = 'no_7d_history'
    return
  }
  const up = ev.direction === 'up'
  const k = last7.filter((v) => (up ? v - center : center - v) / sd >= 2).length
  ev.days_off_7d = k
  ev.days_7d = last7.length
  if (k <= 1) {
    ev.consolidation = 'isolated_peak'
    ins.severity = Math.max(1, ins.severity - 2)
  } else if (k === 2) {
    ev.consolidation = 'mild_7d_signal'
    ins.severity = Math.max(1, ins.severity - 1)
  } else ev.consolidation = 'confirmed_7d'
}

/** long terme : pente des moyennes hebdomadaires (semaines pleines se terminant le jour analysé) */
export function longTerm(name: string, days: number[]): Insight | null {
  const weeks: number[] = []
  for (let end = days.length; end - 7 >= 0 && weeks.length < WEEKS; end -= 7) {
    const w = days.slice(end - 7, end).filter(Number.isFinite)
    if (w.length >= 4) weeks.unshift(mean(w))
  }
  if (weeks.length < MIN_WEEKS) return null
  const m = mean(weeks)
  if (!m) return null
  const s = slope(weeks)
  const drift = (s * weeks.length) / Math.abs(m)
  // une pente se juge aussi face au bruit d'une semaine à l'autre
  const resid = weeks.map((y, i) => y - (m + s * (i - (weeks.length - 1) / 2)))
  const noise = stddev(resid)
  const snr = noise ? Math.abs(s * weeks.length) / noise : Infinity
  const a = Math.abs(drift)
  let severity = a >= 0.5 ? 4 : a >= 0.25 ? 3 : a >= 0.15 ? 2 : 0
  if (snr < 2) severity = Math.max(0, severity - 1)
  if (!severity) return null
  return {
    kind: 'trend',
    variable_name: name,
    severity,
    score: r3(drift),
    evidence: {
      horizon: 'long_terme',
      weekly_means: weeks.map(r3),
      slope_per_week: Number(s.toFixed(4)),
      mean: r3(m),
      drift_pct_over_window: Number((drift * 100).toFixed(1)),
      window_weeks: weeks.length,
      signal_to_noise: Number.isFinite(snr) ? Number(snr.toFixed(1)) : null,
      direction: s > 0 ? 'up' : 'down',
    },
    fallbackTitle: `Dérive ${s > 0 ? 'à la hausse' : 'à la baisse'} sur ${name} (${(drift * 100).toFixed(0)} % en ${weeks.length} semaines)`,
  }
}

export function alarmBurst(cur: number, hist: number[], events: Json[]): Insight | null {
  if (hist.length < MIN_SHORT || cur < 3) return null
  const m = mean(hist)
  if (m > 0 && cur < m * 2) return null
  const severity = cur >= 10 ? 5 : cur >= 6 ? 4 : 3
  const byName = new Map<string, number>()
  for (const e of events) if (e.name) byName.set(String(e.name), (byName.get(String(e.name)) ?? 0) + 1)
  const top = [...byName].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, count]) => ({ name, count }))
  return {
    kind: 'alarm_burst',
    variable_name: null,
    severity,
    score: cur,
    evidence: {
      current_count: cur,
      baseline_mean: Number(m.toFixed(2)),
      baseline_n: hist.length,
      first_at: events[0]?.datetime_str ?? null,
      last_at: events[events.length - 1]?.datetime_str ?? null,
      top_alarms: top,
    },
    fallbackTitle: top.length
      ? `Rafale de ${cur} alarmes (${top[0].name}${top[0].count > 1 ? ` ×${top[0].count}` : ''})`
      : `Rafale d'alarmes sur la journée (${cur} événements)`,
  }
}


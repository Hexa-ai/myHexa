// Edge Function: analyze-report
//
// Pipeline d'analyse intelligente d'un rapport daily/weekly.
//
// Contrat :
//   POST /functions/v1/analyze-report
//   Headers: Authorization: Bearer <service_role JWT>   (appelé par n8n)
//   Body: { report_id: string }
//
// Étapes :
//   1. Charge le rapport (doit être daily ou weekly)
//   2. Upsert les stats du rapport dans device_period_stats (agrégat permanent)
//   3. Pour chaque variable mesurable du payload, lance les détecteurs :
//        - anomaly (z-score vs baseline historique)
//        - trend (régression linéaire sur N périodes)
//        - alarm_burst (count d'alarm_events anormalement élevé)
//   4. Scoring 1-5 ; filtre >= 2 ; appelle Gemini sur >= 3 pour title+body
//   5. INSERT dans report_insights
//
// L'appel est idempotent par (report_id, kind, variable_name) : ré-exécuter
// supprime les anciens insights du rapport avant ré-insertion.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { ok, fail, preflight } from '../_shared/response.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? ''
const GEMINI_MODEL = 'gemini-2.5-flash'

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

// ---------- Types ----------
interface ReportRow {
  id: string
  device_id: string
  type: 'status' | 'daily' | 'weekly'
  payload: ReportPayload
  period_start: string | null
  period_end: string | null
  received_at: string
}

interface ReportPayload {
  metadata?: { hostname?: string; freq_label?: string; period_str?: string }
  variables?: Array<{
    name: string
    category?: 'measure' | 'alarm' | 'state' | 'counter'
    unit?: string | null
    description?: string | null
    type_alarm?: string | null
    value?: number
    stats?: { last?: number; min?: number; max?: number; mean?: number; median?: number }
  }>
  alarm_events?: Array<{ name?: string; type_alarm?: string; state_label?: string; datetime_str?: string }>
}

interface PeriodStatRow {
  period_start: string
  mean: number | null
  min: number | null
  max: number | null
  median: number | null
  stddev: number | null
  count_points: number | null
  alarm_event_count: number | null
}

interface DetectedInsight {
  kind: 'anomaly' | 'trend' | 'alarm_burst'
  variable_name: string | null
  severity: number
  score: number | null
  evidence: Record<string, unknown>
  fallbackTitle: string
}

// ---------- Helpers stats ----------
function mean(xs: number[]): number {
  if (xs.length === 0) return NaN
  return xs.reduce((a, b) => a + b, 0) / xs.length
}
function stddev(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = mean(xs)
  const v = xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1)
  return Math.sqrt(v)
}
// Régression linéaire simple : renvoie slope (y = slope * x + intercept) où x = index.
function linearSlope(xs: number[]): number {
  const n = xs.length
  if (n < 3) return 0
  const xMean = (n - 1) / 2
  const yMean = mean(xs)
  let num = 0, den = 0
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (xs[i] - yMean)
    den += (i - xMean) * (i - xMean)
  }
  return den === 0 ? 0 : num / den
}

// ---------- Detectors ----------
function detectAnomaly(variableName: string, current: number, baseline: number[]): DetectedInsight | null {
  if (baseline.length < 3) return null
  const m = mean(baseline)
  const sd = stddev(baseline)
  if (sd === 0) return null
  const z = Math.abs(current - m) / sd
  let severity = 0
  if (z >= 4) severity = 5
  else if (z >= 3) severity = 4
  else if (z >= 2.5) severity = 3
  else if (z >= 2) severity = 2
  if (severity === 0) return null
  const deltaPct = m !== 0 ? ((current - m) / Math.abs(m)) * 100 : null
  return {
    kind: 'anomaly',
    variable_name: variableName,
    severity,
    score: Number(z.toFixed(2)),
    evidence: {
      current: Number(current.toFixed(3)),
      baseline_mean: Number(m.toFixed(3)),
      baseline_stddev: Number(sd.toFixed(3)),
      baseline_n: baseline.length,
      z_score: Number(z.toFixed(2)),
      delta_pct: deltaPct !== null ? Number(deltaPct.toFixed(1)) : null,
    },
    fallbackTitle: `Anomalie détectée sur ${variableName} (z=${z.toFixed(1)})`,
  }
}

function detectTrend(variableName: string, historyIncludingCurrent: number[]): DetectedInsight | null {
  if (historyIncludingCurrent.length < 5) return null
  const slope = linearSlope(historyIncludingCurrent)
  const m = mean(historyIncludingCurrent)
  if (m === 0) return null
  const driftPct = (slope * historyIncludingCurrent.length) / Math.abs(m)
  const absDrift = Math.abs(driftPct)
  let severity = 0
  if (absDrift >= 0.5) severity = 4
  else if (absDrift >= 0.25) severity = 3
  else if (absDrift >= 0.15) severity = 2
  if (severity === 0) return null
  return {
    kind: 'trend',
    variable_name: variableName,
    severity,
    score: Number(driftPct.toFixed(3)),
    evidence: {
      slope_per_period: Number(slope.toFixed(4)),
      mean: Number(m.toFixed(3)),
      drift_pct_over_window: Number((driftPct * 100).toFixed(1)),
      window_size: historyIncludingCurrent.length,
      direction: slope > 0 ? 'up' : 'down',
    },
    fallbackTitle: `Tendance ${slope > 0 ? 'à la hausse' : 'à la baisse'} sur ${variableName} (${(driftPct * 100).toFixed(0)}%)`,
  }
}

function detectAlarmBurst(
  currentCount: number,
  historyCounts: number[],
  events: Array<{ name?: string; type_alarm?: string; state_label?: string; datetime_str?: string }>,
): DetectedInsight | null {
  if (historyCounts.length < 3) return null
  const m = mean(historyCounts)
  // Burst si current > 2x la moyenne ET au moins 3 événements
  if (currentCount < 3) return null
  if (m > 0 && currentCount < m * 2) return null
  if (m === 0 && currentCount < 3) return null
  let severity = 0
  if (currentCount >= 10) severity = 5
  else if (currentCount >= 6) severity = 4
  else if (currentCount >= 3) severity = 3

  // Garde un échantillon d'événements (premier, dernier, top 5)
  const onlyOn = events.filter((e) => (e.state_label ?? '').toUpperCase() === 'ON')
  const sample = (onlyOn.length > 0 ? onlyOn : events).slice(0, 5).map((e) => ({
    name: e.name ?? null,
    type: e.type_alarm ?? null,
    at: e.datetime_str ?? null,
  }))
  const first = events[0]?.datetime_str ?? null
  const last = events[events.length - 1]?.datetime_str ?? null
  // Compte par type d'alarme
  const byName = new Map<string, number>()
  for (const e of events) {
    if (!e.name) continue
    byName.set(e.name, (byName.get(e.name) ?? 0) + 1)
  }
  const topNames = Array.from(byName.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, count]) => ({ name, count }))

  return {
    kind: 'alarm_burst',
    variable_name: null,
    severity,
    score: currentCount,
    evidence: {
      current_count: currentCount,
      baseline_mean: Number(m.toFixed(2)),
      baseline_n: historyCounts.length,
      first_at: first,
      last_at: last,
      sample,
      top_alarms: topNames,
    },
    fallbackTitle: topNames.length > 0
      ? `Rafale de ${currentCount} alarmes (${topNames[0].name}${topNames[0].count > 1 ? ` ×${topNames[0].count}` : ''})`
      : `Rafale d'alarmes sur la période (${currentCount} événements)`,
  }
}

// ---------- Gemini narrative ----------
interface GeminiNarrative { title: string; body: string }

async function gemini(insight: DetectedInsight, variableMeta: { unit?: string | null; description?: string | null }): Promise<GeminiNarrative | null> {
  if (!GEMINI_API_KEY) return null
  const prompt = `Tu es un opérateur SCADA. Rédige en français un constat très bref sur cette observation issue d'un rapport de capteur industriel.

Variable: ${insight.variable_name ?? '(global)'} ${variableMeta.unit ? `(${variableMeta.unit})` : ''}
${variableMeta.description ? `Description: ${variableMeta.description}` : ''}
Type: ${insight.kind}
Sévérité (1-5): ${insight.severity}
Données: ${JSON.stringify(insight.evidence)}

Réponds en JSON STRICT :
{
  "title": "<1 phrase factuelle, max 80 caractères>",
  "body": "<1 à 2 phrases d'explication, max 200 caractères, pas alarmiste, énonce les chiffres clés>"
}
Pas de markdown, pas de backticks.`
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 400 },
      }),
    })
    if (!res.ok) { console.error('[analyze-report] gemini http', res.status); return null }
    const json = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
    const raw = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? ''
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
    if (!cleaned) return null
    const parsed = JSON.parse(cleaned) as { title?: string; body?: string }
    if (!parsed.title) return null
    return { title: parsed.title.slice(0, 120), body: (parsed.body ?? '').slice(0, 300) }
  } catch (e) {
    console.error('[analyze-report] gemini failed', e)
    return null
  }
}

// ---------- Main handler ----------
Deno.serve(async (req) => {
  const pf = preflight(req)
  if (pf) return pf
  if (req.method !== 'POST') return fail('METHOD_NOT_ALLOWED', 'Méthode non supportée', 405)

  // verify_jwt=true au niveau gateway Supabase : tout JWT valide (anon ou
  // service role) est accepté. Pas de check supplémentaire ici — l'endpoint
  // n'est appelé que côté serveur depuis n8n.

  const body = (await req.json().catch(() => null)) as { report_id?: string } | null
  if (!body?.report_id) return fail('BAD_REQUEST', 'report_id requis', 400)

  // 1. Charge le rapport
  const { data: report, error: rErr } = await admin
    .from('reports')
    .select('id, device_id, type, payload, period_start, period_end, received_at')
    .eq('id', body.report_id)
    .maybeSingle<ReportRow>()
  if (rErr) return fail('DB_ERROR', rErr.message, 500)
  if (!report) return fail('NOT_FOUND', 'Rapport introuvable', 404)
  if (report.type !== 'daily' && report.type !== 'weekly') {
    return ok({ skipped: true, reason: `report.type=${report.type} non analysé` })
  }

  const periodKind: 'daily' | 'weekly' = report.type
  const payload = report.payload ?? {}
  const variables = Array.isArray(payload.variables) ? payload.variables : []
  const alarmEvents = Array.isArray(payload.alarm_events) ? payload.alarm_events : []
  const periodStart = report.period_start ?? report.received_at.slice(0, 10)

  // 2. Upsert device_period_stats pour chaque variable analysable
  const analysableVars = variables.filter((v) => v && v.name && v.stats && typeof v.stats.mean === 'number')
  const upserts = analysableVars.map((v) => ({
    device_id: report.device_id,
    variable_name: v.name,
    period_kind: periodKind,
    period_start: periodStart,
    mean: v.stats?.mean ?? null,
    min: v.stats?.min ?? null,
    max: v.stats?.max ?? null,
    median: v.stats?.median ?? null,
    stddev: null,                                  // pas fourni par le device
    count_points: null,
    alarm_event_count: alarmEvents.length,
  }))
  if (upserts.length > 0) {
    const { error: uErr } = await admin
      .from('device_period_stats')
      .upsert(upserts, { onConflict: 'device_id,variable_name,period_kind,period_start' })
    if (uErr) console.error('[analyze-report] period_stats upsert failed', uErr.message)
  }

  // 3. Charge l'historique des stats (sur ~90 jours = ~90 daily / ~13 weekly) — exclut la période courante
  const horizonDays = 90
  const sinceDate = new Date(Date.now() - horizonDays * 86400_000).toISOString().slice(0, 10)
  const { data: historyRows, error: hErr } = await admin
    .from('device_period_stats')
    .select('variable_name, period_start, mean, min, max, median, stddev, count_points, alarm_event_count')
    .eq('device_id', report.device_id)
    .eq('period_kind', periodKind)
    .gte('period_start', sinceDate)
    .lt('period_start', periodStart)
    .order('period_start', { ascending: true })
  if (hErr) return fail('DB_ERROR', `history fetch: ${hErr.message}`, 500)

  // Indexe l'historique par variable
  const historyByVar = new Map<string, PeriodStatRow[]>()
  for (const row of historyRows ?? []) {
    const arr = historyByVar.get(row.variable_name) ?? []
    arr.push(row as PeriodStatRow)
    historyByVar.set(row.variable_name, arr)
  }

  // 4. Détecteurs par variable mesurable
  const detected: DetectedInsight[] = []
  for (const v of analysableVars) {
    if (v.category && v.category !== 'measure' && v.category !== 'counter') continue
    const current = v.stats?.mean
    if (typeof current !== 'number' || !Number.isFinite(current)) continue
    const history = historyByVar.get(v.name) ?? []
    const baselineMeans = history.map((h) => h.mean).filter((x): x is number => typeof x === 'number' && Number.isFinite(x))
    const anomaly = detectAnomaly(v.name, current, baselineMeans)
    if (anomaly) detected.push(anomaly)
    const trendSeries = [...baselineMeans, current]
    const trend = detectTrend(v.name, trendSeries)
    if (trend) detected.push(trend)
  }

  // alarm_burst
  const alarmHistory = Array.from(historyByVar.values()).flat()
    .map((r) => r.alarm_event_count)
    .filter((x): x is number => typeof x === 'number')
  // déduplique : on a poussé alarm_event_count sur chaque variable, donc on prend juste les valeurs distinctes par period_start
  const distinctAlarmCounts = (() => {
    const seen = new Map<string, number>()
    for (const row of historyRows ?? []) {
      if (typeof row.alarm_event_count === 'number') seen.set(row.period_start, row.alarm_event_count)
    }
    return Array.from(seen.values())
  })()
  const burst = detectAlarmBurst(
    alarmEvents.length,
    distinctAlarmCounts.length > 0 ? distinctAlarmCounts : alarmHistory,
    alarmEvents,
  )
  if (burst) detected.push(burst)

  // 5. Idempotence : supprime les anciens insights du même rapport
  if (detected.length > 0) {
    await admin.from('report_insights').delete().eq('report_id', report.id)
  }

  // 6. Filtre + Gemini + INSERT
  const insightsToInsert: Array<{
    report_id: string; device_id: string; period_kind: 'daily' | 'weekly';
    variable_name: string | null; kind: string; severity: number; score: number | null;
    title: string; body: string | null; evidence: Record<string, unknown>;
  }> = []

  for (const ins of detected.filter((d) => d.severity >= 2)) {
    let title = ins.fallbackTitle
    let bodyText: string | null = null
    if (ins.severity >= 3) {
      const varMeta = analysableVars.find((v) => v.name === ins.variable_name)
      const narrative = await gemini(ins, { unit: varMeta?.unit ?? null, description: varMeta?.description ?? null })
      if (narrative) {
        title = narrative.title
        bodyText = narrative.body
      }
    }
    insightsToInsert.push({
      report_id: report.id,
      device_id: report.device_id,
      period_kind: periodKind,
      variable_name: ins.variable_name,
      kind: ins.kind,
      severity: ins.severity,
      score: ins.score,
      title,
      body: bodyText,
      evidence: ins.evidence,
    })
  }

  if (insightsToInsert.length > 0) {
    const { error: iErr } = await admin.from('report_insights').insert(insightsToInsert)
    if (iErr) return fail('DB_ERROR', `insert insights: ${iErr.message}`, 500)
  }

  return ok({
    report_id: report.id,
    detected_count: detected.length,
    inserted_count: insightsToInsert.length,
    variables_analyzed: analysableVars.length,
  })
})

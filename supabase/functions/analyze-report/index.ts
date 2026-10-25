// Edge Function: analyze-report
//
// Analyse des dérives d'une box à partir de l'HISTORIQUE (fichiers Parquet, niveau journalier),
// et non plus des seules stats du rapport (les rapports hebdo ne sont plus utilisés).
//
// Contrat :
//   POST /functions/v1/analyze-report   (JWT service role ; appelé par ts-build après la construction du jour)
//   Body: { report_id: string }          rapport journalier dont on analyse la journée
//
// Trois horizons, sur la moyenne journalière de chaque mesure (total journalier pour un compteur) :
//   - court terme  (anomaly) : la journée face aux 28 jours précédents (z-score robuste médiane / MAD)
//   - confirmation : les 7 derniers jours face aux semaines glissantes des 12 semaines précédentes ;
//                    un écart d'un jour qui ne se voit pas sur la semaine est déclassé (pic isolé)
//   - long terme   (trend)   : pente des moyennes hebdomadaires sur 12 semaines (dérive lente) ;
//                    signalée au plus une fois par semaine et par variable, sauf aggravation
//   - rafale d'alarmes : nombre d'événements du jour face aux 28 jours précédents
// Score 1-5 ; on garde >= 2 ; texte Gemini pour >= 3. Idempotent par rapport.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { ok, fail, preflight } from '../_shared/response.ts'
import { DAY, readSeries, type VarMeta } from '../_shared/tsread.ts'
import { alarmBurst, confirm, longTerm, shortTerm, SHORT_DAYS, WEEKS, type Insight, type Json } from '../_shared/drift.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? ''
const GEMINI_MODEL = 'gemini-2.5-flash'

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

// ---------- texte (Gemini) ----------
async function gemini(ins: Insight, meta?: VarMeta): Promise<{ title: string; body: string } | null> {
  if (!GEMINI_API_KEY) return null
  const horizon = ins.kind === 'trend' ? 'dérive lente sur plusieurs semaines' : ins.kind === 'anomaly' ? 'journée inhabituelle' : 'alarmes'
  const prompt = `Tu es un opérateur SCADA. Rédige en français un constat très bref sur cette observation issue de l'historique d'un capteur industriel.

Variable: ${ins.variable_name ?? '(global)'} ${meta?.unit ? `(${meta.unit})` : ''}
${meta?.description ? `Description: ${meta.description}` : ''}
Type: ${horizon}
Sévérité (1-5): ${ins.severity}
Données: ${JSON.stringify(ins.evidence)}

Réponds en JSON STRICT :
{"title": "<1 phrase factuelle, max 80 caractères>", "body": "<1 à 2 phrases, max 200 caractères, pas alarmiste, chiffres clés>"}
Pas de markdown, pas de backticks.`
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 400, responseMimeType: 'application/json' },
        }),
        signal: AbortSignal.timeout(15_000),
      },
    )
    if (!res.ok) return null
    const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
    const raw = (j?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
    const p = JSON.parse(raw) as { title?: string; body?: string }
    return p.title ? { title: p.title.slice(0, 120), body: (p.body ?? '').slice(0, 300) } : null
  } catch {
    return null
  }
}

// ---------- analyse ----------
async function analyze(reportId: string) {
  const { data: report, error } = await admin
    .from('reports')
    .select('id, device_id, type, payload, period_start')
    .eq('id', reportId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!report) return { skipped: true, reason: 'rapport introuvable' }
  if (report.type !== 'daily') return { skipped: true, reason: `type ${report.type} non analysé` }
  const payload = (report.payload ?? {}) as Json
  const tr = (payload.time_range ?? {}) as Json
  const dayStart = Number(tr.start_ms) || Date.parse(report.period_start + 'T00:00:00Z')
  const dayEnd = dayStart + DAY
  const tz = ((payload.metadata ?? {}) as Json).timezone as string | undefined

  // catalogue : mesures et compteurs uniquement (les états / alarmes ne se moyennent pas)
  const { data: cat } = await admin.from('ts_vars').select('var, unit, category, description').eq('device_id', report.device_id)
  const meta = new Map<string, VarMeta>()
  for (const c of cat ?? []) meta.set(c.var as string, { unit: c.unit as string, category: c.category as string, description: c.description as string })
  const vars = [...meta].filter(([, m]) => m.category === 'measure' || m.category === 'counter').map(([k]) => k)

  // historique journalier : (WEEKS + 1) semaines se terminant le jour analysé
  const nDays = (WEEKS + 1) * 7
  const from = dayEnd - nDays * DAY
  const hist = vars.length
    ? await readSeries(admin, admin, report.device_id, vars, from, dayEnd - 1, meta, { level: '1d', tz })
    : { series: [] }

  const detected: Insight[] = []
  for (const s of hist.series) {
    // tableau d'un point par jour (NaN si absent), le dernier = jour analysé
    const days = new Array(nDays).fill(NaN) as number[]
    for (const [ts, v] of s.points) {
      const i = Math.round((ts - from) / DAY)
      if (i >= 0 && i < nDays && typeof v === 'number' && Number.isFinite(v)) days[i] = v
    }
    const cur = days[nDays - 1]
    const ok = (xs: number[]) => xs.filter(Number.isFinite)
    if (Number.isFinite(cur)) {
      const a = shortTerm(s.var, cur, ok(days.slice(nDays - 1 - SHORT_DAYS, nDays - 1)), s.category === 'counter' ? 10 : 5)
      if (a) {
        confirm(a, days)
        detected.push(a)
      }
    }
    const t = longTerm(s.var, days)
    if (t) detected.push(t)
  }

  // long terme : pas de répétition quotidienne (une fois par semaine et par variable, sauf aggravation)
  const trends = detected.filter((d) => d.kind === 'trend')
  if (trends.length) {
    const { data: recent } = await admin
      .from('report_insights')
      .select('variable_name, severity, evidence, report_id')
      .eq('device_id', report.device_id)
      .eq('kind', 'trend')
      .neq('report_id', report.id)
      .gte('created_at', new Date(Date.now() - 6 * DAY).toISOString())
    for (const t of trends) {
      const prev = (recent ?? []).find(
        (r) => r.variable_name === t.variable_name && (r.evidence as Json)?.direction === t.evidence.direction,
      )
      if (prev && t.severity <= (prev.severity as number)) t.severity = 0
    }
  }

  // rafale d'alarmes : événements du jour face aux journaliers précédents
  const events = (Array.isArray(payload.alarm_events) ? payload.alarm_events : []) as Json[]
  const { data: prevReports } = await admin
    .from('reports')
    .select('payload->alarm_events')
    .eq('device_id', report.device_id)
    .eq('type', 'daily')
    .lt('period_start', report.period_start)
    .gte('period_start', new Date(dayStart - SHORT_DAYS * DAY).toISOString().slice(0, 10))
  const hCounts = (prevReports ?? []).map((r: Json) => (Array.isArray(r.alarm_events) ? r.alarm_events.length : 0))
  const burst = alarmBurst(events.length, hCounts, events)
  if (burst) detected.push(burst)

  const keep = detected.filter((d) => d.severity >= 2)
  await admin.from('report_insights').delete().eq('report_id', report.id)
  const rows = []
  for (const ins of keep) {
    let title = ins.fallbackTitle
    let body: string | null = null
    if (ins.severity >= 3) {
      const n = await gemini(ins, ins.variable_name ? meta.get(ins.variable_name) : undefined)
      if (n) {
        title = n.title
        body = n.body
      }
    }
    rows.push({
      report_id: report.id,
      device_id: report.device_id,
      period_kind: 'daily',
      variable_name: ins.variable_name,
      kind: ins.kind,
      severity: ins.severity,
      score: ins.score,
      title,
      body,
      evidence: ins.evidence,
    })
  }
  if (rows.length) {
    const { error: iErr } = await admin.from('report_insights').insert(rows)
    if (iErr) throw new Error('insert insights: ' + iErr.message)
  }
  return {
    report_id: report.id,
    day: report.period_start,
    variables_analyzed: hist.series.length,
    detected_count: detected.length,
    inserted_count: rows.length,
    insights: rows.map((r) => ({ kind: r.kind, var: r.variable_name, severity: r.severity, title: r.title })),
  }
}

Deno.serve(async (req) => {
  const pf = preflight(req)
  if (pf) return pf
  if (req.method !== 'POST') return fail('METHOD_NOT_ALLOWED', 'Méthode non supportée', 405)
  // service role uniquement (ts-build) : la fonction écrit pour n'importe quelle box
  if ((req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '') !== SERVICE_ROLE)
    return fail('FORBIDDEN', 'réservé au serveur', 403)
  const body = (await req.json().catch(() => null)) as { report_id?: string } | null
  if (!body?.report_id) return fail('BAD_REQUEST', 'report_id requis', 400)
  try {
    return ok(await analyze(body.report_id))
  } catch (e) {
    return fail('ANALYZE_ERROR', String(e), 500)
  }
})

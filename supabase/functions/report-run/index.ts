// Edge Function: report-run (PROTOTYPE, myHexa-test)
// Génère (et envoie) les rapports périodiques à partir des blocs d'un tableau de bord.
//   POST x-cron-secret {}                                    -> traite les modèles échus (cron toutes les 15 min)
//   POST JWT {action:'preview', dashboard_id, frequency, compare?, at?}  -> HTML (images en data URI) + CSV, rien n'est envoyé
//   POST JWT {action:'run', template_id}                      -> génère + envoie maintenant (admin de l'entreprise)
// Mail : HTML une colonne (600 px), graphiques en PNG inline (cid), CSV en pièce jointe en option.
// Sur un projet sans configuration Gmail (test), le rapport est archivé avec le statut « not_sent ».
// REPORT_MAIL_ALLOW_DOMAIN (facultatif) : seuls les destinataires de ce domaine reçoivent le mail (test : équipe).
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { ok, fail, preflight } from '../_shared/response.ts'
import { readSeries, type Series, type VarMeta } from '../_shared/tsread.ts'
import { fmtNum, gaugeSvg, svgToPng, timeChartSvg, type ChartSeries, type Pt } from '../_shared/svgchart.ts'
import { mailerConfigured, sendMail } from '../_shared/mailer.ts'
import { buildPdf, type PdfBlock } from '../_shared/pdfreport.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? ''
const ALLOW_DOMAIN = (Deno.env.get('REPORT_MAIL_ALLOW_DOMAIN') ?? '').toLowerCase().trim()
const APP_URL = Deno.env.get('APP_URL') ?? 'https://my.hexa-ai.fr'
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

const COLORS = ['#00a88a', '#3b6fe0', '#e08a00', '#c043b4', '#e05050', '#5fa82c']
const FREQ_LABEL: Record<string, string> = { daily: 'Rapport journalier', weekly: 'Rapport hebdomadaire', monthly: 'Rapport mensuel' }
const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

interface Widget {
  type: string
  width: string
  title: string | null
  sources: { device: string; var: string }[]
  op: 'sum' | 'mean' | 'min' | 'max' | null
  options: Record<string, any>
}
interface Device {
  id: string
  name: string
  last_connection_at: string | null
  status_payload: any
}
interface Ctx {
  from: number
  to: number
  cmpFrom: number | null
  cmpTo: number | null
  tz: string
  devices: Map<string, Device>
  meta: Map<string, Map<string, VarMeta>>
  data: Map<string, Series>
  cmp: Map<string, Series>
  images: { cid: string; png: Uint8Array; type?: string }[]
  multi: boolean
}

// ---------- période ----------
function shift(from: number, to: number, compare: string): [number, number] | null {
  if (compare === 'previous') return [from - (to - from), from]
  if (compare === 'year') {
    const y = (t: number) => {
      const d = new Date(t)
      d.setUTCFullYear(d.getUTCFullYear() - 1)
      return d.getTime()
    }
    return [y(from), y(to)]
  }
  return null
}

// ---------- données ----------
async function loadAll(widgets: Widget[], ctx: Ctx) {
  const byDev = new Map<string, Set<string>>()
  for (const w of widgets) for (const s of w.sources) if (s.var) (byDev.get(s.device) ?? byDev.set(s.device, new Set()).get(s.device)!).add(s.var)
  await Promise.all(
    [...byDev].map(async ([dev, vars]) => {
      const meta = ctx.meta.get(dev) ?? new Map()
      const r = await readSeries(admin, admin, dev, [...vars], ctx.from, ctx.to, meta, { tz: ctx.tz })
      for (const s of r.series) ctx.data.set(dev + '|' + s.var, s)
      if (ctx.cmpFrom !== null) {
        const c = await readSeries(admin, admin, dev, [...vars], ctx.cmpFrom, ctx.cmpTo!, meta, { tz: ctx.tz })
        for (const s of c.series) ctx.cmp.set(dev + '|' + s.var, s)
      }
    }),
  )
}

function combine(series: Series[], op: string): Pt[] {
  if (series.length === 1) return series[0].points as Pt[]
  const steps = series
    .map((s) => {
      const d = s.points.slice(1).map((p, i) => p[0] - s.points[i][0]).sort((a, b) => a - b)
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
        op === 'sum' ? vs.reduce((a, b) => a + b, 0)
        : op === 'mean' ? vs.reduce((a, b) => a + b, 0) / vs.length
        : op === 'min' ? Math.min(...vs)
        : Math.max(...vs)
      return [t, v, null, null] as Pt
    })
}

function statOf(points: Pt[], stat: string): number | null {
  const vals = points.filter((p) => p[1] !== null)
  if (!vals.length) return null
  if (stat === 'last') return vals[vals.length - 1][1]
  if (stat === 'total') return vals.reduce((a, p) => a + (p[1] ?? 0), 0)
  if (stat === 'mean') return vals.reduce((a, p) => a + (p[1] ?? 0), 0) / vals.length
  if (stat === 'min') return Math.min(...vals.map((p) => p[2] ?? p[1]!))
  return Math.max(...vals.map((p) => p[3] ?? p[1]!))
}

const isCounter = (s?: Series | null) => s?.category === 'counter'
const devName = (ctx: Ctx, id: string) => ctx.devices.get(id)?.name ?? '—'
const label = (ctx: Ctx, dev: string, v: string) => (ctx.multi ? `${devName(ctx, dev)} · ${v}` : v)

/** séries d'un bloc pour une carte de données : une combinée (op) ou une par source */
function seriesOf(w: Widget, map: Map<string, Series>, ctx: Ctx) {
  const list = w.sources
    .filter((s) => s.var)
    .map((s) => ({ s, ser: map.get(s.device + '|' + s.var) }))
    .filter((x) => !!x.ser) as { s: { device: string; var: string }; ser: Series }[]
  if (w.op && list.length > 1)
    return [
      {
        label: `${{ sum: 'Somme', mean: 'Moyenne', min: 'Minimum', max: 'Maximum' }[w.op]} (${list.length} variables)`,
        unit: list[0].ser.unit,
        counter: isCounter(list[0].ser),
        state: false,
        desc: list.map((x) => label(ctx, x.s.device, x.s.var)).join(' + '),
        points: combine(list.map((x) => x.ser), w.op),
      },
    ]
  return list.map((x) => ({
    label: label(ctx, x.s.device, x.s.var),
    unit: x.ser.unit,
    counter: isCounter(x.ser),
    state: ['state', 'alarm'].includes(x.ser.category ?? ''),
    desc: x.ser.description ?? '',
    points: x.ser.points as Pt[],
  }))
}

function liveOf(ctx: Ctx, dev: string, name: string): number | null {
  const vars = ctx.devices.get(dev)?.status_payload?.variables as { name?: string; value?: unknown }[] | undefined
  const v = vars?.find((x) => x.name === name)?.value
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'number') return v
  return typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v)) ? Number(v) : null
}

function barMs(span: number) {
  return span <= 3 * 86400e3 ? 3600e3 : span <= 124 * 86400e3 ? 86400e3 : 7 * 86400e3
}

// ---------- blocs : modèle commun au mail (HTML) et au PDF ----------
interface Cell {
  t: string
  size?: number
  bold?: boolean
  color?: string
  right?: boolean
  dot?: string
  img?: string // URL d'image (HTML seulement ; le PDF garde la pastille de couleur)
}
interface Img {
  png: Uint8Array
  w: number
  h: number
  cid: string
}
type Part =
  | { k: 'img'; img: Img }
  | { k: 'imgs'; list: Img[]; caption?: string }
  | { k: 'rows'; head?: string[]; rows: Cell[][]; widths: number[] }
  | { k: 'text'; t: string; color?: string; size?: number; bold?: boolean }
  | { k: 'legend'; items: { color: string; label: string }[]; extra?: string }
  | { k: 'url'; url: string }
interface Block {
  title: string
  sub?: string
  parts: Part[]
}

const deltaCell = (v: number | null, c: number | null): Cell => {
  if (v === null || c === null || c === 0) return { t: '—', right: true, color: '#9ca3af' }
  const d = ((v - c) / Math.abs(c)) * 100
  return { t: `${d >= 0 ? '+' : ''}${fmtNum(d, 1)} %`, right: true, color: d >= 0 ? '#047857' : '#b91c1c' }
}

async function image(ctx: Ctx, svg: string, w: number, h: number): Promise<Img> {
  const png = await svgToPng(svg, 2)
  const img = { png, w, h, cid: `img${ctx.images.length + 1}` }
  ctx.images.push({ cid: img.cid, png })
  return img
}

const DEFAULT_STATES = [
  { value: 0, label: 'Arrêt', color: '#8a8f98' },
  { value: 1, label: 'Marche', color: '#16a34a' },
]
const empty = (title: string, t = 'pas de données sur la période'): Block => ({ title, parts: [{ k: 'text', t, color: '#9ca3af' }] })

async function renderWidget(w: Widget, ctx: Ctx, cmpLabel: string): Promise<Block | null> {
  const ser = seriesOf(w, ctx.data, ctx)
  const cser = seriesOf(w, ctx.cmp, ctx)
  const title = w.title || (ser.length === 1 ? ser[0].label : '') || ''
  const span = ctx.to - ctx.from
  switch (w.type) {
    case 'curve':
    case 'bars': {
      if (!ser.length) return empty(title || 'Graphique')
      const missing = w.sources.filter((x) => x.var && !ctx.data.get(x.device + '|' + x.var)?.points.length).map((x) => label(ctx, x.device, x.var))
      const bars = w.type === 'bars' || ser[0].counter
      const groups = !w.op && w.options.separate ? ser.map((s) => [s]) : [ser]
      const parts: Part[] = []
      for (const g of groups) {
        const leftUnit = g[0].unit ?? ''
        const cs: ChartSeries[] = g.map((s, i) => ({
          points: s.points,
          label: s.label,
          unit: s.unit,
          color: COLORS[ser.indexOf(s) % COLORS.length],
          axis: i > 0 && (s.unit ?? '') !== leftUnit ? 'right' : 'left',
          step: s.state,
        }))
        if (groups.length > 1) parts.push({ k: 'text', t: g[0].label, bold: true, size: 12 })
        const total = bars && g.length === 1 ? `Total : ${fmtNum(statOf(g[0].points, 'total'))} ${g[0].unit ?? ''}` : ''
        if (g.length > 1)
          parts.push({ k: 'legend', items: cs.map((c) => ({ color: c.color, label: `${c.label} ${c.unit ?? ''}${c.axis === 'right' ? ' (axe droit)' : ''}` })), extra: total })
        else parts.push({ k: 'text', t: [g[0].unit ?? '', g[0].desc, total].filter((x) => x).join(' · '), color: '#6b7280', size: 11 })
        parts.push({ k: 'img', img: await image(ctx, timeChartSvg({ series: cs, from: ctx.from, to: ctx.to, tz: ctx.tz, bars: bars ? barMs(span) : 0 }), 600, 210) })
      }
      if (missing.length) parts.push({ k: 'text', t: `Sans données sur la période : ${missing.join(', ')}`, color: '#9ca3af', size: 11 })
      return { title: title || 'Graphique', parts }
    }
    case 'value':
    case 'gauge': {
      const counterDefault = ser[0]?.counter ? 'total' : 'mean'
      // dans un rapport, « dernière valeur » a peu de sens : moyenne de la période par défaut (total pour les compteurs)
      const stat = w.options.stat && w.options.stat !== 'last' ? w.options.stat : counterDefault
      const statLabel = { mean: 'Moyenne', min: 'Minimum', max: 'Maximum', total: 'Total', last: 'Dernière' }[stat as string]!
      if (w.type === 'gauge') {
        // une jauge par variable (ou une seule si opération) ; une variable sans historique prend la valeur du dernier statut
        const gs = (w.op && ser.length
          ? ser
          : w.sources.filter((x) => x.var).map((x) => {
              const d = ctx.data.get(x.device + '|' + x.var)
              return { label: label(ctx, x.device, x.var), unit: d?.unit ?? null, points: (d?.points ?? []) as Pt[], live: liveOf(ctx, x.device, x.var) }
            })) as { label: string; unit: string | null; points: Pt[]; live?: number | null }[]
        if (!gs.length) return empty(title || 'Jauge')
        const list: Img[] = []
        for (const s of gs) {
          const v = s.points.length ? statOf(s.points, stat) : (s.live ?? null)
          const lo = w.options.min ?? statOf(s.points, 'min') ?? (v !== null ? Math.min(0, v) : 0)
          const hi = w.options.max ?? statOf(s.points, 'max') ?? (v !== null ? Math.max(1, v) : 1)
          const multi = gs.length > 1
          list.push(await image(ctx, gaugeSvg(v, lo, hi, s.unit, multi ? s.label : undefined), 200, multi ? 140 : 125))
        }
        return { title: title || gs[0].label, parts: [{ k: 'imgs', list, caption: `${statLabel} de la période` }] }
      }
      if (!ser.length) return empty(title || 'Valeur', 'pas de données')
      const cmp = ctx.cmpFrom !== null
      return {
        title: title || statLabel,
        sub: statLabel + ' de la période',
        parts: [
          {
            k: 'rows',
            widths: cmp ? [0.45, 0.33, 0.22] : [0.55, 0.45],
            rows: ser.map((s, i) => {
              const v = statOf(s.points, stat)
              const c = cser[i] ? statOf(cser[i].points, stat) : null
              const row: Cell[] = [
                { t: s.label, color: '#374151' },
                { t: `${fmtNum(v, w.options.decimals)} ${s.unit ?? ''}`, size: 18, bold: true, right: true },
              ]
              if (cmp) row.push({ ...deltaCell(v, c), t: `${deltaCell(v, c).t} (${cmpLabel} : ${fmtNum(c)})`, size: 10 })
              return row
            }),
          },
        ],
      }
    }
    case 'indicator': {
      const states = (w.options.states?.length ? w.options.states : DEFAULT_STATES) as { value: number; label: string; color: string; image?: string }[]
      const valOf = (src: { device: string; var: string }) => {
        const s = ctx.data.get(src.device + '|' + src.var)
        const v = s ? statOf(s.points as Pt[], 'last') : null
        return v ?? liveOf(ctx, src.device, src.var) // pas d'historique (alarmes) : état du dernier statut
      }
      const look = (v: number | null) => {
        const st = v === null ? null : states.find((x) => Number(x.value) === v)
        return { color: st?.color ?? '#8a8f98', txt: st?.label ?? (v === null ? 'inconnu' : `état ${fmtNum(v)}`), image: st?.image }
      }
      const srcs = w.sources.filter((src) => src.var)
      if (w.options.combine && srcs.length > 1) {
        const vals = srcs.map(valOf)
        const nn = vals.filter((x): x is number => x !== null)
        const mode = w.options.combine
        const v = !nn.length ? null : mode === 'any' ? (nn.some((x) => x !== 0) ? 1 : 0) : mode === 'all' ? (nn.length === vals.length && nn.every((x) => x !== 0) ? 1 : 0) : Math.max(...nn)
        const l = look(v)
        const active = srcs.filter((_, i) => vals[i] !== null && vals[i] !== 0).map((x) => label(ctx, x.device, x.var))
        return {
          title: title || 'Synthèse',
          sub: 'dernier état connu',
          parts: [
            { k: 'rows', widths: [1], rows: [[{ t: l.txt, dot: l.color, color: l.color, bold: true, size: 15, img: l.image }]] },
            { k: 'text', t: `${srcs.length} états · ${active.length ? 'actifs : ' + active.join(', ') : 'aucun actif'}`, color: '#6b7280', size: 11 },
          ],
        }
      }
      return {
        title: title || 'États',
        sub: 'dernier état connu',
        parts: [
          {
            k: 'rows',
            widths: [0.6, 0.4],
            rows: srcs.map((src) => {
              const l = look(valOf(src))
              return [
                { t: label(ctx, src.device, src.var), dot: l.color, img: l.image },
                { t: l.txt, color: l.color, bold: true, right: true },
              ]
            }),
          },
        ],
      }
    }
    case 'states': {
      const parts: Part[] = []
      for (const s of ser) {
        const pts = s.points.filter((p) => p[1] !== null && p[0] < ctx.to)
        const acc = new Map<number, number>()
        for (let i = 0; i < pts.length; i++) {
          const a = Math.max(pts[i][0], ctx.from)
          const b = Math.min(i + 1 < pts.length ? pts[i + 1][0] : ctx.to, ctx.to)
          if (b > a) acc.set(pts[i][1]!, (acc.get(pts[i][1]!) ?? 0) + (b - a))
        }
        const tot = [...acc.values()].reduce((a, b) => a + b, 0) || 1
        parts.push({ k: 'text', t: s.label, bold: true, size: 12 })
        parts.push({
          k: 'rows',
          widths: [0.5, 0.25, 0.25],
          rows: [...acc].sort((a, b) => b[1] - a[1]).map(([v, ms]) => [
            { t: `état ${fmtNum(v)}` },
            { t: `${fmtNum(ms / 3600e3, 1)} h`, right: true },
            { t: `${fmtNum((ms / tot) * 100, 0)} %`, right: true },
          ]),
        })
      }
      return parts.length ? { title: title || 'Créneaux d’états', parts } : empty(title || 'Créneaux d’états', 'pas de données')
    }
    case 'table': {
      const cmp = ctx.cmpFrom !== null
      const rows = w.sources
        .filter((s) => s.var)
        .map((s) => {
          const d = ctx.data.get(s.device + '|' + s.var)
          const c = ctx.cmp.get(s.device + '|' + s.var)
          const pts = (d?.points ?? []) as Pt[]
          const counter = isCounter(d)
          const main = statOf(pts, counter ? 'total' : 'mean')
          const cm = c ? statOf(c.points as Pt[], counter ? 'total' : 'mean') : null
          const row: Cell[] = [
            { t: `${label(ctx, s.device, s.var)} ${d?.unit ?? ''}` },
            { t: counter ? '' : fmtNum(statOf(pts, 'min')), right: true },
            { t: fmtNum(statOf(pts, 'mean')), right: true },
            { t: counter ? '' : fmtNum(statOf(pts, 'max')), right: true },
            { t: fmtNum(statOf(pts, counter ? 'total' : 'last')), right: true },
          ]
          if (cmp) row.push(deltaCell(main, cm))
          return row
        })
      return {
        title: title || 'Synthèse',
        parts: [
          {
            k: 'rows',
            head: ['Variable', 'Min', 'Moy.', 'Max', 'Total / dern.', ...(cmp ? [cmpLabel] : [])],
            widths: cmp ? [0.36, 0.12, 0.12, 0.12, 0.14, 0.14] : [0.4, 0.15, 0.15, 0.15, 0.15],
            rows,
          },
        ],
      }
    }
    case 'status':
    case 'map': {
      const states = (w.options.states?.length ? w.options.states : DEFAULT_STATES) as { value: number; label: string; color: string }[]
      const fmtD = new Intl.DateTimeFormat('fr-FR', { timeZone: ctx.tz, dateStyle: 'short', timeStyle: 'short' })
      const rows = [...new Map(w.sources.map((x) => [x.device, x])).values()]
        .map((src) => {
          const d = ctx.devices.get(src.device)
          if (!d) return null
          const online = !!d.last_connection_at && Date.now() - Date.parse(d.last_connection_at) < 2 * 3600e3
          let color = online ? '#16a34a' : '#dc2626'
          let txt = w.type === 'status' ? `dernier contact ${d.last_connection_at ? fmtD.format(new Date(d.last_connection_at)) : '—'}` : online ? 'connectée' : 'déconnectée'
          if (w.type === 'map' && src.var) {
            const v = liveOf(ctx, src.device, src.var)
            const st = v === null ? null : states.find((x) => Number(x.value) === v)
            color = st?.color ?? '#8a8f98'
            txt = `${src.var} : ${st?.label ?? (v === null ? 'inconnu' : 'état ' + fmtNum(v))}`
          }
          const pos = w.type === 'map' && (d as any).latitude == null ? ' (sans position)' : ''
          return [
            { t: d.name + pos, dot: color },
            { t: txt, right: true, color: w.type === 'map' ? color : '#6b7280' },
          ] as Cell[]
        })
        .filter((r): r is Cell[] => !!r)
      return { title: title || 'Box', sub: w.type === 'map' ? 'carte disponible dans le portail' : 'au moment de l’envoi', parts: [{ k: 'rows', widths: [0.55, 0.45], rows }] }
    }
    case 'text':
      return { title: title || '', parts: [{ k: 'text', t: w.options.text ?? '' }] }
    case 'image':
      return w.options.url && /^https:\/\//.test(w.options.url) ? { title: title || '', parts: [{ k: 'url', url: w.options.url }] } : null
  }
  return null
}

// ---------- HTML (mail : tables + styles en ligne) ----------
function cellHtml(c: Cell, wPct: number) {
  const look = c.img
    ? `<img src="${esc(c.img)}" width="20" height="20" style="vertical-align:middle;margin-right:6px" alt="">`
    : c.dot
      ? `<span style="display:inline-block;width:10px;height:10px;border-radius:5px;background:${c.dot};margin-right:6px"></span>`
      : ''
  return `<td${c.right ? ' align="right"' : ''} width="${Math.round(wPct * 100)}%" style="padding:4px 4px 4px 0;font:${c.bold ? 600 : 400} ${c.size ?? 12}px Arial,sans-serif;color:${c.color ?? '#111827'}">${look}${esc(c.t)}</td>`
}
function blockHtml(b: Block): string {
  const inner = b.parts
    .map((p) => {
      switch (p.k) {
        case 'img':
          return `<img src="cid:${p.img.cid}" width="${p.img.w}" style="display:block;width:100%;max-width:${p.img.w}px;height:auto;border:0" alt="graphique">`
        case 'imgs':
          return `<table role="presentation" width="100%"><tr>${p.list.map((i) => `<td align="center" style="padding:4px"><img src="cid:${i.cid}" width="${i.w}" style="display:block;width:100%;max-width:${i.w}px;height:auto;border:0" alt=""></td>`).join('')}</tr></table>${p.caption ? `<div style="font:11px Arial,sans-serif;color:#6b7280;text-align:center">${esc(p.caption)}</div>` : ''}`
        case 'rows':
          return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${p.head ? `<tr>${p.head.map((h, i) => `<td${i ? ' align="right"' : ''} style="padding:4px 4px 4px 0;font:600 10px Arial,sans-serif;color:#6b7280;text-transform:uppercase">${esc(h)}</td>`).join('')}</tr>` : ''}${p.rows.map((r) => `<tr style="border-top:1px solid #f1f5f9">${r.map((c, i) => cellHtml(c, p.widths[i] ?? 0)).join('')}</tr>`).join('')}</table>`
        case 'text':
          return `<div style="font:${p.bold ? 600 : 400} ${p.size ?? 13}px Arial,sans-serif;color:${p.color ?? '#111827'};margin:3px 0;white-space:pre-line">${esc(p.t)}</div>`
        case 'legend':
          return `<div style="font:11px Arial,sans-serif;color:#374151;margin:2px 0 4px 0">${p.items.map((i) => `<span style="color:${i.color}">&#9632;</span> ${esc(i.label)}`).join(' &nbsp; ')}${p.extra ? ` &nbsp; <b>${esc(p.extra)}</b>` : ''}</div>`
        case 'url':
          return `<img src="${esc(p.url)}" style="max-width:100%;height:auto" alt="">`
      }
    })
    .join('')
  return `<tr><td style="padding:0 0 14px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;background:#ffffff">
<tr><td style="padding:14px 16px 4px 16px;font:600 14px Arial,sans-serif;color:#111827">${esc(b.title)}${b.sub ? `<div style="font:400 11px Arial,sans-serif;color:#6b7280;margin-top:2px">${esc(b.sub)}</div>` : ''}</td></tr>
<tr><td style="padding:6px 16px 14px 16px;font:13px Arial,sans-serif;color:#111827">${inner}</td></tr></table></td></tr>`
}

// ---------- CSV (Excel France) ----------
function toCsv(ctx: Ctx, widgets: Widget[], head: string[]): string {
  const keys = [...new Set(widgets.flatMap((w) => w.sources.filter((s) => s.var).map((s) => s.device + '|' + s.var)))]
  const cols = keys.filter((k) => ctx.data.has(k))
  const rows = new Map<number, (number | null)[]>()
  cols.forEach((k, i) => {
    for (const p of ctx.data.get(k)!.points) {
      if (p[1] === null) continue
      const r = rows.get(p[0]) ?? rows.set(p[0], Array(cols.length).fill(null)).get(p[0])!
      r[i] = p[1]
    }
  })
  const fmt = new Intl.DateTimeFormat('fr-FR', { timeZone: ctx.tz, dateStyle: 'short', timeStyle: 'short' })
  const cell = (v: string) => (/[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v)
  const num = (v: number | null) => (v === null || !Number.isFinite(v) ? '' : String(+v.toPrecision(8)).replace('.', ','))
  const header = cols.map((k) => {
    const [dev, v] = k.split('|')
    const u = ctx.data.get(k)!.unit
    return `${devName(ctx, dev)} · ${v}${u ? ` (${u})` : ''}`
  })
  const lines = [...head.map(cell), ['Date', ...header].map(cell).join(';')]
  for (const [t, r] of [...rows].sort((a, b) => a[0] - b[0])) lines.push([fmt.format(t), ...r.map(num)].join(';'))
  return '\ufeff' + lines.join('\r\n') + '\r\n'
}

// ---------- logo / images ----------
const imgType = (b: Uint8Array) => (b[0] === 0x89 && b[1] === 0x50 ? 'image/png' : b[0] === 0xff && b[1] === 0xd8 ? 'image/jpeg' : null)
async function loadLogo(path?: string | null) {
  if (!path) return null
  const { data } = await admin.storage.from('branding').download(path)
  if (!data) return null
  const bytes = new Uint8Array(await data.arrayBuffer())
  const type = imgType(bytes)
  return type ? { bytes, type } : null
}
async function fetchImage(url: string): Promise<Uint8Array | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!r.ok) return null
    const b = new Uint8Array(await r.arrayBuffer())
    return b.length < 3e6 && imgType(b) ? b : null
  } catch (_) {
    return null
  }
}

// ---------- génération complète ----------
async function buildReport(dash: any, freq: string, compare: string, tz: string, from: number, to: number, reportName: string) {
  const { data: widgets } = await admin.from('dashboard_widgets').select('type, width, title, sources, op, options').eq('dashboard_id', dash.id).order('position')
  const { data: company } = await admin.from('companies').select('name, logo_path').eq('id', dash.company_id).single()
  const logo = await loadLogo(company?.logo_path)
  let devIds: string[] = []
  let scopeName = ''
  if (dash.scope === 'device') devIds = [dash.device_id]
  else if (dash.scope === 'project') {
    const { data: p } = await admin.from('projects').select('name').eq('id', dash.project_id).single()
    scopeName = p?.name ?? ''
    const { data: ds } = await admin.from('devices').select('id').eq('project_id', dash.project_id)
    devIds = (ds ?? []).map((d: any) => d.id)
  } else devIds = dash.device_ids ?? []
  const ws = (widgets ?? []) as Widget[]
  for (const w of ws) for (const s of w.sources) if (!devIds.includes(s.device)) devIds.push(s.device)
  const { data: devRows, error: de } = await admin.from('devices').select('id, name, last_connection_at, latitude').in('id', devIds)
  if (de) throw new Error(de.message)
  const devs = await Promise.all(
    (devRows ?? []).map(async (d: any) => {
      const { data: st } = await admin.from('reports').select('payload').eq('device_id', d.id).eq('type', 'status').order('received_at', { ascending: false }).limit(1).maybeSingle()
      return { ...d, status_payload: st?.payload ?? null }
    }),
  )
  const { data: cat } = await admin.from('ts_vars').select('device_id, var, unit, category, description').in('device_id', devIds)
  const meta = new Map<string, Map<string, VarMeta>>()
  for (const c of cat ?? []) (meta.get(c.device_id) ?? meta.set(c.device_id, new Map()).get(c.device_id)!).set(c.var, c)
  const cmpR = shift(from, to, compare)
  const ctx: Ctx = {
    from,
    to,
    cmpFrom: cmpR?.[0] ?? null,
    cmpTo: cmpR?.[1] ?? null,
    tz,
    devices: new Map((devs ?? []).map((d: any) => [d.id, d])),
    meta,
    data: new Map(),
    cmp: new Map(),
    images: [],
    multi: devIds.length > 1,
  }
  if (dash.scope === 'device') scopeName = ctx.devices.get(dash.device_id)?.name ?? ''
  await loadAll(ws, ctx)
  const cmpLabel = compare === 'year' ? 'an dernier' : 'période préc.'
  const fmtD = new Intl.DateTimeFormat('fr-FR', { timeZone: tz, dateStyle: 'long' })
  const periodLabel =
    freq === 'daily' ? fmtD.format(from)
    : freq === 'monthly' ? new Intl.DateTimeFormat('fr-FR', { timeZone: tz, month: 'long', year: 'numeric' }).format(from)
    : `du ${fmtD.format(from)} au ${fmtD.format(to - 1)}`
  const blocks: Block[] = []
  for (const w of ws) {
    try {
      const b = await renderWidget(w, ctx, cmpLabel)
      if (b) blocks.push(b)
    } catch (e) {
      blocks.push({ title: w.title ?? w.type, parts: [{ k: 'text', t: `bloc non généré : ${(e as Error).message}`, color: '#b91c1c' }] })
    }
  }
  // images par URL (blocs image) : téléchargées une fois pour le PDF
  for (const b of blocks) for (const p of b.parts) if (p.k === 'url') (p as any).bytes = await fetchImage(p.url)
  const body = blocks.map(blockHtml).join('\n')
  // titre = nom du rapport choisi par l'utilisateur ; box / projet en sous-titre
  const title = reportName.trim() || FREQ_LABEL[freq] || 'Rapport'
  const subject = `${title} · ${periodLabel}`
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6"><tr><td align="center" style="padding:20px 10px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px">
<tr><td style="padding:0 0 14px 0">
  ${logo ? `<img src="cid:logo" height="40" style="display:block;height:40px;width:auto;max-width:200px;border:0;margin:0 0 10px 0" alt="${esc(company?.name ?? '')}">` : ''}
  <div style="font:600 11px Arial,sans-serif;letter-spacing:2px;color:#00a88a;text-transform:uppercase">${esc(company?.name ?? '')}</div>
  <div style="font:600 22px Arial,sans-serif;color:#111827;margin-top:4px">${esc(title)}</div>
  <div style="font:14px Arial,sans-serif;color:#374151;margin-top:2px">${scopeName && scopeName !== title ? esc(scopeName) + ' — ' : ''}${esc(periodLabel)}</div>
  ${ctx.cmpFrom !== null ? `<div style="font:12px Arial,sans-serif;color:#6b7280;margin-top:2px">Comparaison : ${compare === 'year' ? 'même période l’an dernier' : 'période précédente'}</div>` : ''}
</td></tr>
${body}
<tr><td style="padding:6px 0 0 0;font:11px Arial,sans-serif;color:#9ca3af">Généré avec myHexa · Hexa-AI. Heures en ${esc(tz)}.
<a href="${esc(APP_URL)}" style="color:#00a88a">Ouvrir le portail</a></td></tr>
</table></td></tr></table></body></html>`
  const fmtF = new Intl.DateTimeFormat('fr-FR', { timeZone: tz, dateStyle: 'short', timeStyle: 'short' })
  const csv = toCsv(ctx, ws, [`myHexa · ${scopeName} · ${reportName}`, `Période : ${fmtF.format(from)} → ${fmtF.format(to)} (${tz})`, ''])
  if (logo) ctx.images.push({ cid: 'logo', png: logo.bytes, type: logo.type })
  const cmpNote = ctx.cmpFrom !== null ? `Comparaison : ${compare === 'year' ? 'même période l’an dernier' : 'période précédente'}` : undefined
  const pdf = () =>
    buildPdf({
      brand: company?.name ?? '',
      title,
      subtitle: `${scopeName && scopeName !== title ? scopeName + ' — ' : ''}${periodLabel}`,
      note: cmpNote,
      footer: `Généré avec myHexa · Hexa-AI, le ${fmtF.format(Date.now())} · heures en ${tz}`,
      logo: logo?.bytes,
      blocks: blocks as PdfBlock[],
    })
  return { subject, html, csv, pdf, images: ctx.images, scopeName, periodLabel }
}

const b64 = (u: Uint8Array) => {
  let bin = ''
  for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode(...u.subarray(i, i + 0x8000))
  return btoa(bin)
}
const inlineImages = (html: string, images: { cid: string; png: Uint8Array; type?: string }[]) =>
  images.reduce((h, im) => h.replace(`cid:${im.cid}`, `data:${im.type ?? 'image/png'};base64,${b64(im.png)}`), html)

async function periodFor(freq: string, tz: string, at: string) {
  const { data, error } = await admin.rpc('report_period', { p_freq: freq, p_tz: tz, p_at: at }).single()
  if (error) throw new Error(error.message)
  return [Date.parse((data as any).p_from), Date.parse((data as any).p_to)]
}

/** génère, archive et envoie un modèle de rapport */
async function runTemplate(tpl: any, trigger: 'cron' | 'manual') {
  const t0 = Date.now()
  const runId = crypto.randomUUID()
  const [from, to] = await periodFor(tpl.frequency, tpl.tz, new Date().toISOString())
  const { data: dash } = await admin.from('dashboards').select('*').eq('id', tpl.dashboard_id).single()
  let status = 'not_sent'
  let error: string | null = null
  const sentTo: string[] = []
  let html = ''
  let csv = ''
  let bytes = 0
  let pdfBytes: Uint8Array | null = null
  let pdfPath = ''
  try {
    const r = await buildReport(dash, tpl.frequency, tpl.compare, tpl.tz, from, to, tpl.name)
    html = r.html
    csv = r.csv
    pdfBytes = await r.pdf()
    const { data: recs } = await admin.from('recipients').select('contact_email').in('id', tpl.recipient_ids.length ? tpl.recipient_ids : ['00000000-0000-0000-0000-000000000000'])
    const emails = (recs ?? []).map((x: any) => (x.contact_email ?? '').trim()).filter((e: string) => e)
    const allowed = emails.filter((e: string) => !ALLOW_DOMAIN || e.toLowerCase().endsWith('@' + ALLOW_DOMAIN))
    if (!mailerConfigured()) error = 'envoi impossible : messagerie non configurée sur ce projet (rapport archivé)'
    else if (!allowed.length) error = emails.length ? `aucun destinataire autorisé (domaine ${ALLOW_DOMAIN})` : 'aucun destinataire'
    else {
      const enc = new TextEncoder()
      const day = new Date(from).toISOString().slice(0, 10)
      for (const to of allowed) {
        await sendMail({
          to,
          subject: r.subject,
          html: r.html,
          inline: r.images.map((im) => ({ cid: im.cid, contentType: im.type ?? 'image/png', data: im.png })),
          attachments: [
            ...(tpl.attach_pdf && pdfBytes ? [{ filename: `${r.scopeName} ${day}.pdf`, contentType: 'application/pdf', data: pdfBytes }] : []),
            ...(tpl.attach_csv ? [{ filename: `${r.scopeName} ${day}.csv`, contentType: 'text/csv; charset=utf-8', data: enc.encode(r.csv) }] : []),
          ],
        })
        sentTo.push(to)
      }
      status = 'sent'
      if (allowed.length < emails.length) error = `${emails.length - allowed.length} destinataire(s) hors domaine ${ALLOW_DOMAIN} ignoré(s)`
    }
    // archive : HTML autonome (images intégrées) + CSV
    const archived = inlineImages(r.html, r.images)
    bytes = archived.length
    const base = `${tpl.company_id}/${tpl.id}/${runId}`
    await admin.storage.from('reports').upload(`${base}.html`, new Blob([archived], { type: 'text/html; charset=utf-8' }), { upsert: true })
    await admin.storage.from('reports').upload(`${base}.csv`, new Blob([r.csv], { type: 'text/csv; charset=utf-8' }), { upsert: true })
    if (pdfBytes) {
      await admin.storage.from('reports').upload(`${base}.pdf`, new Blob([pdfBytes], { type: 'application/pdf' }), { upsert: true })
      pdfPath = `${base}.pdf`
    }
    html = `${base}.html`
    csv = `${base}.csv`
  } catch (e) {
    status = 'error'
    error = (e as Error).message
    html = ''
    csv = ''
  }
  await admin.from('report_runs').insert({
    id: runId,
    template_id: tpl.id,
    period_from: new Date(from).toISOString(),
    period_to: new Date(to).toISOString(),
    status,
    trigger,
    sent_to: sentTo,
    html_path: html || null,
    csv_path: csv || null,
    pdf_path: pdfPath || null,
    bytes,
    ms: Date.now() - t0,
    error,
  })
  await admin.from('report_templates').update({ last_run_at: new Date().toISOString() }).eq('id', tpl.id)
  return { id: runId, status, error, sent_to: sentTo, ms: Date.now() - t0 }
}

Deno.serve(async (req) => {
  const pf = preflight(req)
  if (pf) return pf
  if (req.method !== 'POST') return fail('METHOD_NOT_ALLOWED', 'Méthode non supportée', 405)
  const body = (await req.json().catch(() => ({}))) as Record<string, any>

  // --- cron : modèles échus ---
  if (req.headers.get('x-cron-secret')) {
    if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) return new Response('forbidden', { status: 403 })
    const { data: due } = await admin
      .from('report_templates')
      .select('*')
      .eq('enabled', true)
      .lte('next_run_at', new Date().toISOString())
      .order('next_run_at')
      .limit(Number(body.limit) || 3)
    const out = []
    for (const tpl of due ?? []) {
      // échéance suivante posée AVANT génération : pas de double envoi si la génération échoue ou dépasse le temps
      const { data: nx } = await admin.rpc('report_next_run', {
        p_freq: tpl.frequency, p_hour: tpl.send_hour, p_weekday: tpl.weekday, p_monthday: tpl.monthday, p_tz: tpl.tz, p_after: new Date().toISOString(),
      })
      await admin.from('report_templates').update({ next_run_at: nx }).eq('id', tpl.id)
      out.push({ template: tpl.id, ...(await runTemplate(tpl, 'cron')) })
    }
    return ok({ done: out.length, runs: out })
  }

  // --- utilisateur ---
  const auth = req.headers.get('Authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return fail('UNAUTHORIZED', 'Connexion requise', 401)
  const user = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: auth } } })
  try {
    if (body.action === 'preview') {
      const { data: dash } = await user.from('dashboards').select('*').eq('id', body.dashboard_id).maybeSingle()
      if (!dash) return fail('FORBIDDEN', 'Tableau de bord non accessible (enregistrez-le d’abord)', 403)
      const freq = ['daily', 'weekly', 'monthly'].includes(body.frequency) ? body.frequency : 'daily'
      const tz = body.tz || 'Europe/Paris'
      const [from, to] = await periodFor(freq, tz, body.at || new Date().toISOString())
      const t0 = Date.now()
      const r = await buildReport(dash, freq, body.compare || 'none', tz, from, to, body.name || FREQ_LABEL[freq])
      const pdf = body.pdf ? b64(await r.pdf()) : undefined
      return ok({ subject: r.subject, html: inlineImages(r.html, r.images), csv: r.csv, pdf, images: r.images.length, from, to, ms: Date.now() - t0, mail: mailerConfigured() })
    }
    if (body.action === 'run') {
      const { data: tpl } = await user.from('report_templates').select('*').eq('id', body.template_id).maybeSingle()
      if (!tpl) return fail('FORBIDDEN', 'Rapport non accessible', 403)
      const { data: can } = await user.rpc('can_manage_company', { p_company: tpl.company_id })
      if (!can) return fail('FORBIDDEN', 'Réservé à l’administrateur', 403)
      return ok(await runTemplate(tpl, 'manual'))
    }
    return fail('BAD_REQUEST', 'action inconnue', 400)
  } catch (e) {
    return fail('ERROR', (e as Error).message, 500)
  }
})

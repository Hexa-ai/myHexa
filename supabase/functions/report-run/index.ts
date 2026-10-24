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
  images: { cid: string; png: Uint8Array }[]
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

// ---------- rendu HTML (mail : tables + styles en ligne) ----------
const card = (title: string, inner: string, sub = '') =>
  `<tr><td style="padding:0 0 14px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;background:#ffffff">
<tr><td style="padding:14px 16px 4px 16px;font:600 14px Arial,sans-serif;color:#111827">${esc(title)}${sub ? `<div style="font:400 11px Arial,sans-serif;color:#6b7280;margin-top:2px">${esc(sub)}</div>` : ''}</td></tr>
<tr><td style="padding:6px 16px 14px 16px;font:13px Arial,sans-serif;color:#111827">${inner}</td></tr></table></td></tr>`

const delta = (v: number | null, c: number | null) => {
  if (v === null || c === null || c === 0) return ''
  const d = ((v - c) / Math.abs(c)) * 100
  return `<span style="font:12px Arial,sans-serif;color:${d >= 0 ? '#047857' : '#b91c1c'}">${d >= 0 ? '+' : ''}${fmtNum(d, 1)} %</span>`
}

async function addImage(ctx: Ctx, svg: string, width: number): Promise<string> {
  const png = await svgToPng(svg, 2)
  const cid = `img${ctx.images.length + 1}`
  ctx.images.push({ cid, png })
  return `<img src="cid:${cid}" width="${width}" style="display:block;width:100%;max-width:${width}px;height:auto;border:0" alt="graphique">`
}

const DEFAULT_STATES = [
  { value: 0, label: 'Arrêt', color: '#8a8f98' },
  { value: 1, label: 'Marche', color: '#16a34a' },
]

async function renderWidget(w: Widget, ctx: Ctx, cmpLabel: string): Promise<string> {
  const ser = seriesOf(w, ctx.data, ctx)
  const cser = seriesOf(w, ctx.cmp, ctx)
  const title = w.title || (ser.length === 1 ? ser[0].label : '') || ''
  const span = ctx.to - ctx.from
  switch (w.type) {
    case 'curve':
    case 'bars': {
      if (!ser.length) return card(title || 'Graphique', '<span style="color:#9ca3af">pas de données sur la période</span>')
      const missing = w.sources.filter((x) => x.var && !ctx.data.get(x.device + '|' + x.var)?.points.length).map((x) => label(ctx, x.device, x.var))
      const missingNote = missing.length ? `<div style="font:11px Arial,sans-serif;color:#9ca3af;margin-top:4px">Sans données sur la période : ${esc(missing.join(', '))}</div>` : ''
      const bars = w.type === 'bars' || ser[0].counter
      const groups = !w.op && w.options.separate ? ser.map((s) => [s]) : [ser]
      let html = ''
      for (const g of groups) {
        const leftUnit = g[0].unit ?? ''
        const cs: ChartSeries[] = g.map((s, i) => ({
          points: s.points,
          label: s.label,
          unit: s.unit,
          color: COLORS[(ser.indexOf(s)) % COLORS.length],
          axis: i > 0 && (s.unit ?? '') !== leftUnit ? 'right' : 'left',
          step: s.state,
        }))
        const legend =
          g.length > 1
            ? `<div style="font:11px Arial,sans-serif;color:#374151;margin:2px 0 4px 0">${cs
                .map((c) => `<span style="color:${c.color}">&#9632;</span> ${esc(c.label)} <span style="color:#6b7280">${esc(c.unit ?? '')}${c.axis === 'right' ? ' (axe droit)' : ''}</span>`)
                .join(' &nbsp; ')}</div>`
            : `<div style="font:11px Arial,sans-serif;color:#6b7280;margin:2px 0 4px 0">${esc(g[0].unit ?? '')}${g[0].desc ? ' · ' + esc(g[0].desc) : ''}</div>`
        const total = bars && g.length === 1 ? ` &nbsp; <b>Total : ${fmtNum(statOf(g[0].points, 'total'))} ${esc(g[0].unit ?? '')}</b>` : ''
        html +=
          (groups.length > 1 ? `<div style="font:600 12px Arial,sans-serif;margin-top:8px">${esc(g[0].label)}</div>` : '') +
          legend.replace('</div>', total + '</div>') +
          (await addImage(ctx, timeChartSvg({ series: cs, from: ctx.from, to: ctx.to, tz: ctx.tz, bars: bars ? barMs(span) : 0 }), 600))
      }
      return card(title || 'Graphique', html + missingNote)
    }
    case 'value':
    case 'gauge': {
      const counterDefault = ser[0]?.counter ? 'total' : 'mean'
      // dans un rapport, « dernière valeur » a peu de sens : moyenne de la période par défaut (total pour les compteurs)
      const stat = w.options.stat && w.options.stat !== 'last' ? w.options.stat : counterDefault
      const statLabel = { mean: 'Moyenne', min: 'Minimum', max: 'Maximum', total: 'Total', last: 'Dernière' }[stat as string]
      if (!ser.length) return card(title || 'Valeur', '<span style="color:#9ca3af">pas de données</span>')
      if (w.type === 'gauge') {
        let imgs = ''
        // une jauge par variable (ou une seule si opération) ; une variable sans historique prend la valeur du dernier statut
        const gs = w.op && ser.length ? ser : w.sources.filter((x) => x.var).map((x) => {
          const d = ctx.data.get(x.device + '|' + x.var)
          return { label: label(ctx, x.device, x.var), unit: d?.unit ?? null, points: (d?.points ?? []) as Pt[], live: liveOf(ctx, x.device, x.var) }
        })
        for (const s of gs as { label: string; unit: string | null; points: Pt[]; live?: number | null }[]) {
          const v = s.points.length ? statOf(s.points, stat) : (s.live ?? null)
          const lo = w.options.min ?? statOf(s.points, 'min') ?? (v !== null ? Math.min(0, v) : 0)
          const hi = w.options.max ?? statOf(s.points, 'max') ?? (v !== null ? Math.max(1, v) : 1)
          imgs += `<td align="center" style="padding:4px">${await addImage(ctx, gaugeSvg(v, lo, hi, s.unit, gs.length > 1 ? s.label : undefined), 200)}</td>`
        }
        return card(title || ser[0].label, `<table role="presentation" width="100%"><tr>${imgs}</tr></table><div style="font:11px Arial,sans-serif;color:#6b7280;text-align:center">${statLabel} de la période</div>`)
      }
      const rows = ser
        .map((s, i) => {
          const v = statOf(s.points, stat)
          const c = cser[i] ? statOf(cser[i].points, stat) : null
          return `<tr><td style="padding:4px 0;font:13px Arial,sans-serif;color:#374151">${esc(s.label)}</td>
<td align="right" style="padding:4px 0;font:600 20px Arial,sans-serif;color:#111827;white-space:nowrap">${fmtNum(v, w.options.decimals)} <span style="font:400 12px Arial,sans-serif;color:#6b7280">${esc(s.unit ?? '')}</span></td>
${ctx.cmpFrom !== null ? `<td align="right" style="padding:4px 0 4px 10px;white-space:nowrap">${delta(v, c)}<div style="font:11px Arial,sans-serif;color:#9ca3af">${cmpLabel} : ${fmtNum(c)}</div></td>` : ''}</tr>`
        })
        .join('')
      return card(title || statLabel!, `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`, statLabel + ' de la période')
    }
    case 'indicator': {
      const states = (w.options.states?.length ? w.options.states : DEFAULT_STATES) as { value: number; label: string; color: string; image?: string }[]
      const valOf = (src: { device: string; var: string }) => {
        const s = ctx.data.get(src.device + '|' + src.var)
        const v = s ? statOf(s.points as Pt[], 'last') : null
        return v ?? liveOf(ctx, src.device, src.var)
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
        return card(
          title || 'Synthèse',
          `<span style="display:inline-block;width:14px;height:14px;border-radius:7px;background:${l.color};vertical-align:middle"></span> <span style="font:600 16px Arial,sans-serif;color:${l.color};vertical-align:middle">${esc(l.txt)}</span>
<div style="font:12px Arial,sans-serif;color:#6b7280;margin-top:4px">${srcs.length} états · ${active.length ? 'actifs : ' + esc(active.join(', ')) : 'aucun actif'}</div>`,
          'dernier état connu',
        )
      }
      const rows = srcs
        .map((src) => {
          const s = ctx.data.get(src.device + '|' + src.var)
          let v = s ? statOf(s.points as Pt[], 'last') : null
          if (v === null) v = liveOf(ctx, src.device, src.var) // pas d'historique (alarmes) : état du dernier statut
          const st = v === null ? null : states.find((x) => Number(x.value) === v)
          const color = st?.color ?? '#8a8f98'
          const txt = st?.label ?? (v === null ? 'inconnu' : `état ${fmtNum(v)}`)
          const look = st?.image
            ? `<img src="${esc(st.image)}" width="22" height="22" style="vertical-align:middle" alt="">`
            : `<span style="display:inline-block;width:12px;height:12px;border-radius:6px;background:${color}"></span>`
          return `<tr><td style="padding:3px 8px 3px 0;width:24px">${look}</td><td style="padding:3px 0;font:13px Arial,sans-serif">${esc(label(ctx, src.device, src.var))}</td><td align="right" style="font:600 13px Arial,sans-serif;color:${color}">${esc(txt)}</td></tr>`
        })
        .join('')
      return card(title || 'États', `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`, 'dernier état connu')
    }
    case 'states': {
      let html = ''
      for (const s of ser) {
        const pts = s.points.filter((p) => p[1] !== null && p[0] < ctx.to)
        const acc = new Map<number, number>()
        for (let i = 0; i < pts.length; i++) {
          const a = Math.max(pts[i][0], ctx.from)
          const b = Math.min(i + 1 < pts.length ? pts[i + 1][0] : ctx.to, ctx.to)
          if (b > a) acc.set(pts[i][1]!, (acc.get(pts[i][1]!) ?? 0) + (b - a))
        }
        const tot = [...acc.values()].reduce((a, b) => a + b, 0) || 1
        html += `<div style="font:600 12px Arial,sans-serif;margin:6px 0 2px 0">${esc(s.label)}</div>` +
          [...acc].sort((a, b) => b[1] - a[1]).map(([v, ms]) => `<div style="font:12px Arial,sans-serif">état ${fmtNum(v)} : ${fmtNum(ms / 3600e3, 1)} h (${fmtNum((ms / tot) * 100, 0)} %)</div>`).join('')
      }
      return card(title || 'Créneaux d’états', html || '<span style="color:#9ca3af">pas de données</span>')
    }
    case 'table': {
      const head = `<tr style="font:600 11px Arial,sans-serif;color:#6b7280;text-transform:uppercase"><td style="padding:4px 0">Variable</td><td align="right">Min</td><td align="right">Moy.</td><td align="right">Max</td><td align="right">Total / dern.</td>${ctx.cmpFrom !== null ? `<td align="right">${cmpLabel}</td>` : ''}</tr>`
      const rows = w.sources
        .filter((s) => s.var)
        .map((s) => {
          const d = ctx.data.get(s.device + '|' + s.var)
          const c = ctx.cmp.get(s.device + '|' + s.var)
          const pts = (d?.points ?? []) as Pt[]
          const counter = isCounter(d)
          const main = statOf(pts, counter ? 'total' : 'mean')
          const cm = c ? statOf(c.points as Pt[], counter ? 'total' : 'mean') : null
          return `<tr style="border-top:1px solid #f1f5f9;font:12px Arial,sans-serif"><td style="padding:5px 6px 5px 0">${esc(label(ctx, s.device, s.var))} <span style="color:#6b7280">${esc(d?.unit ?? '')}</span></td>
<td align="right">${counter ? '' : fmtNum(statOf(pts, 'min'))}</td><td align="right">${fmtNum(statOf(pts, 'mean'))}</td><td align="right">${counter ? '' : fmtNum(statOf(pts, 'max'))}</td>
<td align="right">${fmtNum(statOf(pts, counter ? 'total' : 'last'))}</td>${ctx.cmpFrom !== null ? `<td align="right" style="white-space:nowrap">${delta(main, cm) || '—'}</td>` : ''}</tr>`
        })
        .join('')
      return card(title || 'Synthèse', `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${head}${rows}</table>`)
    }
    case 'status': {
      const ids = [...new Set(w.sources.map((s) => s.device))]
      const rows = ids
        .map((id) => ctx.devices.get(id))
        .filter((d) => !!d)
        .map((d) => {
          const online = d!.last_connection_at && Date.now() - Date.parse(d!.last_connection_at) < 2 * 3600e3
          const last = d!.last_connection_at
            ? new Intl.DateTimeFormat('fr-FR', { timeZone: ctx.tz, dateStyle: 'short', timeStyle: 'short' }).format(new Date(d!.last_connection_at))
            : '—'
          return `<tr style="font:12px Arial,sans-serif"><td style="padding:3px 0"><span style="display:inline-block;width:8px;height:8px;border-radius:4px;background:${online ? '#16a34a' : '#dc2626'}"></span> ${esc(d!.name)}</td><td align="right" style="color:#6b7280">dernier contact ${esc(last)}</td></tr>`
        })
        .join('')
      return card(title || 'Box', `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`, 'au moment de l’envoi')
    }
    case 'map': {
      const states = (w.options.states?.length ? w.options.states : DEFAULT_STATES) as { value: number; label: string; color: string }[]
      const rows = [...new Map(w.sources.map((x) => [x.device, x])).values()]
        .map((src) => {
          const d = ctx.devices.get(src.device)
          if (!d) return ''
          const online = d.last_connection_at && Date.now() - Date.parse(d.last_connection_at) < 2 * 3600e3
          let color = online ? '#16a34a' : '#dc2626'
          let txt = online ? 'connectée' : 'déconnectée'
          if (src.var) {
            const v = liveOf(ctx, src.device, src.var)
            const st = v === null ? null : states.find((x) => Number(x.value) === v)
            color = st?.color ?? '#8a8f98'
            txt = `${src.var} : ${st?.label ?? (v === null ? 'inconnu' : 'état ' + fmtNum(v))}`
          }
          const pos = (d as any).latitude != null ? '' : ' <span style="color:#9ca3af">(sans position)</span>'
          return `<tr style="font:12px Arial,sans-serif"><td style="padding:3px 0"><span style="display:inline-block;width:10px;height:10px;border-radius:5px;background:${color}"></span> ${esc(d.name)}${pos}</td><td align="right" style="color:${color}">${esc(txt)}</td></tr>`
        })
        .join('')
      return card(title || 'Box', `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`, 'carte disponible dans le portail')
    }
    case 'text':
      return card(title || '', `<div style="white-space:pre-line">${esc(w.options.text ?? '')}</div>`)
    case 'image':
      return w.options.url && /^https:\/\//.test(w.options.url)
        ? card(title || '', `<img src="${esc(w.options.url)}" style="max-width:100%;height:auto" alt="">`)
        : ''
  }
  return ''
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

// ---------- génération complète ----------
async function buildReport(dash: any, freq: string, compare: string, tz: string, from: number, to: number, reportName: string) {
  const { data: widgets } = await admin.from('dashboard_widgets').select('type, width, title, sources, op, options').eq('dashboard_id', dash.id).order('position')
  const { data: company } = await admin.from('companies').select('name').eq('id', dash.company_id).single()
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
  let body = ''
  for (const w of ws) {
    try {
      body += await renderWidget(w, ctx, cmpLabel)
    } catch (e) {
      body += card(w.title ?? w.type, `<span style="color:#b91c1c">bloc non généré : ${esc((e as Error).message)}</span>`)
    }
  }
  const subject = `${FREQ_LABEL[freq] ?? 'Rapport'} · ${scopeName} · ${periodLabel}`
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6"><tr><td align="center" style="padding:20px 10px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px">
<tr><td style="padding:0 0 14px 0">
  <div style="font:600 11px Arial,sans-serif;letter-spacing:2px;color:#00a88a;text-transform:uppercase">myHexa · ${esc(company?.name ?? '')}</div>
  <div style="font:600 22px Arial,sans-serif;color:#111827;margin-top:4px">${esc(scopeName)}</div>
  <div style="font:14px Arial,sans-serif;color:#374151;margin-top:2px">${esc(reportName)} — ${esc(periodLabel)}</div>
  ${ctx.cmpFrom !== null ? `<div style="font:12px Arial,sans-serif;color:#6b7280;margin-top:2px">Comparaison : ${compare === 'year' ? 'même période l’an dernier' : 'période précédente'}</div>` : ''}
</td></tr>
${body}
<tr><td style="padding:6px 0 0 0;font:11px Arial,sans-serif;color:#9ca3af">Rapport généré automatiquement par myHexa (Hexa-AI). Heures en ${esc(tz)}.
<a href="${esc(APP_URL)}" style="color:#00a88a">Ouvrir le portail</a></td></tr>
</table></td></tr></table></body></html>`
  const fmtF = new Intl.DateTimeFormat('fr-FR', { timeZone: tz, dateStyle: 'short', timeStyle: 'short' })
  const csv = toCsv(ctx, ws, [`myHexa · ${scopeName} · ${reportName}`, `Période : ${fmtF.format(from)} → ${fmtF.format(to)} (${tz})`, ''])
  return { subject, html, csv, images: ctx.images, scopeName }
}

const b64 = (u: Uint8Array) => {
  let bin = ''
  for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode(...u.subarray(i, i + 0x8000))
  return btoa(bin)
}
const inlineImages = (html: string, images: { cid: string; png: Uint8Array }[]) =>
  images.reduce((h, im) => h.replace(`cid:${im.cid}`, `data:image/png;base64,${b64(im.png)}`), html)

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
  try {
    const r = await buildReport(dash, tpl.frequency, tpl.compare, tpl.tz, from, to, tpl.name)
    html = r.html
    csv = r.csv
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
          inline: r.images.map((im) => ({ cid: im.cid, contentType: 'image/png', data: im.png })),
          attachments: tpl.attach_csv ? [{ filename: `${r.scopeName} ${day}.csv`, contentType: 'text/csv; charset=utf-8', data: enc.encode(r.csv) }] : [],
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
      return ok({ subject: r.subject, html: inlineImages(r.html, r.images), csv: r.csv, images: r.images.length, from, to, ms: Date.now() - t0, mail: mailerConfigured() })
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

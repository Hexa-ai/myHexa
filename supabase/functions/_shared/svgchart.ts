// Graphiques SVG -> PNG pour les rapports envoyés par e-mail (les clients mail n'affichent pas le SVG).
// Rendu par resvg (WASM) avec la police Inter ; initialisation paresseuse, réutilisée entre requêtes.
import { initWasm, Resvg } from 'npm:@resvg/resvg-wasm@2.6.2'

const WASM_URL = 'https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm'
const FONT_URLS = [
  'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.ttf',
  'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-600-normal.ttf',
]
let ready: Promise<void> | null = null
let fonts: Uint8Array[] | null = null

async function init() {
  ready ??= initWasm(fetch(WASM_URL))
  await ready
  fonts ??= await Promise.all(FONT_URLS.map(async (u) => new Uint8Array(await (await fetch(u)).arrayBuffer())))
}

/** polices Inter 400 / 600 (TTF), partagées avec le PDF */
export async function interFonts(): Promise<Uint8Array[]> {
  await init()
  return fonts!
}

export async function svgToPng(svg: string, zoom = 2): Promise<Uint8Array> {
  await init()
  const r = new Resvg(svg, {
    font: { fontBuffers: fonts!, defaultFontFamily: 'Inter', loadSystemFonts: false },
    fitTo: { mode: 'zoom', value: zoom },
  })
  return r.render().asPng()
}

export type Pt = [number, number | null, number | null, number | null]
export interface ChartSeries {
  points: Pt[]
  label: string
  unit?: string | null
  color: string
  axis?: 'left' | 'right'
  step?: boolean
  dashed?: boolean
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
export const fmtNum = (v: number | null | undefined, d?: number) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  const dd = d ?? (Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2)
  return v.toLocaleString('fr-FR', { maximumFractionDigits: dd }).replace(/\u202f/g, ' ')
}

function niceScale(lo: number, hi: number, n = 5): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1]
  if (hi === lo) {
    hi = lo + (Math.abs(lo) || 1)
    lo = lo - (Math.abs(lo) || 1) * (lo === 0 ? 0 : 1)
  }
  const raw = (hi - lo) / (n - 1)
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag
  const a = Math.floor(lo / step) * step
  const out: number[] = []
  for (let v = a; v <= hi + step * 1e-9; v += step) out.push(+v.toPrecision(12))
  if (out[out.length - 1] < hi) out.push(+(out[out.length - 1] + step).toPrecision(12))
  return out
}

function timeTicks(from: number, to: number, tz: string): { t: number; label: string }[] {
  const span = to - from
  const H = 3600e3
  const step = span <= 1.5 * 86400e3 ? 3 * H : span <= 3 * 86400e3 ? 6 * H : span <= 10 * 86400e3 ? 24 * H : span <= 40 * 86400e3 ? 7 * 24 * H : 30 * 24 * H
  const fmtH = new Intl.DateTimeFormat('fr-FR', { timeZone: tz, hour: '2-digit', minute: '2-digit' })
  const fmtD = new Intl.DateTimeFormat('fr-FR', { timeZone: tz, day: '2-digit', month: '2-digit' })
  const out: { t: number; label: string }[] = []
  // aligné sur l'heure locale : on part de from (déjà un minuit local pour les rapports)
  for (let t = from; t <= to + 1; t += step) {
    out.push({ t, label: step < 24 * H ? fmtH.format(t) : fmtD.format(t) })
  }
  if (step < 24 * H && out.length) out[0].label = fmtD.format(from) + ' ' + out[0].label
  return out.slice(0, 12)
}

/** Courbes (et/ou barres de compteurs) sur axe temporel ; axe droit pour les séries `axis: 'right'`. */
export function timeChartSvg(opts: {
  series: ChartSeries[]
  from: number
  to: number
  tz: string
  bars?: number
  width?: number
  height?: number
}): string {
  const W = opts.width ?? 600
  const H = opts.height ?? 210
  const left = opts.series.filter((s) => s.axis !== 'right')
  const right = opts.series.filter((s) => s.axis === 'right')
  const ML = 48
  const MR = right.length ? 48 : 14
  const MT = 12
  const MB = 26
  const pw = W - ML - MR
  const ph = H - MT - MB
  const x = (t: number) => ML + ((t - opts.from) / (opts.to - opts.from)) * pw
  const range = (ss: ChartSeries[]) => {
    let lo = Infinity
    let hi = -Infinity
    for (const s of ss)
      for (const p of s.points) {
        const a = opts.bars ? Math.min(0, p[1] ?? 0) : (p[2] ?? p[1])
        const b = opts.bars ? (p[1] ?? 0) : (p[3] ?? p[1])
        if (a !== null && Number.isFinite(a)) lo = Math.min(lo, a)
        if (b !== null && Number.isFinite(b)) hi = Math.max(hi, b)
      }
    if (opts.bars) lo = Math.min(lo, 0)
    return lo === Infinity ? [0, 1] : [lo, hi]
  }
  const ticksL = niceScale(...(range(left) as [number, number]))
  const ticksR = right.length ? niceScale(...(range(right) as [number, number])) : []
  // décimales des graduations selon le pas (évite « 0,01 0,01 » pour 0,005 / 0,015)
  const dec = (t: number[]) => {
    const st = Math.abs((t[1] ?? 1) - (t[0] ?? 0)) || 1
    return Math.max(0, Math.min(6, -Math.floor(Math.log10(st) + 1e-9) + (st / 10 ** Math.floor(Math.log10(st)) % 1 ? 1 : 0)))
  }
  const dL = dec(ticksL)
  const dR = dec(ticksR)
  const yOf = (ticks: number[]) => (v: number) =>
    MT + ph - ((v - ticks[0]) / (ticks[ticks.length - 1] - ticks[0] || 1)) * ph
  const yL = yOf(ticksL)
  const yR = yOf(ticksR.length ? ticksR : ticksL)
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Inter" font-size="10">`,
    `<rect width="${W}" height="${H}" fill="#ffffff"/>`,
  ]
  for (const v of ticksL) {
    const y = yL(v)
    parts.push(`<line x1="${ML}" x2="${W - MR}" y1="${y}" y2="${y}" stroke="#e5e7eb"/>`)
    parts.push(`<text x="${ML - 6}" y="${y + 3}" text-anchor="end" fill="#6b7280">${esc(fmtNum(v, dL))}</text>`)
  }
  for (const v of ticksR) parts.push(`<text x="${W - MR + 6}" y="${yR(v) + 3}" fill="#6b7280">${esc(fmtNum(v))}</text>`)
  for (const tk of timeTicks(opts.from, opts.to, opts.tz)) {
    const xx = x(tk.t)
    parts.push(`<line x1="${xx}" x2="${xx}" y1="${MT}" y2="${MT + ph}" stroke="#f1f5f9"/>`)
    parts.push(`<text x="${xx}" y="${H - 8}" text-anchor="middle" fill="#6b7280">${esc(tk.label)}</text>`)
  }
  const n = opts.series.length
  opts.series.forEach((s, si) => {
    const y = s.axis === 'right' ? yR : yL
    if (opts.bars) {
      const w = Math.max(1, ((opts.bars / (opts.to - opts.from)) * pw * 0.85) / n)
      for (const p of s.points) {
        if (p[1] === null) continue
        const x0 = x(p[0]) + si * w
        const y0 = y(Math.max(p[1], 0))
        const y1 = y(Math.min(p[1], 0))
        parts.push(`<rect x="${x0.toFixed(1)}" y="${y0.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(0.5, y1 - y0).toFixed(1)}" fill="${s.color}" fill-opacity="0.75"/>`)
      }
      return
    }
    // courbe, coupée sur les trous (> 2 h ou > 3 × pas médian)
    const pts = s.points.filter((p) => p[1] !== null)
    const dts = pts.slice(1).map((p, i) => p[0] - pts[i][0]).sort((a, b) => a - b)
    const gap = Math.max(2 * 3600e3, 3 * (dts[Math.floor(dts.length / 2)] ?? 0))
    let d = ''
    let prev: Pt | null = null
    for (const p of pts) {
      const X = x(p[0]).toFixed(1)
      const Y = y(p[1]!).toFixed(1)
      if (!prev || p[0] - prev[0] > gap) d += `M${X} ${Y}`
      else if (s.step) d += `H${X}V${Y}`
      else d += `L${X} ${Y}`
      prev = p
    }
    if (pts.length === 1) parts.push(`<circle cx="${x(pts[0][0])}" cy="${y(pts[0][1]!)}" r="2.5" fill="${s.color}"/>`)
    if (d)
      parts.push(
        `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="1.6" stroke-linejoin="round"${s.dashed ? ' stroke-dasharray="4 3" stroke-opacity="0.7"' : ''}/>`,
      )
  })
  parts.push(`<line x1="${ML}" x2="${W - MR}" y1="${MT + ph}" y2="${MT + ph}" stroke="#9ca3af"/>`)
  parts.push('</svg>')
  return parts.join('')
}

export function gaugeSvg(value: number | null, lo: number, hi: number, unit: string | null, label?: string): string {
  const f = hi > lo && value !== null ? Math.min(Math.max((value - lo) / (hi - lo), 0), 1) : 0
  const a = Math.PI * (1 - f)
  const ex = 100 + 80 * Math.cos(a)
  const ey = 100 - 80 * Math.sin(a)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="${label ? 140 : 125}" viewBox="0 0 200 ${label ? 140 : 125}" font-family="Inter">
<rect width="200" height="${label ? 140 : 125}" fill="#ffffff"/>
<path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="#e5e7eb" stroke-width="16" stroke-linecap="round"/>
${value !== null ? `<path d="M20 100 A80 80 0 0 1 ${ex.toFixed(2)} ${ey.toFixed(2)}" fill="none" stroke="#00a88a" stroke-width="16" stroke-linecap="round"/>` : ''}
<text x="100" y="88" text-anchor="middle" font-size="24" font-weight="600" fill="#111827">${esc(fmtNum(value))}</text>
<text x="100" y="106" text-anchor="middle" font-size="11" fill="#6b7280">${esc(unit ?? '')}</text>
<text x="20" y="120" text-anchor="middle" font-size="10" fill="#9ca3af">${esc(fmtNum(lo))}</text>
<text x="180" y="120" text-anchor="middle" font-size="10" fill="#9ca3af">${esc(fmtNum(hi))}</text>
${label ? `<text x="100" y="136" text-anchor="middle" font-size="11" fill="#374151">${esc(label.slice(0, 34))}</text>` : ''}
</svg>`
}

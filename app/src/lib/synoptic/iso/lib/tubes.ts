// Tuyauteries et gaines routées en iso à partir des ports.
import type { V3, BBox } from './geom'
import { add, sub, mul, unit, len, proj, f, P2, bboxCyl, bboxDe, bboxUnion, dot } from './geom'
import { cylSvg, boxSvg, ballSvg } from './iso'
import type { Fluide, Port } from './types'

import type { Rel, Plan } from './geom'
export interface Item { bb: BBox; svg: string; k?: number; id?: string; rel?: Rel[]; plan?: Plan }
export interface TubeOpts {
  fluide?: Fluide
  /** rayon extérieur (défaut 5) */
  dn?: number
  /** 1 = sens du chemin, -1 = inverse, 0 = pas d'animation */
  flux?: number
  /** chevrons de sens de flux au milieu des tronçons longs */
  fleches?: boolean
  /** ordre des axes quand deux points consécutifs ne sont pas alignés (défaut 'zxy') */
  ordre?: string
  /** brides aux jonctions (coudes) */
  brides?: boolean
  /** extrémité début/fin : pas de cap (raccord sur port) */
  id?: string
}
const toV = (p: Port | V3): V3 => (Array.isArray(p) ? p : p.pos)

/** Normalise un chemin : insère les points de coude, supprime doublons et points colinéaires. */
export function normaliser(path: (Port | V3)[], ordre = 'zxy'): V3[] {
  const pts0 = path.map(toV)
  const out: V3[] = [pts0[0]]
  const ax = { x: 0, y: 1, z: 2 } as Record<string, number>
  for (let i = 1; i < pts0.length; i++) {
    let cur = out[out.length - 1]
    const tgt = pts0[i]
    for (const a of ordre) {
      const k = ax[a]
      if (Math.abs(cur[k] - tgt[k]) > 1e-6) {
        const n: V3 = [...cur] as V3
        n[k] = tgt[k]
        // si c'est le dernier axe, n == tgt
        cur = n
        out.push(n)
      }
    }
  }
  // dédoublonnage + colinéarité
  const res: V3[] = []
  for (const p of out) {
    if (res.length && len(sub(p, res[res.length - 1])) < 1e-6) continue
    res.push(p)
    while (res.length >= 3) {
      const a = res[res.length - 3], b = res[res.length - 2], c = res[res.length - 1]
      const u = unit(sub(b, a)), v = unit(sub(c, b))
      if (len(sub(u, v)) < 1e-6) res.splice(res.length - 2, 1); else break
    }
  }
  return res
}

function flowPath(a: V3, b: V3, flux: number, ra: number, cls: string): string {
  const A = flux >= 0 ? a : b, B = flux >= 0 ? b : a
  const d = unit(sub(B, A)), s = len(sub(B, A))
  if (s < ra * 3) return ''
  const A2 = add(A, mul(d, ra * 0.6)), B2 = sub(B, mul(d, ra * 0.6))
  return `<path class="flow ${cls}" d="M${P2(A2)}L${P2(B2)}"/>`
}
function arrow(a: V3, b: V3, flux: number): string {
  const A = flux >= 0 ? a : b, B = flux >= 0 ? b : a
  const m = mul(add(A, B), 0.5)
  const pa = proj(A), pb = proj(B)
  const ang = (Math.atan2(pb[1] - pa[1], pb[0] - pa[0]) * 180) / Math.PI
  const [x, y] = proj(m)
  return `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(ang)})"><path class="arr" d="M7 0L-3.5 4.6V-4.6Z"/></g>`
}

/** Tuyauterie : suite de cylindres + rotules aux coudes. Renvoie les éléments triables de la scène. */
export function tube(path: (Port | V3)[], o: TubeOpts = {}): Item[] {
  const P = normaliser(path, o.ordre ?? 'zxy')
  const r = o.dn ?? (Array.isArray(path[0]) ? 5 : (path[0] as Port).dn ?? 5)
  const fl = o.fluide ?? (!Array.isArray(path[0]) ? (path[0] as Port).fluide : undefined) ?? 'eau'
  const flux = o.flux ?? 0
  const items: Item[] = []
  const cls = `fl-${fl}`
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1]
    let s = cylSvg(a, b, r, r, { cap: true })
    if (flux !== 0) s += flowPath(a, b, flux, r, '')
    if (o.fleches && len(sub(b, a)) > 70) s += arrow(a, b, flux || 1)
    items.push({ bb: bboxCyl(a, b, r), svg: `<g class="${cls}">${s}</g>` })
  }
  // coudes : rotule + bague
  for (let i = 1; i < P.length - 1; i++) {
    const c = P[i]
    const R = r * 1.12
    items.push({ bb: { x0: c[0] - R, y0: c[1] - R, z0: c[2] - R, x1: c[0] + R, y1: c[1] + R, z1: c[2] + R }, svg: `<g class="${cls}">${ballSvg(c, R)}</g>` })
  }
  return items
}

/** Té / jonction sur un tube existant (rotule) */
export function jonction(c: V3, r: number, fl: Fluide): Item {
  const R = r * 1.2
  return { bb: { x0: c[0] - R, y0: c[1] - R, z0: c[2] - R, x1: c[0] + R, y1: c[1] + R, z1: c[2] + R }, svg: `<g class="fl-${fl}">${ballSvg(c, R)}</g>` }
}

/** Réduction (cône) entre deux rayons sur un axe */
export function reduction(a: V3, b: V3, r0: number, r1: number, fl: Fluide): Item {
  return { bb: bboxCyl(a, b, r0, r1), svg: `<g class="fl-${fl}">${cylSvg(a, b, r0, r1, { cap: true })}</g>` }
}

export interface GaineOpts { fluide?: Fluide; w?: number; h?: number; flux?: number; ordre?: string; fleches?: boolean; collerette?: boolean }
/** Gaine rectangulaire (section w × h ; coudes carrés avec collerettes) */
export function gaine(path: (Port | V3)[], o: GaineOpts = {}): Item[] {
  const P = normaliser(path, o.ordre ?? 'zxy')
  const p0 = Array.isArray(path[0]) ? undefined : (path[0] as Port)
  const w = o.w ?? p0?.w ?? 30, h = o.h ?? p0?.h ?? 30
  const fl = o.fluide ?? p0?.fluide ?? 'air_souffle'
  const flux = o.flux ?? 0
  const cls = `ga-${fl}`
  const items: Item[] = []
  const hs = (a: V3): BBox => ({ x0: a[0] - w / 2, y0: a[1] - w / 2, z0: a[2] - h / 2, x1: a[0] + w / 2, y1: a[1] + w / 2, z1: a[2] + h / 2 })
  // coudes (cubes) puis tronçons raccourcis
  const n = P.length
  for (let i = 0; i < n - 1; i++) {
    let a = P[i], b = P[i + 1]
    const d = unit(sub(b, a))
    const ia = i > 0 ? w / 2 : 0, ib = i < n - 2 ? w / 2 : 0
    // pour les axes verticaux la demi-épaisseur de coude est h/2
    const ca = i > 0 ? (Math.abs(d[2]) > 0.5 ? h / 2 : w / 2) : 0
    const cb = i < n - 2 ? (Math.abs(d[2]) > 0.5 ? h / 2 : w / 2) : 0
    void ia; void ib
    a = add(a, mul(d, ca)); b = sub(b, mul(d, cb))
    if (len(sub(b, a)) < 0.5) continue
    const vert = Math.abs(d[2]) > 0.5
    const bx = Math.abs(d[0]) > 0.5
    const hw = (bx ? [0, w / 2] : vert ? [w / 2, w / 2] : [w / 2, 0])
    void hw
    const bb: BBox = vert
      ? { x0: Math.min(a[0], b[0]) - w / 2, x1: Math.max(a[0], b[0]) + w / 2, y0: Math.min(a[1], b[1]) - w / 2, y1: Math.max(a[1], b[1]) + w / 2, z0: Math.min(a[2], b[2]), z1: Math.max(a[2], b[2]) }
      : bx
        ? { x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), y0: a[1] - w / 2, y1: a[1] + w / 2, z0: a[2] - h / 2, z1: a[2] + h / 2 }
        : { x0: a[0] - w / 2, x1: a[0] + w / 2, y0: Math.min(a[1], b[1]), y1: Math.max(a[1], b[1]), z0: a[2] - h / 2, z1: a[2] + h / 2 }
    let s = boxSvg(bb)
    if (o.collerette !== false) {
      // collerettes aux extrémités du tronçon (joints de gaine)
      const t = 2.2
      const col = (c0: number, c1: number): BBox => vert
        ? { ...bb, z0: c0, z1: c1, x0: bb.x0 - 1.6, x1: bb.x1 + 1.6, y0: bb.y0 - 1.6, y1: bb.y1 + 1.6 }
        : bx ? { ...bb, x0: c0, x1: c1, y0: bb.y0 - 1.6, y1: bb.y1 + 1.6, z0: bb.z0 - 1.6, z1: bb.z1 + 1.6 }
          : { ...bb, y0: c0, y1: c1, x0: bb.x0 - 1.6, x1: bb.x1 + 1.6, z0: bb.z0 - 1.6, z1: bb.z1 + 1.6 }
      const lo = vert ? bb.z0 : bx ? bb.x0 : bb.y0, hi = vert ? bb.z1 : bx ? bb.x1 : bb.y1
      if (hi - lo > t * 4) s += boxSvg(col(lo, lo + t)) + boxSvg(col(hi - t, hi))
    }
    if (flux !== 0) {
      const top: V3 = vert ? a : [a[0], a[1], a[2] + h / 2 + 0.2]
      const top2: V3 = vert ? b : [b[0], b[1], b[2] + h / 2 + 0.2]
      s += flowPath(top, top2, flux, 5, 'air')
    }
    if (o.fleches && len(sub(b, a)) > 70) s += arrow(a, b, flux || 1)
    items.push({ bb, svg: `<g class="${cls}">${s}</g>` })
  }
  for (let i = 1; i < n - 1; i++) {
    const c = P[i]
    const bb = hs(c)
    items.push({ bb, svg: `<g class="${cls}">${boxSvg(bb)}</g>` })
  }
  return items
}
export { bboxUnion, bboxDe, dot }

// ───────────────────────── helpers de routage orthogonal, supports et ponts
/** Chemin en équerre entre deux points (ports ou V3). `ordre` : axes parcourus dans l'ordre ('zxy' = monter puis x puis y…).
 *  `via` impose une cote intermédiaire (ex. {z: 140} = passer à la hauteur 140, {y: 120} = longer le plan y=120). */
export function equerre(a: Port | V3, b: Port | V3, o: { ordre?: string; via?: Partial<Record<'x' | 'y' | 'z', number>> } = {}): V3[] {
  const A = toV(a), B = toV(b)
  const pts: (V3 | Port)[] = [A]
  if (o.via) pts.push([o.via.x ?? A[0], o.via.y ?? A[1], o.via.z ?? A[2]] as V3)
  if (o.via) pts.push([o.via.x ?? B[0], o.via.y ?? B[1], o.via.z ?? B[2]] as V3)
  pts.push(B)
  return normaliser(pts, o.ordre ?? 'zxy')
}

/** Support de tuyauterie : poteau + platine sous un point, jusqu'au sol (z=0). */
export function support(p: V3, r = 5, o: { larg?: number } = {}): Item[] {
  const z = p[2] - r - 0.5
  if (z < 6) return []
  const w = o.larg ?? 3
  const A: BBox = { x0: p[0] - w, y0: p[1] - w, z0: 0, x1: p[0] + w, y1: p[1] + w, z1: z }
  const B: BBox = { x0: p[0] - 8, y0: p[1] - 8, z0: 0, x1: p[0] + 8, y1: p[1] + 8, z1: 1.6 }
  const C: BBox = { x0: p[0] - r - 2.5, y0: p[1] - r - 2.5, z0: z - 2, x1: p[0] + r + 2.5, y1: p[1] + r + 2.5, z1: z }
  return [A, B, C].map((bb) => ({ bb, svg: `<g class="mm">${boxSvg(bb)}</g>` }))
}

/** Supports régulièrement espacés sous un chemin (tronçons horizontaux uniquement). */
export function supports(path: (Port | V3)[], o: { pas?: number; r?: number; ordre?: string } = {}): Item[] {
  const P = normaliser(path, o.ordre ?? 'zxy'), pas = o.pas ?? 70, r = o.r ?? 5
  const out: Item[] = []
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1], d = sub(b, a), L = len(d)
    if (Math.abs(d[2]) > 1e-6 || L < pas * 0.8) continue
    const n = Math.max(1, Math.round(L / pas))
    for (let k = 0; k < n; k++) out.push(...support(add(a, mul(unit(d), (L * (k + 0.5)) / n)), r))
  }
  return out
}

/** Pont : fait passer un tronçon droit au-dessus d'un autre au point `at` (saut de hauteur h, demi-largeur hw). */
export function pont(path: (Port | V3)[], at: V3, o: { h?: number; hw?: number } = {}): V3[] {
  const P = path.map(toV), h = o.h ?? 16, hw = o.hw ?? 12
  const out: V3[] = [P[0]]
  let fait = false
  for (let i = 1; i < P.length; i++) {
    const a = P[i - 1], b = P[i], d = sub(b, a), L = len(d)
    if (!fait && L > 2 * hw) {
      const u = unit(d), t = dot(sub(at, a), u)
      const q = add(a, mul(u, t))
      if (t > hw && t < L - hw && Math.hypot(q[0] - at[0], q[1] - at[1]) < 4) {
        const p1 = sub(q, mul(u, hw)), p2 = add(q, mul(u, hw))
        out.push(p1, [p1[0], p1[1], p1[2] + h], [p2[0], p2[1], p2[2] + h], p2)
        fait = true
      }
    }
    out.push(b)
  }
  return out
}

/** Traversée de plancher : platine + collerette à l'endroit où un tuyau plonge dans le sol (p à z=0). */
export function traversee(p: V3, r = 5, fl: Fluide = 'eau'): Item[] {
  const A: BBox = { x0: p[0] - r - 5, y0: p[1] - r - 5, z0: 0, x1: p[0] + r + 5, y1: p[1] + r + 5, z1: 1.4 }
  const B: BBox = { x0: p[0] - r - 1.6, y0: p[1] - r - 1.6, z0: 1.4, x1: p[0] + r + 1.6, y1: p[1] + r + 1.6, z1: 4 }
  return [{ bb: A, svg: `<g class="mm">${boxSvg(A)}</g>` }, { bb: B, svg: `<g class="fl-${fl}">${boxSvg(B)}</g>` }]
}

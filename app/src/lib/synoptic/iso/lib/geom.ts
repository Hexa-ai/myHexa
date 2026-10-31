// Géométrie isométrique : projection, vecteurs, arcs de Bézier 3D, silhouettes de cylindres/cônes.
// Repère monde : x (droite-bas à l'écran), y (gauche-bas), z (haut). 1 unité = 1 px à zoom 1.
// La caméra regarde depuis (+x,+y,+z) : les faces visibles sont +x, +y et +z.

export type V3 = [number, number, number]
export type V2 = [number, number]
export interface BBox { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number }

export const C30 = Math.cos(Math.PI / 6)
export const S30 = 0.5
/** Projection isométrique vraie (30°) : les 3 axes ont la même longueur écran (=1). */
export const proj = (p: V3): V2 => [(p[0] - p[1]) * C30, (p[0] + p[1]) * S30 - p[2]]
/** Profondeur (plus grand = plus proche de la caméra). */
export const profondeur = (p: V3): number => p[0] + p[1] + p[2]
export const VUE: V3 = [1, 1, 1]

export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k]
export const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const len = (a: V3): number => Math.hypot(a[0], a[1], a[2])
export const unit = (a: V3): V3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l] }
export const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
export const cross2 = (a: V2, b: V2): number => a[0] * b[1] - a[1] * b[0]

export const f = (n: number): string => { const r = Math.round(n * 100) / 100; return Object.is(r, -0) ? '0' : String(r) }
export const P2 = (p: V3): string => { const q = proj(p); return f(q[0]) + ' ' + f(q[1]) }
export const pts = (a: V3[]): string => a.map((p) => { const q = proj(p); return f(q[0]) + ',' + f(q[1]) }).join(' ')

/** Base orthonormée perpendiculaire à un axe. */
export function basePerp(axis: V3): [V3, V3] {
  const a = unit(axis)
  const h: V3 = Math.abs(a[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]
  const u = unit(cross3(h, a))
  const v = cross3(a, u)
  return [u, v]
}

/** Commandes SVG "C" d'un arc d'ellipse 3D (vecteurs u,v portent le rayon). La projection est affine → Bézier exact. */
export function arcCmds(c: V3, u: V3, v: V3, a0: number, a1: number): string {
  const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / (Math.PI / 2) - 1e-9))
  const d = (a1 - a0) / n
  const k = (4 / 3) * Math.tan(d / 4)
  const p = (t: number): V3 => add(c, add(mul(u, Math.cos(t)), mul(v, Math.sin(t))))
  const tg = (t: number): V3 => add(mul(u, -Math.sin(t)), mul(v, Math.cos(t)))
  let s = ''
  for (let i = 0; i < n; i++) {
    const t0 = a0 + i * d, t1 = t0 + d
    const p0 = p(t0), p1 = p(t1)
    s += `C${P2(add(p0, mul(tg(t0), k)))} ${P2(sub(p1, mul(tg(t1), k)))} ${P2(p1)}`
  }
  return s
}
export const ptCircle = (c: V3, u: V3, v: V3, t: number): V3 => add(c, add(mul(u, Math.cos(t)), mul(v, Math.sin(t))))
/** Chemin fermé d'une ellipse 3D complète. */
export function ellipseD(c: V3, u: V3, v: V3): string {
  return `M${P2(ptCircle(c, u, v, 0))}${arcCmds(c, u, v, 0, Math.PI * 2)}Z`
}
/** Arc seul (M + C...). */
export function arcD(c: V3, u: V3, v: V3, a0: number, a1: number): string {
  return `M${P2(ptCircle(c, u, v, a0))}${arcCmds(c, u, v, a0, a1)}`
}

/** Un point du cercle est "proche" de la caméra si son décalage radial pointe vers (1,1,1). */
export const estProche = (u: V3, v: V3, t: number): boolean => dot(add(mul(u, Math.cos(t)), mul(v, Math.sin(t))), VUE) > 0

/** Angles (2) des génératrices de silhouette d'un tronc de cône / cylindre d'axe c0→c1 (rayons r0, r1). */
export function silhouette(c0: V3, r0: number, c1: V3, r1: number, u: V3, v: V3): [number, number] {
  const ax = sub(c1, c0)
  const F = (t: number): number => {
    const e = add(mul(u, Math.cos(t)), mul(v, Math.sin(t)))
    const D = add(ax, mul(e, r1 - r0))
    const T = add(mul(u, -Math.sin(t)), mul(v, Math.cos(t)))
    return cross2(proj(D), proj(T))
  }
  const N = 720
  const roots: number[] = []
  let prev = F(0)
  for (let i = 1; i <= N; i++) {
    const t = (i / N) * Math.PI * 2
    const cur = F(t)
    if (prev === 0 || prev * cur < 0) {
      let a = ((i - 1) / N) * Math.PI * 2, b = t, fa = prev
      for (let k = 0; k < 30; k++) { const m = (a + b) / 2, fm = F(m); if (fa * fm <= 0) b = m; else { a = m; fa = fm } }
      roots.push((a + b) / 2)
    }
    prev = cur
  }
  if (roots.length < 2) { roots.push(0, Math.PI) }
  return [roots[0], roots[1]]
}

/** Intersection/Union de boîtes. */
export function bboxDe(...ps: V3[]): BBox {
  return {
    x0: Math.min(...ps.map((p) => p[0])), y0: Math.min(...ps.map((p) => p[1])), z0: Math.min(...ps.map((p) => p[2])),
    x1: Math.max(...ps.map((p) => p[0])), y1: Math.max(...ps.map((p) => p[1])), z1: Math.max(...ps.map((p) => p[2])),
  }
}
export function bboxUnion(bs: BBox[]): BBox {
  return {
    x0: Math.min(...bs.map((b) => b.x0)), y0: Math.min(...bs.map((b) => b.y0)), z0: Math.min(...bs.map((b) => b.z0)),
    x1: Math.max(...bs.map((b) => b.x1)), y1: Math.max(...bs.map((b) => b.y1)), z1: Math.max(...bs.map((b) => b.z1)),
  }
}
export function bboxCoins(b: BBox): V3[] {
  const o: V3[] = []
  for (const x of [b.x0, b.x1]) for (const y of [b.y0, b.y1]) for (const z of [b.z0, b.z1]) o.push([x, y, z])
  return o
}
/** Boîte englobante d'un cylindre d'axe p0→p1, rayon r. */
export function bboxCyl(p0: V3, p1: V3, r0: number, r1 = r0): BBox {
  const a = unit(sub(p1, p0))
  const e = (r: number): V3 => [r * Math.sqrt(Math.max(0, 1 - a[0] * a[0])), r * Math.sqrt(Math.max(0, 1 - a[1] * a[1])), r * Math.sqrt(Math.max(0, 1 - a[2] * a[2]))]
  const e0 = e(r0), e1 = e(r1)
  return {
    x0: Math.min(p0[0] - e0[0], p1[0] - e1[0]), y0: Math.min(p0[1] - e0[1], p1[1] - e1[1]), z0: Math.min(p0[2] - e0[2], p1[2] - e1[2]),
    x1: Math.max(p0[0] + e0[0], p1[0] + e1[0]), y1: Math.max(p0[1] + e0[1], p1[1] + e1[1]), z1: Math.max(p0[2] + e0[2], p1[2] + e1[2]),
  }
}

/** Tri peintre : renvoie les éléments de l'arrière vers l'avant.
 *  a est dessiné avant b si b est "devant" a sur un axe de séparation (b.x0>=a.x1 ou b.y0>=a.y1 ou b.z0>=a.z1).
 *  Les cas ambigus (pas d'axe de séparation, ou contradictoires) conservent l'ordre d'insertion. */
export const EPS = 0.01
export function derriere(a: BBox, b: BBox): boolean { return a.x1 <= b.x0 + EPS || a.y1 <= b.y0 + EPS || a.z1 <= b.z0 + EPS }
/** Relation forcée entre deux éléments (surcharge le tri par boîtes) : cet élément est DERRIÈRE / DEVANT l'élément d'identifiant `id`. */
export interface Rel { id: string; cote: 'derriere' | 'devant' }
/** Plan forcé : 'arriere' (dessiné d'abord), 'avant' (dessiné en dernier), ou un décalage numérique (calques : plus grand = plus près). */
export type Plan = 'avant' | 'arriere' | number
export const couche = (p?: Plan): number => (p == null ? 0 : p === 'avant' ? 1000 : p === 'arriere' ? -1000 : Number(p) || 0)
export function trier<T extends { bb: BBox; id?: string; rel?: Rel[]; plan?: Plan }>(items: T[]): T[] {
  const n = items.length
  const succ: number[][] = Array.from({ length: n }, () => [])
  const indeg = new Array(n).fill(0)
  const byId = new Map<string, number[]>()
  items.forEach((it, i) => { if (it.id) { const a = byId.get(it.id) ?? []; a.push(i); byId.set(it.id, a) } })
  const L = items.map((it) => couche(it.plan))
  const forced = new Map<string, number>() // `${i}|${j}` : -1 (i avant j) / 1 (j avant i)
  items.forEach((it, i) => { for (const r of it.rel ?? []) for (const j of byId.get(r.id) ?? []) { if (j === i) continue; forced.set(i + '|' + j, r.cote === 'derriere' ? -1 : 1); forced.set(j + '|' + i, r.cote === 'derriere' ? 1 : -1) } })
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    let o = 0 // -1 : i d'abord ; 1 : j d'abord
    if (L[i] !== L[j]) o = L[i] < L[j] ? -1 : 1
    else if (forced.has(i + '|' + j)) o = forced.get(i + '|' + j)!
    else {
      const ij = derriere(items[i].bb, items[j].bb), ji = derriere(items[j].bb, items[i].bb)
      o = ij && !ji ? -1 : ji && !ij ? 1 : 0
    }
    if (o === -1) { succ[i].push(j); indeg[j]++ } else if (o === 1) { succ[j].push(i); indeg[i]++ }
  }
  const done = new Array(n).fill(false)
  const out: T[] = []
  for (let k = 0; k < n; k++) {
    let pick = -1
    for (let i = 0; i < n; i++) if (!done[i] && indeg[i] === 0) { pick = i; break }
    if (pick < 0) { let bl = 1e9; for (let i = 0; i < n; i++) if (!done[i] && L[i] < bl) { bl = L[i]; pick = i } } // cycle : couche la plus basse, ordre d'insertion
    done[pick] = true
    out.push(items[pick])
    for (const s of succ[pick]) indeg[s]--
  }
  return out
}

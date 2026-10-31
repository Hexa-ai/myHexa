// Rendu de la tuyauterie : tuyaux droits, vrais coudes (tore), brides boulonnées, soudures, tés, croix, réductions, calorifuge, flux.
import type { V3, BBox } from './geom'
import { add, sub, mul, dot, unit, len, cross3, proj, P2, VUE, basePerp, arcD, ellipseD, ptCircle, bboxCyl, bboxUnion } from './geom'
import { cylSvg } from './iso'
import type { Fluide } from './types'

export interface Piece { bb: BBox; svg: string; k?: number }

// ───────────── DN nominal ↔ rayon visuel (px à zoom 1)
export const DN_TABLE: [number, number][] = [[15, 2.4], [20, 3], [25, 3.5], [32, 4], [40, 4.5], [50, 5], [65, 6], [80, 7], [100, 8.5], [125, 10], [150, 12], [200, 15], [250, 18], [300, 21], [400, 26], [600, 36]]
export function rayonDN(dn: number): number {
  if (dn < 15) return dn // déjà un rayon
  for (let i = 0; i < DN_TABLE.length; i++) {
    if (dn <= DN_TABLE[i][0]) {
      if (i === 0 || dn === DN_TABLE[i][0]) return DN_TABLE[i][1]
      const [d0, r0] = DN_TABLE[i - 1], [d1, r1] = DN_TABLE[i]
      return r0 + ((dn - d0) / (d1 - d0)) * (r1 - r0)
    }
  }
  return DN_TABLE[DN_TABLE.length - 1][1]
}
export function dnDeRayon(r: number): number {
  let best = DN_TABLE[0], d = 1e9
  for (const t of DN_TABLE) { const e = Math.abs(t[1] - r); if (e < d) { d = e; best = t } }
  return best[0]
}
/** rayon de cintrage (axe) */
export const rayonCoude = (r: number): number => 2 * r
export const EPAIS_BRIDE = 3
/** longueur mini d'un tronçon droit sortant d'un port (bride + coude) */
export const sortieMini = (r: number): number => rayonCoude(r) + EPAIS_BRIDE + 4


// ───────────── brides
export function flangeSvg(c: V3, dir: V3, r: number, t = EPAIS_BRIDE, n?: number): { svg: string; bb: BBox } {
  const rb = r * 1.9
  const q = add(c, mul(dir, t))
  const nb = n ?? (r < 4.4 ? 4 : r < 8 ? 6 : 8)
  let s = cylSvg(c, q, rb, rb, { cap: true })
  const wc = dot(dir, VUE) >= 0 ? q : c
  const [u, v] = basePerp(dir)
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * Math.PI * 2 + 0.3
    const p = ptCircle(wc, mul(u, rb * 0.72), mul(v, rb * 0.72), a)
    s += `<path class="bolt" d="${ellipseD(p, mul(u, rb * 0.12), mul(v, rb * 0.12))}"/>`
  }
  return { svg: `<g class="mm">${s}</g>`, bb: bboxCyl(c, q, rb) }
}
/** bride pleine (obturateur) */
export function bridePleineSvg(c: V3, dir: V3, r: number): Piece {
  const a = flangeSvg(c, dir, r, EPAIS_BRIDE * 1.4, r < 4.4 ? 4 : 6)
  return { bb: a.bb, svg: a.svg }
}

// ───────────── tuyau droit
export function tuyauSvg(a: V3, b: V3, r: number, o: { flux?: number; calo?: boolean; fl?: Fluide } = {}): Piece {
  const L = len(sub(b, a))
  let s = ''
  let bb = bboxCyl(a, b, r)
  if (o.calo) {
    const rc = r * 1.55
    bb = bboxCyl(a, b, rc)
    s = `<g class="ca">${cylSvg(a, b, rc, rc, { cap: false })}</g>`
    // bagues de tôle d'habillage
    const n = Math.max(1, Math.floor(L / 26))
    const d = unit(sub(b, a))
    const [u, v] = basePerp(d)
    const phi = Math.atan2(dot(v, VUE), dot(u, VUE))
    for (let i = 1; i <= n; i++) {
      const c = add(a, mul(d, (L * i) / (n + 1)))
      s += `<path class="ed2" d="${arcD(c, mul(u, rc), mul(v, rc), phi - Math.PI / 2, phi + Math.PI / 2)}"/>`
    }
  } else s = cylSvg(a, b, r, r, { cap: false })
  if (o.flux) s += fluxLigne([a, b], o.flux)
  return { bb, svg: s }
}
/** pointillé animé le long d'une polyligne ; flux = ±1 */
export function fluxLigne(P: V3[], flux: number): string {
  const Q = flux >= 0 ? P : [...P].reverse()
  if (len(sub(Q[Q.length - 1], Q[0])) < 6 && Q.length < 3) return ''
  return `<path class="flow" d="M${Q.map(P2).join('L')}"/>`
}

// ───────────── coude (vrai tore)
/** Coude de rayon de cintrage R, tube de rayon r. Surface du tore tessellée par sections : la partie visible (demi-cercle tourné vers la caméra)
 *  est remplie en clair, puis la zone sombre — définie par une direction d'ombre continue entre les deux tuyaux droits — par-dessus ; contour = deux génératrices de silhouette. */
export function coudeSvg(P: V3, d1: V3, d2: V3, R: number, r: number, o: { flux?: number; calo?: boolean } = {}): Piece {
  const rr = o.calo ? r * 1.55 : r
  const S = sub(P, mul(d1, R)), O = add(S, mul(d2, R))
  const N = 20, HP = Math.PI / 2
  const C: V3[] = [], M: V3[] = [], Nn: V3[] = []
  for (let i = 0; i <= N; i++) {
    const th = (i / N) * HP
    C.push(add(O, add(mul(d2, -R * Math.cos(th)), mul(d1, R * Math.sin(th)))))
    const T = unit(add(mul(d1, Math.cos(th)), mul(d2, Math.sin(th))))
    M.push(unit(sub(VUE, mul(T, dot(VUE, T)))))
    Nn.push(unit(cross3(T, VUE)))
  }
  // direction d'ombre : normale de la silhouette droite (écran) du tuyau amont et aval, interpolée
  const droite = (n: V3): V3 => (proj(n)[0] >= 0 ? n : mul(n, -1))
  const D0 = droite(Nn[0]), D1 = droite(Nn[N])
  const pt = (i: number, g: number): V3 => add(C[i], mul(add(mul(M[i], Math.cos(g)), mul(Nn[i], Math.sin(g))), rr))
  const arc = (i: number, g0: number, g1: number, k = 5): V3[] => Array.from({ length: k + 1 }, (_, q) => pt(i, g0 + ((g1 - g0) * q) / k))
  const region = (lo: (i: number) => number, hi: (i: number) => number): string => {
    const A: V3[] = [], B: V3[] = []
    for (let i = 0; i <= N; i++) { A.push(pt(i, lo(i))); B.push(pt(i, hi(i))) }
    const pts = [...A, ...arc(N, lo(N), hi(N)).slice(1), ...B.slice().reverse(), ...arc(0, hi(0), lo(0)).slice(1)]
    return `M${pts.map(P2).join('L')}Z`
  }
  const beta = (i: number): number => {
    const t = i / N
    const Dc = add(mul(D0, 1 - t), mul(D1, t))
    return Math.atan2(dot(Dc, Nn[i]), dot(Dc, M[i]))
  }
  const dlo = (i: number) => Math.max(-HP, beta(i) - HP), dhi = (i: number) => Math.min(HP, beta(i) + HP)
  const light = region(() => -HP, () => HP), dark = region(dlo, dhi)
  const outline = `M${Array.from({ length: N + 1 }, (_, i) => P2(pt(i, -HP))).join('L')}M${Array.from({ length: N + 1 }, (_, i) => P2(pt(i, HP))).join('L')}`
  let s = `<path class="l0" d="${light}"/><path class="r0" d="${dark}"/><path class="ed" d="${outline}"/>`
  if (o.flux) s += fluxLigne(C, o.flux)
  const E = add(P, mul(d2, R))
  const bbx: BBox = {
    x0: Math.min(S[0], E[0], P[0]) - rr, y0: Math.min(S[1], E[1], P[1]) - rr, z0: Math.min(S[2], E[2], P[2]) - rr,
    x1: Math.max(S[0], E[0], P[0]) + rr, y1: Math.max(S[1], E[1], P[1]) + rr, z1: Math.max(S[2], E[2], P[2]) + rr,
  }
  return { bb: bbx, svg: s }
}

/** anneau de soudure (arc proche) sur un tuyau de rayon r au point c, axe d : filet fin, à peine plus large que le tube */
export function soudureSvg(c: V3, d: V3, r: number): string {
  const [u, v] = basePerp(d)
  const phi = Math.atan2(dot(v, VUE), dot(u, VUE))
  return `<path class="ed2" style="stroke-width:.7;stroke-opacity:.8" d="${arcD(c, mul(u, r * 1.012), mul(v, r * 1.012), phi - Math.PI / 2, phi + Math.PI / 2)}"/>`
}

// ───────────── té / croix / réduction
/** té : tuyau principal de a à b (rayon r), piquage en c (sur l'axe) vers dir sur la longueur lb (rayon rb) */
export function teSvg(a: V3, b: V3, c: V3, dir: V3, lb: number, r: number, rb: number): Piece {
  const end = add(c, mul(dir, lb))
  const root = add(c, mul(dir, r * 0.55))
  const branche = cylSvg(root, end, rb, rb, { cap: false })
  const bague = soudureSvg(add(c, mul(dir, r + 1.2)), dir, rb)
  const main = cylSvg(a, b, r, r, { cap: false })
  const facing = dot(dir, VUE) > 0
  const svg = facing ? main + branche + bague : branche + main
  return { bb: bboxUnion([bboxCyl(a, b, r), bboxCyl(root, end, rb)]), svg }
}
/** réduction concentrique */
export function reductionSvg(a: V3, b: V3, r0: number, r1: number): Piece {
  return { bb: bboxCyl(a, b, r0, r1), svg: cylSvg(a, b, r0, r1, { cap: false }) + soudureSvg(a, unit(sub(b, a)), r0) + soudureSvg(b, unit(sub(b, a)), r1) }
}

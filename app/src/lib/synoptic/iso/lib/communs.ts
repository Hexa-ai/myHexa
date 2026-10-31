/* eslint-disable */
// @ts-nocheck — catalogue de dessin (code massif copié de iso_lib, qui compile sans strictNullChecks) ; voir iso/README.md
// Briques communes aux symboles (moteurs, socles, bornes, grilles…).
import { Builder, Part, r2, c2, l2, p2, d2 } from './iso'
import type { V3 } from './geom'

/** Grille de ventilateur : cercles + rayons, dans un plan centré (0,0) */
export const grille = (r: number, nr = 2, nb = 8): string => {
  let s = c2(0, 0, r, 'ed')
  for (let i = 1; i <= nr; i++) s += c2(0, 0, (r * i) / (nr + 1), 'ed2')
  for (let i = 0; i < nb; i++) { const a = (i / nb) * Math.PI * 2; s += l2(Math.cos(a) * r * 0.2, Math.sin(a) * r * 0.2, Math.cos(a) * r, Math.sin(a) * r, 'ed2') }
  return s
}
/** Grille de capot fine : trame de fentes radiales + anneaux, moyeu discret */
export const grilleCapot = (r: number): string => {
  let s = ''
  for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; s += l2(Math.cos(a) * r * 0.22, Math.sin(a) * r * 0.22, Math.cos(a) * r * 0.96, Math.sin(a) * r * 0.96, 'ed2') }
  for (const k of [0.34, 0.52, 0.7, 0.88]) s += c2(0, 0, r * k, 'ed2')
  return c2(0, 0, r, 'ed') + s + c2(0, 0, r * 0.2, 'fm') + c2(0, 0, r * 0.2, 'ed2')
}
/** Hélice axiale (n pales courbes) centrée 0,0 */
export const helice = (r: number, n = 5, cls = 'fm'): string => {
  let s = ''
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 360
    s += `<path class="${cls}" transform="rotate(${a})" d="M0 0C${r * 0.15} ${-r * 0.2} ${r * 0.55} ${-r * 0.42} ${r} ${-r * 0.22}C${r * 0.9} ${r * 0.18} ${r * 0.35} ${r * 0.2} 0 ${r * 0.08}Z"/>`
  }
  return s + c2(0, 0, r * 0.16, 'fd')
}
/** Roue centrifuge (aubes courbées vers l'arrière) vue de face, centrée 0,0 */
export const roueAubes = (r: number, n = 9): string => {
  let s = c2(0, 0, r, 'fm') + c2(0, 0, r * 0.38, 'fb')
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 360
    s += `<path class="ed" transform="rotate(${a})" d="M${r * 0.38} 0C${r * 0.62} ${-r * 0.02} ${r * 0.8} ${-r * 0.2} ${r * 0.97} ${-r * 0.42}"/>`
  }
  return s + c2(0, 0, r * 0.12, 'fd')
}
/** Impeller de pompe (visible dans un plan) */
export const impeller = (r: number, n = 6): string => {
  let s = c2(0, 0, r, 'fm')
  for (let i = 0; i < n; i++) { const a = (i / n) * 360; s += `<path class="ed" transform="rotate(${a})" d="M${r * 0.2} 0Q${r * 0.55} ${-r * 0.1} ${r * 0.92} ${-r * 0.45}"/>` }
  return s + c2(0, 0, r * 0.14, 'fd')
}

/** Moteur asynchrone horizontal le long de x (ailettes, capot ventilateur, boîte à bornes). Renvoie les pièces utiles. */
export function moteurX(b: Builder, x: number, cy: number, cz: number, r: number, l: number, o: { cowl?: boolean; fan?: boolean; bornes?: boolean; pieds?: boolean; accent?: boolean } = {}) {
  const corps = b.cylX(x, cy, cz, r, l, 'mb')
  const n = Math.max(4, Math.round(l / 5))
  b.rings(corps, [x, cy, cz], [x + l, cy, cz], r, Array.from({ length: n - 1 }, (_, i) => (i + 1) / n))
  // flasque avant (côté accouplement) plus métal
  b.cylX(x - 3, cy, cz, r * 0.94, 3, 'mm')
  let xe = x + l
  let cowl: Part | undefined
  if (o.cowl !== false) {
    cowl = b.cylX(xe, cy, cz, r * 0.88, 14, 'mm')
    b.rings(cowl, [xe, cy, cz], [xe + 14, cy, cz], r * 0.88, [0.34, 0.67])
    if (o.fan !== false) {
      b.pl('yz', xe + 14, `<g transform="translate(${cy} ${cz})">${c2(0, 0, r * 0.84, 'fd')}</g>`, cowl)
      b.rotor('yz', xe + 14, cy, cz, `<g style="opacity:.55">${helice(r * 0.7, 7, 'fm')}</g>`, cowl, 0.9)
      b.pl('yz', xe + 14.1, `<g transform="translate(${cy} ${cz})">${grilleCapot(r * 0.84)}</g>`, cowl)
    }
    xe += 14
  }
  if (o.bornes !== false) {
    const bx = x + l * 0.3
    const bor = b.box(bx, cy - 6, cz + r - 1, 17, 12, 8, 'mm')
    b.cylY(bx + 8.5, cy + 6, cz + r + 4, 2.4, 3, 'md')
    b.pl('xy', cz + r + 7, r2(bx + 2.5, cy - 3.5, 12, 7, 'ed2'), bor)
    b.led([bx + 14, cy + 2.5, cz + r + 7], bor, 1.8)
  }
  if (o.pieds !== false) {
    b.box(x + 4, cy - r - 1.5, cz - r - 4, l - 8, 2 * r + 3, 4, 'mm')
  }
  if (o.accent) {
    // (anneau turquoise parasite supprimé : l'état se lit sur la LED de la boîte à bornes)
  }
  return { corps, cowl, xe }
}

/** Socle châssis (2 longerons + plaque + boulons d'ancrage) */
export function socle(b: Builder, x: number, y: number, w: number, d: number, h = 4, m = 'mm') {
  const p = b.box(x, y, 0, w, d, h, m)
  for (const [bx, by] of [[x + 5, y + 4], [x + w - 5, y + 4], [x + 5, y + d - 4], [x + w - 5, y + d - 4]]) {
    b.pl('xy', h, c2(bx, by, 1.8, 'fk'), p)
  }
  return p
}

/** Flèche de sens posée à plat (plan xy) : triangle + queue */
export const flecheSol = (x: number, y: number, ang: number, s = 1): string =>
  `<g transform="translate(${x} ${y}) rotate(${ang}) scale(${s})">${d2('M-6 -1.8H1V-4.5L8 0L1 4.5V1.8H-6Z', 'fa')}</g>`

export type { V3 }

/** Moteur vertical (axe z) : corps à ailettes, capot ventilateur avec hélice visible sur le dessus. Renvoie z du haut. */
export function moteurZ(b: Builder, cx: number, cy: number, z: number, r: number, l: number, o: { bornes?: boolean; fan?: boolean } = {}): number {
  const corps = b.cylZ(cx, cy, z, r, l, 'mb')
  const n = Math.max(4, Math.round(l / 5))
  b.rings(corps, [cx, cy, z], [cx, cy, z + l], r, Array.from({ length: n - 1 }, (_, i) => (i + 1) / n))
  const cowl = b.cylZ(cx, cy, z + l, r * 0.88, 10, 'mm')
  b.rings(cowl, [cx, cy, z + l], [cx, cy, z + l + 10], r * 0.88, [0.5])
  if (o.fan !== false) {
    b.pl('xy', z + l + 10, `<g transform="translate(${cx} ${cy})">${c2(0, 0, r * 0.84, 'fd')}</g>`, cowl)
    b.rotor('xy', z + l + 10, cx, cy, `<g style="opacity:.55">${helice(r * 0.7, 7, 'fm')}</g>`, cowl, 0.9)
    b.pl('xy', z + l + 10.1, `<g transform="translate(${cx} ${cy})">${grilleCapot(r * 0.84)}</g>`, cowl)
  }
  if (o.bornes !== false) {
    const bx = b.box(cx + r - 2, cy - 6, z + l * 0.45, 9, 12, 9, 'mm')
    b.led([cx + r + 7, cy + 2, z + l * 0.45 + 9], bx, 1.8)
  }
  return z + l + 10
}

/** Corps de vanne en ligne : tubulures + brides aux 2 extrémités (axe x) */
export function inline(b: Builder, W: number, cy: number, zc: number, r: number, rb = r * 1.9, tb = 3): void {
  b.cylX(tb, cy, zc, r * 1.2, W - 2 * tb, 'mm')
  b.flange([0, cy, zc], 'x', rb, tb, 8)
  b.flange([W - tb, cy, zc], 'x', rb, tb, 8)
  b.port('a', [0, cy, zc], [-1, 0, 0], { dn: r })
  b.port('b', [W, cy, zc], [1, 0, 0], { dn: r })
}

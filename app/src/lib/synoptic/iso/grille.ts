// Grille isométrique de l'éditeur : projection, retour de l'écran vers le sol, aimantation, dessin de la grille (2 axes à 30° + hauteur).
import type { IsoSection, IsoSol } from './format'
import { SOL_DEFAUT } from './format'

export const C30 = Math.sqrt(3) / 2
export const S30 = 0.5

/** monde (x, y, z) → écran */
export const projeter = (x: number, y: number, z = 0): [number, number] => [(x - y) * C30, (x + y) * S30 - z]

/** écran → point du plan horizontal situé à la hauteur z */
export function auSol(sx: number, sy: number, z = 0): [number, number] {
  const a = sx / C30
  const b = (sy + z) / S30
  return [(a + b) / 2, (b - a) / 2]
}

/** déplacement écran (dx, dy) → déplacement (x, y) dans le plan horizontal */
export function deplacementSol(dsx: number, dsy: number): [number, number] {
  const a = dsx / C30
  const b = dsy / S30
  return [(a + b) / 2, (b - a) / 2]
}

/** valeur arrondie au pas d'aimantation (les zéros négatifs sont évités) */
export const aimanter = (v: number, pas: number): number => Math.round(v / pas) * pas + 0

export const PAS_AIMANT = [10, 20, 40] as const

/** étendue du sol : la zone par défaut ou celle de l'iso, agrandie pour contenir tous les composants */
export function solEffectif(iso: IsoSection): IsoSol {
  const base = { ...(iso.sol ?? SOL_DEFAUT) }
  for (const c of iso.composants) {
    base.x0 = Math.min(base.x0, Math.floor((c.x - 80) / base.pas) * base.pas)
    base.y0 = Math.min(base.y0, Math.floor((c.y - 80) / base.pas) * base.pas)
    base.x1 = Math.max(base.x1, Math.ceil((c.x + 160) / base.pas) * base.pas)
    base.y1 = Math.max(base.y1, Math.ceil((c.y + 160) / base.pas) * base.pas)
  }
  return base
}

const f = (n: number): string => (Math.round(n * 10) / 10).toString()

/** grille au sol : un trait par pas selon chaque axe (30° de part et d'autre de l'horizontale) + axe de hauteur gradué, au coin x0, y0 */
export function grilleSvg(sol: IsoSol, hauteur = 240): string {
  const { x0, y0, x1, y1, pas } = sol
  let d = ''
  for (let x = x0; x <= x1 + 0.01; x += pas) {
    const a = projeter(x, y0)
    const b = projeter(x, y1)
    d += `M${f(a[0])} ${f(a[1])}L${f(b[0])} ${f(b[1])}`
  }
  for (let y = y0; y <= y1 + 0.01; y += pas) {
    const a = projeter(x0, y)
    const b = projeter(x1, y)
    d += `M${f(a[0])} ${f(a[1])}L${f(b[0])} ${f(b[1])}`
  }
  const o = projeter(x0, y0)
  let h = `M${f(o[0])} ${f(o[1])}L${f(o[0])} ${f(o[1] - hauteur)}`
  for (let z = pas; z <= hauteur; z += pas) h += `M${f(o[0] - 4)} ${f(o[1] - z)}h8`
  return `<g class="iso-grille"><path class="iso-gl" d="${d}"/><path class="iso-gz" d="${h}"/></g>`
}

/** rectangle écran [x, y, w, h] qui contient le sol et la graduation de hauteur */
export function boiteSol(sol: IsoSol, hauteur = 240): [number, number, number, number] {
  const pts = [projeter(sol.x0, sol.y0), projeter(sol.x1, sol.y0), projeter(sol.x1, sol.y1), projeter(sol.x0, sol.y1)]
  const o = pts[0]
  pts.push([o[0], o[1] - hauteur])
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return [x, y, Math.max(...xs) - x, Math.max(...ys) - y]
}

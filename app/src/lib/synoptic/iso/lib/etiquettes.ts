// Placement automatique d'étiquettes (cartes de valeurs) : 8 directions candidates × anneaux de distance croissante.
// Règles : leader droit et court (angles multiples de 45°), même distance à l'objet partout (anneau 0 = distance `dist`),
// jamais de chevauchement carte/dessin ni carte/carte, un leader ne traverse pas une autre carte, positions calées sur une grille.
// Module pur (aucune dépendance DOM) : testable sous node.
import type { V3, BBox } from './geom'
import { proj, bboxCoins } from './geom'

export type Pt = [number, number]
export interface Rect { x0: number; y0: number; x1: number; y1: number }

/** Demande de placement : ancre écran + taille de la carte. */
export interface Demande {
  ax: number; ay: number; w: number; h: number
  /** directions autorisées (indices 0..7 de DIRS) ; défaut : toutes */
  dirs?: number[]
  /** direction préférée (index) : pénalité réduite */
  pref?: number
}
export interface Placee {
  /** coin haut-gauche de la carte */
  x: number; y: number; w: number; h: number
  ax: number; ay: number
  /** extrémité du leader sur la carte */
  lx: number; ly: number
  dir: number
  /** numéro d'anneau (0 = distance nominale) */
  anneau: number
  /** true si aucune position sans chevauchement n'a été trouvée */
  conflit: boolean
}
export interface OptsPlacement {
  /** distance nominale ancre → carte (px) */
  dist?: number
  /** incrément d'anneau (px) */
  pas?: number
  anneaux?: number
  /** pas de la grille de calage (px) ; 0 = aucun */
  grille?: number
  /** marge autour des cartes (px) */
  marge?: number
}

/** 8 directions (écran, y vers le bas) : E, SE, S, SW, W, NW, N, NE */
export const DIRS: Pt[] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]].map(([x, y]) => (x && y ? [x * Math.SQRT1_2, y * Math.SQRT1_2] : [x, y]) as Pt)
/** ordre de préférence (le haut et les côtés avant le bas) */
const PREF_DIR = [6, 7, 5, 0, 4, 2, 1, 3]

// ───────────── géométrie
export const rect = (x: number, y: number, w: number, h: number): Rect => ({ x0: x, y0: y, x1: x + w, y1: y + h })
export const rectsSeChevauchent = (a: Rect, b: Rect, m = 0): boolean => a.x0 < b.x1 + m && a.x1 > b.x0 - m && a.y0 < b.y1 + m && a.y1 > b.y0 - m

/** enveloppe convexe (chaîne monotone) */
export function enveloppe(P: Pt[]): Pt[] {
  const p = [...P].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (p.length < 3) return p
  const cr = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lo: Pt[] = [], up: Pt[] = []
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q) }
  for (const q of [...p].reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q) }
  return lo.slice(0, -1).concat(up.slice(0, -1))
}
/** silhouette écran (polygone convexe) d'une boîte 3D */
export const polyDeBBox = (b: BBox): Pt[] => enveloppe(bboxCoins(b).map((c) => proj(c as V3) as Pt))

/** SAT : polygone convexe vs rectangle (marge m : rectangle agrandi) */
export function polyRect(poly: Pt[], r: Rect, m = 0): boolean {
  const R: Pt[] = [[r.x0 - m, r.y0 - m], [r.x1 + m, r.y0 - m], [r.x1 + m, r.y1 + m], [r.x0 - m, r.y1 + m]]
  if (poly.length === 0) return false
  // axes du rectangle
  const px = poly.map((p) => p[0]), py = poly.map((p) => p[1])
  if (Math.max(...px) <= R[0][0] || Math.min(...px) >= R[1][0] || Math.max(...py) <= R[0][1] || Math.min(...py) >= R[2][1]) return false
  // axes du polygone
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    const nx = -(b[1] - a[1]), ny = b[0] - a[0]
    let mn1 = 1e18, mx1 = -1e18, mn2 = 1e18, mx2 = -1e18
    for (const p of poly) { const d = p[0] * nx + p[1] * ny; mn1 = Math.min(mn1, d); mx1 = Math.max(mx1, d) }
    for (const p of R) { const d = p[0] * nx + p[1] * ny; mn2 = Math.min(mn2, d); mx2 = Math.max(mx2, d) }
    if (mx1 <= mn2 || mx2 <= mn1) return false
  }
  return true
}
/** segment vs rectangle (Liang–Barsky) */
export function segRect(a: Pt, b: Pt, r: Rect): boolean {
  let t0 = 0, t1 = 1
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const P = [-dx, dx, -dy, dy], Q = [a[0] - r.x0, r.x1 - a[0], a[1] - r.y0, r.y1 - a[1]]
  for (let i = 0; i < 4; i++) {
    if (P[i] === 0) { if (Q[i] < 0) return false } else { const t = Q[i] / P[i]; if (P[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t } else { if (t < t0) return false; if (t < t1) t1 = t } }
  }
  return true
}
/** segment vs segment (intersection propre) */
export function segSeg(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o = (p: Pt, q: Pt, r: Pt) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
  const d1 = o(a, b, c), d2 = o(a, b, d), d3 = o(c, d, a), d4 = o(c, d, b)
  return d1 * d2 < 0 && d3 * d4 < 0
}
function pointDansPoly(p: Pt, poly: Pt[]): boolean {
  let s = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    const c = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
    if (c !== 0) { if (s !== 0 && Math.sign(c) !== s) return false; s = Math.sign(c) }
  }
  return true
}
/** longueur du segment a→b à l'intérieur de polys (échantillonnage tous les 4 px) */
function longueurDans(a: Pt, b: Pt, polys: Pt[][], saut = 9): number {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 3))
  let k = 0
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n
    if (t * L < saut) continue      // le départ du leader est toujours sur l'objet mesuré
    const p: Pt = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
    if (polys.some((q) => pointDansPoly(p, q))) k++
  }
  return (L * k) / n
}

// ───────────── placement
/** extrémité du leader et carte pour une direction, un anneau donné */
export function candidate(d: Demande, dir: number, dist: number, grille: number): { x: number; y: number; lx: number; ly: number } {
  const u = DIRS[dir]
  let ex = d.ax + u[0] * dist, ey = d.ay + u[1] * dist
  // calage sur la grille : l'extrémité du leader se cale sur l'axe où le leader est orthogonal à la grille
  if (grille > 0) {
    if (Math.abs(u[0]) < 1e-9) ey = u[1] > 0 ? Math.ceil((ey) / grille) * grille : Math.floor(ey / grille) * grille
    else if (Math.abs(u[1]) < 1e-9) ex = u[0] > 0 ? Math.ceil(ex / grille) * grille : Math.floor(ex / grille) * grille
    else { ex = u[0] > 0 ? Math.ceil(ex / grille) * grille : Math.floor(ex / grille) * grille; ey = d.ay + Math.sign(u[1]) * Math.abs(ex - d.ax) }   // diagonale : x sur la grille, leader gardé à 45°
  }
  const sx = Math.abs(u[0]) < 1e-9 ? 0 : Math.sign(u[0]), sy = Math.abs(u[1]) < 1e-9 ? 0 : Math.sign(u[1])
  const cx = ex + sx * d.w / 2, cy = ey + sy * d.h / 2
  return { x: cx - d.w / 2, y: cy - d.h / 2, lx: ex, ly: ey }
}

/**
 * Place les cartes. `obstacles` : polygones convexes écran (silhouettes du dessin). `fixes` : rectangles déjà occupés (cartes posées à la main…).
 * Retourne, pour chaque demande (même ordre), la position retenue.
 */
export function placerEtiquettes(dem: Demande[], obstacles: Pt[][], o: OptsPlacement = {}, fixes: Rect[] = []): Placee[] {
  const dist = o.dist ?? 22, pas = o.pas ?? 12, K = o.anneaux ?? 24, grille = o.grille ?? 6, marge = o.marge ?? 3
  const res: (Placee | null)[] = dem.map(() => null)
  const cartes: Rect[] = [...fixes]
  const leaders: [Pt, Pt][] = []
  const hull = obstacles

  const evalue = (d: Demande, dir: number, k: number, dur: boolean) => {
    const dd = dist + k * pas
    const c = candidate(d, dir, dd, grille)
    const R = rect(c.x, c.y, d.w, d.h)
    const a: Pt = [d.ax, d.ay], e: Pt = [c.lx, c.ly]
    for (const ob of hull) if (polyRect(ob, R, marge)) return null
    for (const q of cartes) if (rectsSeChevauchent(R, q, marge)) return null
    // le leader ne traverse pas une carte posée
    let traverse = 0
    for (const q of cartes) if (segRect(a, e, { x0: q.x0 - 1, y0: q.y0 - 1, x1: q.x1 + 1, y1: q.y1 + 1 })) { if (dur) return null; traverse++ }
    // ni le leader des autres, ni les cartes des autres ne coupent ce leader (les leaders déjà posés ne traversent pas la nouvelle carte)
    let croise = 0
    for (const [p, q] of leaders) { if (segSeg(a, e, p, q)) croise++; if (segRect(p, q, { x0: R.x0 - 1, y0: R.y0 - 1, x1: R.x1 + 1, y1: R.y1 + 1 })) { if (dur) return null; traverse++ } }
    if (dur && croise) return null
    const L = Math.hypot(e[0] - a[0], e[1] - a[1])
    const dedans = longueurDans(a, e, hull)
    const pref = d.pref != null ? (dir === d.pref ? 0 : 6) : PREF_DIR.indexOf(dir) * 1.5
    const cout = L * 1 + 3 * dedans + 60 * (croise + traverse) + pref + k * 2
    return { cout, c, k, R }
  }

  // les plus contraintes d'abord : peu de candidats libres à anneau nul
  const nlibres = dem.map((d) => { let n = 0; for (let dir = 0; dir < 8; dir++) if ((d.dirs ?? [0, 1, 2, 3, 4, 5, 6, 7]).includes(dir) && evalue(d, dir, 0, true)) n++; return n })
  const ordre = dem.map((_, i) => i).sort((a, b) => nlibres[a] - nlibres[b] || a - b)
  for (const i of ordre) {
    const d = dem[i]
    const dirs = d.dirs ?? [0, 1, 2, 3, 4, 5, 6, 7]
    let best: ReturnType<typeof evalue> = null, bdir = 0
    for (const dur of [true, false]) {
      for (let k = 0; k <= K; k++) {
        for (const dir of dirs) {
          const e = evalue(d, dir, k, dur)
          if (e && (!best || e.cout < best.cout)) { best = e; bdir = dir }
        }
      }
      if (best) break
    }
    let conflit = false
    if (!best) {
      // dernier recours : position à l'anneau 0, direction préférée (chevauchement signalé)
      const c = candidate(d, d.pref ?? 6, dist, grille)
      best = { cout: 0, c, k: 0, R: rect(c.x, c.y, d.w, d.h) }; bdir = d.pref ?? 6; conflit = true
    }
    cartes.push(best.R); leaders.push([[d.ax, d.ay], [best.c.lx, best.c.ly]])
    res[i] = { x: best.c.x, y: best.c.y, w: d.w, h: d.h, ax: d.ax, ay: d.ay, lx: best.c.lx, ly: best.c.ly, dir: bdir, anneau: best.k, conflit }
  }
  return res as Placee[]
}

/** diagnostic : paires de cartes qui se chevauchent + cartes qui touchent un obstacle (liste vide = placement propre) */
export function verifierPlacement(p: Placee[], obstacles: Pt[][], marge = 0): string[] {
  const out: string[] = []
  const R = p.map((q) => rect(q.x, q.y, q.w, q.h))
  for (let i = 0; i < R.length; i++) {
    for (let j = i + 1; j < R.length; j++) if (rectsSeChevauchent(R[i], R[j], marge)) out.push(`cartes ${i}/${j} se chevauchent`)
    obstacles.forEach((ob, k) => { if (polyRect(ob, R[i], marge)) out.push(`carte ${i} touche l'obstacle ${k}`) })
  }
  return out
}

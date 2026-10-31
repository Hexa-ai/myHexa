/* eslint-disable */
// @ts-nocheck — catalogue de dessin (code massif copié de iso_lib, qui compile sans strictNullChecks) ; voir iso/README.md
// CTA en vue ÉCORCHÉE : caisson continu dont on a retiré la face avant (+y, côté spectateur) et le dessus.
// Il reste le plancher, la paroi du fond et les tranches de coupe (épaisseur de panneau = aplat plus foncé + trait fin) ;
// les cloisons entre sections sont des cadres fins. On voit DEDANS les composants à leur vraie place.
// Un module = 1 ou 2 étages superposés dans la même enveloppe (double flux : étage bas = soufflage, sens +x ; étage haut = reprise, sens −x).
// Ports : gaine à chaque extrémité de chaque étage (in/out, in2/out2), eau (ch_a/ch_r batterie chaude, fr_a/fr_r froide) par le plancher sous une batterie, condensat, vapeur.
import { enregistrer } from './registre'
import { Builder, c2, r2, l2 } from './iso'
import { pts, V3, BBox } from './geom'
import type { Params, Fluide } from './types'

export const CE_D = 78       // profondeur intérieure + parois
export const CE_H = 50       // hauteur utile d'un étage
export const CE_T = 3        // épaisseur plancher
export const CE_P = 2.6      // épaisseur paroi du fond
export const CE_ZEAU = -9    // cote des piquages eau sous le plancher
export const CE_PIED = 34    // hauteur des pieds du châssis (le plancher est à z = CE_PIED au-dessus du sol)

export type Kind = 'registre' | 'filtre_plan' | 'filtre_poches' | 'batterie_chaude' | 'batterie_froide' | 'humidificateur' | 'roue' | 'ventilateur' | 'piege_son' | 'vide' | 'echangeur_croise' | 'echangeur_contre' | 'melange_x'
/** longueur occupée par chaque élément (unités monde) */
export const LONG: Record<Kind, number> = { registre: 30, filtre_plan: 22, filtre_poches: 62, batterie_chaude: 36, batterie_froide: 54, humidificateur: 30, roue: 40, ventilateur: 92, piege_son: 80, vide: 30, echangeur_croise: 124, echangeur_contre: 170, melange_x: 120 }
export const NOMS: Record<Kind, string> = { registre: 'Registre', filtre_plan: 'Filtre plan', filtre_poches: 'Filtre à poches', batterie_chaude: 'Batterie chaude', batterie_froide: 'Batterie froide + bac', humidificateur: 'Humidificateur', roue: 'Roue de récupération', ventilateur: 'Plug-fan', piege_son: 'Piège à son', vide: 'Section vide', echangeur_croise: 'Échangeur à plaques, flux croisés', echangeur_contre: 'Échangeur à plaques, contre-courant', melange_x: 'Caisson de mélange / recyclage en X' }

interface Ctx { b: Builder; x0: number; x1: number; zb: number; H: number; flux: 1 | -1; haut: boolean; D: number; fl: Fluide }
const cz = (c: Ctx) => c.zb + c.H / 2

/** prisme extrudé selon y d'un profil convexe (x,z) : n'affiche que les faces visibles (+x, +z) puis la face avant */
function prismeY(b: Builder, prof: [number, number][], y0: number, y1: number, cls = 'l', m = 'mm', on?: ReturnType<Builder['box']>) {
  const xs = prof.map((p) => p[0]), zs = prof.map((p) => p[1])
  return b.raw([Math.min(...xs), y0, Math.min(...zs)], [Math.max(...xs), y1, Math.max(...zs)], (_bb, w) => {
    // orientation anti-horaire dans (x,z)
    let a = 0; prof.forEach((p, i) => { const q = prof[(i + 1) % prof.length]; a += p[0] * q[1] - q[0] * p[1] })
    const P = a < 0 ? prof.slice().reverse() : prof
    let s = ''
    P.forEach((p, i) => {
      const q = P[(i + 1) % P.length]
      const nx = q[1] - p[1], nz = -(q[0] - p[0])
      if (nx <= 0.0001 && nz <= 0.0001) return
      const k = nz > Math.abs(nx) * 0.5 ? 't' : 'r'
      s += `<polygon class="${k}" points="${pts([w([p[0], y0, p[1]]), w([q[0], y0, q[1]]), w([q[0], y1, q[1]]), w([p[0], y1, p[1]])])}"/>`
    })
    s += `<polygon class="${cls}" points="${pts(P.map((p) => w([p[0], y1, p[1]])))}"/>`
    return s
  }, m, on)
}

/** flux d'air discret : fins tirets animés (visibles en marche), dans les vides entre éléments */
function fluxVide(b: Builder, c: Ctx, a: number, e: number) {
  if (e - a < 9) return
  const [lo, hi] = c.flux > 0 ? [a, e] : [e, a]
  const y = c.D * 0.52
  const lines = [0.3, 0.68].map((k) => {
    const z = c.zb + c.H * k
    return `<path class="flow air" style="stroke:var(--cf);stroke-width:1.2;stroke-opacity:.85;stroke-dasharray:3 9" d="M${pts([b.w([lo, y, z]), b.w([hi, y, z])]).replace(' ', 'L')}"/>`
  }).join('')
  b.raw([Math.min(a, e), y, c.zb + 1], [Math.max(a, e), y + 0.1, c.zb + c.H], () => `<g class="cflow fl-${c.fl}">${lines}</g>`, 'mb')
}


/** Modules centraux double hauteur : occupent les 2 étages (zb = plancher de l'étage bas). Ctx.fl ignoré : 4 couleurs d'air propres. */
const hauteurTotale = (H: number) => 2 * H + CE_T
const fluxPoly = (b: Builder, pts3: V3[], fl: Fluide, y: number, lw = 1.3) =>
  `<g class="cflow fl-${fl}"><path class="flow air" style="stroke:var(--cf);stroke-width:${lw};stroke-opacity:.9;stroke-dasharray:3 7" d="M${pts(pts3.map((p) => b.w([p[0], y, p[2]]))).replace(/ /g, 'L')}"/></g>`
/** flèche de sens (pointe) sur un point (x,z) dans la direction (ux,uz), plan y */
const fleche = (b: Builder, x: number, z: number, ux: number, uz: number, y: number, fl: Fluide, k = 4.2) => {
  const n = Math.hypot(ux, uz), dx = ux / n, dz = uz / n, px = -dz, pz = dx
  return `<g class="fl-${fl}"><polygon style="fill:var(--cf);stroke:none;opacity:.95" points="${pts([b.w([x + dx * k, y, z + dz * k]), b.w([x - dx * k * 0.6 + px * k * 0.7, y, z - dz * k * 0.6 + pz * k * 0.7]), b.w([x - dx * k * 0.6 - px * k * 0.7, y, z - dz * k * 0.6 - pz * k * 0.7])])}"/></g>`
}


/** plaques en coupe sur la face avant du losange : traits parallèles aux deux flancs (réseau de canaux), recoupés au contour */
function plaquesCroisees(b: Builder, xc: number, zc: number, a: number, y: number, kind: string): string {
  let s = ''
  const seg = (x0: number, z0: number, x1: number, z1: number) => { const [p0, p1] = [b.w([x0, y, z0]), b.w([x1, y, z1])]; s += `<line class="ed2" x1="${p0[0].toFixed(1)}" y1="${p0[1].toFixed(1)}" x2="${p1[0].toFixed(1)}" y2="${p1[1].toFixed(1)}"/>` }
  if (kind === 'croise') {
    const n = 9
    for (let i = 1; i < n; i++) { const t = (i / n) * a
      seg(xc - a + t, zc + t, xc + t, zc - a + t)          // ↘ air neuf
      seg(xc - a + t, zc - t, xc + t, zc + a - t) }          // ↗ air repris
  } else {
    const n = 8
    for (let i = 1; i < n; i++) { const z = zc - a + (i / n) * 2 * a; seg(xc - 60, z, xc + 60, z) }
  }
  return s
}


/** réseau de canaux du losange (flux croisés) : bandes ↘ (air neuf) et ↗ (air repris) translucides ; leur recouvrement dessine le quadrillage en X */
function bandesCroisees(b: Builder, xc: number, zc: number, a: number, y: number): string {
  const n = 5, pas = a / n, w = pas * 0.46
  const quad = (t: number, up: boolean) => {
    const d = up ? -1 : 1
    const P = (u: number): [V3, V3] => up
      ? [[xc - a + u, y, zc - u], [xc + u, y, zc + a - u]]
      : [[xc - a + u, y, zc + u], [xc + u, y, zc - a + u]]
    void d
    const [p0, p1] = P(t), [q0, q1] = P(t + w)
    return pts([b.w(p0), b.w(p1), b.w(q1), b.w(q0)])
  }
  let s = ''
  for (let i = 0; i < n; i++) {
    const t = i * pas + (pas - w) / 2
    s += `<g class="fl-air_neuf"><polygon style="fill:var(--cf);fill-opacity:.55;stroke:var(--cf);stroke-opacity:.9;stroke-width:.6" points="${quad(t, false)}"/></g>`
    s += `<g class="fl-air_repris"><polygon style="fill:var(--cf);fill-opacity:.55;stroke:var(--cf);stroke-opacity:.9;stroke-width:.6" points="${quad(t, true)}"/></g>`
  }
  return s
}
/** chevrons de sens sur les 4 côtés du losange : entrée / sortie des deux airs */
function chevronsLosange(b: Builder, xc: number, zc: number, a: number, y: number): string {
  const h = a / 2, o = 9, k = 5.2
  const at = (px: number, pz: number, nx: number, nz: number, ux: number, uz: number, fl: Fluide) => fleche(b, px + nx * o, pz + nz * o, ux, uz, y, fl, k)
  return at(xc - h, zc + h, -1, 1, 1, -1, 'air_neuf') + at(xc + h, zc - h, 1, -1, 1, -1, 'air_souffle')
    + at(xc - h, zc - h, -1, -1, 1, 1, 'air_repris') + at(xc + h, zc + h, 1, 1, 1, 1, 'air_rejete')
}

function echangeur(c: Ctx, x: number, kind: 'croise' | 'contre') {
  const { b, zb, H, D } = c
  const len = LONG[kind === 'croise' ? 'echangeur_croise' : 'echangeur_contre'], xc = x + len / 2
  const a = hauteurTotale(H) / 2, zc = zb + a - 0.0
  const A = kind === 'croise' ? a : 74, q = kind === 'croise' ? a : 30
  const prof: [number, number][] = kind === 'croise'
    ? [[xc - A, zc], [xc, zc - a], [xc + A, zc], [xc, zc + a]]
    : [[xc - A, zc], [xc - A + q, zc - a], [xc + A - q, zc - a], [xc + A, zc], [xc + A - q, zc + a], [xc - A + q, zc + a]]
  const y0 = CE_P + 1.5, y1 = D - 1.5
  const bloc = prismeY(b, prof, y0, y1, 'l', 'mb')
  // plaques en coupe : sur la face haute-droite (sortie de l'air repris), couches alternées = canaux ouverts / plaques fermées
  const P3 = kind === 'croise' ? prof[3] : prof[4], P4 = kind === 'croise' ? prof[2] : prof[3]
  const n = 13, dy = (y1 - y0) / n
  let st = ''
  for (let j = 0; j < n; j++) {
    const ya = y0 + j * dy, yb = ya + dy
    const quad = pts([b.w([P3[0], ya, P3[1]]), b.w([P4[0], ya, P4[1]]), b.w([P4[0], yb, P4[1]]), b.w([P3[0], yb, P3[1]])])
    st += j % 2 ? `<g class="fl-air_rejete"><polygon style="fill:var(--cf);fill-opacity:.5;stroke:none" points="${quad}"/></g>` : `<polygon class="ed2" style="fill:none" points="${quad}"/>`
  }
  b.on(bloc, st)
  // face avant : plaque coupée, canaux des deux airs (réseau en losange), tirets discrets + flèches
  const yf = D - 0.5
  let lat = ''
  const nl = 6
  if (kind === 'croise') {
    void nl
    lat += bandesCroisees(b, xc, zc, a, yf) + chevronsLosange(b, xc, zc, a, yf)
  } else {
    // flux en Z : entrée horizontale, traversée diagonale, sortie horizontale
    for (let i = 1; i < 5; i++) {
      const t = i / 5, zi = zc + (t - 0.0) * a * 0.9 - 0
      const fx = (zz: number) => xc - A + (A - q) * Math.abs((zz - zc) / a) * 0 + (A) * (1 - Math.abs(zz - zc) / a) * 0
      void fx
      const zN = zc + t * a * 0.85, zN2 = zc - t * a * 0.85
      lat += fluxPoly(b, [[xc - A + (A - q) * 0.2 + 6, 0, zN], [xc - 20, 0, zN], [xc + 20, 0, zN2], [xc + A - (A - q) * 0.2 - 6, 0, zN2]] as V3[], 'air_neuf', yf)
      lat += fluxPoly(b, [[xc - A + (A - q) * 0.2 + 6, 0, zN2], [xc - 20, 0, zN2], [xc + 20, 0, zN], [xc + A - (A - q) * 0.2 - 6, 0, zN]] as V3[], 'air_repris', yf)
      void zi
    }
  }
  // flèches d'entrée/sortie dans les 4 pavés d'air (coins) : neuf entre en haut à gauche, sort en bas à droite ; repris entre en bas à gauche, sort en haut à droite
  const dxm = (len - 2 * A) / 2
  const ax = 14, azh = a * 0.55
  if (kind !== 'croise') {
    lat += fleche(b, x + dxm + ax, zc + azh, 1, 0, yf, 'air_neuf') + fleche(b, x + len - dxm - ax, zc - azh, 1, 0, yf, 'air_souffle')
    lat += fleche(b, x + dxm + ax, zc - azh, 1, 0, yf, 'air_repris') + fleche(b, x + len - dxm - ax, zc + azh, 1, 0, yf, 'air_rejete')
  }
  void dxm; void ax; void azh
  // plaques vues en coupe sur la face avant : fines lignes parallèles à l'axe de chaque flux (réseau de canaux)
  b.on(bloc, `<polygon class="l" points="${pts(prof.map((q) => b.w([q[0], y1, q[1]])))}"/>`)
  b.on(bloc, `<g style="opacity:.9">${kind === 'croise' ? '' : plaquesCroisees(b, xc, zc, a, yf, kind)}</g>` + lat)
  // bac à condensats sous le losange (reçoit la condensation des canaux d'air repris)
  b.box(xc - 26, CE_P, zb, 52, D - CE_P - 1.5, 2.2, 'mm')
  const tr = b.box(xc - 26, D - 3.5, zb + 2.2, 52, 1.2, 1.2, 'mm')
  b.pl('xy', zb + 2.2, `<g class="fl-condensat">${r2(xc - 25, CE_P + 1, 50, D - CE_P - 5, 'fl', 0)}</g>`, tr)
  b.cylY(xc + 18, D - 3, zb + 1.1, 1.3, 6, 'mm')
  b.port('cond', [xc + 18, D + 3, zb + 1.1], [0, 1, 0], { type: 'tube', fluide: 'condensat', dn: 1.6 })
  // cloisons étanches : triangle d'entrée / sortie fermé en haut et en bas (plancher intermédiaire) — le plancher s'arrête aux sommets du bloc
}

function melangeX(c: Ctx, x: number) {
  const { b, zb, H, D } = c, len = LONG.melange_x, xc = x + len / 2, zc = zb + H + CE_T / 2
  const pos = b.val.position ?? 50, th = ((90 - pos * 0.9) * Math.PI) / 180
  const yf = D - 0.5
  // registre d'air neuf : lames verticales (axe z) à l'entrée de l'étage bas ; registre de recyclage : lames horizontales dans l'ouverture du plancher
  const lame = (cx: number, cz: number, h: number, vertical: boolean, key: string) => {
    const ux = vertical ? Math.sin(th) * 0 + Math.cos(th) : Math.cos(th), uz = vertical ? Math.sin(th) : Math.sin(th)
    void key
    const t = 1
    prismeY(b, [[cx - h * ux - t * uz, cz - h * uz + t * ux], [cx + h * ux - t * uz, cz + h * uz + t * ux], [cx + h * ux + t * uz, cz + h * uz - t * ux], [cx - h * ux + t * uz, cz - h * uz - t * ux]], CE_P + 1.5, D - 2.5, 'l', 'mm')
  }
  // registre neuf : n lames empilées à x = x+10, cadre
  const xn = x + 10, nL = 5, pitch = (H - 6) / nL
  b.box(xn - 2, CE_P, zb, 4, D - CE_P - 2, 2.5, 'mm'); b.box(xn - 2, CE_P, zb + H - 2.5, 4, D - CE_P - 2, 2.5, 'mm')
  for (let i = 0; i < nL; i++) lame(xn, zb + 3 + pitch * (i + 0.5), pitch * 0.5, false, 'n')
  // ouverture du plancher (x ∈ [xc-18, xc+18]) : registre de recyclage, lames dans le plan horizontal → angle réel (vu par la tranche)
  const nR = 4, dxr = 36 / nR
  for (let i = 0; i < nR; i++) {
    const cxl = xc - 18 + dxr * (i + 0.5), cz = zc
    const ux = Math.sin(th), uz = Math.cos(th) * 0 + Math.cos(th)
    void uz
    prismeY(b, [[cxl - 0.5 * dxr * Math.cos(th) - 0.9 * Math.sin(th), cz - 0.5 * dxr * Math.sin(th) + 0.9 * Math.cos(th)], [cxl + 0.5 * dxr * Math.cos(th) - 0.9 * Math.sin(th), cz + 0.5 * dxr * Math.sin(th) + 0.9 * Math.cos(th)], [cxl + 0.5 * dxr * Math.cos(th) + 0.9 * Math.sin(th), cz + 0.5 * dxr * Math.sin(th) - 0.9 * Math.cos(th)], [cxl - 0.5 * dxr * Math.cos(th) + 0.9 * Math.sin(th), cz - 0.5 * dxr * Math.sin(th) - 0.9 * Math.cos(th)]], CE_P + 1.5, D - 2.5, 'l', 'mm')
    void ux
  }
  // cloison diagonale (étage haut) : de l'ouverture du plancher vers le haut et la droite — oriente la reprise vers l'ouverture (recyclage) ou le rejet
  prismeY(b, [[xc + 18, zc + 2], [xc + 20.4, zc + 2], [xc + 20.4 + 34, zb + 2 * H + CE_T - 8], [xc + 18 + 34, zb + 2 * H + CE_T - 8]], CE_P + 1, D - 3, 'l', 'mc gl')
  // servomoteurs
  const sv1 = b.box(xn + 4, CE_P, zb + H - 20, 14, 8, 12, 'mb'); b.led([xn + 7, CE_P + 8, zb + H - 12], sv1, 1.2)
  const sv2 = b.box(xc + 22, CE_P, zc + 3, 12, 8, 10, 'mb'); b.led([xc + 25, CE_P + 8, zc + 10], sv2, 1.2)
  // chemin de l'air : neuf (bas, vers la droite), repris (haut, vers la gauche), recyclé (descend par l'ouverture), mélange (bas, droite)
  let lat = ''
  lat += fluxPoly(b, [[x + 2, 0, zb + H * 0.5], [xc - 22, 0, zb + H * 0.5]] as V3[], 'air_neuf', yf)
  lat += fluxPoly(b, [[x + len - 4, 0, zc + H * 0.55], [xc + 14, 0, zc + H * 0.55], [xc + 4, 0, zc + H * 0.3], [xc, 0, zc + 4]] as V3[], 'air_repris', yf)
  lat += fluxPoly(b, [[xc, 0, zc - 2], [xc, 0, zb + H * 0.6], [xc + 14, 0, zb + H * 0.5], [x + len - 3, 0, zb + H * 0.5]] as V3[], 'air_souffle', yf)
  lat += fluxPoly(b, [[xc - 8, 0, zc + H * 0.55], [x + 3, 0, zc + H * 0.55]] as V3[], 'air_rejete', yf)
  lat += fleche(b, xn + 18, zb + H * 0.5, 1, 0, yf, 'air_neuf') + fleche(b, xc - 30, zc + H * 0.55, -1, 0, yf, 'air_repris')
  b.raw([x, yf, zb], [x + len, yf + 0.1, zb + 2 * H], () => lat, 'mb')
}

type Dessin = (c: Ctx, x: number) => void   // x = début de l'élément (côté amont inclus), occupe LONG[kind]

const DESS: Record<Kind, Dessin> = {
  vide: () => { },
  echangeur_croise(c, x) { echangeur(c, x, 'croise') },
  echangeur_contre(c, x) { echangeur(c, x, 'contre') },
  melange_x(c, x) { melangeX(c, x) },
  // ── registre à lames, angle réel (position 0 fermé … 100 ouvert) ; servomoteur sur la paroi du fond
  registre(c, x) {
    const { b, zb, H, D } = c, cx = x + LONG.registre / 2
    const n = 5, pitch = (H - 6) / n, th = ((90 - b.pos * 0.9) * Math.PI) / 180
    b.box(cx - 2, CE_P, zb, 4, D - CE_P - 2, 3, 'mm'); b.box(cx - 2, CE_P, zb + H - 3, 4, D - CE_P - 2, 3, 'mm')
    for (let i = 0; i < n; i++) {
      const z = zb + 3 + pitch * (i + 0.5), h = pitch * 0.55, t = 1.1
      const ux = Math.cos(th), uz = Math.sin(th)
      prismeY(b, [[cx - h * ux - t * uz, z - h * uz + t * ux], [cx + h * ux - t * uz, z + h * uz + t * ux], [cx + h * ux + t * uz, z + h * uz - t * ux], [cx - h * ux + t * uz, z - h * uz - t * ux]], CE_P + 1.5, D - 3, 'l', 'mm')
    }
    // biellette + servomoteur sur la paroi du fond
    b.box(cx + 2.2, CE_P, zb + 3, 1.4, 1.4, H - 6, 'md')
    const sv = b.box(cx - 9, CE_P, zb + H - 20, 14, 8, 12, 'mb')
    b.led([cx - 6, CE_P + 8, zb + H - 12], sv, 1.2)
    b.line([cx + 3, CE_P + 1, zb + H - 14], [cx + 3, CE_P + 1, zb + H - 6], 'ed', sv)
  },
  // ── filtre plan : cadre + média plissé (zigzag vu de face), pressostat
  filtre_plan(c, x) {
    const { b, zb, H, D } = c, w = LONG.filtre_plan - 6, cx = x + 3
    const col = b.val.colmatage ?? 15
    const p = b.box(cx, CE_P + 1, zb + 2, w, D - CE_P - 3, H - 4, col > 80 ? 'mw' : 'mb')
    const x0 = cx, x1 = cx + w
    let zg = `M${x0 + 1} ${zb + 4}`
    const k = Math.floor((H - 8) / 2.6)
    for (let j = 0; j < k; j++) zg += `L${x1 - 1} ${zb + 4 + j * 2.6 + 1.3}L${x0 + 1} ${zb + 4 + (j + 1) * 2.6}`
    b.pl('xz', D - 2, `<path class="ed2" d="${zg}"/>` + r2(x0, zb + 2, w, H - 4, 'ed'), p)
    b.pl('xy', zb + H - 2, l2(x0 + w / 2, CE_P + 1, x0 + w / 2, D - 2, 'ed2'), p)
  },
  // ── filtre à poches : poches en V (ouverture côté amont), cadre de fixation
  filtre_poches(c, x) {
    const { b, zb, H, D, flux } = c, w = LONG.filtre_poches - 6, a = flux > 0 ? x + 3 : x + LONG.filtre_poches - 3
    const n = 3, pitch = (H - 6) / n, dep = w - 6, sg = flux
    const col = b.val.colmatage ?? 15
    b.box(Math.min(a, a + sg * 4), CE_P + 1, zb + 1, 4, D - CE_P - 3, 3, 'mm'); b.box(Math.min(a, a + sg * 4), CE_P + 1, zb + H - 4, 4, D - CE_P - 3, 3, 'mm')
    const nb = 4, wy = (D - CE_P - 6) / nb
    for (let q = 0; q < nb; q++) {
      const ya = CE_P + 3 + q * wy + 1.2, yb = ya + wy - 2.4
      for (let i = 0; i < n; i++) {
        const z = zb + 3 + pitch * (i + 0.5)
        for (const s of [-1, 1]) {
          const p0: [number, number] = [a, z + s * pitch * 0.47], p1: [number, number] = [a + sg * dep, z + s * 0.5], t = 0.9
          const prof: [number, number][] = [[p0[0], p0[1] - t], [p1[0], p1[1] - t], [p1[0], p1[1] + t], [p0[0], p0[1] + t]]
          prismeY(b, prof, ya, yb, col > 80 ? 'fo' : 'fw', col > 80 ? 'mw' : 'mb')
        }
      }
    }
  },
  // ── batterie à ailettes : bloc d'ailettes (lignes fines au dessus), tubes vus par le bout, 2 collecteurs, piquages eau par le plancher
  batterie_chaude(c, x) { batterie(c, x, 'eau_chaude_aller', false) },
  batterie_froide(c, x) { batterie(c, x, 'eau_glacee', true) },
  // ── humidificateur : rampe de diffusion (lance à vapeur)
  humidificateur(c, x) {
    const { b, zb, H, D } = c, cx = x + LONG.humidificateur / 2, z = zb + 9
    b.cylY(cx, CE_P - 6, z, 2.2, D - CE_P + 4, 'mm')
    for (let i = 0; i < 4; i++) {
      const y = CE_P + 10 + i * ((D - CE_P - 20) / 3)
      b.cylZ(cx, y, z, 0.9, 14, 'mm'); b.cylZ(cx, y, z + 14, 1.6, 1.2, 'mk')
      if (b.marche) b.raw([cx - 2, y - 1, z + 15], [cx + 2, y + 1, z + 40], (_bb, w) => `<g class="cflow fl-vapeur"><path class="flow air" style="stroke:var(--cf);stroke-width:1.1;stroke-dasharray:2 6" d="M${pts([w([cx, y, z + 16]), w([cx, y, z + 38])]).replace(' ', 'L')}"/></g>`, 'mb')
    }
    b.flange([cx, CE_P - 6, z], 'y', 3.4, 1.6, 4, 'mm', -1)
    b.port('vap', [cx, CE_P - 8, z], [0, -1, 0], { type: 'tube', fluide: 'vapeur', dn: 2.2 })
    b.box(cx - 8, CE_P, zb + 1, 16, D - CE_P - 3, 2.4, 'mm')   // bac de rétention
  },
  // ── roue de récupération : disque à cheval sur les deux étages (axe x), moteur + courroie
  roue(c, x) {
    const { b, zb, H, D } = c
    const R = Math.min((D - CE_P) / 2 - 3, H * 0.84), cx = x + 8, cy = CE_P + (D - CE_P) / 2, cz = c.haut ? zb : zb + H + (b.c.etat ? 0 : 0)
    void cz
    const zc = roueCentreZ(b, zb, H)
    // cloison de la roue : panneau fin qui traverse le plancher intermédiaire (2 étages), la roue en occupe le centre
    const Dk = D, ztop = (b.p.etages === 2 || b.p.haut != null ? 2 : 1) * (H + CE_T)
    b.box(cx - 3.2, CE_P, 0, 1.2, Dk - CE_P, ztop, 'mc gl')
    const body = b.cyl([cx, cy, zc], [cx + 12, cy, zc], R + 2.4, 'mm')
    b.rotor('yz', cx + 12, cy, zc, wheelInner(R), body, 3.2)
    b.rings(body, [cx, cy, zc], [cx + 12, cy, zc], R + 2.4, [0.12, 0.88], 'ed2')
    // caisson de la roue (jante) : couronne
    const mo = b.box(cx + 4, CE_P + 1, zb + 1, 9, 9, 8, 'mb')      // moteur d'entraînement + courroie
    b.led([cx + 8, CE_P + 10, zb + 7], mo, 1.2)
    b.line([cx + 8.5, CE_P + 5, zb + 9], [cx + 8.5, CE_P + 5, zc - R * 0.2], 'ed2', mo)
  },
  // ── plug-fan : roue + moteur sur socle antivibratile (4 plots à ressort)
  ventilateur(c, x) {
    const { b, zb, H, D, flux } = c
    const cx = x + LONG.ventilateur / 2, cy = CE_P + (D - CE_P) / 2, r = 20, s = flux
    const zs = zb + 7.5 + r * 0 + 0
    const zc = zs + 3 + r * 0 + 0.001 + 0
    void zc
    const zcen = zb + 7 + 3 + r * 0.95
    // socle + plots antivibratiles
    b.box(cx - 36, cy - 17, zb + 4.5, 72, 34, 2.4, 'mm')
    for (const px of [cx - 32, cx + 32]) for (const py of [cy - 13, cy + 13]) { const p = b.cylZ(px, py, zb, 2.1, 4.5, 'md'); b.rings(p, [px, py, zb], [px, py, zb + 4.5], 2.1, [0.3, 0.55, 0.8]) }
    // roue (côté amont) + moteur (côté aval)
    const xa = s > 0 ? cx - 28 : cx + 28
    const roue = b.cyl([xa, cy, zcen], [xa + s * 16, cy, zcen], r, 'mm')
    b.rings(roue, [xa, cy, zcen], [xa + s * 16, cy, zcen], r, [0.18, 0.5, 0.82], 'ed2')
    const m0 = xa + s * 16, mot = b.cyl([m0, cy, zcen], [m0 + s * 28, cy, zcen], 12.5, 'mb')
    b.rings(mot, [m0, cy, zcen], [m0 + s * 28, cy, zcen], 12.5, [0.12, 0.26, 0.4, 0.54, 0.68, 0.82])
    const bt = b.box(m0 + s * 10 - 5, cy - 6, zcen + 11, 10, 12, 6, 'mk'); b.led([m0 + s * 10, cy + 6, zcen + 14], bt, 1.2)
    // moyeu tournant visible sur la face tournée vers l'ouverture : spirale de pales
    const xf = s > 0 ? xa + 16 : xa - 16
    b.rotor('yz', s > 0 ? xf : xa, cy, zcen, pales(r * 0.86, 9), roue, 1.1)
  },
  // ── piège à son : baffles parallèles à l'écoulement, face perforée
  piege_son(c, x) {
    const { b, zb, H, D } = c, w = LONG.piege_son - 8, n = 4, ep = 7
    const span = D - CE_P - 4 - ep
    for (let i = 0; i < n; i++) {
      const y = CE_P + 2 + (span * i) / (n - 1)
      const p = b.box(x + 4, y, zb + 1, w, ep, H - 2, 'mc')
      let h = ''
      for (let j = 1; j < 6; j++) h += l2(x + 4 + 3, zb + 1 + ((H - 2) * j) / 6, x + 4 + w - 3, zb + 1 + ((H - 2) * j) / 6, 'ed2')
      for (let j = 1; j < 14; j++) h += l2(x + 4 + (w * j) / 14, zb + 3, x + 4 + (w * j) / 14, zb + H - 3, 'ed2')
      b.pl('xz', y + ep, `<g style="stroke-opacity:.45">${h}</g>`, p)
    }
  },
}

function wheelInner(R: number): string {
  let s = ''
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; s += l2(Math.cos(a) * 4, Math.sin(a) * 4, Math.cos(a) * R * 0.96, Math.sin(a) * R * 0.96, 'ed2') }
  return c2(0, 0, R, 'fw') + s + c2(0, 0, R * 0.55, 'ed2') + c2(0, 0, R * 0.8, 'ed2') + c2(0, 0, R, 'ed') + c2(0, 0, 3.4, 'fd')
}
function pales(R: number, n: number): string {
  let s = ''
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; s += `<path class="ed" d="M${(Math.cos(a) * R * 0.25).toFixed(2)} ${(Math.sin(a) * R * 0.25).toFixed(2)}Q${(Math.cos(a + 0.5) * R * 0.7).toFixed(2)} ${(Math.sin(a + 0.5) * R * 0.7).toFixed(2)} ${(Math.cos(a + 0.2) * R).toFixed(2)} ${(Math.sin(a + 0.2) * R).toFixed(2)}"/>` }
  return s + c2(0, 0, R * 0.2, 'fd')
}
/** centre z de la roue de récupération = plancher intermédiaire (étage bas) */
function roueCentreZ(b: Builder, zb: number, H: number): number { return (b.c.p as Params).etages === 2 ? zb + H + CE_T / 2 : zb + H * 0.5 }

function batterie(c: Ctx, x: number, fluide: Fluide, froide: boolean) {
  const { b, zb, H, D } = c
  const ep = 16, bx = x + (froide ? 6 : 8), z0 = zb + (froide ? 3.2 : 2), hh = H - (froide ? 6.4 : 4)
  const cx = c.flux > 0 ? bx : bx
  if (froide) {      // bac à condensats sous la batterie : cuvette + eau + vidange
    b.box(bx - 4, CE_P, zb, ep + 24, D - CE_P - 1.5, 3.2, 'mm')
    const tr = b.box(bx - 4, CE_P, zb + 3.2, ep + 24, 1.2, 1.2, 'mm')
    b.pl('xy', zb + 3.2, `<g class="fl-condensat">${r2(bx - 3, CE_P + 1.2, ep + 22, D - CE_P - 4, 'fl', 0)}</g>`, tr)
    b.cylY(bx + ep + 8, D - 3, zb + 1.6, 1.4, 6, 'mm')
    b.port('cond', [bx + ep + 8, D + 3, zb + 1.6], [0, 1, 0], { type: 'tube', fluide: 'condensat', dn: 1.6 })
  }
  const bl = b.box(bx, CE_P + 1, z0, ep, D - CE_P - 5.5, hh, 'mm')
  // ailettes (lignes fines vues du dessus) + tubes vus par le bout (quinconce) sur la face avant
  let top = ''
  for (let y = CE_P + 2.5; y < D - 6; y += 1.9) top += l2(bx + 0.5, y, bx + ep - 0.5, y, 'ed2')
  b.pl('xy', z0 + hh, `<g style="stroke-opacity:.55">${top}</g>`, bl)
  let tb = ''
  const nr = 7, pz = (hh - 4) / nr
  for (let i = 0; i < nr; i++) for (let k = 0; k < 2; k++) tb += c2(bx + 3.6 + k * 6.8 + (i % 2) * 3, z0 + 2.5 + pz * (i + 0.5), 1.15, 'ed2')
  b.pl('xz', D - 4.5, tb, bl)
  // collecteurs verticaux (côté raccordement = avant), tuyaux qui traversent le plancher
  const hy = D + 0.8, ztop = z0 + hh - 3
  const pre = froide ? 'fr' : 'ch'
  for (const [k, id] of [[2.4, pre + '_a'], [ep - 2.4, pre + '_r']] as [number, string][]) {
    const col = b.cylZ(bx + k, hy, CE_ZEAU, 2.1, ztop - CE_ZEAU, 'mm')
    b.rings(col, [bx + k, hy, CE_ZEAU], [bx + k, hy, ztop], 2.1, [0.12, 0.88], 'ed2')
    b.cylZ(bx + k, hy, zb, 3.4, 1.2, 'mm')                            // platine de traversée du plancher
    b.ball([bx + k, hy, CE_ZEAU], 2.5, 'mm'); b.cylY(bx + k, hy, CE_ZEAU, 2.1, 12, 'mm')      // coude sous le plancher puis départ vers l'avant
    b.port(id, [bx + k, hy + 12, CE_ZEAU], [0, 1, 0], { type: 'tube', fluide, dn: 3 })
  }
  }

export interface Etage { items: Kind[] }
const parseEtage = (v: any): Kind[] => (Array.isArray(v) ? v : v ? [v] : []) as Kind[]
const longEtage = (ks: Kind[]) => ks.reduce((a, k) => a + LONG[k], 0)

/** position (début) de chaque élément d'un étage : répartis régulièrement sur la longueur L, dans le sens du flux */
function dispo(ks: Kind[], L: number, flux: 1 | -1): { k: Kind; x: number }[] {
  const gap = (L - longEtage(ks)) / (ks.length + 1)
  let pos = flux > 0 ? 0 : L
  return ks.map((k) => { const g = pos + flux * gap, x = flux > 0 ? g : g - LONG[k]; pos = flux > 0 ? x + LONG[k] : x; return { k, x } })
}
/** cloison fine translucide entre deux sections (x), sur toute la profondeur utile de l'étage */
function cloison(b: Builder, x: number, Dk: number, z0: number, z1: number) { b.box(x - 0.5, CE_P, z0, 1, Dk - CE_P, z1 - z0, 'mc gl') }

function dessin(b: Builder, p: Params) {
  const bas = parseEtage(p.bas), haut = parseEtage(p.haut)
  const L: number = p.L ?? Math.max(60, longEtage(bas) + 10, longEtage(haut) + 10)
  const n = p.etages === 2 || haut.length || p.haut != null ? 2 : 1
  const D = CE_D, T = CE_T, ztop = n * (CE_H + T)
  // profondeur de l'étage haut : plus courte que l'étage bas (face avant de l'étage haut en retrait → l'étage bas reste visible de dessus)
  const Dh: number = Math.max(CE_P + 30, Math.min(D, p.Dh ?? D))
  const Dk = (k: number) => (k === 0 ? D : Dh)
  const def = b.etat === 'defaut', alm = b.etat === 'alarme'
  const cut = def ? 'mr' : alm ? 'mw' : 'mm'
  const fluxH: 1 | -1 = p.fluxH === 1 ? 1 : -1
  const flB: Fluide = p.fl_bas ?? 'air_souffle', flH: Fluide = p.fl_haut ?? 'air_repris'
  const lay = [dispo(bas, L, 1), dispo(haut, L, fluxH)]
  // fente du plancher intermédiaire au droit de la roue (le disque traverse les deux étages)
  const CENTRAUX: Kind[] = ['roue', 'echangeur_croise', 'echangeur_contre', 'melange_x']
  const rx = lay[0].find((e) => CENTRAUX.includes(e.k))
  const fente: [number, number] | null = n === 2 && rx
    ? (rx.k === 'roue' ? [rx.x + 6, rx.x + 22] : rx.k === 'melange_x' ? [rx.x + LONG.melange_x / 2 - 18, rx.x + LONG.melange_x / 2 + 18]
      : (() => { const h = (CE_H * 2 + CE_T) / 2, A = rx.k === 'echangeur_croise' ? h : 74, xc = rx.x + LONG[rx.k] / 2; return [xc - A, xc + A] as [number, number] })())
    : null
  // plancher(s) + tranche de coupe (aplat plus foncé, trait fin)
  for (let k = 0; k < n; k++) {
    const z = k * (CE_H + T), Dd = Dk(k)
    const morceaux: [number, number][] = k === 1 && fente ? [[0, fente[0]], [fente[1], L]] : [[0, L]]
    for (const [xa, xb] of morceaux) {
      const fl = b.box(xa, 0, z, xb - xa, Dd, T, 'mc')
      const face = [b.w([xa, Dd, z]), b.w([xb, Dd, z]), b.w([xb, Dd, z + T]), b.w([xa, Dd, z + T])]
      b.on(fl, `<g class="${cut}"><polygon class="in" points="${pts(face)}"/></g>`)
      if (xb === L) {
        const fin = [b.w([L, Dd, z]), b.w([L, 0, z]), b.w([L, 0, z + T]), b.w([L, Dd, z + T])]
        b.on(fl, `<g class="${cut}"><polygon class="in" points="${pts(fin)}"/></g>`)
      }
    }
  }
  // pieds du châssis
  for (const px of [4, L - 11]) for (const py of [4, D - 11]) b.box(px, py, -CE_PIED, 7, 7, CE_PIED, 'mm')
  // paroi du fond + tranche supérieure
  const bw = b.box(0, 0, 0, L, CE_P, ztop, 'mb')
  b.on(bw, `<g class="${cut}"><polygon class="in" points="${pts([b.w([0, 0, ztop]), b.w([L, 0, ztop]), b.w([L, CE_P, ztop]), b.w([0, CE_P, ztop])])}"/></g>`)
  b.on(bw, `<g class="${cut}"><polygon class="in" points="${pts([b.w([L, CE_P, 0]), b.w([L, 0, 0]), b.w([L, 0, ztop]), b.w([L, CE_P, ztop])])}"/></g>`)
  // joints de panneaux (traits fins sur la paroi) + ceinture
  let jn = ''
  const nseg = Math.max(1, Math.round(L / 46))
  for (let i = 1; i < nseg; i++) jn += l2((L * i) / nseg, 0, (L * i) / nseg, ztop, 'ed2')
  b.pl('xz', CE_P, jn, bw)
  // cadres fins aux deux extrémités : montant avant de chaque étage + traverses
  for (const x of [0, L - 1.6]) {
    b.box(x, D - 2.2, 0, 1.6, 2.2, CE_H + T, 'mm')
    if (n === 2) b.box(x, Dh - 2.2, CE_H + T, 1.6, 2.2, CE_H + T, 'mm')
    for (let k = 0; k < n; k++) b.box(x, CE_P, k * (CE_H + T) + T + CE_H - 1.6, 1.6, Dk(k) - CE_P - 2.2, 1.6, 'mm')
  }
  // étages
  const zb = [T, CE_H + 2 * T + 0]
  const rangs: [Kind[], number, 1 | -1, boolean, Fluide][] = [[bas, zb[0], 1, false, flB]]
  if (n === 2) rangs.push([haut, zb[1], fluxH, true, flH])
  rangs.forEach(([ks, z, flux, h, fl], ri) => {
    const Dd = Dk(ri)
    const ctx = (x0: number, x1: number): Ctx => ({ b, x0, x1, zb: z, H: CE_H, flux, haut: h, D: Dd, fl })
    const span: [number, number][] = []
    for (const e of lay[ri]) {
      DESS[e.k](ctx(e.x, e.x + LONG[e.k]), e.x)
      span.push([e.x, e.x + LONG[e.k]])
      b.anchor(`e_${h ? 'haut' : 'bas'}_${e.k}`, [e.x + LONG[e.k] / 2, Dd, z + CE_H * 0.7])
    }
    // cloisons fines entre sections voisines (hors roue, qui a sa propre cloison)
    const tri = span.map((s0, i) => ({ s0, k: lay[ri][i].k })).sort((u, v) => u.s0[0] - v.s0[0])
    for (let i = 0; i + 1 < tri.length; i++) {
      if (CENTRAUX.includes(tri[i].k) || CENTRAUX.includes(tri[i + 1].k)) continue
      cloison(b, (tri[i].s0[1] + tri[i + 1].s0[0]) / 2, Dd, z, z + CE_H)
    }
    // flux discret dans les vides
    let a = 0
    for (const [s0, s1] of span.sort((u, v) => u[0] - v[0])) { fluxVide(b, ctx(0, L), a + 1, s0 - 1); a = s1 }
    fluxVide(b, ctx(0, L), a + 1, L - 1)
  })
  // ports gaine
  const pw = D - CE_P - 8, ph = CE_H - 8, pwh = Dh - CE_P - 8
  b.port('in', [0, (D + CE_P) / 2, zb[0] + CE_H / 2], [-1, 0, 0], { type: 'gaine', fluide: 'air_neuf', w: pw, h: ph })
  b.port('out', [L, (D + CE_P) / 2, zb[0] + CE_H / 2], [1, 0, 0], { type: 'gaine', fluide: 'air_souffle', w: pw, h: ph })
  if (n === 2 && fluxH < 0) {
    b.port('in2', [L, (Dh + CE_P) / 2, zb[1] + CE_H / 2], [1, 0, 0], { type: 'gaine', fluide: 'air_repris', w: pwh, h: ph })
    b.port('out2', [0, (Dh + CE_P) / 2, zb[1] + CE_H / 2], [-1, 0, 0], { type: 'gaine', fluide: 'air_rejete', w: pwh, h: ph })
  } else if (n === 2) {   // les deux étages vont vers +x (échangeur croisé) : in2 à gauche, out2 à droite
    b.port('in2', [0, (Dh + CE_P) / 2, zb[1] + CE_H / 2], [-1, 0, 0], { type: 'gaine', fluide: 'air_neuf', w: pwh, h: ph })
    b.port('out2', [L, (Dh + CE_P) / 2, zb[1] + CE_H / 2], [1, 0, 0], { type: 'gaine', fluide: 'air_rejete', w: pwh, h: ph })
  }
  b.anchor('badge', [L / 2, D / 2, ztop + 8]); b.anchor('haut', [L / 2, D / 2, ztop])
  b.anchor('bas_aval', [L - 6, D, zb[0] + CE_H / 2]); b.anchor('bas_amont', [6, D, zb[0] + CE_H / 2])
  b.anchor('haut_amont', [L - 6, Dh, n === 2 ? zb[1] + CE_H / 2 : ztop]); b.anchor('haut_aval', [6, Dh, n === 2 ? zb[1] + CE_H / 2 : ztop])
}

const taille = (p: Params): [number, number, number] => {
  const bas = parseEtage(p.bas), haut = parseEtage(p.haut)
  const n = p.etages === 2 || haut.length || p.haut != null ? 2 : 1
  return [p.L ?? Math.max(60, longEtage(bas) + 10, longEtage(haut) + 10), CE_D, n * (CE_H + CE_T)]
}
const ETATS_MOD: [any, any?, number?][] = [['arret'], ['marche'], ['modulant', { position: 55 }], ['defaut'], ['consigne', { manuel: true }]]
enregistrer({ id: 'cta_e.module', famille: 'CTA écorché', nom: 'Module CTA écorché (1 ou 2 étages ; params bas/haut = liste d\'éléments)', taille, defauts: { bas: ['vide'], haut: [], fluide: 'air_souffle' }, planche: ETATS_MOD, dessiner: dessin } as any)

// préréglages : un module par élément (utile pour la planche et pour assembler vite)
for (const k of Object.keys(LONG) as Kind[]) {
  const double = k === 'echangeur_croise' || k === 'echangeur_contre' || k === 'melange_x' || k === 'roue'
  enregistrer({ id: 'cta_e.' + k, famille: 'CTA écorché', nom: NOMS[k] + ' (module écorché)', taille: (p) => taille({ L: LONG[k] + 14, ...p, bas: p.bas ?? [k] }), defauts: { fluide: 'air_souffle', etages: double ? 2 : 1, haut: double ? [] : undefined, L: LONG[k] + 14 }, planche: ETATS_MOD,
    dessiner: (b, p) => dessin(b, { ...p, bas: p.bas ?? [k] }) } as any)
}

// ───────── gaine rectangulaire courte + manchette souple (accordéon), assemblable sur le port d'un module
enregistrer({
  id: 'cta_e.gaine', famille: 'CTA écorché', nom: 'Gaine courte + manchette souple', taille: (p) => [p.L ?? 46, CE_D - CE_P - 4, CE_H - 6],
  defauts: { L: 46, fluide: 'air_souffle', manchette: 'in' },
  planche: [['arret'], ['marche'], ['defaut']],
  dessiner(b: Builder, p: Params) {
    const L: number = p.L ?? 46, w: number = p.w ?? CE_D - CE_P - 4, h = CE_H - 6, ms = 13, s: 1 | -1 = p.manchette === 'out' ? -1 : 1
    const x0 = s > 0 ? ms : 0                      // la manchette est du côté du module (x=0 ou x=L)
    b.box(x0, 0, 0, L - ms, w, h, 'mb')
    b.flange([s > 0 ? L : 0, w / 2, h / 2], 'x', Math.min(w, h) * 0.5, 0, 0, 'mm', 1)
    const xm = s > 0 ? 0 : L - ms
    for (let i = 0; i < 4; i++) { const px = xm + i * (ms / 4); b.box(px, -0.6 + (i % 2) * 0.8, -0.6 + (i % 2) * 0.8, ms / 4 - 0.5, w + 1.2 - (i % 2) * 1.6, h + 1.2 - (i % 2) * 1.6, 'mc') }
    // cadre/collerette
    b.box(s > 0 ? ms - 1.4 : L - ms, -1, -1, 1.4, w + 2, h + 2, 'mm')
    b.port('in', [0, w / 2, h / 2], [-1, 0, 0], { type: 'gaine', fluide: p.fluide, w, h })
    b.port('out', [L, w / 2, h / 2], [1, 0, 0], { type: 'gaine', fluide: p.fluide, w, h })
    if (b.marche) { const y = w / 2; b.raw([x0, y, 1], [L, y + 0.1, h], (_bb, W) => `<g class="cflow fl-${p.fluide}"><path class="flow air" style="stroke:var(--cf);stroke-width:1.2;stroke-dasharray:3 9" d="M${pts([W([0, y, h * 0.5]), W([L, y, h * 0.5])]).replace(' ', 'L')}"/></g>`, 'mb') }
    b.anchor('badge', [L / 2, w / 2, h + 8]); b.anchor('haut', [L / 2, w / 2, h])
  },
} as any)
export type { V3, BBox }

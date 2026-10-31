/* eslint-disable */
// @ts-nocheck — catalogue de dessin (voir iso/README.md)
// Briques communes des familles « par métier » (conteneurs, véhicules, bâtiments, informatique, armoires, énergie, industrie, eau).
// RÈGLE DE SOBRIÉTÉ : silhouette juste, 3 tons, 2 ou 3 détails signifiants au plus. Ni supports, ni boulonnerie, ni berceaux, ni soudures.
import { Builder, r2, l2, p2, c2 } from './iso'
import type { Part } from './iso'
import { pts, dot, VUE } from './geom'
import type { V3 } from './geom'
import type { Params, EtatNom, Valeurs } from './types'

/** états montrés dans les planches */
export const PL5: [EtatNom, Valeurs?, number?][] = [['arret'], ['marche'], ['defaut'], ['alarme'], ['inconnu']]
export const PL2: [EtatNom, Valeurs?, number?][] = [['arret'], ['defaut']]

/** teintes sobres d'un objet colorable (conteneur, véhicule…) : classes de matière du thème */
export const COULEURS: Record<string, string> = { bleu: 'ma', rouge: 'mr', vert: 'mg', orange: 'mw', gris: 'mm', blanc: 'mc', noir: 'md' }
export const VAR_COULEUR = 'couleur=bleu|rouge|vert|orange|gris|blanc|noir'
export const teinte = (p: Params, def = 'bleu'): string => COULEURS[p.couleur ?? def] ?? 'ma'

/** 4 ancres de connexion « signal » sur les faces (+x, −x, +y, −y), pour les liens génériques (réseau, câble, 4G…) */
export function ancres(b: Builder, W: number, D: number, z = 4, x0 = 0, y0 = 0) {
  b.port('x+', [x0 + W, y0 + D / 2, z], [1, 0, 0], { type: 'signal' })
  b.port('x-', [x0, y0 + D / 2, z], [-1, 0, 0], { type: 'signal' })
  b.port('y+', [x0 + W / 2, y0 + D, z], [0, 1, 0], { type: 'signal' })
  b.port('y-', [x0 + W / 2, y0, z], [0, -1, 0], { type: 'signal' })
}

const esc = (s: string): string => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
/** une URL d'image n'est acceptée que si elle est https ou data:image (jamais de script ni d'URL locale) */
export const urlImageSure = (s: string): boolean => /^(https:\/\/|data:image\/(png|jpe?g|gif|webp|svg\+xml)[;,])/i.test(s.trim())

/**
 * Logo d'un flanc (plan xz) : image (URL https ou data:image) ou texte court.
 * Le plan iso est un miroir vertical : on retourne le contenu pour qu'il se lise à l'endroit. Zone en coordonnées (u, v haut).
 */
export function logoSvg(logo: string, u0: number, v0: number, w: number, h: number): string {
  const l = String(logo ?? '').trim()
  if (!l) return ''
  const y = (v: number) => v0 * 2 + h - v // retournement vertical dans la zone
  if (urlImageSure(l))
    return `<g transform="translate(0 ${v0 * 2 + h}) scale(1 -1)"><image href="${esc(l)}" x="${u0}" y="${v0}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/></g>`
  const t = l.length > 16 ? l.slice(0, 16) : l
  const fs = Math.max(4, Math.min(h * 0.55, (w / Math.max(4, t.length)) * 1.7))
  return `<g transform="translate(0 ${v0 * 2 + h}) scale(1 -1)"><text x="${u0 + w / 2}" y="${v0 + h / 2 + fs * 0.35}" text-anchor="middle" style="fill:var(--i-fg);font:700 ${fs.toFixed(1)}px sans-serif;letter-spacing:.03em">${esc(t)}</text></g>`
}

/** bande ombrée sans trait (creux d'une tôle ondulée) : une seule teinte, 18 % d'ombre, valable en clair comme en sombre */
const creux = (x: number, y: number, w: number, h: number): string => `<rect class="ns" style="fill:var(--i-shade);opacity:.2" x="${x}" y="${y}" width="${w}" height="${h}"/>`

/**
 * Tôle ondulée d'un flanc (plan xz, u = x, v = z) : nervures trapézoïdales VERTICALES, un creux ombré par période,
 * cadre de lisses haute et basse. Sobre : pas de trait par nervure.
 */
export function ondulationsFlanc(L: number, H: number, pas = 5): string {
  let s = l2(0.8, 1.6, L - 0.8, 1.6, 'ed2') + l2(0.8, H - 1.6, L - 0.8, H - 1.6, 'ed2')
  for (let x = 3 + pas * 0.5; x < L - 3; x += pas) s += creux(+x.toFixed(2), 1.6, +(pas * 0.4).toFixed(2), +(H - 3.2).toFixed(2))
  return s
}
/** Tôle ondulée du toit (plan xy, u = x, v = y) : nervures sur la largeur, donc des bandes parallèles à y. */
export function ondulationsToit(L: number, W: number, pas = 5): string {
  let s = ''
  for (let x = 3 + pas * 0.5; x < L - 3; x += pas) s += creux(+x.toFixed(2), 1.2, +(pas * 0.4).toFixed(2), +(W - 2.4).toFixed(2))
  return s
}
/** Tôle ondulée d'un pignon (plan yz, u = y, v = z) : nervures verticales sur la largeur. */
export function ondulationsPignon(W: number, H: number, pas = 5): string {
  let s = ''
  for (let y = 2 + pas * 0.5; y < W - 2; y += pas) s += creux(+y.toFixed(2), 1.2, +(pas * 0.4).toFixed(2), +(H - 2.4).toFixed(2))
  return s
}

/**
 * Conteneur maritime en coordonnées absolues (x0,y0,z0) : long côté sur x, portes en bout (+x), logo sur le flanc visible (y = W).
 * `porte` : 'fermee' (deux vantaux), 'ouverte' (intérieur sombre, vantaux rabattus le long des flancs) ou 'aucune' (bout plein, ondulé : conteneur posé sur un camion, portes côté arrière caché).
 * `ondule` (défaut vrai) : tôle ondulée sur le flanc, le toit et le bout plein.
 */
export function conteneur(b: Builder, x0: number, y0: number, z0: number, L: number, hc: boolean, m: string, porte: string, logo: string, ondule = true) {
  const W = 24, H = hc ? 29 : 26
  const corps = b.box(x0, y0, z0, L, W, H, m)
  const lg = logoSvg(logo, L * 0.16, H * 0.3, L * 0.68, H * 0.5)
  const pq = plaqueTraversee(L)
  const tr = (u: number, v: number, inner: string) => `<g transform="translate(${u} ${v})">${inner}</g>`
  let flanc = ondule ? ondulationsFlanc(L, H) : ''
  // plaque plane de traversée de paroi (là où un piquage peut sortir sans couper une nervure) : par-dessus la tôle
  if (ondule) flanc += r2(pq.u, pq.v, pq.w, pq.h, 'fm', 0.8)
  flanc += lg
  if (flanc) b.pl('xz', y0 + W + 0.05, tr(x0, z0, flanc), corps)
  if (ondule) b.pl('xy', z0 + H + 0.05, tr(x0, y0, ondulationsToit(L, W)), corps)
  if (porte === 'ouverte') {
    b.pl('yz', x0 + L + 0.05, tr(y0, z0, r2(1.2, 1.2, W - 2.4, H - 2.4, 'fk', 0.4)), corps)
    b.poly([[x0 + L, y0 + W, z0 + 1], [x0 + L + W / 2 - 1, y0 + W, z0 + 1], [x0 + L + W / 2 - 1, y0 + W, z0 + H - 1], [x0 + L, y0 + W, z0 + H - 1]], 'l', 'mm')
    b.poly([[x0 + L, y0, z0 + 1], [x0 + L + W / 2 - 1, y0, z0 + 1], [x0 + L + W / 2 - 1, y0, z0 + H - 1], [x0 + L, y0, z0 + H - 1]], 'l', 'mm')
  } else if (porte === 'aucune') {
    if (ondule) b.pl('yz', x0 + L + 0.05, tr(y0, z0, ondulationsPignon(W, H)), corps)
  } else {
    const vant = (u: number) => r2(u, 1.2, W / 2 - 1.8, H - 2.4, 'fm', 0.4) + l2(u + 3, 4, u + 3, H - 4, 'ed2') + l2(u + W / 2 - 4.8, 4, u + W / 2 - 4.8, H - 4, 'ed2')
    b.pl('yz', x0 + L + 0.05, tr(y0, z0, vant(1.2) + vant(W / 2 + 0.6)), corps)
  }
  // ancres de face propres (coordonnées locales monde du builder) : centres des 4 flancs, du toit et de la porte, + traversée
  const A = {
    'flanc_y+': [x0 + L / 2, y0 + W, z0 + H / 2], 'flanc_y-': [x0 + L / 2, y0, z0 + H / 2],
    'bout_x-': [x0, y0 + W / 2, z0 + H / 2], porte: [x0 + L, y0 + W / 2, z0 + H / 2], toit: [x0 + L / 2, y0 + W / 2, z0 + H],
    traversee: [x0 + pq.cx, y0 + W, z0 + pq.cz],
  } as Record<string, V3>
  return { corps, W, H, ancres: A, plaque: pq }
}

/** Plaque plane de traversée de paroi sur le flanc +y (plan xz) : coin (u,v), taille (w,h), centre (cx,cz) ; près du bout porte, sous le logo. */
export function plaqueTraversee(L: number): { u: number; v: number; w: number; h: number; cx: number; cz: number } {
  const w = 9, h = 5.2, u = L - 4 - w, v = 2.2
  return { u, v, w, h, cx: u + w / 2, cz: v + h / 2 }
}

// ───────────────────────────── toit à 2 pans (partagé par tous les bâtiments)

export interface FaceToit { id: 'pan-av' | 'pan-ar' | 'pignon-av' | 'pignon-ar' | 'rive'; pts: V3[]; n: V3 }
export interface GeomToit { axe: 'x' | 'y'; faitage: [V3, V3]; ze: number; faces: FaceToit[] }
const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

/**
 * Géométrie PURE (locale) d'un toit à 2 pans posé sur un volume W×D au niveau z, faîtage de hauteur h.
 * - faîtage parallèle au grand côté (axe 'x' si W ≥ D), centré ;
 * - 2 pans symétriques de même pente, débord d'égout `debord` : l'égout descend de debord × pente, de sorte que
 *   chaque rampant de pignon passe EXACTEMENT par les coins du mur (pas de décalage entre rampants et triangle) ;
 * - 2 pignons triangulaires dans les plans des murs (pas de débord latéral) ; une rive (tranche) d'épaisseur `epaisseur` sous l'égout avant.
 * `n` : normale sortante de chaque face (le volume est fermé : chaque arête appartient à exactement 2 faces).
 */
export function geomToit2Pans(W: number, D: number, z: number, h: number, o: { axe?: 'x' | 'y'; debord?: number; epaisseur?: number } = {}): GeomToit {
  const s = o.debord ?? 2.5, t = o.epaisseur ?? 1.2
  const axe = o.axe ?? (W >= D ? 'x' : 'y')
  const dem = axe === 'x' ? D / 2 : W / 2
  const ze = z - (s * h) / dem
  const R = z + h
  let f: Omit<FaceToit, 'n'>[]
  let faitage: [V3, V3]
  if (axe === 'x') {
    faitage = [[0, D / 2, R], [W, D / 2, R]]
    f = [
      { id: 'pan-av', pts: [[0, D + s, ze], [W, D + s, ze], [W, D / 2, R], [0, D / 2, R]] },
      { id: 'pan-ar', pts: [[0, -s, ze], [W, -s, ze], [W, D / 2, R], [0, D / 2, R]] },
      { id: 'pignon-av', pts: [[W, 0, z], [W, D, z], [W, D / 2, R]] },
      { id: 'pignon-ar', pts: [[0, 0, z], [0, D, z], [0, D / 2, R]] },
      { id: 'rive', pts: [[0, D + s, ze - t], [W, D + s, ze - t], [W, D + s, ze], [0, D + s, ze]] },
    ]
  } else {
    faitage = [[W / 2, 0, R], [W / 2, D, R]]
    f = [
      { id: 'pan-av', pts: [[W + s, 0, ze], [W + s, D, ze], [W / 2, D, R], [W / 2, 0, R]] },
      { id: 'pan-ar', pts: [[-s, 0, ze], [-s, D, ze], [W / 2, D, R], [W / 2, 0, R]] },
      { id: 'pignon-av', pts: [[0, D, z], [W, D, z], [W / 2, D, R]] },
      { id: 'pignon-ar', pts: [[0, 0, z], [W, 0, z], [W / 2, 0, R]] },
      { id: 'rive', pts: [[W + s, 0, ze - t], [W + s, D, ze - t], [W + s, D, ze], [W + s, 0, ze]] },
    ]
  }
  const c: V3 = [W / 2, D / 2, z]
  const faces = f.map((q) => {
    let n = cross3(sub3(q.pts[1], q.pts[0]), sub3(q.pts[2], q.pts[0]))
    const g = q.pts.reduce((a, p) => [a[0] + p[0] / q.pts.length, a[1] + p[1] / q.pts.length, a[2] + p[2] / q.pts.length] as V3, [0, 0, 0] as V3)
    if (dot(n, sub3(g, c)) < 0) n = [-n[0], -n[1], -n[2]]
    const l = Math.hypot(...n) || 1
    return { ...q, n: [n[0] / l, n[1] / l, n[2] / l] as V3 }
  })
  return { axe, faitage, ze, faces }
}

/**
 * Trace le toit à 2 pans : seules les faces tournées vers la caméra sont dessinées (le pan arrière l'est tant que la pente
 * est inférieure à 45°, ce qui est le cas des toits usuels). Pans → matière `mToit`, pignons → matière du mur `mMur`.
 * Renvoie la hauteur ajoutée (h).
 */
export function toit2Pans(b: Builder, W: number, D: number, z: number, h: number, mToit: string, mMur = 'mb', o: { axe?: 'x' | 'y'; debord?: number; epaisseur?: number } = {}): number {
  const g = geomToit2Pans(W, D, z, h, o)
  const wn = (f: FaceToit): V3 => b.wd(f.n)
  const visible = (f: FaceToit): boolean => dot(wn(f), VUE) > 1e-6
  const cls = (f: FaceToit): string => {
    if (f.id === 'pan-av') return 't'
    if (f.id === 'pan-ar') return 'r'
    const n = wn(f)
    return Math.abs(n[0]) >= Math.abs(n[1]) ? 'r' : 'l'
  }
  const bornes = (fs: FaceToit[]): [V3, V3] => {
    const p = fs.flatMap((f) => f.pts)
    return [[Math.min(...p.map((q) => q[0])), Math.min(...p.map((q) => q[1])), Math.min(...p.map((q) => q[2]))], [Math.max(...p.map((q) => q[0])), Math.max(...p.map((q) => q[1])), Math.max(...p.map((q) => q[2]))]]
  }
  const poly = (f: FaceToit) => (_bb: unknown, w: (p: V3) => V3) => `<polygon class="${cls(f)}" data-toit="${f.id}" points="${pts(f.pts.map(w))}"/>`
  // pans (arrière puis avant) et rive : une seule pièce, ordre interne garanti
  const toit = ['pan-ar', 'pan-av', 'rive'].map((id) => g.faces.find((f) => f.id === id)!).filter(visible)
  if (toit.length) {
    const [lo, hi] = bornes(toit)
    b.raw(lo, hi, (bb, w) => toit.map((f) => poly(f)(bb, w)).join(''), mToit)
  }
  for (const f of g.faces.filter((q) => q.id.startsWith('pignon') && visible(q))) {
    const [lo, hi] = bornes([f])
    b.raw(lo, hi, poly(f), mMur)
  }
  return h
}

// ───────────────────────────── véhicules : briques communes

/**
 * Extrusion d'un PROFIL LATÉRAL (x = avant, z = haut ; points dans le sens antihoraire) entre y0 et y1.
 * Une seule pièce : flancs +y / −y et facettes du pourtour, uniquement celles qui regardent la caméra
 * (capot, pare-brise, toit, face avant ; les faces arrière et le dessous sont cachés). Renvoie la pièce (pour y accrocher des détails).
 */
export function extrudeProfil(b: Builder, prof: [number, number][], y0: number, y1: number, m: string): Part {
  const xs = prof.map((q) => q[0]), zs = prof.map((q) => q[1])
  const lo: V3 = [Math.min(...xs), y0, Math.min(...zs)], hi: V3 = [Math.max(...xs), y1, Math.max(...zs)]
  return b.raw(lo, hi, (_bb, w) => {
    let s = ''
    for (let i = 0; i < prof.length; i++) {
      const [xa, za] = prof[i], [xb, zb] = prof[(i + 1) % prof.length]
      const n = b.wd([zb - za, 0, -(xb - xa)])
      if (dot(n, VUE) <= 1e-6) continue
      const l = Math.hypot(xb - xa, zb - za) || 1
      const nx = Math.abs(n[0]) / l, nz = Math.abs(n[2]) / l
      s += `<polygon class="${nz >= nx ? 't' : 'r'}" points="${pts([[xa, y1, za], [xb, y1, zb], [xb, y0, zb], [xa, y0, za]].map((q) => w(q as V3)))}"/>`
    }
    if (dot(b.wd([0, 1, 0]), VUE) > 0) s += `<polygon class="l" points="${pts(prof.map((q) => w([q[0], y1, q[1]])))}"/>`
    if (dot(b.wd([0, -1, 0]), VUE) > 0) s += `<polygon class="l" points="${pts(prof.map((q) => w([q[0], y0, q[1]])))}"/>`
    return s
  }, m)
}

/** facette plane quelconque rattachée à une pièce (vitre de pare-brise, feu…) : points locaux 3D */
export function facette(b: Builder, on: Part, ps: V3[], cls = 'fg'): void {
  b.raw([Math.min(...ps.map((p) => p[0])), Math.min(...ps.map((p) => p[1])), Math.min(...ps.map((p) => p[2]))], [Math.max(...ps.map((p) => p[0])), Math.max(...ps.map((p) => p[1])), Math.max(...ps.map((p) => p[2]))],
    (_bb, w) => `<polygon class="${cls}" points="${pts(ps.map(w))}"/>`, 'mb', on)
}

/** passage de roue sur le flanc +y (plan xz) : demi-disque sombre centré (x, zc), rayon R, coupé par le bas de caisse zb */
export function arche(x: number, zc: number, R: number, zb: number): string {
  const q: [number, number][] = []
  for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2; q.push([x + R * Math.cos(a), Math.max(zb, zc + R * Math.sin(a))]) }
  return p2(q, 'fk')
}

/**
 * Roue du flanc VISIBLE (+y) : pneu (cylindre d'axe y, donc une ellipse dans le plan xz) et moyeu clair en saillie.
 * Les roues du flanc caché (−y) ne sont volontairement JAMAIS dessinées : la caisse les masque en vue isométrique.
 * `yExt` = plan extérieur du pneu.
 */
export function roue(b: Builder, x: number, yExt: number, zc: number, R: number, larg = 2.4): Part {
  const pneu = b.cylY(x, yExt - larg, zc, R, larg, 'md')
  b.cylY(x, yExt, zc, R * 0.52, 0.35, 'mm')
  return pneu
}

/**
 * Voiture compacte européenne (berline bicorps) en coordonnées absolues, sens de marche +x.
 * Profil extrudé (capot, pare-brise, pavillon, hayon), vitres latérales et de pare-brise, feux, passages de roue ;
 * deux roues seulement : celles du flanc visible (les roues arrière/avant cachées sont masquées par la caisse).
 */
export function voiture(b: Builder, x0: number, y0: number, z0: number, m: string, L = 44, W = 18) {
  const k = L / 44
  const P = (pts2: [number, number][]) => pts2.map(([x, z]) => [x0 + x * k, z0 + z] as [number, number])
  const corps = extrudeProfil(b, P([[0, 2.4], [44, 2.4], [44, 6.6], [42.6, 8.7], [30, 10], [22.5, 15.2], [8.5, 15.2], [1, 9.2], [0, 7.8]]), y0, y0 + W, m)
  const yv = y0 + W
  // vitres latérales : avant / arrière, montant central
  const vit = (q: [number, number][]) => p2(P(q), 'fg')
  b.pl('xz', yv + 0.05, vit([[28.4, 10.7], [22.4, 14.4], [16.6, 14.4], [16.6, 10.7]]) + vit([[15.4, 10.7], [15.4, 14.4], [9.2, 14.4], [3.4, 10.7]]), corps)
  // pare-brise (facette inclinée) et feux avant
  const A: [number, number] = [x0 + 30 * k, z0 + 10], B: [number, number] = [x0 + 22.5 * k, z0 + 15.2]
  const pt = (t: number): [number, number] => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t]
  facette(b, corps, [[pt(0.12)[0], y0 + 1.4, pt(0.12)[1]], [pt(0.12)[0], yv - 1.4, pt(0.12)[1]], [pt(0.88)[0], yv - 1.4, pt(0.88)[1]], [pt(0.88)[0], y0 + 1.4, pt(0.88)[1]]], 'fg')
  b.pl('yz', x0 + 44 * k + 0.05, `<g transform="translate(${y0} ${z0})">${r2(1.2, 4.2, 4.2, 1.5, 'fw', 0.5)}${r2(W - 5.4, 4.2, 4.2, 1.5, 'fw', 0.5)}</g>`, corps)
  // passages de roue (flanc visible) puis roues : seules les roues du flanc visible existent
  const xr = [x0 + 8.5 * k, x0 + 35 * k]
  b.pl('xz', yv + 0.04, xr.map((x) => arche(x, z0 + 3.4, 4.5, z0 + 2.4)).join(''), corps)
  for (const x of xr) roue(b, x, yv + 0.3, z0 + 3.4, 3.4)
  return corps
}

export { r2, l2, p2, c2 }

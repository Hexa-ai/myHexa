/* eslint-disable */
// @ts-nocheck — catalogue de dessin (voir iso/README.md)
// Familles « Informatique et réseau », « Énergie », « Industrie extérieure » et « Eau ».
// Sobriété : silhouette reconnaissable, 3 tons, 2 ou 3 détails signifiants ; aucun support superflu, aucune boulonnerie.
// Règles de perspective (revue qualité) :
//  - tout rond posé sur une face est une ELLIPSE dans le plan de cette face (jamais un cercle d'écran) → ledY / ledX / ledZ / ledCyl ;
//  - aucun texte en miroir : texteFaceSvg() applique la bonne matrice selon la face (+y ou +x) ;
//  - une partie cachée n'est pas dessinée (pas de roue côté opposé, pas de panneau arrière).
import { enregistrer, symbole } from './registre'
import { Builder } from './iso'
import type { Params } from './types'
import { ellipseD, pts, f } from './geom'
import type { V3 } from './geom'
import { PL5, PL2, VAR_COULEUR, COULEURS, teinte, ancres, conteneur, voiture, r2, l2, p2, c2 } from './metiers_commun'

/** décale un dessin de face dans le plan (x, z) pour le poser sur une boîte qui ne part pas de l'origine */
const plan = (x0: number, z0: number, svg: string): string => `<g transform="translate(${x0} ${z0})">${svg}</g>`
const centre = (b: Builder, W: number, D: number, h: number) => b.anchor('badge', [W / 2, D / 2, h])
const esc = (s: string): string => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

// ───────────────────────────── Aides de perspective (ronds en ellipses, textes dans le bon sens)
/** LED / rond sur une face +y (plan xz) : ellipse dans le plan de la face. `y` = coordonnée de la face. */
export const ledY = (b: Builder, x: number, y: number, z: number, on, r = 1.4, cls = 'led') => b.pl('xz', y + 0.05, c2(x, z, r, cls), on)
/** idem sur une face +x (plan yz) */
export const ledX = (b: Builder, x: number, y: number, z: number, on, r = 1.4, cls = 'led') => b.pl('yz', x + 0.05, c2(y, z, r, cls), on)
/** idem sur une face horizontale (plan xy), dessus d'un objet */
export const ledZ = (b: Builder, x: number, y: number, z: number, on, r = 1.4, cls = 'led') => b.pl('xy', z + 0.05, c2(x, y, r, cls), on)
/** voyant sur un cylindre vertical, au point qui regarde la caméra : ellipse dans le plan tangent */
export function ledCyl(b: Builder, on, cx: number, cy: number, z: number, R: number, r = 1.4, cls = 'led', ang = Math.PI / 4) {
  const c = b.w([cx + R * Math.cos(ang) * 1.002, cy + R * Math.sin(ang) * 1.002, z])
  const U = b.wd([-Math.sin(ang) * r, Math.cos(ang) * r, 0]), V: V3 = [0, 0, r]
  b.on(on, `<path class="${cls}" d="${ellipseD(c, U, V)}"/>`)
}
/** voyant sur un cylindre horizontal d'axe x, au point qui regarde la caméra (haut-avant) */
export function ledCylX(b: Builder, on, x: number, cy: number, cz: number, R: number, r = 1.4, cls = 'led', ang = Math.PI / 4) {
  const c = b.w([x, cy + R * Math.cos(ang) * 1.002, cz + R * Math.sin(ang) * 1.002])
  const U = b.wd([r, 0, 0]), V = b.wd([0, -Math.sin(ang) * r, Math.cos(ang) * r])
  b.on(on, `<path class="${cls}" d="${ellipseD(c, U, V)}"/>`)
}

/**
 * Texte posé sur une face, JAMAIS en miroir (le déterminant de la matrice cumulée est positif).
 *  - face 'y' : plan xz (face visible à gauche), lecture le long de +x (vers la droite et le bas de l'écran) ;
 *  - face 'x' : plan yz (face visible à droite), l'axe u = y part vers la gauche de l'écran : on retourne u ;
 *  - vertical : lecture de bas en haut (sommet des lettres vers la gauche de l'écran).
 * (u, v) = origine du texte dans le plan de la face (v vers le haut), `taille` en unités.
 */
export function texteFaceSvg(face: 'y' | 'x', u: number, v: number, texte: string, taille: number, o: { vertical?: boolean; ancre?: 'start' | 'middle' | 'end' } = {}): string {
  const sx = face === 'y' ? 1 : -1
  const rot = o.vertical ? ' rotate(-90)' : ''
  return `<g transform="translate(${f(u)} ${f(v)}) scale(${sx} -1)${rot}"><text class="txt-face" data-face="${face}" x="0" y="${f(taille * 0.35)}" text-anchor="${o.ancre ?? 'start'}" style="fill:var(--i-fg);font:700 ${f(taille)}px ui-sans-serif,Arial,sans-serif;letter-spacing:.04em">${esc(texte)}</text></g>`
}

/** géométrie d'un écran sur son pied : l'écran, le col et le socle partagent le MÊME axe x (centré) */
export function geomEcranSurPied(x0: number, W: number) {
  const cx = x0 + W / 2, bw = Math.min(14, W * 0.5), nw = 4
  return { cx, ecran: { x0, x1: x0 + W }, socle: { x0: cx - bw / 2, x1: cx + bw / 2 }, col: { x0: cx - nw / 2, x1: cx + nw / 2 } }
}
/** écran (moniteur) sur pied, face visible vers +y ; le col est DERRIÈRE l'écran, le socle déborde devant */
function ecranSurPied(b: Builder, x0: number, y0: number, W: number, H: number) {
  const g = geomEcranSurPied(x0, W)
  b.box(g.socle.x0, y0, 0, g.socle.x1 - g.socle.x0, 12, 2, 'mm')
  b.box(g.col.x0, y0 + 4, 2, g.col.x1 - g.col.x0, 2.5, 6, 'mm')
  const e = b.box(x0, y0 + 6.5, 8, W, 2.5, H, 'md')
  b.pl('xz', y0 + 9.05, r2(x0 + 1.5, 9.5, W - 3, H - 3, 'fk', 0.6) + l2(x0 + W * 0.18, 9.5 + H - 5, x0 + W * 0.34, 9.5 + H - 9, 'ed2'), e)
  ledY(b, x0 + W - 3, y0 + 9, 8.9, e, 0.7)
  return e
}

// ───────────────────────────── Informatique et réseau (échelle agrandie pour rester lisible sur un plan)
const FI = 'Informatique et réseau'
const it = (id: string, nom: string, taille: [number, number, number], dessin: (b: Builder, p: Params) => void, defauts: Params = {}, variantes: string[] = [], planche = PL5) =>
  enregistrer({ id, famille: FI, nom, taille: () => taille, defauts, variantes, planche, dessiner(b: Builder, p: Params) { dessin(b, p); ancres(b, taille[0], taille[1], taille[2] / 2); centre(b, taille[0], taille[1], taille[2] + 12) } })

it('reseau.baie_serveurs', 'Baie serveurs (portes, unités)', [22, 24, 48], (b, p) => {
  const c = b.box(0, 0, 0, 22, 24, 46, 'md')
  if (p.porte === 'ouverte') {
    let s = r2(1.5, 2, 19, 42, 'fk', 0.5)
    for (let i = 0; i < 7; i++) s += r2(3, 4 + i * 5.6, 16, 4, 'fm', 0.4)
    b.pl('xz', 24.05, s, c)
    b.poly([[0, 24, 2], [0, 24 + 18, 2], [0, 24 + 18, 44], [0, 24, 44]], 'r', 'mm')
  } else b.pl('xz', 24.05, r2(1.5, 2, 19, 42, 'fg', 0.5) + [0, 1, 2, 3, 4, 5, 6].map((i) => l2(3, 6 + i * 5.6, 19, 6 + i * 5.6, 'ed2')).join(''), c)
  ledY(b, 18, 24, 42, c, 1.5)
}, { porte: 'fermee' }, ['porte=fermee|ouverte'])
it('reseau.serveur_tour', 'Serveur tour', [12, 22, 30], (b) => {
  const c = b.box(0, 0, 0, 12, 22, 30, 'md')
  // baie lecteur (fente + bouton rond en ellipse sur la face) puis baies disques
  b.pl('xz', 22.05, r2(1.5, 23, 9, 3, 'fm', 0.4) + l2(2.6, 24.5, 7.4, 24.5, 'ed2') + c2(9.2, 24.5, 0.8, 'fk') + r2(1.5, 3, 9, 17, 'fk', 0.4) + [0, 1, 2].map((i) => l2(2.5, 6 + i * 4.6, 9.5, 6 + i * 4.6, 'ed2')).join(''), c)
  ledY(b, 6, 22, 21.6, c, 1.2)
})
it('reseau.pc_bureau', 'PC de bureau (unité centrale et écran)', [50, 22, 26], (b) => {
  // tour à gauche ; l'écran est CENTRÉ sur son pied (voir geomEcranSurPied)
  const u = b.box(0, 4, 0, 10, 16, 22, 'md')
  b.pl('xz', 20.05, r2(1.5, 15, 7, 2.2, 'fm', 0.4) + c2(5, 11, 1, 'fm') + r2(1.5, 3, 7, 5, 'fk', 0.4), u)
  ledY(b, 5, 20, 18.6, u, 1.1)
  ecranSurPied(b, 22, 6, 26, 16)
})
it('reseau.ecran', 'Écran (moniteur)', [28, 12, 22], (b) => { ecranSurPied(b, 0, 0, 28, 14) })
it('reseau.tv_murale', 'TV / écran mural', [50, 6, 32], (b) => {
  const e = b.box(0, 0, 0, 50, 3, 29, 'md'); b.pl('xz', 3.05, r2(2, 2, 46, 25, 'fk', 0.6) + l2(6, 24, 22, 8, 'ed2'), e)
  ledY(b, 46, 3, 1, e, 0.8)
})
it('reseau.pc_portable', 'PC portable', [26, 18, 20], (b) => {
  const base = b.box(0, 0, 0, 26, 18, 2, 'mm')
  // clavier et pavé tactile : dessinés dans le plan du dessus
  b.pl('xy', 2.05, r2(2.5, 3, 21, 8, 'fk', 0.6) + [0, 1].map((i) => l2(3.5, 5.2 + i * 2.6, 22.5, 5.2 + i * 2.6, 'ed2')).join('') + r2(9.5, 12.8, 7, 3.6, 'fm', 0.6), base)
  const e = b.box(0, 0, 2, 26, 1.6, 16, 'md'); b.pl('xz', 1.65, plan(0, 2, r2(1.5, 1.5, 23, 13, 'fk', 0.6)), e)
})
it('reseau.smartphone', 'Smartphone', [10, 4, 20], (b) => {
  b.box(0, 0, 0, 10, 4, 1.4, 'md'); const e = b.box(0.5, 1.4, 1.4, 9, 1.2, 16, 'md'); b.pl('xz', 2.65, plan(0.5, 1.4, r2(1, 1.5, 7, 12, 'fk', 0.8)), e)
})
it('reseau.tablette', 'Tablette', [22, 6, 17], (b) => {
  b.box(0, 0, 0, 22, 4, 1.4, 'md'); const e = b.box(1, 1.4, 1.4, 20, 1.4, 14, 'md'); b.pl('xz', 2.85, plan(1, 1.4, r2(1.2, 1.2, 17.6, 11.6, 'fk', 0.8)), e)
})
it('reseau.routeur', 'Routeur', [24, 14, 22], (b) => {
  const c = b.box(0, 0, 0, 24, 14, 5, 'mc'); ledY(b, 4, 14, 2.5, c, 1.1); ledY(b, 8, 14, 2.5, c, 1.1)
  b.cylZ(5, 4, 5, 1.1, 16, 'md'); b.cylZ(19, 4, 5, 1.1, 16, 'md')
})
it('reseau.switch', 'Switch réseau', [30, 14, 7], (b) => {
  const c = b.box(0, 0, 0, 30, 14, 5, 'md')
  let s = ''
  for (let i = 0; i < 8; i++) s += r2(3 + i * 3, 1.2, 2.2, 2.2, 'fm', 0.3)
  b.pl('xz', 14.05, s, c); ledY(b, 27.4, 14, 2.5, c, 0.8)
})
it('reseau.ap_wifi', 'Point d’accès Wi-Fi', [20, 20, 22], (b) => {
  const c = b.cylZ(10, 10, 0, 8, 3, 'mc'); ledZ(b, 10, 10, 3, c, 1.6)
  b.pl('xz', 10, [5, 9, 13].map((r) => `<path class="ed2" d="M${10 - r * 0.72} ${8 + r * 0.72} A${r} ${r} 0 0 0 ${10 + r * 0.72} ${8 + r * 0.72}"/>`).join(''), c)
}, {}, [], PL2)
it('reseau.pare_feu', 'Pare-feu (firewall)', [26, 14, 10], (b) => {
  const c = b.box(0, 0, 0, 26, 14, 8, 'md')
  let s = ''
  for (let r = 0; r < 3; r++) { s += l2(2, 1.6 + r * 2.3, 14, 1.6 + r * 2.3, 'ed2'); for (let k = 0; k < 3; k++) s += l2(3 + k * 4 + (r % 2) * 2, 1.6 + r * 2.3, 3 + k * 4 + (r % 2) * 2, 3.9 + r * 2.3, 'ed2') }
  b.pl('xz', 14.05, s + p2([[20, 1.2], [23, 1.2], [21.5, 6]], 'fo'), c); ledY(b, 4, 14, 6.4, c, 0.8)
})
it('reseau.antenne_4g', 'Antenne relais 4G / 5G (mât et panneaux)', [14, 14, 56], (b) => {
  // mât tubulaire, deux panneaux sectoriels visibles (le 3e est derrière : non dessiné), radio déportée portant le voyant
  b.cylZ(7, 7, 0, 4, 1.6, 'mc')
  b.cylZ(7, 7, 1.6, 1.4, 49, 'mm')
  const rru = b.box(4.6, 8.2, 12, 4.8, 3, 8, 'mb')
  ledY(b, 7, 11.2, 18, rru, 1)
  b.box(6.2, 8.4, 40, 1.6, 2, 1.2, 'md'); b.box(8.4, 6.2, 40, 2, 1.6, 1.2, 'md')   // bras
  const py = b.box(3.8, 10.4, 31, 6.4, 1.8, 22, 'mc')
  b.pl('xz', 12.25, l2(7, 3, 7, 19, 'ed2') + c2(5.4, 1.6, 0.6, 'fk') + c2(8.6, 1.6, 0.6, 'fk'), py)
  const px = b.box(10.4, 3.8, 31, 1.8, 6.4, 22, 'mc')
  b.pl('yz', 12.25, l2(7, 3, 7, 19, 'ed2'), px)
  b.cylZ(7, 7, 50.6, 0.5, 4, 'mm')
}, {}, [], PL2)

/** Box HAI-P200-4G : boîtier vertical sur rail DIN, fidèle au visuel du portail (/hai-p-gateway.png).
 *  Grande face (+y) : ailettes de refroidissement + logo + nom vertical. Petite face (+x) : voyants d'état, bornier, 2 RJ45.
 *  Dessus : 2 antennes SMA. Voyants : PWR (marche), ALM (défaut / alarme), 4G (liaison en marche). */
export const TEXTE_BOX = 'HAI-P200-4G'
it('reseau.box_hai_p200', 'Box HAI-P200-4G (boîtier sur rail DIN, antennes, voyants)', [30, 14, 48], (b) => {
  const X0 = 2, W = 18, D = 12, H = 30, xe = X0 + W
  const et = b.etat
  // rail DIN (derrière le boîtier ; seul le bout qui dépasse à droite se voit)
  const rail = b.box(0, -1.8, 10, 29, 1.8, 7, 'mm')
  b.pl('xz', 0.05, r2(22.6, 12.2, 3, 2.2, 'fk', 1) + r2(26.2, 12.2, 3, 2.2, 'fk', 1), rail)
  // boîtier
  const c = b.box(X0, 0, 0, W, D, H, 'mb')
  // grande face (+y) : bande logo à gauche, ailettes à droite
  let s = r2(X0 + 7, 2.5, 10.2, 25, 'fm', 0.8)
  for (let i = 0; i < 7; i++) s += l2(X0 + 8.1 + i * 1.4, 4, X0 + 8.1 + i * 1.4, 26, 'ed2')
  s += c2(X0 + 3.4, 25, 1.7, 'fk') + c2(X0 + 3.4, 25, 0.7, 'fa')
  s += texteFaceSvg('y', X0 + 3.9, 3.5, TEXTE_BOX, 2.3, { vertical: true })
  b.pl('xz', D + 0.05, s, c)
  // petite face (+x) : voyants, bornier, RJ45
  const pwr = et === 'arret' || et === 'inconnu' ? 'led l-off' : 'led l-run'
  const alm = et === 'defaut' ? 'led l-def' : et === 'alarme' ? 'led l-sec' : 'led l-off'
  const g4 = et === 'marche' || et === 'modulant' ? 'led' : 'led l-off'
  let e = r2(1.5, 23, 9, 5.5, 'fk', 0.8) + c2(3.6, 25.7, 1, pwr) + c2(6, 25.7, 1, alm) + `<g style="--i-st:var(--i-signal)">${c2(8.4, 25.7, 1, g4)}</g>`
  e += r2(2, 14.6, 8, 6, 'fk', 0.8) + [0, 1, 2, 3].map((i) => c2(3.7 + i * 2.2, 17.6, 0.75, 'fm')).join('')
  e += r2(2.2, 8.2, 7.6, 4.8, 'fk', 0.4) + r2(3.8, 8.9, 4.4, 2.6, 'fm', 0.3) + r2(2.2, 2.2, 7.6, 4.8, 'fk', 0.4) + r2(3.8, 2.9, 4.4, 2.6, 'fm', 0.3)
  b.pl('yz', xe + 0.05, e, c)
  // antennes SMA (fouets) sur le dessus
  for (const x of [X0 + 5, X0 + 12]) { b.cylZ(x, 6, H, 1.3, 2.2, 'mm'); b.cylZ(x, 6, H + 2.2, 1, 12, 'md', 0.7) }
}, {}, [], [['arret'], ['marche'], ['defaut'], ['alarme'], ['inconnu']])

// ───────────────────────────── Énergie
const FE = 'Énergie'
const en = (id: string, nom: string, taille: [number, number, number], dessin: (b: Builder, p: Params) => void, defauts: Params = {}, variantes: string[] = [], planche = PL5) =>
  enregistrer({ id, famille: FE, nom, taille: () => taille, defauts, variantes, planche, dessiner(b: Builder, p: Params) { dessin(b, p); ancres(b, taille[0], taille[1], 6); centre(b, taille[0], taille[1], taille[2] + 12) } })
/** panneau PV : quadrilatère bleu (4 points) + traits de cellules */
const pv = (b: Builder, a: number[], bb: number[], c: number[], d: number[]) => {
  const q = b.poly([a, bb, c, d] as never, 't', 'ma')
  for (const t of [1 / 3, 2 / 3]) b.line([a[0] + (bb[0] - a[0]) * t, a[1] + (bb[1] - a[1]) * t, a[2] + (bb[2] - a[2]) * t], [d[0] + (c[0] - d[0]) * t, d[1] + (c[1] - d[1]) * t, d[2] + (c[2] - d[2]) * t], 'ed2', q)
  return q
}
en('energie.pv_toit_maison', 'Panneaux PV sur toit de maison', [46, 32, 36], (b) => {
  const W = 40, D = 28, ez = 18, fz = 30, yE = D + 2, yR = D / 2
  const zr = (y: number) => ez + ((fz - ez) * (yE - y)) / (yE - yR)    // plan du pan de toit avant
  b.box(0, 0, 0, W, D, ez, 'mc')
  b.poly([[W, 0, ez], [W, 0, zr(0)], [W, yR, fz], [W, D, zr(D)], [W, D, ez]], 'r', 'mb')     // pignon
  b.poly([[-2, yE, ez], [W + 2, yE, ez], [W + 2, yR, fz], [-2, yR, fz]], 't', 'md')
  for (const x0 of [4, 22]) pv(b, [x0, 26, zr(26) + 0.3], [x0 + 14, 26, zr(26) + 0.3], [x0 + 14, 17, zr(17) + 0.3], [x0, 17, zr(17) + 0.3])
}, {}, [], PL2)
en('energie.pv_toit_industriel', 'Panneaux PV sur toit industriel', [84, 52, 46], (b) => {
  const W = 80, D = 48
  b.box(0, 0, 0, W, D, 30, 'mc'); b.box(-1.5, -1.5, 30, W + 3, D + 3, 2, 'mm')
  for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) { const x = 6 + c * 36, y = 6 + r * 14; pv(b, [x, y + 10, 33], [x + 32, y + 10, 33], [x + 32, y, 37], [x, y, 37]) }
}, {}, [], PL2)
en('energie.pv_ombriere', 'Ombrière PV de parking (voitures dessous)', [90, 50, 40], (b) => {
  const W = 86, D = 46
  const zt = (y: number) => 31 + (9 * (D + 1 - y)) / (D + 1)     // plan de l'ombrière : les poteaux montent jusqu'à lui
  b.box(0, 0, 0, W, D, 1, 'md')
  voiture(b, 8, 8, 1, 'ma'); voiture(b, 8 + 38, 8, 1, 'mr'); voiture(b, 8, 26, 1, 'mc'); voiture(b, 8 + 38, 26, 1, 'mm')
  for (const [x, y] of [[2, 2], [W - 4, 2], [2, D - 4], [W - 4, D - 4]]) b.cylZ(x, y, 1, 1.4, zt(y) - 1.4, 'mm')
  for (let c = 0; c < 3; c++) pv(b, [2 + c * 28, D + 1, 31], [28 + c * 28, D + 1, 31], [28 + c * 28, 0, 40], [2 + c * 28, 0, 40])
}, {}, [], PL2)
en('energie.pv_sol', 'Panneaux PV au sol (rangées sur structures)', [78, 46, 22], (b) => {
  for (let r = 0; r < 3; r++) {
    const y = 4 + r * 15
    for (const x of [14, 64]) b.cylZ(x, y + 10, 0, 0.9, 4, 'mm')      // pieds avant (les pieds arrière sont cachés)
    pv(b, [2, y + 10, 4], [76, y + 10, 4], [76, y, 14], [2, y, 14])
  }
}, {}, [], PL2)
en('energie.eolienne', 'Éolienne (pales animées en marche)', [60, 12, 112], (b) => {
  b.cylZ(0, 0, 0, 2.6, 70, 'mc', 1.6)
  const nac = b.box(-4, -3, 70, 14, 6, 5, 'mc')
  const pale = (a: number) => `<g transform="rotate(${a})">${p2([[-1.8, 0], [1.8, 0], [0.7, 32], [-0.7, 32]], 'fw')}</g>`
  b.rotor('xz', 3.1, 8, 72.5, pale(0) + pale(120) + pale(240) + c2(0, 0, 2.6, 'fm'), nac, 3)
  ledY(b, -2, 3, 71.2, nac, 0.9)
})
en('energie.centrale_nucleaire', 'Centrale nucléaire (tour aéroréfrigérante, panache)', [120, 74, 118], (b) => {
  b.cylZ(30, 30, 0, 26, 74, 'mc', 17)
  const p = b.ball([30, 30, 84], 10, 'mc'); b.ball([44, 36, 100], 7, 'mc')
  b.cylZ(88, 22, 0, 13, 34, 'mb'); b.ball([88, 22, 34], 13, 'mb')
  const loc = b.box(70, 44, 0, 44, 22, 16, 'mm'); ledY(b, 92, 66, 8, loc, 1.4)
}, {}, [])
en('energie.groupe_electrogene', 'Groupe électrogène extérieur (capoté)', [56, 22, 30], (b) => {
  const c = b.box(0, 0, 0, 56, 22, 22, 'mb')
  b.pl('xz', 22.05, r2(4, 4, 18, 14, 'fm', 0.6) + [0, 1, 2, 3].map((k) => l2(6, 7 + k * 3, 22, 7 + k * 3, 'ed2')).join('') + r2(34, 5, 16, 12, 'fo', 0.6), c)
  b.cylZ(48, 6, 22, 2.2, 8, 'md'); ledY(b, 28, 22, 18, c, 1.5)
}, {}, [])
en('energie.poste_transfo', 'Poste de transformation (cabine)', [40, 28, 36], (b) => {
  const c = b.box(0, 0, 0, 40, 28, 24, 'mc'); b.pl('xz', 28.05, r2(5, 0, 14, 16, 'fm', 0.5) + p2([[30, 6], [34, 6], [32, 12]], 'fo'), c)
  b.poly([[-1.5, 29.5, 24], [41.5, 29.5, 24], [41.5, 14, 32], [-1.5, 14, 32]], 't', 'md'); ledY(b, 27, 28, 14, c, 1.5)
}, {}, [])
en('energie.poste_source', 'Poste source (transformateur HTA, portique)', [84, 52, 60], (b) => {
  b.box(0, 0, 0, 84, 52, 1.2, 'md')
  b.box(10, 14, 1, 26, 22, 18, 'mb'); for (const x of [16, 23, 30]) b.cylZ(x, 25, 19, 2.2, 10, 'mc')
  for (const x of [8, 76]) b.cylZ(x, 44, 1, 1.6, 44, 'mm')
  b.box(6, 43, 42, 74, 2, 2, 'mm')
  const t = b.box(48, 14, 1, 26, 22, 18, 'mb'); ledY(b, 61, 36, 12, t, 1.5)
}, {}, [])
en('energie.bess', 'Stockage batteries en conteneur (BESS)', [70, 24, 36], (b) => {
  const L = 60
  const c = b.box(0, 0, 0, L, 24, 26, 'mc')
  b.pl('xz', 24.05, r2(14, 8, 30, 10, 'fy', 0.5) + r2(16, 9.5, 24, 7, 'fn', 0.6) + r2(40, 11.5, 3, 3, 'fn', 0.4), c)
  b.box(8, 4, 26, 14, 14, 5, 'mm'); b.box(34, 4, 26, 14, 14, 5, 'mm'); ledY(b, 6, 24, 22, c, 1.6)
}, {}, [])
en('energie.borne_irve', 'Borne de recharge IRVE', [12, 12, 28], (b) => {
  // plan xz : v vers le haut
  const c = b.box(0, 0, 0, 8, 6, 24, 'mb'); b.pl('xz', 6.05, r2(1.5, 14, 5, 6, 'fk', 0.5) + p2([[4.6, 4.2], [2.6, 8.4], [3.9, 8.4], [3.3, 11.6], [5.4, 7.2], [4.1, 7.2]], 'fo'), c); ledY(b, 4, 6, 11, c, 1.1)
}, {}, [], PL5)
en('energie.compteur', 'Compteur / poste de livraison (comptage)', [18, 10, 28], (b) => {
  const c = b.box(0, 0, 0, 16, 8, 22, 'mc'); b.pl('xz', 8.05, c2(8, 14, 4.4, 'fk') + l2(8, 14, 10.4, 16, 'ed') + r2(3, 3, 10, 4, 'fm', 0.4), c); ledY(b, 8, 8, 9.5, c, 1.2)
}, {}, [])

// ───────────────────────────── Industrie, vue extérieure
const FX = 'Industrie extérieure'
const ix = (id: string, nom: string, taille: [number, number, number], dessin: (b: Builder, p: Params) => void, defauts: Params = {}, variantes: string[] = [], planche = PL5) =>
  enregistrer({ id, famille: FX, nom, taille: () => taille, defauts, variantes, planche, dessiner(b: Builder, p: Params) { dessin(b, p); ancres(b, taille[0], taille[1], 8); centre(b, taille[0], taille[1], taille[2] + 12) } })
ix('exterieur.cuve_verticale', 'Cuve extérieure verticale', [30, 30, 56], (b, p) => {
  const c = b.cylZ(15, 15, 0, 14, 46, teinte(p, 'gris'), undefined, { cap: true }); b.cylZ(15, 15, 46, 14.6, 2.4, 'md')
  b.rings(c, [15, 15, 0], [15, 15, 46], 14, [0.33, 0.66], 'ed2'); ledCyl(b, c, 15, 15, 30, 14, 1.6)
}, { couleur: 'gris' }, [VAR_COULEUR])
ix('exterieur.cuve_horizontale', 'Cuve extérieure horizontale', [56, 24, 26], (b, p) => {
  b.box(8, 2, 0, 6, 20, 2, 'mc'); b.box(42, 2, 0, 6, 20, 2, 'mc')
  const c = b.cylX(3, 12, 14, 11, 50, teinte(p, 'gris'), undefined, { cap: true }); ledCylX(b, c, 38, 12, 14, 11, 1.6)
}, { couleur: 'gris' }, [VAR_COULEUR])
ix('exterieur.silo', 'Silo industriel (fond conique sur pieds, filtre en toiture)', [28, 28, 84], (b, p) => {
  for (const [x, y] of [[4, 4], [24, 4], [4, 24], [24, 24]]) b.cylZ(x, y, 0, 1.4, 20, 'md')
  b.cyl([14, 14, 18], [14, 14, 30], 3, 'mm', 12)
  const c = b.cylZ(14, 14, 30, 12, 34, teinte(p, 'blanc'), undefined, { cap: true })
  b.cylZ(14, 14, 64, 12, 6, 'mm', 4)                          // toit conique
  const fi = b.box(8, 8, 70, 12, 8, 5, 'md'); ledY(b, 14, 16, 72.5, fi, 1.4)   // filtre à poussières
  ledCyl(b, c, 14, 14, 44, 12, 1.6)
}, { couleur: 'blanc' }, [VAR_COULEUR])
ix('exterieur.silo_agricole', 'Silo agricole (tôle ondulée, toit conique)', [28, 28, 58], (b, p) => {
  for (const [x, y] of [[4.5, 4.5], [23.5, 4.5], [4.5, 23.5], [23.5, 23.5]]) b.cylZ(x, y, 0, 1.2, 9, 'md')
  b.cylZ(14, 14, 8, 3.4, 10, 'mm', 11)                         // trémie conique
  const c = b.cylZ(14, 14, 18, 11, 28, teinte(p, 'blanc'), undefined, { cap: false })
  b.rings(c, [14, 14, 18], [14, 14, 46], 11, [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9], 'ed2')   // ondulations de la tôle
  b.cylZ(14, 14, 46, 11.6, 8, 'mm', 2)
  const cap = b.cylZ(14, 14, 54, 2, 2, 'md'); ledZ(b, 14, 14, 56.05, cap, 1.1)
}, { couleur: 'blanc' }, [VAR_COULEUR])
ix('exterieur.cuve_lait', 'Cuve à lait inox verticale (tank réfrigéré)', [26, 26, 84], (b) => {
  for (const [x, y] of [[5, 5], [21, 5], [5, 21], [21, 21]]) b.cylZ(x, y, 0, 1.3, 9, 'mm')
  const c = b.cylZ(13, 13, 8, 11, 56, 'mm', undefined, { cap: false })
  b.rings(c, [13, 13, 8], [13, 13, 64], 11, [0.28, 0.72], 'ed2')
  b.cylZ(13, 13, 64, 11, 8, 'mm', 3.4)                         // toit conique
  const mot = b.box(10, 10, 72, 6, 6, 4, 'md'); b.cylZ(13, 13, 76, 1.2, 4, 'mm')   // moteur d'agitateur
  ledZ(b, 13, 13, 76.05, mot, 1.4)
  b.cylX(24, 13, 12, 1.5, 4, 'mm')                             // vanne de vidange au pied
}, {}, [])
ix('exterieur.cuve_fioul_h', 'Cuve fioul / gasoil horizontale, double paroi', [50, 22, 30], (b, p) => {
  b.box(8, 2, 0, 6, 18, 3, 'mc'); b.box(34, 2, 0, 6, 18, 3, 'mc')
  const cy = 10, cz = 12, R = 9
  const c = b.cylX(2, cy, cz, R, 44, teinte(p, 'gris'), undefined, { cap: true })
  b.pl('yz', 46.05, c2(cy, cz, R - 1.8, 'ed2'), c)             // 2e paroi, visible sur le fond
  b.cylZ(22, cy, cz + R - 0.6, 3.2, 2, 'mm')                    // trou d'homme
  b.cylZ(34, cy, cz + R - 0.6, 0.9, 8, 'mm')                    // évent
  const dt = b.cylZ(12, cy, cz + R - 0.6, 1.7, 3.6, 'mw')      // détecteur de fuite de l'espace interstitiel
  ledZ(b, 12, cy, cz + R + 3.05, dt, 1.1)
}, { couleur: 'gris' }, [VAR_COULEUR])
ix('exterieur.cuve_fioul_v', 'Cuve fioul / gasoil verticale, double paroi', [24, 24, 54], (b, p) => {
  b.cylZ(12, 12, 0, 10, 2.4, 'mc')
  const c = b.cylZ(12, 12, 2.4, 9, 36, teinte(p, 'gris'), undefined, { cap: true })
  b.rings(c, [12, 12, 2.4], [12, 12, 38.4], 9, [0.5], 'ed2')
  b.on(c, `<path class="fk" d="${b.bandZ(12, 12, 10, 30, 9.05, 38, 44)}"/>`)   // jauge à lecture directe
  b.cylZ(12, 12, 38.4, 3.2, 2, 'mm')                            // trou d'homme
  b.cylZ(18, 8, 38.4, 0.9, 9, 'mm')                             // évent
  const dt = b.cylZ(6.5, 14, 38.4, 1.7, 3.6, 'mw'); ledZ(b, 6.5, 14, 42.05, dt, 1.1)
}, { couleur: 'gris' }, [VAR_COULEUR])
ix('exterieur.cuve_enterree', 'Cuve enterrée (trou d’homme, évent, remplissage)', [60, 34, 34], (b) => {
  b.box(0, 0, 0, 58, 32, 1.6, 'mc')
  b.cylZ(16, 16, 1.6, 6.4, 2.8, 'mm')                            // cheminée du trou d'homme
  const t = b.cylZ(16, 16, 4.4, 6.9, 1, 'md')
  b.pl('xy', 5.45, c2(16, 16, 4.2, 'ed2') + r2(13.4, 15.4, 5.2, 1.2, 'fk', 0.5), t)
  b.cylZ(36, 16, 1.6, 3.6, 2.2, 'mm'); const cp = b.cylZ(36, 16, 3.8, 3.9, 1, 'mw')
  ledZ(b, 36, 16, 4.85, cp, 1.2)                                  // bouchon de remplissage (voyant d'état)
  b.cylZ(48, 8, 1.6, 0.9, 24, 'mm'); b.cylZ(48, 8, 25.6, 2.3, 1.5, 'md', 0.7)   // évent à champignon
}, {}, [])

ix('exterieur.citerne', 'Semi-remorque citerne (tracteur et citerne routière)', [104, 22, 36], (b, p) => {
  const cab = COULEURS[p.cabine ?? 'bleu'] ?? 'ma'
  // châssis porteur de la citerne + châssis du tracteur
  b.box(0, 3, 5, 74, 12, 2, 'md'); b.box(66, 3, 5, 36, 12, 2, 'md')
  // citerne : fût, 4 viroles, 3 trous d'homme en toiture
  const c = b.cylX(2, 9, 16, 8.4, 66, teinte(p, 'blanc'), undefined, { cap: true })
  b.rings(c, [2, 9, 16], [68, 9, 16], 8.4, [0.16, 0.38, 0.62, 0.84], 'ed2')
  for (const x of [16, 34, 52]) b.cylZ(x, 9, 24, 2.3, 1.6, 'md')
  b.cylZ(72, 9, 7, 5, 1.2, 'md')                                  // sellette (5e roue)
  // cabine avancée : pare-brise et phares sur la face avant (+x), vitre et porte sur le flanc (+y)
  const k = b.box(82, 1, 7, 20, 16, 24, cab)
  b.pl('yz', 102.05, r2(2.4, 19, 13.2, 8, 'fk', 1) + r2(2.4, 9, 13.2, 6, 'fm', 0.6) + r2(1.2, 9.6, 2.6, 1.8, 'fw', 0.5) + r2(12.2, 9.6, 2.6, 1.8, 'fw', 0.5), k)
  b.pl('xz', 17.05, r2(84.5, 17.5, 11, 8.5, 'fk', 1) + r2(83, 8.5, 16, 19, 'ed2', 1), k)
  const bk = b.cylZ(92, 9, 31, 1.6, 1.4, 'mw'); ledZ(b, 92, 9, 32.45, bk, 1.1)  // gyrophare : voyant d'état
  // roues (côté visible seulement) : tracteur 2 essieux, remorque 3 essieux
  for (const [x, r] of [[74, 4.6], [96, 4.6], [8, 4.2], [17, 4.2], [26, 4.2]]) {
    const w = b.cylY(x, 15, r, r, 3.2, 'md'); b.pl('xz', 18.25, c2(x, r, r * 0.45, 'fm'), w)
  }
}, { couleur: 'blanc', cabine: 'bleu' }, [VAR_COULEUR, 'cabine=bleu|rouge|vert|orange|gris|blanc'])
ix('exterieur.tour_refroidissement', 'Tour de refroidissement (ventilateur animé)', [44, 34, 44], (b) => {
  b.box(-1, -1, 0, 42, 32, 4, 'md')                               // bac de recette
  const c = b.box(0, 0, 4, 40, 30, 28, 'mb')
  let s = '', s2 = ''
  for (let i = 0; i < 5; i++) { s += l2(4, 10 + i * 4.4, 36, 10 + i * 4.4, 'ed2'); s2 += l2(4, 10 + i * 4.4, 26, 10 + i * 4.4, 'ed2') }
  b.pl('xz', 30.05, s, c); b.pl('yz', 40.05, s2, c)             // persiennes sur les deux faces visibles
  const cap = b.cylZ(20, 15, 32, 11, 5, 'mm', undefined, { hollow: true })
  const pales = [0, 120, 240].map((a) => `<g transform="rotate(${a})">${p2([[-2, 0], [2, 0], [1, 9], [-1, 9]], 'fm')}</g>`).join('')
  b.rotor('xy', 36.6, 20, 15, pales + c2(0, 0, 1.6, 'fk'), cap, 1)
  b.cylX(40, 6, 8, 2, 5, 'mm')                                    // départ d'eau chaude
  ledY(b, 6, 30, 8, c, 1.5)
})
ix('exterieur.cheminee', 'Cheminée industrielle (bandes de balisage)', [16, 16, 100], (b) => {
  const r = (z: number) => 6 - (2.4 * z) / 88
  const seg = [[0, 56, 'mc'], [56, 68, 'mr'], [68, 78, 'mc'], [78, 88, 'mr']]
  let c
  for (const [z0, z1, m] of seg) { const s = b.cylZ(8, 8, z0, r(z0), z1 - z0, m, r(z1), { cap: false }); if (z0 === 0) c = s }
  b.cylZ(8, 8, 88, r(88) + 0.7, 1.6, 'md', undefined, { hollow: true })
  ledCyl(b, c, 8, 8, 14, r(14), 1.5)
}, {}, [], PL5)
ix('exterieur.torchere', 'Torchère (flamme en marche)', [22, 16, 100], (b) => {
  b.box(0, 0, 0, 16, 16, 2, 'mc')
  const m = b.cylZ(8, 8, 2, 1.9, 74, 'mm', 1.5)
  b.cylZ(8, 8, 76, 1.5, 6, 'md', 2.9)                                // bout de torche évasé
  const tip = b.cylZ(8, 8, 82, 3.1, 1.2, 'mm')
  ledCyl(b, m, 8, 8, 12, 1.9, 0.8)
  // flamme : silhouette à deux langues, 2 tons (orange / jaune) ; visible seulement en marche (classe .flame)
  const fl = `<g class="flame"><path class="fo" d="M0 0C-5 -3 -6.4 -9 -3 -14.5C-2.6 -10.5 -1.3 -9.6 -0.6 -11C1 -16 4 -18.5 3 -25C7.6 -18.6 8 -9.4 5 -3.6C3.8 -1 1.6 0 0 0Z"/><path style="fill:var(--i-gaz);stroke:none" d="M0 -1C-2.5 -2.6 -3 -6 -1.2 -9.2C-0.8 -7 0.4 -6.6 1 -8.4C2.4 -6.6 3 -3 0 -1Z"/></g>`
  b.scr([8, 8, 83.2], tip, fl)
}, {}, [])
ix('exterieur.quai_chargement', 'Quai de chargement (portes, rampe)', [64, 30, 40], (b, p) => {
  b.box(0, 0, 0, 64, 26, 7, 'mc')
  const m = b.box(0, 0, 7, 64, 3, 30, 'mm')
  const nb = Math.max(1, Math.round(p.portes ?? 3)); let s = ''
  for (let i = 0; i < nb; i++) s += r2((64 / nb) * (i + 0.5) - 8, 0, 16, 20, 'fk', 0.6)
  b.pl('xz', 3.05, plan(0, 7, s), m); b.box(-1.5, -2, 36, 67, 8, 2, 'md')
}, { portes: 3 }, [])

// ───────────────────────────── Eau
const FW = 'Eau'
const ea = (id: string, nom: string, taille: [number, number, number], dessin: (b: Builder, p: Params) => void, defauts: Params = {}, variantes: string[] = [], planche = PL5) =>
  enregistrer({ id, famille: FW, nom, taille: () => taille, defauts, variantes, planche, dessiner(b: Builder, p: Params) { dessin(b, p); ancres(b, taille[0], taille[1], 6); centre(b, taille[0], taille[1], taille[2] + 12) } })

/** profondeur de l'eau sous le bord (niveau 0..100 %, 85 % par défaut) */
const prof = (b: Builder, h: number) => 1.2 + (1 - (b.val.niveau ?? 85) / 100) * (h - 4)

/** bassin béton rectangulaire (ou carré) : parois, cuvette, eau visible, garde-corps en option */
function bassinRect(b: Builder, p: Params, W: number, D: number, h: number) {
  const t = 3, hw = h - prof(b, h)
  const base = b.box(0, 0, 0, W, D, h, 'mc')
  b.raw([0, 0, 0], [W, D, h], (_bb, w) => {
    const id = b.uid()
    const rim = [[t, t, h], [W - t, t, h], [W - t, D - t, h], [t, D - t, h]].map(w)
    const eau = [[t, t, hw], [W - t, t, hw], [W - t, D - t, hw], [t, D - t, hw]].map(w)
    const m1 = [[t, t, hw], [W - t, t, hw], [W - t, t, h], [t, t, h]].map(w)        // paroi intérieure du fond (face +y)
    const m2 = [[t, t, hw], [t, D - t, hw], [t, D - t, h], [t, t, h]].map(w)        // paroi intérieure gauche (face +x)
    return `<clipPath id="${id}"><polygon points="${pts(rim)}"/></clipPath><polygon class="in" points="${pts(rim)}"/><g clip-path="url(#${id})"><polygon class="l" points="${pts(m1)}"/><polygon class="r" points="${pts(m2)}"/><g class="fl-eau"><polygon class="t" points="${pts(eau)}"/></g></g>`
  }, 'mc', base)
  ledY(b, W - 7, D, h * 0.45, base, 1.3)
  if (p.garde_corps === 'oui') {
    const o = t / 2, zh = h + 6
    b.path3([[o, o, zh], [W - o, o, zh], [W - o, D - o, zh], [o, D - o, zh]], 'ed', undefined, true)
    const nx = Math.max(1, Math.round((W - 2 * o) / 12)), ny = Math.max(1, Math.round((D - 2 * o) / 12))
    const pos: [number, number][] = []
    for (let i = 0; i <= nx; i++) { const x = o + ((W - 2 * o) * i) / nx; pos.push([x, o], [x, D - o]) }
    for (let j = 1; j < ny; j++) { const y = o + ((D - 2 * o) * j) / ny; pos.push([o, y], [W - o, y]) }
    for (const [x, y] of pos) b.line([x, y, h], [x, y, zh], 'ed2')
  }
}
/** bassin béton rond */
function bassinRond(b: Builder, p: Params, R: number, h: number) {
  const t = 3, hw = h - prof(b, h), cx = R + 1, cy = R + 1, Ri = R - t
  const base = b.cylZ(cx, cy, 0, R, h, 'mc')
  b.raw([cx - R, cy - R, 0], [cx + R, cy + R, h], (_bb, w) => {
    const id = b.uid()
    const U = b.wd([Ri, 0, 0]), V = b.wd([0, Ri, 0])
    const rim = ellipseD(w([cx, cy, h]), U, V), eau = ellipseD(w([cx, cy, hw]), U, V)
    return `<clipPath id="${id}"><path d="${rim}"/></clipPath><path class="in" d="${rim}"/><g clip-path="url(#${id})"><g class="fl-eau"><path class="t" d="${eau}"/></g></g>`
  }, 'mc', base)
  ledCyl(b, base, cx, cy, h * 0.45, R, 1.3)
  if (p.garde_corps === 'oui') {
    const zh = h + 6, Rg = R - t / 2, n = 14
    b.raw([cx - Rg, cy - Rg, h], [cx + Rg, cy + Rg, zh], (_bb, w) => `<path class="ed" d="${ellipseD(w([cx, cy, zh]), b.wd([Rg, 0, 0]), b.wd([0, Rg, 0]))}"/>`, 'mc')
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + 0.2; b.line([cx + Rg * Math.cos(a), cy + Rg * Math.sin(a), h], [cx + Rg * Math.cos(a), cy + Rg * Math.sin(a), zh], 'ed2') }
  }
}
const VGC = ['garde_corps=non|oui']
ea('eau.bassin_rond', 'Bassin béton rond (eau visible, garde-corps en option)', [52, 52, 20], (b, p) => bassinRond(b, p, 25, 9), { garde_corps: 'non' }, VGC)
ea('eau.bassin_carre', 'Bassin béton carré (eau visible, garde-corps en option)', [46, 46, 20], (b, p) => bassinRect(b, p, 46, 46, 9), { garde_corps: 'non' }, VGC)
ea('eau.bassin_rect', 'Bassin béton rectangulaire (eau visible, garde-corps en option)', [80, 38, 20], (b, p) => bassinRect(b, p, 80, 38, 9), { garde_corps: 'non' }, VGC)

ea('eau.reservoir_sol', 'Réservoir d’eau au sol (cuve béton, toit, trappe, évent)', [46, 46, 34], (b) => {
  const cx = 23, cy = 23
  const c = b.cylZ(cx, cy, 0, 20, 22, 'mc')
  b.rings(c, [cx, cy, 0], [cx, cy, 22], 20, [0.5], 'ed2')
  b.cylZ(cx, cy, 22, 20.8, 1.6, 'mm')                                // dalle de couverture
  const tr = b.box(cx - 9, cy - 9, 23.6, 7, 7, 2.4, 'md'); ledZ(b, cx - 5.5, cy - 5.5, 26.05, tr, 1.3)   // trappe de visite
  b.cylZ(cx + 8, cy + 6, 23.6, 1, 7, 'mm'); b.cylZ(cx + 8, cy + 6, 30.6, 2.2, 1.2, 'md', 0.8)             // évent à champignon
}, {}, [])
ea('eau.chateau_eau', 'Château d’eau classique (cuve haute sur fût béton)', [40, 40, 96], (b) => {
  const cx = 20, cy = 20
  const fut = b.cylZ(cx, cy, 0, 6, 50, 'mc')
  b.rings(fut, [cx, cy, 0], [cx, cy, 50], 6, [0.3, 0.6], 'ed2')
  b.cylZ(cx, cy, 50, 6, 6, 'mc', 15)                                 // évasement sous la cuve
  b.cylZ(cx, cy, 56, 15, 16, 'mc')
  b.cylZ(cx, cy, 70, 15.7, 2, 'mm')                                  // corniche
  b.cylZ(cx, cy, 72, 15, 5, 'md', 3)                                 // toit
  const l = b.cylZ(cx, cy, 77, 3, 3, 'mm'); ledZ(b, cx, cy, 80.05, l, 1.3)
}, {}, [])
ea('eau.chateau_eau_tulipe', 'Château d’eau tulipe (fût évasé en calice)', [42, 42, 96], (b) => {
  const cx = 21, cy = 21
  b.cylZ(cx, cy, 0, 4.5, 38, 'mc', 5.5)
  b.cylZ(cx, cy, 38, 5.5, 6, 'mc', 9)
  b.cylZ(cx, cy, 44, 9, 6, 'mc', 15)
  b.cylZ(cx, cy, 50, 15, 4, 'mc', 17.5)                              // calice
  b.cylZ(cx, cy, 54, 17.5, 9, 'mc')
  b.cylZ(cx, cy, 63, 17.5, 6, 'md', 6)                               // coupole
  const l = b.cylZ(cx, cy, 69, 6, 3, 'mm'); ledZ(b, cx, cy, 72.05, l, 1.3)
}, {}, [])
ea('eau.poste_relevage', 'Poste de relevage (cuve enterrée, tampon, coffret, potence)', [44, 30, 30], (b) => {
  b.box(0, 0, 0, 44, 30, 1.6, 'mc')                                  // sol : la cuve est enterrée dessous (cachée)
  b.cylZ(14, 15, 1.6, 8.6, 2.6, 'mm')                                // regard béton
  const t = b.cylZ(14, 15, 4.2, 9.2, 1, 'md')                        // tampon fonte
  b.pl('xy', 5.25, c2(14, 15, 5.8, 'ed2') + r2(10.5, 14.4, 7, 1.2, 'fk', 0.5), t)
  // potence de levage de pompe : mât + flèche + câble
  b.cylZ(25, 6, 1.6, 1.1, 22, 'mm')
  b.box(12, 5.2, 23, 14, 1.6, 1.4, 'mm')
  b.line([14, 6, 23], [14, 6, 14], 'ed2')
  // coffret de commande sur son socle
  b.box(33, 20, 1.6, 8, 5, 3, 'mc')
  const k = b.box(33.4, 20.2, 4.6, 7.2, 4.6, 12, 'mb'); b.pl('xz', 24.85, r2(34.6, 6.8, 5, 8, 'ed2', 0.6), k); ledY(b, 37, 24.8, 14.2, k, 1)
}, {}, [])

/** ANCIEN (obsolète) : « STEP » trop vague, remplacé par les bassins génériques rond / carré / rectangulaire. Conservé pour les documents existants. */
ea('eau.step_bassins', 'Bassins de STEP (clarificateur rond, bassin rectangulaire)', [100, 52, 12], (b) => {
  const c = b.cylZ(26, 26, 0, 24, 6, 'mc', undefined, { hollow: true }); b.cylZ(26, 26, 3.2, 22, 1, 'fl-eau')
  b.box(58, 4, 0, 40, 44, 6, 'mc'); b.box(60.5, 6.5, 5, 35, 39, 1.2, 'fl-eau')
  ledCyl(b, c, 26, 26, 3, 24, 1.4)
})

// ───────────────────────────── Statuts qualité (revue Julien)
const statut = (ids: string[], s: 'revu' | 'obsolete', remplacePar?: string) => ids.forEach((id) => { const d = symbole(id); d.statut = s; if (remplacePar) d.remplacePar = remplacePar })
statut([
  'reseau.baie_serveurs', 'reseau.serveur_tour', 'reseau.pc_bureau', 'reseau.ecran', 'reseau.tv_murale', 'reseau.pc_portable', 'reseau.smartphone', 'reseau.tablette',
  'reseau.routeur', 'reseau.switch', 'reseau.ap_wifi', 'reseau.pare_feu', 'reseau.antenne_4g', 'reseau.box_hai_p200',
  'energie.pv_toit_maison', 'energie.pv_toit_industriel', 'energie.pv_ombriere', 'energie.pv_sol', 'energie.eolienne', 'energie.centrale_nucleaire', 'energie.groupe_electrogene',
  'energie.poste_transfo', 'energie.poste_source', 'energie.bess', 'energie.borne_irve', 'energie.compteur',
  'exterieur.cuve_verticale', 'exterieur.cuve_horizontale', 'exterieur.silo', 'exterieur.silo_agricole', 'exterieur.cuve_lait', 'exterieur.cuve_fioul_h', 'exterieur.cuve_fioul_v', 'exterieur.cuve_enterree',
  'exterieur.citerne', 'exterieur.tour_refroidissement', 'exterieur.cheminee', 'exterieur.torchere', 'exterieur.quai_chargement',
  'eau.bassin_rond', 'eau.bassin_carre', 'eau.bassin_rect', 'eau.reservoir_sol', 'eau.chateau_eau', 'eau.chateau_eau_tulipe', 'eau.poste_relevage',
], 'revu')
// anciens symboles : gardés pour les documents existants, retirés du catalogue visible
statut(['eau.step_bassins'], 'obsolete', 'eau.bassin_rect')

/* eslint-disable */
// @ts-nocheck — catalogue de dessin (voir iso/README.md)
// Familles « Conteneurs », « Véhicules », « Bâtiments » et « Armoires électriques ».
// Sobriété : silhouette reconnaissable, 3 tons, 2 ou 3 détails signifiants ; aucun support, aucune boulonnerie.
// Règle iso : tout rond est une ellipse dans son plan (cylindre d'axe y pour une roue, cercle tracé dans le plan du panneau pour un voyant),
// et les faces cachées (flanc −y, arrière, dessous) ne sont pas dessinées : en particulier, aucune roue du flanc caché.
import { enregistrer } from './registre'
import { Builder } from './iso'
import type { Part } from './iso'
import type { Params } from './types'
import { PL5, PL2, VAR_COULEUR, teinte, ancres, conteneur, voiture, extrudeProfil, facette, arche, roue, toit2Pans, r2, l2, p2, c2 } from './metiers_commun'

// ───────────────────────────── Conteneurs maritimes
const FC = 'Conteneurs'
const VP = ['porte=fermee|ouverte', VAR_COULEUR]
for (const [pieds, L] of [[10, 30], [20, 60], [40, 120]] as const) {
  enregistrer({
    id: `conteneur.c${pieds}`, famille: FC, nom: `Conteneur ${pieds} pieds (tôle ondulée, standard / high cube, logo)`, statut: 'revu',
    taille: (p) => [L + 14, 24, p.hc ? 29 : 26], defauts: { hc: false, porte: 'fermee', couleur: 'bleu', logo: '', ondule: true }, variantes: VP, planche: PL2,
    dessiner(b: Builder, p: Params) {
      const c = conteneur(b, 0, 0, 0, L, !!p.hc, teinte(p), p.porte, p.logo, p.ondule !== false && p.ondule !== 'non')
      ancres(b, L, c.W, c.H / 2)
      // ancres de face nommées : centres des flancs, du bout fond, du toit, de la porte, + zone de traversée (plaque plane sur la tôle)
      for (const [k, v] of Object.entries(c.ancres)) b.anchor(k, v)
      // voyant d'état dans le plan du flanc (ellipse en perspective), au-dessus de la tôle
      b.pl('xz', c.W + 0.1, c2(L * 0.1, c.H - 3.6, 1.6, 'led'), c.corps)
      b.anchor('badge', [L / 2, c.W / 2, c.H + 14])
    },
  })
}
enregistrer({
  id: 'conteneur.skid', famille: FC, nom: 'Skid process en conteneur 20 pieds (porte ouverte, équipements visibles)', statut: 'revu',
  taille: () => [74, 24, 28], defauts: { couleur: 'gris', logo: '' }, variantes: [VAR_COULEUR], planche: PL5,
  dessiner(b: Builder, p: Params) {
    const L = 60, W = 24, H = 26, m = teinte(p, 'gris')
    b.box(0, 0, 0, L, W, 3, 'md') // plancher
    b.box(0, 0, 3, L, 1.6, H - 3, m) // paroi arrière
    b.box(0, 0, 3, 1.6, W, H - 3, m) // pignon fond
    const toit = b.box(0, 0, H, L, W, 1.8, m) // toit ondulé
    b.pl('xy', H + 1.85, ondulationsToitLocal(L, W), toit)
    // flanc avant ouvert : on voit l'intérieur — cuve, deux pompes, coffret
    const cuve = b.cylZ(14, 12, 3, 8, 18, 'mc')
    b.led([14, 20, 14], cuve, 1.8)
    for (const x of [32, 44]) { b.box(x - 4, 6, 3, 8, 9, 6, 'mb'); const mo = b.cylX(x + 4, 10.5, 7, 3.4, 9, 'mm'); b.led([x, 12, 10], mo, 1.4) }
    b.box(52, 4, 3, 6, 6, 20, 'mb')
    // portes du bout ouvertes (rabattues)
    b.poly([[L, W, 3], [L + 12, W, 3], [L + 12, W, H - 1], [L, W, H - 1]], 'l', 'mm')
    b.poly([[L, 0, 3], [L + 12, 0, 3], [L + 12, 0, H - 1], [L, 0, H - 1]], 'l', 'mm')
    ancres(b, L, W, 12)
    b.anchor('flanc_y+', [L / 2, W, H / 2]); b.anchor('flanc_y-', [L / 2, 0, H / 2]); b.anchor('bout_x-', [0, W / 2, H / 2])
    b.anchor('porte', [L, W / 2, H / 2]); b.anchor('toit', [L / 2, W / 2, H + 1.8])
    b.anchor('badge', [L / 2, W / 2, H + 14])
  },
})
/** bandes d'ondulation du toit du skid (même motif que conteneur(), plan xy) */
function ondulationsToitLocal(L: number, W: number): string {
  let s = ''
  for (let x = 5.5; x < L - 3; x += 5) s += `<rect class="ns" style="fill:var(--i-shade);opacity:.2" x="${x}" y="1.2" width="2" height="${W - 2.4}"/>`
  return s
}

// ───────────────────────────── Véhicules
const FV = 'Véhicules'

/**
 * Cabine avancée européenne (cab-over) : profil extrudé (face avant verticale, pare-brise redressé, pavillon plat), vitre de porte,
 * pare-brise, calandre et feux sur la face avant, spoiler de toit optionnel. Sens de marche +x. Renvoie la pièce.
 */
function cabine(b: Builder, x0: number, W: number, o: { zb?: number; haut?: number; long?: number; spoiler?: boolean; m?: string } = {}): Part {
  const zb = o.zb ?? 11, haut = o.haut ?? 33.5, Lc = o.long ?? 22, m = o.m ?? 'mc'
  const zp = zb + 13.5 // haut de la face avant verticale, bas du pare-brise
  const xf = (z: number) => x0 + Lc - (z > zp ? (1.4 * (z - zp)) / (haut - zp) : 0) // x du bord avant à la hauteur z
  const cab = extrudeProfil(b, [[x0, zb], [x0 + Lc, zb], [x0 + Lc, zp], [x0 + Lc - 1.4, haut], [x0, haut]], 0, W, m)
  const za = zb + 11.5, zt = haut - 2.8
  b.pl('xz', W + 0.05, p2([[x0 + 7, za], [xf(za) - 0.8, za], [xf(zt) - 0.8, zt], [x0 + 7, zt]], 'fg') + l2(x0 + 5.6, zb + 1, x0 + 5.6, haut - 1, 'ed2') + l2(x0 + 8.4, zb + 8, x0 + 11.4, zb + 8, 'ed'), cab)
  // pare-brise : facette inclinée entre les deux bords du profil
  const t = (k: number): [number, number] => [x0 + Lc - 1.4 * k, zp + (haut - zp) * k]
  facette(b, cab, [[t(0.1)[0], 1.3, t(0.1)[1]], [t(0.1)[0], W - 1.3, t(0.1)[1]], [t(0.88)[0], W - 1.3, t(0.88)[1]], [t(0.88)[0], 1.3, t(0.88)[1]]], 'fg')
  // face avant : feux et calandre
  b.pl('yz', x0 + Lc + 0.05, r2(1.2, zb + 3, 3.4, 3.6, 'fw', 0.6) + r2(W - 4.6, zb + 3, 3.4, 3.6, 'fw', 0.6) + r2(6.2, zb + 2.6, W - 12.4, 7.2, 'fk', 0.8) + l2(6.2, zb + 6.2, W - 6.2, zb + 6.2, 'ed2'), cab)
  if (o.spoiler) extrudeProfil(b, [[x0, haut], [x0 + 9, haut], [x0 + 4.5, haut + 4], [x0, haut + 4]], 2, W - 2, 'mm')
  return cab
}

enregistrer({
  id: 'vehicule.camion_conteneur', famille: FV, nom: 'Camion porte-conteneur (tracteur + semi plateau, avec ou sans conteneur)', statut: 'revu',
  taille: (p) => { const Ls = Number(p.pieds) === 40 ? 132 : 100; return [Ls + 27, 24, 44] },
  defauts: { avec_conteneur: true, pieds: 20, couleur: 'bleu', logo: '' }, variantes: ['avec_conteneur=true|false', 'pieds=20|40', VAR_COULEUR], planche: PL2,
  dessiner(b: Builder, p: Params) {
    const W = 24, avec = p.avec_conteneur !== false && p.avec_conteneur !== 'false' && p.avec_conteneur !== 'non'
    const pieds = Number(p.pieds) === 40 ? 40 : 20, Ls = pieds === 40 ? 132 : 100, L = pieds === 40 ? 120 : 60
    const xT = Ls - 19 // départ du tracteur ; la cabine commence à xT + 22 = Ls + 3
    // semi-remorque plateau : longerons, plancher, 3 essieux à l'arrière (x petit)
    b.box(4, 5, 10, Ls - 8, 14, 2.4, 'mm')
    b.box(0, 0, 12.4, Ls, W, 2.2, 'md')
    // tracteur : châssis, sellette, réservoir, cabine avancée, 2 essieux
    b.box(xT + 2, 3, 8, 42, 18, 3, 'md')
    b.box(xT + 5, 5, 11, 13, 14, 1.4, 'mm')
    const rt = b.cylX(xT + 16, 19, 6.4, 3, 12, 'mm'); b.rings(rt, [xT + 16, 19, 6.4], [xT + 28, 19, 6.4], 3, [0.5])
    const cab = cabine(b, xT + 22, W, { spoiler: true })
    b.pl('xz', W + 0.1, c2(xT + 26, 17, 1.5, 'led'), cab)
    for (const x of [12, 25, 38]) roue(b, x, W, 5, 5, 4.2)
    for (const x of [xT + 10, xT + 37]) roue(b, x, W, 5, 5, 4.2)
    if (avec) {
      const c = conteneur(b, (Ls - L) / 2, 0, 14.6, L, false, teinte(p), 'aucune', p.logo)
      for (const [k, v] of Object.entries(c.ancres)) b.anchor('conteneur_' + k, v)
    }
    ancres(b, Ls + 25, W, 12)
    b.anchor('badge', [(Ls + 25) / 2, W / 2, 56])
  },
})
enregistrer({
  id: 'vehicule.voiture', famille: FV, nom: 'Voiture (compacte, roues du flanc visible seulement)', statut: 'revu',
  taille: () => [44, 18, 18], defauts: { couleur: 'bleu' }, variantes: [VAR_COULEUR], planche: PL2,
  dessiner(b: Builder, p: Params) { voiture(b, 0, 0, 0, teinte(p)); ancres(b, 44, 18, 6); b.anchor('badge', [22, 9, 30]) },
})
enregistrer({
  id: 'vehicule.camionnette', famille: FV, nom: 'Camionnette type Kangoo / Trafic (fourgon utilitaire)', statut: 'revu',
  taille: () => [47, 18, 22], defauts: { couleur: 'blanc' }, variantes: [VAR_COULEUR], planche: PL2,
  dessiner(b: Builder, p: Params) {
    const m = teinte(p, 'blanc'), W = 18
    const van = extrudeProfil(b, [[0, 2.8], [47, 2.8], [47, 7], [46.2, 9.4], [38.5, 11], [31.5, 17.4], [2, 18.2], [0, 16.6]], 0, W, m)
    b.pl('xz', W + 0.05, p2([[36.4, 12.3], [31.2, 16.9], [24.2, 16.9], [24.2, 12.3]], 'fg') + l2(22.4, 3.2, 22.4, 17.6, 'ed2') + l2(26.2, 9.2, 28.6, 9.2, 'ed')
      + [9.5, 37].map((x) => arche(x, 3.5, 4.7, 2.8)).join(''), van)
    facette(b, van, [[37.9, 1.4, 11.5], [37.9, W - 1.4, 11.5], [32.8, W - 1.4, 16.5], [32.8, 1.4, 16.5]], 'fg')
    b.pl('yz', 47.05, r2(1.2, 4.2, 4, 1.9, 'fw', 0.5) + r2(W - 5.2, 4.2, 4, 1.9, 'fw', 0.5), van)
    for (const x of [9.5, 37]) roue(b, x, W + 0.3, 3.5, 3.5)
    b.pl('xz', W + 0.1, c2(4, 15.2, 1.4, 'led'), van)
    ancres(b, 47, W, 8)
    b.anchor('badge', [23, 9, 33])
  },
})
enregistrer({
  id: 'vehicule.benne_ordures', famille: FV, nom: 'Benne à ordures ménagères (cabine, caisson, lève-conteneur arrière)', statut: 'revu',
  taille: () => [96, 24, 42], defauts: { couleur: 'vert' }, variantes: [VAR_COULEUR], planche: PL2,
  dessiner(b: Builder, p: Params) {
    const W = 24
    b.box(6, 3, 8, 88, 18, 3, 'md') // châssis
    // trémie arrière (chargement des bacs) puis caisson de compaction : deux prismes de profil
    extrudeProfil(b, [[2, 12], [15, 12], [15, 28], [8, 28], [2, 22]], 1, W - 1, 'md')
    const caisson = extrudeProfil(b, [[14, 11], [68, 11], [68, 35], [64, 37.2], [26, 37.2], [14, 31]], 0, W, teinte(p, 'vert'))
    b.pl('xz', W + 0.05, l2(14, 12, 14, 31, 'ed2') + l2(36, 12, 36, 37, 'ed2') + l2(52, 12, 52, 37, 'ed2') + p2([[16, 22], [32, 22], [32, 28], [16, 28]], 'fk'), caisson)
    // lève-conteneur : vérin le long de la trémie et peigne à l'arrière
    b.cyl([4, W - 0.2, 21], [14, W - 0.2, 27], 1.3, 'mm')
    b.box(0.2, 3, 14, 2.2, W - 6, 3, 'mm')
    const cab = cabine(b, 70, W, { haut: 32.5, long: 22 })
    b.pl('xz', W + 0.1, c2(74, 17, 1.5, 'led'), cab)
    for (const x of [28, 82]) roue(b, x, W, 5, 5, 4.2) // 2 essieux, roues du flanc visible seulement
    ancres(b, 92, W, 14)
    b.anchor('badge', [46, W / 2, 52])
  },
})
enregistrer({
  id: 'vehicule.chariot_elevateur', famille: FV, nom: 'Chariot élévateur (contrepoids, protège-conducteur, mât, fourches)', statut: 'revu',
  taille: () => [46, 14, 32], defauts: { couleur: 'orange' }, variantes: [VAR_COULEUR], planche: PL2,
  dessiner(b: Builder, p: Params) {
    const m = teinte(p, 'orange'), W = 14
    // caisse + contrepoids arrière (un seul profil)
    const caisse = extrudeProfil(b, [[0, 3.5], [30, 3.5], [30, 10], [12.5, 10], [11, 17], [2, 17], [0, 15]], 1, W - 1, m)
    b.pl('xz', W - 0.95, arche(24, 4.2, 5.3, 3.5) + arche(5, 3, 3.9, 3.5), caisse)
    // siège
    b.box(13.5, 3.5, 10, 6, 7, 3.2, 'md')
    b.box(13.5, 3.5, 13.2, 1.8, 7, 5, 'md')
    // volant sur sa colonne
    b.box(25, 6, 10, 1.4, 2, 5.5, 'mm')
    b.cyl([24.6, 7, 15.8], [26.2, 7, 17.4], 2.4, 'md')
    // protège-conducteur : 4 montants + toit à lattes + gyrophare
    for (const [x, y] of [[12.5, 1], [12.5, 11.6], [27, 1], [27, 11.6]]) b.box(x, y, 10, 1.3, 1.4, 18, 'mm')
    const toit = b.box(11.5, 0.5, 28, 18, 13, 1.2, 'md')
    b.pl('xy', 29.25, [14.5, 18, 21.5, 25].map((x) => l2(x, 1.5, x, 12.5, 'ed2')).join(''), toit)
    const gyro = b.cylZ(15, 7, 29.2, 1.5, 1.6, 'mw')
    b.pl('xy', 30.85, c2(15, 7, 1.0, 'led'), gyro)
    // mât (2 montants + traverses), tablier et fourches
    for (const y of [1.2, 10.4]) b.box(30, y, 3.5, 2.4, 2.4, 24, 'mm')
    b.box(30, 1.2, 25.5, 2.4, 11.6, 2, 'mm')
    b.box(30, 1.2, 12, 2.4, 11.6, 1.6, 'mm')
    b.box(32.4, 1.6, 4, 1.4, 10.8, 8, 'md')
    for (const y of [2.2, 9.2]) b.box(33.8, y, 3.4, 12, 2.6, 1.6, 'mm')
    // roues : motrices à l'avant, directrices plus petites à l'arrière (flanc visible)
    roue(b, 24, W + 0.3, 4.2, 4.2, 3)
    roue(b, 5, W + 0.3, 3, 3, 2.6)
    ancres(b, 46, W, 6)
    b.anchor('badge', [20, 7, 40])
  },
})

// ───────────────────────────── Bâtiments (variantes d'usage)
const FB = 'Bâtiments'
/** grille de fenêtres d'une façade (plan xz en y = D, ou yz en x = W) */
const fenetres = (len: number, n: number, hEt: number, cls = 'fg', porte = false) => {
  let s = ''
  const cols = Math.max(1, Math.floor((len - 8) / 14)), pas = (len - 8) / cols
  for (let e = 0; e < n; e++) for (let c = 0; c < cols; c++) s += r2(4 + c * pas + pas * 0.2, e * hEt + hEt * 0.3, pas * 0.6, hEt * 0.4, cls, 0.6)
  if (porte) s += r2(len / 2 - 5, 0, 10, hEt * 0.7, 'fk', 0.8)
  return s
}
const batiment = (id: string, nom: string, def: Params, dessin: (b: Builder, p: Params) => void, planche = PL2) =>
  enregistrer({ id, famille: FB, nom, statut: 'revu', taille: (p) => [(p.w ?? def.w) + 6, (p.d ?? def.d) + 6, (p.etages ?? 1) * (p.h_etage ?? 14) + 30], defauts: def, variantes: [VAR_COULEUR], planche, dessiner(b: Builder, p: Params) { dessin(b, p); ancres(b, p.w, p.d, 4); b.anchor('badge', [p.w / 2, p.d / 2, (p.etages ?? 1) * (p.h_etage ?? 14) + 28]) } })
/** toit à 2 pans : géométrie partagée (metiers_commun.toit2Pans), faîtage sur le grand côté, pan arrière visible, pignons alignés */
const toit2 = (b: Builder, W: number, D: number, z: number, h: number, m: string, mur = 'mb') => toit2Pans(b, W, D, z, h, m, mur)
batiment('batiment.cabanon', 'Cabanon / abri', { w: 24, d: 18, h_etage: 14, etages: 1, couleur: 'orange' }, (b, p) => {
  const mur = b.box(0, 0, 0, p.w, p.d, 14, teinte(p, 'orange'))
  b.pl('xz', p.d + 0.05, r2(p.w / 2 - 5, 0, 10, 10, 'fk', 0.6), mur)
  toit2(b, p.w, p.d, 14, 7, 'md', teinte(p, 'orange'))
})
batiment('batiment.maison', 'Maison (toit à 2 pans)', { w: 40, d: 28, h_etage: 16, etages: 1, couleur: 'blanc' }, (b, p) => {
  const mur = b.box(0, 0, 0, p.w, p.d, 18, teinte(p, 'blanc'))
  b.pl('xz', p.d + 0.05, fenetres(p.w, 1, 18, 'fg', true), mur)
  toit2(b, p.w, p.d, 18, 12, 'mw', teinte(p, 'blanc'))
})
batiment('batiment.immeuble_ancien', 'Petit immeuble ancien (R+3, toit à 2 pans)', { w: 50, d: 34, h_etage: 13, etages: 4, couleur: 'orange' }, (b, p) => {
  const H = p.etages * p.h_etage
  const mur = b.box(0, 0, 0, p.w, p.d, H, teinte(p, 'orange'))
  b.pl('xz', p.d + 0.05, fenetres(p.w, p.etages, p.h_etage, 'fg', true), mur)
  b.pl('yz', p.w + 0.05, fenetres(p.d, p.etages, p.h_etage), mur)
  toit2(b, p.w, p.d, H, 12, 'mm', teinte(p, 'orange'))
})
batiment('batiment.immeuble_recent', 'Immeuble récent (façade vitrée, toit plat)', { w: 56, d: 36, h_etage: 12, etages: 6, couleur: 'blanc' }, (b, p) => {
  const H = p.etages * p.h_etage
  const mur = b.box(0, 0, 0, p.w, p.d, H, teinte(p, 'blanc'))
  let s = ''
  for (let e = 0; e < p.etages; e++) s += r2(3, e * p.h_etage + 3, p.w - 6, p.h_etage - 6, 'fg', 0.6)
  b.pl('xz', p.d + 0.05, s + r2(p.w / 2 - 5, 0, 10, 8, 'fk', 0.6), mur)
  let sy = ''
  for (let e = 0; e < p.etages; e++) sy += r2(3, e * p.h_etage + 3, p.d - 6, p.h_etage - 6, 'fg', 0.6)
  b.pl('yz', p.w + 0.05, sy, mur)
  b.box(-1.5, -1.5, H, p.w + 3, p.d + 3, 3, 'mm')
})
batiment('batiment.bureaux', 'Bureaux (R+2, bandeaux vitrés)', { w: 72, d: 30, h_etage: 12, etages: 3, couleur: 'gris' }, (b, p) => {
  const H = p.etages * p.h_etage
  const mur = b.box(0, 0, 0, p.w, p.d, H, teinte(p, 'gris'))
  let s = ''
  for (let e = 0; e < p.etages; e++) s += r2(4, e * p.h_etage + 4, p.w - 8, p.h_etage - 8, 'fg', 0.6)
  b.pl('xz', p.d + 0.05, s + r2(p.w / 2 - 5, 0, 10, 8, 'fk', 0.6), mur)
  b.box(-1.5, -1.5, H, p.w + 3, p.d + 3, 3, 'md')
})
batiment('batiment.site_industriel', 'Hall industriel (toit à 2 pans, annexe et cheminée)', { w: 110, d: 60, h_etage: 40, etages: 1, couleur: 'gris' }, (b, p) => {
  const hall = b.box(0, 0, 0, p.w * 0.7, p.d, 40, teinte(p, 'gris'))
  b.pl('xz', p.d + 0.05, r2(p.w * 0.35 - 12, 0, 24, 26, 'fk', 0.6) + r2(4, 30, p.w * 0.7 - 8, 5, 'fg', 0.6), hall)
  toit2(b, p.w * 0.7, p.d, 40, 10, 'mc', teinte(p, 'gris'))
  b.box(p.w * 0.7, 10, 0, p.w * 0.3, p.d - 20, 22, 'mc')
  b.cylZ(p.w * 0.85, 12, 22, 4, 52, 'mm')
})
batiment('batiment.entrepot', 'Entrepôt (quais, portes sectionnelles)', { w: 130, d: 64, h_etage: 34, etages: 1, couleur: 'blanc', portes: 4 }, (b, p) => {
  const mur = b.box(0, 0, 0, p.w, p.d, 34, teinte(p, 'blanc'))
  let s = ''
  const nb = Math.max(1, Math.round(p.portes ?? 4)), pas = p.w / nb
  for (let i = 0; i < nb; i++) s += r2(pas * (i + 0.5) - 10, 0, 20, 22, 'fk', 0.6)
  b.pl('xz', p.d + 0.05, s + r2(4, 28, p.w - 8, 3, 'fg', 0.5), mur)
  b.box(-1.5, -1.5, 34, p.w + 3, p.d + 3, 3, 'mm')
})

// ───────────────────────────── Armoires électriques
const FA = 'Armoires électriques'
/**
 * Voyant d'état en DÔME sur la façade (plan xz, y = D) : une collerette cylindrique d'axe y (ellipse en iso) et la lentille
 * (cercle tracé dans le plan de la face, donc ellipse en perspective). La couleur suit l'état (classe `led`).
 */
function voyant(b: Builder, cx: number, D: number, z: number, r = 2.2): Part {
  const col = b.cylY(cx, D, z, r + 0.7, 1, 'mm')
  b.pl('xz', D + 1.04, c2(cx, z, r - 0.2, 'led'), col)
  return col
}
/** armoire de n portes (largeur 18 chacune) ; porte ouverte = 1er vantail rabattu, intérieur sombre ; poignée et voyant dans le plan de la porte */
function armoire(b: Builder, p: Params, n: number, H = 44, D = 14, m = 'mb') {
  const W = 18 * n, zs = 2 // soubassement
  b.box(0, 0, 0, W, D, zs, 'md')
  const corps = b.box(0, 0, zs, W, D, H, m)
  const ouverte = p.porte === 'ouverte'
  let s = ''
  for (let i = 0; i < n; i++) {
    const x0 = i * 18 + 1.5
    if (ouverte && i === 0) s += r2(x0, zs + 1.5, 15, H - 3, 'fk', 0.6) + l2(x0 + 2, zs + 10, x0 + 13, zs + 10, 'ed2') + l2(x0 + 2, zs + 22, x0 + 13, zs + 22, 'ed2') + r2(x0 + 2, zs + 28, 11, 6, 'fm', 0.6)
    else s += r2(x0, zs + 1.5, 15, H - 3, 'fm', 0.6) + r2(x0 + 12.2, zs + H * 0.36, 1.6, 8, 'fk', 0.8) // poignée dans le plan de la porte
  }
  b.pl('xz', D + 0.05, s, corps)
  if (ouverte) b.poly([[0, D, zs + 1.5], [0, D + 15, zs + 1.5], [0, D + 15, zs + H - 1.5], [0, D, zs + H - 1.5]], 'r', 'mm')
  for (let i = ouverte ? 1 : 0; i < n; i++) voyant(b, i * 18 + 7.5, D, zs + H - 6.5)
  b.pl('yz', W + 0.05, [0, 1, 2, 3].map((k) => l2(3.5, zs + 6 + k * 3, D - 3.5, zs + 6 + k * 3, 'ed2')).join(''), corps)
  ancres(b, W, D, H / 2)
  b.anchor('badge', [W / 2, D / 2, H + 14])
  return W
}
for (const n of [1, 2, 3]) {
  enregistrer({
    id: `armoire.a${n}p`, famille: FA, nom: `Armoire électrique ${n} porte${n > 1 ? 's' : ''} (poignées et voyants dans le plan des portes)`, statut: 'revu',
    taille: () => [18 * n + 2, 30, 58], defauts: { porte: 'fermee', couleur: 'blanc' },
    variantes: ['porte=fermee|ouverte'], planche: PL5, dessiner(b: Builder, p: Params) { armoire(b, p, n) },
  })
}
const CELL = 20
enregistrer({
  id: 'armoire.tgbt', famille: FA, nom: 'TGBT (cellules, disjoncteur de puissance en tête, rangées de modulaires, voyants)', statut: 'revu',
  taille: (p) => [CELL * Math.round(p.portes ?? 4) + 2, 30, 62], defauts: { porte: 'fermee', portes: 4 },
  variantes: ['porte=fermee|ouverte'], planche: PL5,
  dessiner(b: Builder, p: Params) {
    const n = Math.max(2, Math.round(p.portes ?? 4)), W = CELL * n, D = 16, H = 52, zs = 3
    const ouverte = p.porte === 'ouverte'
    b.box(0, 0, 0, W, D, zs, 'md')
    const corps = b.box(0, 0, zs, W, D, H, 'mm')
    let s = ''
    // rangée de modulaires : bandeau sombre + 9 pôles clairs
    const rangee = (x: number, z: number) => r2(x, z, 15.6, 6.4, 'fk', 0.6) + Array.from({ length: 9 }, (_, j) => r2(x + 0.7 + j * 1.6, z + 0.9, 1.2, 4.6, 'fm', 0.2)).join('')
    for (let i = 0; i < n; i++) {
      const x0 = i * CELL + 1.2
      if (i === 0) {
        // cellule d'arrivée (en tête) : gros disjoncteur de puissance, poignée et afficheur
        if (ouverte) s += r2(x0, zs + 1.5, 17.6, H - 3, 'fk', 0.6) + l2(x0 + 1, zs + H - 8, x0 + 16.6, zs + H - 8, 'ed') + r2(x0 + 3, zs + 14, 11.6, 24, 'fm', 0.8) + r2(x0 + 4.6, zs + 28, 8.4, 6, 'fk', 0.8) + r2(x0 + 6.6, zs + 19, 4.4, 5, 'fo', 0.6)
        else s += r2(x0, zs + 1.5, 17.6, H - 3, 'fm', 0.6) + r2(x0 + 2.2, zs + 12, 13.2, 25, 'fk', 1) + r2(x0 + 3.4, zs + 29, 10.8, 5, 'fa', 0.5) + r2(x0 + 5, zs + 17, 7.6, 6, 'fm', 0.8) + r2(x0 + 7.8, zs + 18.4, 2, 3.2, 'fk', 0.4)
      } else {
        s += r2(x0, zs + 1.5, 17.6, H - 3, 'fm', 0.6)
        for (const z of [zs + 9, zs + 20, zs + 31]) s += rangee(x0 + 1, z)
      }
    }
    b.pl('xz', D + 0.05, s, corps)
    if (ouverte) b.poly([[0, D, zs + 1.5], [0, D + 17, zs + 1.5], [0, D + 17, zs + H - 1.5], [0, D, zs + H - 1.5]], 'r', 'mm')
    // un voyant en dôme au sommet de chaque cellule
    for (let i = ouverte ? 1 : 0; i < n; i++) voyant(b, i * CELL + CELL / 2, D, zs + H - 4.2, 1.9)
    b.pl('yz', W + 0.05, [0, 1, 2, 3, 4].map((k) => l2(4, zs + 8 + k * 3.4, D - 4, zs + 8 + k * 3.4, 'ed2')).join(''), corps)
    ancres(b, W, D, H / 2)
    b.anchor('badge', [W / 2, D / 2, H + 14])
  },
})
enregistrer({
  id: 'armoire.coffret_mural', famille: FA, nom: 'Coffret mural (électrique / automatisme)', statut: 'revu', taille: () => [16, 8, 24], defauts: { porte: 'fermee', couleur: 'blanc' },
  variantes: ['porte=fermee|ouverte'], planche: PL5,
  dessiner(b: Builder, p: Params) {
    const c = b.box(0, 0, 0, 14, 7, 20, 'mb')
    b.pl('xz', 7.05, p.porte === 'ouverte' ? r2(1.2, 1.2, 11.6, 17.6, 'fk', 0.5) : r2(1.2, 1.2, 11.6, 17.6, 'fm', 0.5) + r2(10, 7, 1.2, 5, 'fk', 0.4), c)
    if (p.porte === 'ouverte') b.poly([[0, 7, 1], [0, 7 + 11, 1], [0, 7 + 11, 19], [0, 7, 19]], 'r', 'mm')
    else voyant(b, 6, 7, 15.5, 1.6)
    ancres(b, 14, 7, 10)
    b.anchor('badge', [7, 3.5, 32])
  },
})
void c2

/* eslint-disable */
// @ts-nocheck — catalogue de dessin (voir iso/README.md)
// Familles « Conteneurs », « Véhicules », « Bâtiments » et « Armoires électriques ».
// Sobriété : silhouette reconnaissable, 3 tons, 2 ou 3 détails signifiants ; aucun support, aucune boulonnerie.
import { enregistrer } from './registre'
import { Builder } from './iso'
import type { Params } from './types'
import { PL5, PL2, VAR_COULEUR, teinte, ancres, conteneur, voiture, r2, l2, p2, c2 } from './metiers_commun'

// ───────────────────────────── Conteneurs maritimes
const FC = 'Conteneurs'
const VP = ['porte=fermee|ouverte', VAR_COULEUR]
for (const [pieds, L] of [[10, 30], [20, 60], [40, 120]] as const) {
  enregistrer({
    id: `conteneur.c${pieds}`, famille: FC, nom: `Conteneur ${pieds} pieds (standard / high cube, logo)`,
    taille: (p) => [L + 14, 24, p.hc ? 29 : 26], defauts: { hc: false, porte: 'fermee', couleur: 'bleu', logo: '' }, variantes: VP, planche: PL2,
    dessiner(b: Builder, p: Params) {
      const c = conteneur(b, 0, 0, 0, L, !!p.hc, teinte(p), p.porte, p.logo)
      ancres(b, L, c.W, c.H / 2)
      b.led([L * 0.1, c.W, c.H - 3], c.corps, 1.6)
      b.anchor('badge', [L / 2, c.W / 2, c.H + 14])
    },
  })
}
enregistrer({
  id: 'conteneur.skid', famille: FC, nom: 'Skid process en conteneur 20 pieds (porte ouverte, équipements visibles)',
  taille: () => [74, 24, 28], defauts: { couleur: 'gris', logo: '' }, variantes: [VAR_COULEUR], planche: PL5,
  dessiner(b: Builder, p: Params) {
    const L = 60, W = 24, H = 26, m = teinte(p, 'gris')
    b.box(0, 0, 0, L, W, 3, 'md') // plancher
    b.box(0, 0, 3, L, 1.6, H - 3, m) // paroi arrière
    b.box(0, 0, 3, 1.6, W, H - 3, m) // pignon fond
    b.box(0, 0, H, L, W, 1.8, m) // toit
    // flanc avant ouvert : on voit l'intérieur — cuve, deux pompes, coffret
    const cuve = b.cylZ(14, 12, 3, 8, 18, 'mc')
    b.led([14, 20, 14], cuve, 1.8)
    for (const x of [32, 44]) { b.box(x - 4, 6, 3, 8, 9, 6, 'mb'); const mo = b.cylX(x + 4, 10.5, 7, 3.4, 9, 'mm'); b.led([x, 12, 10], mo, 1.4) }
    b.box(52, 4, 3, 6, 6, 20, 'mb')
    // portes du bout ouvertes (rabattues)
    b.poly([[L, W, 3], [L + 12, W, 3], [L + 12, W, H - 1], [L, W, H - 1]], 'l', 'mm')
    b.poly([[L, 0, 3], [L + 12, 0, 3], [L + 12, 0, H - 1], [L, 0, H - 1]], 'l', 'mm')
    ancres(b, L, W, 12)
    b.anchor('badge', [L / 2, W / 2, H + 14])
  },
})

// ───────────────────────────── Véhicules
const FV = 'Véhicules'
enregistrer({
  id: 'vehicule.camion_conteneur', famille: FV, nom: 'Camion porte-conteneur (avec ou sans conteneur)',
  taille: () => [112, 24, 36], defauts: { avec_conteneur: true, couleur: 'bleu', logo: '' }, variantes: [VAR_COULEUR], planche: PL2,
  dessiner(b: Builder, p: Params) {
    const W = 22
    b.box(0, 1, 6, 112, W - 2, 3, 'md') // châssis
    const cab = b.box(0, 0, 9, 24, W, 22, 'mc')
    b.pl('xz', W + 0.05, r2(4, 14, 14, 6, 'fg', 0.8) + r2(4, 3, 6, 6, 'fk', 0.4), cab)
    b.box(24, 3, 9, 6, W - 6, 6, 'md')
    for (const x of [12, 64, 86, 100]) for (const y of [-0.6, W - 1.6]) b.cylY(x, y, 5, 5, 2.6, 'md')
    if (p.avec_conteneur !== false) {
      const c = conteneur(b, 32, -1, 9, 60, false, teinte(p), 'fermee', p.logo)
      b.led([12, W, 24], cab, 1.5)
      void c
    }
    ancres(b, 112, W, 12)
    b.anchor('badge', [56, W / 2, 46])
  },
})
enregistrer({
  id: 'vehicule.voiture', famille: FV, nom: 'Voiture', taille: () => [44, 18, 18], defauts: { couleur: 'bleu' }, variantes: [VAR_COULEUR], planche: PL2,
  dessiner(b: Builder, p: Params) { voiture(b, 0, 0, 0, teinte(p)); ancres(b, 44, 18, 6); b.anchor('badge', [22, 9, 30]) },
})
enregistrer({
  id: 'vehicule.camionnette', famille: FV, nom: 'Camionnette (fourgon utilitaire)', taille: () => [50, 19, 24], defauts: { couleur: 'blanc' }, variantes: [VAR_COULEUR], planche: PL2,
  dessiner(b: Builder, p: Params) {
    const m = teinte(p, 'blanc')
    const caisse = b.box(0, 0, 4, 34, 19, 18, m)
    const cab = b.box(34, 0, 4, 16, 19, 11, m)
    b.pl('xz', 19.05, r2(36, 9, 11, 4.6, 'fg', 0.6), cab)
    b.box(34, 0, 4, 16, 19, 0.1, 'md')
    for (const x of [10, 40]) for (const y of [-0.6, 17.6]) b.cylY(x, y, 4.2, 4.2, 2, 'md')
    b.led([4, 19, 18], caisse, 1.5)
    ancres(b, 50, 19, 8)
    b.anchor('badge', [25, 9, 34])
  },
})
enregistrer({
  id: 'vehicule.benne_ordures', famille: FV, nom: 'Benne à ordures (camion-benne)', taille: () => [74, 22, 30], defauts: { couleur: 'vert' }, variantes: [VAR_COULEUR], planche: PL2,
  dessiner(b: Builder, p: Params) {
    const W = 22
    b.box(0, 1, 5, 74, W - 2, 3, 'md')
    const cab = b.box(0, 0, 8, 20, W, 20, 'mc')
    b.pl('xz', W + 0.05, r2(3, 12, 13, 6, 'fg', 0.8), cab)
    const benne = b.box(22, 0, 8, 52, W, 22, teinte(p, 'vert'))
    b.pl('xz', W + 0.05, p2([[44, 6], [66, 6], [66, 18]], 'ed2', false), benne) // trait de compaction
    b.box(66, 3, 8, 8, W - 6, 6, 'md') // lève-conteneur arrière
    for (const x of [10, 50, 62]) for (const y of [-0.6, W - 1.6]) b.cylY(x, y, 5, 5, 2.6, 'md')
    ancres(b, 74, W, 12)
    b.anchor('badge', [37, W / 2, 42])
  },
})
enregistrer({
  id: 'vehicule.chariot_elevateur', famille: FV, nom: 'Chariot élévateur', taille: () => [40, 14, 34], defauts: { couleur: 'orange' }, variantes: [VAR_COULEUR], planche: PL2,
  dessiner(b: Builder, p: Params) {
    const m = teinte(p, 'orange')
    b.box(0, 0, 3, 20, 14, 9, m)
    b.box(0, 0, 12, 6, 14, 5, 'md') // contrepoids
    const cab = b.box(8, 1.5, 12, 9, 11, 14, 'mm')
    b.pl('xz', 12.55, r2(10, 17, 5, 5, 'fg', 0.6), cab)
    for (const y of [2, 10]) b.box(20, y, 3, 2, 2, 28, 'md') // mât
    for (const y of [3, 9]) b.box(22, y, 3, 16, 2, 1.6, 'mm') // fourches
    for (const [x, r] of [[4, 3.6], [15, 3]]) for (const y of [-0.6, 12.6]) b.cylY(x, y, r, r, 2, 'md')
    ancres(b, 40, 14, 6)
    b.anchor('badge', [16, 7, 40])
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
  enregistrer({ id, famille: FB, nom, taille: (p) => [(p.w ?? def.w) + 6, (p.d ?? def.d) + 6, (p.etages ?? 1) * (p.h_etage ?? 14) + 30], defauts: def, variantes: [VAR_COULEUR], planche, dessiner(b: Builder, p: Params) { dessin(b, p); ancres(b, p.w, p.d, 4); b.anchor('badge', [p.w / 2, p.d / 2, (p.etages ?? 1) * (p.h_etage ?? 14) + 28]) } })
/** toit à 2 pans (faîtage sur x) */
const toit2 = (b: Builder, W: number, D: number, z: number, h: number, m: string) => {
  b.poly([[-2, D + 2, z], [W + 2, D + 2, z], [W + 2, D / 2, z + h], [-2, D / 2, z + h]], 't', m)
  b.poly([[W, -1, z], [W, D + 1, z], [W, D / 2, z + h]], 'r', 'mb')
}
batiment('batiment.cabanon', 'Cabanon / abri', { w: 24, d: 18, h_etage: 14, etages: 1, couleur: 'orange' }, (b, p) => {
  const mur = b.box(0, 0, 0, p.w, p.d, 14, teinte(p, 'orange'))
  b.pl('xz', p.d + 0.05, r2(p.w / 2 - 5, 0, 10, 10, 'fk', 0.6), mur)
  toit2(b, p.w, p.d, 14, 7, 'md')
})
batiment('batiment.maison', 'Maison (toit à 2 pans)', { w: 40, d: 28, h_etage: 16, etages: 1, couleur: 'blanc' }, (b, p) => {
  const mur = b.box(0, 0, 0, p.w, p.d, 18, teinte(p, 'blanc'))
  b.pl('xz', p.d + 0.05, fenetres(p.w, 1, 18, 'fg', true).replace(/y="/g, 'y="'), mur)
  toit2(b, p.w, p.d, 18, 12, 'mw')
})
batiment('batiment.immeuble_ancien', 'Petit immeuble ancien (R+3, toit à 2 pans)', { w: 50, d: 34, h_etage: 13, etages: 4, couleur: 'orange' }, (b, p) => {
  const H = p.etages * p.h_etage
  const mur = b.box(0, 0, 0, p.w, p.d, H, teinte(p, 'orange'))
  b.pl('xz', p.d + 0.05, fenetres(p.w, p.etages, p.h_etage, 'fg', true), mur)
  b.pl('yz', p.w + 0.05, fenetres(p.d, p.etages, p.h_etage), mur)
  toit2(b, p.w, p.d, H, 12, 'mm')
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
batiment('batiment.site_industriel', 'Site industriel (hall, annexe et cheminée)', { w: 110, d: 60, h_etage: 40, etages: 1, couleur: 'gris' }, (b, p) => {
  const hall = b.box(0, 0, 0, p.w * 0.7, p.d, 40, teinte(p, 'gris'))
  b.pl('xz', p.d + 0.05, r2(p.w * 0.35 - 12, 0, 24, 26, 'fk', 0.6) + r2(4, 30, p.w * 0.7 - 8, 5, 'fg', 0.6), hall)
  toit2(b, p.w * 0.7, p.d, 40, 10, 'mc')
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
/** armoire de n portes (largeur 18 chacune) ; porte ouverte = 1er vantail rabattu, intérieur sombre ; voyants en façade (couleur = état) */
function armoire(b: Builder, p: Params, n: number, H = 44, D = 14, m = 'mb') {
  const W = 18 * n
  const corps = b.box(0, 0, 0, W, D, H, m)
  const ouverte = p.porte === 'ouverte'
  let s = ''
  for (let i = 0; i < n; i++) {
    if (ouverte && i === 0) s += r2(i * 18 + 1.5, 1.5, 15, H - 3, 'fk', 0.6) + l2(i * 18 + 3, 8, i * 18 + 15, 8, 'ed2') + l2(i * 18 + 3, 20, i * 18 + 15, 20, 'ed2')
    else s += r2(i * 18 + 1.5, 1.5, 15, H - 3, 'fm', 0.6) + l2(i * 18 + 13.5, H * 0.45, i * 18 + 13.5, H * 0.45 + 6, 'ed')
  }
  b.pl('xz', D + 0.05, s, corps)
  if (ouverte) b.poly([[0, D, 1.5], [0, D + 15, 1.5], [0, D + 15, H - 1.5], [0, D, H - 1.5]], 'r', 'mm')
  for (let i = ouverte ? 1 : 0; i < n; i++) b.led([i * 18 + 9, D, H - 6], corps, 1.7)
  ancres(b, W, D, H / 2)
  b.anchor('badge', [W / 2, D / 2, H + 14])
  return W
}
for (const n of [1, 2, 3]) {
  enregistrer({
    id: `armoire.a${n}p`, famille: FA, nom: `Armoire électrique ${n} porte${n > 1 ? 's' : ''} (voyants en façade)`, taille: () => [18 * n + 2, 30, 58], defauts: { porte: 'fermee', couleur: 'blanc' },
    variantes: ['porte=fermee|ouverte'], planche: PL5, dessiner(b: Builder, p: Params) { armoire(b, p, n) },
  })
}
enregistrer({
  id: 'armoire.tgbt', famille: FA, nom: 'TGBT (tableau général basse tension)', taille: (p) => [18 * Math.round(p.portes ?? 4) + 2, 30, 62], defauts: { porte: 'fermee', portes: 4 },
  variantes: ['porte=fermee|ouverte'], planche: PL5,
  dessiner(b: Builder, p: Params) {
    const W = armoire(b, p, Math.max(1, Math.round(p.portes ?? 4)), 50, 14, 'mm')
    b.box(-1, -1, 50, W + 2, 16, 2, 'md') // toit débordant : signe d'un tableau de tête
  },
})
enregistrer({
  id: 'armoire.coffret_mural', famille: FA, nom: 'Coffret mural (électrique / automatisme)', taille: () => [16, 8, 24], defauts: { porte: 'fermee', couleur: 'blanc' },
  variantes: ['porte=fermee|ouverte'], planche: PL5,
  dessiner(b: Builder, p: Params) {
    const c = b.box(0, 0, 0, 14, 7, 20, 'mb')
    b.pl('xz', 7.05, p.porte === 'ouverte' ? r2(1.2, 1.2, 11.6, 17.6, 'fk', 0.5) : r2(1.2, 1.2, 11.6, 17.6, 'fm', 0.5) + l2(11, 8, 11, 12, 'ed'), c)
    if (p.porte === 'ouverte') b.poly([[0, 7, 1], [0, 7 + 11, 1], [0, 7 + 11, 19], [0, 7, 19]], 'r', 'mm')
    else b.led([7, 7, 16], c, 1.6)
    ancres(b, 14, 7, 10)
    b.anchor('badge', [7, 3.5, 32])
  },
})
void c2

/* eslint-disable */
// @ts-nocheck — catalogue de dessin (code massif copié de iso_lib, qui compile sans strictNullChecks) ; voir iso/README.md
// Pompes
import { enregistrer } from './registre'
import { Builder, c2, r2, l2, p2, d2 } from './iso'
import { moteurX, moteurZ, socle, grille, roueAubes, impeller, helice, inline } from './communs'
import type { Params, EtatNom, Valeurs } from './types'

const dn = (p: Params) => p.dn ?? 6
const ETP: EtatNom[] = ['arret', 'marche', 'defaut', 'alarme', 'inconnu', 'consigne']

/** flèche de sens de fluide embossée sur un côté (plan xz, y fixe) */
const flechePlan = (x: number, z: number, s = 1) => `<g transform="translate(${x} ${z}) scale(${s})">${d2('M-6 -1.6H0V-4L6 0L0 4V1.6H-6Z', 'fa')}</g>`

enregistrer({
  id: 'pompe.centrifuge_h', famille: 'Pompes', nom: 'Pompe centrifuge horizontale monobloc',
  taille: () => [118, 44, 60], defauts: { fluide: 'eau' }, etats: ETP,
  dessiner(b: Builder, p: Params) {
    const cy = 22, zc = 24, r = dn(p)
    socle(b, 0, 2, 118, 40, 4)
    b.box(20, cy - 9, 6, 14, 18, 7, 'mm')
    b.cylX(3, cy, zc, r * 1.25, 21, 'mm')
    b.flange([0, cy, zc], 'x', r * 1.95, 3, 8)
    const vol = b.cylX(22, cy, zc, 19, 16, 'mm')
    b.rings(vol, [22, cy, zc], [38, cy, zc], 19, [0.5])
    b.pl('yz', 38, c2(cy, zc, 15, 'ed2') + c2(cy, zc, 6.5, 'ed2'), vol)
    b.cylZ(30, cy, zc + 17, r * 1.25, 16, 'mm')
    b.flange([30, cy, zc + 33], 'z', r * 1.95, 3, 8)
    b.cylZ(34, cy, zc + 18, 1.8, 3, 'md'); b.cylZ(27, cy, 7, 2, 4, 'md')
    const lan = b.cylX(38, cy, zc, 11, 9, 'mm')
    b.rings(lan, [38, cy, zc], [47, cy, zc], 11, [0.5])
    moteurX(b, 47, cy, zc, 15, 42, { accent: true })
    b.pl('xz', cy + 19.05, flechePlan(30, zc - 4), vol)
    b.port('asp', [0, cy, zc], [-1, 0, 0], { dn: r })
    b.port('ref', [30, cy, zc + 36], [0, 0, 1], { dn: r })
    b.anchor('badge', [60, cy, zc + 34])
  },
})

enregistrer({
  id: 'pompe.centrifuge_v', famille: 'Pompes', nom: 'Pompe centrifuge verticale in-line',
  taille: () => [84, 44, 100], defauts: { fluide: 'eau' }, etats: ETP,
  dessiner(b: Builder, p: Params) {
    const cy = 22, zc = 22, r = dn(p), cx = 42
    const w = 84
    b.cylX(3, cy, zc, r * 1.25, w - 6, 'mm')
    b.flange([0, cy, zc], 'x', r * 1.95, 3, 8)
    b.flange([w - 3, cy, zc], 'x', r * 1.95, 3, 8)
    // pattes de support
    b.box(cx - 16, cy - 12, 0, 32, 24, 4, 'mm')
    b.cylZ(cx - 8, cy, 4, 3, 6, 'mm'); b.cylZ(cx + 8, cy, 4, 3, 6, 'mm')
    const cas = b.cylZ(cx, cy, zc - 12, 17, 24, 'mm')
    b.rings(cas, [cx, cy, zc - 12], [cx, cy, zc + 12], 17, [0.5])
    b.cylZ(cx, cy, zc + 12, 12, 4, 'mm')
    // lanterne à fenêtres
    const lan = b.cylZ(cx, cy, zc + 16, 10, 10, 'mm')
    b.pl('xz', cy + 10.2, r2(cx - 4, zc + 19, 8, 4, 'fk', 0.5), lan)
    const top = moteurZ(b, cx, cy, zc + 26, 14.5, 38)
    b.pl('xz', cy + 17.05, `<g transform="translate(${cx} ${zc})">${d2('M-6 -1.6H0V-4L6 0L0 4V1.6H-6Z', 'fa')}</g>`, cas)
    b.cylZ(cx + 11, cy, zc + 12.2, 1.6, 3, 'md')
    b.port('asp', [0, cy, zc], [-1, 0, 0], { dn: r })
    b.port('ref', [w, cy, zc], [1, 0, 0], { dn: r })
    b.anchor('badge', [cx, cy, top + 4])
    void top
  },
})

enregistrer({
  id: 'pompe.multicellulaire_v', famille: 'Pompes', nom: 'Pompe multicellulaire verticale',
  taille: () => [76, 44, 124], defauts: { fluide: 'eau', cellules: 6 }, etats: ETP,
  dessiner(b: Builder, p: Params) {
    const cy = 22, r = dn(p), cx = 38, zc = 11
    // embase avec brides aspiration / refoulement opposées
    b.box(cx - 17, cy - 15, 0, 34, 30, 22, 'mm')
    b.cylX(3, cy, zc, r * 1.25, 36 - 3 - 17 + 0, 'mm')
    b.cylX(cx + 17, cy, zc, r * 1.25, 76 - 3 - cx - 17, 'mm')
    b.flange([0, cy, zc], 'x', r * 1.95, 3, 8)
    b.flange([73, cy, zc], 'x', r * 1.95, 3, 8)
    b.cylZ(cx, cy, 22, 13, 4, 'mm')
    // chemise inox à cellules
    const n = p.cellules ?? 6
    const ch = b.cylZ(cx, cy, 26, 11, 14 + 6 * n, 'mb')
    b.rings(ch, [cx, cy, 26], [cx, cy, 40 + 6 * n], 11, Array.from({ length: n + 1 }, (_, i) => (i + 0.5) / (n + 1)), 'ed2')
    b.cylZ(cx, cy, 40 + 6 * n, 14, 6, 'mm')
    const z1 = 46 + 6 * n
    const lan = b.cylZ(cx, cy, z1, 10, 11, 'mm')
    b.pl('xz', cy + 10.2, r2(cx - 4, z1 + 3, 8, 5, 'fk', 0.5), lan)
    const top = moteurZ(b, cx, cy, z1 + 11, 14, 30)
    b.pl('xz', cy + 11.05, `<g transform="translate(${cx} 18)">${d2('M-5 -1.4H0V-3.4L5 0L0 3.4V1.4H-5Z', 'fa')}</g>`, ch)
    b.port('asp', [0, cy, zc], [-1, 0, 0], { dn: r })
    b.port('ref', [76, cy, zc], [1, 0, 0], { dn: r })
    b.anchor('badge', [cx, cy, top + 4])
  },
})

enregistrer({
  id: 'pompe.immergee', famille: 'Pompes', nom: 'Pompe immergée / de relevage',
  taille: () => [44, 34, 82], defauts: { fluide: 'eau_brute' }, etats: ETP,
  dessiner(b: Builder, p: Params) {
    const cy = 17, cx = 14, r = dn(p)
    b.cylZ(cx, cy, 0, 15, 4, 'mm')
    const fo = b.cylZ(cx, cy, 4, 12, 8, 'mm')
    for (let i = 0; i < 5; i++) b.pl('xz', cy + 12.05 + 0, '', fo)
    b.pl('xz', cy + 12, r2(cx - 7, 6, 14, 2, 'fk', 1) + r2(cx - 7, 9.5, 14, 1.5, 'fk', 0.7), fo)
    const hy = b.cylZ(cx, cy, 12, 11, 12, 'mm')   // volute
    const mo = b.cylZ(cx, cy, 24, 10, 34, 'mb')
    b.rings(mo, [cx, cy, 24], [cx, cy, 58], 10, [0.25, 0.5, 0.75])
    b.cylZ(cx, cy, 58, 11, 3, 'mm')
    // boîte de raccordement + presse-étoupe + câble
    const tete = b.cylZ(cx, cy, 61, 8, 7, 'mm')
    b.cylZ(cx - 8, cy, 66, 2, 8, 'md')
    b.path3([[cx - 8, cy, 74], [cx - 8, cy, 80], [cx - 20, cy, 80]], 'ed3', undefined)
    b.led([cx, cy, 68], tete, 1.8)
    // anse de levage
    b.path3([[cx - 6, cy, 68], [cx - 6, cy, 76], [cx + 6, cy, 76], [cx + 6, cy, 68]], 'ed3')
    // refoulement coudé vers +x
    b.cylX(cx + 8, cy, 19, r * 1.25, 11, 'mm')
    b.flange([cx + 19, cy, 19], 'x', r * 1.95, 3, 8)
    b.pl('xz', cy + 12.05, flechePlan(cx, 26, 0.8), hy)
    b.port('ref', [cx + 22, cy, 19], [1, 0, 0], { dn: r })
    b.anchor('badge', [cx, cy, 84])
  },
})

enregistrer({
  id: 'pompe.doseuse', famille: 'Pompes', nom: 'Pompe doseuse à membrane',
  taille: () => [64, 36, 50], defauts: { fluide: 'reactif' }, etats: ETP,
  dessiner(b: Builder, p: Params) {
    const cy = 18, r = p.dn ?? 2.6
    const bo = b.box(2, 3, 0, 36, 30, 34, 'mb')
    // face avant : afficheur + boutons + LED
    b.pl('xz', 33, r2(6, 20, 18, 9, 'fk', 1.2) + r2(8, 22, 8, 1.4, 'fa', 0.4) + r2(8, 25, 12, 1.2, 'ed2') + c2(30, 24, 2.6, 'fm') + c2(30, 12, 2.2, 'fm') + c2(22, 12, 2.2, 'fm') + c2(14, 12, 2.2, 'fm'), bo)
    b.led([30, 33, 30], bo, 1.9)
    // aération + poignée de course (dessus)
    const kb = b.cylZ(14, cy, 34, 6, 4, 'mm')
    b.pl('xy', 38, c2(14, cy, 3.4, 'ed2') + l2(14 - 3.4, cy, 14 + 3.4, cy, 'ed2'), kb)
    // tête de dosage : disque + 4 vis, sur la face +x
    const hd = b.cylX(38, cy, 18, 12, 10, 'mm')
    b.pl('yz', 48, c2(cy, 18, 8.5, 'ed2') + c2(cy, 18, 3.6, 'fd'), hd)
    b.flange([48, cy, 18], 'x', 12.6, 1.4, 6, 'mm')
    // clapets d'aspiration (bas) et de refoulement (haut)
    b.cylZ(43, cy, 30, 3.2 + r * 0.2, 14, 'mm'); b.cylZ(43, cy, 44, 4.4, 3, 'md')
    b.cylX(43, cy - 1 + 0, 6, 3, 14, 'mm')
    b.cylX(43, cy, 6, 3.2, 3, 'md')
    b.cylZ(53, cy, 8.5, 3.4, 5, 'mm')   // purge
    b.port('asp', [56, cy, 6], [1, 0, 0], { dn: r })
    b.port('ref', [43, cy, 48], [0, 0, 1], { dn: r })
    b.anchor('badge', [20, cy, 44])
  },
})

enregistrer({
  id: 'pompe.volumetrique', famille: 'Pompes', nom: 'Pompe volumétrique à vis excentrée',
  taille: () => [150, 44, 58], defauts: { fluide: 'boues' }, etats: ETP,
  dessiner(b: Builder, p: Params) {
    const cy = 22, zc = 24, r = dn(p) * 1.2
    socle(b, 0, 4, 150, 36, 4)
    b.box(14, cy - 8, 6, 10, 16, 6, 'mm'); b.box(62, cy - 10, 6, 14, 20, 6, 'mm')
    // stator (tube + bride de refoulement à gauche)
    const st = b.cylX(4, cy, zc, 11, 60, 'mm')
    b.rings(st, [4, cy, zc], [64, cy, zc], 11, [0.14, 0.28, 0.42, 0.56, 0.7, 0.84], 'ed2')
    b.cylX(1, cy, zc, r * 1.4, 4, 'mm')
    b.flange([0, cy, zc], 'x', r * 2.1, 3, 8)
    for (const t of [0.04, 0.96]) b.cylX(4 + t * 60 - 1.2, cy, zc, 11.8, 2.4, 'mm')
    // corps d'aspiration avec trémie / bride sur le dessus
    const ca = b.cylX(64, cy, zc, 14, 22, 'mm')
    b.cylZ(75, cy, zc + 12, r * 1.4, 12, 'mm')
    b.flange([75, cy, zc + 22], 'z', r * 2.1, 3, 8)
    b.pl('yz', 86, c2(cy, zc, 9, 'ed2'), ca)
    // lanterne d'entraînement + protecteur d'accouplement
    const la = b.cylX(86, cy, zc, 10, 14, 'mm')
    b.pl('xz', cy + 10.1, r2(90, zc - 3, 6, 6, 'fk', 1), la)
    // motoréducteur
    const gb = b.box(100, cy - 11, zc - 14, 20, 22, 28, 'mb')
    b.pl('xz', cy + 11, c2(110, zc, 5, 'fm') + c2(110, zc, 2, 'fd') + r2(103, zc + 8, 14, 2, 'ed2'), gb)
    moteurX(b, 120, cy, zc, 12, 22, { accent: true })
    b.port('ref', [0, cy, zc], [-1, 0, 0], { dn: r })
    b.port('asp', [75, cy, zc + 25], [0, 0, 1], { dn: r })
    b.anchor('badge', [112, cy, zc + 22])
  },
})

/** État d'une tête de circulateur → classe de LED */
const LED_TETE: Record<string, string> = { marche: 'led l-run', modulant: 'led l-run', secours: 'led l-sec', attente: 'led l-sec', defaut: 'led l-def', alarme: 'led l-def', arret: 'led l-off' }

/** Tête motrice d'un circulateur (commune au simple et au jumelé) : volute à flèche de sens, bride moteur, moteur à ailettes, face de commande (écran, bouton, LED d'état).
 *  `etat` : état de CETTE tête ('marche' | 'secours' | 'defaut' | 'arret'). Une tête hors service est tamisée (pas de LED verte, écran éteint). */
function teteCirculateur(b: Builder, cx: number, cy: number, zc: number, etat: string, fleche = true, sens: 1 | -1 = 1) {
  const actif = etat === 'marche' || etat === 'modulant'
  // y0..y0+len côté +y ; en miroir (sens −1) la même pièce est reportée de l'autre côté de l'axe du corps
  const Y = (y0: number, len: number) => (sens === 1 ? y0 : 2 * cy - y0 - len)
  const vo = b.cylY(cx, Y(cy - 12, 24), zc, 13.5, 24, 'mm')          // volute
  if (fleche && sens === 1) b.pl('xz', cy + 12.05, flechePlan(cx, zc, 0.9), vo)
  b.cylY(cx, Y(cy + 12, 5), zc, 12.8, 5, 'mm')                       // bride volute / moteur
  const mo = b.cylY(cx, Y(cy + 17, 24), zc, 11, 24, 'mb')
  b.rings(mo, [cx, cy + sens * 17, zc], [cx, cy + sens * 41, zc], 11, [0.2, 0.4, 0.6, 0.8])
  const cap = b.cylY(cx, Y(cy + 41, 3), zc, 10, 3, 'mk')
  // face de commande (écran éteint si la tête ne tourne pas, bouton, LED) : seulement si elle regarde le spectateur
  if (sens === 1) b.pl('xz', cy + 44.05, r2(cx - 5.5, zc + 1.5, 11, 5.5, 'fk', 1) + (actif ? r2(cx - 4, zc + 3, 5, 1.2, 'fa', 0.4) : '') + c2(cx, zc - 4.4, 2.6, 'fm') + c2(cx + 6, zc - 4.4, 1.1, LED_TETE[etat] ?? 'led'), cap)
  const tb = b.box(cx - 5, Y(cy + 22, 12), zc + 10.4, 10, 12, 7, 'mm')   // boîte à bornes (LED d'état visible sur le dessus)
  b.led([cx, cy + sens * 28, zc + 17.4], tb, 1.7, LED_TETE[etat] ?? 'led')
}

enregistrer({
  id: 'pompe.circulateur', famille: 'Pompes', nom: 'Circulateur de chauffage (simple, ou jumelé : un corps, deux têtes en parallèle)',
  taille: (p) => [56, p.variante === 'jumele' ? 90 : 52, p.variante === 'jumele' ? 76 : 46], defauts: { fluide: 'eau_chaude_aller', variante: 'simple' }, variantes: ['simple', 'jumele  (params.tetes = [état tête 1, état tête 2], ex. [marche, secours])'], etats: ETP,
  dessiner(b: Builder, p: Params) {
    const double = p.variante === 'jumele'
    const W = 56
    // jumelé : les deux têtes sont EN PARALLÈLE de part et d'autre de l'axe du tuyau (une vers +y, une vers −y)
    // jumelé : deux têtes dans le MÊME sens (vers le spectateur), côte à côte perpendiculairement au tuyau (décalées en z)
    const cy = 18, zc = double ? 34 : 18, r = dn(p) * 0.9, dz = 15
    const etatG = b.etat === 'marche' || b.etat === 'modulant' ? 'marche' : b.etat === 'defaut' || b.etat === 'alarme' ? 'defaut' : 'arret'
    const tetes: string[] = double ? (p.tetes ?? [etatG, etatG === 'marche' ? 'secours' : etatG]) : [etatG]
    // tubulure traversante + brides ; bague de couleur = fluide (aller / retour)
    b.cylX(3, cy, zc, r * 1.2, W - 6, 'mm')
    b.flange([0, cy, zc], 'x', r * 1.9, 3, 6)
    b.flange([W - 3, cy, zc], 'x', r * 1.9, 3, 6)
    for (const x of [8, W - 10]) b.cylX(x, cy, zc, r * 1.28, 2.4, 'mb')
    const xm = W / 2
    if (double) {
      // UN SEUL corps sur le tuyau, les deux volutes y sont accolées face à face ; clapet inverseur sur le dessus
      // UN SEUL corps sur le tuyau, qui porte les deux volutes l'une à côté de l'autre ; clapet inverseur latéral entre elles
      // corps centré sur l'axe du tuyau (le tuyau le traverse), même largeur et même hauteur que l'ensemble des deux volutes ;
      // les deux têtes sont montées sur sa face avant, exactement dans l'axe de chaque moitié du corps
      const hb = 13.5, dy = 13
      b.box(xm - hb, cy - dy, zc - dz - hb, 2 * hb, 2 * dy, 2 * (dz + hb), 'mm')
      b.cylX(xm + hb, cy, zc, 4.6, 3.2, 'mb')          // capot du clapet inverseur, sur le flanc, au milieu
      b.cylX(xm + hb + 3.2, cy, zc, 2.4, 2.2, 'md')
      const yt = cy + dy + 12                            // la volute (cy-12..cy+12 de la tête) démarre sur la face avant du corps
      teteCirculateur(b, xm, yt, zc - dz, tetes[1] ?? 'arret', false, 1)
      teteCirculateur(b, xm, yt, zc + dz, tetes[0] ?? 'arret', true, 1)
    } else teteCirculateur(b, xm, cy, zc, tetes[0] ?? 'arret', true)
    b.port('a', [0, cy, zc], [-1, 0, 0], { dn: r })
    b.port('b', [W, cy, zc], [1, 0, 0], { dn: r })
    b.anchor('badge', [W / 2, cy + (double ? 47 : 22), zc + (double ? dz : 0) + 24])
  },
})

enregistrer({
  id: 'pompe.surpresseur', famille: 'Pompes', nom: 'Surpresseur (groupe de pompes sur skid)',
  taille: (p) => [112, 34 + 36 * (p.nb ?? 2), 90], defauts: { fluide: 'eau', nb: 2 }, etats: ETP, variantes: ['nb=2', 'nb=3'],
  dessiner(b: Builder, p: Params) {
    const nb = p.nb ?? 2, D = 34 + 36 * nb, r = dn(p), W = 112
    socle(b, 0, 0, W, D, 5)
    const cxp = 52
    // collecteurs (le long de y) : aspiration basse à x=12, refoulement haut à x=92
    const zs = 14, zr = 36
    const asp = b.cylY(14, 6, zs, r * 1.5, D - 6, 'mm'), ref = b.cylY(96, 6, zr, r * 1.5, D - 6, 'mm')
    void asp; void ref
    b.flange([14, D - 3, zs], 'y', r * 2.2, 3, 8)
    b.flange([96, D - 3, zr], 'y', r * 2.2, 3, 8)
    for (let i = 0; i < nb; i++) {
      const cy = 24 + 36 * i
      b.cylX(14, cy, zs, r, cxp - 14 - 8, 'mm')            // aspiration → embase
      b.cylX(cxp + 8, cy, zr, r, 96 - cxp - 8, 'mm')       // refoulement
      // pompe verticale compacte
      b.box(cxp - 10, cy - 10, 5, 20, 20, 18, 'mm')
      const ch = b.cylZ(cxp, cy, 23, 8, 18, 'mb')
      b.rings(ch, [cxp, cy, 23], [cxp, cy, 41], 8, [0.2, 0.4, 0.6, 0.8])
      b.cylZ(cxp, cy, 41, 10, 4, 'mm')
      moteurZ(b, cxp, cy, 45, 11, 24, { bornes: false })
      // clapet + vanne d'isolement (bagues)
      b.cylX(cxp + 14, cy, zr, r * 1.5, 5, 'md'); b.cylX(26, cy, zs, r * 1.5, 5, 'md')
    }
    // coffret de commande à l'arrière + vase
    const cof = b.box(96 - 12, 2, 5, 22, 6, 26, 'mb')
    b.pl('xz', 8, r2(96 - 9, 17, 16, 10, 'fk', 1) + c2(96 - 6, 26, 1.6, 'led'), cof)
    b.port('asp', [14, D, zs], [0, 1, 0], { dn: r * 1.5 })
    b.port('ref', [96, D, zr], [0, 1, 0], { dn: r * 1.5 })
    b.anchor('badge', [cxp, D / 2, 82])
  },
})

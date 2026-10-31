/* eslint-disable */
// @ts-nocheck — catalogue de dessin (code massif copié de iso_lib, qui compile sans strictNullChecks) ; voir iso/README.md
// Instrumentation : petits appareils nets. Origine locale = pied de l'appareil, port 'proc' au point de raccordement.
import { enregistrer } from './registre'
import { Builder, c2, r2, l2, d2 } from './iso'
import { inline } from './communs'
import type { Params, EtatNom, Valeurs } from './types'

const PL: [EtatNom, Valeurs?, number?][] = [['arret'], ['marche', { valeur: 62 }], ['alarme', { valeur: 91 }], ['defaut'], ['consigne', { manuel: true }], ['inconnu'], ['marche', { valeur: 40 }, 90]]
const hex = (b: Builder, cx: number, cy: number, z: number, r: number, h: number, m = 'mm') => b.cylZ(cx, cy, z, r, h, m)

/** pastille d'état sur un appareil (led qui prend la couleur de l'état) */
const ledTop = (b: Builder, p: any, x: number, y: number, z: number) => b.led([x, y, z], p, 1.6)

enregistrer({
  id: 'instr.pression', famille: 'Instrumentation', nom: 'Transmetteur de pression', statut: 'revu',
  taille: () => [28, 28, 50], defauts: { fluide: 'eau' }, planche: PL,
  dessiner(b: Builder, p: Params) {
    const cx = 14, cy = 14
    // pile coaxiale (axe z) : écrou process, col, corps à bague, tête ; afficheur sur le DESSUS de la tête (ellipse dans le plan xy)
    hex(b, cx, cy, 0, 6, 4)
    b.cylZ(cx, cy, 4, 3.2, 4, 'mm')
    const co = b.cylZ(cx, cy, 8, 6, 20, 'mb'); b.rings(co, [cx, cy, 8], [cx, cy, 28], 6, [0.5])
    const tete = b.cylZ(cx, cy, 28, 9, 12, 'mm')
    b.pl('xy', 40.05, c2(cx, cy, 6.4, 'fk') + c2(cx, cy, 6.4, 'ed2') + r2(cx - 4, cy - 0.8, 6, 1.6, 'fa', 0.4), tete)
    b.cylX(cx + 9, cy, 33, 1.8, 4, 'md')           // presse-étoupe de câble
    ledTop(b, tete, cx - 5.5, cy - 5.5, 40.05)
    b.port('proc', [cx, cy, 0], [0, 0, -1], { dn: 3 })
    b.anchor('badge', [cx, cy, 50])
  },
})

enregistrer({
  id: 'instr.temperature', famille: 'Instrumentation', nom: 'Sonde de température (piquage + doigt de gant + tête)',
  taille: () => [34, 24, 54], defauts: { fluide: 'eau' }, planche: PL,
  dessiner(b: Builder, p: Params) {
    const cx = 12, cy = 12
    // le port « proc » est le plan de joint (haut du manchon soudé). Monté sur un tuyau, le doigt de gant est DANS le tuyau : jamais dessiné.
    // Hors montage (planche, zoom) on le montre sous le joint, avec son manchon.
    if (!p.dnPx) { b.cylZ(cx, cy, -22, 2.1, 22, 'mm'); b.cylZ(cx, cy, -22, 1.2, 1, 'md') }
    hex(b, cx, cy, 0, 5.4, 4)                       // écrou de presse-étoupe sur le manchon
    b.cylZ(cx, cy, 4, 3.4, 8, 'mm')                 // col
    const th = b.cylZ(cx, cy, 12, 7.4, 11, 'mb')    // tête de sonde
    b.cylZ(cx, cy, 23, 8, 2.4, 'mm')
    b.pl('xy', 25.4, c2(cx, cy, 5.2, 'ed2') + c2(cx, cy, 1.4, 'fd'), th)
    b.cylX(cx + 6, cy, 17, 1.6, 5, 'md')           // presse-étoupe de câble
    b.path3([[cx + 11, cy, 17], [cx + 20, cy, 17], [cx + 24, cy, 11]], 'ed3')
    ledTop(b, th, cx + 4.5, cy + 6, 16)
    b.port('proc', [cx, cy, 0], [0, 0, -1], { dn: 2 })
    b.anchor('badge', [cx, cy, 38])
  },
})

enregistrer({
  id: 'instr.debitmetre', famille: 'Instrumentation', nom: 'Débitmètre électromagnétique', statut: 'revu',
  taille: () => [60, 40, 66], defauts: { dn: 5, fluide: 'eau', simple: false }, planche: PL,
  dessiner(b: Builder, p: Params) {
    const cy = 20, zc = 18, r = p.dn, W = 60
    // tube de mesure bridé aux DEUX bouts : une manchette de tuyau visible de chaque côté du corps (coaxial)
    inline(b, W, cy, zc, r)
    if (p.simple) {       // niveau « indicateur » / « masqué » : simple manchette, la mesure est portée par une étiquette
      const co = b.cylX(20, cy, zc, r * 1.6, 20, 'mb'); b.rings(co, [20, cy, zc], [40, cy, zc], r * 1.6, [0.5], 'ed2')
      b.anchor('badge', [30, cy, zc + r * 1.6 + 2]); return
    }
    const co = b.cylX(19, cy, zc, r * 1.75, 22, 'mb'); b.rings(co, [19, cy, zc], [41, cy, zc], r * 1.75, [0.5], 'ed2')
    // convertisseur compact : col + boîtier, afficheur sur la face avant (plan xz, face plane du boîtier)
    b.cylZ(30, cy, zc + r * 1.75 - 1, r * 0.9, 7, 'mm')
    const zb = zc + r * 1.75 + 5
    const tr = b.box(19, cy - 9, zb, 22, 18, 14, 'mb')
    b.pl('xz', cy + 9, r2(22, zb + 6, 16, 6, 'fk', 1.2) + r2(24, zb + 7.6, 6, 1.4, 'fa', 0.3) + c2(34, zb + 9, 1.1, 'fm'), tr)
    ledTop(b, tr, 38, cy + 9, zb + 11)
    b.anchor('badge', [30, cy, zb + 24])
  },
})

enregistrer({
  id: 'instr.niveau_radar', famille: 'Instrumentation', nom: 'Transmetteur de niveau radar / ultrason (sur bride)',
  taille: () => [34, 34, 66], defauts: { variante: 'radar' }, variantes: ['radar', 'ultrason'], planche: PL,
  dessiner(b: Builder, p: Params) {
    const cx = 17, cy = 17
    b.cylZ(cx, cy, 0, 11, 3, 'mm'); hex(b, cx, cy, 3, 4, 3)
    b.cylZ(cx, cy, 6, 6.4, 6, 'mm', 4)              // antenne
    if (p.variante === 'ultrason') { b.cylZ(cx, cy, 0.1, 8, 4, 'mb') }
    const co = b.cylZ(cx, cy, 12, 8, 14, 'mb'); b.rings(co, [cx, cy, 12], [cx, cy, 26], 8, [0.5])
    const tete = b.cylZ(cx, cy, 26, 9.6, 16, 'mm')
    b.pl('xy', 42.05, c2(cx, cy, 6.6, 'fk') + c2(cx, cy, 6.6, 'ed2') + r2(cx - 4.2, cy - 0.8, 6.4, 1.6, 'fa', 0.4), tete)   // afficheur sur le dessus
    b.cylX(cx + 9.6, cy, 36, 1.8, 4, 'md')
    ledTop(b, tete, cx - 5.5, cy - 5.5, 42.05)
    b.port('proc', [cx, cy, 0], [0, 0, -1], { dn: 4 })
    b.anchor('badge', [cx, cy, 52])
  },
})

enregistrer({
  id: 'instr.poire_niveau', famille: 'Instrumentation', nom: 'Poire de niveau (flotteur)',
  taille: () => [28, 40, 46], defauts: {}, planche: [['arret'], ['marche'], ['alarme'], ['defaut'], ['inconnu']],
  dessiner(b: Builder, p: Params) {
    const cx = 14, cy = 14
    // câble depuis le haut + flotteur en poire (cône + sphère)
    b.cylZ(cx, cy, 30, 1, 14, 'mm')
    b.cylZ(cx, cy, 40, 4, 3, 'mm'); b.cylZ(cx, cy, 43, 2, 3, 'md')
    b.path3([[cx, cy, 30], [cx + 8, cy + 4, 24], [cx + 8, cy + 6, 16]], 'ed3')
    b.ball([cx + 8, cy + 6, 11], 7, 'mm')
    b.cylZ(cx + 8, cy + 6, 14, 2.6, 4, 'ma')
    b.cylZ(cx + 8, cy + 6, 16, 3.2, 1.4, 'mm')
    b.anchor('badge', [cx, cy, 54])
    b.port('proc', [cx, cy, 30], [0, 0, 1], { type: 'signal' })
  },
})

enregistrer({
  id: 'instr.pressostat', famille: 'Instrumentation', nom: 'Pressostat / thermostat à contact', statut: 'revu',
  taille: () => [28, 24, 44], defauts: {}, planche: [['arret'], ['marche'], ['alarme'], ['defaut'], ['consigne', { manuel: true }], ['inconnu']],
  dessiner(b: Builder, p: Params) {
    // boîtier à face plane (plan xz) : molette de consigne + voyant ; raccord process hexagonal dessous, presse-étoupe dessus
    const bx = b.box(4, 4, 8, 20, 16, 22, 'mb')
    hex(b, 14, 12, 0, 4.6, 5); b.cylZ(14, 12, 5, 2.4, 3, 'mm')
    b.pl('xz', 20, c2(11, 17, 4, 'fm') + c2(11, 17, 4, 'ed2') + l2(11, 17, 11, 20.2, 'ed') + c2(19, 24, 1.4, 'led'), bx)
    b.cylZ(14, 12, 30, 2.4, 6, 'mm'); b.cylZ(14, 12, 36, 4, 2.4, 'md')
    ledTop(b, bx, 19, 20, 24)
    b.port('proc', [14, 12, 0], [0, 0, -1], { dn: 2 })
    b.anchor('badge', [14, 12, 48])
  },
})

enregistrer({
  id: 'instr.sonde_ambiance', famille: 'Instrumentation', nom: "Sonde d'ambiance (T / HR / CO₂)",
  taille: () => [30, 10, 34], defauts: { variante: 'th' }, variantes: ['t', 'th', 'co2'], planche: [['arret'], ['marche', { valeur: 21.4 }], ['alarme'], ['defaut'], ['inconnu']],
  dessiner(b: Builder, p: Params) {
    const bx = b.box(3, 0, 2, 24, 8, 30, 'mb')
    b.pl('xz', 8, r2(6, 18, 18, 8, 'fk', 1.2) + r2(8, 20, 8, 1.6, 'fa', .3) + r2(8, 22.6, 12, 1, 'ed2') + [0, 1, 2, 3, 4].map((i) => l2(8 + i * 3, 8, 8 + i * 3, 13, 'ed2')).join('') + c2(21, 5.5, 1.1, 'led'), bx)
    b.led([21, 8, 5.5], bx, 1.2)
    b.anchor('badge', [15, 4, 42])
  },
})

enregistrer({
  id: 'instr.analyseur', famille: 'Instrumentation', nom: 'Analyseur (pH / chlore / CO₂ / turbidité) en armoire murale',
  taille: () => [48, 20, 66], defauts: { variante: 'ph' }, variantes: ['ph', 'chlore', 'co2', 'turbidite'], planche: PL,
  dessiner(b: Builder, p: Params) {
    const bx = b.box(2, 2, 12, 44, 14, 50, 'mb')
    b.pl('xz', 16, r2(6, 40, 36, 16, 'fk', 1.5) + r2(9, 49, 15, 3, 'fa', .5) + r2(9, 44, 24, 1.6, 'ed2') + c2(38, 44, 1.6, 'led') + [0, 1, 2, 3].map((i) => r2(7 + i * 9, 26, 7, 5, 'fm', 1)).join('') + l2(6, 20, 42, 20, 'ed2'), bx)
    b.led([38, 16, 44], bx, 1.4)
    // cellule de mesure : bloc transparent + sondes + arrivées d'échantillon
    const ce = b.box(10, 4, 0, 14, 10, 12, 'mm')
    b.cylZ(30, 9, 0, 2.6, 12, 'mm'); b.cylZ(37, 9, 0, 2.6, 12, 'mm')
    const dotted = b.cylY(17, 14, 6, 1.4, 7, 'md'); void dotted; void ce
    b.port('echantillon', [17, 21, 6], [0, 1, 0], { dn: 1.6, fluide: 'eau' })
    b.anchor('badge', [24, 9, 72])
  },
})

/** Colonne lumineuse (empilement de 3 segments coaxiaux : vert / orange / rouge), sans klaxon. */
function colonne(b: Builder) {
  const cx = 14, cy = 14
  b.cylZ(cx, cy, 0, 7, 3, 'mm'); b.cylZ(cx, cy, 3, 2.4, 6, 'mm')
  const e = b.etat
  const seg = (z: number, lit: boolean, m: string, cls: string) => { const s = b.cylZ(cx, cy, z, 5.6, 7, lit ? m : 'md'); b.pl('xy', z + 7, c2(cx, cy, 3.4, lit ? cls : 'fd'), s); return s }
  seg(9, e === 'marche' || e === 'modulant', 'mg', 'fn')
  seg(16, e === 'alarme', 'mw', 'fo')
  seg(23, e === 'defaut', 'mr', 'fr')
  b.cylZ(cx, cy, 30, 6, 2, 'mm')
  b.anchor('badge', [cx, cy, 40])
}
enregistrer({
  id: 'instr.colonne_lumineuse', famille: 'Instrumentation', nom: 'Colonne lumineuse', statut: 'revu',
  taille: () => [28, 28, 52], defauts: {}, planche: [['arret'], ['marche'], ['alarme'], ['defaut'], ['consigne'], ['inconnu']],
  dessiner: (b: Builder) => colonne(b),
})
// ancien symbole « colonne lumineuse + klaxon » : le klaxon est retiré, l'id est conservé pour les documents existants (rendu = colonne seule)
enregistrer({
  id: 'instr.voyant_klaxon', famille: 'Instrumentation', nom: 'Colonne lumineuse + klaxon (obsolète)', statut: 'obsolete', remplacePar: 'instr.colonne_lumineuse',
  taille: () => [28, 28, 52], defauts: {}, planche: [['arret'], ['marche'], ['alarme'], ['defaut'], ['consigne'], ['inconnu']],
  dessiner: (b: Builder) => colonne(b),
})

/** Indicateur à cadran : UN seul symbole pour le thermomètre et le manomètre (même silhouette), paramètre `grandeur` 'T' | 'P'.
 *  Écrou hexagonal + col + boîtier cylindrique d'axe y ; cadran = disque dans le plan xz (ellipse vraie). Le port « proc » est le plan de joint ;
 *  hors montage seulement, un doigt de gant est dessiné sous le joint pour T. */
const GRANDEURS: Record<string, { fl: string; max: number; defaut: number }> = { T: { fl: 'eau_chaude_aller', max: 120, defaut: 64 }, P: { fl: 'eau_froide', max: 6, defaut: 2.4 } }
function cadranInd(b: Builder, p: Params) {
  const g = GRANDEURS[p.grandeur === 'P' ? 'P' : 'T']
  const cx = 14, cy = 14, R = 11, zc = 30
  if (p.grandeur !== 'P' && !p.dnPx) { b.cylZ(cx, cy, -22, 1.9, 22, 'mm'); b.cylZ(cx, cy, -22, 1.1, 1, 'md') }
  hex(b, cx, cy, 0, 4.4, 4)
  b.cylZ(cx, cy, 4, 2.4, zc - R + 1 - 4, 'md')                    // col
  b.cylY(cx, cy - 3, zc, R, 6, 'mb')                               // boîtier
  const ba = b.cylY(cx, cy + 3, zc, R + 0.9, 2.2, 'mm')            // bague
  const raw = (p.valeur ?? b.val.valeur ?? g.defaut) as number
  const v = Math.max(0, Math.min(1, raw / (p.max ?? (p.grandeur === 'P' && raw > 10 ? 100 : g.max))))
  const a = (225 - 270 * v) * Math.PI / 180                          // 225° (min) → -45° (max)
  let f = c2(cx, zc, R - 1.2, 'ed2')
  for (let i = 0; i <= 8; i++) { const t = (225 - 270 * i / 8) * Math.PI / 180; f += l2(cx + Math.cos(t) * (R - 2.6), zc + Math.sin(t) * (R - 2.6), cx + Math.cos(t) * (R - 1.6), zc + Math.sin(t) * (R - 1.6), 'ed2') }
  const [x1, z1] = [cx + Math.cos(a) * (R - 2.4), zc + Math.sin(a) * (R - 2.4)]
  f += `<g class="fl-${g.fl}">${l2(cx, zc, x1, z1, 'ed')}</g>` + c2(cx, zc, 1, 'fd')
  b.pl('xz', cy + 5.1, f, ba)
  b.port('proc', [cx, cy, 0], [0, 0, -1], { dn: 3 })
  b.anchor('badge', [cx, cy, zc + R + 8])
}
enregistrer({
  id: 'instr.cadran', famille: 'Instrumentation', nom: 'Indicateur à cadran (thermomètre T / manomètre P)', statut: 'revu',
  taille: () => [28, 28, 44], defauts: { fluide: 'eau', grandeur: 'T' }, variantes: ['grandeur=T|P'], planche: PL,
  dessiner: (b: Builder, p: Params) => cadranInd(b, p),
})
// anciens symboles : même rendu que l'indicateur à cadran (T / P), ids conservés pour les documents existants
enregistrer({ id: 'instr.thermometre', famille: 'Instrumentation', nom: 'Thermomètre à cadran (obsolète)', statut: 'obsolete', remplacePar: 'instr.cadran', taille: () => [28, 28, 44], defauts: { fluide: 'eau' }, planche: PL, dessiner: (b: Builder, p: Params) => cadranInd(b, { ...p, grandeur: 'T' }) } as any)
enregistrer({ id: 'instr.manometre', famille: 'Instrumentation', nom: 'Manomètre à cadran (obsolète)', statut: 'obsolete', remplacePar: 'instr.cadran', taille: () => [28, 28, 44], defauts: { fluide: 'eau' }, planche: PL, dessiner: (b: Builder, p: Params) => cadranInd(b, { ...p, grandeur: 'P' }) } as any)

/** Repère de mesure (niveau « indicateur ») : piquage + pastille discrète. La valeur est portée par une étiquette (cf. Scene). */
enregistrer({
  id: 'instr.repere', famille: 'Instrumentation', nom: 'Repère de mesure (pastille sur piquage)',
  taille: () => [14, 14, 16], defauts: { fluide: 'eau' }, planche: PL,
  dessiner(b: Builder, p: Params) {
    const cx = 7, cy = 7
    b.cylZ(cx, cy, 0, 3.2, 2, 'mm')                  // collerette
    b.cylZ(cx, cy, 2, 1.1, 6, 'md')                  // tige courte
    const d = b.cylZ(cx, cy, 8, 3.6, 2.6, 'mb')      // pastille
    b.pl('xy', 10.6, c2(cx, cy, 2.2, 'ed2'), d)
    ledTop(b, d, cx, cy, 10.7)
    b.port('proc', [cx, cy, 0], [0, 0, -1], { dn: 2 })
    b.anchor('badge', [cx, cy, 10.6])
  },
})

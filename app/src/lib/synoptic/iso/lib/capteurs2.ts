/* eslint-disable */
// @ts-nocheck — catalogue de dessin (code massif copié de iso_lib, qui compile sans strictNullChecks) ; voir iso/README.md
// Capteurs complémentaires : transmetteur de pression sur manifold 3 voies, niveau à flotteur en chambre by-pass (indicateur magnétique).
import { enregistrer } from './registre'
import { Builder, c2, r2, l2 } from './iso'
import type { Params, EtatNom } from './types'

const PL: [EtatNom, any?, number?][] = [['arret'], ['marche'], ['alarme'], ['defaut'], ['inconnu']]

enregistrer({
  id: 'instr.pression_manifold', famille: 'Instrumentation', nom: 'Transmetteur de pression sur manifold 3 voies',
  taille: () => [30, 28, 64], defauts: { fluide: 'eau' }, planche: PL,
  dessiner(b: Builder, p: Params) {
    const cx = 15, cy = 14
    b.cylZ(cx, cy, 0, 6, 4, 'mm'); b.cylZ(cx, cy, 4, 3.2, 3, 'mm')
    // bloc manifold : corps, vanne d'isolement, purge, égalisation
    const bl = b.box(cx - 8, cy - 5, 7, 16, 10, 8, 'mm')
    b.pl('xz', cy + 5.05, r2(cx - 6, 9, 12, 4, 'fk', 1) + c2(cx - 3, 11, 1, 'fa') + c2(cx + 3, 11, 1, 'fa'), bl)
    for (const [dx, h] of [[-5, 6], [0, 8], [5, 6]] as const) { b.cylZ(cx + dx, cy, 15, 0.9, h, 'mm'); b.cylZ(cx + dx, cy, 15 + h, 2.4, 1.6, 'md') }
    b.cylY(cx + 9, cy - 1, 11, 1.4, 5, 'mm')
    const co = b.cylZ(cx, cy, 25, 5.6, 16, 'mb'); b.rings(co, [cx, cy, 25], [cx, cy, 41], 5.6, [0.5])
    const tete = b.cylZ(cx, cy, 41, 8, 11, 'mm')
    b.pl('xz', cy + 8.05, r2(cx - 4.5, 44, 9, 5, 'fk', 1) + r2(cx - 3.5, 45.2, 4, 1.2, 'fa', .3), tete)
    b.cylZ(cx, cy, 52, 5.4, 2.6, 'mm'); b.cylZ(cx, cy, 54.6, 1.8, 3.4, 'md')
    b.led([cx + 5.5, cy + 6, 46], tete, 1.5)
    b.port('proc', [cx, cy, 0], [0, 0, -1], { dn: 3 })
    b.anchor('badge', [cx, cy, 63])
  },
})

enregistrer({
  id: 'instr.niveau_flotteur', famille: 'Instrumentation', nom: 'Niveau à flotteur en chambre by-pass (indicateur magnétique)',
  taille: () => [34, 26, 108], defauts: { fluide: 'eau', dn: 2.4 }, variantes: ['2 piquages haut / bas côté -x'], planche: [['arret', { niveau: 30 }], ['marche', { niveau: 60 }], ['alarme', { niveau: 90 }], ['defaut'], ['inconnu']],
  dessiner(b: Builder, p: Params) {
    const cx = 22, cy = 13, r = p.dn ?? 2.4, zh = 92, zb = 14
    const col = b.cylZ(cx, cy, 8, 5.2, 84, 'mm'); b.rings(col, [cx, cy, 8], [cx, cy, 92], 5.2, [0.2, 0.8], 'ed2')
    b.cylZ(cx, cy, 6, 6.4, 2.4, 'mm'); b.cylZ(cx, cy, 92, 6.4, 2.4, 'mm')
    // piquages vers la cuve
    for (const z of [zh, zb]) { b.cylX(0, cy, z, r * 1.2, cx - 5, 'mm'); b.flange([0, cy, z], 'x', r * 1.9, 2.6, 4) }
    b.cylZ(cx, cy, 94.4, 3, 3, 'md'); b.cylZ(cx, cy, 97.4, 5, 8, 'mb')
    b.led([cx + 4, cy - 3, 103], b.cylZ(cx, cy, 105.4, 4.4, 1.4, 'mm'), 1.4)
    // indicateur magnétique : volets blancs / rouges selon le niveau
    const win = b.box(cx + 4.6, cy - 3.4, 12, 1.8, 6.8, 76, 'mm')
    const n = 18, lv = b.niveau / 100
    let s = ''
    for (let i = 0; i < n; i++) { const hi = (i + 0.5) / n <= lv; s += r2(0, 0, 0, 0, 'ed2') && '' + `<rect class="${hi ? 'fo' : 'fw'}" x="${cy - 3}" y="${12 + (i * 76) / n}" width="6" height="${76 / n - 0.7}"/>` }
    b.pl('yz', cx + 6.5, s, win)
    b.port('haut', [0, cy, zh], [-1, 0, 0], { dn: r, fluide: p.fluide })
    b.port('bas', [0, cy, zb], [-1, 0, 0], { dn: r, fluide: p.fluide })
    b.anchor('badge', [cx, cy, 112])
  },
})
void l2

/* eslint-disable */
// @ts-nocheck — catalogue de dessin (code massif copié de iso_lib, qui compile sans strictNullChecks) ; voir iso/README.md
// Composants de raccordement : bout de tuyau bridé (ancre de planche), collecteur à N piquages.
import { enregistrer } from './registre'
import { Builder } from './iso'
import type { Params } from './types'
import type { V3 } from './geom'

const AX: Record<string, V3> = { 'x+': [1, 0, 0], 'x-': [-1, 0, 0], 'y+': [0, 1, 0], 'y-': [0, -1, 0], 'z+': [0, 0, 1], 'z-': [0, 0, -1] }

enregistrer({
  id: 'raccord.bout', famille: 'Raccords', nom: 'Bout de tuyau bridé (ancre)',
  taille: () => [20, 20, 20], defauts: { dn: 5, dir: 'x+', fluide: 'eau', sansMarqueur: true }, variantes: ['dir=x+|x-|y+|y-|z+|z-'],
  planche: [['arret']],
  dessiner(b: Builder, p: Params) {
    const r = p.dn, d = AX[p.dir] ?? AX['x+']
    const c: V3 = [10, 10, 10]
    const a: V3 = [c[0] - d[0] * 8, c[1] - d[1] * 8, c[2] - d[2] * 8]
    const e: V3 = [c[0] + d[0] * 2, c[1] + d[1] * 2, c[2] + d[2] * 2]
    // pas de bride : la bride est dessinée par la liaison (une seule, au bon diamètre)
    b.cyl(a, [c[0] - d[0] * 2, c[1] - d[1] * 2, c[2] - d[2] * 2], r * 0.6, 'mm')
    b.port('p', e, d, { dn: r, fluide: p.fluide })
    b.anchor('haut', [c[0], c[1], c[2] + 6])
  },
})

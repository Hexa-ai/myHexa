/* eslint-disable */
// @ts-nocheck — catalogue de dessin (code massif copié de iso_lib, qui compile sans strictNullChecks) ; voir iso/README.md
// Grosses pompes du domaine de l'eau : horizontale gros DN sur socle béton avec accouplement visible,
// pompe à moteur vertical sur lanterne (axe vertical) sur dalle.
import { enregistrer } from './registre'
import { Builder, c2, r2, l2, d2 } from './iso'
import { moteurX, moteurZ, impeller } from './communs'
import type { Params, EtatNom } from './types'

const ETP: EtatNom[] = ['arret', 'marche', 'defaut', 'alarme', 'inconnu', 'consigne']
const dn = (p: Params) => p.dn ?? 10
const NB = (r: number) => (r < 4.4 ? 4 : r < 8 ? 6 : r < 12 ? 8 : 12)
const fleche = (x: number, z: number, s = 1) => `<g transform="translate(${x} ${z}) scale(${s})">${d2('M-6 -1.6H0V-4L6 0L0 4V1.6H-6Z', 'fa')}</g>`

enregistrer({
  id: 'pompe.centrifuge_gros', famille: 'Pompes', nom: 'Pompe centrifuge horizontale gros DN (socle béton, accouplement visible)',
  taille: () => [200, 84, 112], defauts: { fluide: 'eau', dn: 11 }, etats: ETP,
  dessiner(b: Builder, p: Params) {
    const r = dn(p), W = 200, D = 84, cy = D / 2, zc = 34
    b.box(0, 0, 0, W, D, 8, 'mc')
    b.box(8, 8, 8, W - 16, D - 16, 5, 'mm')
    for (const [x, y] of [[14, 14], [W - 14, 14], [14, D - 14], [W - 14, D - 14]]) b.cylZ(x, y, 13, 2.4, 3, 'md')
    // pieds de volute
    b.box(46, cy - 14, 13, 40, 28, 7, 'mm')
    // tuyère d'aspiration axiale + bride
    const t = 3.5 + r * 0.15
    b.cylX(t, cy, zc, r * 1.25, 34, 'mm')
    b.flange([0, cy, zc], 'x', r * 1.95, t, NB(r))
    // volute
    const vol = b.cylX(36, cy, zc, 26, 30, 'mm')
    b.rings(vol, [36, cy, zc], [66, cy, zc], 26, [0.5])
    b.pl('yz', 36, c2(cy, zc, 20, 'ed2') + c2(cy, zc, 8, 'ed2'), vol)
    // refoulement vertical
    b.cylZ(58, cy, zc + 24, r * 1.25, 18, 'mm')
    b.flange([58, cy, zc + 42], 'z', r * 1.95, t, NB(r))
    b.pl('xz', cy + 26.1, fleche(52, zc - 3, 1.1), vol)
    // corps de palier + accouplement sous garde
    b.cylX(66, cy, zc, 11, 16, 'mm')
    const gard = b.cylX(82, cy, zc, 17, 26, 'mm')
    b.rings(gard, [82, cy, zc], [108, cy, zc], 17, [0.5], 'ed2')
    b.pl('xz', cy + 17.1, r2(86, zc - 9, 18, 18, 'fk', 2) + l2(89, zc - 3, 103, zc - 3, 'ed') + l2(89, zc + 3, 103, zc + 3, 'ed') + l2(95.5, zc - 9, 95.5, zc + 9, 'ed2'), gard)
    b.box(78, cy - 15, 13, 34, 30, 3, 'mm')
    // moteur
    moteurX(b, 108, cy, zc, 26, 76, { accent: true })
    b.port('asp', [0, cy, zc], [-1, 0, 0], { dn: r, fluide: p.fluide })
    b.port('ref', [58, cy, zc + 45.5], [0, 0, 1], { dn: r, fluide: p.fluide })
    b.anchor('badge', [150, cy, zc + 44]); b.anchor('haut', [58, cy, zc + 52])
  },
})

enregistrer({
  id: 'pompe.axe_vertical', famille: 'Pompes', nom: 'Pompe à axe vertical (moteur sur lanterne au-dessus de la volute, dalle)',
  taille: () => [118, 96, 168], defauts: { fluide: 'eau', dn: 10 }, etats: ETP,
  dessiner(b: Builder, p: Params) {
    const r = dn(p), W = 118, D = 96, cx = 52, cy = D / 2, zc = 28
    b.box(0, 0, 0, W, D, 6, 'mc')
    for (const [x, y] of [[8, 8], [W - 8, 8], [8, D - 8], [W - 8, D - 8]]) b.cylZ(x, y, 6, 2.2, 3, 'md')
    // socle + volute
    b.cylZ(cx, cy, 6, 24, 8, 'mm')
    const vol = b.cylZ(cx, cy, 14, 27, 28, 'mm')
    b.rings(vol, [cx, cy, 14], [cx, cy, 42], 27, [0.5])
    // aspiration vers -x, refoulement vers +x (axes à la même hauteur)
    const t = 3.5 + r * 0.15
    b.cylX(t, cy, zc, r * 1.25, cx - t - 14, 'mm')
    b.flange([0, cy, zc], 'x', r * 1.95, t, NB(r))
    b.cylX(cx + 20, cy, zc, r * 1.25, W - cx - 20 - t, 'mm')
    b.flange([W - t, cy, zc], 'x', r * 1.95, t, NB(r))
    b.pl('xz', cy + 27.1, fleche(cx, zc, 1.1), vol)
    // lanterne à fenêtres + accouplement
    b.cylZ(cx, cy, 42, 20, 3, 'mm')
    const lan = b.cylZ(cx, cy, 45, 14, 24, 'mm')
    b.rings(lan, [cx, cy, 45], [cx, cy, 69], 14, [0.5], 'ed2')
    b.pl('xz', cy + 14.1, r2(cx - 6, 52, 12, 11, 'fk', 1.5) + l2(cx - 6, 57.5, cx + 6, 57.5, 'ed2'), lan)
    b.cylZ(cx, cy, 69, 22, 4, 'mm')
    // moteur vertical
    const top = moteurZ(b, cx, cy, 73, 21, 62)
    b.port('asp', [0, cy, zc], [-1, 0, 0], { dn: r, fluide: p.fluide })
    b.port('ref', [W, cy, zc], [1, 0, 0], { dn: r, fluide: p.fluide })
    b.anchor('badge', [cx, cy, top + 6]); b.anchor('haut', [cx, cy, top + 14])
  },
})
void impeller

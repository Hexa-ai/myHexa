/* eslint-disable */
// @ts-nocheck — catalogue de dessin (code massif copié de iso_lib, qui compile sans strictNullChecks) ; voir iso/README.md
// Électrique & éléments de scène.
import { enregistrer } from './registre'
import { Builder, c2, r2, l2, d2 } from './iso'
import { moteurX, grille, helice } from './communs'
import type { Params, EtatNom, Valeurs } from './types'

const PL: [EtatNom, Valeurs?, number?][] = [['arret'], ['marche'], ['defaut'], ['alarme'], ['consigne', { manuel: true }], ['inconnu'], ['marche', {}, 90], ['arret', {}, 90]]
const PLF: [EtatNom, Valeurs?, number?][] = [['ferme'], ['ouvert'], ['defaut'], ['alarme'], ['consigne', { manuel: true }], ['inconnu'], ['ferme', {}, 90]]

/** porte d'armoire : cadre, serrure quart de tour, grille d'aération */
function porte(b: Builder, cs: any, W: number, H: number, z0: number, y: number) {
  b.pl('xz', y, r2(3, z0 + 3, W - 6, H - 6, 'ed', 1) + r2(W - 9, z0 + H / 2 - 4, 3, 8, 'fm', 1) + c2(W - 7.5, z0 + H / 2, 1, 'fd'), cs)
}

enregistrer({
  id: 'elec.armoire', famille: 'Électrique', nom: 'Armoire électrique (porte, voyants, serrure)',
  statut: 'obsolete', remplacePar: 'armoire.a1p',
  taille: () => [60, 34, 100], defauts: { variante: 'simple' }, variantes: ['simple', 'double'], planche: PL,
  dessiner(b: Builder, p: Params) {
    const W = 60, D = 34, H = 94
    b.box(0, 1, 0, W, D - 2, 6, 'mm')
    const cs = b.box(1, 1, 6, W - 2, D - 2, H, 'mb')
    porte(b, cs, W, H, 6, D - 1 + 0.05)
    // voyants + afficheur en façade
    b.pl('xz', D - 0.9, r2(10, 70, 24, 12, 'fk', 1.5) + r2(12, 76, 11, 2.4, 'fa', .4) + r2(12, 72, 18, 1.2, 'ed2') + c2(42, 76, 2, 'led') + c2(48, 76, 2, 'fm') + c2(42, 68, 2, 'fm') + c2(48, 68, 2, 'fm') + l2(8, 58, W - 14, 58, 'ed2') + [0, 1, 2].map((i) => r2(10 + i * 14, 44, 10, 8, 'fm', 1)).join(''), cs)
    b.led([42, D - 0.9, 76], cs, 1.8)
    // grille d'aération sur +x, passe-câbles en toiture
    b.pl('yz', W - 1, [0, 1, 2, 3, 4].map((i) => l2(8, 14 + i * 3.4, D - 10, 14 + i * 3.4, 'ed2')).join(''), cs)
    b.box(4, 4, 6 + H, 52, 26, 2.4, 'mm')
    b.cylZ(14, 17, 6 + H, 2.4, 5, 'md'); b.cylZ(22, 17, 6 + H, 2.4, 5, 'md')
    b.port('cable', [18, 17, 6 + H + 5], [0, 0, 1], { type: 'elec' })
    b.anchor('badge', [W / 2, D / 2, 118])
  },
})
enregistrer({
  id: 'elec.tgbt', famille: 'Électrique', nom: 'TGBT (colonnes, disjoncteur général, jeu de barres)',
  statut: 'obsolete', remplacePar: 'armoire.tgbt',
  taille: (p) => [(p.n ?? 3) * 44 + 4, 40, 110], defauts: { n: 3 }, planche: PL.slice(0, 6),
  dessiner(b: Builder, p: Params) {
    const n = p.n, W = n * 44 + 4, D = 40, H = 100
    b.box(0, 2, 0, W, D - 4, 6, 'mm')
    const cs = b.box(1, 2, 6, W - 2, D - 4, H, 'mb')
    let s = r2(2, 9, W - 4, H - 4, 'ed')
    for (let i = 1; i < n; i++) s += l2(2 + i * 44, 8, 2 + i * 44, 6 + H - 2, 'ed')
    for (let i = 0; i < n; i++) {
      const x = 6 + i * 44
      s += r2(x, 78, 34, 20, 'fk', 1.5) + r2(x + 2, 90, 14, 3, 'fa', .5) + r2(x + 2, 84, 22, 1.4, 'ed2') + c2(x + 28, 92, 1.8, 'led')
      for (let j = 0; j < 4; j++) s += r2(x + 2 + j * 8, 58, 6, 14, 'fm', 1) + l2(x + 5 + j * 8, 62, x + 5 + j * 8, 69, 'ed2')
      for (let j = 0; j < 4; j++) s += r2(x + 2 + j * 8, 36, 6, 14, 'fm', 1)
      s += r2(x, 14, 34, 16, 'ed2') + [0, 1, 2, 3, 4, 5].map((k) => l2(x + 3, 17 + k * 2.3, x + 31, 17 + k * 2.3, 'ed2')).join('')
    }
    b.pl('xz', D - 2 + 0.05, s, cs)
    b.led([6 + 28, D - 2, 98], cs, 1.8)
    b.pl('yz', W - 1, [0, 1, 2, 3, 4, 5].map((i) => l2(8, 20 + i * 3.4, D - 12, 20 + i * 3.4, 'ed2')).join(''), cs)
    b.box(8, 8, 106, W - 16, 20, 4, 'mm')
    b.port('arrivee', [W / 2, 18, 110], [0, 0, 1], { type: 'elec' })
    b.anchor('badge', [W / 2, D / 2, 128])
  },
})
enregistrer({
  id: 'elec.variateur', famille: 'Électrique', nom: 'Variateur de fréquence (radiateur, console)',
  statut: 'obsolete',
  taille: () => [34, 26, 56], defauts: {}, planche: PL,
  dessiner(b: Builder, p: Params) {
    const bx = b.box(2, 2, 2, 30, 14, 50, 'mb')
    b.pl('xz', 16, r2(4, 34, 26, 14, 'fk', 1.5) + r2(6, 41, 12, 2.6, 'fa', .5) + r2(6, 37, 18, 1.2, 'ed2') + [0, 1, 2, 3].map((i) => c2(8 + i * 6, 28, 1.7, i === 0 ? 'led' : 'fm')).join('') + l2(4, 22, 30, 22, 'ed2') + [0, 1, 2, 3, 4].map((i) => r2(6 + i * 5, 6, 3, 12, 'fm', 0.6)).join(''), bx)
    b.led([8, 16, 28], bx, 1.4)
    // ailettes de radiateur à l'arrière-haut + boîtier bornier
    b.box(4, 16, 36, 26, 8, 14, 'mm')
    for (let i = 0; i < 5; i++) b.box(6 + i * 5, 24, 36, 1.6, 4, 14, 'mm')
    b.port('cable', [17, 9, 54], [0, 0, 1], { type: 'elec' })
    b.anchor('badge', [17, 9, 66])
  },
})
enregistrer({
  id: 'elec.transformateur', famille: 'Électrique', nom: 'Transformateur (cuve à ailettes, 6 isolateurs)',
  statut: 'revu',
  taille: () => [74, 50, 78], defauts: {}, planche: PL.slice(0, 6),
  dessiner(b: Builder, p: Params) {
    b.box(4, 4, 0, 66, 42, 6, 'mm')
    const cs = b.box(10, 10, 6, 54, 30, 40, 'mb'); b.rings(cs, [10, 10, 6], [10, 10, 46], 1, [])
    // ailettes de refroidissement (radiateurs) sur +y et +x
    for (let i = 0; i < 9; i++) b.box(12 + i * 5.6, 40, 8, 2, 7, 34, 'mm')
    for (let i = 0; i < 5; i++) b.box(64, 12 + i * 5.6, 8, 7, 2, 34, 'mm')
    b.box(8, 8, 46, 58, 34, 3, 'mm')
    // isolateurs : 3 HT (hauts) + 3 BT
    for (let i = 0; i < 3; i++) { const x = 20 + i * 14; const c = b.cylZ(x, 20, 49, 3, 14, 'md'); b.rings(c, [x, 20, 49], [x, 20, 63], 3, [0.25, 0.5, 0.75]); b.cylZ(x, 20, 63, 1.4, 5, 'mm') }
    for (let i = 0; i < 3; i++) { const x = 20 + i * 14; b.cylZ(x, 32, 49, 2, 8, 'mm'); b.cylZ(x, 32, 57, 2.8, 2, 'md') }
    b.pl('xz', 40.05, r2(14, 18, 14, 8, 'fk', 1) + c2(34, 22, 3, 'fw') + c2(44, 22, 1.6, 'led'), undefined, [14, 18, 44, 26], 'mb')
    b.port('ht', [34, 20, 68], [0, 0, 1], { type: 'elec' })
    b.anchor('badge', [37, 25, 84])
  },
})
enregistrer({
  id: 'elec.disjoncteur', famille: 'Électrique', nom: 'Disjoncteur modulaire / de puissance (ouvert / fermé)',
  taille: () => [30, 22, 34], defauts: { variante: 'modulaire' }, variantes: ['modulaire', 'puissance'], planche: PLF,
  dessiner(b: Builder, p: Params) {
    const on = b.etat === 'ferme' || b.etat === 'marche' || b.etat === 'ouvert' ? b.etat !== 'ouvert' ? true : false : true
    const clos = b.etat !== 'ouvert'
    const bx = b.box(2, 2, 0, 26, 14, 30, 'mb')
    b.pl('xz', 16, r2(4, 4, 22, 24, 'ed2', 1) + r2(9, 14, 12, 12, 'fk', 1.5) + `<path class="${clos ? 'fn' : 'fr'}" d="M${clos ? 9.6 : 9.6} ${clos ? 20.6 : 14.6}h10.8v5.2h-10.8Z"/>` + r2(5, 5, 20, 5, 'fm', 1) + l2(8, 7.5, 22, 7.5, 'ed2') + c2(24, 24, 1.1, 'led'), bx)
    b.led([24, 16, 24], bx, 1.1)
    // bornes + rail DIN
    for (const x of [6, 14, 22]) { b.cylZ(x, 8, 30, 1.8, 2.4, 'md'); b.cylZ(x, 8, -2.4, 1.8, 2.4, 'md') }
    b.box(0, 5, -3, 30, 8, 0.1, 'mm')
    b.anchor('badge', [15, 8, 42]); void on
  },
})
enregistrer({
  id: 'elec.groupe_electrogene', famille: 'Électrique', nom: 'Groupe électrogène (capot insonorisé, échappement)',
  statut: 'obsolete', remplacePar: 'energie.groupe_electrogene',
  taille: () => [130, 56, 80], defauts: {}, planche: PL,
  dessiner(b: Builder, p: Params) {
    b.box(2, 2, 0, 126, 52, 8, 'mm')
    const cs = b.box(4, 4, 8, 122, 48, 56, 'mb')
    b.pl('xz', 52, r2(6, 12, 118, 50, 'ed') + l2(46, 12, 46, 62, 'ed') + l2(90, 12, 90, 62, 'ed') + r2(8, 24, 36, 28, 'in') + [0, 1, 2, 3, 4, 5].map((i) => l2(10, 28 + i * 4, 42, 28 + i * 4, 'ed2')).join('') + r2(94, 40, 26, 14, 'fk', 1.5) + r2(96, 49, 12, 2.4, 'fa', .5) + c2(114, 44, 1.6, 'led') + c2(108, 44, 1.6, 'fm') + r2(48, 18, 8, 4, 'fm', 1), cs)
    b.led([114, 52.05, 44], cs, 1.6)
    // radiateur + ventilateur (côté +x), échappement et silencieux sur le toit
    b.pl('yz', 126, r2(6, 12, 40, 44, 'in') + [0, 1, 2, 3, 4, 5, 6, 7].map((i) => l2(8, 16 + i * 5, 44, 16 + i * 5, 'ed2')).join(''), cs)
    const si = b.cylX(18, 28, 64, 8, 36, 'mm'); b.rings(si, [18, 28, 64], [54, 28, 64], 8, [0.2, 0.8])
    b.cylZ(28, 28, 64 - 0.0, 3, 0.1, 'mm')
    b.cylZ(104, 28, 64, 3.2, 12, 'mm'); b.cylZ(104, 28, 76, 4.6, 2.4, 'md')
    b.path3([[54, 28, 64], [90, 28, 64], [104, 28, 72]], 'ed3')
    b.port('cable', [8, 28, 8], [-1, 0, 0], { type: 'elec' })
    b.anchor('badge', [65, 28, 90])
  },
})
enregistrer({
  id: 'elec.panneau_pv', famille: 'Électrique', nom: 'Panneau photovoltaïque (cellules, cadre, structure inclinée)',
  statut: 'obsolete', remplacePar: 'energie.pv_sol',
  taille: (p) => [(p.n ?? 3) * 36 + 10, 60, 58], defauts: { n: 3 }, planche: [['arret'], ['marche', { valeur: 4.2 }], ['defaut'], ['alarme'], ['consigne'], ['inconnu']],
  dessiner(b: Builder, p: Params) {
    const n = p.n, W = n * 36 + 6, yb = 6, yh = 56, zb = 8, zh = 44
    for (const x of [8, W - 8]) { b.cylZ(x, yh - 8, 0, 1.6, zb + 4, 'mm'); b.cylZ(x, yb + 6, 0, 1.6, zh - 3, 'mm'); b.box(x - 4, yh - 11, 0, 8, 6, 1.6, 'mm'); b.box(x - 4, yb + 3, 0, 8, 6, 1.6, 'mm') }
    // module incliné : bord bas (y petit, z bas) → bord haut (y grand, z haut)
    for (let i = 0; i < n; i++) {
      const x0 = 3 + i * 36, x1 = x0 + 34
      b.poly([[x0, yb, zh], [x1, yb, zh], [x1, yh, zb], [x0, yh, zb]], 'l', 'mb')
      const g = (x: number, t: number): [number, number, number] => [x, yb + (yh - yb) * t, zh - (zh - zb) * t]
      let q = ''
      for (let c = 1; c < 6; c++) q += `<path class="ed2" d="M${P(b, g(x0 + (34 * c) / 6, 0.03))}L${P(b, g(x0 + (34 * c) / 6, 0.97))}"/>`
      for (let r = 1; r < 10; r++) q += `<path class="ed2" d="M${P(b, g(x0 + 1, r / 10))}L${P(b, g(x1 - 1, r / 10))}"/>`
      q += `<path class="ed" d="M${P(b, g(x0, 0))}L${P(b, g(x1, 0))}L${P(b, g(x1, 1))}L${P(b, g(x0, 1))}Z"/>`
      b.on(b.parts[b.parts.length - 1], q)
    }
    b.anchor('badge', [W / 2, 30, 66]); b.anchor('haut', [W / 2, yh, zh])
    b.port('cable', [W - 8, yh - 6, 4], [0, 0, -1], { type: 'elec' })
  },
})
import { proj, f } from './geom'
const P = (b: Builder, q: [number, number, number]) => { const a = proj(b.w(q)); return `${f(a[0])} ${f(a[1])}` }

enregistrer({
  id: 'elec.borne_irve', famille: 'Électrique', nom: 'Borne de recharge IRVE',
  statut: 'obsolete', remplacePar: 'energie.borne_irve',
  taille: () => [34, 30, 84], defauts: {}, planche: [['arret'], ['marche'], ['defaut'], ['alarme'], ['consigne', { manuel: true }], ['inconnu']],
  dessiner(b: Builder, p: Params) {
    b.box(2, 4, 0, 30, 22, 3, 'mc')
    const co = b.box(9, 8, 3, 16, 14, 66, 'mb')
    b.pl('xz', 22, r2(11, 46, 12, 14, 'fk', 1.5) + r2(12.6, 55, 5, 2.4, 'fa', .5) + r2(12.6, 51, 8, 1, 'ed2') + c2(18, 40, 2.4, 'fm') + c2(18, 34, 3.6, 'ed') + r2(12, 12, 10, 14, 'ed2', 1) + l2(11, 30, 23, 30, 'ed2'), co)
    b.led([21, 22, 57], co, 1.6)
    b.box(8, 7, 69, 18, 16, 4, 'mm')
    b.path3([[25, 14, 34], [30, 14, 34], [30, 14, 20], [26, 14, 20]], 'ed3')
    b.cylX(25, 14, 20, 1.6, 4, 'mm')
    b.port('cable', [17, 15, 3], [0, 0, -1], { type: 'elec' })
    b.anchor('badge', [17, 15, 90])
  },
})
enregistrer({
  id: 'elec.box_hai', famille: 'Électrique', nom: 'Box HAI-P200 4G (boîtier rail DIN + antenne)',
  statut: 'obsolete', remplacePar: 'reseau.box_hai_p200',
  taille: () => [40, 30, 66], defauts: {}, planche: [['arret'], ['marche'], ['defaut'], ['alarme'], ['inconnu'], ['marche', {}, 90]],
  dessiner(b: Builder, p: Params) {
    b.box(0, 6, 0, 40, 18, 2, 'mm')                    // rail DIN
    const bx = b.box(4, 4, 2, 32, 22, 28, 'mb')
    b.pl('xz', 26, r2(6, 18, 28, 8, 'fk', 1.5) + c2(10, 22, 1.6, 'led') + c2(16, 22, 1.6, 'fm') + c2(22, 22, 1.6, 'fm') + r2(6, 6, 28, 6, 'fm', 1) + [0, 1, 2, 3, 4, 5, 6].map((i) => c2(9 + i * 4, 9, 1, 'fd')).join('') + l2(6, 14.4, 34, 14.4, 'ed2') + `<g transform="translate(30 22)"><path class="fa" d="M-2 -1.6h4v1.2h-4z"/></g>`, bx)
    b.led([10, 26, 22], bx, 1.6)
    b.pl('xz', 26, `<text x="7" y="15.6" class="cap" style="font-size:3.2px">HAI-P200 4G</text>`, bx)
    // antenne SMA + fouet
    b.cylZ(28, 15, 30, 2, 6, 'mm'); b.cylZ(28, 15, 36, 1.5, 22, 'mb'); b.cylZ(28, 15, 58, 1.7, 2.6, 'ma')
    b.cylZ(28, 15, 59.6, 0.1, 0.1, 'mm')
    b.anchor('badge', [20, 15, 72])
    b.port('rs485', [4, 15, 14], [-1, 0, 0], { type: 'signal' })
  },
})

// ═════ ÉLÉMENTS DE SCÈNE
enregistrer({
  id: 'scene.dalle', famille: 'Scène', nom: 'Dalle / socle béton',
  taille: (p) => [p.l ?? 200, p.w ?? 140, p.h ?? 6], defauts: { l: 200, w: 140, h: 6 }, planche: [['arret']],
  dessiner(b: Builder, p: Params) {
    const s = b.box(0, 0, 0, p.l, p.w, p.h, 'mc')
    let q = ''
    for (let x = 40; x < p.l; x += 40) q += l2(x, 0, x, p.w, 'ed2')
    b.pl('xy', p.h, q, s)
    for (let x = 40; x < p.l; x += 40) b.pl('xz', p.w, l2(x, 0, x, p.h, 'ed2'), s)
  },
})
enregistrer({
  id: 'scene.mur', famille: 'Scène', nom: 'Mur / limite de zone (avec porte option)',
  taille: (p) => [p.l ?? 200, p.e ?? 6, p.h ?? 70], defauts: { l: 200, e: 6, h: 70, porte: false }, planche: [['arret']],
  dessiner(b: Builder, p: Params) {
    const s = b.box(0, 0, 0, p.l, p.e, p.h, 'mc')
    let q = ''
    for (let z = 14; z < p.h; z += 14) q += l2(0, z, p.l, z, 'ed2')
    b.pl('xz', p.e, q, s)
    if (p.porte) b.pl('xz', p.e + 0.1, r2(p.l * 0.5 - 14, 0, 28, 52, 'in') + r2(p.l * 0.5 - 14, 0, 28, 52, 'ed'), s)
  },
})
enregistrer({
  id: 'scene.passerelle', famille: 'Scène', nom: 'Passerelle caillebotis + garde-corps',
  taille: (p) => [p.l ?? 160, p.w ?? 24, 40], defauts: { l: 160, w: 24, h: 30 }, planche: [['arret']],
  dessiner(b: Builder, p: Params) {
    const { l, w, h } = p
    for (const x of [4, l - 4]) for (const y of [2, w - 2]) b.cylZ(x, y, 0, 1.6, h, 'mm')
    const gr = b.box(0, 0, h, l, w, 2.4, 'mm')
    let q = ''
    for (let x = 4; x < l; x += 4) q += l2(x, 1, x, w - 1, 'ed2')
    b.pl('xy', h + 2.4, q, gr)
    const n = Math.round(l / 32)
    for (let i = 0; i <= n; i++) { b.cylZ((l * i) / n, w - 1, h + 2.4, 0.9, 14, 'mm') }
    b.path3([[0, w - 1, h + 16.4], [l, w - 1, h + 16.4]], 'ed'); b.path3([[0, w - 1, h + 9], [l, w - 1, h + 9]], 'ed2')
    b.port('a', [0, w / 2, h + 2.4], [-1, 0, 0], { type: 'signal' }); b.port('b', [l, w / 2, h + 2.4], [1, 0, 0], { type: 'signal' })
  },
})

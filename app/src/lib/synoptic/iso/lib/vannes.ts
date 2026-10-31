/* eslint-disable */
// @ts-nocheck — catalogue de dessin (code massif copié de iso_lib, qui compile sans strictNullChecks) ; voir iso/README.md
// Vannes et appareils de robinetterie (montés sur tube, axe x ; axe du tube à y=24, z=14)
import { enregistrer } from './registre'
import { Builder, c2, r2, l2, p2, d2 } from './iso'
import { inline } from './communs'
import type { Params, EtatNom, Valeurs } from './types'

const CY = 24, ZC = 14
const dn = (p: Params) => p.dn ?? 5
const PL: [EtatNom, Valeurs?, number?][] = [['ferme'], ['ouvert'], ['modulant', { position: 30 }], ['modulant', { position: 75 }], ['defaut'], ['consigne', { manuel: true }], ['inconnu'], ['ouvert', {}, 90]]
const PLTOR: [EtatNom, Valeurs?, number?][] = [['ferme'], ['ouvert'], ['defaut'], ['alarme'], ['consigne', { manuel: true }], ['inconnu'], ['ouvert', {}, 90], ['ferme', {}, 90]]

/** cadran à aiguille (plan vertical), centré (0,0) ; pos 0..100 → aiguille de 180° à 90° */
const cadran = (pos: number, r = 5.5): string => {
  const a = ((180 - pos * 0.9) * Math.PI) / 180
  let s = c2(0, 0, r, 'fb')
  for (const t of [0, 0.5, 1]) { const q = ((180 - t * 90) * Math.PI) / 180; s += l2(Math.cos(q) * r * 0.7, Math.sin(q) * r * 0.7, Math.cos(q) * r * 0.95, Math.sin(q) * r * 0.95, 'ed') }
  return s + `<path class="sig" d="M0 0L${(Math.cos(a) * r * 0.85).toFixed(2)} ${(Math.sin(a) * r * 0.85).toFixed(2)}"/>` + c2(0, 0, 1.1, 'fk')
}
/** indicateur de position à plat : trait le long du tube (ouvert) ou en travers (fermé) */
const indic = (pos: number, len = 8): string => {
  const a = 90 - pos * 0.9   // 0% → travers (90°), 100% → le long (0°)
  return `<g transform="rotate(${a.toFixed(1)})"><path class="stk" d="M${-len} 0H${len}"/></g>`
}
const flechePlan = (x: number, z: number, s = 1) => `<g transform="translate(${x} ${z}) scale(${s})">${d2('M-6 -1.6H0V-4L6 0L0 4V1.6H-6Z', 'fa')}</g>`

enregistrer({
  id: 'vanne.boisseau_pneu', famille: 'Vannes', nom: 'Vanne TOR à boisseau + actionneur pneumatique',
  taille: () => [64, 48, 62], defauts: { fluide: 'eau' }, planche: PLTOR,
  dessiner(b: Builder, p: Params) {
    const r = dn(p)
    inline(b, 64, CY, ZC, r)
    // corps de boisseau : cylindre coaxial au tube (jamais une sphère), bague centrale
    const bo = b.cylX(18, CY, ZC, 11, 28, 'mm'); b.rings(bo, [18, CY, ZC], [46, CY, ZC], 11, [0.5], 'ed2')
    b.cylZ(32, CY, ZC + 9, 3.5, 8, 'mm')
    b.box(24, CY - 8, ZC + 15, 16, 16, 3, 'mm')
    b.box(26, CY - 6, ZC + 18, 12, 12, 7, 'mm')
    const ac = b.cylY(32, CY - 18, ZC + 29, 8, 36, 'mb')
    b.cylY(32, CY - 21, ZC + 29, 8.6, 3, 'mm'); b.cylY(32, CY + 18, ZC + 29, 8.6, 3, 'mm')
    b.rings(ac, [32, CY - 18, ZC + 29], [32, CY + 18, ZC + 29], 8, [0.5])
    b.pl('xz', CY + 21.05, c2(32, ZC + 29, 2.4, 'fd'), ac)
    // indicateur visuel
    const ind = b.cylZ(32, CY, ZC + 36.5, 4.6, 3, 'md')
    b.pl('xy', ZC + 39.6, `<g transform="translate(32 ${CY})">${indic(b.pos)}</g>`, ind)
    // électrovanne pilote + raccords d'air
    const ev = b.box(41, CY - 5, ZC + 18, 10, 10, 8, 'mm')
    const bob = b.cylZ(46, CY, ZC + 26, 3.8, 6, 'md')
    b.led([46, CY, ZC + 32], bob, 1.6)
    b.path3([[40, CY - 9, ZC + 31], [47, CY - 9, ZC + 31], [47, CY - 9, ZC + 26]], 'ed2')
    void ev; void bo
    b.anchor('badge', [32, CY, ZC + 46])
  },
})

enregistrer({
  id: 'vanne.papillon_motor', famille: 'Vannes', nom: 'Vanne papillon motorisée',
  taille: () => [34, 50, 54], defauts: { fluide: 'eau' }, planche: PL,
  dessiner(b: Builder, p: Params) {
    const r = dn(p)
    const W = 34
    b.flange([0, CY, ZC], 'x', r * 1.9, 3, 8); b.flange([W - 3, CY, ZC], 'x', r * 1.9, 3, 8)
    const co = b.cylX(3, CY, ZC, r * 2.1, W - 6, 'mm')
    b.rings(co, [3, CY, ZC], [W - 3, CY, ZC], r * 2.1, [0.22, 0.78], 'ed2')
    b.cylZ(17, CY, ZC + 9, 4, 7, 'mm')
    b.box(11, CY - 6, ZC + 15, 12, 12, 3, 'mm')
    const gb = b.box(8, CY - 9, ZC + 18, 18, 18, 14, 'mb')
    b.pl('yz', 26, `<g transform="translate(${CY} ${ZC + 26})">${cadran(b.pos)}</g>`, gb)
    b.led([14, CY + 9, ZC + 29], gb, 1.8)
    // moteur électrique sur le côté +y + volant de secours
    const mo = b.cylY(17, CY + 9, ZC + 25, 6, 15, 'md')
    b.rings(mo, [17, CY + 9, ZC + 25], [17, CY + 24, ZC + 25], 6, [0.33, 0.66])
    b.cylY(17, CY + 24, ZC + 25, 4.5, 2, 'mm')
    const hw = b.cylZ(17, CY, ZC + 32, 2, 4, 'mm')
    b.pl('xy', ZC + 38.6, `<g transform="translate(17 ${CY})">${c2(0, 0, 8.5, 'sig')}${l2(-8.5, 0, 8.5, 0, 'ed2')}${l2(0, -8.5, 0, 8.5, 'ed2')}${c2(0, 0, 2.2, 'fd')}</g>`, hw)
    b.port('a', [0, CY, ZC], [-1, 0, 0], { dn: r })
    b.port('b', [W, CY, ZC], [1, 0, 0], { dn: r })
    b.anchor('badge', [17, CY, ZC + 42])
  },
})

enregistrer({
  id: 'vanne.regulation', famille: 'Vannes', nom: 'Vanne de régulation à soupape + positionneur',
  taille: () => [56, 48, 78], defauts: { fluide: 'eau' }, planche: PL,
  dessiner(b: Builder, p: Params) {
    const r = dn(p)
    inline(b, 56, CY, ZC, r)
    const cs = b.cylX(16, CY, ZC, 11.5, 24, 'mm'); b.rings(cs, [16, CY, ZC], [40, CY, ZC], 11.5, [0.5], 'ed2')   // corps de soupape coaxial
    b.cylZ(28, CY, ZC + 9, 7, 6, 'mm')
    b.cylZ(28, CY, ZC + 14, 9.4, 2.6, 'mm')
    // arcade : 2 colonnes + plaque haute
    b.cylZ(21.5, CY, ZC + 16, 1.8, 24, 'mm'); b.cylZ(34.5, CY, ZC + 16, 1.8, 24, 'mm')
    const st = b.cylZ(28, CY, ZC + 16, 1.3, 24, 'mm')
    // repère de course (collier accent) ; course 0..100 → 16 unités
    const zc = ZC + 18 + (b.pos / 100) * 14
    b.box(24.4, CY - 2.8, zc, 7.2, 5.6, 2.4, 'ma')
    b.line([21.5, CY + 2, ZC + 18], [21.5, CY + 2, ZC + 34], 'ed2', st)
    // actionneur à membrane
    b.cylZ(28, CY, ZC + 40, 14.5, 4, 'mm')
    b.cylZ(28, CY, ZC + 44, 14.5, 9, 'mb', 10)
    b.cylZ(28, CY, ZC + 53, 10, 2.6, 'mm')
    b.cylZ(28, CY, ZC + 55.6, 2.2, 4, 'mm')
    // positionneur
    const po = b.box(38, CY - 5, ZC + 20, 11, 10, 14, 'mb')
    b.pl('xz', CY + 5, r2(39, ZC + 27, 9, 5, 'fk', 0.8) + r2(39.8, ZC + 28.6, 7.4 * (b.pos / 100), 1.8, 'fa', 0.3) + c2(44.6, ZC + 23, 1.2, 'fm'), po)
    b.led([48, CY, ZC + 34], po, 1.6)
    b.path3([[43.5, CY - 4, ZC + 34], [43.5, CY - 4, ZC + 38], [40, CY - 4, ZC + 38], [40, CY - 12, ZC + 41], [28, CY - 14, ZC + 41]], 'ed2')
    b.port('a', [0, CY, ZC], [-1, 0, 0], { dn: r })
    b.port('b', [56, CY, ZC], [1, 0, 0], { dn: r })
    b.anchor('badge', [28, CY, ZC + 64])
  },
})

enregistrer({
  id: 'vanne.3voies', famille: 'Vannes', nom: 'Vanne 3 voies mélangeuse / répartitrice',
  taille: () => [56, 52, 56], defauts: { fluide: 'eau_chaude_aller', variante: 'melangeuse' }, variantes: ['melangeuse', 'repartitrice'], planche: PL,
  dessiner(b: Builder, p: Params) {
    const r = dn(p)
    const W = 56
    b.cylX(3, CY, ZC, r * 1.2, W - 6, 'mm')
    b.flange([0, CY, ZC], 'x', r * 1.9, 3, 8); b.flange([W - 3, CY, ZC], 'x', r * 1.9, 3, 8)
    b.cylY(28, CY, ZC, r * 1.2, 21, 'mm')
    b.flange([28, CY + 21, ZC], 'y', r * 1.9, 3, 8)
    // boîtier du clapet : cylindre vertical au croisement des deux tubes (plus de sphère)
    const bt = b.cylZ(28, CY, ZC - 9, 10.5, 20, 'mm'); b.rings(bt, [28, CY, ZC - 9], [28, CY, ZC + 11], 10.5, [0.5], 'ed2')
    b.cylZ(28, CY, ZC + 10, 5.5, 6, 'mm')
    const gb = b.box(19, CY - 9, ZC + 15, 18, 18, 11, 'mb')
    b.pl('yz', 37, `<g transform="translate(${CY} ${ZC + 20.5})">${cadran(b.pos)}</g>`, gb)
    b.led([22, CY + 9, ZC + 24], gb, 1.8)
    // pictogramme mélangeuse / répartitrice (plan xy)
    const mel = p.variante !== 'repartitrice'
    const ar = (x1: number, y1: number, x2: number, y2: number) => {
      const a = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI
      return l2(x1, y1, x2, y2, 'ed2') + `<g transform="translate(${x2} ${y2}) rotate(${a})">${d2('M0 0L-3.2 1.8V-1.8Z', 'fk')}</g>`
    }
    const pic = mel
      ? ar(-14, 0, -3.5, 0) + ar(14, 0, 3.5, 0) + ar(0, 3.5, 0, 14)
      : ar(-3.5, 0, -14, 0) + ar(3.5, 0, 14, 0) + ar(0, 14, 0, 3.5)
    // pictogramme au sol (sur la dalle) pour lire le fonctionnement
    b.pl('xy', 0.2, `<g transform="translate(28 ${CY + 0}) scale(.9)">${pic}</g>`, undefined, [10, 10, 46, 40], 'mb')
    // monture verticale (tilt) : A (chaud) en bas, AB (mélange) en haut dans l'axe, B (by-pass) sur le côté
    if (p.axe === 'z') {
      b.port('a', [0, CY, ZC], [-1, 0, 0], { dn: r })
      b.port('ab', [W, CY, ZC], [1, 0, 0], { dn: r })
      b.port('b', [28, CY + 24, ZC], [0, 1, 0], { dn: r })
    } else {
      b.port('a', [0, CY, ZC], [-1, 0, 0], { dn: r })
      b.port('b', [W, CY, ZC], [1, 0, 0], { dn: r })
      b.port('ab', [28, CY + 24, ZC], [0, 1, 0], { dn: r })
    }
    b.anchor('badge', [28, CY, ZC + 34])
  },
})

enregistrer({
  id: 'vanne.manuelle', famille: 'Vannes', nom: 'Vanne manuelle (volant, levier ¼ tour, papillon, opercule)',
  taille: () => [40, 48, 60], defauts: { fluide: 'eau', variante: 'levier' }, variantes: ['levier', 'volant', 'papillon', 'opercule'], planche: PLTOR,
  dessiner(b: Builder, p: Params) {
    const r = dn(p), W = 40, v = p.variante ?? 'levier'
    const ouv = b.ouvert || b.etat === 'marche'
    if (v === 'papillon') {
      b.flange([0, CY, ZC], 'x', r * 1.9, 3, 8); b.flange([W - 3, CY, ZC], 'x', r * 1.9, 3, 8)
      const co = b.cylX(3, CY, ZC, r * 2.1, W - 6, 'mm'); b.rings(co, [3, CY, ZC], [W - 3, CY, ZC], r * 2.1, [0.25, 0.75], 'ed2')
      b.port('a', [0, CY, ZC], [-1, 0, 0], { dn: r }); b.port('b', [W, CY, ZC], [1, 0, 0], { dn: r })
    } else inline(b, W, CY, ZC, r)
    if (v === 'levier' || v === 'papillon') {
      if (v === 'levier') { const cb = b.cylX(9, CY, ZC, 10.5, 22, 'mm'); b.rings(cb, [9, CY, ZC], [31, CY, ZC], 10.5, [0.5], 'ed2') }
      const nk = b.cylZ(20, CY, ZC + (v === 'levier' ? 8 : 9), 3, 6, 'mm')
      const base = b.cylZ(20, CY, ZC + 15, 7, 2.4, 'mm')
      if (v === 'papillon') b.pl('xy', ZC + 17.5, `<g transform="translate(20 ${CY})">${d2('M-7 0A7 7 0 0 1 0 -7L0 0Z', 'ed2')}${[0, 22, 45, 67, 90].map((a) => `<g transform="rotate(${-a})">${l2(5.4, 0, 7, 0, 'ed')}</g>`).join('')}</g>`, base)
      const a = ouv ? 0 : -90
      b.pl('xy', ZC + 17.5, `<g transform="translate(20 ${CY}) rotate(${a})">${d2('M-2 -2.2H18V2.2H-2Z', 'fm')}${d2('M18 -2.8H27V2.8H18Z', 'fa')}${c2(0, 0, 2.4, 'fd')}</g>`, base)
    } else if (v === 'volant') {
      const cb = b.cylX(9, CY, ZC, 11, 22, 'mm'); b.rings(cb, [9, CY, ZC], [31, CY, ZC], 11, [0.5], 'ed2')
      b.cylZ(20, CY, ZC + 9, 6, 7, 'mm')
      b.cylZ(20, CY, ZC + 16, 1.6, 14, 'mm')
      const hub = b.cylZ(20, CY, ZC + 28, 3, 3, 'mm')
      b.pl('xy', ZC + 33.2, `<g transform="translate(20 ${CY})">${c2(0, 0, 11, 'sig')}${l2(-11, 0, 11, 0, 'ed2')}${l2(0, -11, 0, 11, 'ed2')}${c2(0, 0, 2.4, 'fd')}</g>`, hub)
    } else {
      // opercule : corps haut + tige montante
      b.cylZ(20, CY, 6, 11, 18, 'mm')
      b.cylZ(20, CY, ZC + 4, 8, 6, 'mm'); b.cylZ(20, CY, ZC + 10, 10.5, 2.6, 'mm')
      b.cylZ(15.5, CY, ZC + 12.6, 1.6, 22, 'mm'); b.cylZ(24.5, CY, ZC + 12.6, 1.6, 22, 'mm')
      b.box(12, CY - 3.5, ZC + 34, 16, 7, 2.4, 'mm')
      const h = (b.pos / 100) * 14
      const stem = b.cylZ(20, CY, ZC + 12.6, 1.4, 24 + h, 'mm')
      const hub = b.cylZ(20, CY, ZC + 37 + h, 2.6, 3, 'mm')
      b.pl('xy', ZC + 40.2 + h, `<g transform="translate(20 ${CY})">${c2(0, 0, 10, 'sig')}${l2(-10, 0, 10, 0, 'ed2')}${l2(0, -10, 0, 10, 'ed2')}${c2(0, 0, 2.2, 'fd')}</g>`, hub)
      void stem
    }
    b.anchor('badge', [20, CY, ZC + (v === 'opercule' ? 60 : 38)])
  },
})

enregistrer({
  id: 'vanne.electrovanne', famille: 'Vannes', nom: 'Électrovanne',
  taille: () => [38, 44, 46], defauts: { fluide: 'eau' }, planche: PLTOR,
  dessiner(b: Builder, p: Params) {
    const r = dn(p) * 0.8
    inline(b, 38, CY, ZC, r, r * 1.7)
    const co = b.box(9, CY - 8, ZC - 8, 20, 16, 16, 'mm')
    b.pl('xz', CY + 8, flechePlan(19, ZC, 0.8) , co)
    const bo = b.cylZ(19, CY, ZC + 8, 7.5, 14, 'md')
    b.rings(bo, [19, CY, ZC + 8], [19, CY, ZC + 22], 7.5, [0.5], 'ed2')
    b.cylZ(19, CY, ZC + 22, 8.2, 2, 'mm')
    b.cylZ(19, CY, ZC + 24, 2.4, 3, 'mm')
    const cn = b.box(23, CY - 3, ZC + 16, 8, 6, 6, 'mk')
    b.led([27, CY, ZC + 22], cn, 1.6)
    b.anchor('badge', [19, CY, ZC + 32])
  },
})

enregistrer({
  id: 'vanne.clapet', famille: 'Vannes', nom: 'Clapet anti-retour',
  taille: () => [40, 48, 34], defauts: { fluide: 'eau' }, planche: [['ouvert'], ['ferme'], ['defaut'], ['alarme'], ['consigne'], ['inconnu'], ['ouvert', {}, 90], ['ferme', {}, 90]],
  dessiner(b: Builder, p: Params) {
    const r = dn(p)
    inline(b, 40, CY, ZC, r)
    const co = b.cylX(8, CY, ZC, r * 2.1, 24, 'mm')
    b.rings(co, [8, CY, ZC], [32, CY, ZC], r * 2.1, [0.2, 0.8], 'ed2')
    b.pl('xz', CY + r * 2.1, flechePlan(20, ZC, 1), co)
    const cap = b.cylZ(20, CY, ZC + r * 2.1 - 1, 5.6, 4, 'mm')
    b.pl('xy', ZC + r * 2.1 + 3, c2(20 - 0, CY, 2, 'fd'), cap)
    b.anchor('badge', [20, CY, ZC + 22])
  },
})

enregistrer({
  id: 'vanne.soupape', famille: 'Vannes', nom: 'Soupape de sécurité',
  taille: () => [58, 48, 76], defauts: { fluide: 'vapeur' }, planche: [['ferme'], ['ouvert'], ['defaut'], ['alarme'], ['consigne'], ['inconnu'], ['ferme', {}, 90], ['ouvert', {}, 90]],
  dessiner(b: Builder, p: Params) {
    const r = dn(p), X = 22
    // entrée (petite bride) et sortie (grande bride) coaxiales à l'axe du tube ; le corps vertical est entre les deux
    b.cylX(3, CY, ZC, r * 1.3, X - 3, 'mm'); b.flange([0, CY, ZC], 'x', r * 1.9, 3, 8)
    b.cylX(X, CY, ZC, r * 1.6, 58 - 3 - X, 'mm'); b.flange([55, CY, ZC], 'x', r * 2.2, 3, 8)
    const co = b.cylZ(X, CY, ZC - 9, 9.5, 24, 'mm')
    b.rings(co, [X, CY, ZC - 9], [X, CY, ZC + 15], 9.5, [0.5], 'ed2')
    b.cylZ(X, CY, ZC + 15, 8.4, 3, 'mm')
    // chapeau à ressort : ressort lisible (anneaux), capuchon, levier de soulèvement sur le côté
    const sp = b.cylZ(X, CY, ZC + 18, 6.2, 24, 'mb')
    b.rings(sp, [X, CY, ZC + 18], [X, CY, ZC + 42], 6.2, [0.2, 0.4, 0.6, 0.8], 'ed2')
    b.cylZ(X, CY, ZC + 42, 7, 3, 'mm')
    const ca = b.cylZ(X, CY, ZC + 45, 4, 5, 'mm')
    b.pl('xy', ZC + 50.05, c2(X, CY, 1.5, 'fd'), ca)
    b.path3([[X + 6, CY, ZC + 36], [X + 14, CY, ZC + 36], [X + 14, CY, ZC + 44]], 'ed3')
    b.cylZ(X + 14, CY, ZC + 43, 2.2, 4, 'ma')
    b.port('in', [0, CY, ZC], [-1, 0, 0], { dn: r })
    b.port('out', [58, CY, ZC], [1, 0, 0], { dn: r * 1.5 })
    b.anchor('badge', [X, CY, ZC + 58])
  },
})

enregistrer({
  id: 'vanne.filtre_y', famille: 'Vannes', nom: 'Filtre en Y',
  taille: () => [48, 48, 36], defauts: { fluide: 'eau' }, planche: [['arret'], ['alarme', { colmatage: 85 }], ['defaut'], ['consigne'], ['inconnu'], ['arret', {}, 90]],
  dessiner(b: Builder, p: Params) {
    const r = dn(p), zc = ZC + 4
    inline(b, 48, CY, zc, r)
    // corps : cylindre coaxial aux brides (rayon < bride) ; branche à 45° vers l'aval dans le plan x-z, bouchon hexagonal en bout
    const co = b.cylX(8, CY, zc, r * 1.55, 32, 'mm'); b.rings(co, [8, CY, zc], [40, CY, zc], r * 1.55, [0.5], 'ed2')
    // (un axe dans le plan x-z serait vu exactement de profil : branche inclinée vers le spectateur, bouchon ovale lisible)
    const ax: [number, number, number] = [0.37, 0.74, -0.57], BL = 15
    const q = (k: number): [number, number, number] => [24 + ax[0] * k, CY + ax[1] * k, zc + ax[2] * k]
    b.cyl([24, CY, zc], q(BL), r * 1.35, 'mm')
    b.cyl(q(BL), q(BL + 3), r * 1.35 + 1.4, 'mb')
    b.anchor('badge', [24, CY, zc + 20])
  },
})

enregistrer({
  id: 'vanne.pot_boue', famille: 'Vannes', nom: 'Pot à boues (magnétique)',
  taille: () => [56, 48, 74], defauts: { fluide: 'eau_chaude_retour' }, planche: [['arret'], ['alarme'], ['defaut'], ['consigne'], ['inconnu'], ['arret', {}, 90]],
  dessiner(b: Builder, p: Params) {
    const r = dn(p), zc = 46
    b.cylX(3, CY, zc, r * 1.2, 50, 'mm')
    b.flange([0, CY, zc], 'x', r * 1.9, 3, 8); b.flange([53, CY, zc], 'x', r * 1.9, 3, 8)
    const co = b.cylZ(28, CY, 4, 16, 52, 'mb')
    b.rings(co, [28, CY, 4], [28, CY, 56], 16, [0.22, 0.78], 'ed2')
    b.cylZ(28, CY, 56, 16, 6, 'mb', 11)
    b.cylZ(28, CY, 62, 11, 3, 'mm')
    b.cylZ(28, CY, 65, 3, 5, 'mm')
    b.cylZ(28, CY, 0, 11, 4, 'mm')
    const ba = b.cylZ(28, CY, 22, 16.6, 3, 'ma')
    void ba
    // purge
    b.cylY(28, CY + 14, 8, 2.6, 10, 'mm'); b.cylY(28, CY + 24, 8, 3.6, 3, 'md')
    b.port('a', [0, CY, zc], [-1, 0, 0], { dn: r })
    b.port('b', [56, CY, zc], [1, 0, 0], { dn: r })
    b.anchor('badge', [28, CY, 74])
  },
})

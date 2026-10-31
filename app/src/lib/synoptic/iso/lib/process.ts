/* eslint-disable */
// @ts-nocheck — catalogue de dessin (code massif copié de iso_lib, qui compile sans strictNullChecks) ; voir iso/README.md
// Traitement, moteurs & mécanique.
import { enregistrer } from './registre'
import { Builder, c2, r2, l2, d2 } from './iso'
import { inline, moteurX, moteurZ, socle, grille, helice, roueAubes } from './communs'
import type { Params, EtatNom, Valeurs } from './types'

const PL: [EtatNom, Valeurs?, number?][] = [['arret'], ['marche'], ['defaut'], ['alarme'], ['consigne', { manuel: true }], ['inconnu'], ['marche', {}, 90], ['arret', {}, 90]]

function buse(b: Builder, id: string, pos: [number, number, number], ax: 'x' | 'y' | 'z', sg: 1 | -1, len: number, r: number, fl?: any) {
  const e: [number, number, number] = [pos[0] + (ax === 'x' ? sg * len : 0), pos[1] + (ax === 'y' ? sg * len : 0), pos[2] + (ax === 'z' ? sg * len : 0)]
  b.cyl(pos, e, r, 'mm')
  const f0: [number, number, number] = [e[0] - (ax === 'x' ? sg * 2.6 : 0), e[1] - (ax === 'y' ? sg * 2.6 : 0), e[2] - (ax === 'z' ? sg * 2.6 : 0)]
  b.flange(f0, ax, r * 1.75, 2.6, 6, 'mm', sg)
  b.port(id, e, [ax === 'x' ? sg : 0, ax === 'y' ? sg : 0, ax === 'z' ? sg : 0], { dn: r, fluide: fl })
}

// ═════ TRAITEMENT
enregistrer({
  id: 'traitement.filtre_sable', famille: 'Traitement', nom: 'Filtre à sable (vanne multivoie, manomètre)',
  taille: () => [90, 90, 130], defauts: { fluide: 'eau', dn: 4 }, planche: [['arret'], ['marche'], ['alarme', { colmatage: 90 }], ['defaut'], ['consigne', { manuel: true }], ['inconnu'], ['marche', {}, 90]],
  dessiner(b: Builder, p: Params) {
    const cx = 45, cy = 45, r = 28
    for (const [dx, dy] of [[1, 0], [-0.5, 0.87], [-0.5, -0.87]]) { b.cylZ(cx + dx * r * 0.78, cy + dy * r * 0.78, 0, 2.6, 8, 'mm'); b.cylZ(cx + dx * r * 0.78, cy + dy * r * 0.78, 0, 4.2, 1.4, 'mm') }
    b.cylZ(cx, cy, 6, r * 0.8, 3, 'mm', r * 0.96)
    const f = b.cylZ(cx, cy, 9, r, 70, 'mb')
    b.rings(f, [cx, cy, 9], [cx, cy, 79], r, [0.12, 0.88], 'ed2')
    b.cylZ(cx, cy, 79, r, 14, 'mb', r * 0.35)
    // regard + trou d'homme + jauge de lit de sable
    const rg = b.cylY(cx - 12, cy + r - 1.2, 36, 6, 2.6, 'mm')
    b.pl('xz', cy + r + 1.45, c2(cx - 12, 36, 4, 'fg') + c2(cx - 12, 36, 4, 'ed2'), rg)
    // couche de sable visible dans un tube de verre
    b.cylZ(cx + 14, cy + r * 0.88, 20, 3, 44, 'mg')
    b.raw([cx + 11, cy + r * 0.8, 20], [cx + 17, cy + r * 0.95, 64], (bb, w) => '', 'mm')
    // vanne multivoie
    const vm = b.cylZ(cx, cy, 93, 9, 12, 'mm'); b.rings(vm, [cx, cy, 93], [cx, cy, 105], 9, [0.5])
    b.cylZ(cx, cy, 105, 4, 5, 'mm')
    const hn = b.cylZ(cx, cy, 110, 8, 3, 'ma')
    b.pl('xy', 113.1, l2(cx - 7, cy, cx + 7, cy, 'ed') + c2(cx, cy, 2, 'fd'), hn)
    // manomètre
    const ma = b.cylY(cx + 10, cy + 6, 100, 5, 4, 'mm')
    b.pl('xz', cy + 10.1, c2(cx + 10, 100, 3.6, 'fw') + `<path class="sig" d="M${cx + 10} 100l2 2.4"/>`, ma)
    buse(b, 'e', [cx - r, cy, 60], 'x', -1, 14, p.dn, 'eau')
    buse(b, 's', [cx + r, cy, 28], 'x', 1, 14, p.dn, 'eau')
    b.anchor('badge', [cx, cy, 130]); b.anchor('haut', [cx, cy, 115])
  },
})

enregistrer({
  id: 'traitement.filtre_cartouche', famille: 'Traitement', nom: 'Filtre à cartouche (carter, collier de serrage)',
  taille: () => [56, 56, 100], defauts: { fluide: 'eau', dn: 3.6 }, planche: [['arret'], ['marche'], ['alarme', { colmatage: 85 }], ['defaut'], ['consigne'], ['inconnu'], ['marche', {}, 90]],
  dessiner(b: Builder, p: Params) {
    const cx = 28, cy = 28, r = 13
    b.box(cx - 15, cy - 15, 0, 30, 30, 4, 'mm'); b.cylZ(cx - 10, cy, 4, 2.4, 14, 'mm'); b.cylZ(cx + 10, cy, 4, 2.4, 14, 'mm')
    const bol = b.cylZ(cx, cy, 14, r, 52, 'mb'); b.rings(bol, [cx, cy, 14], [cx, cy, 66], r, [0.25, 0.75], 'ed2')
    // collier de serrage + vis à oreilles
    const co = b.cylZ(cx, cy, 63, r + 1.4, 5, 'mm'); b.cylZ(cx + r + 1, cy, 62, 1.4, 6, 'md')
    b.cylZ(cx, cy, 68, r, 6, 'mb', r * 0.4)
    b.cylZ(cx, cy, 74, 4, 8, 'mm'); b.cylZ(cx, cy, 82, 5.4, 2.4, 'mm')
    // indicateur de colmatage ΔP (cadran)
    const ma = b.cylY(cx - 7, cy + r - 1, 70, 6, 3, 'mm')
    b.pl('xz', cy + r + 2.05, c2(cx - 7, 70, 4.4, 'fw') + `<path class="sig" d="M${cx - 7} 70l${3.4 * Math.cos((180 - (b.val.colmatage ?? 20) * 1.8) * Math.PI / 180)} ${-3.4 * Math.sin((180 - (b.val.colmatage ?? 20) * 1.8) * Math.PI / 180)}"/>`, ma)
    buse(b, 'e', [cx - r, cy, 40], 'x', -1, 12, p.dn, 'eau')
    buse(b, 's', [cx + r, cy, 40], 'x', 1, 12, p.dn, 'eau')
    b.cylZ(cx, cy, 6, 1.4, 4, 'md')
    b.anchor('badge', [cx, cy, 92]); b.anchor('haut', [cx, cy, 84])
  },
})

enregistrer({
  id: 'traitement.echangeur_plaques', famille: 'Traitement', nom: 'Échangeur à plaques (bâti, tirants, 4 piquages)',
  taille: (p) => [(p.n ?? 20) * 2.8 + 40, 54, 98], defauts: { n: 20, dn: 4, fluide: 'eau_chaude_aller' }, variantes: ['n=8..40'], planche: [['arret'], ['marche'], ['alarme'], ['defaut'], ['consigne'], ['inconnu'], ['marche', {}, 90]],
  dessiner(b: Builder, p: Params) {
    const n = p.n, T = n * 2.8, x0 = 14, W = T + 28, r = p.dn
    // pieds + règle supérieure et inférieure
    b.box(x0 - 14, 4, 0, W, 46, 5, 'mm')
    b.box(x0 - 2, 8, 5, 4, 38, 88, 'mm')                       // plaque fixe
    b.box(x0 + T + 8, 8, 5, 4, 38, 88, 'mm')                    // plaque mobile
    // paquet de plaques : bandes avec joints colorés (chaud / froid alternés)
    const pk = b.box(x0 + 2, 10, 8, T + 6, 34, 82, 'mb')
    let s = ''
    for (let i = 0; i <= n; i++) s += l2(x0 + 2 + ((T + 6) * i) / n, 8, x0 + 2 + ((T + 6) * i) / n, 90, i % 2 ? 'ed2' : 'ed')
    b.pl('xz', 44, s, pk)
    // tirants + écrous
    for (const [y, z] of [[10, 12], [10, 80], [44, 12], [44, 80]] as const) { b.cylX(x0 - 6, y, z, 1.4, T + 28, 'md'); b.cylX(x0 + T + 12, y, z, 2.4, 3, 'mm') }
    b.cylX(x0 + T + 11, 14, 18, 0.1, 0.1, 'mm')
    // rail supérieur de guidage
    b.cylX(x0 - 10, 27, 94, 1.8, T + 40, 'mm')
    // 4 piquages sur la plaque fixe (côté -x non visible) → on les met sur le dessus/dessous côté +y visible
    buse(b, 'prim_in', [x0 + 6, 18, 90], 'z', 1, 14, r, 'eau_chaude_aller')
    buse(b, 'prim_out', [x0 + 6, 18, 8], 'z', -1, 1, r, 'eau_chaude_retour')
    buse(b, 'sec_in', [x0 + 6 + 14, 36, 8], 'y', 1, 12, r, 'eau')
    buse(b, 'sec_out', [x0 + 6 + 14, 36, 90], 'y', 1, 12, r, 'eau')
    b.anchor('badge', [x0 + T / 2, 27, 116]); b.anchor('haut', [x0 + T / 2, 27, 106])
  },
})

enregistrer({
  id: 'traitement.echangeur_tubulaire', famille: 'Traitement', nom: 'Échangeur tubulaire (calandre, boîtes de distribution)',
  taille: () => [150, 56, 66], defauts: { dn: 4, fluide: 'vapeur' }, planche: [['arret'], ['marche'], ['alarme'], ['defaut'], ['consigne'], ['inconnu'], ['marche', {}, 90]],
  dessiner(b: Builder, p: Params) {
    const cy = 28, zc = 34, r = p.dn
    for (const x of [30, 112]) { b.box(x - 7, cy - 14, 0, 14, 28, zc - 17, 'mm'); b.box(x - 9, cy - 15, 0, 18, 30, 2, 'mm') }
    const sh = b.cylX(18, cy, zc, 17, 114, 'mb'); b.rings(sh, [18, cy, zc], [132, cy, zc], 17, [0.2, 0.4, 0.6, 0.8], 'ed2')
    for (const [x, sg] of [[12, -1], [132, 1]] as const) {
      b.cylX(x - (sg < 0 ? 0 : 0), cy, zc, 19, 6, 'mm')
      b.cylX(sg < 0 ? 0 : 138, cy, zc, sg < 0 ? 17 : 17, 12, 'mb', sg < 0 ? 12 : 17)
    }
    b.cylX(138, cy, zc, 17, 8, 'mb', 12); b.cylX(146, cy, zc, 3, 4, 'mm')
    b.pl('yz', 150, c2(cy, zc, 10, 'ed2') + c2(cy, zc, 3, 'fd'), undefined, [cy - 12, zc - 12, cy + 12, zc + 12], 'mm')
    buse(b, 'prim_in', [40, cy, zc + 16], 'z', 1, 14, r * 1.2, 'vapeur')
    buse(b, 'prim_out', [100, cy, zc - 16], 'z', -1, 1, r, 'condensat')
    buse(b, 'sec_in', [4, cy + 6, zc - 8], 'y', 1, 12, r, 'eau')
    buse(b, 'sec_out', [140, cy + 6, zc + 8], 'y', 1, 12, r, 'eau_chaude_aller')
    b.anchor('badge', [75, cy, zc + 44])
  },
})

enregistrer({
  id: 'traitement.separateur', famille: 'Traitement', nom: 'Séparateur (hydrocyclone / dégazeur vertical)',
  taille: () => [70, 70, 120], defauts: { dn: 4, fluide: 'eau' }, planche: PL.slice(0, 6),
  dessiner(b: Builder, p: Params) {
    const cx = 35, cy = 35, r = 18
    for (const [dx, dy] of [[1, 0], [-0.5, 0.87], [-0.5, -0.87]]) { b.cylZ(cx + dx * r * 0.7, cy + dy * r * 0.7, 0, 2.4, 22, 'mm'); b.box(cx + dx * r * 0.7 - 4, cy + dy * r * 0.7 - 4, 0, 8, 8, 1.6, 'mm') }
    b.cylZ(cx, cy, 12, 4, 6, 'mm'); b.cylZ(cx, cy, 18, 4, 16, 'mb', r)
    const f = b.cylZ(cx, cy, 34, r, 52, 'mb'); b.rings(f, [cx, cy, 34], [cx, cy, 86], r, [0.5], 'ed2')
    b.cylZ(cx, cy, 86, r, 12, 'mb', r * 0.4)
    b.cylZ(cx, cy, 98, 5, 10, 'mm'); b.cylZ(cx, cy, 108, 6.4, 3, 'md')
    buse(b, 'e', [cx, cy - r, 70], 'y', -1, 12, p.dn, 'eau')   // tangent
    buse(b, 's', [cx + r, cy, 52], 'x', 1, 14, p.dn, 'eau')
    b.cylY(cx, cy + r - 0.5, 28, 2.4, 8, 'mm'); b.cylY(cx, cy + r + 7.5, 28, 3.6, 2, 'md')
    b.anchor('badge', [cx, cy, 124])
  },
})

enregistrer({
  id: 'traitement.centrifugeuse', famille: 'Traitement', nom: 'Centrifugeuse / décanteur centrifuge',
  taille: () => [150, 56, 66], defauts: { dn: 4, fluide: 'boues' }, planche: PL,
  dessiner(b: Builder, p: Params) {
    const cy = 28, zc = 30
    socle(b, 0, 2, 150, 52, 6)
    b.box(14, cy - 14, 6, 14, 28, zc - 16, 'mm'); b.box(88, cy - 14, 6, 14, 28, zc - 16, 'mm')
    // bol (tambour conique) sous carter
    const car = b.cylX(18, cy, zc, 18, 78, 'mb'); b.rings(car, [18, cy, zc], [96, cy, zc], 18, [0.25, 0.5, 0.75], 'ed2')
    b.cylX(96, cy, zc, 18, 8, 'mm', 12)
    b.box(40, cy - 4, zc + 16, 30, 8, 5, 'mm')     // capot de décharge supérieur
    // moteur principal + boîte d'engrenages
    b.cylX(104, cy, zc, 12, 8, 'mm')
    const gb = b.cylX(112, cy, zc, 10, 12, 'mb'); void gb
    moteurX(b, 124, cy, zc, 11, 22, { cowl: true, fan: true })
    b.cylX(4, cy, zc, 9, 14, 'mm')
    b.cylY(30, cy - 10, zc + 10, 0.1, 0.1, 'mm')
    buse(b, 'e', [60, cy, zc + 18], 'z', 1, 14, p.dn, 'eau')
    buse(b, 'liquide', [40, cy + 6, 14], 'y', 1, 12, p.dn, 'eau_traitee')
    buse(b, 'solides', [80, cy, 6], 'z', -1, 1, p.dn * 1.4, 'boues')
    b.anchor('badge', [60, cy, zc + 34])
  },
})

enregistrer({
  id: 'traitement.uv', famille: 'Traitement', nom: 'Réacteur UV (désinfection) + armoire de ballast',
  taille: () => [116, 50, 62], defauts: { dn: 4, fluide: 'eau_traitee' }, planche: PL,
  dessiner(b: Builder, p: Params) {
    const cy = 25, zc = 26
    for (const x of [26, 86]) b.box(x - 5, cy - 11, 0, 10, 22, zc - 12, 'mm')
    const re = b.cylX(14, cy, zc, 12, 80, 'mb'); b.rings(re, [14, cy, zc], [94, cy, zc], 12, [0.14, 0.86], 'ed2')
    // fenêtre de contrôle : lampe violette
    b.pl('xz', cy + 12.05, r2(30, zc - 3, 48, 6, 'fk', 3) + `<g class="uv">${r2(32, zc - 1.4, 44, 2.8, 'fa', 1.4)}</g>`, re)
    b.cylX(8, cy, zc, 12.8, 6, 'mm'); b.cylX(94, cy, zc, 12.8, 6, 'mm')
    b.flange([0, cy, zc], 'x', r(p) * 1.9, 3, 8); b.cylX(2, cy, zc, p.dn * 1.2, 8, 'mm')
    b.flange([113, cy, zc], 'x', r(p) * 1.9, 3, 8); b.cylX(100, cy, zc, p.dn * 1.2, 13, 'mm')
    b.port('e', [0, cy, zc], [-1, 0, 0], { dn: p.dn, fluide: 'eau_traitee' }); b.port('s', [116, cy, zc], [1, 0, 0], { dn: p.dn, fluide: 'eau_traitee' })
    // boîtier de ballast
    const bx = b.box(52, cy - 7, zc + 12, 24, 14, 12, 'mm')
    b.pl('xz', cy + 7, r2(55, zc + 15, 12, 6, 'fk', 1) + c2(71, zc + 18, 1.4, 'led'), bx)
    b.led([71, cy + 7, zc + 18], bx, 1.4)
    b.anchor('badge', [58, cy, zc + 38])
  },
})
const r = (p: Params) => p.dn ?? 4

// ═════ MOTEURS & MÉCANIQUE
enregistrer({
  id: 'meca.moteur', famille: 'Mécanique', nom: 'Moteur électrique seul (carcasse à ailettes, boîte à bornes)',
  taille: () => [86, 40, 48], defauts: {}, planche: PL,
  dessiner(b: Builder, p: Params) {
    b.box(2, 4, 0, 78, 32, 3, 'mm')
    moteurX(b, 8, 20, 22, 16, 50, { accent: true })
    const ar = b.cylX(-2, 20, 22, 4, 12, 'mm'); void ar
    b.box(14, 17, 26, 2.4, 6, 2.4, 'mm')
    b.anchor('badge', [40, 20, 54])
  },
})
enregistrer({
  id: 'meca.motoreducteur', famille: 'Mécanique', nom: 'Motoréducteur (réducteur à carter, arbre de sortie)',
  taille: () => [100, 44, 56], defauts: {}, planche: PL,
  dessiner(b: Builder, p: Params) {
    socle(b, 0, 2, 100, 40, 4)
    const gb = b.box(8, 10, 4, 34, 24, 40, 'mb')
    b.pl('xz', 34, r2(11, 8, 28, 36, 'ed2') + c2(25, 26, 8, 'fm') + c2(25, 26, 3, 'fd') + [0, 1, 2, 3].map((i) => c2(25 + Math.cos(i * 1.57 + .8) * 6, 26 + Math.sin(i * 1.57 + .8) * 6, 0.9, 'fd')).join(''), gb)
    b.cylZ(25, 22, 44, 3, 3, 'md'); b.cylZ(25, 22, 47, 1.4, 3, 'mm')
    b.cylY(14, 34, 24, 3.4, 12, 'mm')   // arbre de sortie
    b.cylY(14, 46, 24, 2, 3, 'md')
    moteurX(b, 42, 22, 24, 12, 38, { accent: true, pieds: false })
    b.anchor('badge', [50, 22, 50])
  },
})
enregistrer({
  id: 'meca.agitateur', famille: 'Mécanique', nom: 'Agitateur autonome (bride, motoréducteur, arbre, hélice)',
  taille: () => [56, 56, 140], defauts: {}, planche: PL.slice(0, 6),
  dessiner(b: Builder, p: Params) {
    const cx = 28, cy = 28
    b.cylZ(cx, cy, 0, 22, 4, 'mm')
    b.cylZ(cx, cy, 4, 12, 4, 'mm')
    const gb = b.box(cx - 11, cy - 11, 8, 22, 22, 16, 'mb')
    b.pl('xz', cy + 11, r2(cx - 7, 12, 14, 7, 'fk', 1) + c2(cx - 3, 20.6, 1, 'led'), gb)
    const top = moteurZ(b, cx, cy, 24, 9, 26)
    b.cylZ(cx, cy, 8, 2, 4, 'mm')
    // arbre et hélice marine sous la bride (montrés, hors cuve)
    b.cylZ(cx, cy, -0.1, 0.1, 0.1, 'mm')
    b.anchor('badge', [cx, cy, top + 10])
  },
})
enregistrer({
  id: 'meca.convoyeur_bande', famille: 'Mécanique', nom: 'Convoyeur à bande',
  taille: (p) => [(p.l ?? 150) + 20, 40, 52], defauts: { l: 150 }, planche: PL,
  dessiner(b: Builder, p: Params) {
    const l = p.l, y0 = 6, w = 28
    for (const x of [14, l * 0.5, l - 10]) { b.box(x, y0 + 1, 0, 3, 3, 24, 'mm'); b.box(x, y0 + w - 4, 0, 3, 3, 24, 'mm'); b.box(x - 1, y0 - 1, 0, 5, w + 2, 2, 'mm') }
    b.box(8, y0, 24, l + 4, 3, 4, 'mm'); b.box(8, y0 + w - 3, 24, l + 4, 3, 4, 'mm')
    // bande (dessus) + tambours
    const bd = b.box(8, y0 + 3, 26, l + 4, w - 6, 3, 'md')
    b.pl('xy', 29, `<g class="cflow">${[0.3, 0.5, 0.7].map((k) => `<path class="flow air" d="M12 ${y0 + w * k}H${l}"/>`).join('')}</g>` + Array.from({ length: Math.floor(l / 14) }, (_, i) => l2(16 + i * 14, y0 + 4, 16 + i * 14, y0 + w - 4, 'ed2')).join(''), bd)
    b.cylY(10, y0 - 2, 27, 5, w + 4, 'mm'); b.cylY(l + 2, y0 - 2, 27, 5, w + 4, 'mm')
    // tambour moteur + motoréducteur
    b.cylY(10, y0 + w + 2, 27, 2, 6, 'mm')
    moteurX(b, l + 6, y0 + w + 6, 27, 6, 12, { bornes: false, pieds: false, cowl: false })
    b.box(l - 6, y0 + w, 24, 10, 8, 6, 'mb')
    // carters de protection + arrêt d'urgence par câble
    b.path3([[14, y0 - 2, 36], [l - 4, y0 - 2, 36]], 'ed2')
    b.cylZ(14, y0 - 2, 28, 1, 8, 'mm'); b.cylZ(l - 4, y0 - 2, 28, 1, 8, 'mm')
    b.anchor('badge', [l / 2, y0 + w / 2, 42])
  },
})
enregistrer({
  id: 'meca.convoyeur_vis', famille: 'Mécanique', nom: 'Convoyeur à vis (auge couverte, trémie)',
  taille: (p) => [(p.l ?? 140) + 30, 36, 48], defauts: { l: 140 }, planche: PL,
  dessiner(b: Builder, p: Params) {
    const l = p.l, cy = 18, zc = 20
    for (const x of [24, l - 20]) b.box(x - 4, cy - 10, 0, 8, 20, zc - 8, 'mm')
    const t = b.cylX(10, cy, zc, 9, l, 'mb'); b.rings(t, [10, cy, zc], [10 + l, cy, zc], 9, Array.from({ length: 6 }, (_, i) => (i + 1) / 7), 'ed2')
    // capots boulonnés + trémie d'alimentation + goulotte de sortie
    b.cylZ(30, cy, zc + 7, 7, 14, 'mm', 10); b.box(22, cy - 8, zc + 20, 16, 16, 2, 'mm')
    b.cylZ(10 + l - 14, cy, zc - 14, 6, 14, 'mm')
    b.cylX(10 + l, cy, zc, 9.6, 3, 'mm')
    b.cylX(0, cy, zc, 9.6, 3, 'mm')
    // lunette de visite : spirale vue à travers
    b.pl('xz', cy + 9.05, r2(50, zc - 4, 40, 8, 'fk', 2) + `<g class="cflow">${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<path class="flow air" d="M${52 + i * 5} ${zc - 3}l2.4 6"/>`).join('')}</g>`, t)
    moteurX(b, 10 + l + 3, cy, zc, 9, 20, { bornes: false, pieds: false })
    b.anchor('badge', [l / 2, cy, zc + 30])
  },
})
enregistrer({
  id: 'meca.compresseur_vis', famille: 'Mécanique', nom: 'Compresseur à vis (capot insonorisé, sécheur)',
  taille: () => [130, 56, 84], defauts: { fluide: 'air_comprime', dn: 3 }, planche: PL,
  dessiner(b: Builder, p: Params) {
    socle(b, 0, 0, 130, 56, 5)
    const cs = b.box(2, 2, 5, 126, 52, 70, 'mb')
    b.pl('xz', 54, r2(4, 7, 70, 62, 'ed2') + [0, 1, 2, 3, 4, 5, 6, 7].map((i) => l2(8, 12 + i * 3.4, 40, 12 + i * 3.4, 'ed2')).join('') + r2(78, 38, 28, 22, 'fk', 2) + r2(81, 52, 14, 3, 'fa', .5) + r2(81, 46, 20, 1.4, 'ed2') + c2(82, 42, 1.8, 'led') + c2(90, 42, 1.8, 'fm') + c2(98, 42, 1.8, 'fm') + l2(78, 30, 106, 30, 'ed2'), cs)
    b.led([82, 54, 42], cs, 1.6)
    b.pl('yz', 128, r2(8, 10, 40, 50, 'ed2') + [0, 1, 2, 3, 4, 5].map((i) => l2(12, 16 + i * 6, 44, 16 + i * 6, 'ed2')).join(''), cs)
    // ventilateur de refroidissement dessus
    const v = b.cylZ(30, 28, 75, 18, 4, 'mm')
    b.pl('xy', 79, `<g transform="translate(30 28)">${c2(0, 0, 15, 'in')}</g>`, v)
    b.rotor('xy', 79.1, 30, 28, helice(14, 5, 'fm'), v, 1.1)
    b.pl('xy', 79.2, `<g transform="translate(30 28)">${grille(16, 2, 10)}</g>`, v)
    b.cylZ(100, 20, 75, 5, 8, 'mm'); b.flange([100, 20, 83], 'z', 8, 2.4, 6)
    b.port('air', [100, 20, 85.4], [0, 0, 1], { dn: 3, fluide: 'air_comprime' })
    b.anchor('badge', [65, 28, 96])
  },
})
enregistrer({
  id: 'meca.compresseur_piston', famille: 'Mécanique', nom: 'Compresseur à piston (réservoir horizontal, tête bi-cylindre)',
  taille: () => [140, 50, 90], defauts: { fluide: 'air_comprime' }, planche: PL,
  dessiner(b: Builder, p: Params) {
    const cy = 25
    for (const x of [26, 100]) { b.box(x - 6, cy - 14, 0, 12, 28, 18, 'mm'); b.box(x - 9, cy - 16, 0, 18, 32, 2, 'mm') }
    const rs = b.cylX(10, cy, 34, 16, 118, 'mb'); b.rings(rs, [10, cy, 34], [128, cy, 34], 16, [0.1, 0.9], 'ed2')
    b.cylX(128, cy, 34, 16, 6, 'mb', 8)
    // groupe compresseur sur le dessus : carter + 2 cylindres à ailettes + volant
    b.box(34, cy - 12, 50, 40, 24, 8, 'mm')
    for (const x of [44, 64]) { const c = b.cylZ(x, cy, 58, 6.4, 16, 'mb'); b.rings(c, [x, cy, 58], [x, cy, 74], 6.4, [0.2, 0.4, 0.6, 0.8]); b.cylZ(x, cy, 74, 7.4, 2.4, 'mm') }
    const vo = b.cylY(36, cy + 12, 54, 9, 4, 'mm'); b.pl('xz', cy + 16.1, `<g transform="translate(36 54)">${c2(0, 0, 8, 'ed2')}<g class="spin slow">${[0, 60, 120, 180, 240, 300].map((a) => `<path class="ed2" transform="rotate(${a})" d="M0 0L7 0"/>`).join('')}</g></g>`, vo)
    moteurX(b, 80, cy, 54, 8, 22, { bornes: false, pieds: false, cowl: false })
    b.cylZ(116, cy, 50, 3, 10, 'mm'); b.cylZ(116, cy, 60, 5.4, 4, 'ma')
    b.port('air', [128, cy + 0, 40], [1, 0, 0], { dn: 2.6, fluide: 'air_comprime' })
    b.anchor('badge', [64, cy, 86])
  },
})
enregistrer({
  id: 'meca.surpresseur_air', famille: 'Mécanique', nom: "Surpresseur d'air (lobes Roots, cabine insonorisée)",
  taille: () => [110, 56, 62], defauts: { fluide: 'air_comprime', dn: 5 }, planche: PL,
  dessiner(b: Builder, p: Params) {
    const cy = 28, zc = 26
    socle(b, 0, 2, 110, 52, 5)
    const bo = b.box(8, 8, 5, 40, 40, 36, 'mb')
    b.pl('xz', 48, r2(11, 8, 34, 30, 'ed2') + [0, 1, 2].map((i) => l2(15, 15 + i * 5, 41, 15 + i * 5, 'ed2')).join(''), bo)
    b.cylZ(28, cy, 41, 8, 8, 'mm'); b.cylZ(28, cy, 49, 5, 6, 'md')
    // filtre d'aspiration + silencieux de refoulement
    b.cylZ(18, cy, 41, 0.1, 0.1, 'mm')
    const si = b.cylX(2, 14, 30, 8, 14, 'mb'); b.rings(si, [2, 14, 30], [16, 14, 30], 8, [0.5])
    const ref = b.cylY(34, 48, 22, 3.6, 8, 'mm'); void ref
    moteurX(b, 48, cy, zc + 2, 14, 46, { accent: true })
    b.flange([34, 56, 22], 'y', 7, 2.4, 6)
    b.port('ref', [34, 58.4, 22], [0, 1, 0], { dn: 3.6, fluide: 'air_comprime' })
    b.anchor('badge', [60, cy, 72])
  },
})
enregistrer({
  id: 'meca.ventilateur_centrifuge', famille: 'Mécanique', nom: 'Ventilateur centrifuge (volute, moteur, piètement)',
  taille: () => [100, 64, 90], defauts: { fluide: 'air_souffle' }, planche: PL,
  dessiner(b: Builder, p: Params) {
    const cy = 32, zc = 38, R = 30
    b.box(10, 6, 0, 80, 52, 4, 'mm'); b.box(16, 10, 4, 6, 44, 6, 'mm'); b.box(62, 10, 4, 6, 44, 6, 'mm')
    // volute (disque épais d'axe y) + bouche de refoulement verticale
    const vo = b.cylY(40, cy - 14, zc, R, 28, 'mb')
    b.pl('xz', cy + 14.05, c2(40, zc, R - 5, 'ed2') + `<g transform="translate(40 ${zc})"><g class="spin">${roueAubes(R - 8, 11)}</g></g>` + c2(40, zc, 7, 'fm') + c2(40, zc, 2, 'fd'), vo)
    b.rings(vo, [40, cy - 14, zc], [40, cy + 14, zc], R, [0.5], 'ed2')
    b.box(40 - 3, cy - 14, zc + R - 3, 3, 28, 30, 'mb')            // gaine de refoulement
    b.box(40 + 0, cy - 14, zc + R - 3, 26, 28, 3, 'mb')
    const rf = b.box(40 + 0, cy - 12, zc + R + 3, 26, 24, 2.4, 'mm')
    b.flange([64, cy, zc + R + 5], 'z', 0.1, 0.1, 4)
    // ouïe d'aspiration (anneau côté +y) + moteur côté -y (non visible) → boîte à bornes visible
    b.cylY(40, cy + 14, zc, 13, 6, 'mm', 9)
    b.cylY(40, cy - 28, zc, 9, 14, 'mm')
    moteurX(b, 70, cy, zc - 14, 10, 16, { cowl: false, bornes: false, pieds: false })
    b.cylX(60, cy, zc - 14, 1.4, 12, 'md')
    b.port('ref', [53, cy, zc + R + 5.4], [0, 0, 1], { type: 'gaine', fluide: 'air_souffle', w: 24, h: 24 })
    b.anchor('badge', [40, cy, zc + R + 22]); void rf
  },
})
enregistrer({
  id: 'meca.ventilateur_helicoide', famille: 'Mécanique', nom: 'Ventilateur hélicoïde (mural / de toiture)',
  taille: () => [48, 56, 62], defauts: { fluide: 'air_repris' }, planche: PL,
  dessiner(b: Builder, p: Params) {
    const cx = 24, cy = 28, zc = 31, R = 22
    b.box(cx - 24, cy - 28, 0, 6, 56, 62, 'mm')   // platine murale
    const vr = b.cylX(cx - 18, cy, zc, R, 14, 'mb'); b.rings(vr, [cx - 18, cy, zc], [cx - 4, cy, zc], R, [0.5], 'ed2')
    b.cylX(cx - 4, cy, zc, R + 2, 2.4, 'mm')
    b.rotor('yz', cx - 1.6, cy, zc, helice(R - 3, 4, 'fm'), vr, 0.8)
    b.pl('yz', cx - 1.5, `<g transform="translate(${cy} ${zc})">${grille(R + 1, 3, 12)}</g>`, vr)
    b.cylX(cx - 17, cy + 0, zc, 4, 12, 'md')
    b.anchor('badge', [cx, cy, 70])
  },
})

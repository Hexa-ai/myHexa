/* eslint-disable */
// @ts-nocheck — catalogue de dessin (code massif copié de iso_lib, qui compile sans strictNullChecks) ; voir iso/README.md
// Chaufferie / froid : chaudière, PAC, groupe froid, tour, brûleur, cheminée, collecteur, compteur d'énergie.
import { enregistrer } from './registre'
import { Builder, c2, r2, l2, d2 } from './iso'
import { inline, grille, helice, moteurX, socle } from './communs'
import type { Params, EtatNom, Valeurs } from './types'

const PL: [EtatNom, Valeurs?, number?][] = [['arret'], ['marche'], ['modulant', { position: 60 }], ['defaut'], ['alarme'], ['consigne', { manuel: true }], ['inconnu'], ['marche', {}, 90]]

/** piquage horizontal/vertical avec bride + bague fluide + port */
function piq(b: Builder, id: string, p: [number, number, number], ax: 'x' | 'y' | 'z', sg: 1 | -1, len: number, r: number, fluide: any) {
  const e: [number, number, number] = [p[0] + (ax === 'x' ? sg * len : 0), p[1] + (ax === 'y' ? sg * len : 0), p[2] + (ax === 'z' ? sg * len : 0)]
  b.cyl(p, e, r, 'mm')
  const t = 2.6
  const f0: [number, number, number] = [e[0] - (ax === 'x' ? sg * t : 0), e[1] - (ax === 'y' ? sg * t : 0), e[2] - (ax === 'z' ? sg * t : 0)]
  b.flange(f0, ax, r * 1.75, t, 6, 'mm', sg)
  const mid: [number, number, number] = [p[0] + (ax === 'x' ? sg * len * 0.4 : 0), p[1] + (ax === 'y' ? sg * len * 0.4 : 0), p[2] + (ax === 'z' ? sg * len * 0.4 : 0)]
  b.cyl(mid, [mid[0] + (ax === 'x' ? sg * 2.4 : 0), mid[1] + (ax === 'y' ? sg * 2.4 : 0), mid[2] + (ax === 'z' ? sg * 2.4 : 0)], r * 1.28, 'ma')
  b.port(id, e, [ax === 'x' ? sg : 0, ax === 'y' ? sg : 0, ax === 'z' ? sg : 0], { dn: r, fluide })
}

enregistrer({
  id: 'chaufferie.chaudiere', famille: 'Chaufferie', nom: 'Chaudière (hublot de flamme, brûleur, cheminée)',
  taille: () => [118, 62, 118], defauts: { dn: 5, fluide: 'eau_chaude_aller' }, planche: PL,
  dessiner(b: Builder, p: Params) {
    const D = 62, W = 78, r = p.dn
    socle(b, 0, 0, W, D, 6)
    const cs = b.box(2, 3, 6, W - 4, D - 6, 72, 'mb')
    // panneaux de jaquette
    b.pl('xz', D - 3, [0.5].map((k) => l2(2 + (W - 4) * k, 6, 2 + (W - 4) * k, 78, 'ed2')).join('') + l2(2, 72, W - 2, 72, 'ed2') + r2(2, 6, W - 4, 72, 'ed'), cs)
    b.pl('yz', W - 2, l2(D / 2, 6, D / 2, 78, 'ed2') + l2(3, 72, D - 3, 72, 'ed2'), cs)
    // porte de brûleur + hublot : flamme animée
    b.cylY(30, D - 3, 34, 15, 2.6, 'mm')
    const door = b.cylY(30, D - 3, 34, 15, 2.6, 'mm')
    b.pl('xz', D - 0.4, c2(30, 34, 15, 'ed') + c2(30, 34, 9.4, 'fk') + `<g class="flame"><path class="fo" d="M30 25.5C25 31 25.5 36 27.6 38.5C29 40.2 31 40.2 32.4 38.5C34.5 36 35 31 30 25.5Z"/><path class="fr" style="opacity:.0"/><path class="fa" style="fill:var(--i-warn)" d="M30 31C28 34 28.4 36.4 29.6 37.6C30.4 38.4 31.6 38.4 32.2 37.4C32.8 36 32.2 33.6 30 31Z"/></g>` + c2(30, 34, 9.4, 'ed'), door)
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; b.pl('xz', D - 0.4, c2(30 + Math.cos(a) * 12.4, 34 + Math.sin(a) * 12.4, 0.9, 'fd'), door) }
    // tableau de commande sur le dessus
    const tb = b.box(10, 8, 78, 26, 20, 8, 'mm')
    b.pl('xy', 86, r2(13, 11, 14, 6, 'fk', 1) + r2(14, 12.4, 6, 1.6, 'fa', .3) + c2(31, 14, 1.6, 'led') + c2(31, 20, 1.6, 'fm'), tb)
    b.led([31, 14, 86], tb, 1.5)
    // départs/retours (dessus) + gaz (côté) + cheminée
    piq(b, 'aller', [14, D / 2, 78], 'z', 1, 18, r, 'eau_chaude_aller')
    piq(b, 'retour', [58, D / 2, 78], 'z', 1, 18, r, 'eau_chaude_retour')
    const ch = b.cylZ(40, 12, 78, 9, 14, 'mb'); b.rings(ch, [40, 12, 78], [40, 12, 92], 9, [0.5])
    b.cylZ(40, 12, 92, 10.4, 2.4, 'mm')
    b.port('fumees', [40, 12, 94.4], [0, 0, 1], { dn: 9, fluide: 'fumees' })
    // brûleur côté +x : bride + carter + ventilateur
    b.cylX(W - 2, D / 2 + 2, 34, 15, 6, 'mm')
    const br = b.cylX(W + 4, D / 2 + 2, 34, 12, 22, 'mb'); b.rings(br, [W + 4, D / 2 + 2, 34], [W + 26, D / 2 + 2, 34], 12, [0.5])
    const vf = b.cylX(W + 26, D / 2 + 2, 34, 15, 14, 'mm')
    b.pl('yz', W + 40, c2(D / 2 + 2, 34, 12.6, 'ed2') + c2(D / 2 + 2, 34, 8, 'ed2'), vf)
    b.box(W + 8, D / 2 - 8, 46, 14, 12, 8, 'mm')
    b.cylZ(W + 14, D / 2 - 2, 54, 2.4, 6, 'md')
    b.led([W + 18, D / 2 + 3, 54], vf, 1.4)
    piq(b, 'gaz', [W + 14, D / 2 + 2 - 0, 22], 'y', 1, 10, 3.2, 'gaz')
    b.anchor('badge', [40, D / 2, 112]); b.anchor('haut', [40, D / 2, 94])
  },
})

enregistrer({
  id: 'chaufferie.bruleur', famille: 'Chaufferie', nom: 'Brûleur gaz / fioul (soufflé)',
  taille: () => [64, 40, 44], defauts: { fluide: 'gaz' }, planche: PL,
  dessiner(b: Builder, p: Params) {
    const cy = 20, zc = 22
    b.cylX(0, cy, zc, 15, 4, 'mm')
    const t = b.cylX(4, cy, zc, 11, 18, 'mb'); b.rings(t, [4, cy, zc], [22, cy, zc], 11, [0.5])
    const v = b.cylX(22, cy, zc, 15, 18, 'mm')
    b.rings(v, [22, cy, zc], [40, cy, zc], 15, [0.5])
    b.pl('yz', 40, c2(cy, zc, 12.6, 'ed2') + c2(cy, zc, 8, 'ed2') + l2(cy - 12, zc, cy + 12, zc, 'ed2'), v)
    b.box(10, cy - 8, 33, 16, 16, 7, 'mm')
    const mo = moteurX(b, 40, cy, zc, 9, 16, { bornes: false, pieds: false, cowl: false })
    void mo
    b.cylZ(14, cy + 2, 38, 3, 6, 'md')
    b.port('gaz', [14, cy + 14, 12], [0, 1, 0], { dn: 3, fluide: 'gaz' })
    b.cylY(14, cy + 2, 12, 3, 12, 'mm')
  },
})

enregistrer({
  id: 'chaufferie.cheminee', famille: 'Chaufferie', nom: 'Cheminée / conduit de fumées',
  taille: (p) => [40, 40, p.h ?? 150], defauts: { h: 150, r: 9, fluide: 'fumees' }, planche: [['arret'], ['marche'], ['alarme'], ['defaut'], ['inconnu']],
  dessiner(b: Builder, p: Params) {
    const r = p.r, h = p.h
    b.cylZ(20, 20, 0, r + 2.4, 3, 'mm')
    const t = b.cylZ(20, 20, 3, r, h - 6, 'mb')
    b.rings(t, [20, 20, 3], [20, 20, h - 3], r, Array.from({ length: Math.floor(h / 22) }, (_, i) => (i + 1) / (Math.floor(h / 22) + 1)), 'ed2')
    b.cylZ(20, 20, h - 3, r + 1.6, 3, 'mm', r + 3)
    // trappe de visite + prise de mesure
    b.cylY(20, 20 + r - 0.5, 20, 2.2, 6, 'mm'); b.cylY(20, 20 + r + 5.5, 20, 3.2, 1.6, 'md')
    b.port('base', [20, 20, 0], [0, 0, -1], { dn: r, fluide: 'fumees' })
    b.anchor('badge', [20, 20, h + 14])
  },
})

enregistrer({
  id: 'chaufferie.pac', famille: 'Chaufferie', nom: 'Pompe à chaleur air/eau (grille frontale ronde, ventilateur à axe horizontal)', statut: 'revu',
  taille: () => [90, 52, 62], defauts: { dn: 4, fluide: 'eau_chaude_aller' }, planche: PL,
  dessiner(b: Builder, p: Params) {
    const W = 90, D = 52, H = 52, r = p.dn
    socle(b, 0, 0, W, D, 5)
    const cs = b.box(2, 2, 5, W - 4, D - 4, H, 'mb')
    // face +y : grille ronde (le ventilateur est DERRIÈRE, axe horizontal y) ; coffret technique à droite
    const cx = 32, cz = 5 + H / 2, R = 20
    const g = b.cylY(cx, D - 2, cz, R + 2.5, 2.5, 'mm') // carter (ellipse dans le plan xz)
    b.pl('xz', D + 0.55, c2(cx, cz, R, 'fk') + `<g transform="translate(${cx} ${cz})">${helice(R - 4, 5, 'fm')}</g>`, g)
    b.pl('xz', D + 0.6, `<g transform="translate(${cx} ${cz})">${grille(R, 3, 12)}</g>`, g)
    b.pl('xz', D - 1.95, r2(62, 12, 22, 40, 'fm', 0.8) + c2(73, 40, 1.8, 'led') + r2(66, 18, 14, 8, 'fk', 0.6), cs)
    // flanc +x : fentes de ventilation (côté échangeur)
    b.pl('yz', W - 1.95, [0, 1, 2, 3, 4].map((i) => l2(8, 14 + i * 8, D - 8, 14 + i * 8, 'ed2')).join(''), cs)
    // piquages eau côté +x (aller haut / retour bas)
    piq(b, 'aller', [W - 2, 14, 38], 'x', 1, 12, r, 'eau_chaude_aller')
    piq(b, 'retour', [W - 2, 14, 18], 'x', 1, 12, r, 'eau_chaude_retour')
    b.anchor('badge', [W / 2, D / 2, 5 + H + 14])
  },
})

enregistrer({
  id: 'chaufferie.groupe_froid', famille: 'Chaufferie', nom: 'Groupe froid / dry cooler (ventilateurs sur le dessus)', statut: 'revu',
  taille: () => [150, 64, 86], defauts: { dn: 5, fluide: 'eau_glacee' }, planche: PL,
  dessiner(b: Builder, p: Params) {
    const W = 150, D = 64, H = 56, r = p.dn
    socle(b, 0, 0, W, D, 6)
    const cs = b.box(2, 2, 6, W - 4, D - 4, H, 'mb')
    let g = ''
    for (const x0 of [6, 84]) { g += r2(x0, 10, 56, 44, 'in') + r2(x0, 10, 56, 44, 'ed'); for (let x = x0 + 3; x < x0 + 55; x += 2.6) g += l2(x, 12, x, 52, 'ed2') }
    b.pl('xz', D - 2, g + r2(64, 10, 16, 44, 'ed2') + r2(66, 12, 12, 8, 'fk', 1) + c2(72, 28, 1.7, 'led') + l2(66, 36, 78, 36, 'ed2') + l2(66, 42, 78, 42, 'ed2'), cs)
    for (const [i, cx] of [[0, 34], [1, 112]] as const) {
      const cy = 32, R = 21
      const v = b.cylZ(cx, cy, 6 + H, R + 2, 5, 'mm')
      b.pl('xy', 6 + H + 5, `<g transform="translate(${cx} ${cy})">${c2(0, 0, R, 'in')}</g>`, v)
      b.rotor('xy', 6 + H + 5.1, cx, cy, helice(R - 2, 5, 'fm'), v, 1.1 + i * 0.15)
      b.pl('xy', 6 + H + 5.2, `<g transform="translate(${cx} ${cy})">${grille(R, 3, 12)}</g>`, v)
    }
    // évaporateur : piquages eau glacée sur +x
    piq(b, 'retour', [W - 2, 18, 20], 'x', 1, 12, r, 'eau_glacee')
    piq(b, 'depart', [W - 2, 18, 44], 'x', 1, 12, r, 'eau_glacee')
    b.anchor('badge', [75, 32, 6 + H + 22])
  },
})

enregistrer({
  id: 'chaufferie.tour_aero', famille: 'Chaufferie', nom: 'Tour aéroréfrigérante (ventilateur sur cheminée)',
  taille: () => [90, 90, 120], defauts: { dn: 5, fluide: 'eau' }, planche: PL,
  dessiner(b: Builder, p: Params) {
    const r = p.dn
    b.box(4, 4, 0, 82, 82, 8, 'mm')
    const cs = b.box(8, 8, 8, 74, 74, 54, 'mb')
    // persiennes d'entrée d'air + remplissage
    const lou = (n: number) => Array.from({ length: n }, (_, i) => d2(`M4 ${10 + i * 4.6}H70V${12.6 + i * 4.6}H4Z`, 'fm')).join('')
    b.pl('xz', 82, r2(4, 8, 66, 46, 'in') + lou(10), cs)
    b.pl('yz', 82, r2(4, 8, 66, 46, 'in') + lou(10), cs)
    // cheminée de ventilateur
    const ch = b.cylZ(45, 45, 62, 24, 28, 'mb', 20)
    b.rings(ch, [45, 45, 62], [45, 45, 90], 24, [0.5], 'ed2')
    const v = b.cylZ(45, 45, 90, 20, 4, 'mm')
    b.pl('xy', 94, `<g transform="translate(45 45)">${c2(0, 0, 18, 'in')}</g>`, v)
    b.rotor('xy', 94.1, 45, 45, helice(17, 6, 'fm'), v, 1)
    b.pl('xy', 94.2, `<g transform="translate(45 45)">${grille(18, 2, 10)}</g>`, v)
    // piquages bassin
    piq(b, 'aller', [82, 30, 46], 'x', 1, 10, r, 'eau')
    piq(b, 'retour', [82, 56, 14], 'x', 1, 10, r, 'eau')
    b.anchor('badge', [45, 45, 112])
  },
})

enregistrer({
  id: 'chaufferie.collecteur', famille: 'Chaufferie', nom: 'Collecteur aller / retour multi-départs',
  taille: (p) => [(p.n ?? 3) * (p.pas ?? 56) + 30, 54, 74], defauts: { n: 3, pas: 56, dn: 6, fluide: 'eau_chaude_aller' }, variantes: ['n=2..6', 'aller|retour'], planche: [['arret'], ['marche'], ['alarme'], ['defaut'], ['inconnu']],
  dessiner(b: Builder, p: Params) {
    const n = p.n, pas = p.pas, L = n * pas + 30, r = p.dn * 1.9, rd = p.dn
    const ret = p.fluide === 'eau_chaude_retour'
    const zc = 36
    // supports
    for (const x of [14, L - 14]) { b.box(x - 5, 20, 0, 10, 14, zc - r, 'mm'); b.box(x - 7, 18, 0, 14, 18, 2.4, 'mm') }
    const co = b.cylX(2, 27, zc, r, L - 4, 'mb')
    b.rings(co, [2, 27, zc], [L - 2, 27, zc], r, [0.08, 0.92], 'ed2')
    b.flange([0, 27, zc], 'x', r * 1.3, 3, 8); b.flange([L - 3, 27, zc], 'x', r * 1.3, 3, 8)
    b.port('in', [0, 27, zc], [-1, 0, 0], { dn: r, fluide: p.fluide })
    b.port('fin', [L, 27, zc], [1, 0, 0], { dn: r, fluide: p.fluide })
    for (let i = 0; i < n; i++) {
      const x = 15 + pas * (i + 0.5)
      b.cylY(x, 27, zc, rd, 22, 'mm')
      b.flange([x, 27 + 19, zc], 'y', rd * 1.8, 3, 6)
      b.cylY(x, 27 + 10, zc, rd * 1.3, 2.4, 'ma')
      b.port('dep' + (i + 1), [x, 27 + 22, zc], [0, 1, 0], { dn: rd, fluide: p.fluide })
    }
    // thermomètre + purge
    b.cylZ(18, 27, zc + r - 1, 1.6, 8, 'mm'); b.cylZ(L - 22, 27, zc + r - 1, 2.6, 6, 'md')
    b.anchor('badge', [L / 2, 27, zc + r + 16]); b.anchor('haut', [L / 2, 27, zc + r])
  },
})

enregistrer({
  id: 'chaufferie.compteur_energie', famille: 'Chaufferie', nom: "Compteur d'énergie (débitmètre + calculateur)",
  taille: () => [64, 44, 70], defauts: { dn: 5, fluide: 'eau_chaude_aller' }, planche: PL.slice(0, 2).concat([['alarme'], ['defaut'], ['consigne', { manuel: true }], ['inconnu'], ['marche', {}, 90]]),
  dessiner(b: Builder, p: Params) {
    const cy = 22, zc = 16, r = p.dn
    inline(b, 64, cy, zc, r)
    const co = b.cylX(18, cy, zc, r * 2.1, 28, 'mb')
    b.rings(co, [18, cy, zc], [46, cy, zc], r * 2.1, [0.18, 0.82], 'ed2')
    b.cylZ(32, cy, zc + r * 2.1 - 1, 3, 8, 'mm')
    const calc = b.box(20, cy - 10, zc + 20, 24, 20, 13, 'mb')
    b.pl('xz', cy + 10, r2(23, zc + 24, 18, 7, 'fk', 1.2) + r2(25, zc + 26, 8, 1.6, 'fa', .3) + r2(25, zc + 28.6, 12, 1, 'ed2') + c2(25, zc + 22.4, 1.2, 'fm') + c2(29, zc + 22.4, 1.2, 'fm'), calc)
    b.pl('yz', 44, r2(cy - 8, zc + 22, 16, 9, 'ed2'), calc)
    b.led([40, cy + 10, zc + 22.4], calc, 1.3)
    // sondes de température aller / retour : doigts de gant
    b.cylZ(8, cy, zc + r * 1.2 - 1, 1.4, 12, 'mm'); b.cylZ(8, cy, zc + r * 1.2 + 10, 2.4, 3, 'md')
    b.path3([[8, cy, zc + 24], [8, cy, zc + 28], [20, cy - 6, zc + 28]], 'ed2')
    b.anchor('badge', [32, cy, zc + 44])
  },
})

// ───────────── accessoires de collecteur : bouchon + purge d'extrémité, purgeur d'air, console de support
const AXL: Record<string, [number, number, number]> = { 'x+': [1, 0, 0], 'x-': [-1, 0, 0], 'y+': [0, 1, 0], 'y-': [0, -1, 0], 'z+': [0, 0, 1], 'z-': [0, 0, -1] }

/** Fond de collecteur : bride pleine (obturateur) + robinet de purge / vidange sur la face. Même convention de port que `raccord.bout` : le tuyau arrive au port ; le fond est derrière. */
enregistrer({
  id: 'raccord.bouchon', famille: 'Chaufferie', nom: 'Fond de collecteur : bride pleine + purge',
  taille: () => [30, 30, 30], defauts: { dn: 5, dir: 'x-', fluide: 'eau', purge: true, sansMarqueur: true }, variantes: ['dir=x+|x-|y+|y-', 'purge=true|false'], planche: [['arret']],
  dessiner(b: Builder, p: Params) {
    const r = p.dn, d = AXL[p.dir] ?? AXL['x-']
    const c: [number, number, number] = [15, 15, 15]
    const e: [number, number, number] = [c[0] + d[0] * 2, c[1] + d[1] * 2, c[2] + d[2] * 2]     // port
    const ax = (Math.abs(d[0]) > 0.5 ? 'x' : 'y') as 'x' | 'y', sg = (d[0] + d[1] > 0 ? -1 : 1) as 1 | -1
    const t = 4.4, rb = r * 1.9
    // bride pleine : derrière le port (la bride du tuyau est dessinée par la liaison, du côté tuyau)
    b.flange(e, ax, rb, t, r < 4.4 ? 4 : 6, 'mm', sg)
    const ext = (k: number): [number, number, number] => [e[0] - d[0] * (t + k), e[1] - d[1] * (t + k), e[2] - d[2] * (t + k)]
    if (p.purge) {
      b.cyl(ext(0), ext(3.4), 1.7, 'mm')                    // piquage fileté sur la bride pleine
      b.cyl(ext(3.4), ext(7.6), 2.9, 'mb')                  // corps du robinet
      // levier à 90° (vertical) + bouton
      const m = ext(5.5)
      b.cyl(m, [m[0], m[1], m[2] + 8], 0.8, 'md'); b.cyl([m[0], m[1], m[2] + 8], [m[0], m[1], m[2] + 9.6], 1.7, 'mg')
      b.cyl(ext(7.6), ext(10), 1.2, 'md')                   // embout cannelé
    }
    b.port('p', e, d, { dn: r, fluide: p.fluide })
    b.anchor('haut', [c[0], c[1], c[2] + 6])
  },
})

/** Purgeur d'air automatique sur un collecteur (piquage sur le dessus) */
enregistrer({
  id: 'chaufferie.purgeur', famille: 'Chaufferie', nom: "Purgeur d'air automatique (sur piquage, robinet d'isolement)",
  taille: () => [20, 20, 40], defauts: { fluide: 'eau' }, planche: [['arret'], ['marche']],
  dessiner(b: Builder, p: Params) {
    const cx = 10, cy = 10
    b.cylZ(cx, cy, 0, 3.8, 5, 'mm')                              // robinet d'isolement
    b.cylX(cx - 5, cy, 2.5, 0.8, 10, 'md'); b.cylX(cx - 7, cy, 2.5, 1.5, 2, 'mb')
    b.cylZ(cx, cy, 5, 2.2, 3, 'mm')                              // raccord
    const co = b.cylZ(cx, cy, 8, 5.4, 14, 'mb')                  // corps du flotteur
    b.rings(co, [cx, cy, 8], [cx, cy, 22], 5.4, [0.35])
    b.cylZ(cx, cy, 22, 3.6, 3, 'mm')                             // capuchon
    b.cylZ(cx, cy, 25, 1.4, 4, 'md')
    b.port('proc', [cx, cy, 0], [0, 0, -1], { dn: 2.2 })
    b.anchor('badge', [cx, cy, 30])
  },
})

/** Console de collecteurs : traverse en U sous les tuyaux (axe y), deux pieds sur platine, un berceau sous chaque tuyau (cales à la hauteur de chacun).
 *  params.ys = positions y des tuyaux (relatives au composant), zs = hauteur de l'axe de chaque tuyau, r = rayon des tuyaux. */
enregistrer({
  id: 'chaufferie.console', famille: 'Chaufferie', nom: 'Console / support de collecteurs (traverse + 2 pieds + berceaux)',
  taille: (p) => [16, Math.max(...(p.ys ?? [0, 80])) + 24, Math.max(...(p.zs ?? [60]))], defauts: { ys: [12, 92], zs: [60, 30], r: 5, sansMarqueur: true }, planche: [['arret']],
  dessiner(b: Builder, p: Params) {
    const ys: number[] = p.ys, zs: number[] = p.zs, r: number = p.r
    const y0 = Math.min(...ys) - 12, y1 = Math.max(...ys) + 12
    const zbas = Math.min(...zs) - r - 3.2                          // dessus de la traverse = sous le berceau le plus bas
    for (const y of [y0 + 3, y1 - 3]) {
      b.box(2, y - 6, 0, 12, 12, 2, 'mm')                          // platine
      b.box(5.5, y - 2.5, 2, 5, 5, zbas - 5 - 2, 'mb')            // pied
    }
    b.box(3.5, y0, zbas - 5, 9, y1 - y0, 5, 'mb')                  // traverse
    ys.forEach((y, i) => {
      const zt = zs[i] - r - 3.2
      if (zt > zbas + 0.5) b.box(5.5, y - 2.5, zbas, 5, 5, zt - zbas, 'mb')   // cale sous le tuyau le plus haut
      b.box(2.5, y - r - 1.6, zt, 11, 2 * r + 3.2, 3.2, 'mm')                   // berceau
    })
    b.anchor('haut', [8, (y0 + y1) / 2, Math.max(...zs)])
  },
})

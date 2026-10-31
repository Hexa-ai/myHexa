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
  id: 'traitement.echangeur_plaques', famille: 'Traitement', nom: 'Échangeur à plaques (bâti, tirants, 4 piquages en plaque d\'extrémité)', statut: 'revu',
  taille: (p) => [(p.n ?? 20) * 2.8 + 52, 54, 104], defauts: { n: 20, dn: 4, fluide: 'eau_chaude_aller' }, variantes: ['n=8..40'], planche: [['arret'], ['marche'], ['alarme'], ['defaut'], ['consigne'], ['inconnu'], ['marche', {}, 90]],
  dessiner(b: Builder, p: Params) {
    const n = p.n, T = n * 2.8, x0 = 12, r = p.dn
    const xf = x0 + 5 + T + 2                                   // plaque fixe (côté +x, face visible) : porte les 4 piquages
    // plaque mobile à gauche (x0), paquet de plaques, plaque fixe à droite : grandes faces dans le plan y-z, vues de côté
    b.box(x0 - 6, 4, 0, T + 28, 46, 5, 'mm')                       // longeron de pied
    b.box(x0, 8, 5, 4, 38, 90, 'mm')
    const pk = b.box(x0 + 5, 10, 8, T, 34, 84, 'mb')
    let s = ''
    for (let i = 0; i <= n; i++) s += l2(x0 + 5 + (T * i) / n, 8, x0 + 5 + (T * i) / n, 90, i % 2 ? 'ed2' : 'ed')
    b.pl('xz', 44, s, pk)
    b.box(xf, 8, 5, 5, 38, 90, 'mm')
    // 2 barres porteuses (haute et basse) + tirants aux 4 coins, écrous côté mobile
    for (const z of [98, 3]) b.cylX(x0 - 4, 27, z, 1.8, xf - x0 + 14, 'mm')
    for (const [y, z] of [[11, 14], [11, 86], [43, 14], [43, 86]] as const) { b.cylX(x0 - 3, y, z, 1.3, xf - x0 + 4, 'md'); b.cylX(x0 - 3, y, z, 2.3, 2.5, 'mm') }
    // 4 piquages COAXIAUX (axe x) sur la face +x de la plaque fixe, en rectangle propre
    buse(b, 'prim_in', [xf + 5, 17, 76], 'x', 1, 10, r, 'eau_chaude_aller')
    buse(b, 'prim_out', [xf + 5, 17, 20], 'x', 1, 10, r, 'eau_chaude_retour')
    buse(b, 'sec_out', [xf + 5, 37, 76], 'x', 1, 10, r, 'eau')
    buse(b, 'sec_in', [xf + 5, 37, 20], 'x', 1, 10, r, 'eau')
    b.anchor('badge', [x0 + T / 2, 27, 114]); b.anchor('haut', [x0 + T / 2, 27, 104])
  },
})

enregistrer({
  id: 'traitement.echangeur_tubulaire', famille: 'Traitement', nom: 'Échangeur tubulaire (calandre, boîte de tête)', statut: 'revu',
  taille: () => [150, 56, 78], defauts: { dn: 4, fluide: 'vapeur' }, planche: [['arret'], ['marche'], ['alarme'], ['defaut'], ['consigne'], ['inconnu'], ['marche', {}, 90]],
  dessiner(b: Builder, p: Params) {
    const cy = 28, zc = 34, r = p.dn
    for (const x of [34, 112]) { b.box(x - 7, cy - 14, 0, 14, 28, zc - 17, 'mm'); b.box(x - 9, cy - 15, 0, 18, 30, 2, 'mm') }
    // calandre + brides de plaque tubulaire, coaxiales à la calandre
    const sh = b.cylX(20, cy, zc, 17, 112, 'mb'); b.rings(sh, [20, cy, zc], [132, cy, zc], 17, [0.25, 0.5, 0.75], 'ed2')
    b.flange([20, cy, zc], 'x', 20.5, 3, 12); b.flange([129, cy, zc], 'x', 20.5, 3, 12)
    // boîte de tête (gauche, 2 tubulures) et fond bombé (droite)
    const bt = b.cylX(4, cy, zc, 17, 16, 'mb'); b.rings(bt, [4, cy, zc], [20, cy, zc], 17, [0.5], 'ed2')
    b.cylX(132, cy, zc, 17, 12, 'mb', 9); b.cylX(144, cy, zc, 9, 3, 'mm')
    // 2 piquages de calandre (côté fluide chaud) : entrée dessus, sortie dessous, verticaux
    buse(b, 'prim_in', [76, cy, zc + 17], 'z', 1, 13, r * 1.2, 'vapeur')
    buse(b, 'prim_out', [100, cy, zc - 17], 'z', -1, 11, r, 'condensat')
    // 2 tubulures de la boîte de tête (fluide dans les tubes) : entrée dessus, sortie dessous, au même x
    buse(b, 'sec_in', [12, cy, zc + 17], 'z', 1, 13, r, 'eau')
    buse(b, 'sec_out', [12, cy, zc - 17], 'z', -1, 11, r, 'eau_chaude_aller')
    b.anchor('badge', [75, cy, zc + 48])
  },
})

enregistrer({
  id: 'traitement.separateur', famille: 'Traitement', nom: 'Séparateur (hydrocyclone / dégazeur vertical)', statut: 'revu',
  taille: () => [70, 70, 128], defauts: { dn: 4, fluide: 'eau' }, planche: PL.slice(0, 6),
  dessiner(b: Builder, p: Params) {
    const cx = 35, cy = 35, r = 18
    for (const [dx, dy] of [[1, 0], [-0.5, 0.87], [-0.5, -0.87]]) { b.cylZ(cx + dx * r * 0.7, cy + dy * r * 0.7, 0, 2.4, 26, 'mm'); b.box(cx + dx * r * 0.7 - 4, cy + dy * r * 0.7 - 4, 0, 8, 8, 1.6, 'mm') }
    // cône (bas) + fût + dôme, tous d'axe z
    b.cylZ(cx, cy, 20, 4, 14, 'mb', r)
    const f = b.cylZ(cx, cy, 34, r, 52, 'mb'); b.rings(f, [cx, cy, 34], [cx, cy, 86], r, [0.5], 'ed2')
    b.cylZ(cx, cy, 86, r, 12, 'mb', r * 0.4)
    // 3 piquages coaxiaux à leurs brides : entrée (paroi +y), sortie haute (axe), purge basse (axe)
    buse(b, 'e', [cx, cy + r, 68], 'y', 1, 12, p.dn, 'eau')
    buse(b, 's', [cx, cy, 98], 'z', 1, 12, p.dn, 'eau')
    buse(b, 'd', [cx, cy, 20], 'z', -1, 10, p.dn * 0.8, 'boues')
    b.anchor('badge', [cx, cy, 124])
  },
})

enregistrer({
  id: 'traitement.centrifugeuse', famille: 'Traitement', nom: 'Décanteur centrifuge horizontal (moteur, réducteur, bol sous carter)', statut: 'revu',
  taille: () => [150, 56, 78], defauts: { dn: 4, fluide: 'boues' }, planche: PL,
  dessiner(b: Builder, p: Params) {
    const cy = 28, zc = 32
    socle(b, 0, 2, 150, 52, 6)
    b.box(52, cy - 14, 6, 14, 28, zc - 17, 'mm'); b.box(104, cy - 14, 6, 14, 28, zc - 17, 'mm')
    // chaîne cinématique à gauche (moteur → réducteur → accouplement), bol sous carter à droite, alimentation axiale en bout visible (+x)
    moteurX(b, 4, cy, zc, 11, 22, { cowl: true, fan: true })
    b.cylX(26, cy, zc, 10, 14, 'mb'); b.cylX(40, cy, zc, 12, 6, 'mm')
    const car = b.cylX(46, cy, zc, 18, 78, 'mb'); b.rings(car, [46, cy, zc], [124, cy, zc], 18, [0.25, 0.5, 0.75], 'ed2')
    b.cylX(124, cy, zc, 18, 8, 'mm', 12)
    // 3 piquages coaxiaux : alimentation axiale (+x), liquide clarifié dessus, solides dessous
    buse(b, 'e', [132, cy, zc], 'x', 1, 14, p.dn, 'boues')
    buse(b, 'liquide', [68, cy, zc + 18], 'z', 1, 12, p.dn, 'eau_traitee')
    buse(b, 'solides', [100, cy, zc - 18], 'z', -1, 10, p.dn * 1.4, 'boues')
    b.anchor('badge', [75, cy, zc + 44])
  },
})

/** Séparateur centrifuge à bol vertical type Alfa Laval (laiterie, agro) : bâti avec moteur dessous, carter de bol, capot, entrée en tête, 2 sorties (phase légère / lourde). */
enregistrer({
  id: 'traitement.separateur_centrifuge', famille: 'Traitement', nom: 'Séparateur centrifuge à bol vertical (type laiterie)', statut: 'revu',
  taille: () => [70, 70, 112], defauts: { dn: 3, fluide: 'neutre' }, planche: PL,
  dessiner(b: Builder, p: Params) {
    const cx = 35, cy = 35
    // bâti : socle large + corps cylindrique renfermant le moteur (grille de ventilation et plaque signalétique), axe z
    b.cylZ(cx, cy, 0, 27, 3, 'mm')
    const ba = b.cylZ(cx, cy, 3, 24, 26, 'mb'); b.rings(ba, [cx, cy, 3], [cx, cy, 29], 24, [0.55], 'ed2')
    b.pl('xz', cy + 24, r2(cx - 10, 8, 20, 3, 'fk', 0.8) + r2(cx - 10, 14, 20, 3, 'fk', 0.8) + r2(cx - 4, 21, 8, 3.4, 'fa', 0.6) + c2(cx + 8, 23, 1.2, 'led'), ba)
    b.led([cx + 8, cy + 24, 23], ba, 1.3)
    // collerette puis carter de bol
    b.cylZ(cx, cy, 29, 21, 3, 'mm')
    const ca = b.cylZ(cx, cy, 32, 19, 30, 'mb'); b.rings(ca, [cx, cy, 32], [cx, cy, 62], 19, [0.5], 'ed2')
    // capot : épaulement + dôme ; entrée axiale en tête, collerettes de sortie légère (+x) et lourde (+y)
    b.cylZ(cx, cy, 62, 21, 3, 'mm')
    b.cylZ(cx, cy, 65, 18, 18, 'mb', 9)
    b.cylZ(cx, cy, 83, 9, 3, 'mm')
    buse(b, 'e', [cx, cy, 86], 'z', 1, 14, p.dn, 'neutre')
    buse(b, 'leger', [cx + 18, cy, 50], 'x', 1, 12, p.dn, 'neutre')
    buse(b, 'lourd', [cx, cy + 18, 40], 'y', 1, 12, p.dn, 'neutre')
    b.anchor('badge', [cx, cy, 106])
  },
})

enregistrer({
  id: 'traitement.uv', famille: 'Traitement', nom: 'Réacteur UV (désinfection) + boîtier de ballast', statut: 'revu',
  taille: () => [116, 50, 66], defauts: { dn: 4, fluide: 'eau_traitee' }, planche: PL,
  dessiner(b: Builder, p: Params) {
    const cy = 25, zc = 26
    for (const x of [26, 88]) b.box(x - 5, cy - 11, 0, 10, 22, zc - 12, 'mm')
    // chambre inox : tube horizontal unique, brides coaxiales aux deux bouts (tube, brides et piquages sur le même axe)
    const re = b.cylX(3, cy, zc, 12, 110, 'mb'); b.rings(re, [3, cy, zc], [113, cy, zc], 12, [0.5], 'ed2')
    b.flange([0, cy, zc], 'x', 15.5, 3, 8); b.flange([113, cy, zc], 'x', 15.5, 3, 8)
    b.port('e', [0, cy, zc], [-1, 0, 0], { dn: p.dn, fluide: 'eau_traitee' }); b.port('s', [116, cy, zc], [1, 0, 0], { dn: p.dn, fluide: 'eau_traitee' })
    // fenêtre de contrôle : lampe violette
    b.pl('xz', cy + 12.05, r2(24, zc - 3, 66, 6, 'fk', 3) + `<g class="uv">${r2(26, zc - 1.4, 62, 2.8, 'fa', 1.4)}</g>`, re)
    // boîtier de ballast sur le dessus, relié par un col
    b.cylZ(58, cy, zc + 11, 3, 6, 'mm')
    const bx = b.box(44, cy - 7, zc + 16, 28, 14, 14, 'mm')
    b.pl('xz', cy + 7, r2(47, zc + 19, 14, 7, 'fk', 1) + c2(66, zc + 24, 1.4, 'led'), bx)
    b.led([66, cy + 7, zc + 24], bx, 1.4)
    b.anchor('badge', [58, cy, zc + 42])
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
/** Convoyeur à bande EXTENSIBLE : un module central de pas fixe PAS_CB est répété n fois ; la tête (tambour de renvoi) et la queue (tambour moteur) ne changent jamais.
 *  Paramètre `longueur` (alias `l`, longueur souhaitée du plateau) : arrondie au nombre entier de modules. */
export const CONVOYEUR = { TETE: 24, PAS: 28, ENTRETIEN: 0 }
export function convoyeurLongueur(p: Params): { n: number; Lb: number } {
  const want = Number(p.longueur ?? p.l ?? 150)
  const n = Math.max(1, Math.round((want - CONVOYEUR.TETE) / CONVOYEUR.PAS))
  return { n, Lb: CONVOYEUR.TETE + n * CONVOYEUR.PAS }
}
enregistrer({
  id: 'meca.convoyeur_bande', famille: 'Mécanique', nom: 'Convoyeur à bande (longueur paramétrable)', statut: 'revu',
  taille: (p) => [convoyeurLongueur(p).Lb + 22, 40, 52], defauts: { longueur: 150 }, variantes: ['longueur=52..600 (pas de 28)'], planche: PL,
  dessiner(b: Builder, p: Params) {
    const { n, Lb } = convoyeurLongueur(p), y0 = 6, w = 28, P = CONVOYEUR.PAS
    // pieds : un portique tous les PAS, le premier à 12 de la tête, le dernier à 12 de la queue
    for (let i = 0; i <= n; i++) { const x = 12 + i * P; b.box(x, y0 + 1, 0, 3, 3, 24, 'mm'); b.box(x, y0 + w - 4, 0, 3, 3, 24, 'mm'); b.box(x - 1, y0 - 1, 0, 5, w + 2, 2, 'mm') }
    // longerons + bande sur toute la longueur
    b.box(8, y0, 24, Lb - 4, 3, 4, 'mm'); b.box(8, y0 + w - 3, 24, Lb - 4, 3, 4, 'mm')
    const bd = b.box(8, y0 + 3, 26, Lb - 4, w - 6, 3, 'md')
    // rouleaux (traits en travers) à pas fixe de PAS/2, symétriques tête / queue
    let rl = ''
    for (let k = 0; k <= 2 * n; k++) { const x = 12 + k * P / 2; rl += l2(x, y0 + 4, x, y0 + w - 4, 'ed2') }
    b.pl('xy', 29, `<g class="cflow">${[0.3, 0.5, 0.7].map((k) => `<path class="flow air" d="M12 ${y0 + w * k}H${Lb - 8}"/>`).join('')}</g>` + rl, bd)
    // tambours : renvoi en tête (x = 6), moteur en queue (x = Lb - 2)
    b.cylY(10, y0 - 2, 27, 5, w + 4, 'mm'); b.cylY(Lb + 2, y0 - 2, 27, 5, w + 4, 'mm')
    // motoréducteur en queue (toujours à la même distance de l'extrémité)
    moteurX(b, Lb + 6, y0 + w + 6, 27, 6, 12, { bornes: false, pieds: false, cowl: false })
    b.box(Lb - 6, y0 + w, 24, 10, 8, 6, 'mb')
    // arrêt d'urgence par câble : poteaux aux deux extrémités, câble continu
    b.path3([[14, y0 - 2, 36], [Lb - 4, y0 - 2, 36]], 'ed2')
    b.cylZ(14, y0 - 2, 28, 1, 8, 'mm'); b.cylZ(Lb - 4, y0 - 2, 28, 1, 8, 'mm')
    b.anchor('badge', [Lb / 2, y0 + w / 2, 42])
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

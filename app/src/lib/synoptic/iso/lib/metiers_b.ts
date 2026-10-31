/* eslint-disable */
// @ts-nocheck — catalogue de dessin (voir iso/README.md)
// Familles « Informatique et réseau », « Énergie », « Industrie extérieure » et « Eau ».
// Sobriété : silhouette reconnaissable, 3 tons, 2 ou 3 détails signifiants ; aucun support, aucune boulonnerie.
import { enregistrer } from './registre'
import { Builder } from './iso'
import type { Params } from './types'
import { PL5, PL2, VAR_COULEUR, teinte, ancres, conteneur, voiture, r2, l2, p2, c2 } from './metiers_commun'

const centre = (b: Builder, W: number, D: number, h: number) => b.anchor('badge', [W / 2, D / 2, h])

// ───────────────────────────── Informatique et réseau (échelle agrandie pour rester lisible sur un plan)
const FI = 'Informatique et réseau'
const it = (id: string, nom: string, taille: [number, number, number], dessin: (b: Builder, p: Params) => void, defauts: Params = {}, variantes: string[] = [], planche = PL5) =>
  enregistrer({ id, famille: FI, nom, taille: () => taille, defauts, variantes, planche, dessiner(b: Builder, p: Params) { dessin(b, p); ancres(b, taille[0], taille[1], taille[2] / 2); centre(b, taille[0], taille[1], taille[2] + 12) } })

it('reseau.baie_serveurs', 'Baie serveurs (portes, unités)', [22, 24, 48], (b, p) => {
  const c = b.box(0, 0, 0, 22, 24, 46, 'md')
  if (p.porte === 'ouverte') {
    let s = r2(1.5, 2, 19, 42, 'fk', 0.5)
    for (let i = 0; i < 7; i++) s += r2(3, 4 + i * 5.6, 16, 4, 'fm', 0.4)
    b.pl('xz', 24.05, s, c)
    b.poly([[0, 24, 2], [0, 24 + 18, 2], [0, 24 + 18, 44], [0, 24, 44]], 'r', 'mm')
  } else b.pl('xz', 24.05, r2(1.5, 2, 19, 42, 'fg', 0.5) + [0, 1, 2, 3, 4, 5, 6].map((i) => l2(3, 6 + i * 5.6, 19, 6 + i * 5.6, 'ed2')).join(''), c)
  b.led([18, 24, 42], c, 1.7)
}, { porte: 'fermee' }, ['porte=fermee|ouverte'])
it('reseau.serveur_tour', 'Serveur tour', [12, 22, 30], (b) => {
  const c = b.box(0, 0, 0, 12, 22, 30, 'md')
  b.pl('xz', 22.05, r2(1.5, 20, 9, 3, 'fm', 0.4) + r2(1.5, 3, 9, 14, 'fk', 0.4), c)
  b.led([6, 22, 26], c, 1.6)
})
it('reseau.pc_bureau', 'PC de bureau (unité centrale et écran)', [40, 22, 26], (b) => {
  const u = b.box(0, 4, 0, 10, 16, 22, 'md'); b.led([5, 20, 18], u, 1.5)
  b.box(18, 8, 0, 14, 8, 2, 'mm'); b.box(23, 11, 2, 4, 2, 6, 'mm')
  const e = b.box(14, 8, 8, 26, 2.5, 16, 'md'); b.pl('xz', 10.55, r2(1.5, 1.5, 23, 13, 'fk', 0.6), e)
})
it('reseau.ecran', 'Écran (moniteur)', [28, 12, 22], (b) => {
  b.box(8, 4, 0, 12, 6, 2, 'mm'); b.box(12, 6, 2, 4, 2, 6, 'mm')
  const e = b.box(0, 5, 8, 28, 2.5, 14, 'md'); b.pl('xz', 7.55, r2(1.5, 1.5, 25, 11, 'fk', 0.6), e)
})
it('reseau.tv_murale', 'TV / écran mural', [50, 6, 32], (b) => {
  const e = b.box(0, 0, 0, 50, 3, 29, 'md'); b.pl('xz', 3.05, r2(2, 2, 46, 25, 'fk', 0.6) + l2(6, 24, 22, 8, 'ed2'), e)
  b.led([46, 3, 2], e, 1.2)
})
it('reseau.pc_portable', 'PC portable', [26, 18, 20], (b) => {
  b.box(0, 0, 0, 26, 18, 2, 'mm')
  const e = b.box(0, 0, 2, 26, 1.6, 16, 'md'); b.pl('xz', 1.65, r2(1.5, 1.5, 23, 13, 'fk', 0.6), e)
})
it('reseau.smartphone', 'Smartphone', [10, 4, 20], (b) => {
  b.box(0, 0, 0, 10, 4, 1.4, 'md'); const e = b.box(0.5, 1.4, 1.4, 9, 1.2, 16, 'md'); b.pl('xz', 2.65, r2(1, 1.5, 7, 12, 'fk', 0.8), e)
})
it('reseau.tablette', 'Tablette', [22, 6, 17], (b) => {
  b.box(0, 0, 0, 22, 4, 1.4, 'md'); const e = b.box(1, 1.4, 1.4, 20, 1.4, 14, 'md'); b.pl('xz', 2.85, r2(1.2, 1.2, 17.6, 11.6, 'fk', 0.8), e)
})
it('reseau.routeur', 'Routeur', [24, 14, 22], (b) => {
  const c = b.box(0, 0, 0, 24, 14, 5, 'mc'); b.led([4, 14, 2.5], c, 1.3); b.led([8, 14, 2.5], c, 1.3)
  b.cylZ(5, 4, 5, 1.1, 16, 'md'); b.cylZ(19, 4, 5, 1.1, 16, 'md')
})
it('reseau.switch', 'Switch réseau', [30, 14, 7], (b) => {
  const c = b.box(0, 0, 0, 30, 14, 5, 'md')
  let s = ''
  for (let i = 0; i < 8; i++) s += r2(3 + i * 3, 1.2, 2.2, 2.2, 'fm', 0.3)
  b.pl('xz', 14.05, s, c); b.led([27, 14, 2.5], c, 1.1)
})
it('reseau.ap_wifi', 'Point d’accès Wi-Fi', [20, 20, 22], (b) => {
  const c = b.cylZ(10, 10, 0, 8, 3, 'mc'); b.led([10, 10, 3], c, 1.6)
  b.pl('xz', 10, [5, 9, 13].map((r) => `<path class="ed2" d="M${10 - r * 0.72} ${8 + r * 0.72} A${r} ${r} 0 0 0 ${10 + r * 0.72} ${8 + r * 0.72}"/>`).join(''), c)
}, {}, [], PL2)
it('reseau.pare_feu', 'Pare-feu (firewall)', [26, 14, 10], (b) => {
  const c = b.box(0, 0, 0, 26, 14, 8, 'md')
  let s = ''
  for (let r = 0; r < 3; r++) { s += l2(2, 1.6 + r * 2.3, 14, 1.6 + r * 2.3, 'ed2'); for (let k = 0; k < 3; k++) s += l2(3 + k * 4 + (r % 2) * 2, 1.6 + r * 2.3, 3 + k * 4 + (r % 2) * 2, 3.9 + r * 2.3, 'ed2') }
  b.pl('xz', 14.05, s + p2([[20, 1.2], [23, 1.2], [21.5, 6]], 'fo'), c); b.led([4, 14, 6.4], c, 1.1)
})
it('reseau.antenne_4g', 'Antenne 4G / 5G (mât et panneaux)', [14, 14, 56], (b) => {
  const m = b.cylZ(7, 7, 0, 1.5, 48, 'mm'); b.box(3, 5, 44, 8, 2, 12, 'mc'); b.box(3, 9, 44, 8, 2, 12, 'mc'); b.led([7, 7, 50], m, 1.6)
}, {}, [], PL2)
it('reseau.box_hai_p200', 'Box HAI-P200-4G (boîtier compact, rail DIN, antennes)', [36, 18, 26], (b) => {
  b.box(0, 5, 0, 36, 8, 2, 'mm') // rail DIN
  const c = b.box(3, 3, 2, 30, 12, 13, 'md')
  b.pl('xz', 15.05, r2(3, 8, 11, 3.4, 'fm', 0.5) + c2(21, 9.6, 1.1, 'fk') + c2(25, 9.6, 1.1, 'fk'), c)
  b.led([6, 15, 5], c, 1.5); b.led([10, 15, 5], c, 1.5); b.led([14, 15, 5], c, 1.5)
  b.cylZ(8, 9, 15, 1.1, 10, 'mm'); b.cylZ(26, 9, 15, 1.1, 10, 'mm')
}, {}, [])

// ───────────────────────────── Énergie
const FE = 'Énergie'
const en = (id: string, nom: string, taille: [number, number, number], dessin: (b: Builder, p: Params) => void, defauts: Params = {}, variantes: string[] = [], planche = PL5) =>
  enregistrer({ id, famille: FE, nom, taille: () => taille, defauts, variantes, planche, dessiner(b: Builder, p: Params) { dessin(b, p); ancres(b, taille[0], taille[1], 6); centre(b, taille[0], taille[1], taille[2] + 12) } })
/** panneau PV : quadrilatère bleu (4 points) + trois traits de cellules */
const pv = (b: Builder, a: number[], bb: number[], c: number[], d: number[]) => {
  const q = b.poly([a, bb, c, d] as never, 't', 'ma')
  for (const t of [1 / 3, 2 / 3]) b.line([a[0] + (bb[0] - a[0]) * t, a[1] + (bb[1] - a[1]) * t, a[2] + (bb[2] - a[2]) * t], [d[0] + (c[0] - d[0]) * t, d[1] + (c[1] - d[1]) * t, d[2] + (c[2] - d[2]) * t], 'ed2', q)
  return q
}
en('energie.pv_toit_maison', 'Panneaux PV sur toit de maison', [46, 32, 36], (b) => {
  const W = 40, D = 28
  b.box(0, 0, 0, W, D, 18, 'mc')
  b.poly([[-2, D + 2, 18], [W + 2, D + 2, 18], [W + 2, D / 2, 30], [-2, D / 2, 30]], 't', 'md')
  b.poly([[W, -1, 18], [W, D + 1, 18], [W, D / 2, 30]], 'r', 'mb')
  pv(b, [5, D - 1, 20.2], [W - 5, D - 1, 20.2], [W - 5, D / 2 + 3, 27.6], [5, D / 2 + 3, 27.6])
}, {}, [], PL2)
en('energie.pv_toit_industriel', 'Panneaux PV sur toit industriel', [84, 52, 46], (b) => {
  const W = 80, D = 48
  b.box(0, 0, 0, W, D, 30, 'mc'); b.box(-1.5, -1.5, 30, W + 3, D + 3, 2, 'mm')
  for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) { const x = 6 + c * 36, y = 6 + r * 14; pv(b, [x, y + 10, 34], [x + 32, y + 10, 34], [x + 32, y, 38], [x, y, 38]) }
}, {}, [], PL2)
en('energie.pv_ombriere', 'Ombrière PV de parking (voitures dessous)', [90, 50, 40], (b) => {
  const W = 86, D = 46
  b.box(0, 0, 0, W, D, 1, 'md')
  voiture(b, 8, 8, 1, 'ma'); voiture(b, 8 + 38, 8, 1, 'mr'); voiture(b, 8, 26, 1, 'mc'); voiture(b, 8 + 38, 26, 1, 'mm')
  for (const [x, y] of [[2, 2], [W - 4, 2], [2, D - 4], [W - 4, D - 4]]) b.cylZ(x, y, 1, 1.4, 30, 'mm')
  for (let c = 0; c < 3; c++) pv(b, [2 + c * 28, D + 1, 31], [28 + c * 28, D + 1, 31], [28 + c * 28, 0, 40], [2 + c * 28, 0, 40])
}, {}, [], PL2)
en('energie.pv_sol', 'Panneaux PV au sol (rangées sur structures)', [78, 46, 22], (b) => {
  for (let r = 0; r < 3; r++) pv(b, [2, 14 + r * 15, 4], [76, 14 + r * 15, 4], [76, 4 + r * 15, 14], [2, 4 + r * 15, 14])
}, {}, [], PL2)
en('energie.eolienne', 'Éolienne (pales animées en marche)', [60, 12, 112], (b) => {
  b.cylZ(0, 0, 0, 2.6, 70, 'mc', 1.6)
  const nac = b.box(-4, -3, 70, 14, 6, 5, 'mc')
  const pale = (a: number) => `<g transform="rotate(${a})">${p2([[-1.8, 0], [1.8, 0], [0.7, 32], [-0.7, 32]], 'fw')}</g>`
  b.rotor('xz', 3.1, 8, 72.5, pale(0) + pale(120) + pale(240) + c2(0, 0, 2.6, 'fm'), nac, 3)
  b.led([-2, 3, 72], nac, 1.4)
})
en('energie.centrale_nucleaire', 'Centrale nucléaire (tour aéroréfrigérante, panache)', [120, 74, 118], (b) => {
  b.cylZ(30, 30, 0, 26, 74, 'mc', 17)
  const p = b.ball([30, 30, 84], 10, 'mc'); b.ball([44, 36, 100], 7, 'mc')
  b.cylZ(88, 22, 0, 13, 34, 'mb'); b.ball([88, 22, 34], 13, 'mb')
  b.box(70, 44, 0, 44, 22, 16, 'mm'); b.led([92, 66, 8], p, 1.4)
}, {}, [])
en('energie.groupe_electrogene', 'Groupe électrogène extérieur (capoté)', [56, 22, 30], (b) => {
  const c = b.box(0, 0, 0, 56, 22, 22, 'mb')
  b.pl('xz', 22.05, r2(4, 4, 18, 14, 'fm', 0.6) + [0, 1, 2, 3].map((k) => l2(6, 7 + k * 3, 22, 7 + k * 3, 'ed2')).join('') + r2(34, 5, 16, 12, 'fo', 0.6), c)
  b.cylZ(48, 6, 22, 2.2, 8, 'md'); b.led([28, 22, 18], c, 1.8)
}, {}, [])
en('energie.poste_transfo', 'Poste de transformation (cabine)', [40, 28, 36], (b) => {
  const c = b.box(0, 0, 0, 40, 28, 24, 'mc'); b.pl('xz', 28.05, r2(5, 0, 14, 16, 'fm', 0.5) + p2([[30, 6], [34, 6], [32, 12]], 'fo'), c)
  b.poly([[-1.5, 29.5, 24], [41.5, 29.5, 24], [41.5, 14, 32], [-1.5, 14, 32]], 't', 'md'); b.led([27, 28, 14], c, 1.7)
}, {}, [])
en('energie.poste_source', 'Poste source (transformateur HTA, portique)', [84, 52, 60], (b) => {
  b.box(0, 0, 0, 84, 52, 1.2, 'md')
  b.box(10, 14, 1, 26, 22, 18, 'mb'); for (const x of [16, 23, 30]) b.cylZ(x, 25, 19, 2.2, 10, 'mc')
  for (const x of [8, 76]) b.cylZ(x, 44, 1, 1.6, 44, 'mm')
  b.box(6, 43, 42, 74, 2, 2, 'mm')
  const t = b.box(48, 14, 1, 26, 22, 18, 'mb'); b.led([61, 36, 12], t, 1.6)
}, {}, [])
en('energie.bess', 'Stockage batteries en conteneur (BESS)', [70, 24, 36], (b) => {
  const L = 60
  const c = b.box(0, 0, 0, L, 24, 26, 'mc')
  b.pl('xz', 24.05, r2(14, 8, 30, 10, 'fy', 0.5) + r2(16, 9.5, 24, 7, 'fn', 0.6) + r2(40, 11.5, 3, 3, 'fn', 0.4), c)
  b.box(8, 4, 26, 14, 14, 5, 'mm'); b.box(34, 4, 26, 14, 14, 5, 'mm'); b.led([6, 24, 22], c, 1.8)
}, {}, [])
en('energie.borne_irve', 'Borne de recharge IRVE', [12, 12, 28], (b) => {
  const c = b.box(0, 0, 0, 8, 6, 24, 'mb'); b.pl('xz', 6.05, r2(1.5, 14, 5, 6, 'fk', 0.5) + p2([[3.5, 4], [5, 8], [3.7, 8], [4.3, 11], [2.4, 6.4], [3.7, 6.4]], 'fo'), c); b.led([4, 6, 11], c, 1.4)
}, {}, [], PL5)
en('energie.compteur', 'Compteur / poste de livraison (comptage)', [18, 10, 28], (b) => {
  const c = b.box(0, 0, 0, 16, 8, 22, 'mc'); b.pl('xz', 8.05, c2(8, 14, 4.4, 'fk') + l2(8, 14, 10.4, 16, 'ed') + r2(3, 3, 10, 4, 'fm', 0.4), c); b.led([8, 8, 9], c, 1.4)
}, {}, [])

// ───────────────────────────── Industrie, vue extérieure
const FX = 'Industrie extérieure'
const ix = (id: string, nom: string, taille: [number, number, number], dessin: (b: Builder, p: Params) => void, defauts: Params = {}, variantes: string[] = [], planche = PL5) =>
  enregistrer({ id, famille: FX, nom, taille: () => taille, defauts, variantes, planche, dessiner(b: Builder, p: Params) { dessin(b, p); ancres(b, taille[0], taille[1], 8); centre(b, taille[0], taille[1], taille[2] + 12) } })
ix('exterieur.cuve_verticale', 'Cuve extérieure verticale', [30, 30, 56], (b, p) => {
  const c = b.cylZ(15, 15, 0, 14, 46, teinte(p, 'gris'), undefined, { cap: true }); b.cylZ(15, 15, 46, 14.6, 2.4, 'md'); b.led([15, 29, 36], c, 1.8)
}, { couleur: 'gris' }, [VAR_COULEUR])
ix('exterieur.cuve_horizontale', 'Cuve extérieure horizontale', [56, 24, 26], (b, p) => {
  b.box(0, 0, 0, 56, 24, 2, 'mc')
  const c = b.cylX(3, 12, 14, 11, 50, teinte(p, 'gris'), undefined, { cap: true }); b.led([40, 22, 14], c, 1.8)
}, { couleur: 'gris' }, [VAR_COULEUR])
ix('exterieur.silo', 'Silo (fond conique sur pieds)', [28, 28, 78], (b, p) => {
  for (const [x, y] of [[4, 4], [24, 4], [4, 24], [24, 24]]) b.cylZ(x, y, 0, 1.4, 20, 'md')
  b.cyl([14, 14, 18], [14, 14, 30], 3, 'mm', 12)
  const c = b.cylZ(14, 14, 30, 12, 34, teinte(p, 'blanc'), undefined, { cap: true }); b.cyl([14, 14, 64], [14, 14, 72], 12, 'mm', 2); b.led([14, 26, 48], c, 1.8)
}, { couleur: 'blanc' }, [VAR_COULEUR])
ix('exterieur.citerne', 'Citerne routière (remorque)', [74, 22, 28], (b, p) => {
  b.box(0, 2, 4, 74, 18, 2.4, 'md')
  const c = b.cylX(4, 11, 15, 9, 64, teinte(p, 'blanc'), undefined, { cap: true }); b.rings(c, [4, 11, 15], [68, 11, 15], 9, [0.5], 'ed2')
  for (const x of [12, 56, 66]) for (const y of [-0.6, 20.6]) b.cylY(x, y, 4, 4, 2, 'md')
  b.led([8, 20, 15], c, 1.6)
}, { couleur: 'blanc' }, [VAR_COULEUR])
ix('exterieur.tour_refroidissement', 'Tour de refroidissement (ventilateur animé)', [44, 34, 42], (b) => {
  const c = b.box(0, 0, 0, 40, 30, 32, 'mb')
  let s = ''
  for (let i = 0; i < 5; i++) s += l2(4, 6 + i * 5, 36, 6 + i * 5, 'ed2')
  b.pl('xz', 30.05, s, c)
  const cap = b.cylZ(20, 15, 32, 11, 4, 'mm')
  const pales = [0, 120, 240].map((a) => `<g transform="rotate(${a})">${p2([[-2, 0], [2, 0], [1, 9], [-1, 9]], 'fm')}</g>`).join('')
  b.rotor('xy', 36.2, 20, 15, pales + c2(0, 0, 1.6, 'fk'), cap, 1)
  b.led([6, 30, 26], c, 1.8)
})
ix('exterieur.cheminee', 'Cheminée industrielle', [16, 16, 100], (b) => {
  const c = b.cylZ(8, 8, 0, 6, 88, 'mc', 3.6); b.rings(c, [8, 8, 62], [8, 8, 80], 4.6, [0.1, 0.5], 'ed2'); b.led([8, 14, 10], c, 1.6)
}, {}, [], PL5)
ix('exterieur.torchere', 'Torchère (flamme en marche)', [22, 16, 100], (b) => {
  b.box(0, 0, 0, 16, 16, 2, 'mc')
  const m = b.cylZ(8, 8, 2, 1.8, 80, 'mm')
  b.pl('xz', 8, `<g transform="translate(8 82)"><g class="flame"><path class="fo" d="M0 0C-4.6 5 -4 10 -2.4 12.6C-1 14.4 1 14.4 2.4 12.6C4 10 4.6 5 0 0Z"/></g></g>`, m)
  b.led([8, 14, 8], m, 1.5)
}, {}, [])
ix('exterieur.quai_chargement', 'Quai de chargement (portes, rampe)', [64, 30, 40], (b, p) => {
  b.box(0, 0, 0, 64, 26, 7, 'mc')
  const m = b.box(0, 0, 7, 64, 3, 30, 'mm')
  const nb = Math.max(1, Math.round(p.portes ?? 3)); let s = ''
  for (let i = 0; i < nb; i++) s += r2((64 / nb) * (i + 0.5) - 8, 0, 16, 20, 'fk', 0.6)
  b.pl('xz', 3.05, s, m); b.box(-1.5, -2, 36, 67, 8, 2, 'md')
}, { portes: 3 }, [])

// ───────────────────────────── Eau
const FW = 'Eau'
const ea = (id: string, nom: string, taille: [number, number, number], dessin: (b: Builder, p: Params) => void, defauts: Params = {}, variantes: string[] = [], planche = PL5) =>
  enregistrer({ id, famille: FW, nom, taille: () => taille, defauts, variantes, planche, dessiner(b: Builder, p: Params) { dessin(b, p); ancres(b, taille[0], taille[1], 6); centre(b, taille[0], taille[1], taille[2] + 12) } })
ea('eau.step_bassins', 'Bassins de STEP (clarificateur rond, bassin rectangulaire)', [100, 52, 12], (b) => {
  const c = b.cylZ(26, 26, 0, 24, 6, 'mc', undefined, { hollow: true }); b.cylZ(26, 26, 3.2, 22, 1, 'fl-eau')
  b.box(58, 4, 0, 40, 44, 6, 'mc'); b.box(60.5, 6.5, 5, 35, 39, 1.2, 'fl-eau')
  b.led([52, 26, 6], c, 1.6)
})
ea('eau.chateau_eau', 'Château d’eau', [36, 36, 80], (b) => {
  b.cylZ(18, 18, 0, 5, 46, 'mc')
  const c = b.cylZ(18, 18, 46, 16, 16, 'mb'); b.cyl([18, 18, 62], [18, 18, 72], 16, 'mm', 3)
  b.rings(c, [18, 18, 46], [18, 18, 62], 16, [0.5], 'ed2'); b.led([18, 34, 54], c, 1.8)
})
ea('eau.poste_relevage', 'Poste de relevage (regard, coffret, ventilation)', [40, 28, 26], (b) => {
  b.box(0, 0, 0, 40, 28, 1.4, 'mc')
  const c = b.cylZ(13, 14, 1.4, 9, 3, 'mm'); b.pl('xy', 4.45, c2(13, 14, 5, 'fk') + l2(8, 14, 18, 14, 'ed2'), c)
  const k = b.box(26, 6, 1.4, 12, 8, 16, 'mb'); b.led([32, 14, 12], k, 1.6)
  b.cylZ(6, 24, 1.4, 1.5, 20, 'mm')
})

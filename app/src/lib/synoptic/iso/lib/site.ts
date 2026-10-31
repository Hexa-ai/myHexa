/* eslint-disable */
// @ts-nocheck — catalogue de dessin (code massif copié de iso_lib, qui compile sans strictNullChecks) ; voir iso/README.md
// Famille « Site / Architecture » : bâtiments, locaux techniques, réseaux, voirie et végétation d'un plan de site.
// Même style plat que le reste (faces claires / moyennes / sombres, un trait) et rester sobre à petite échelle :
// peu de détails, des aplats, une frise d'accent discrète. Chaque bâtiment porte 4 ancres de façade (ports de type
// « signal ») pour y accrocher les liens génériques (réseau, câble, réseau de chaleur…), et une ancre de toit.
import { enregistrer } from './registre'
import { Builder, c2, r2, l2, p2 } from './iso'
import type { Params, EtatNom, Valeurs } from './types'
import type { V3 } from './geom'

const FAM = 'Site / Architecture'
const PL: [EtatNom, Valeurs?, number?][] = [['arret'], ['marche'], ['defaut'], ['alarme'], ['inconnu']]
/** couleur d'accent sobre : classe de matière de la frise */
const ACC: Record<string, string> = { signal: 'ma', chaud: 'mw', vert: 'mg', rouge: 'mr', neutre: 'md', eau: 'fl-eau', gaz: 'fl-gaz' }
const ACCENTS = 'accent=signal|chaud|vert|rouge|neutre|eau|gaz'
const accent = (p: Params, def = 'signal'): string => ACC[p.accent ?? def] ?? 'ma'

/** 4 ancres de façade au pied du bâtiment (+ x, − x, + y, − y) */
function facades(b: Builder, W: number, D: number, z = 4) {
  b.port('x+', [W, D / 2, z], [1, 0, 0], { type: 'signal' })
  b.port('x-', [0, D / 2, z], [-1, 0, 0], { type: 'signal' })
  b.port('y+', [W / 2, D, z], [0, 1, 0], { type: 'signal' })
  b.port('y-', [W / 2, 0, z], [0, -1, 0], { type: 'signal' })
}

/** toit plat (débord + frise d'accent) ou à 2 pans (faîtage sur le grand côté) ; renvoie la hauteur ajoutée */
function toit(b: Builder, W: number, D: number, z: number, kind: string, m: string, acc: string, tech = true): number {
  if (kind === '2pans') {
    const s = 2.5
    const h = Math.max(8, Math.min(W, D) * 0.3)
    if (W >= D) {
      b.poly([[-s, D + s, z], [W + s, D + s, z], [W + s, D / 2, z + h], [-s, D / 2, z + h]], 't', m)
      b.poly([[W, -1, z], [W, D + 1, z], [W, D / 2, z + h]], 'r', 'mb')
    } else {
      b.poly([[W + s, -s, z], [W + s, D + s, z], [W / 2, D + s, z + h], [W / 2, -s, z + h]], 'r', m)
      b.poly([[-1, D, z], [W + 1, D, z], [W / 2, D, z + h]], 'l', 'mb')
    }
    b.box(-s, -s, z - 3, W + 2 * s, 3, 3, acc)
    return h
  }
  b.box(-2, -2, z, W + 4, D + 4, 3, m)
  if (tech && W > 70 && D > 40) b.box(W * 0.62, D * 0.25, z + 3, 22, 14, 7, 'mm')
  return 3
}

/** fenêtres d'une façade (plan xz en y = D ou plan yz en x = W) : trames ou bandeaux filants, porte au rez-de-chaussée */
function percements(b: Builder, wall: any, W: number, D: number, n: number, hEt: number, style: string, porte: boolean) {
  const fen = (len: number, porteAu: number | null) => {
    let s = ''
    const wz = hEt * 0.36
    for (let e = 0; e < n; e++) {
      const z0 = e * hEt + hEt * 0.34
      if (style === 'bandeau') {
        s += r2(5, z0, len - 10, wz, 'fg', 0.8)
        for (let u = 5 + 26; u < len - 8; u += 26) s += l2(u, z0, u, z0 + wz, 'ed2')
      } else {
        const cols = Math.max(1, Math.floor((len - 10) / 24))
        const pas = (len - 10) / cols
        for (let c = 0; c < cols; c++) {
          const cx = 5 + c * pas + pas / 2
          if (e === 0 && porteAu != null && Math.abs(cx - porteAu) < pas * 0.6) continue
          s += r2(cx - 7, z0, 14, wz, 'fg', 0.8)
        }
      }
    }
    if (porte && porteAu != null) s += r2(porteAu - 8, 0, 16, hEt * 0.66, 'fk', 1) + r2(porteAu - 6.5, 1.2, 13, hEt * 0.66 - 2.4, 'fg', 0.6) + l2(porteAu, 1.2, porteAu, hEt * 0.66 - 1.2, 'ed2')
    return s
  }
  b.pl('xz', D + 0.05, fen(W, W / 2), wall)
  b.pl('yz', W + 0.05, fen(D, null), wall)
}

/** immeuble générique (bâtiment principal, bureaux) */
function immeuble(b: Builder, p: Params, style: string) {
  const W = p.w, D = p.d, n = Math.max(1, Math.round(p.etages)), hEt = p.hetage
  const H = n * hEt
  b.box(-1, -1, 0, W + 2, D + 2, 2, 'mc')
  const wall = b.box(0, 0, 2, W, D, H, 'mb')
  percements(b, wall, W, D, n, hEt, style, true)
  toit(b, W, D, H + 2, p.toit, 'mc', accent(p), true)
  facades(b, W, D)
  b.port('toit', [W / 2, D / 2, H + 12], [0, 0, 1], { type: 'signal' })
  b.anchor('badge', [W / 2, D / 2, H + 26])
}
const tailleImm = (p: Params): [number, number, number] => [p.w + 2, p.d + 2, Math.round(p.etages) * p.hetage + 2 + (p.toit === '2pans' ? Math.min(p.w, p.d) * 0.3 : 10)]

enregistrer({
  id: 'site.batiment', famille: FAM, nom: 'Bâtiment principal (étages, toit plat ou 2 pans)',
  taille: tailleImm, defauts: { w: 150, d: 90, etages: 3, hetage: 32, toit: 'plat', accent: 'signal' }, variantes: ['toit=plat|2pans', ACCENTS], planche: PL,
  dessiner(b: Builder, p: Params) { immeuble(b, p, 'trames') },
})
enregistrer({
  id: 'site.bureaux', famille: FAM, nom: 'Bureaux (bandeaux vitrés)',
  taille: tailleImm, defauts: { w: 110, d: 56, etages: 2, hetage: 30, toit: 'plat', accent: 'signal' }, variantes: ['toit=plat|2pans', ACCENTS], planche: PL,
  dessiner(b: Builder, p: Params) { immeuble(b, p, 'bandeau') },
})

enregistrer({
  id: 'site.entrepot', famille: FAM, nom: 'Entrepôt / hall industriel (portes sectionnelles)',
  taille: (p) => [p.w + 2, p.d + 2, p.h + 2 + (p.toit === '2pans' ? Math.min(p.w, p.d) * 0.3 : 6)],
  defauts: { w: 190, d: 100, h: 48, toit: '2pans', portes: 3, accent: 'neutre' }, variantes: ['toit=plat|2pans', ACCENTS], planche: PL,
  dessiner(b: Builder, p: Params) {
    const W = p.w, D = p.d, H = p.h
    b.box(-1, -1, 0, W + 2, D + 2, 2, 'mc')
    const wall = b.box(0, 0, 2, W, D, H, 'mm')
    const nb = Math.max(1, Math.round(p.portes)), pas = W / nb
    let s = ''
    for (let i = 0; i < nb; i++) {
      const cx = pas * (i + 0.5)
      s += r2(cx - 14, 0, 28, H * 0.66, 'fb', 1) + [1, 2, 3, 4].map((k) => l2(cx - 14, (H * 0.66 * k) / 5, cx + 14, (H * 0.66 * k) / 5, 'ed2')).join('')
    }
    s += r2(4, H - 12, W - 8, 5, 'fg', 0.8)
    b.pl('xz', D + 0.05, s, wall)
    b.pl('yz', W + 0.05, r2(6, H - 12, D - 12, 5, 'fg', 0.8), wall)
    toit(b, W, D, H + 2, p.toit, 'mc', accent(p, 'neutre'), false)
    facades(b, W, D)
    b.anchor('badge', [W / 2, D / 2, H + 22])
  },
})

enregistrer({
  id: 'site.chaufferie', famille: FAM, nom: 'Local chaufferie (cheminée)',
  taille: (p) => [p.w + 2, p.d + 2, p.h + 2 + p.cheminee], defauts: { w: 74, d: 56, h: 42, cheminee: 56, toit: 'plat', accent: 'chaud' }, variantes: ['toit=plat|2pans', ACCENTS], planche: PL,
  dessiner(b: Builder, p: Params) {
    const W = p.w, D = p.d, H = p.h
    b.box(-1, -1, 0, W + 2, D + 2, 2, 'mc')
    const wall = b.box(0, 0, 2, W, D, H, 'mb')
    b.pl('xz', D + 0.05, r2(W / 2 - 14, 0, 28, H * 0.7, 'fk', 1) + l2(W / 2, 0, W / 2, H * 0.7, 'ed2') + [0, 1, 2, 3].map((k) => l2(8, H - 14 + k * 2.6, 26, H - 14 + k * 2.6, 'ed2')).join(''), wall)
    b.pl('yz', W + 0.05, r2(10, H * 0.45, 18, H * 0.3, 'fg', 0.8), wall)
    toit(b, W, D, H + 2, p.toit, 'mc', accent(p, 'chaud'), false)
    // cheminée : fût + collerettes + couronnement, sur le toit
    const cx = W - 14, cy = 14
    const ch = b.cylZ(cx, cy, H + 2, 5.5, p.cheminee, 'mm')
    b.rings(ch, [cx, cy, H + 2], [cx, cy, H + 2 + p.cheminee], 5.5, [0.35, 0.7])
    b.cylZ(cx, cy, H + 2 + p.cheminee, 6.6, 3, 'md')
    b.led([W / 2 + 18, D, H - 6], wall, 1.8)
    facades(b, W, D)
    b.anchor('badge', [W / 2, D / 2, H + 24])
  },
})

enregistrer({
  id: 'site.sous_station', famille: FAM, nom: 'Sous-station (échangeur, piquages réseau de chaleur)',
  taille: (p) => [p.w + 14, p.d + 2, p.h + 14], defauts: { w: 66, d: 46, h: 38, accent: 'chaud' }, variantes: [ACCENTS], planche: PL,
  dessiner(b: Builder, p: Params) {
    const W = p.w, D = p.d, H = p.h
    b.box(-1, -1, 0, W + 2, D + 2, 2, 'mc')
    const wall = b.box(0, 0, 2, W, D, H, 'mb')
    b.pl('xz', D + 0.05, r2(W / 2 - 10, 0, 20, H * 0.66, 'fk', 1) + l2(W / 2, 0, W / 2, H * 0.66, 'ed2') + r2(6, H * 0.55, 14, 8, 'fg', 0.8), wall)
    toit(b, W, D, H + 2, 'plat', 'mc', accent(p, 'chaud'), false)
    // départ et retour du réseau de chaleur : deux piquages traversant le mur +x
    const aller = b.cylX(W, D * 0.33, 8, 3.2, 12, 'fl-eau_chaude_aller')
    const retour = b.cylX(W, D * 0.62, 8, 3.2, 12, 'fl-eau_chaude_retour')
    void aller; void retour
    b.led([W / 2 + 14, D, H - 6], wall, 1.8)
    facades(b, W + 12, D)
    b.port('primaire', [W + 12, D * 0.33, 8], [1, 0, 0], { type: 'tube', fluide: 'eau_chaude_aller', dn: 3.2 })
    b.anchor('badge', [W / 2, D / 2, H + 18])
  },
})

enregistrer({
  id: 'site.salle_gtb', famille: FAM, nom: 'Salle GTB / serveurs (mât d\'antenne)',
  taille: (p) => [p.w + 2, p.d + 2, p.h + 38], defauts: { w: 60, d: 44, h: 36, accent: 'signal' }, variantes: [ACCENTS], planche: PL,
  dessiner(b: Builder, p: Params) {
    const W = p.w, D = p.d, H = p.h
    b.box(-1, -1, 0, W + 2, D + 2, 2, 'mc')
    const wall = b.box(0, 0, 2, W, D, H, 'mb')
    // baies d'écrans : trois fenêtres sombres à liseré d'accent
    let s = r2(W / 2 - 8, 0, 16, H * 0.62, 'fk', 1)
    for (let i = 0; i < 3; i++) s += r2(6 + i * 14, H * 0.5, 11, 9, 'fk', 0.8) + r2(7.5 + i * 14, H * 0.5 + 1.5, 8, 2.4, 'fa', 0.4)
    b.pl('xz', D + 0.05, s, wall)
    b.pl('yz', W + 0.05, [0, 1, 2, 3].map((k) => l2(8, 12 + k * 4, D - 8, 12 + k * 4, 'ed2')).join(''), wall)
    toit(b, W, D, H + 2, 'plat', 'mc', accent(p), false)
    // mât d'antenne et parabole : la salle GTB communique
    const m = b.cylZ(W - 10, 10, H + 2, 1.3, 34, 'mm')
    b.box(W - 14, 6, H + 30, 8, 1.6, 6, 'mm')
    b.led([W - 10, 10, H + 38], m, 1.8)
    b.led([W / 2 + 18, D, H - 8], wall, 1.8)
    facades(b, W, D)
    b.anchor('badge', [W / 2, D / 2, H + 52])
  },
})

enregistrer({
  id: 'site.poste_transfo', famille: FAM, nom: 'Poste de transformation (cabine béton)',
  taille: (p) => [p.w + 2, p.d + 2, p.h + 2 + Math.max(8, Math.min(p.w, p.d) * 0.3)], defauts: { w: 64, d: 46, h: 40, toit: '2pans', accent: 'chaud' }, variantes: ['toit=plat|2pans', ACCENTS], planche: PL,
  dessiner(b: Builder, p: Params) {
    const W = p.w, D = p.d, H = p.h
    b.box(-1, -1, 0, W + 2, D + 2, 2, 'mc')
    const wall = b.box(0, 0, 2, W, D, H, 'mc')
    let s = ''
    for (const x0 of [W * 0.22, W * 0.56]) s += r2(x0, 0, W * 0.22, H * 0.7, 'fm', 0.8) + [0, 1, 2, 3, 4, 5].map((k) => l2(x0 + 2, 4 + k * 5, x0 + W * 0.22 - 2, 4 + k * 5, 'ed2')).join('')
    s += p2([[W * 0.88, H * 0.58], [W * 0.88 + 4.2, H * 0.58 + 7.2], [W * 0.88 - 4.2, H * 0.58 + 7.2]], 'fo') // triangle « danger électrique »
    b.pl('xz', D + 0.05, s, wall)
    toit(b, W, D, H + 2, p.toit, 'mb', accent(p, 'chaud'), false)
    b.led([W * 0.5, D, H - 4], wall, 1.8)
    facades(b, W, D)
    b.anchor('badge', [W / 2, D / 2, H + 24])
  },
})

enregistrer({
  id: 'site.transfo_exterieur', famille: FAM, nom: 'Transformateur extérieur (socle, grillage)',
  taille: (p) => [p.w + 2, p.d + 2, 52], defauts: { w: 70, d: 54, cloture: true }, variantes: [], planche: PL.slice(0, 4),
  dessiner(b: Builder, p: Params) {
    const W = p.w, D = p.d
    b.box(0, 0, 0, W, D, 3, 'mc')
    b.box(14, 12, 3, W - 28, D - 24, 26, 'mb')
    for (let i = 0; i < 7; i++) b.box(16 + i * 6, D - 12, 5, 2, 7, 22, 'mm')
    b.box(12, 10, 29, W - 24, D - 20, 3, 'mm')
    for (let i = 0; i < 3; i++) { const x = W / 2 - 14 + i * 14; const c = b.cylZ(x, D / 2 - 6, 32, 3, 12, 'md'); b.rings(c, [x, D / 2 - 6, 32], [x, D / 2 - 6, 44], 3, [0.3, 0.6]) }
    if (p.cloture !== false) {
      const post = (x: number, y: number) => b.cylZ(x, y, 3, 0.9, 16, 'mm')
      for (const [x, y] of [[1, 1], [W - 1, 1], [W - 1, D - 1], [1, D - 1]]) post(x, y)
      for (const z of [10, 17]) b.path3([[1, D - 1, z], [W - 1, D - 1, z], [W - 1, 1, z]], 'ed2')
    }
    facades(b, W, D, 6)
    b.port('ht', [W / 2, D / 2 - 6, 44], [0, 0, 1], { type: 'elec' })
    b.anchor('badge', [W / 2, D / 2, 64])
  },
})

enregistrer({
  id: 'site.groupe_container', famille: FAM, nom: 'Groupe électrogène en container',
  taille: (p) => [p.w + 2, p.d + 2, p.h + 14], defauts: { w: 124, d: 46, h: 46, accent: 'chaud' }, variantes: [ACCENTS], planche: PL,
  dessiner(b: Builder, p: Params) {
    const W = p.w, D = p.d, H = p.h
    b.box(0, 0, 0, W, D, 4, 'mc')
    const cs = b.box(2, 2, 4, W - 4, D - 4, H, 'mm')
    let s = ''
    for (let x = 6; x < W - 36; x += 7) s += l2(x, 3, x, H - 3, 'ed2') // tôle ondulée
    s += r2(W - 34, 4, 28, H - 8, 'fb', 1) + l2(W - 20, 4, W - 20, H - 4, 'ed') + c2(W - 22, H / 2, 1, 'fd') + c2(W - 18, H / 2, 1, 'fd')
    b.pl('xz', D - 1.95, s, cs)
    b.pl('yz', W - 1.95, [0, 1, 2, 3, 4, 5].map((k) => l2(6, 10 + k * 4.5, D - 8, 10 + k * 4.5, 'ed2')).join(''), cs)
    b.box(2, 2, 4 + H, W - 4, D - 4, 2, accent(p, 'chaud'))
    b.cylZ(22, 14, 6 + H, 3.2, 12, 'md')
    b.cylZ(22, 14, 18 + H, 4.4, 2, 'mk')
    b.led([W - 40, D - 2, H - 6], cs, 1.8)
    facades(b, W, D)
    b.anchor('badge', [W / 2, D / 2, H + 28])
  },
})

enregistrer({
  id: 'site.local_tgbt', famille: FAM, nom: 'Local TGBT',
  taille: (p) => [p.w + 2, p.d + 2, p.h + 12], defauts: { w: 56, d: 40, h: 38, accent: 'chaud' }, variantes: [ACCENTS], planche: PL,
  dessiner(b: Builder, p: Params) {
    const W = p.w, D = p.d, H = p.h
    b.box(-1, -1, 0, W + 2, D + 2, 2, 'mc')
    const wall = b.box(0, 0, 2, W, D, H, 'mb')
    b.pl('xz', D + 0.05, r2(W / 2 - 11, 0, 22, H * 0.68, 'fm', 1) + l2(W / 2, 0, W / 2, H * 0.68, 'ed2') + p2([[W / 2 - 14.6, H * 0.5], [W / 2 - 10, H * 0.5 + 7], [W / 2 - 19.2, H * 0.5 + 7]], 'fo') + [0, 1, 2].map((k) => l2(8, H - 12 + k * 2.6, 24, H - 12 + k * 2.6, 'ed2')).join(''), wall)
    toit(b, W, D, H + 2, 'plat', 'mc', accent(p, 'chaud'), false)
    b.port('arrivee', [W / 2, D / 2, H + 6], [0, 0, 1], { type: 'elec' })
    b.led([W - 12, D, H - 6], wall, 1.8)
    facades(b, W, D)
    b.anchor('badge', [W / 2, D / 2, H + 22])
  },
})

/** places de stationnement : dalle sombre + marquage ; n places sur une rangée ou deux */
function stationnement(b: Builder, p: Params, irve: boolean) {
  const n = Math.max(1, Math.round(p.places)), W = n * 24 + 8, D = p.rangees === 2 ? 76 : 44
  const dalle = b.box(0, 0, 0, W, D, 1.6, 'md')
  let s = ''
  const rangs = p.rangees === 2 ? [4, D - 4 - 32] : [6]
  for (const y0 of rangs) for (let i = 0; i <= n; i++) s += r2(4 + i * 24 - 0.6, y0, 1.2, 32, 'fw', 0)
  b.pl('xy', 1.65, s, dalle)
  if (irve) {
    for (let i = 0; i < Math.min(n, Math.round(p.bornes ?? 2)); i++) {
      const x = 4 + i * 24 * Math.max(1, Math.floor(n / Math.max(1, Math.round(p.bornes ?? 2)))) + 12
      const bo = b.box(x - 3, rangs[0] + 33, 1.6, 6, 5, 15, 'mm')
      b.box(x - 3.6, rangs[0] + 32.6, 16.6, 7.2, 6, 2, 'ma')
      b.led([x, rangs[0] + 38, 12], bo, 1.5)
    }
  }
  facades(b, W, D, 2)
  b.anchor('badge', [W / 2, D / 2, 26])
}
const tailleParking = (p: Params): [number, number, number] => [Math.round(p.places) * 24 + 8, p.rangees === 2 ? 76 : 44, 18]
enregistrer({
  id: 'site.parking_irve', famille: FAM, nom: 'Parking avec bornes IRVE',
  taille: tailleParking, defauts: { places: 4, rangees: 1, bornes: 2 }, variantes: [], planche: PL.slice(0, 3),
  dessiner(b: Builder, p: Params) { stationnement(b, p, true) },
})
enregistrer({
  id: 'site.parking', famille: FAM, nom: 'Parking (places marquées)',
  taille: tailleParking, defauts: { places: 6, rangees: 1 }, variantes: [], planche: [['arret']],
  dessiner(b: Builder, p: Params) { stationnement(b, p, false) },
})

enregistrer({
  id: 'site.toiture_pv', famille: FAM, nom: 'Toiture photovoltaïque (rangées de panneaux)',
  taille: (p) => [p.cols * 22 + 10, p.rangs * 30 + 10, 18], defauts: { cols: 5, rangs: 2 }, variantes: [], planche: PL.slice(0, 3),
  dessiner(b: Builder, p: Params) {
    const nc = Math.max(1, Math.round(p.cols)), nr = Math.max(1, Math.round(p.rangs))
    const W = nc * 22 + 10, D = nr * 30 + 10
    b.box(0, 0, 0, W, D, 3, 'mc')
    for (let r = 0; r < nr; r++) {
      const y0 = 5 + r * 30, y1 = y0 + 24
      for (let c = 0; c < nc; c++) {
        const x0 = 6 + c * 22, x1 = x0 + 20
        // panneau incliné : relevé côté −y (face au spectateur), pied côté +y
        b.poly([[x0, y1, 3], [x1, y1, 3], [x1, y0, 3 + 11], [x0, y0, 3 + 11]], 'l', 'md')
        b.line([x0 + 10, y1, 3], [x0 + 10, y0, 14], 'ed2')
        b.line([x0, (y0 + y1) / 2, 8.5], [x1, (y0 + y1) / 2, 8.5], 'ed2')
      }
    }
    facades(b, W, D, 3)
    b.anchor('badge', [W / 2, D / 2, 30])
  },
})

enregistrer({
  id: 'site.station_pompage', famille: FAM, nom: 'Station de pompage / de relevage (local, trappe)',
  taille: (p) => [p.w + 30, p.d + 2, p.h + 12], defauts: { w: 52, d: 42, h: 32, accent: 'eau' }, variantes: [ACCENTS], planche: PL,
  dessiner(b: Builder, p: Params) {
    const W = p.w, D = p.d, H = p.h
    b.box(-1, -1, 0, W + 2, D + 2, 2, 'mc')
    const wall = b.box(0, 0, 2, W, D, H, 'mb')
    b.pl('xz', D + 0.05, r2(W / 2 - 9, 0, 18, H * 0.66, 'fk', 1) + l2(W / 2, 0, W / 2, H * 0.66, 'ed2') + r2(5, H * 0.52, 12, 8, 'fg', 0.8), wall)
    toit(b, W, D, H + 2, 'plat', 'mc', accent(p, 'eau'), false)
    // regard de visite à côté du local
    b.cylZ(W + 18, D / 2, 0, 11, 2.4, 'mm')
    b.cylZ(W + 18, D / 2, 2.4, 8, 1.2, 'md')
    b.led([W / 2 + 12, D, H - 6], wall, 1.8)
    facades(b, W + 30, D)
    b.port('refoulement', [W + 28, D / 2, 4], [1, 0, 0], { type: 'tube', fluide: 'eau', dn: 3 })
    b.anchor('badge', [W / 2, D / 2, H + 20])
  },
})

enregistrer({
  id: 'site.chateau_eau', famille: FAM, nom: 'Château d\'eau / réservoir sur tour',
  taille: (p) => [2 * p.r + 6, 2 * p.r + 6, p.h + 44], defauts: { r: 24, h: 90, accent: 'eau' }, variantes: [ACCENTS], planche: PL.slice(0, 4),
  dessiner(b: Builder, p: Params) {
    const r = p.r, h = p.h, c = r + 3
    b.cylZ(c, c, 0, r * 0.42, h, 'mc')
    b.cylZ(c, c, 0, r * 0.62, 4, 'mc')
    b.cylZ(c, c, h, r * 0.7, 8, 'mm', r)            // jupe conique
    const cuve = b.cylZ(c, c, h + 8, r, 26, 'mb')
    b.cylZ(c, c, h + 20, r + 0.4, 4, accent(p, 'eau'))
    b.cylZ(c, c, h + 34, r, 6, 'mm', r * 0.4)       // toit conique
    b.cylZ(c, c, h + 40, r * 0.4, 2, 'md')
    b.led([c + r * 0.7, c + r * 0.7, h + 24], cuve, 1.8)
    facades(b, 2 * r + 6, 2 * r + 6, 2)
    b.anchor('badge', [c, c, h + 56])
  },
})

enregistrer({
  id: 'site.step', famille: FAM, nom: 'STEP (bassins d\'épuration)',
  taille: (p) => [Math.round(p.bassins) * 80 + 40, 100, 30], defauts: { bassins: 2, accent: 'eau' }, variantes: [], planche: PL.slice(0, 4),
  dessiner(b: Builder, p: Params) {
    const n = Math.max(1, Math.round(p.bassins)), W = n * 80 + 40, D = 100
    b.box(0, 0, 0, W, D, 2, 'mc')
    for (let i = 0; i < n; i++) {
      const cx = 44 + i * 80, cy = 38
      b.cylZ(cx, cy, 2, 33, 12, 'mc')
      b.cylZ(cx, cy, 14, 29.5, 0.8, 'fl-eau_traitee')
      b.cylZ(cx, cy, 2, 2.4, 20, 'mm')                 // pont racleur : pivot central
      b.box(cx - 29, cy - 1.2, 20, 58, 2.4, 1.6, 'mm')
    }
    // local d'exploitation
    const w = b.box(10, D - 28, 2, 36, 22, 16, 'mb')
    b.pl('xz', D - 6 + 0.05, r2(14, 0, 8, 10, 'fk', 0.8) + r2(24, 6, 8, 5, 'fg', 0.6), w)
    b.box(8, D - 30, 18, 40, 26, 2, 'mc')
    facades(b, W, D, 3)
    b.anchor('badge', [W / 2, D / 2, 36])
  },
})

enregistrer({
  id: 'site.arbres', famille: FAM, nom: 'Arbres (bosquet)',
  taille: (p) => [Math.round(p.n) * 18 + 8, 30, 40], defauts: { n: 3 }, variantes: [], planche: [['arret']],
  dessiner(b: Builder, p: Params) {
    const n = Math.max(1, Math.round(p.n))
    for (let i = 0; i < n; i++) {
      const x = 12 + i * 18, y = 15 + ((i * 7) % 3) * 3 - 3, h = 20 + ((i * 5) % 4) * 3
      b.cylZ(x, y, 0, 1.8, h - 8, 'fl-boues')
      b.ball([x, y, h], 10 + (i % 2) * 1.5, 'fl-air_neuf')
    }
  },
})

enregistrer({
  id: 'site.cloture', famille: FAM, nom: 'Clôture (grillage et poteaux)',
  taille: (p) => [p.l, 4, 22], defauts: { l: 120 }, variantes: [], planche: [['arret']],
  dessiner(b: Builder, p: Params) {
    const L = p.l
    const n = Math.max(1, Math.round(L / 20))
    for (let i = 0; i <= n; i++) b.cylZ((L * i) / n, 2, 0, 0.9, 18, 'mm')
    for (const z of [4, 11, 18]) b.line([0, 2, z], [L, 2, z], z === 11 ? 'ed2' : 'ed')
    for (let i = 0; i < n; i++) b.line([(L * i) / n, 2, 4], [(L * (i + 1)) / n, 2, 18], 'ed2')
    facades(b, L, 4, 6)
  },
})

enregistrer({
  id: 'site.voirie', famille: FAM, nom: 'Voirie / allée (route, chemin)',
  taille: (p) => [p.l, p.larg, 3], defauts: { l: 240, larg: 34, allee: false }, variantes: [], planche: [['arret']],
  dessiner(b: Builder, p: Params) {
    const L = p.l, Wd = p.larg
    const rd = b.box(0, 0, 0, L, Wd, 1.2, p.allee ? 'mc' : 'md')
    let s = ''
    if (!p.allee) for (let x = 6; x < L - 12; x += 20) s += r2(x, Wd / 2 - 0.7, 10, 1.4, 'fw', 0)
    else for (let x = 4; x < L - 4; x += 12) s += c2(x, Wd / 2, 0.8, 'ed2')
    b.pl('xy', 1.25, s, rd)
    b.port('x+', [L, Wd / 2, 1.2], [1, 0, 0], { type: 'signal' })
    b.port('x-', [0, Wd / 2, 1.2], [-1, 0, 0], { type: 'signal' })
    b.port('y+', [L / 2, Wd, 1.2], [0, 1, 0], { type: 'signal' })
    b.port('y-', [L / 2, 0, 1.2], [0, -1, 0], { type: 'signal' })
  },
})

enregistrer({
  id: 'site.poste_gaz', famille: FAM, nom: 'Poste de livraison / compteur gaz',
  taille: () => [48, 30, 30], defauts: { accent: 'gaz' }, variantes: [], planche: PL.slice(0, 4),
  dessiner(b: Builder, p: Params) {
    b.box(0, 0, 0, 48, 30, 2, 'mc')
    const cs = b.box(5, 6, 2, 30, 18, 20, 'mb')
    b.box(5, 6, 16, 30, 18, 3, accent(p, 'gaz'))
    b.pl('xz', 24.05, r2(8, 3, 14, 13, 'fk', 1) + c2(29, 10, 5, 'fw') + l2(29, 10, 31.6, 7.6, 'ed') + p2([[27, 2.4], [31, 2.4], [29, 6]], 'fo'), cs)
    // tuyauterie d'arrivée enterrée : cordon jaune
    b.cylX(35, 15, 6, 2.2, 13, 'fl-gaz')
    b.cylZ(41, 15, 2, 2.2, 4, 'fl-gaz')
    b.led([32, 24, 18], cs, 1.6)
    facades(b, 48, 30, 3)
    b.port('arrivee', [48, 15, 6], [1, 0, 0], { type: 'tube', fluide: 'gaz', dn: 2.2 })
    b.anchor('badge', [20, 15, 40])
  },
})

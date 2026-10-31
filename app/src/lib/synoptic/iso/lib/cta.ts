/* eslint-disable */
// @ts-nocheck — catalogue de dessin (code massif copié de iso_lib, qui compile sans strictNullChecks) ; voir iso/README.md
// Modules de CTA (caissons rectangulaires assemblables bout à bout selon x).
// Repère local : x = sens de l'air, y = profondeur (face visible = +y), z = hauteur.
// Chaque module : ports 'in' (x=0) et 'out' (x=L), type gaine, section 60 × (h-16).
import { enregistrer } from './registre'
import { Builder, c2, r2, l2, d2 } from './iso'
import { roueAubes, helice, grille } from './communs'
import type { Params, EtatNom, Valeurs, Fluide } from './types'

export const CTA_D = 66       // profondeur
export const CTA_HB = 5       // hauteur du châssis
const PL: [EtatNom, Valeurs?, number?][] = [['arret'], ['marche'], ['defaut'], ['alarme'], ['consigne', { manuel: true }], ['inconnu'], ['marche', {}, 90], ['arret', {}, 90]]
const PLPOS: [EtatNom, Valeurs?, number?][] = [['ferme', { position: 0 }], ['modulant', { position: 35 }], ['modulant', { position: 70 }], ['ouvert', { position: 100 }], ['defaut', { position: 50 }], ['alarme'], ['consigne', { manuel: true, position: 60 }], ['inconnu'], ['ouvert', { position: 100 }, 90]]

const fl = (f: Fluide, inner: string) => `<g class="fl-${f}">${inner}</g>`
/** flux d'air animé (visible en marche) : traits qui défilent selon +x */
const cflow = (u0: number, u1: number, vs: number[]) => `<g class="cflow">${vs.map((v) => `<path class="flow air" d="M${u0} ${v}L${u1} ${v}"/>`).join('')}</g>`
const chev = (u: number, v: number, s = 1) => `<g transform="translate(${u} ${v}) scale(${s})">${d2('M-5 -3.4L2 0L-5 3.4', 'ed3')}</g>`

export interface Cadre { L: number; H: number; z0: number; z1: number; u0: number; u1: number }
/** Caisson : châssis, panneaux, collets, ports ; fenêtre de visite (fond sombre) dont le contenu est fourni. */
export function caisson(b: Builder, L: number, H: number, fluide: Fluide, o: { fenetre?: boolean; w?: [number, number]; poignees?: boolean; ouvert?: boolean } = {}): Cadre {
  const D = CTA_D, zb = CTA_HB
  b.box(0, 3, 0, L, D - 6, zb, 'mm')
  const cs = b.box(0, 0, zb, L, D, H, 'mb')
  // panneaux : joints verticaux + traverse haute
  let s = ''
  const nseg = Math.max(1, Math.round(L / 40))
  for (let i = 1; i < nseg; i++) s += l2((L * i) / nseg, zb, (L * i) / nseg, zb + H, 'ed2')
  s += r2(0, zb, L, H, 'ed')
  // ceinture de profilés
  s += l2(0, zb + 3, L, zb + 3, 'ed2') + l2(0, zb + H - 3, L, zb + H - 3, 'ed2')
  b.pl('xz', D, s, cs)
  b.pl('yz', L, l2(0, zb + 3, D, zb + 3, 'ed2') + l2(0, zb + H - 3, D, zb + H - 3, 'ed2') + l2(D / 2, zb, D / 2, zb + H, 'ed2'), cs)
  b.pl('xy', zb + H, l2(0, 3, L, 3, 'ed2') + l2(0, D - 3, L, D - 3, 'ed2'), cs)
  const u0 = o.w ? o.w[0] : 7, u1 = o.w ? o.w[1] : L - 7
  const z0 = zb + 8, z1 = zb + H - 8
  if (o.fenetre !== false) {
    // cadre de la porte de visite (en saillie très légère)
    b.pl('xz', D + 0.05, r2(u0 - 2.5, z0 - 2.5, u1 - u0 + 5, z1 - z0 + 5, 'ed', 1.5) + r2(u0, z0, u1 - u0, z1 - z0, 'in'), cs)
  }
  if (o.poignees !== false) {
    for (const hx of [u1 + 2.4, u0 - 5]) if (hx > 1 && hx < L - 1.5) b.box(hx, D, zb + H / 2 - 5, 2.4, 2.6, 10, 'mm')
  }
  // ports air
  const pw = 44, ph = H - 16
  b.port('in', [0, D / 2, zb + H / 2], [-1, 0, 0], { type: 'gaine', fluide, w: pw, h: ph })
  b.port('out', [L, D / 2, zb + H / 2], [1, 0, 0], { type: 'gaine', fluide, w: pw, h: ph })
  b.anchor('badge', [L / 2, D / 2, zb + H + 14]); b.anchor('haut', [L / 2, D / 2, zb + H])
  return { L, H, z0, z1, u0, u1 }
}
/** dessin du contenu dans le plan de la fenêtre (xz à y = D) */
const vue = (b: Builder, cs: Part0, inner: string) => b.pl('xz', CTA_D + 0.1, inner, cs)
type Part0 = ReturnType<Builder['box']>

const H0 = (p: Params) => p.h ?? 62
const base = (id: string, nom: string, L: number, defauts: Params, planche: any, dessin: (b: Builder, p: Params, c: Cadre, cs: Part0) => void, extra: Partial<{ h: number; variantes: string[]; fenetre: boolean; w: [number, number]; fluide: Fluide }> = {}) =>
  enregistrer({
    id: 'cta.' + id, famille: 'CTA', nom, taille: (p) => [p.L ?? L, CTA_D + 22, (p.h ?? extra.h ?? 62) + CTA_HB], defauts: { h: extra.h ?? 62, fluide: extra.fluide ?? 'air_souffle', ...defauts }, planche, variantes: extra.variantes,
    dessiner(b: Builder, p: Params) {
      const Lx = p.L ?? L
      const c = caisson(b, Lx, p.h, p.fluide, { fenetre: extra.fenetre, w: extra.w })
      const cs = b.parts[1]
      dessin(b, p, c, cs)
    },
  })

// ───────── prise d'air neuf / rejet : grille pare-pluie
for (const [id, nom, f] of [['prise_air', "Prise d'air neuf (grille pare-pluie)", 'air_neuf'], ['rejet_air', "Rejet d'air (grille pare-pluie)", 'air_rejete']] as const)
  base(id, nom, 70, { fluide: f }, PL.slice(0, 1).concat([['marche'], ['defaut'], ['alarme'], ['inconnu']]), (b, p, c, cs) => {
    const { H } = c, zb = CTA_HB, L = c.L
    let s = r2(5, zb + 5, L - 10, H - 10, 'ed', 1.5) + r2(7, zb + 7, L - 14, H - 14, 'in')
    // lames inclinées (pare-pluie) : lignes obliques épaisses
    const n = Math.floor((H - 14) / 5.2)
    for (let i = 0; i < n; i++) { const z = zb + 8.5 + i * 5.2; s += `<path class="ed3" d="M8.5 ${z}L${L - 8.5} ${z}" style="stroke-opacity:.9"/>` + `<path class="fm" d="M8.5 ${z + 0.6}H${L - 8.5}V${z + 3.6}H8.5Z" />` }
    s += `<g class="cflow">${[0.3, 0.7].map((k) => `<path class="flow air" d="M${L * k} ${zb + H * 0.5}h10"/>`).join('')}</g>`
    vue(b, cs, s)
    // chapeau pare-pluie
    b.box(-2, -2, zb + H, L + 4, CTA_D + 8, 3, 'mm')
    // grillage anti-volatiles : bordure + cheville
    b.anchor('badge', [L / 2, CTA_D / 2, zb + H + 14])
  }, { fenetre: false, variantes: ['air_neuf', 'air_rejete'] })

// ───────── registre motorisé
base('registre', 'Registre motorisé (lames + servomoteur)', 60, { fluide: 'air_neuf' }, PLPOS, (b, p, c, cs) => {
  const { L, z0, z1, u0, u1 } = c
  const n = 5, pitch = (z1 - z0) / n, th = 90 - b.pos * 0.9
  let s = ''
  for (let i = 0; i < n; i++) {
    const cz = z0 + pitch * (i + 0.5), ch = pitch * 1.06
    s += `<g transform="translate(${(u0 + u1) / 2} ${cz}) rotate(${-th})">${d2(`M${-ch / 2} -1.3H${ch / 2}V1.3H${-ch / 2}Z`, 'fm')}${c2(0, 0, 1, 'fd')}</g>`
    s += l2(u0, cz, u0 + 3, cz, 'ed') + l2(u1 - 3, cz, u1, cz, 'ed')
  }
  s += b.pos > 5 ? cflow(u0 + 1, u1 - 1, [z0 + 3, z1 - 3]) : ''
  vue(b, cs, s)
  // servomoteur sur la face
  const sv = b.box(u1 - 11, CTA_D, z0 + 2, 14, 10, 17, 'mb')
  b.pl('xz', CTA_D + 10.05, r2(u1 - 9, z0 + 11, 10, 5, 'fk', 1) + r2(u1 - 8, z0 + 12.2, 8 * (b.pos / 100), 2.6, 'fa', .3) + c2(u1 - 4, z0 + 6, 1.4, 'led'), sv)
  b.cylY(u1 - 4, CTA_D + 10, z0 + 10, 0.1, 0.1, 'mm')
  b.path3([[u1 - 4, CTA_D + 5, z0 + 19], [u1 - 4, CTA_D + 5, z0 + 26], [u1 - 18, CTA_D + 5, z0 + 26]], 'ed2')
  b.anchor('badge', [L / 2, CTA_D / 2, CTA_HB + c.H + 14])
}, { variantes: [] })

// ───────── caisson de mélange
base('melange', 'Caisson de mélange (2 registres, air neuf + recyclé)', 110, { fluide: 'air_souffle' }, PLPOS, (b, p, c, cs) => {
  const { L, z0, z1 } = c, zb = CTA_HB
  const pos = b.pos
  let s = ''
  const reg = (ua: number, ub: number, th: number) => {
    const n = 4, pitch = (z1 - z0) / n
    let q = r2(ua - 1, z0, ub - ua + 2, z1 - z0, 'ed2')
    for (let i = 0; i < n; i++) { const cz = z0 + pitch * (i + 0.5); q += `<g transform="translate(${(ua + ub) / 2} ${cz}) rotate(${-th})">${d2(`M${-pitch * 0.53} -1.2H${pitch * 0.53}V1.2H${-pitch * 0.53}Z`, 'fm')}</g>` }
    return q
  }
  s += reg(9, 28, 90 - pos * 0.9) + reg(L - 30, L - 11, 90 - (100 - pos) * 0.9)
  s += `<g class="cflow">${[z0 + 8, z1 - 8].map((v) => `<path class="flow air" d="M${L / 2 - 14} ${v}h28"/>`).join('')}</g>`
  s += chev(L / 2, (z0 + z1) / 2, 1.3)
  vue(b, cs, s)
  // entrée supplémentaire : piquage air neuf au-dessus (port 'neuf') + reprise en face arrière non visible
  const bx = b.box(12, 14, zb + c.H, 26, 38, 6, 'mm')
  b.pl('xz', 70, '', bx)
  b.port('neuf', [25, CTA_D / 2, zb + c.H + 6], [0, 0, 1], { type: 'gaine', fluide: 'air_neuf', w: 26, h: 40 })
  b.port('recycle', [L - 20, CTA_D / 2, zb + c.H], [0, 0, 1], { type: 'gaine', fluide: 'air_repris', w: 26, h: 40 })
}, { fenetre: true })

// ───────── filtres
base('filtre_plan', 'Filtre plan (cellules + pressostat différentiel)', 58, { fluide: 'air_neuf' }, [['arret'], ['marche', { colmatage: 20 }], ['marche', { colmatage: 60 }], ['alarme', { colmatage: 92 }], ['defaut'], ['consigne', { manuel: true }], ['inconnu'], ['marche', { colmatage: 20 }, 90]], (b, p, c, cs) => {
  const { L, z0, z1, u0, u1 } = c
  const col = b.val.colmatage ?? 15
  let s = ''
  const nz = 3, cw = (z1 - z0) / nz
  for (let i = 0; i < nz; i++) {
    const zz = z0 + cw * i
    s += r2(u0 + 2, zz + 1, u1 - u0 - 4, cw - 2, col > 80 ? 'fo' : 'fw', 1)
    // plis (zigzag vu de côté)
    let zg = `M${u0 + 4} ${zz + 2}`
    const k = Math.floor((u1 - u0 - 8) / 2.4)
    for (let j = 0; j < k; j++) zg += `L${u0 + 4 + j * 2.4 + 1.2} ${zz + cw - 3}L${u0 + 4 + (j + 1) * 2.4} ${zz + 2}`
    s += `<path class="ed2" d="${zg}"/>`
  }
  s += cflow(u0, u1, [z0 + 5, z1 - 5])
  vue(b, cs, s)
  // pressostat différentiel sur le dessus de la face
  const ps = b.box(L / 2 - 8, CTA_D, z1 + 1, 16, 7, 9, 'mb')
  b.pl('xz', CTA_D + 7.05, c2(L / 2, z1 + 5.5, 3.2, 'fw') + `<path class="sig" d="M${L / 2} ${z1 + 5.5}l${2.4 * Math.cos((180 - col * 1.8) * Math.PI / 180)} ${-2.4 * Math.sin((180 - col * 1.8) * Math.PI / 180)}"/>`, ps)
  b.led([L / 2 + 6, CTA_D + 7.05, z1 + 2.5], ps, 1.2)
  b.path3([[L / 2 - 4, CTA_D + 3, z1 + 9], [L / 2 - 4, CTA_D + 3, z1 + 14], [L / 2 - 12, CTA_D + 3, z1 + 14], [L / 2 - 12, CTA_D + 3, z1 - 4]], 'ed2')
  b.path3([[L / 2 + 4, CTA_D + 3, z1 + 9], [L / 2 + 4, CTA_D + 3, z1 + 12], [L / 2 + 12, CTA_D + 3, z1 + 12], [L / 2 + 12, CTA_D + 3, z1 - 4]], 'ed2')
})
base('filtre_poches', 'Filtre à poches (pressostat différentiel)', 92, { fluide: 'air_neuf' }, [['arret'], ['marche', { colmatage: 20 }], ['marche', { colmatage: 60 }], ['alarme', { colmatage: 92 }], ['defaut'], ['consigne', { manuel: true }], ['inconnu'], ['marche', { colmatage: 20 }, 90]], (b, p, c, cs) => {
  const { L, z0, z1, u0, u1 } = c
  const col = b.val.colmatage ?? 15
  let s = ''
  const nz = 3, cw = (z1 - z0) / nz, len = u1 - u0 - 8
  for (let i = 0; i < nz; i++) {
    const zz = z0 + cw * i + cw / 2
    // poche : trapèze effilé vers l'aval + coutures
    s += d2(`M${u0 + 3} ${zz - cw / 2 + 1}L${u0 + 3 + len} ${zz - 2.4}L${u0 + 3 + len} ${zz + 2.4}L${u0 + 3} ${zz + cw / 2 - 1}Z`, col > 80 ? 'fo' : 'fw')
    for (const k of [-0.5, 0, 0.5]) s += l2(u0 + 3, zz + k * (cw / 2 - 1), u0 + 3 + len, zz + k * 2.2, 'ed2')
    s += r2(u0, zz - cw / 2 + 0.5, 4, cw - 1, 'fm')
  }
  s += cflow(u0, u1, [z0 + 5, z1 - 5])
  vue(b, cs, s)
  const ps = b.box(L / 2 - 8, CTA_D, z1 + 1, 16, 7, 9, 'mb')
  b.pl('xz', CTA_D + 7.05, c2(L / 2, z1 + 5.5, 3.2, 'fw') + `<path class="sig" d="M${L / 2} ${z1 + 5.5}l${2.4 * Math.cos((180 - col * 1.8) * Math.PI / 180)} ${-2.4 * Math.sin((180 - col * 1.8) * Math.PI / 180)}"/>`, ps)
  b.path3([[L / 2 - 4, CTA_D + 3, z1 + 9], [L / 2 - 4, CTA_D + 3, z1 + 13], [L / 2 - 14, CTA_D + 3, z1 + 13], [L / 2 - 14, CTA_D + 3, z1 - 4]], 'ed2')
  b.path3([[L / 2 + 4, CTA_D + 3, z1 + 9], [L / 2 + 4, CTA_D + 3, z1 + 11], [L / 2 + 14, CTA_D + 3, z1 + 11], [L / 2 + 14, CTA_D + 3, z1 - 4]], 'ed2')
})

// ───────── batteries (eau chaude / eau glacée / glycolée / électrique)
const FLB: Record<string, Fluide> = { chaude: 'eau_chaude_aller', froide: 'eau_glacee', glycolee: 'eau_glycolee', electrique: 'neutre' }
enregistrer({
  id: 'cta.batterie', famille: 'CTA', nom: 'Batterie (chaude / froide / glycolée / électrique)',
  taille: (p) => [p.L ?? 72, CTA_D + 26, (p.h ?? 62) + CTA_HB], variantes: ['chaude', 'froide', 'glycolee', 'electrique'], defauts: { h: 62, variante: 'chaude', fluide: 'air_souffle', L: 72 },
  planche: PL, exemplePlanche: {},
  dessiner(b: Builder, p: Params) {
    const v = p.variante as string, L = p.L ?? 72, H = p.h
    const c = caisson(b, L, H, p.fluide)
    const cs = b.parts[1]
    const { z0, z1 } = c, eau = FLB[v] ?? 'eau_chaude_aller', zb = CTA_HB
    let s = ''
    const x0 = 12, x1 = L - 12
    s += r2(x0 - 2, z0 - 1, x1 - x0 + 4, z1 - z0 + 2, 'fw', 1)
    if (v === 'electrique') {
      const n = 6
      for (let i = 0; i < n; i++) {
        const z = z0 + 3 + ((z1 - z0 - 6) * i) / (n - 1)
        let zz = `M${x0} ${z}`
        for (let j = 0; j < 6; j++) zz += `L${x0 + ((x1 - x0) * (j + 0.5)) / 6} ${z + (j % 2 ? 2 : -2)}`
        s += `<path class="ed3" d="${zz}L${x1} ${z}"/><g class="heat"><path class="tkw" d="${zz}L${x1} ${z}"/></g>`
      }
    } else {
      // tubes vus par leur extrémité (quinconce) + ailettes (lignes fines)
      const rows = 3, pz = 6.2
      const nz = Math.floor((z1 - z0 - 4) / pz)
      for (let r = 0; r < rows; r++) for (let i = 0; i < nz; i++) {
        const cx = x0 + 5 + r * ((x1 - x0 - 10) / (rows - 1)), cz = z0 + 4 + i * pz + (r % 2 ? pz / 2 : 0)
        if (cz > z1 - 3) continue
        s += fl(eau, c2(cx, cz, 1.9, 'fl')) + c2(cx, cz, 1.9, 'ed2')
      }
      for (let u = x0 + 1; u < x1; u += 1.8) s += `<path class="ed2" style="stroke-opacity:.25" d="M${u} ${z0 - 1}V${z1 + 1}"/>`
    }
    s += cflow(x0 - 8, x1 + 8, [z0 + 5, z1 - 5])
    vue(b, cs, s)
    if (v !== 'electrique') {
      // collecteurs sur la face +y : entrée basse / sortie haute, piquages à brides
      const xa = L - 7, xb = L - 16
      const hz = [z0 - 2, z1 + 2] as const
      // feed 'g' : entrée côté intérieur (alimentation venant de la gauche) ; 'd' (défaut) : entrée côté bord
      const feedG = p.feed === 'g'
      for (const [xx, ent] of [[xa, !feedG], [xb, feedG]] as const) {
        const hd = b.cylZ(xx, CTA_D + 5, hz[0] + 1, 2.8, z1 - z0 + 2, 'mm')
        b.rings(hd, [xx, CTA_D + 5, hz[0] + 1], [xx, CTA_D + 5, z1 + 3], 2.8, [0.5])
        const zz = ent ? z0 + 3 : z1 - 3
        b.cylY(xx, CTA_D, zz, 1.9, 22, 'mm')
        b.flange([xx, CTA_D + 18, zz], 'y', 4.2, 2.4, 6)
        b.cylY(xx, CTA_D + 9, zz, 2.8, 2.4, 'ma')   // bague fluide
        b.port(ent ? 'entree' : 'sortie', [xx, CTA_D + 22, zz], [0, 1, 0], { dn: 2, fluide: v === 'chaude' ? (ent ? 'eau_chaude_aller' : 'eau_chaude_retour') : eau })
      }
      b.cylZ(xa, CTA_D + 5, z1 + 3, 0.1, 0.1, 'mm')
      b.cylZ(xb, CTA_D + 5, z1 + 3, 1.6, 4, 'md')  // purge
      if (v === 'froide' || v === 'glycolee') {
        // bac à condensats + siphon
        const bc = b.box(x0 - 3, 3, zb - 0.5, x1 - x0 + 6, CTA_D - 6, 0.5, 'mm')
        b.box(x0 - 3, 4, zb, x1 - x0 + 6, CTA_D - 8, 2.4, 'mm'); void bc
        b.cylY(x0 + 3, CTA_D - 4, zb + 0.6, 1.6, 9, 'mm'); b.cylZ(x0 + 3, CTA_D + 5, zb - 3, 1.4, 4.4, 'mm')
      }
    } else {
      // boîtier de puissance : thyristor + bornes
      const bx = b.box(L - 20, CTA_D, z1 - 14, 17, 7, 20, 'mb')
      b.pl('xz', CTA_D + 7.05, r2(L - 18, z1 - 4, 13, 6, 'fk', 1) + c2(L - 15, z1 - 9, 1.5, 'led') + c2(L - 10, z1 - 9, 1.5, 'fm') + l2(L - 18, z1 - 12, L - 5, z1 - 12, 'ed2'), bx)
      b.led([L - 8, CTA_D + 7.05, z1 - 9], bx, 1.4)
      b.port('puissance', [L - 12, CTA_D + 7, z1 - 14], [0, 1, 0], { type: 'elec' })
    }
  },
})

// ───────── humidificateur
enregistrer({
  id: 'cta.humidificateur', famille: 'CTA', nom: 'Humidificateur (vapeur / adiabatique)',
  taille: (p) => [p.L ?? 86, CTA_D + 26, (p.h ?? 62) + CTA_HB], variantes: ['vapeur', 'adiabatique'], defauts: { h: 62, variante: 'vapeur', fluide: 'air_souffle', L: 86 },
  planche: PL,
  dessiner(b: Builder, p: Params) {
    const L = p.L ?? 86, H = p.h
    const c = caisson(b, L, H, p.fluide)
    const cs = b.parts[1]
    const { z0, z1, u0, u1 } = c
    let s = ''
    if (p.variante === 'adiabatique') {
      // média nid d'abeille (hexagones) + ruissellement
      const x0 = u0 + 8, x1 = u1 - 22
      s += r2(x0, z0, x1 - x0, z1 - z0, 'fw', 1)
      const hx = 3.2
      for (let zz = z0 + 2; zz < z1 - 2; zz += hx * 1.6) for (let xx = x0 + 2; xx < x1 - 2; xx += hx * 1.8) {
        const o = Math.round((zz - z0) / (hx * 1.6)) % 2 ? hx * 0.9 : 0
        if (xx + o > x1 - 3) continue
        s += d2(`M${xx + o} ${zz}l${hx * .45} ${hx * .4}v${hx * .8}l${-hx * .45} ${hx * .4}l${-hx * .45} ${-hx * .4}v${-hx * .8}Z`, 'ed2')
      }
      s += fl('eau', r2(x0, z1 - 4, x1 - x0, 4, 'fl', 0)) + `<g class="cflow">${[0.25, 0.5, 0.75].map((k) => `<path class="flow" d="M${x0 + (x1 - x0) * k} ${z1 - 4}V${z0 + 2}"/>`).join('')}</g>`
      s += cflow(u0, u1, [z0 + 5, z1 - 5])
      vue(b, cs, s)
      const pump = b.cylX(L - 22, CTA_D + 6, z0 + 4, 4, 12, 'mb')
      b.rings(pump, [L - 22, CTA_D + 6, z0 + 4], [L - 10, CTA_D + 6, z0 + 4], 4, [0.5])
      b.box(L - 28, CTA_D, z0 - 1, 22, 3, 3, 'mm')
      b.port('eau', [L - 22, CTA_D + 6, z0 + 4], [0, 1, 0], { dn: 1.6, fluide: 'eau' })
    } else {
      // rampe de distribution : lances verticales + collecteur ; panaches
      const n = 5
      for (let i = 0; i < n; i++) {
        const u = u0 + 10 + ((u1 - u0 - 34) * i) / (n - 1)
        s += `<path class="ed3" d="M${u} ${z1 - 2}V${z0 + 4}"/>` + [0, 1, 2, 3].map((k) => c2(u, z0 + 8 + k * ((z1 - z0 - 14) / 3), 1.2, 'fw')).join('')
        s += `<g class="cflow">${[0, 1, 2, 3].map((k) => `<path class="flow air" d="M${u + 2} ${z0 + 8 + k * ((z1 - z0 - 14) / 3)}h8"/>`).join('')}</g>`
      }
      s += d2(`M${u0 + 6} ${z1 - 1}H${u0 + 12 + (u1 - u0 - 34)}`, 'ed3')
      vue(b, cs, s)
      // générateur de vapeur (boîtier) côté face
      const g = b.box(L - 24, CTA_D, z0 + 2, 20, 12, 30, 'mb')
      b.pl('xz', CTA_D + 12.05, r2(L - 21, z0 + 20, 14, 8, 'fk', 1) + r2(L - 19.6, z0 + 22, 6, 1.4, 'fa', .3) + c2(L - 17, z0 + 13, 1.5, 'led') + c2(L - 12, z0 + 13, 1.5, 'fm') + c2(L - 8, z0 + 13, 1.5, 'fm'), g)
      b.cylY(L - 14, CTA_D + 12, z0 + 34, 0.1, 0.1, 'mm')
      b.cylZ(L - 14, CTA_D + 6, z0 + 32, 3, 5, 'mm')
      b.path3([[L - 14, CTA_D + 6, z0 + 37], [L - 14, CTA_D + 6, z1 + 4], [u0 + 10, CTA_D + 6, z1 + 4]], 'ed3')
      b.port('vapeur', [L - 20, CTA_D + 12, z0 + 10], [0, 1, 0], { dn: 2, fluide: 'vapeur' })
    }
  },
})

// ───────── récupérateur à plaques (flux croisés) – deux étages
enregistrer({
  id: 'cta.recup_plaques', famille: 'CTA', nom: 'Récupérateur à plaques (flux croisés, 2 étages)',
  taille: (p) => [p.L ?? 90, CTA_D + 8, (p.h ?? 134) + CTA_HB], defauts: { h: 134, L: 90, fluide: 'air_souffle' }, planche: PL.slice(0, 2).concat([['alarme'], ['defaut'], ['inconnu']]),
  dessiner(b: Builder, p: Params) {
    const L = p.L ?? 90, H = p.h
    const c = caisson(b, L, H, p.fluide, { poignees: false })
    const cs = b.parts[1]
    const { z0, z1, u0, u1 } = c
    let s = ''
    const mid = (z0 + z1) / 2
    // bloc de plaques en losange + deux jeux de flux
    const cx = L / 2, cz = mid, ry = (z1 - z0) / 2 - 2, hw = (u1 - u0) / 2 - 3
    const dm = `M${cx - hw} ${cz}L${cx} ${cz + ry}L${cx + hw} ${cz}L${cx} ${cz - ry}Z`
    s += d2(dm, 'fw')
    const n = 12
    for (let i = 1; i < n; i++) { const k = i / n; s += `<path class="ed2" style="stroke-opacity:.55" d="M${cx - hw * (1 - k)} ${cz + ry * k}L${cx + hw * k} ${cz - ry * (1 - k)}"/>` }
    s += d2(dm, 'ed')
    // flux : soufflage (bas, vers +x) / extraction (haut, vers −x)
    s += `<g class="fl-air_souffle"><path class="fl" d="M${u0} ${z0 + 6}H${u1}V${z0 + 9}H${u0}Z" style="opacity:.6"/></g>` + cflow(u0, u1, [z0 + 7.5])
    s += `<g class="fl-air_repris"><path class="fl" d="M${u0} ${z1 - 9}H${u1}V${z1 - 6}H${u0}Z" style="opacity:.6"/></g>` + `<g class="cflow"><path class="flow air" style="animation-direction:reverse" d="M${u0} ${z1 - 7.5}H${u1}"/></g>`
    s += l2(u0, mid, u1, mid, 'ed')
    vue(b, cs, s)
    // by-pass motorisé (volet)
    const bp = b.box(L - 15, CTA_D, mid - 7, 12, 5, 14, 'mb')
    b.led([L - 9, CTA_D + 5, mid + 3], bp, 1.3)
    // ports : étage bas = air neuf → soufflage ; haut = repris → rejeté
    const zb = CTA_HB
    b.ports.length = 0
    b.port('neuf_in', [0, CTA_D / 2, zb + 31], [-1, 0, 0], { type: 'gaine', fluide: 'air_neuf', w: 44, h: 46 })
    b.port('souf_out', [L, CTA_D / 2, zb + 31], [1, 0, 0], { type: 'gaine', fluide: 'air_souffle', w: 44, h: 46 })
    b.port('repris_in', [L, CTA_D / 2, zb + 31 + H / 2], [1, 0, 0], { type: 'gaine', fluide: 'air_repris', w: 44, h: 46 })
    b.port('rejet_out', [0, CTA_D / 2, zb + 31 + H / 2], [-1, 0, 0], { type: 'gaine', fluide: 'air_rejete', w: 44, h: 46 })
  },
})

// ───────── roue de récupération (tourne)
enregistrer({
  id: 'cta.recup_roue', famille: 'CTA', nom: 'Roue de récupération (rotative, tourne)',
  taille: (p) => [p.L ?? 50, CTA_D + 10, (p.h ?? 134) + CTA_HB], defauts: { h: 134, L: 50, fluide: 'air_souffle' }, planche: PL.slice(0, 2).concat([['alarme'], ['defaut'], ['inconnu']]),
  dessiner(b: Builder, p: Params) {
    const L = p.L ?? 50, H = p.h, D = CTA_D, zb = CTA_HB
    // châssis ouvert : socle, dalle haute, 4 poteaux ; roue (cylindre d'axe x) visible
    b.box(0, 3, 0, L, D - 6, zb, 'mm')
    const cz = zb + H / 2, cy = D / 2, R = Math.min(D / 2 - 4, H / 2 - 4)
    const rr = Math.min(R, 36)
    const wh = b.cylX(L / 2 - 8, cy, cz, rr, 16, 'mb')
    b.rings(wh, [L / 2 - 8, cy, cz], [L / 2 + 8, cy, cz], rr, [0.5], 'ed2')
    // face +x : alvéoles + rayons, tourne
    let face = c2(0, 0, rr, 'fw')
    for (let i = 1; i <= 4; i++) face += c2(0, 0, (rr * i) / 5, 'ed2')
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; face += l2(Math.cos(a) * rr * 0.12, Math.sin(a) * rr * 0.12, Math.cos(a) * rr, Math.sin(a) * rr, 'ed2') }
    b.rotor('yz', L / 2 + 8, cy, cz, face + c2(0, 0, 3, 'fd'), wh, 7)
    b.pl('yz', L / 2 + 8, c2(cy, cz, rr, 'ed') + c2(cy, cz, rr + 2.4, 'ed'), wh)
    // cloison médiane + secteur de purge
    b.box(0, 2, cz - 1.2, L, D - 4, 2.4, 'mm')
    // cadre
    for (const [x, y] of [[0, 0], [L - 3, 0], [0, D - 3], [L - 3, D - 3]]) b.box(x, y, zb, 3, 3, H, 'mm')
    b.box(0, 0, zb + H, L, D, 3, 'mm')
    // moteur d'entraînement + courroie
    const mo = b.cylY(L / 2 - 4, D, zb + 6, 5, 10, 'mb')
    b.rings(mo, [L / 2 - 4, D, zb + 6], [L / 2 - 4, D + 10, zb + 6], 5, [0.5])
    b.led([L / 2 - 4, D + 10.05, zb + 6], mo, 1.4)
    b.box(L / 2 - 14, D - 4, zb, 20, 4, 3, 'mm')
    b.anchor('badge', [L / 2, D / 2, zb + H + 14]); b.anchor('haut', [L / 2, D / 2, zb + H + 3])
    const pw = 44
    b.port('neuf_in', [0, D / 2, zb + 31], [-1, 0, 0], { type: 'gaine', fluide: 'air_neuf', w: pw, h: H / 2 - 12 })
    b.port('souf_out', [L, D / 2, zb + 31], [1, 0, 0], { type: 'gaine', fluide: 'air_souffle', w: pw, h: H / 2 - 12 })
    b.port('repris_in', [L, D / 2, zb + 31 + H / 2], [1, 0, 0], { type: 'gaine', fluide: 'air_repris', w: pw, h: H / 2 - 12 })
    b.port('rejet_out', [0, D / 2, zb + 31 + H / 2], [-1, 0, 0], { type: 'gaine', fluide: 'air_rejete', w: pw, h: H / 2 - 12 })
  },
})

// ───────── piège à son
base('piege_son', 'Piège à son (baffles absorbants)', 100, { fluide: 'air_souffle' }, PL.slice(0, 2).concat([['defaut'], ['inconnu']]), (b, p, c, cs) => {
  const { z0, z1, u0, u1 } = c
  let s = ''
  const n = 5, ph = (z1 - z0) / n
  for (let i = 0; i < n; i++) {
    const z = z0 + ph * i + ph * 0.22
    s += r2(u0 + 3, z, u1 - u0 - 6, ph * 0.56, 'fk', 2)
    for (let u = u0 + 8; u < u1 - 6; u += 5) s += `<path class="ed2" style="stroke-opacity:.5" d="M${u} ${z + 1.5}V${z + ph * 0.56 - 1.5}"/>`
  }
  s += cflow(u0, u1, [z0 + 2.5, z1 - 2.5, (z0 + z1) / 2 + ph * 0.5])
  vue(b, cs, s)
}, {})

// ───────── ventilateur plug-fan (roue visible par le hublot)
enregistrer({
  id: 'cta.ventilateur', famille: 'CTA', nom: 'Ventilateur plug-fan (roue visible par la porte)',
  taille: (p) => [p.L ?? 100, CTA_D + 22, (p.h ?? 62) + CTA_HB], defauts: { h: 62, L: 100, fluide: 'air_souffle' }, planche: PL,
  dessiner(b: Builder, p: Params) {
    const L = p.L ?? 100, H = p.h, D = CTA_D, zb = CTA_HB
    const c = caisson(b, L, H, p.fluide, { fenetre: false, poignees: false })
    const cs = b.parts[1]
    const cx = L * 0.5, cz = zb + H / 2, R = Math.min(H / 2 - 7, 24)
    let s = c2(cx, cz, R + 5, 'ed') + c2(cx, cz, R + 3, 'in')
    // roue vue de face (axe y) : tourne en marche
    const wheel = `<g transform="translate(${cx} ${cz})"><g class="spin">${roueAubes(R, 11).replace(/<circle class="fm"[^>]*>/, '<circle class="fb" cx="0" cy="0" r="' + R + '"/>')}</g></g>`
    s += wheel
    s += `<path class="ed" d="M${cx - R - 5} ${cz - R - 5}H${cx - R - 12}V${cz + R + 5}H${cx - R - 5}"/>`
    vue(b, cs, s)
    // porte de visite à charnières et poignée
    b.box(cx + R + 8, D, cz - 6, 2.4, 2.6, 12, 'mm')
    // moteur arrière (côté +x, sur la face) + variateur
    const mo = b.cylX(L - 4, D / 2, cz, 9, 12, 'mb'); b.rings(mo, [L - 4, D / 2, cz], [L + 8, D / 2, cz], 9, [0.33, 0.66])
    // flèche de sens
    const sg = p.sens === -1 ? -1 : 1
    b.pl('xz', D + 0.15, chev(L - 14, zb + 7, 1.2 * sg) + chev(L - 20, zb + 7, 1.2 * sg), cs)
    const vf = b.box(L * 0.18, D, zb + H - 20, 16, 8, 18, 'mb')
    b.pl('xz', D + 8.05, r2(L * 0.18 + 2, zb + H - 10, 12, 6, 'fk', 1) + r2(L * 0.18 + 3, zb + H - 8.8, 5, 1.5, 'fa', .3) + c2(L * 0.18 + 5, zb + H - 15, 1.3, 'led') + c2(L * 0.18 + 10, zb + H - 15, 1.3, 'fm'), vf)
    b.led([L * 0.18 + 5, D + 8.05, zb + H - 15], vf, 1.3)
    b.port('pression', [L * 0.5, D, zb + H - 3], [0, 1, 0], { type: 'signal' })
  },
})

// ───────── section vide / porte de visite
base('section_vide', 'Section vide (porte de visite, éclairage)', 60, { fluide: 'air_souffle' }, PL.slice(0, 1).concat([['marche'], ['defaut'], ['alarme'], ['inconnu']]), (b, p, c, cs) => {
  const { z0, z1, u0, u1 } = c
  let s = r2(u0, z0, u1 - u0, z1 - z0, 'in')
  s += cflow(u0, u1, [(z0 + z1) / 2])
  // hublot + sonde d'ambiance éventuelle
  s += c2((u0 + u1) / 2, (z0 + z1) / 2, 5, 'fg')
  vue(b, cs, s)
  b.box(c.L / 2 - 4, CTA_D, c.z1 - 3, 8, 4, 6, 'mm')
})

// ───────── bouches / diffuseurs / grilles terminales
enregistrer({
  id: 'cta.diffuseur', famille: 'CTA', nom: 'Diffuseur plafonnier + plénum (soufflage / reprise)',
  taille: () => [44, 44, 40], defauts: { fluide: 'air_souffle' }, planche: PL.slice(0, 2).concat([['defaut'], ['alarme'], ['inconnu']]),
  dessiner(b: Builder, p: Params) {
    const pl = b.box(6, 6, 0, 32, 32, 12, 'mb')
    b.box(2, 2, 0, 40, 40, 2.4, 'mm')
    b.pl('xy', 2.4, r2(7, 7, 30, 30, 'ed') + r2(11, 11, 22, 22, 'ed2') + r2(15, 15, 14, 14, 'ed2') + r2(19, 19, 6, 6, 'ed2') + l2(2, 2, 19, 19, 'ed2') + l2(42, 2, 25, 19, 'ed2') + l2(2, 42, 19, 25, 'ed2') + l2(42, 42, 25, 25, 'ed2'), undefined, [2, 2, 42, 42], 'mm')
    b.cylZ(22, 22, 12, 9, 6, 'mm'); b.flange([22, 22, 17], 'z', 11, 2, 6)
    b.port('gaine', [22, 22, 23], [0, 0, 1], { type: 'gaine', fluide: p.fluide, w: 18, h: 18 })
    void pl
    b.anchor('badge', [22, 22, 40])
  },
})
enregistrer({
  id: 'cta.bouche_murale', famille: 'CTA', nom: 'Bouche murale (reprise / soufflage)',
  taille: () => [50, 14, 30], defauts: { fluide: 'air_repris' }, planche: PL.slice(0, 2).concat([['defaut'], ['alarme'], ['inconnu']]),
  dessiner(b: Builder, p: Params) {
    const m = b.box(0, 0, 0, 50, 6, 30, 'mb')
    b.pl('xz', 6, r2(3, 3, 44, 24, 'ed', 1) + [0, 1, 2, 3, 4, 5].map((i) => d2(`M5 ${5 + i * 3.8}H45V${7.2 + i * 3.8}H5Z`, 'fm')).join(''), m)
    b.cylY(25, -10, 15, 7, 10, 'mm')
    b.port('gaine', [25, -10, 15], [0, -1, 0], { type: 'gaine', fluide: p.fluide, w: 22, h: 22 })
    b.anchor('badge', [25, 3, 40])
  },
})

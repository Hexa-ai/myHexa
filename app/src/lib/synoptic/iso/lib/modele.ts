/* eslint-disable @typescript-eslint/no-explicit-any -- paramètres de symboles libres par conception (voir iso/README.md) */
// Modèle de connexion : composants à ports, liaisons (tuyaux routés automatiquement), accessoires en ligne, tés, ponts.
// Tout se sérialise en JSON ; `construire(doc)` reconstruit la scène entièrement.
import type { V3, BBox } from './geom'
import { add, sub, mul, len, unit, dot, proj, f, VUE } from './geom'
import type { Plan, Rel } from './geom'
import { dessiner } from './registre'
import { Scene } from './scene'
import type { Item } from './tubes'
import type { Seg, Obstacle, PortRoute } from './routeur'
import { router, collisions, ajouterPonts, simplifier } from './routeur'
import { rayonDN, dnDeRayon, rayonCoude, EPAIS_BRIDE, tuyauSvg, coudeSvg, flangeSvg, soudureSvg, teSvg, reductionSvg, bridePleineSvg } from './reseau'
import type { EtatNom, Fluide, Port, Rendu, Valeurs } from './types'

// ───────────── format JSON
export interface RefPort { c: string; port: string }
export interface RefTap { liaison: string; s?: number; d?: number; dir?: 'x+' | 'x-' | 'y+' | 'y-' | 'z+' | 'z-' }
export type Extremite = RefPort | RefTap
/** niveau de détail de l'instrumentation : cadrans et têtes détaillés | pastille discrète + valeur en étiquette | rien */
export type Niveau = 'complet' | 'indicateur' | 'masque'
export interface Accessoire {
  /** niveau de détail propre à cet accessoire (sinon `doc.instruments`, sinon 'indicateur') */
  niveau?: Niveau
  /** n'afficher cet accessoire qu'à ce niveau de détail (ex. 'complet' : thermomètre / manomètre local à cadran) */
  seulement?: Niveau
  /** repère de l'instrument (TT1, PT2…) affiché dans l'étiquette en mode indicateur */
  tag?: string
  /** unité de la valeur affichée (défaut selon le type) */
  unite?: string
  /** plan forcé : 'avant' | 'arriere' | décalage numérique */
  plan?: Plan
  id?: string
  /** type du catalogue (vanne.*, instr.*) */
  type: string
  /** abscisse curviligne 0..1 (fraction de la longueur du tuyau) */
  s?: number
  /** ou distance depuis le début (px) */
  d?: number
  etat?: EtatNom
  valeurs?: Valeurs
  params?: Record<string, any>
  /** capteur en piquage : côté du tuyau horizontal ('haut' par défaut, 'x+', 'y+', 'x-', 'y-') */
  cote?: string
}
export interface Liaison {
  id: string
  de: Extremite
  vers: Extremite
  /** DN nominal (15…200). Par défaut : celui du port de départ */
  dn?: number
  fluide?: Fluide
  /** points de passage imposés (monde) */
  via?: V3[]
  /** 1 = sens de→vers, -1 = inverse, 0 = pas d'animation */
  flux?: number
  etat?: EtatNom
  calo?: boolean
  pont?: boolean
  accessoires?: Accessoire[]
  /** plan forcé : 'avant' | 'arriere' | décalage numérique (surcharge le tri de profondeur automatique) */
  plan?: Plan
}
export interface Composant {
  id: string
  type: string
  x: number; y: number; z: number
  rot?: 0 | 90 | 180 | 270
  /** centre de rotation : 'centre' de l'empreinte (défaut) ou point [x, y] de l'empreinte non tournée (ancrage au sol) ; (x, y) = coin de l'empreinte à rot 0 */
  pivot?: 'centre' | [number, number]
  /** plan forcé : 'avant' | 'arriere' | décalage numérique (surcharge le tri de profondeur automatique) */
  plan?: Plan
  etat?: EtatNom
  valeurs?: Valeurs
  params?: Record<string, any>
  niveau?: Niveau
  tag?: string
  unite?: string
  /** pose sur un port d'un autre composant (capteur sur cuve…) : position déduite */
  monte?: { sur: string; port: string; local?: string }
  /** basculement d'axe ('x' : l'axe local x devient vertical) ; `ancre` = port local posé au point (x, y, z) */
  tilt?: 'x' | 'xn'
  ancre?: string
}
export interface Etiq { c: string; ancre?: string; nom?: string; valeur?: string | number; unite?: string; repere?: string; dx?: number; dy?: number; etat?: EtatNom }
export interface Doc {
  version: 1
  /** niveau de détail de l'instrumentation (défaut 'indicateur') */
  instruments?: Niveau
  titre?: string
  composants: Composant[]
  liaisons: Liaison[]
  sol?: { x0: number; y0: number; x1: number; y1: number; pas?: number }
  etiquettes?: Etiq[]
}

export interface InfoAcc { id: string; type: string; centre: V3; axe: V3; segment: number; debut: V3; fin: V3; largeur: number }
export interface InfoLiaison {
  id: string; pts: V3[]; r: number; fluide: Fluide; coudes: number; ok: boolean
  accessoires: InfoAcc[]; tes: { centre: V3; dir: V3; enfant: string }[]; segments: Seg[]; ponts: number
}
export interface Resultat {
  scene: Scene
  rendus: Record<string, Rendu>
  liaisons: Record<string, InfoLiaison>
  obstacles: Obstacle[]
  collisions: { liaison: string; obstacle: string; segment: number }[]
  avertissements: string[]
  items: Item[]
}

// ───────────── rendu de composants avec cache (translation = affine en iso)
const CACHE = new Map<string, Rendu>()
export function viderCache() { CACHE.clear() }
const norm = (p: Record<string, any>): Record<string, any> => {
  const o = { ...p }
  if (typeof o.dn === 'number' && o.dn >= 15 && !o.dnPx) o.dn = rayonDN(o.dn)
  return o
}
export function rendu0(type: string, params: Record<string, any>, etat: EtatNom, val: Valeurs, rot = 0, tilt?: string, id?: string): Rendu {
  const p = { ...norm(params), rot, ...(tilt ? { tilt } : {}), ...(id ? { id } : {}) } as any
  const key = type + JSON.stringify([p, etat, val])
  let r = CACHE.get(key)
  if (!r) { r = dessiner(type, { ...p, x: 0, y: 0, z: 0 }, etat, val); CACHE.set(key, r) }
  return r
}
const trBox = (b: BBox, t: V3): BBox => ({ x0: b.x0 + t[0], y0: b.y0 + t[1], z0: b.z0 + t[2], x1: b.x1 + t[0], y1: b.y1 + t[1], z1: b.z1 + t[2] })
export function translater(r: Rendu, t: V3): Rendu {
  const [sx, sy] = proj(t)
  const ports: Port[] = r.ports.map((q) => ({ ...q, pos: add(q.pos, t) }))
  const anc: Record<string, V3> = {}
  for (const k of Object.keys(r.ancres)) anc[k] = add(r.ancres[k], t)
  return {
    ...r, svg: `<g transform="translate(${f(sx)} ${f(sy)})">${r.svg}</g>`, bbox: trBox(r.bbox, t), corps: r.corps ? trBox(r.corps, t) : undefined,
    ports, ancres: anc,
    port: (id: string) => { const p = ports.find((q) => q.id === id); if (!p) throw new Error(`port inconnu: ${r.type}.${id}`); return p },
  }
}

/** décalage (x, y) qui garde le pivot fixe quand on tourne : la rotation du Builder se fait autour du coin de l'empreinte */
export function decalagePivot(c: { type: string; params?: Record<string, any>; rot?: number; pivot?: 'centre' | [number, number] }, etat: EtatNom, val: Valeurs): [number, number] {
  const r0 = rendu0(c.type, c.params ?? {}, etat, val, 0, undefined)
  let W = 2 * r0.ancres.centre[0], D = 2 * r0.ancres.centre[1]
  const p0: [number, number] = c.pivot && c.pivot !== 'centre' ? [c.pivot[0], c.pivot[1]] : [W / 2, D / 2]
  let px = p0[0], py = p0[1]
  for (let k = 0; k < (c.rot ?? 0) / 90; k++) { const nx = D - py, ny = px; px = nx; py = ny; const t = W; W = D; D = t }
  return [p0[0] - px, p0[1] - py]
}

// ───────────── accessoires en ligne : description
interface DefAcc { kind: 'ligne' | 'piquage'; a?: string; b?: string; proc?: string; sens?: boolean }
const DIR_ACC: Record<string, DefAcc> = {
  'vanne.boisseau_pneu': { kind: 'ligne', a: 'a', b: 'b' }, 'vanne.papillon_motor': { kind: 'ligne', a: 'a', b: 'b' },
  'vanne.regulation': { kind: 'ligne', a: 'a', b: 'b' }, 'vanne.manuelle': { kind: 'ligne', a: 'a', b: 'b' },
  'vanne.electrovanne': { kind: 'ligne', a: 'a', b: 'b' }, 'vanne.clapet': { kind: 'ligne', a: 'a', b: 'b', sens: true },
  'vanne.soupape': { kind: 'ligne', a: 'in', b: 'out', sens: true }, 'vanne.filtre_y': { kind: 'ligne', a: 'a', b: 'b', sens: true },
  'vanne.pot_boue': { kind: 'ligne', a: 'a', b: 'b' }, 'instr.debitmetre': { kind: 'ligne', a: 'a', b: 'b' },
  'instr.pression': { kind: 'piquage', proc: 'proc' }, 'instr.pression_m': { kind: 'piquage', proc: 'proc' },
  'instr.temperature': { kind: 'piquage', proc: 'proc' }, 'instr.pressostat': { kind: 'piquage', proc: 'proc' },
  'instr.manometre': { kind: 'piquage', proc: 'proc' }, 'instr.thermometre': { kind: 'piquage', proc: 'proc' },
  'pompe.circulateur': { kind: 'ligne', a: 'a', b: 'b' }, 'chaufferie.compteur_energie': { kind: 'ligne', a: 'a', b: 'b' },
}
const CLAPETS = ['vanne.clapet_battant', 'vanne.clapet_boule']
export const defAcc = (t: string): DefAcc => DIR_ACC[t] ?? (t.startsWith('vanne.') || t === 'instr.debitmetre' ? { kind: 'ligne', a: 'a', b: 'b', sens: CLAPETS.includes(t) } : { kind: 'piquage', proc: 'proc' })
export function enregistrerAccessoire(type: string, d: DefAcc) { DIR_ACC[type] = d }
DIR_ACC['instr.repere'] = { kind: 'piquage', proc: 'proc' }

/** repère et unité par défaut d'un instrument */
const TAGS: [RegExp, string, string][] = [[/temperature|thermometre/, 'T', '°C'], [/manometre|pression|pressostat/, 'P', 'bar'], [/debit/, 'F', 'm³/h'], [/niveau/, 'L', '%']]
const tagDe = (t: string) => TAGS.find((q) => q[0].test(t)) ?? [/./, '', '']
export const estInstrument = (t: string) => t.startsWith('instr.') && t !== 'instr.repere'

/** orientation d'un appareil en ligne selon l'axe d du tuyau */
function orientLigne(d: V3, sens: boolean): { rot: number; tilt?: string } {
  if (Math.abs(d[0]) > 0.5) return { rot: sens && d[0] < 0 ? 180 : 0 }
  if (Math.abs(d[1]) > 0.5) return { rot: sens ? (d[1] > 0 ? 90 : 270) : 270 }
  return { rot: 0, tilt: d[2] > 0 ? 'x' : 'xn' }
}
/** orientation d'un capteur dont le port 'proc' pointe vers -z, monté sur une normale n sortante */
export function orientNormale(n: V3): { rot: number; tilt?: string } {
  if (n[2] > 0.5) return { rot: 0 }
  if (n[0] > 0.5) return { rot: 0, tilt: 'x' }
  if (n[0] < -0.5) return { rot: 180, tilt: 'x' }
  if (n[1] > 0.5) return { rot: 0, tilt: 'y' }
  if (n[1] < -0.5) return { rot: 180, tilt: 'y' }
  return { rot: 0 }
}

const snapDirM = (d: V3): V3 => { const k = [0, 1, 2].reduce((m, i) => Math.abs(d[i]) > Math.abs(d[m]) ? i : m, 0); const o: V3 = [0, 0, 0]; o[k] = d[k] >= 0 ? 1 : -1; return o }
const axeDe = (s: string): V3 => ({ 'x+': [1, 0, 0], 'x-': [-1, 0, 0], 'y+': [0, 1, 0], 'y-': [0, -1, 0], 'z+': [0, 0, 1], 'z-': [0, 0, -1] } as Record<string, V3>)[s]
const wrapLien = (svg: string, id: string) => `<g class="lien" data-lien="${id}">${svg}</g>`

interface Occ { kind: 'acc' | 'tap'; cible: number; W: number; acc?: Accessoire; idx: number; tap?: { enfant: string; dir: V3; rb: number; lb: number; pos?: V3 } }

/** composants que le routeur ignore (supports passant sous les tuyaux) */
const SANS_OBSTACLE = new Set(['chaufferie.console'])
// ───────────── construction
export function construire(doc: Doc, opt: { K?: number } = {}): Resultat {
  const avert: string[] = []
  const items: Item[] = []
  const rendus: Record<string, Rendu> = {}
  const obstacles: Obstacle[] = []
  const obstIdx: Record<string, number> = {}
  const sc = new Scene({ titre: doc.titre ?? '' })
  void opt

  // étiquettes automatiques des instruments (niveau « indicateur ») : puces compactes, placées par l'algorithme de placement
  const auto: import('./scene').Etiquette[] = []
  const etiqAuto = (a: { type: string; valeurs?: Valeurs; tag?: string; unite?: string }, ancre: V3, etat: EtatNom) => {
    const v = a.valeurs?.valeur
    if (v == null && !a.tag) return
    const [, t0, u0] = tagDe(a.type)
    auto.push({ ancre, compact: true, nom: a.tag ?? t0, valeur: v ?? '', unite: v != null ? (a.unite ?? u0) : '', etat: etat === 'alarme' || etat === 'defaut' ? etat : undefined })
  }

  // 1. composants (ceux qui « montent » après leur hôte)
  const pend = [...doc.composants]
  let guard = 0
  while (pend.length && guard++ < 200) {
    let c = pend.shift()!
    const c0type = c.type
    if (c.monte && !rendus[c.monte.sur]) { if (pend.some((q) => q.id === c.monte!.sur)) { pend.push(c); continue } avert.push(`composant ${c.id} : hôte ${c.monte.sur} introuvable`); continue }
    const etat = c.etat ?? 'arret', val = c.valeurs ?? {}
    let r: Rendu
    const nivC = c.niveau ?? doc.instruments ?? 'indicateur'
    if (c.monte && estInstrument(c.type) && nivC === 'masque') continue
    if (c.monte && estInstrument(c.type) && nivC === 'indicateur') { c = { ...c, type: 'instr.repere', params: {} } }
    if (c.monte) {
      const host = rendus[c.monte.sur].port(c.monte.port)
      const o = orientNormale(host.dir)
      const r0 = rendu0(c.type, c.params ?? {}, etat, val, o.tilt ? o.rot : (c.rot ?? 0), o.tilt, c.id)
      const lp = r0.port(c.monte.local ?? 'proc').pos
      r = translater(r0, sub(host.pos, lp))
    } else if (c.tilt) {
      const r0 = rendu0(c.type, c.params ?? {}, etat, val, c.rot ?? 0, c.tilt, c.id)
      const lp = c.ancre ? r0.port(c.ancre).pos : [0, 0, 0] as V3
      r = translater(r0, [c.x - lp[0], c.y - lp[1], c.z - lp[2]])
    } else {
      const rot = c.rot ?? 0
      const dp = rot ? decalagePivot(c, etat, val) : [0, 0]
      r = translater(rendu0(c.type, c.params ?? {}, etat, val, rot, undefined, c.id), [c.x + dp[0], c.y + dp[1], c.z])
    }
    rendus[c.id] = r
    let cb = r.corps ?? r.bbox
    // cuve sur pieds : l'espace sous le fond est libre (les jambes sont fines), on y passe des tuyaux
    if (c.type === 'cuve.verticale' && c.params?.pieds !== false) cb = { ...cb, z0: Math.max(cb.z0, (c.params?.pieds_h ?? 18) - 1) }
    if (!SANS_OBSTACLE.has(c.type) && c.params?.obstacle !== false) { obstIdx[c.id] = obstacles.length; obstacles.push({ id: c.id, bb: cb }) }
    items.push({ bb: r.bbox, id: 'c:' + c.id, plan: c.plan, svg: `<g class="cmp" data-c="${c.id}">${r.svg}</g>` })
    if (c.type === 'instr.repere' && (val.valeur != null || c.tag)) etiqAuto({ type: c0type, valeurs: val, tag: c.tag, unite: c.unite }, r.ancres.badge, etat)
  }

  // 2. liaisons : parents de tés d'abord
  const byId: Record<string, Liaison> = {}
  for (const L of doc.liaisons) byId[L.id] = L
  const ordre: Liaison[] = []
  const vu = new Set<string>()
  const visiter = (L: Liaison, pile: string[] = []) => {
    if (vu.has(L.id) || pile.includes(L.id)) return
    for (const e of [L.de, L.vers]) { const p = (e as RefTap).liaison; if (p && byId[p]) visiter(byId[p], [...pile, L.id]) }
    vu.add(L.id); ordre.push(L)
  }
  for (const L of doc.liaisons) visiter(L)

  const collis: { liaison: string; obstacle: string; segment: number }[] = []
  const infos: Record<string, InfoLiaison> = {}
  const segs: Seg[] = []
  const taps: Record<string, { pos: V3; dir: V3; r: number }> = {} // clé `${liaison}:${de|vers}`
  const enfants = (id: string) => doc.liaisons.filter((q) => (q.de as RefTap).liaison === id || (q.vers as RefTap).liaison === id)
  const getPort = (e: RefPort): Port => {
    const r = rendus[e.c]; if (!r) throw new Error(`composant inconnu: ${e.c}`)
    return r.port(e.port)
  }
  const autreBout = (q: Liaison, cote: 'de' | 'vers'): V3 | null => {
    const o = (cote === 'de' ? q.vers : q.de) as any
    if (o.c && rendus[o.c]) { try { return rendus[o.c].port(o.port).pos } catch { return null } }
    return null
  }

  for (const L of ordre) {
    try {
      const info = construireLiaison(L)
      infos[L.id] = info
      for (const s of info.segments) segs.push(s)
    } catch (e: any) { avert.push(`liaison ${L.id} : ${e.message}`) }
  }

  function construireLiaison(L: Liaison): InfoLiaison {
    const ext = (e: Extremite, cote: 'de' | 'vers'): PortRoute & { bride: boolean; fl?: Fluide; rPort: number; cid?: string } => {
      const t = e as RefTap
      if (t.liaison) {
        const k = taps[`${L.id}:${cote}`]
        if (!k) throw new Error(`piquage sur ${t.liaison} non résolu`)
        return { pos: k.pos, dir: k.dir, r: k.r, bride: false, rPort: k.r }
      }
      const p = getPort(e as RefPort)
      return { pos: p.pos, dir: p.dir, r: p.dn ?? 5, obstacle: obstIdx[(e as RefPort).c], bride: true, fl: p.fluide, rPort: p.dn ?? 5, cid: (e as RefPort).c }
    }
    const A = ext(L.de, 'de'), B = ext(L.vers, 'vers')
    const r = L.dn ? rayonDN(L.dn) : (A.bride ? A.r : B.r)
    const R = rayonCoude(r)
    const fluide: Fluide = L.fluide ?? A.fl ?? B.fl ?? 'eau'
    const calo = !!L.calo
    const flux = L.etat === 'marche' || L.etat === 'modulant' ? (L.flux ?? 1) : 0
    // sorties : tap = déjà sorti du tuyau principal
    const sA = A.bride ? undefined : R + 2, sB = B.bride ? undefined : R + 2
    const route = router({ ...A }, { ...B }, { r, obstacles, segments: segs, via: L.via, sortieA: sA, sortieB: sB })
    if (!route.ok) avert.push(`liaison ${L.id} : routage de repli (aucun chemin libre trouvé)`)
    let P = route.pts
    let ponts = 0
    if (L.pont !== false && segs.length) { const n0 = P.length; P = ajouterPonts(P, segs, r); ponts = (P.length - n0) / 4 }
    // contrôle final (après ponts) : aucune branche ne traverse une boîte (marge = rayon + 1)
    for (const h of collisions(P, obstacles, r, { ignA: A.obstacle, ignB: B.obstacle })) { const ob = obstacles[h.obstacle].id ?? '#' + h.obstacle; if (!collis.some((q) => q.liaison === L.id && q.obstacle === ob)) { collis.push({ liaison: L.id, obstacle: ob, segment: h.segment }); avert.push(`liaison ${L.id} : traverse ${ob}`) } }
    const nS = P.length - 1
    // longueurs
    const dirs: V3[] = [], Ls: number[] = [], G: number[] = []
    let acc = 0
    for (let i = 0; i < nS; i++) { const v = sub(P[i + 1], P[i]); Ls.push(len(v)); dirs.push(unit(v)); G.push(acc); acc += len(v) }
    const Ltot = acc
    const offStart = A.bride ? EPAIS_BRIDE + (Math.abs(A.rPort - r) > 0.5 ? 10 : 0) : 0
    const offEnd = B.bride ? EPAIS_BRIDE + (Math.abs(B.rPort - r) > 0.5 ? 10 : 0) : 0
    const lo = (i: number) => (i > 0 ? R : offStart)
    const hi = (i: number) => Ls[i] - (i < nS - 1 ? R : offEnd)

    // occupants : accessoires + tés
    const occ: Occ[] = []
    ;(L.accessoires ?? []).forEach((a, idx) => {
      const def = defAcc(a.type)
      if (a.seulement && (a.niveau ?? doc.instruments ?? 'indicateur') !== a.seulement) return
      if (def.kind === 'piquage' && estInstrument(a.type) && (a.niveau ?? doc.instruments ?? 'indicateur') === 'masque') return
      const cible = a.d != null ? a.d : (a.s ?? 0.5) * Ltot
      let W = 14
      if (def.kind === 'ligne') {
        const r0 = rendu0(a.type, { ...(a.params ?? {}), dn: r, dnPx: true }, a.etat ?? 'arret', a.valeurs ?? {}, 0, undefined)
        const pa = r0.port(def.a!).pos, pb = r0.port(def.b!).pos
        W = len(sub(pb, pa))
      } else W = Math.max(14, 2 * r + 8)
      occ.push({ kind: 'acc', cible, W, acc: a, idx })
    })
    for (const q of enfants(L.id)) {
      for (const cote of ['de', 'vers'] as const) {
        const t = (q[cote] as RefTap)
        if (t.liaison !== L.id) continue
        const rb = q.dn ? rayonDN(q.dn) : r
        const cible = t.d != null ? t.d : (t.s ?? 0.5) * Ltot
        occ.push({ kind: 'tap', cible, W: 2 * Math.max(rb, 0.8 * r) + 8, idx: 0, tap: { enfant: `${q.id}:${cote}`, dir: [0, 0, 0], rb, lb: r + rayonCoude(rb) + 6 } })
      }
    }
    occ.sort((a, b) => a.cible - b.cible)
    // placement
    let placed: { c: number; W: number; seg: number; o: Occ }[] = []
    let manque: string[] = []
    const placer = (avecGap: boolean) => {
    placed = []; manque = []
    for (const o of occ) {
      let bestC = NaN, bestD = 1e9, bestSeg = -1
      const gap0 = !avecGap ? 0 : o.kind === 'acc' && defAcc(o.acc!.type).kind === 'ligne' ? Math.max(6, 0.45 * o.W) : 0
      for (const gap of gap0 ? [gap0, 0] : [0]) {
      if (bestSeg >= 0) break
      for (let i = 0; i < nS; i++) {
        // un accessoire ne masque pas un coude : dégagement = 0,45 × largeur (≥ 6) entre le coude et le corps de l'appareil
        const a0 = G[i] + lo(i) + o.W / 2 + 0.5 + (i > 0 ? gap : 0), a1 = G[i] + hi(i) - o.W / 2 - 0.5 - (i < nS - 1 ? gap : 0)
        if (a1 < a0) continue
        // retirer les occupants déjà posés
        let ivs: [number, number][] = [[a0, a1]]
        for (const p of placed) {
          if (p.o.kind === 'tap' && o.kind === 'tap' && Math.abs(p.o.cible - o.cible) < 1) continue
          const g = (p.W + o.W) / 2 + 1
          const nv: [number, number][] = []
          for (const [u, v] of ivs) {
            if (p.c + g <= u || p.c - g >= v) { nv.push([u, v]); continue }
            if (p.c - g > u) nv.push([u, p.c - g])
            if (p.c + g < v) nv.push([p.c + g, v])
          }
          ivs = nv
        }
        for (const [u, v] of ivs) {
          const c = Math.max(u, Math.min(v, o.cible))
          const dd = Math.abs(c - o.cible)
          if (dd < bestD) { bestD = dd; bestC = c; bestSeg = i }
        }
      }
      }
      if (bestSeg < 0) { manque.push(`liaison ${L.id} : pas de place pour ${o.acc?.type ?? 'piquage'}`); continue }
      placed.push({ c: bestC, W: o.W, seg: bestSeg, o })
    }
    }
    placer(true)
    if (manque.length) placer(false)
    avert.push(...manque)
    placed.sort((a, b) => a.c - b.c)
    const pos = (g: number, i: number): V3 => add(P[i], mul(dirs[i], g - G[i]))

    const itemsDebut = items.length
    const out: Item[] = []
    // joint de port : bride du piquage + bride du tuyau + 1er tronçon = un seul ensemble, dessiné derrière le composant si le port tourne le dos à la caméra, devant sinon
    const relPort = (E: typeof A): Rel[] => (E.bride && E.cid ? [{ id: 'c:' + E.cid, cote: dot(snapDirM(E.dir), VUE) < 0 ? 'derriere' : 'devant' }] : [])
    const relA = relPort(A), relB = relPort(B)
    const ajoute = (bb: BBox, svg: string, cls = '', rel?: Rel[]) => out.push({ bb, id: 'l:' + L.id, plan: L.plan, rel, svg: wrapLien(`<g class="fl-${fluide}${cls}">${svg}</g>`, L.id) })
    const ajouteBrut = (bb: BBox, svg: string, rel?: Rel[]) => out.push({ bb, id: 'l:' + L.id, plan: L.plan, rel, svg: wrapLien(svg, L.id) })
    const infoAcc: InfoAcc[] = [], infoTes: { centre: V3; dir: V3; enfant: string }[] = []

    // tronçons droits (moins les occupants)
    for (let i = 0; i < nS; i++) {
      const u = G[i] + lo(i), v = G[i] + hi(i)
      const here = placed.filter((p) => p.seg === i)
      const cuts: [number, number][] = here.filter((p) => p.o.kind === 'tap' || defAcc(p.o.acc!.type).kind === 'ligne').map((p) => [p.c - p.W / 2, p.c + p.W / 2])
      let cur = u
      const segsPipe: [number, number][] = []
      for (const [c0, c1] of cuts) { if (c0 > cur + 0.5) segsPipe.push([cur, c0]); cur = Math.max(cur, c1) }
      if (v > cur + 0.5) segsPipe.push([cur, v])
      segsPipe.forEach(([g0, g1], q) => {
        const pc = tuyauSvg(pos(g0, i), pos(g1, i), r, { flux, calo })
        const rel = [...(i === 0 && q === 0 ? relA : []), ...(i === nS - 1 && q === segsPipe.length - 1 ? relB : [])]
        ajoute(pc.bb, pc.svg, '', rel)
      })
    }
    // coudes
    for (let i = 1; i < nS; i++) {
      const c = coudeSvg(P[i], dirs[i - 1], dirs[i], R, r, { flux, calo })
      const Sx = sub(P[i], mul(dirs[i - 1], R)), Ex = add(P[i], mul(dirs[i], R))
      ajoute(c.bb, c.svg + soudureSvg(Sx, dirs[i - 1], r) + soudureSvg(Ex, dirs[i], r))
    }
    // brides et réductions aux ports
    const bout = (E: typeof A, d: V3, p0: V3, off: number, rel: Rel[]) => {
      if (!E.bride) return
      const outD = mul(d, -1) // le tuyau part du port dans la direction du port : d = direction de sortie
      void outD
      const fl = flangeSvg(p0, d, E.rPort)
      ajouteBrut(fl.bb, `<g class="fl-${fluide}">${fl.svg}</g>`, rel)
      if (Math.abs(E.rPort - r) > 0.5) {
        const c0 = add(p0, mul(d, EPAIS_BRIDE)), c1 = add(p0, mul(d, EPAIS_BRIDE + 10))
        const rd = reductionSvg(c0, c1, E.rPort, r)
        ajoute(rd.bb, rd.svg, '', rel)
      }
      void off
    }
    bout(A, dirs[0], P[0], offStart, relA)
    bout(B, mul(dirs[nS - 1], -1), P[P.length - 1], offEnd, relB)

    // occupants
    for (const p of placed) {
      const i = p.seg, d = dirs[i], c = pos(p.c, i)
      const o = p.o
      if (o.kind === 'acc') {
        const a = o.acc!, def = defAcc(a.type)
        const id = a.id ?? `${L.id}.a${o.idx}`
        const etat = a.etat ?? 'arret'
        if (def.kind === 'ligne') {
          const ori = orientLigne(d, !!def.sens)
          const nivL = a.niveau ?? doc.instruments ?? 'indicateur'
          const prm = { ...(a.params ?? {}), dn: r, dnPx: true, fluide, sansMarqueur: true, ...(a.type === 'instr.debitmetre' && nivL !== 'complet' ? { simple: true } : {}) }
          const r0 = rendu0(a.type, prm, etat, a.valeurs ?? {}, ori.rot, ori.tilt, id)
          const pa = r0.port(def.a!).pos, pb = r0.port(def.b!).pos
          const L0 = len(sub(pb, pa))
          const mid = mul(add(pa, pb), 0.5)
          const start = sub(c, mul(d, L0 / 2))
          const rr = translater(r0, sub(c, mid))
          items.push({ bb: rr.corps ?? rr.bbox, id: 'a:' + id, plan: a.plan ?? L.plan, svg: `<g class="acc" data-lien="${L.id}" data-acc="${id}">${rr.svg}</g>` })
          infoAcc.push({ id, type: a.type, centre: c, axe: d, segment: i, debut: start, fin: add(start, mul(d, L0)), largeur: p.W })
          rendus[id] = rr
          if (nivL === 'indicateur') etiqAuto(a, rr.ancres.badge, etat)
        } else {
          // capteur en piquage : manchon soudé sur le tuyau, instrument au bout. Toujours côté spectateur (+x, +y, +z) pour que l'ordre de tri soit juste.
          const niv = a.niveau ?? doc.instruments ?? 'indicateur'
          const inst = estInstrument(a.type)
          let n: V3 = [0, 0, 1]
          if (Math.abs(d[2]) > 0.5) n = [1, 0, 0]
          if (a.cote && a.cote !== 'haut') { const cn = axeDe(a.cote); if (cn && Math.abs(dot(cn, d)) < 0.5 && (cn[0] + cn[1] + cn[2]) > 0) n = cn }
          const ori = orientNormale(n)
          const typeEff = inst && niv === 'indicateur' ? 'instr.repere' : a.type
          const prm = { ...(typeEff === a.type ? (a.params ?? {}) : {}), dn: r, dnPx: true, sansMarqueur: true, fluide }
          const r0 = rendu0(typeEff, prm, etat, a.valeurs ?? {}, ori.rot, ori.tilt, id)
          const lp = r0.port(def.proc ?? 'proc').pos
          const hauteur = r + 6
          const target = add(c, mul(n, hauteur))
          const rr = translater(r0, sub(target, lp))
          // manchon soudé : tube court un peu plus large que le piquage, cordon de soudure au pied, collerette en tête
          const rn = Math.max(2.2, 0.5 * r), rm = rn * 1.45
          const pied = add(c, mul(n, r * 0.4)), tete = add(c, mul(n, hauteur))
          const bbm = { x0: Math.min(pied[0], tete[0]) - rm, y0: Math.min(pied[1], tete[1]) - rm, z0: Math.min(pied[2], tete[2]) - rm, x1: Math.max(pied[0], tete[0]) + rm, y1: Math.max(pied[1], tete[1]) + rm, z1: Math.max(pied[2], tete[2]) + rm }
          ajoute(bbm, tuyauSvg(pied, tete, rm).svg + soudureSvg(add(c, mul(n, r + 0.6)), n, rm) + soudureSvg(add(c, mul(n, hauteur - 0.8)), n, rm))
          // coupe fantôme (option) : la partie immergée du doigt de gant, en tirets, vue à travers la paroi
          if (a.params?.fantome && (a.type === 'instr.temperature' || a.type === 'instr.thermometre')) {
            const p0 = add(c, mul(n, r * 0.4)), p1 = sub(c, mul(n, r * 1.5)), q0 = proj(p0), q1 = proj(p1)
            const bbf = { x0: Math.min(p0[0], p1[0]) - 2, y0: Math.min(p0[1], p1[1]) - 2, z0: Math.min(p0[2], p1[2]) - 2, x1: Math.max(p0[0], p1[0]) + 2, y1: Math.max(p0[1], p1[1]) + 2, z1: Math.max(p0[2], p1[2]) + 2 }
            out.push({ bb: bbf, id: 'l:' + L.id, plan: 'avant', svg: wrapLien(`<path class="ghost" d="M${f(q0[0])} ${f(q0[1])}L${f(q1[0])} ${f(q1[1])}" style="stroke-width:${f(r * 0.5)}px"/>`, L.id) })
          }
          items.push({ bb: rr.corps ?? rr.bbox, id: 'a:' + id, plan: a.plan ?? L.plan, svg: `<g class="acc" data-lien="${L.id}" data-acc="${id}">${rr.svg}</g>` })
          infoAcc.push({ id, type: a.type, centre: c, axe: n, segment: i, debut: c, fin: target, largeur: p.W })
          rendus[id] = rr
          if (inst && niv === 'indicateur') etiqAuto(a, rr.ancres.badge, etat)
        }
      } else {
        // té / croix : direction du piquage = vers l'autre bout du tuyau enfant
        const t = o.tap!
        const [qid, cote] = t.enfant.split(':') as [string, 'de' | 'vers']
        const q = byId[qid]
        const other = autreBout(q, cote)
        let dir: V3 | null = null
        const tt = q[cote] as RefTap
        if (tt.dir) dir = axeDe(tt.dir)
        if (!dir) {
          const tgt: V3 = other ?? add(c, [0, 0, 1])
          const w = sub(tgt, c)
          let best = -1, bs = 0
          for (const k of [0, 1, 2]) { if (Math.abs(d[k]) > 0.5) continue; const sc2 = Math.abs(w[k]) + (k === 2 ? 0.01 : 0); if (sc2 > best) { best = sc2; bs = k } }
          dir = [0, 0, 0]; dir[bs] = (w[bs] >= 0 ? 1 : -1) * (Math.abs(w[bs]) < 1e-6 ? 1 : 1)
        }
        const w2 = Math.max(t.rb, 0.8 * r) + 3
        const te = teSvg(sub(c, mul(d, w2)), add(c, mul(d, w2)), c, dir, t.lb, r, t.rb)
        ajoute(te.bb, te.svg + (calo ? '' : ''))
        taps[t.enfant] = { pos: add(c, mul(dir, t.lb)), dir, r: t.rb }
        infoTes.push({ centre: c, dir, enfant: qid })
      }
    }
    items.splice(itemsDebut, 0, ...out)
    // segments pour croisements ultérieurs
    const segsL: Seg[] = []
    for (let i = 0; i < nS; i++) segsL.push({ a: P[i], b: P[i + 1], r, lien: L.id })
    return { id: L.id, pts: P, r, fluide, coudes: P.length - 2, ok: route.ok, accessoires: infoAcc, tes: infoTes, segments: segsL, ponts }
  }

  // 3. assemblage scène
  for (const it of items) sc.item(it)
  if (doc.sol) sc.sol(doc.sol.x0, doc.sol.y0, doc.sol.x1, doc.sol.y1, doc.sol.pas ?? 40)
  for (const e of doc.etiquettes ?? []) {
    const r = rendus[e.c]; if (!r) continue
    sc.etiquette({ ancre: (r.ancres[e.ancre ?? 'haut'] ?? r.ancres.haut), nom: e.nom, valeur: e.valeur, unite: e.unite, repere: e.repere, dx: e.dx, dy: e.dy, etat: e.etat })
  }
  for (const e of auto) sc.etiquette(e)
  return { scene: sc, rendus, liaisons: infos, obstacles, collisions: collis, avertissements: avert, items }
}

/** repères de ports : point + flèche de direction (aide de conception) */
export function reperesPorts(rendus: Record<string, Rendu>, o: { ids?: string[]; L?: number } = {}): string {
  const L = o.L ?? 13
  let s = '<g class="ports">'
  for (const id of Object.keys(rendus)) {
    if (o.ids && !o.ids.includes(id)) continue
    for (const p of rendus[id].ports) {
      const a = proj(p.pos), b = proj(add(p.pos, mul(p.dir, L)))
      const dx = b[0] - a[0], dy = b[1] - a[1], n = Math.hypot(dx, dy) || 1
      const ux = dx / n, uy = dy / n
      s += `<path class="ptl" d="M${f(a[0])} ${f(a[1])}L${f(b[0])} ${f(b[1])}M${f(b[0])} ${f(b[1])}l${f(-ux * 3.2 - uy * 2.2)} ${f(-uy * 3.2 + ux * 2.2)}M${f(b[0])} ${f(b[1])}l${f(-ux * 3.2 + uy * 2.2)} ${f(-uy * 3.2 - ux * 2.2)}"/><circle class="ptp" cx="${f(a[0])}" cy="${f(a[1])}" r="2.3"/>`
    }
  }
  return s + '</g>'
}

/** JSON aller-retour */
export const exporterDoc = (d: Doc): string => JSON.stringify(d, null, 1)
export const importerDoc = (s: string): Doc => {
  const d = JSON.parse(s) as Doc
  if (!d || d.version !== 1 || !Array.isArray(d.composants) || !Array.isArray(d.liaisons)) throw new Error('document invalide')
  return d
}
export { dnDeRayon, simplifier, bridePleineSvg }

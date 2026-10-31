// Opérations d'édition de la scène iso (sans DOM : testables). Elles modifient la section `iso` donnée et renvoient ce qu'il faut sélectionner.
import type { EtatNom } from './lib/types'
import type { Plan } from './lib/geom'
import { dnDeRayon } from './lib/reseau'
import type { Port } from './lib/types'
import type { IsoAccessoire, IsoComposant, IsoSection } from './format'
import { familleIso } from './familles'
import { aimanter } from './grille'
import type { SymboleBibliotheque } from '../bibliotheque'
import { rendu0 } from './lib/modele'
import type { Piquage } from './lib/piquages'
import { resoudre, type TiltIso } from './presets'

/** identifiant libre construit sur un préfixe (« pompe1 », « pompe2 »…) */
export function idLibre(iso: IsoSection, prefixe: string): string {
  const pris = new Set<string>([...iso.composants.map((c) => c.id), ...iso.liaisons.map((l) => l.id)])
  for (const L of iso.liaisons) for (const a of L.accessoires ?? []) pris.add(a.id)
  let n = 1
  while (pris.has(prefixe + n)) n++
  return prefixe + n
}

const prefixeDe = (type: string): string => (type.split('.').pop() ?? 'obj').replace(/[^a-z0-9_]/gi, '').slice(0, 14) || 'obj'

export interface OptionsPose {
  /** pas d'aimantation (unités du dessin) */
  aimant: number
  /** demi-empreinte du symbole : on pose le centre du symbole sur le point visé */
  centre?: [number, number]
  z?: number
  params?: Record<string, unknown>
  libelle?: string
  rot?: 0 | 90 | 180 | 270
  tilt?: TiltIso
  etat?: string
}

/** centre de l'empreinte d'un symbole (monde, depuis l'origine), pour poser le CENTRE sous le curseur ; [0, 0] si le symbole ne se dessine pas */
export function centrePose(type: string, params: Record<string, unknown> = {}, rot = 0, tilt?: string): [number, number] {
  try {
    const a = rendu0(type, params as Record<string, never>, 'arret', {}, tilt ? rot : 0, tilt).ancres.centre
    return Number.isFinite(a[0]) && Number.isFinite(a[1]) ? [a[0], a[1]] : [0, 0]
  } catch {
    return [0, 0]
  }
}

/**
 * pose un symbole de palette (symbole du catalogue OU préréglage « preset:… ») centré sur le point visé.
 * Renvoie l'identifiant du composant posé.
 */
export function poserSymbole(iso: IsoSection, idPalette: string, x: number, y: number, o: { aimant: number; rot?: 0 | 90 | 180 | 270; tilt?: TiltIso }): string {
  const r = resoudre(idPalette)
  const rot = o.rot ?? r.rot ?? 0
  const tilt = o.tilt ?? r.tilt
  const id = poserComposant(iso, r.type, x, y, { aimant: o.aimant, centre: centrePose(r.type, r.params, rot, tilt), params: r.params, libelle: r.libelle, rot, tilt, etat: r.etat })
  return id
}

/** pose un composant sur la grille, aimanté au pas ; renvoie son identifiant */
export function poserComposant(iso: IsoSection, type: string, x: number, y: number, o: OptionsPose): string {
  const id = idLibre(iso, prefixeDe(type))
  const [cx, cy] = o.centre ?? [0, 0]
  const fam = familleIso(type)
  const c: IsoComposant = {
    id,
    type,
    x: aimanter(x - cx, o.aimant),
    y: aimanter(y - cy, o.aimant),
    z: o.z ?? (type === 'raccord.bout' ? 40 : 0),
    etat: (o.etat as IsoComposant['etat']) ?? (fam === 'vanne' ? 'ouvert' : 'arret'),
    valeurs: fam === 'cuve' ? { niveau: 50 } : {},
    params: { ...(o.params ?? {}) },
    ...(o.libelle ? { libelle: o.libelle } : {}),
    ...(o.rot ? { rot: o.rot } : {}),
    ...(o.tilt ? { tilt: o.tilt } : {}),
  }
  iso.composants.push(c)
  return id
}

/**
 * pose un symbole de bibliothèque importée : ses parties (symboles existants) sont posées ensemble, décalées comme le fichier le demande.
 * Le point visé est le centre de la première partie ; l'ensemble est aimanté une seule fois, les décalages restent exacts.
 * Renvoie les identifiants posés (le premier sert à la sélection).
 */
export function poserComposition(iso: IsoSection, sym: SymboleBibliotheque, x: number, y: number, o: { aimant: number; centre?: (type: string) => [number, number] }): string[] {
  const [cx, cy] = o.centre?.(sym.parties[0].base) ?? [0, 0]
  const bx = aimanter(x - cx, o.aimant), by = aimanter(y - cy, o.aimant)
  return sym.parties.map((p) => {
    const id = poserComposant(iso, p.base, 0, 0, { aimant: 1, params: p.params, libelle: p.libelle, z: p.dz })
    const c = iso.composants[iso.composants.length - 1]
    c.x = bx + (p.dx ?? 0)
    c.y = by + (p.dy ?? 0)
    if (p.rot) c.rot = p.rot
    return id
  })
}

/** déplace un composant (aimanté) ; les tuyaux se recalculent au prochain dessin */
export function deplacerComposant(c: IsoComposant, x: number, y: number, aimant: number): void {
  c.x = aimanter(x, aimant)
  c.y = aimanter(y, aimant)
}

export function tourner(c: IsoComposant): void {
  c.rot = ((((c.rot ?? 0) + 90) % 360) as 0 | 90 | 180 | 270)
}

/** orientation : bascule d'un composant en ligne (axe local x vertical montant, vertical descendant, ou le même sur l'axe y) ; la suite se fait en cycle */
export type AxeBascule = 'x' | 'y'
export function basculer(c: IsoComposant, axe: AxeBascule = 'x'): void {
  const cycle: (TiltIso | undefined)[] = axe === 'x' ? [undefined, 'x', 'xn'] : [undefined, 'y', 'yn']
  const i = cycle.indexOf(c.tilt)
  const suivant = i < 0 ? cycle[1] : cycle[(i + 1) % cycle.length]
  if (suivant) c.tilt = suivant
  else delete c.tilt
  delete c.ancre
}
export function reglerTilt(c: IsoComposant, t: TiltIso | undefined): void {
  if (t) c.tilt = t
  else delete c.tilt
  delete c.ancre
}
export const LIBELLE_TILT: Record<string, string> = { '': 'Horizontal', x: 'Vertical (montant)', xn: 'Vertical (descendant)', y: 'Transversal (montant)', yn: 'Transversal (descendant)' }

// ───────────── piquages libres
/** ajoute un piquage libre au composant ; renvoie son identifiant */
export function ajouterPiquage(c: IsoComposant, p: Omit<Piquage, 'id'>): Piquage {
  const pris = new Set((c.piquages ?? []).map((q) => q.id))
  let n = 1
  while (pris.has('p' + n)) n++
  const pq: Piquage = { id: 'p' + n, ...p }
  ;(c.piquages ??= []).push(pq)
  return pq
}
/** retire un piquage ; les liaisons qui y étaient reliées sont supprimées avec lui */
export function retirerPiquage(iso: IsoSection, cid: string, pid: string): void {
  const c = iso.composants.find((q) => q.id === cid)
  if (!c) return
  c.piquages = (c.piquages ?? []).filter((q) => q.id !== pid)
  if (!c.piquages.length) delete c.piquages
  const port = 'pq_' + pid
  const morts = iso.liaisons.filter((l) => [l.de, l.vers].some((e) => 'c' in e && e.c === cid && e.port === port)).map((l) => l.id)
  for (const id of morts) supprimerObjet(iso, 'l', id)
}

export interface ExtremitePort {
  c: string
  port: string
}

/** relie deux ports : le routeur de la bibliothèque trace le tuyau au dessin (coudes, tés, ponts) ; renvoie l'identifiant de la liaison */
export function relierPorts(iso: IsoSection, de: ExtremitePort, vers: ExtremitePort, A: Pick<Port, 'dn' | 'fluide'>, B: Pick<Port, 'dn' | 'fluide'>): string {
  const id = idLibre(iso, 'tuyau')
  iso.liaisons.push({
    id,
    de: { ...de },
    vers: { ...vers },
    dn: dnDeRayon(Math.max(A.dn ?? 5, B.dn ?? 5)),
    fluide: A.fluide ?? B.fluide ?? 'eau',
    etat: 'marche',
    accessoires: [],
  })
  return id
}

/** pose un accessoire (vanne, capteur) sur un tuyau à l'abscisse s (0..1) : la bibliothèque le cale dans l'axe du segment */
export function ajouterAccessoire(iso: IsoSection, liaisonId: string, type: string, s: number): IsoAccessoire | null {
  const L = iso.liaisons.find((q) => q.id === liaisonId)
  if (!L) return null
  const id = idLibre(iso, prefixeDe(type) + '_')
  const a: IsoAccessoire = {
    id,
    type,
    s: Math.round(Math.min(0.97, Math.max(0.03, s)) * 100) / 100,
    etat: type.startsWith('vanne') ? 'ouvert' : 'marche',
    valeurs: {},
  }
  ;(L.accessoires ??= []).push(a)
  return a
}

/** supprime un objet et ce qui en dépend (liaisons d'un composant, piquages sur un tuyau, composants montés dessus) */
export function supprimerObjet(iso: IsoSection, genre: 'c' | 'l' | 'a', id: string): void {
  if (genre === 'a') {
    for (const L of iso.liaisons) L.accessoires = (L.accessoires ?? []).filter((a) => a.id !== id)
    return
  }
  if (genre === 'c') iso.composants = iso.composants.filter((c) => c.id !== id && c.monte?.sur !== id)
  // cascade : un tuyau qui part d'un objet supprimé disparaît, ainsi que ceux piqués dessus (de proche en proche)
  const morts = new Set<string>(genre === 'l' ? [id] : [])
  const vivants = new Set(iso.composants.map((c) => c.id))
  let change = true
  while (change) {
    change = false
    for (const l of iso.liaisons) {
      if (morts.has(l.id)) continue
      const ext = [l.de, l.vers]
      const casse = ext.some((e) => ('c' in e && (e.c === id || !vivants.has(e.c))) || ('liaison' in e && morts.has(e.liaison)))
      if (casse) {
        morts.add(l.id)
        change = true
      }
    }
  }
  iso.liaisons = iso.liaisons.filter((l) => !morts.has(l.id))
}

/** ordre de profondeur : premier plan, arrière-plan, ou retour au tri automatique */
export function reglerPlan(o: { plan?: Plan }, p: 'avant' | 'arriere' | 'auto'): void {
  if (p === 'auto') delete o.plan
  else o.plan = p
}

export const ETATS_STATIQUES: EtatNom[] = ['arret', 'marche', 'defaut', 'alarme', 'modulant', 'ouvert', 'ferme', 'inconnu', 'consigne', 'maintenance']

/** abscisse curviligne 0..1 du point de la polyligne écran (pts) le plus proche de (px, py) */
export function abscisseCurviligne(pts: [number, number][], px: number, py: number): number {
  let tot = 0
  for (let i = 0; i < pts.length - 1; i++) tot += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
  if (!tot) return 0.5
  let best = Infinity
  let bs = 0.5
  let acc = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i]
    const [bx, by] = pts[i + 1]
    const dx = bx - ax
    const dy = by - ay
    const L2 = dx * dx + dy * dy || 1
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2))
    const d = Math.hypot(ax + dx * t - px, ay + dy * t - py)
    if (d < best) {
      best = d
      bs = (acc + Math.sqrt(L2) * t) / tot
    }
    acc += Math.sqrt(L2)
  }
  return bs
}

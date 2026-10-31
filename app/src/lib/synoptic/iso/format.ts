// Format de la section `iso` du document d'un synoptique (rétrocompatible : absente = comportement d'avant).
// La section reprend le modèle de la bibliothèque iso (composants, liaisons, accessoires, plan de profondeur) et y ajoute,
// pour chaque objet, un libellé et des emplacements de variables (`slots`, même forme que les équipements 2D).
import type { SynopticDocument, SynopticEquipement, SynopticSlot } from '../engine/types'
import type { Accessoire, Composant, Doc, Etiq, Liaison, Niveau } from './lib/modele'
import { estLie, lireEtat } from './etats'
import { estAccessoireIso, familleIso, typeMoteurIso } from './familles'

export type VueSynoptique = '2d' | 'iso'

/** ce que l'éditeur ajoute à chaque objet de la bibliothèque */
export interface ExtensionIso {
  libelle?: string
  /** variables reliées : marche, defaut, ouvert, ferme, position, niveau, valeur, vitesse selon la famille */
  slots?: Record<string, SynopticSlot>
  /** niveau plein d'une cuve (unité de la variable de niveau) ; 100 par défaut */
  niveau_max?: number
  /** seuils d'alarme d'une mesure */
  seuils?: { haut?: number; bas?: number }
}
export type IsoComposant = Composant & ExtensionIso
export type IsoAccessoire = Accessoire & ExtensionIso & { id: string }
export type IsoLiaison = Omit<Liaison, 'accessoires'> & ExtensionIso & { accessoires?: IsoAccessoire[] }

export interface IsoSol {
  x0: number
  y0: number
  x1: number
  y1: number
  /** pas de la grille au sol */
  pas: number
}

export interface IsoSection {
  version: 1
  /** vue affichée par défaut dans la tuile (l'éditeur y enregistre la vue en cours) */
  vue?: VueSynoptique
  /** niveau de détail des instruments à l'affichage (défaut : indicateur = pastilles de valeurs) */
  instruments?: Niveau
  sol?: IsoSol
  composants: IsoComposant[]
  liaisons: IsoLiaison[]
}

export const SOL_DEFAUT: IsoSol = { x0: -40, y0: -140, x1: 780, y1: 440, pas: 40 }

export const isoVide = (): IsoSection => ({ version: 1, composants: [], liaisons: [] })

/** le document porte-t-il une scène iso non vide ? */
export const aIso = (doc: Pick<SynopticDocument, 'iso'> | null | undefined): boolean =>
  !!doc?.iso && (doc.iso.composants.length > 0 || doc.iso.liaisons.length > 0)

/** le document porte-t-il un dessin 2D ? */
export const a2d = (doc: Pick<SynopticDocument, 'modele'> | null | undefined): boolean =>
  (doc?.modele?.equipements?.length ?? 0) > 0 || (doc?.modele?.liaisons?.length ?? 0) > 0

/** vues disponibles : 2D seul, iso seul ou les deux */
export function vuesDisponibles(doc: SynopticDocument): VueSynoptique[] {
  const iso = aIso(doc)
  const d2 = a2d(doc)
  if (iso && d2) return ['2d', 'iso']
  return iso ? ['iso'] : ['2d']
}

/** vue affichée à l'ouverture : celle enregistrée si elle existe encore, sinon la première disponible */
export function vueInitiale(doc: SynopticDocument): VueSynoptique {
  const dispo = vuesDisponibles(doc)
  const voulue = doc.iso?.vue
  return voulue && dispo.includes(voulue) ? voulue : dispo[0]
}

/** complète ce qui manque (identifiants d'accessoires, version) sans rien changer d'autre ; renvoie une copie */
export function normaliserIso(brut: IsoSection): IsoSection {
  const iso = JSON.parse(JSON.stringify(brut)) as IsoSection
  iso.version = 1
  iso.composants ??= []
  iso.liaisons ??= []
  for (const L of iso.liaisons) {
    // même convention d'identifiant que la bibliothèque : « liaison.aN » (N = rang dans la liaison)
    ;(L.accessoires ??= []).forEach((a, i) => (a.id ??= `${L.id}.a${i}`))
  }
  return iso
}

export type ObjetIso =
  | { genre: 'c'; id: string; obj: IsoComposant }
  | { genre: 'a'; id: string; obj: IsoAccessoire; liaison: IsoLiaison }
  | { genre: 'l'; id: string; obj: IsoLiaison }

/** tous les objets portant des variables : composants, accessoires, liaisons */
export function objetsIso(iso: IsoSection): ObjetIso[] {
  const out: ObjetIso[] = []
  for (const c of iso.composants) out.push({ genre: 'c', id: c.id, obj: c })
  for (const L of iso.liaisons) {
    out.push({ genre: 'l', id: L.id, obj: L })
    for (const a of L.accessoires ?? []) out.push({ genre: 'a', id: a.id, obj: a, liaison: L })
  }
  return out
}

/** variables reliées dans la scène iso (pour le chargement des valeurs et la synchronisation des blocs) */
export function variablesIso(iso: IsoSection | undefined): string[] {
  const noms = new Set<string>()
  for (const { obj } of iso ? objetsIso(iso) : [])
    for (const sp of Object.values(obj.slots ?? {})) if (sp?.variable) noms.add(sp.variable)
  return [...noms]
}

const fmt = (x: number): string => (Number.isInteger(x) ? String(x) : String(Math.round(x * 100) / 100))

/**
 * Document de la bibliothèque pour des valeurs données : l'état de chaque objet vient des variables reliées
 * (même règle que les symboles 2D), les valeurs reliées d'appareils non instrumentés sont posées en étiquettes.
 * `editeur` = vrai : pas de points au sol (la grille est dessinée par l'éditeur) et instruments en détail.
 */
export function docLib(iso: IsoSection, values: Record<string, number>, o: { editeur?: boolean } = {}): Doc {
  const etiquettes: Etiq[] = []
  const composants: Composant[] = iso.composants.map((c) => {
    const e = lireEtat(c, values)
    const { libelle, slots, niveau_max, seuils, ...pur } = c
    void slots; void niveau_max; void seuils
    const fam = familleIso(c.type)
    if (e.lie && e.valeurs.valeur != null && fam !== 'mesure' && fam !== 'cuve')
      etiquettes.push({ c: c.id, nom: libelle ?? c.tag, valeur: fmt(e.valeurs.valeur), unite: c.unite ?? '' })
    return { ...pur, etat: e.etat, valeurs: e.valeurs }
  })
  const liaisons: Liaison[] = iso.liaisons.map((L) => {
    const eL = lireEtat({ type: 'tuyau', etat: L.etat, slots: L.slots }, values)
    const { libelle, slots, niveau_max, seuils, accessoires, ...pur } = L
    void libelle; void slots; void niveau_max; void seuils
    const acc = (accessoires ?? []).map((a) => {
      const e = lireEtat(a, values)
      const { libelle: l2, slots: s2, niveau_max: n2, seuils: z2, ...pa } = a
      void l2; void s2; void n2; void z2
      return { ...pa, etat: e.etat, valeurs: e.valeurs }
    })
    // écoulement animé seulement si la liaison est en marche ; défaut reste un état d'alerte du tuyau
    return { ...pur, etat: estLie({ slots: L.slots }) ? eL.etat : L.etat, accessoires: acc }
  })
  return {
    version: 1,
    instruments: o.editeur ? 'complet' : (iso.instruments ?? 'indicateur'),
    composants,
    liaisons,
    ...(o.editeur || !iso.sol ? {} : { sol: iso.sol }),
    ...(etiquettes.length ? { etiquettes } : {}),
  }
}

// ───────────── résumé mobile : les équipements iso deviennent des équipements « moteur » virtuels

/** équipement virtuel d'un objet iso (type du moteur, mêmes slots) */
function versEquipement(id: string, type: string, o: ExtensionIso & { tag?: string; unite?: string }): SynopticEquipement {
  const params: Record<string, unknown> = {}
  if (o.niveau_max) params.niveau_max = o.niveau_max
  if (o.seuils) params.seuils = o.seuils
  if (o.unite) params.unite = o.unite
  return {
    id,
    libelle: o.libelle?.trim() || o.tag || id,
    type: typeMoteurIso(type),
    type_iso: type,
    slots: o.slots ?? {},
    params,
    origine: 'iso',
  }
}

/** équipements du résumé mobile pour une scène iso : composants et accessoires (vannes, capteurs) qui portent une variable ou un état */
export function equipementsIso(iso: IsoSection | undefined): SynopticEquipement[] {
  if (!iso) return []
  const out: SynopticEquipement[] = []
  for (const c of iso.composants) {
    if (c.monte && !c.slots) continue
    if (familleIso(c.type) === 'autre' && !estLie(c) && !c.libelle) continue // raccords, scène : pas des équipements
    out.push(versEquipement(c.id, c.type, c))
  }
  for (const L of iso.liaisons)
    for (const a of L.accessoires ?? []) if (estAccessoireIso(a.type) && (estLie(a) || a.libelle)) out.push(versEquipement(a.id, a.type, a))
  return out
}

/**
 * Document tel que le lit le résumé mobile : le 2D d'origine + les équipements iso (positions au sol projetées, pour les regrouper
 * par proximité). Un document sans iso est rendu tel quel (même objet).
 */
export function avecIso(doc: SynopticDocument): SynopticDocument {
  if (!doc.iso) return doc
  const eq = equipementsIso(doc.iso)
  if (!eq.length) return doc
  const decalage = a2d(doc) ? 100000 : 0 // iso et 2D n'ont pas la même échelle : on ne les regroupe jamais entre eux
  const pos = new Map<string, { x: number; y: number }>()
  for (const c of doc.iso.composants) pos.set(c.id, { x: (c.x - c.y) * 0.866, y: (c.x + c.y) * 0.5 - c.z })
  const noeuds = eq.map((e) => {
    const p = pos.get(e.id) ?? { x: 0, y: 0 }
    return { id: e.id, x: p.x + decalage, y: p.y }
  })
  return {
    ...doc,
    modele: { ...doc.modele, equipements: [...doc.modele.equipements, ...eq] },
    layout: { ...doc.layout, noeuds: [...doc.layout.noeuds, ...noeuds] },
  }
}

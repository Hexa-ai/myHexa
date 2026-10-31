/* eslint-disable @typescript-eslint/no-explicit-any -- paramètres de symboles libres par conception (voir iso/README.md) */
// Types publics de la bibliothèque.
import type { V3, BBox } from './geom'

export type EtatNom = 'arret' | 'marche' | 'defaut' | 'alarme' | 'modulant' | 'ouvert' | 'ferme' | 'inconnu' | 'consigne' | 'maintenance'
export const ETATS: EtatNom[] = ['arret', 'marche', 'defaut', 'alarme', 'modulant', 'ouvert', 'ferme', 'inconnu', 'consigne', 'maintenance']

export type Fluide =
  | 'eau' | 'eau_brute' | 'eau_decantee' | 'eau_traitee' | 'eau_chaude_aller' | 'eau_chaude_retour' | 'eau_glacee' | 'eau_glycolee'
  | 'air_neuf' | 'air_souffle' | 'air_repris' | 'air_rejete' | 'gaz' | 'vapeur' | 'boues' | 'reactif' | 'polymere' | 'condensat'
  | 'fumees' | 'air_comprime' | 'ecs' | 'neutre'

export interface Valeurs {
  /** position 0..100 % (registre, vanne de régulation, vanne 3 voies, papillon…) */
  position?: number
  /** niveau de remplissage 0..100 % (cuves, bassins, silos) */
  niveau?: number
  /** valeur mesurée (affichage éventuel sur le symbole) */
  valeur?: number
  unite?: string
  /** mode manuel : pastille « M » */
  manuel?: boolean
  /** seuils de niveau (en %) : très bas, bas, haut, très haut */
  seuils?: { tb?: number; b?: number; h?: number; th?: number }
  /** vitesse relative 0..1 d'animation (rotor) */
  vitesse?: number
  /** encrassement filtre 0..100 % */
  colmatage?: number
}

export interface Params {
  /** position monde du coin mini de l'empreinte (après rotation) */
  x?: number; y?: number; z?: number
  /** orientation sur le sol (degrés) */
  rot?: 0 | 90 | 180 | 270
  variante?: string
  /** rayon nominal des piquages (unités écran) */
  dn?: number
  fluide?: Fluide
  /** nom / repère (pour data-attr) */
  id?: string
  [k: string]: any
}

export type PortType = 'tube' | 'gaine' | 'elec' | 'signal'
export interface Port {
  id: string
  /** position monde de la face de raccordement */
  pos: V3
  /** direction sortante (unitaire, axe) : le tube part dans cette direction */
  dir: V3
  type: PortType
  fluide?: Fluide
  /** rayon (tube) */
  dn?: number
  /** section gaine : largeur (horizontale) et hauteur */
  w?: number; h?: number
}

export interface Rendu {
  type: string
  /** chaîne SVG (un <g>) en coordonnées écran à zoom 1, positions monde déjà appliquées */
  svg: string
  bbox: BBox
  /** boîte du volume réel (sans l'empreinte au sol) : obstacle du routeur */
  corps?: BBox
  ports: Port[]
  port(id: string): Port
  ancres: Record<string, V3>
  /** pièces triées (pour tri global fin éventuel) */
  element(): SVGElement
}

export interface SymboleDef {
  id: string
  famille: string
  nom: string
  /** Qualité (revue Julien) : 'brouillon' par défaut ; 'revu' = corrigé par l'agent, à valider ;
   *  'valide' = validé par Julien ; 'obsolete' = retiré du catalogue visible mais gardé pour les documents existants. */
  statut?: 'brouillon' | 'revu' | 'valide' | 'obsolete'
  /** Si obsolete : id du symbole qui le remplace (facultatif) */
  remplacePar?: string
  /** taille locale [W,D,H] selon params */
  taille(p: Params): [number, number, number]
  defauts?: Params
  variantes?: string[]
  /** états pertinents (planches) */
  etats?: EtatNom[]
  /** valeurs d'exemple pour les planches */
  exemple?: Valeurs
  /** colonnes de planche : [état, valeurs, rotation] */
  planche?: [EtatNom, Valeurs?, number?][]
  exemplePlanche?: Params
  dessiner(b: any, p: Params): void
}

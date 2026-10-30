// Types publics du moteur de synoptique (l'intérieur du moteur n'est pas typé : voir moteur.ts).

/** Document d'un synoptique tel que stocké dans synoptic_versions.doc */
export interface SynopticDocument {
  schema: string
  /** équipements, liaisons (conduites), cartes, zones, légende, bibliothèque de symboles de l'entreprise */
  modele: SynopticModele
  /** mise en page : taille du dessin, nœuds (positions), arêtes (tracés), zones, cartes, textes */
  layout: SynopticLayout
}

export interface SynopticSlot {
  /** nom de la variable de la box qui alimente cet emplacement (absent = état inconnu) */
  variable?: string | null
  adresse?: string
  confiance?: number
  a_verifier?: boolean
  /** règle de lecture : états { op, val } ; niveaux et valeurs { min, max } */
  regle?: { op?: 'eq' | 'ne' | 'gt' | 'ge' | 'lt' | 'le'; val?: number; min?: number; max?: number }
  [k: string]: unknown
}

export interface SynopticEquipement {
  id: string
  libelle: string
  type: string
  slots?: Record<string, SynopticSlot>
  params?: Record<string, unknown>
  [k: string]: unknown
}

export interface SynopticModele {
  meta?: { titre?: string; projet?: string }
  equipements: SynopticEquipement[]
  liaisons: Array<Record<string, unknown>>
  zones?: Array<Record<string, unknown>>
  cartes?: Array<Record<string, unknown>>
  bandeau?: Array<{ variable?: string; [k: string]: unknown }>
  legende?: Record<string, string>
  bibliotheque?: Array<Record<string, unknown>>
  [k: string]: unknown
}

export interface SynopticLayout {
  w: number
  h: number
  noeuds: Array<{ id: string; x: number; y: number; [k: string]: unknown }>
  aretes: Array<Record<string, unknown>>
  zones?: Array<Record<string, unknown>>
  cartes?: Array<Record<string, unknown>>
  textes?: Array<Record<string, unknown>>
  [k: string]: unknown
}

/** variable proposée dans le sélecteur de l'éditeur */
export interface CatalogueVariable {
  nom: string
  description: string
  unite: string
  type: string
  adresse?: string
  repere?: string
  commentaire?: string
  echelle?: [number, number]
  utilisee_par: string[]
}

export interface SynopticEtat {
  alarmes: number
  aVerifier: number
  modifie: boolean
  peutAnnuler: boolean
  peutRetablir: boolean
  avertissements: number
}

/** rappels de l'application vers lesquels le moteur remonte ses évènements */
export interface SynopticHost {
  /** Ctrl+S / bouton Enregistrer de l'éditeur */
  onSave?: (doc: SynopticDocument) => void
  /** alarmes, modifications, annuler/rétablir possibles… (à chaque changement) */
  onEtat?: (etat: SynopticEtat) => void
}

export interface SynopticOptions {
  doc: Pick<SynopticDocument, 'modele' | 'layout'>
  catalogue?: CatalogueVariable[]
  /** valeurs courantes : nom de variable → nombre */
  values?: Record<string, number>
  host?: SynopticHost
  /** vrai quand le synoptique occupe toute la zone (vue agrandie, éditeur) : les raccourcis + − 0 sont alors toujours actifs */
  pleinCadre?: boolean
  /** false = consultation sans geste : ni zoom ni déplacement, la page garde tous les gestes tactiles (défaut : true) */
  gestes?: boolean
}

export interface SynopticInstance {
  setValues(vals: Record<string, number>): void
  setCatalogue(c: CatalogueVariable[]): void
  /** true = édition, false = consultation */
  mode(edition: boolean): void
  getDoc(): SynopticDocument
  marquerEnregistre(): void
  estModifie(): boolean
  importerTexte(txt: string): boolean
  ajuster(): void
  zoomer(f: number, cx?: number, cy?: number): void
  /** cadre la vue sur une zone du dessin (unités du dessin), avec une marge */
  cadrer(zone: { x: number; y: number; w: number; h: number }): void
  /** opérations internes (sans souris) : réservées aux tests */
  interne: Record<string, (...args: never[]) => unknown>
  destroy(): void
}

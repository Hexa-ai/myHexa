// Format et validation du document d'un synoptique (ce qui est stocké dans synoptic_versions.doc).
import type { SynopticDocument } from './engine/types'

/** identifiant de format du JSON d'export / d'import (celui du prototype STEMI, conservé pour réimporter ses exports) */
export const SCHEMA = 'myhexa-synoptique-edition/1'

/** taille du dessin d'un synoptique neuf (unités du dessin, pas des pixels) */
export const DESSIN_DEFAUT = { w: 1800, h: 1000 }

/** synoptique neuf : aucun équipement, un cadre vide à remplir depuis la palette */
export function documentVide(titre = 'Synoptique'): SynopticDocument {
  return {
    schema: SCHEMA,
    modele: {
      meta: { titre, projet: titre },
      equipements: [],
      liaisons: [],
      zones: [],
      cartes: [],
      bandeau: [],
    },
    layout: {
      ...DESSIN_DEFAUT,
      mode: 'hier',
      noeuds: [],
      aretes: [],
      zones: [],
      cartes: [],
      textes: [],
    },
  }
}

/** vérifie la structure minimale ; renvoie le motif du refus, ou null si le document est utilisable */
export function erreurDocument(d: unknown): string | null {
  if (!d || typeof d !== 'object') return 'fichier vide'
  const doc = d as Partial<SynopticDocument>
  if (!doc.modele || !Array.isArray(doc.modele.equipements)) return 'pas de « modele.equipements »'
  if (!Array.isArray(doc.modele.liaisons)) return 'pas de « modele.liaisons »'
  if (!doc.layout || !Array.isArray(doc.layout.noeuds) || !Array.isArray(doc.layout.aretes))
    return 'pas de mise en page (« layout.noeuds / aretes »)'
  if (typeof doc.layout.w !== 'number' || typeof doc.layout.h !== 'number')
    return 'dimensions du dessin absentes'
  const ids = new Set(doc.modele.equipements.map((e) => e.id))
  const orphelin = doc.layout.noeuds.find((n) => !ids.has(n.id))
  if (orphelin) return `le nœud « ${orphelin.id} » n'a pas d'équipement`
  return null
}

export type ResultatImport =
  | { doc: SynopticDocument; erreur?: undefined }
  | { doc?: undefined; erreur: string }

/** lit un JSON importé (export de l'éditeur ou du prototype) et le ramène au format du document */
export function lireImport(texte: string): ResultatImport {
  let json: unknown
  try {
    json = JSON.parse(texte)
  } catch {
    return { erreur: 'ce n’est pas un JSON valide' }
  }
  const j = json as { modele?: unknown; equipements?: unknown }
  if (!j.modele && Array.isArray(j.equipements))
    return { erreur: 'ce fichier est un modele.json seul : il manque la mise en page' }
  const erreur = erreurDocument(json)
  if (erreur) return { erreur }
  const { modele, layout, iso } = json as SynopticDocument
  return { doc: { schema: SCHEMA, modele, layout, ...(iso ? { iso } : {}) } }
}

/** titre à afficher pour un document (titre du modèle, sinon valeur par défaut) */
export const titreDocument = (doc: SynopticDocument, defaut = 'Synoptique') =>
  doc.modele.meta?.titre?.trim() || defaut

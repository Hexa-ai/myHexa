// Familles de pictogrammes du résumé mobile : UN SEUL endroit où chaque type de symbole déclare sa famille.
//
// Ajouter un symbole au catalogue (palette du moteur) = ajouter une ligne à FAMILLE_PICTO_PAR_TYPE :
//   - une famille (« pompe », « vanne »…) : le symbole apparaît en pictogramme dans la carte de son ouvrage ;
//   - null : le symbole n'a pas de pictogramme (il reste visible par ses valeurs et ses alarmes).
// Un test (familles-picto.spec.ts) échoue si un type du catalogue du moteur n'est pas déclaré ici.
// Les modules des bandeaux CVC (cta, hydro) déclarent leur pictogramme dans engine/cvc-modele.ts (champ `picto` de chaque
// module), car leurs cartes sont construites par module et non par symbole.
import type { FamillePictoCvc } from './engine/cvc-modele'

/** famille de pictogramme affichable dans une carte (le dessin de chacune est dans SynopticPicto.vue) */
export type FamillePicto = 'pompe' | 'moteur' | 'ventilateur' | 'vanne' | 'cuve' | FamillePictoCvc

/** familles proposées à l'utilisateur dans l'éditeur du résumé, avec leur libellé */
export const FAMILLES_PICTO: ReadonlyArray<{ id: FamillePicto; libelle: string }> = [
  { id: 'cuve', libelle: 'Cuve' },
  { id: 'pompe', libelle: 'Pompe' },
  { id: 'moteur', libelle: 'Moteur' },
  { id: 'ventilateur', libelle: 'Ventilateur' },
  { id: 'vanne', libelle: 'Vanne' },
  { id: 'registre', libelle: 'Registre' },
  { id: 'batterie', libelle: 'Batterie' },
  { id: 'roue', libelle: 'Roue' },
  { id: 'flamme', libelle: 'Flamme' },
  { id: 'filtre', libelle: 'Filtre' },
]

/**
 * Famille de pictogramme de chaque type de symbole (clé = `type` de l'équipement dans `modele.equipements`).
 * Un symbole du catalogue doit figurer ici, avec `null` s'il n'a pas de pictogramme.
 */
export const FAMILLE_PICTO_PAR_TYPE: Readonly<Record<string, FamillePicto | null>> = {
  // procédé
  cuve: 'cuve',
  pompe: 'pompe',
  vanne: 'vanne',
  vanne_reg: 'vanne',
  vanne_man: 'vanne',
  vanne_3v: 'vanne',
  ventilateur: 'ventilateur',
  compresseur: 'moteur',
  clapet: null,
  filtre: null,
  echangeur: null,
  parametre: null, // décanteur paramétré : c'est un ouvrage (carte), pas un pictogramme
  // machines
  moteur: 'moteur',
  convoyeur: 'moteur',
  verin: null,
  // électricité
  variateur: 'moteur',
  disjoncteur: null,
  transformateur: null,
  // instrumentation
  mesure: null,
  voyant: null,
  // autres types du document
  silhouette: null,
  image: null,
  raccord: null,
  // CVC : pictogrammes par module (voir engine/cvc-modele.ts)
  cta: null,
  hydro: null,
}

/** famille déclarée pour un type de symbole, null si aucune */
export const familleDuType = (type: string): FamillePicto | null => FAMILLE_PICTO_PAR_TYPE[type] ?? null

// Règles de liaison variable → état d'un emplacement (« slot ») : fonctions pures, sans DOM.
// Une règle posée dans l'éditeur : { op, val } transforme une valeur brute en 1 / 0 pour les emplacements d'état ;
// { min, max } sert aux niveaux et valeurs (voir le moteur).

export type OperateurRegle = 'eq' | 'ne' | 'gt' | 'ge' | 'lt' | 'le'

export interface RegleLiaison {
  op?: OperateurRegle
  val?: number
  min?: number
  max?: number
}

export interface EmplacementLie {
  variable?: string | null
  regle?: RegleLiaison
}

export const OPERATEURS: Record<OperateurRegle, (x: number, v: number) => boolean> = {
  eq: (x, v) => x === v,
  ne: (x, v) => x !== v,
  gt: (x, v) => x > v,
  ge: (x, v) => x >= v,
  lt: (x, v) => x < v,
  le: (x, v) => x <= v,
}

/** Symboles de l'affichage en toutes lettres (liste déroulante de l'éditeur). */
export const OPERATEURS_LIBELLES: Record<OperateurRegle, string> = {
  eq: '=',
  ne: '≠',
  gt: '>',
  ge: '≥',
  lt: '<',
  le: '≤',
}

/** Emplacements « tout ou rien » (états) ; les `s_…` sont les états nommés d'un symbole de l'entreprise. */
export const NOMS_ETAT = [
  'marche',
  'defaut',
  'ouvert',
  'ferme',
  'etat',
  'declenche',
  'colmatage',
  'sorti',
  'rentre',
]

export const estEmplacementEtat = (nom: string): boolean =>
  NOMS_ETAT.includes(nom) || String(nom).startsWith('s_')

/**
 * Valeur d'un emplacement à partir de la valeur brute de sa variable.
 * - pas de valeur reçue → `undefined` (état inconnu, jamais « en marche » par défaut) ;
 * - emplacement d'état avec règle → 1 ou 0 ;
 * - sinon valeur brute inchangée.
 */
export function appliquerRegle(
  emplacement: EmplacementLie,
  nom: string,
  brut: number | null | undefined,
): number | undefined {
  if (brut == null) return undefined
  const regle = emplacement.regle
  if (!regle || !estEmplacementEtat(nom)) return brut
  const operation = OPERATEURS[regle.op ?? 'eq']
  if (!operation) return brut
  return operation(brut, regle.val ?? 1) ? 1 : 0
}

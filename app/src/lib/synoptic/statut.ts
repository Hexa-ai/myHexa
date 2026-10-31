// Statut qualité des symboles (cycle brouillon → revu → validé, ou obsolète) et règles de visibilité.
// Un symbole `obsolete` n'est plus proposé (explorateur, Spotlight, palettes) mais reste dessinable : un document qui l'utilise s'affiche toujours.
import type { SymboleDef } from './iso/lib/types'

export type StatutSymbole = NonNullable<SymboleDef['statut']>

export const STATUTS: readonly StatutSymbole[] = ['brouillon', 'revu', 'valide', 'obsolete']
export const LIBELLE_STATUT: Readonly<Record<StatutSymbole, string>> = { brouillon: 'Brouillon', revu: 'Revu', valide: 'Validé', obsolete: 'Obsolète' }

/** Options de diffusion du catalogue. */
export interface OptionsStatut {
  /** Mode public : seuls les symboles « validés » sont proposés. Désactivé par défaut (voir docs/flux/synoptique.md, « Qualité des symboles »). */
  seulementValides: boolean
}
export const OPTIONS_STATUT_DEFAUT: Readonly<OptionsStatut> = { seulementValides: false }

/** statut effectif d'une définition : « brouillon » tant que personne ne l'a revue */
export const statutDe = (d: Pick<SymboleDef, 'statut'> | undefined): StatutSymbole => d?.statut ?? 'brouillon'

/** Le symbole est-il proposé à la pose ? (jamais pour un obsolète ; seulement les validés en mode public) */
export function estPropose(d: Pick<SymboleDef, 'statut'> | undefined, o: OptionsStatut = OPTIONS_STATUT_DEFAUT): boolean {
  const s = statutDe(d)
  if (s === 'obsolete') return false
  return o.seulementValides ? s === 'valide' : true
}

/** symboles proposés à la pose (explorateur, Spotlight, palettes) : le catalogue sans les obsolètes (et sans les non validés en mode public) */
export const symbolesProposes = <T extends Pick<SymboleDef, 'statut'>>(catalogue: readonly T[], o: OptionsStatut = OPTIONS_STATUT_DEFAUT): T[] => catalogue.filter((d) => estPropose(d, o))

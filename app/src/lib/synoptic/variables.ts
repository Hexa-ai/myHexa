// Variables d'un synoptique : lesquelles sont reliées, valeurs numériques lues sur la box, catalogue proposé dans l'éditeur.
import type { CatalogueVariable, SynopticDocument } from './engine/types'
import type { HistVar } from '@/composables/useHistory'
import { variablesIso } from './iso/format'

/** noms des variables reliées à un emplacement (équipements + bandeau), sans doublon, triés */
export function variablesLiees(doc: Pick<SynopticDocument, 'modele'> & { iso?: SynopticDocument['iso'] }): string[] {
  const noms = new Set<string>()
  for (const e of doc.modele.equipements) {
    for (const sp of Object.values(e.slots ?? {})) if (sp?.variable) noms.add(sp.variable)
    const assoc = (e as { variables_associees?: { variable?: string }[] }).variables_associees
    for (const va of assoc ?? []) if (va.variable) noms.add(va.variable)
  }
  for (const b of doc.modele.bandeau ?? []) if (b.variable) noms.add(b.variable)
  for (const n of variablesIso(doc.iso)) noms.add(n)
  return [...noms].sort()
}

/** valeur de la box -> nombre (booléen -> 1/0, texte numérique -> nombre), null si inexploitable */
export function valeurNumerique(v: unknown): number | null {
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v)
  return null
}

interface VariableStatut {
  name?: string
  value?: unknown
  unit?: string
  description?: string
}
const variablesDuStatut = (payload: Record<string, unknown> | null | undefined): VariableStatut[] =>
  ((payload as { variables?: VariableStatut[] } | null | undefined)?.variables ?? []).filter(
    (v) => v && typeof v.name === 'string',
  )

/** dernières valeurs du statut (30 min) pour les variables demandées */
export function valeursDuStatut(
  payload: Record<string, unknown> | null | undefined,
  noms: string[],
): Record<string, number> {
  const voulus = new Set(noms)
  const out: Record<string, number> = {}
  for (const v of variablesDuStatut(payload)) {
    if (!voulus.has(v.name as string)) continue
    const n = valeurNumerique(v.value)
    if (n !== null) out[v.name as string] = n
  }
  return out
}

/** catalogue de l'éditeur : variables historisées de la box (ts_catalog) + variables du dernier statut, fusionnées par nom */
export function construireCatalogue(
  hist: HistVar[],
  payload: Record<string, unknown> | null | undefined,
): CatalogueVariable[] {
  const par = new Map<string, CatalogueVariable>()
  const ajoute = (nom: string, description: string, unite: string | null, type: string) => {
    const ex = par.get(nom)
    if (ex) {
      if (!ex.description && description) ex.description = description
      if (!ex.unite && unite) ex.unite = unite
      return
    }
    par.set(nom, { nom, description, unite: unite ?? '', type, utilisee_par: [] })
  }
  for (const h of hist) ajoute(h.var, h.description ?? '', h.unit, h.category ?? '')
  for (const v of variablesDuStatut(payload))
    ajoute(v.name as string, v.description ?? '', v.unit ?? null, '')
  return [...par.values()].sort((a, b) => a.nom.localeCompare(b.nom))
}

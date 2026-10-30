// Accès base : tables synoptics / synoptic_versions (voir supabase/migrations/20261031140000_synoptiques.sql).
// Les tables ne figurent pas encore dans les types générés : on passe par un client non typé, le typage est porté ici.
import { supabase } from '@/lib/supabase'
import type { SynopticDocument } from './engine/types'
import { variablesLiees } from './variables'

const sb = supabase as unknown as {
  from: (t: string) => any // eslint-disable-line @typescript-eslint/no-explicit-any
  rpc: (f: string, a: unknown) => any // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface Synoptic {
  id: string
  company_id: string
  device_ids: string[]
  name: string
  current_version: number
  updated_at: string
}

export interface SynopticCharge {
  synoptic: Synoptic
  version: number
  doc: SynopticDocument | null
}

const COLONNES = 'id, company_id, device_ids, name, current_version, updated_at'

/** synoptiques visibles d'une box (liste proposée dans l'éditeur de bloc) */
export async function listerSynoptiques(deviceId: string): Promise<Synoptic[]> {
  const { data, error } = await sb
    .from('synoptics')
    .select(COLONNES)
    .contains('device_ids', [deviceId])
    .order('name')
  if (error) throw new Error(error.message)
  return (data ?? []) as Synoptic[]
}

/** un synoptique et le document de sa version courante */
export async function chargerSynoptique(id: string): Promise<SynopticCharge | null> {
  const { data, error } = await sb.from('synoptics').select(COLONNES).eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  const synoptic = data as Synoptic
  if (!synoptic.current_version) return { synoptic, version: 0, doc: null }
  const { data: v, error: e2 } = await sb
    .from('synoptic_versions')
    .select('doc')
    .eq('synoptic_id', id)
    .eq('version', synoptic.current_version)
    .maybeSingle()
  if (e2) throw new Error(e2.message)
  return {
    synoptic,
    version: synoptic.current_version,
    doc: (v?.doc ?? null) as SynopticDocument | null,
  }
}

/** crée un synoptique (une box) et sa première version */
export async function creerSynoptique(p: {
  companyId: string
  deviceId: string
  name: string
  doc: SynopticDocument
  source?: 'manual' | 'import'
}): Promise<Synoptic> {
  const { data, error } = await sb
    .from('synoptics')
    .insert({ company_id: p.companyId, device_ids: [p.deviceId], name: p.name })
    .select(COLONNES)
    .single()
  if (error) throw new Error(error.message)
  const synoptic = data as Synoptic
  await enregistrerVersion(synoptic.id, p.doc, p.source ?? 'manual')
  return { ...synoptic, current_version: 1 }
}

/** enregistrer = nouvelle version (numéro attribué par la base) ; renvoie ce numéro */
export async function enregistrerVersion(
  id: string,
  doc: SynopticDocument,
  source: 'manual' | 'ai' | 'import' = 'manual',
): Promise<number> {
  const { data, error } = await sb.rpc('save_synoptic_version', {
    p_synoptic: id,
    p_doc: doc,
    p_source: source,
  })
  if (error) throw new Error(error.message)
  return data as number
}

export async function renommerSynoptique(id: string, name: string) {
  const { error } = await sb.from('synoptics').update({ name }).eq('id', id)
  if (error) throw new Error(error.message)
}

/**
 * Les blocs d'un tableau annoncent au mode direct les variables qu'ils affichent (options.synoptic_vars) :
 * après un enregistrement, on rafraîchit cette liste dans les blocs qui montrent ce synoptique.
 */
export async function synchroniserBlocs(id: string, doc: SynopticDocument) {
  const { data, error } = await sb
    .from('dashboard_widgets')
    .select('id, options')
    .eq('type', 'synoptic')
    .eq('options->>synoptic_id', id)
  if (error) throw new Error(error.message)
  const vars = variablesLiees(doc)
  for (const w of (data ?? []) as { id: string; options: Record<string, unknown> }[]) {
    await sb
      .from('dashboard_widgets')
      .update({ options: { ...w.options, synoptic_vars: vars } })
      .eq('id', w.id)
  }
}

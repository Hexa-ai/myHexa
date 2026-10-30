// Fonctionnalités en avant-première (bêta) par entreprise : companies.beta_features, modifiable par le
// staff seulement. Se base sur l'entreprise EFFECTIVE : un staff qui agit comme un client voit
// exactement ce que voit ce client (donc pas les bêtas).
import { computed, ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

export const BETA_FEATURES = [
  { key: 'widgets_beta', label: 'Nouveaux widgets', hint: 'styles de jauge : barres, cuve' },
  { key: 'synoptique', label: 'Synoptique', hint: 'synoptique généré par IA' },
] as const
export type BetaFeature = (typeof BETA_FEATURES)[number]['key']

const cache = ref<Record<string, string[]>>({})
const inflight = new Map<string, Promise<void>>()

async function loadCompany(id: string, force = false) {
  if (!force && (id in cache.value || inflight.has(id))) return inflight.get(id)
  const p = (async () => {
    const { data } = await supabase
      .from('companies')
      .select('beta_features')
      .eq('id', id)
      .maybeSingle()
    cache.value = {
      ...cache.value,
      [id]: (data as { beta_features?: string[] } | null)?.beta_features ?? [],
    }
  })().finally(() => inflight.delete(id))
  inflight.set(id, p)
  return p
}

/** invalide le cache d'une entreprise (après modification par le staff) */
export function setCachedBetas(id: string, features: string[]) {
  cache.value = { ...cache.value, [id]: features }
}

export function useFeature(name: BetaFeature) {
  const auth = useAuthStore()
  const id = computed(() => auth.effectiveCompanyId)
  const enabled = computed(() => {
    const c = id.value
    if (!c) return false
    if (!(c in cache.value)) {
      void loadCompany(c)
      return false
    }
    return cache.value[c].includes(name)
  })
  return enabled
}

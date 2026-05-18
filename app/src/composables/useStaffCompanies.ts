import { computed, ref } from 'vue'
import { supabase } from '@/lib/supabase'

interface StaffCompany {
  id: string
  name: string
  is_hexa_internal: boolean
  created_at: string
  devices_count: number
  recipients_count: number
}

const companies = ref<StaffCompany[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const lastFetch = ref<number>(0)
const TTL_MS = 60_000

async function fetchOnce(force = false) {
  const fresh = Date.now() - lastFetch.value < TTL_MS
  if (!force && fresh && companies.value.length > 0) return
  loading.value = true
  error.value = null
  const { data, error: err } = await supabase
    .from('companies')
    .select('id, name, is_hexa_internal, created_at, devices(count), recipients(count)')
    .order('name')
  loading.value = false
  if (err) {
    error.value = err.message
    return
  }
  type Row = {
    id: string
    name: string
    is_hexa_internal: boolean
    created_at: string
    devices: { count: number }[]
    recipients: { count: number }[]
  }
  companies.value = ((data ?? []) as Row[]).map((c) => ({
    id: c.id,
    name: c.name,
    is_hexa_internal: c.is_hexa_internal,
    created_at: c.created_at,
    devices_count: c.devices?.[0]?.count ?? 0,
    recipients_count: c.recipients?.[0]?.count ?? 0,
  }))
  lastFetch.value = Date.now()
}

export function useStaffCompanies() {
  return {
    companies: computed(() => companies.value),
    loading: computed(() => loading.value),
    error: computed(() => error.value),
    fetch: fetchOnce,
    refresh: () => fetchOnce(true),
  }
}

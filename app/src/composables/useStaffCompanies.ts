import { ref } from 'vue'
import { supabase } from '@/lib/supabase'

interface StaffCompany {
  id: string
  name: string
  is_hexa_internal: boolean
  created_at: string
  devices_count: number
  recipients_count: number
}

export function useStaffCompanies() {
  const companies = ref<StaffCompany[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetch() {
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
  }

  return {
    companies,
    loading,
    error,
    fetch,
    refresh: fetch,
  }
}

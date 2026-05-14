import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/supabase'

type Device = Database['public']['Tables']['devices']['Row']

export function useDevices() {
  const devices = ref<Device[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function load() {
    loading.value = true
    error.value = null
    const { data, error: err } = await supabase
      .from('devices')
      .select('*')
      .order('name', { ascending: true })
    loading.value = false
    if (err) {
      error.value = err.message
      return
    }
    devices.value = data ?? []
  }

  return { devices, loading, error, load }
}

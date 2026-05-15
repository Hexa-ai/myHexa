import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/supabase'

type Row = Database['public']['Functions']['devices_with_latest_status']['Returns'][number]

export interface DeviceWithStatus {
  id: string
  company_id: string | null
  name: string | null
  serial_number: string | null
  mac_eth0: string | null
  address: string | null
  latitude: number | null
  longitude: number | null
  last_connection_at: string | null
  vnc_host: string | null
  vnc_port: number | null
  status_payload: Record<string, unknown> | null
  status_received_at: string | null
}

export function useDevices() {
  const devices = ref<DeviceWithStatus[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function load() {
    loading.value = true
    error.value = null
    try {
      const { data, error: err } = await supabase
        .rpc('devices_with_latest_status')
        .order('name', { ascending: true })
      if (err) {
        error.value = err.message
        return
      }
      devices.value = (data ?? []).map((d: Row) => ({
        id: d.id,
        company_id: d.company_id,
        name: d.name,
        serial_number: d.serial_number,
        mac_eth0: d.mac_eth0,
        address: d.address,
        latitude: d.latitude,
        longitude: d.longitude,
        last_connection_at: d.last_connection_at,
        vnc_host: d.vnc_host,
        vnc_port: d.vnc_port,
        status_payload: d.status_payload as Record<string, unknown> | null,
        status_received_at: d.status_received_at,
      }))
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Unknown error'
    } finally {
      loading.value = false
    }
  }

  return { devices, loading, error, load }
}

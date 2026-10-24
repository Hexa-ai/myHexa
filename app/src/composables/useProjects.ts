// PROTOTYPE — projets : regroupement de box (site, machine…) d'une entreprise.
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'

export interface ProjectOverview {
  id: string
  company_id: string
  name: string
  description: string | null
  address: string | null
  latitude: number | null
  longitude: number | null
  devices: number
  online: number
  last_connection_at: string | null
  device_ids: string[]
  can_manage: boolean
}

// pas encore dans les types générés : appels non typés le temps du proto
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any

export function useProjects() {
  const projects = ref<ProjectOverview[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function load(companyId?: string | null) {
    loading.value = true
    error.value = null
    const { data, error: err } = await sb.rpc('projects_overview')
    loading.value = false
    if (err) {
      error.value = err.message
      return
    }
    const all = (data ?? []) as ProjectOverview[]
    projects.value = companyId ? all.filter((p) => p.company_id === companyId) : all
  }

  async function create(companyId: string, name: string, description?: string) {
    const { data, error: err } = await sb
      .from('projects')
      .insert({ company_id: companyId, name: name.trim(), description: description || null })
      .select('id')
      .single()
    if (err) throw new Error(err.message)
    return data.id as string
  }

  async function update(
    id: string,
    patch: { name?: string; description?: string | null; address?: string | null },
  ) {
    const { error: err } = await sb.from('projects').update(patch).eq('id', id)
    if (err) throw new Error(err.message)
  }

  async function remove(id: string) {
    const { error: err } = await sb.from('projects').delete().eq('id', id)
    if (err) throw new Error(err.message)
  }

  async function setDevicesProject(deviceIds: string[], projectId: string | null) {
    const { error: err } = await sb.rpc('set_devices_project', {
      p_devices: deviceIds,
      p_project: projectId,
    })
    if (err) throw new Error(err.message)
  }

  return { projects, loading, error, load, create, update, remove, setDevicesProject }
}

/** état de synthèse d'un projet à partir de ses box */
export function projectState(online: number, total: number, alarm: 'error' | 'warning' | null) {
  if (total === 0) return 'empty' as const
  if (online === 0) return 'offline' as const
  if (online < total) return 'partial' as const
  if (alarm) return alarm
  return 'ok' as const
}

// PROTOTYPE — projets : regroupement de box (site, machine…) d'une entreprise.
import { computed, ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

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
  const auth = useAuthStore()
  const allProjects = ref<ProjectOverview[]>([])
  // Les droits (RLS) limitent déjà un client à ses projets + ceux des box qu'on lui partage.
  // Le staff voit tout : en « agit comme », on applique la même règle que pour les box
  // (useDevices) : projets de l'entreprise choisie, plus ceux des box partagées si c'est sa
  // propre entreprise. Sans « agit comme », filtre explicite par entreprise (load(companyId)).
  const filterCompany = ref<string | null>(null)
  const projects = computed<ProjectOverview[]>(() => {
    let list = allProjects.value
    const eff = auth.isHexaStaff ? auth.effectiveCompanyId : null
    if (eff) {
      const shared = new Set(
        eff === auth.recipient?.company_id ? (auth.recipient?.shared_devices ?? []) : [],
      )
      list = list
        .filter((p) => p.company_id === eff || p.device_ids.some((id) => shared.has(id)))
        .map((p) =>
          p.company_id === eff
            ? p
            : { ...p, device_ids: p.device_ids.filter((id) => shared.has(id)), can_manage: false },
        )
    }
    if (filterCompany.value) list = list.filter((p) => p.company_id === filterCompany.value)
    return list
  })
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
    filterCompany.value = companyId ?? null
    allProjects.value = (data ?? []) as ProjectOverview[]
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

  async function removeFromProject(deviceId: string, projectId: string) {
    const { error: err } = await sb.rpc('remove_device_from_project', {
      p_device: deviceId,
      p_project: projectId,
    })
    if (err) throw new Error(err.message)
  }

  return {
    projects,
    loading,
    error,
    load,
    create,
    update,
    remove,
    setDevicesProject,
    removeFromProject,
  }
}

/** état de synthèse d'un projet à partir de ses box */
export function projectState(online: number, total: number, alarm: 'error' | 'warning' | null) {
  if (total === 0) return 'empty' as const
  if (online === 0) return 'offline' as const
  if (online < total) return 'partial' as const
  if (alarm) return alarm
  return 'ok' as const
}

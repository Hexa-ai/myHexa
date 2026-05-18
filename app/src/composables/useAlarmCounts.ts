// Minimal polling for the global alarm badge. Called once from AdminLayout
// (the only place that needs it), so we don't need a Pinia store.
//
// Scope : les compteurs sont calculés pour `auth.effectiveCompanyId` — la
// compagnie sur laquelle on agit (staff "act as") ou celle du recipient
// (utilisateur normal). Le watch déclenche un refresh à chaque switch.

import { onBeforeUnmount, onMounted, ref, computed, inject, watch, type InjectionKey } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

const POLL_INTERVAL_MS = 60_000

export type AlarmCounts = ReturnType<typeof useAlarmCounts>
export const ALARM_COUNTS_KEY: InjectionKey<AlarmCounts> = Symbol('alarmCounts')

export function injectAlarmCounts(): AlarmCounts | null {
  return inject(ALARM_COUNTS_KEY, null)
}

export function useAlarmCounts() {
  const auth = useAuthStore()
  const active = ref(0)
  const openSignalements = ref(0)
  const openInterventions = ref(0)
  const maxSeverity = ref<'error' | 'warning' | 'info' | null>(null)
  const urgent = computed(() => active.value + openSignalements.value)
  const total = computed(() => urgent.value + openInterventions.value)

  let timer: ReturnType<typeof setInterval> | undefined
  let stopped = false

  function reset() {
    active.value = 0
    openSignalements.value = 0
    openInterventions.value = 0
    maxSeverity.value = null
  }

  async function refresh() {
    if (stopped) return
    const companyId = auth.effectiveCompanyId
    if (!companyId) {
      reset()
      return
    }
    try {
      const { data, error } = await supabase.rpc('alarm_counts', { p_company_id: companyId })
      if (import.meta.env.DEV) {
        console.info('[alarm_counts]', new Date().toLocaleTimeString(), { companyId, data, error })
      }
      if (error) return
      const row = (data ?? [])[0]
      if (!row) { reset(); return }
      active.value = row.active_alarms ?? 0
      openSignalements.value = row.open_signalements ?? 0
      openInterventions.value = row.open_interventions ?? 0
      const sev = row.max_severity
      maxSeverity.value =
        sev === 'error' || sev === 'warning' || sev === 'info' ? sev : null
    } catch (e) {
      if (import.meta.env.DEV) console.warn('[alarm_counts] throw', e)
    }
  }

  function onVisibility() {
    if (document.visibilityState === 'visible') refresh()
  }

  onMounted(() => {
    refresh()
    timer = setInterval(refresh, POLL_INTERVAL_MS)
    document.addEventListener('visibilitychange', onVisibility)
  })

  // Reset + refresh dès qu'on change de compagnie (act-as ou login).
  watch(() => auth.effectiveCompanyId, () => {
    reset()
    refresh()
  })

  onBeforeUnmount(() => {
    stopped = true
    if (timer) clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisibility)
  })

  return { active, openSignalements, openInterventions, maxSeverity, urgent, total, refresh }
}

// Minimal polling for the global alarm badge. Called once from AdminLayout
// (the only place that needs it), so we don't need a Pinia store.

import { onBeforeUnmount, onMounted, ref, computed, inject, type InjectionKey } from 'vue'
import { supabase } from '@/lib/supabase'

const POLL_INTERVAL_MS = 60_000

export type AlarmCounts = ReturnType<typeof useAlarmCounts>
export const ALARM_COUNTS_KEY: InjectionKey<AlarmCounts> = Symbol('alarmCounts')

export function injectAlarmCounts(): AlarmCounts | null {
  return inject(ALARM_COUNTS_KEY, null)
}

export function useAlarmCounts() {
  const active = ref(0)
  const openSignalements = ref(0)
  const openInterventions = ref(0)
  const maxSeverity = ref<'error' | 'warning' | 'info' | null>(null)
  // Compteur "à traiter" : alarmes capteur + signalements (urgent).
  const urgent = computed(() => active.value + openSignalements.value)
  // Total tous indicateurs confondus (rarement utile).
  const total = computed(() => urgent.value + openInterventions.value)

  let timer: ReturnType<typeof setInterval> | undefined
  let stopped = false

  async function refresh() {
    if (stopped) return
    try {
      const { data, error } = await supabase.rpc('alarm_counts')
      if (import.meta.env.DEV) {
        console.info('[alarm_counts]', new Date().toLocaleTimeString(), { data, error })
      }
      if (error) return
      const row = (data ?? [])[0]
      if (!row) return
      active.value = row.active_alarms ?? 0
      openSignalements.value = row.open_signalements ?? 0
      openInterventions.value = row.open_interventions ?? 0
      maxSeverity.value = row.max_severity ?? null
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

  onBeforeUnmount(() => {
    stopped = true
    if (timer) clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisibility)
  })

  return { active, openSignalements, openInterventions, maxSeverity, urgent, total, refresh }
}

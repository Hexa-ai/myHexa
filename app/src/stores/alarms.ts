// Global alarm presence — polled every minute regardless of which view is
// active, so the sidebar badge / header indicator stay up-to-date and we can
// fire a toast notification whenever the total goes up.

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useToasts } from '@/composables/useToasts'

const POLL_INTERVAL_MS = 60_000

export const useAlarmsStore = defineStore('alarms', () => {
  const auth = useAuthStore()
  const toasts = useToasts()

  const activeAlarms = ref(0)
  const openInterventions = ref(0)
  const lastFetchAt = ref<number | null>(null)
  const fetching = ref(false)
  const error = ref<string | null>(null)
  let started = false
  let timer: ReturnType<typeof setInterval> | undefined
  let primed = false // first fetch — don't emit a notification on initial load

  const total = computed(() => activeAlarms.value + openInterventions.value)

  async function fetchOnce() {
    if (!auth.isAuthenticated) return
    fetching.value = true
    error.value = null
    try {
      const { data, error: err } = await supabase.rpc('alarm_counts')
      if (err) {
        error.value = err.message
        return
      }
      const row = (data ?? [])[0]
      if (!row) return
      const newActive = row.active_alarms ?? 0
      const newInterv = row.open_interventions ?? 0
      const prevTotal = total.value
      activeAlarms.value = newActive
      openInterventions.value = newInterv
      lastFetchAt.value = Date.now()
      if (primed) {
        const newTotal = newActive + newInterv
        if (newTotal > prevTotal) {
          const delta = newTotal - prevTotal
          toasts.push({
            kind: 'alert',
            title: 'Nouvelle alarme active',
            body: delta === 1
              ? '1 nouvel événement vient d\'apparaître.'
              : `${delta} nouveaux événements viennent d'apparaître.`,
          })
        }
      } else {
        primed = true
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'unknown error'
    } finally {
      fetching.value = false
    }
  }

  function start() {
    if (started) return
    started = true
    fetchOnce()
    timer = setInterval(fetchOnce, POLL_INTERVAL_MS)
    if (typeof window !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility)
    }
  }
  function stop() {
    started = false
    primed = false
    activeAlarms.value = 0
    openInterventions.value = 0
    if (timer) clearInterval(timer)
    timer = undefined
    if (typeof window !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }
  function onVisibility() {
    if (document.visibilityState === 'visible') {
      if (!lastFetchAt.value || Date.now() - lastFetchAt.value > POLL_INTERVAL_MS) {
        fetchOnce()
      }
    }
  }

  return {
    activeAlarms,
    openInterventions,
    total,
    lastFetchAt,
    fetching,
    error,
    start,
    stop,
    refresh: fetchOnce,
  }
})

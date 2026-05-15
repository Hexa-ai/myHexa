// Minimal polling for the global alarm badge. Called once from AdminLayout
// (the only place that needs it), so we don't need a Pinia store.

import { onBeforeUnmount, onMounted, ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'

const POLL_INTERVAL_MS = 60_000

export function useAlarmCounts() {
  const active = ref(0)
  const open = ref(0)
  const total = computed(() => active.value + open.value)

  let timer: ReturnType<typeof setInterval> | undefined
  let stopped = false

  async function refresh() {
    if (stopped) return
    try {
      const { data, error } = await supabase.rpc('alarm_counts')
      if (error) return
      const row = (data ?? [])[0]
      if (!row) return
      active.value = row.active_alarms ?? 0
      open.value = row.open_interventions ?? 0
    } catch {
      // silent — badge just doesn't update
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

  return { active, open, total, refresh }
}

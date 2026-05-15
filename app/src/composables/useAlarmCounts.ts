// Minimal polling for the global alarm badge. Called once from AdminLayout
// (the only place that needs it), so we don't need a Pinia store.

import { onBeforeUnmount, onMounted, ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'

const POLL_INTERVAL_MS = 30_000
const FLASH_DURATION_MS = 8_000

export function useAlarmCounts() {
  const active = ref(0)
  const open = ref(0)
  const total = computed(() => active.value + open.value)
  // Flips to true for FLASH_DURATION_MS whenever the total goes up — drives
  // a visual flash on the badge so the user notices the apparition.
  const justIncreased = ref(false)

  let timer: ReturnType<typeof setInterval> | undefined
  let flashTimer: ReturnType<typeof setTimeout> | undefined
  let stopped = false
  let primed = false

  async function refresh() {
    if (stopped) return
    try {
      const { data, error } = await supabase.rpc('alarm_counts')
      if (error) return
      const row = (data ?? [])[0]
      if (!row) return
      const prevTotal = total.value
      active.value = row.active_alarms ?? 0
      open.value = row.open_interventions ?? 0
      if (primed && total.value > prevTotal) {
        justIncreased.value = true
        if (flashTimer) clearTimeout(flashTimer)
        flashTimer = setTimeout(() => {
          justIncreased.value = false
        }, FLASH_DURATION_MS)
      }
      primed = true
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
    if (flashTimer) clearTimeout(flashTimer)
    document.removeEventListener('visibilitychange', onVisibility)
  })

  return { active, open, total, justIncreased, refresh }
}

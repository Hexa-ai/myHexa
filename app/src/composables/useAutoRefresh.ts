// Periodically calls `tick` on a fixed interval. Pauses when the tab is
// hidden (visibilitychange) so background tabs don't keep hammering the API,
// and runs the callback once on becoming visible again if more time than
// `intervalMs` has elapsed since the last successful tick.

import { onBeforeUnmount, onMounted, ref } from 'vue'

export interface AutoRefreshOptions {
  intervalMs?: number
  runOnMount?: boolean
}

export function useAutoRefresh(
  tick: () => void | Promise<void>,
  opts: AutoRefreshOptions = {},
) {
  const interval = opts.intervalMs ?? 120_000 // 2 min
  const lastTickAt = ref<number>(0)
  let timer: ReturnType<typeof setInterval> | undefined

  async function run() {
    try {
      await tick()
    } finally {
      lastTickAt.value = Date.now()
    }
  }

  function start() {
    stop()
    timer = setInterval(run, interval)
  }
  function stop() {
    if (timer) {
      clearInterval(timer)
      timer = undefined
    }
  }

  function onVisibility() {
    if (document.visibilityState === 'visible') {
      if (Date.now() - lastTickAt.value > interval) run()
      start()
    } else {
      stop()
    }
  }

  onMounted(() => {
    if (opts.runOnMount !== false) run()
    start()
    document.addEventListener('visibilitychange', onVisibility)
  })

  onBeforeUnmount(() => {
    stop()
    document.removeEventListener('visibilitychange', onVisibility)
  })

  return { lastTickAt, refresh: run }
}

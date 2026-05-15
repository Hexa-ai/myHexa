// Probes whether the current browser can reach the Tailscale CGNAT network.
// Strategy: try an opaque no-cors GET to one known Tailscale IP. If the network
// is unreachable, the fetch rejects/aborts. We only need a yes/no answer, not
// the response body — `no-cors` is enough.
//
// `null` = unknown (not yet probed)
// `true` = the viewer can reach this IP
// `false` = unreachable (timeout / network error)

import { ref } from 'vue'

const cache = new Map<string, boolean>()

export function useTailscaleReachable() {
  const reachable = ref<boolean | null>(null)
  const probing = ref(false)

  async function probe(ip: string, timeoutMs = 2500) {
    if (!ip) return
    if (cache.has(ip)) {
      reachable.value = cache.get(ip)!
      return
    }
    probing.value = true
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      await fetch(`http://${ip}/`, {
        method: 'GET',
        mode: 'no-cors',
        signal: controller.signal,
        cache: 'no-store',
      })
      cache.set(ip, true)
      reachable.value = true
    } catch {
      cache.set(ip, false)
      reachable.value = false
    } finally {
      clearTimeout(timer)
      probing.value = false
    }
  }

  return { reachable, probing, probe }
}

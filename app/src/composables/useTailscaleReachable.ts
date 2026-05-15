// Probes whether the current browser can reach the Tailscale CGNAT network.
// Strategy: race opaque no-cors GETs against several known Tailscale IPs in
// parallel. The first one to resolve wins — `reachable = true`. We only
// declare `false` after every probe has timed out / rejected.
//
// We use `fetch(http://ip/, { mode: 'no-cors' })`. With no-cors the browser
// ignores the response status; what matters is that the network round-trip
// succeeds. A TCP RST (port closed) rejects instantly, a real timeout takes
// the full duration.
//
// `null` = unknown (not yet probed)
// `true` = at least one IP responded
// `false` = all probes failed

import { ref } from 'vue'

let cachedResult: boolean | null = null
let inflight: Promise<boolean> | null = null

const DEFAULT_TIMEOUT_MS = 8000

async function probeOne(ip: string, timeoutMs: number): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    await fetch(`http://${ip}/`, {
      method: 'GET',
      mode: 'no-cors',
      signal: controller.signal,
      cache: 'no-store',
    })
    return true
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

export function useTailscaleReachable() {
  const reachable = ref<boolean | null>(cachedResult)
  const probing = ref(false)

  async function probe(
    ips: string | string[],
    opts?: { timeoutMs?: number; force?: boolean },
  ) {
    const candidates = (Array.isArray(ips) ? ips : [ips]).filter(Boolean).slice(0, 5)
    if (candidates.length === 0) return

    if (!opts?.force && cachedResult !== null) {
      reachable.value = cachedResult
      return
    }
    if (inflight) {
      reachable.value = await inflight
      return
    }

    probing.value = true
    inflight = (async () => {
      const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS
      // Promise.any-style: first success wins; only false if all fail
      try {
        const result = await Promise.any(
          candidates.map(async (ip) => {
            const ok = await probeOne(ip, timeoutMs)
            if (!ok) throw new Error('unreachable')
            return true
          }),
        )
        cachedResult = result
        return result
      } catch {
        cachedResult = false
        return false
      }
    })()

    try {
      const r = await inflight
      reachable.value = r
    } finally {
      probing.value = false
      inflight = null
    }
  }

  function reset() {
    cachedResult = null
    reachable.value = null
  }

  return { reachable, probing, probe, reset }
}

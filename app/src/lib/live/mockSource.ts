// Source factice : simule des box qui annoncent la capacité direct et émettent des valeurs. Sert aux tests unitaires,
// au développement sans backend (VITE_LIVE_SOURCE=mock) et de repère de comportement (cadence, instantané à l'arrivée).
import type { LiveChannel, LiveHandlers, LiveSource, ValuesMessage } from '@/lib/live/types'

export interface MockOptions {
  /** box ayant la capacité (défaut : toutes) */
  capable?: (deviceId: string) => boolean
  /** noms des variables simulées */
  vars?: string[]
}

export function createMockSource(opts: MockOptions = {}): LiveSource & { opened: number; closed: number } {
  const vars = opts.vars ?? ['Debit_mock', 'Pression_mock']
  const src = {
    opened: 0,
    closed: 0,
    open(deviceId: string, h: LiveHandlers): LiveChannel {
      src.opened++
      let timer: ReturnType<typeof setInterval> | null = null
      let n = 0
      const emit = (full: boolean) => {
        n++
        const t = Date.now()
        const d: ValuesMessage['d'] = {}
        vars.forEach((name, i) => (d[name] = [20 + 10 * i + 5 * Math.sin(n / 5 + i), t]))
        h.onValues({ t, full, d })
      }
      const stop = () => {
        if (timer) clearInterval(timer)
        timer = null
      }
      setTimeout(() => {
        h.onStatus('joined')
        h.onBox(opts.capable ? opts.capable(deviceId) : true)
      }, 0)
      return {
        setViewer(meta) {
          stop()
          if (!meta) {
            h.onState({ direct: 'idle' })
            return
          }
          h.onState({ direct: 'on', mode: meta.mode })
          emit(true)
          timer = setInterval(() => emit(false), meta.mode === 'fast' ? 1000 : 10000)
        },
        close() {
          src.closed++
          stop()
        },
      }
    },
  }
  return src
}

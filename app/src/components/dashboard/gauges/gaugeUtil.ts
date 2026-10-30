import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import type { Threshold } from '@/composables/useDashboards'

export type GaugeStyle = 'dial' | 'bar-h' | 'bar-v' | 'tank'

export const GAUGE_STYLES: { value: GaugeStyle; label: string }[] = [
  { value: 'dial', label: 'Ronde' },
  { value: 'bar-h', label: 'Barre horizontale' },
  { value: 'bar-v', label: 'Barre verticale' },
  { value: 'tank', label: 'Cuve' },
]

/** couleurs du liquide / de la barre : le rouge est réservé aux seuils d'alarme (seuils de la jauge) */
export const GAUGE_COLORS = [
  { color: '#2aa7e0', label: 'eau' },
  { color: '#00d4aa', label: 'turquoise' },
  { color: '#4cc35a', label: 'vert' },
  { color: '#f5a524', label: 'ambre' },
  { color: '#8b6cf0', label: 'violet' },
  { color: '#8a94a0', label: 'gris' },
]
export const DEFAULT_BAR_COLOR = '#00d4aa'
export const DEFAULT_TANK_COLOR = '#2aa7e0'

/** position d'un repère sur l'échelle (0..1), null s'il sort des bornes */
export function markerPos(t: Threshold, lo: number, hi: number): number | null {
  if (!(hi > lo) || !Number.isFinite(t.value)) return null
  const p = (t.value - lo) / (hi - lo)
  return p < 0 || p > 1 ? null : p
}

/** couleur du seuil franchi le plus haut (valeur >= seuil), sinon null */
export function crossedColor(value: number | null, thresholds: Threshold[]): string | null {
  if (value === null) return null
  const hit = thresholds
    .filter((t) => Number.isFinite(t.value) && value >= t.value)
    .sort((a, b) => b.value - a.value)[0]
  return hit?.color ?? null
}

/** préférence « réduire les animations » (réactive) */
export function usePrefersReducedMotion(): Ref<boolean> {
  const reduced = ref(false)
  let mq: MediaQueryList | null = null
  const on = () => (reduced.value = !!mq?.matches)
  onMounted(() => {
    mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    on()
    mq.addEventListener('change', on)
  })
  onBeforeUnmount(() => mq?.removeEventListener('change', on))
  return reduced
}

/** true quand la tuile est hors écran ou l'onglet caché : on met les animations en pause */
export function useOffscreenPause(el: Ref<HTMLElement | null>): Ref<boolean> {
  const paused = ref(false)
  let io: IntersectionObserver | null = null
  let visible = true
  const sync = () => (paused.value = !visible || document.hidden)
  const onVis = () => sync()
  onMounted(() => {
    if (typeof IntersectionObserver !== 'undefined' && el.value) {
      io = new IntersectionObserver((es) => {
        visible = es[es.length - 1].isIntersecting
        sync()
      })
      io.observe(el.value)
    }
    document.addEventListener('visibilitychange', onVis)
    sync()
  })
  onBeforeUnmount(() => {
    io?.disconnect()
    document.removeEventListener('visibilitychange', onVis)
  })
  return paused
}

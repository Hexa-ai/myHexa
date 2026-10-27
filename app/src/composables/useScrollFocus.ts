import { onBeforeUnmount, onMounted, watch, type Ref } from 'vue'

/**
 * Sur écran tactile (pas de survol), marque d'une classe l'élément de liste qui passe au centre
 * de l'écran pendant le défilement (équivalent mobile du survol à la souris).
 * Le style visuel est porté par le thème (ex. relief en style « appareil »).
 */
export function useScrollFocus(container: Ref<HTMLElement | null>, selector: string, cls = 'scroll-focus') {
  let io: IntersectionObserver | null = null
  let mo: MutationObserver | null = null
  const touch = typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches

  function observeAll() {
    if (!io || !container.value) return
    io.disconnect()
    container.value.querySelectorAll<HTMLElement>(selector).forEach((el) => io!.observe(el))
  }

  function start() {
    stop()
    if (!touch || !container.value || typeof IntersectionObserver === 'undefined') return
    // bande horizontale de 20 % au milieu de l'écran
    io = new IntersectionObserver(
      (entries) => entries.forEach((e) => (e.target as HTMLElement).classList.toggle(cls, e.isIntersecting)),
      { rootMargin: '-40% 0px -40% 0px' },
    )
    observeAll()
    mo = new MutationObserver(observeAll)
    mo.observe(container.value, { childList: true, subtree: true })
  }

  function stop() {
    io?.disconnect()
    mo?.disconnect()
    io = mo = null
  }

  onMounted(start)
  watch(container, start)
  onBeforeUnmount(stop)
}

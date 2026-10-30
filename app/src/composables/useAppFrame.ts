// Zone de contenu de l'application (le <main> de AdminLayout) : sert à poser un élément « plein cadre »
// sans l'API Fullscreen du navigateur. Le menu latéral et l'en-tête restent visibles.
import { onBeforeUnmount, ref } from 'vue'

export function useAppFrame() {
  const style = ref<Record<string, string>>({ position: 'fixed', inset: '0' })
  let ro: ResizeObserver | null = null
  const maj = () => {
    const main = document.querySelector('main')
    if (!main) return
    const r = main.getBoundingClientRect()
    style.value = {
      position: 'fixed',
      top: `${r.top}px`,
      left: `${r.left}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
    }
  }
  function suivre() {
    maj()
    window.addEventListener('resize', maj)
    const main = document.querySelector('main')
    if (main && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(maj)
      ro.observe(main)
    }
  }
  function oublier() {
    window.removeEventListener('resize', maj)
    ro?.disconnect()
    ro = null
  }
  onBeforeUnmount(oublier)
  return { style, suivre, oublier }
}

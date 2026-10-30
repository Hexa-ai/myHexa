// Où a-t-on le droit d'éditer un synoptique ? Seulement sur ordinateur : écran large ET pointeur fin (pas de tactile).
// L'éditeur suppose la précision d'une souris (poignées, aimantation, molette) ; sur mobile il donnerait une impression de bricolage.
import { onBeforeUnmount, onMounted, ref } from 'vue'

export const REQUETE_EDITION = '(min-width: 1024px) and (pointer: fine)'

export function peutEditerIci(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia &&
    window.matchMedia(REQUETE_EDITION).matches
  )
}

/** version réactive : suit un redimensionnement ou un changement de périphérique de pointage */
export function usePeutEditerIci() {
  const ok = ref(peutEditerIci())
  let mq: MediaQueryList | null = null
  const maj = () => (ok.value = peutEditerIci())
  onMounted(() => {
    mq = window.matchMedia(REQUETE_EDITION)
    mq.addEventListener('change', maj)
    maj()
  })
  onBeforeUnmount(() => mq?.removeEventListener('change', maj))
  return ok
}

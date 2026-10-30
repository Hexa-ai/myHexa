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

/**
 * Façon d'afficher un synoptique selon l'appareil :
 * - mobile : écran < 768 px OU pointeur grossier (doigt) → résumé dans la tuile, dessin en plein écran dédié ;
 * - tablette : entre 768 et 1024 px, pointeur fin → dessin dans la tuile sans capture de geste + plein écran ;
 * - bureau : ≥ 1024 px, pointeur fin → dessin interactif dans la tuile, vue agrandie et édition.
 */
export type ModeAffichage = 'mobile' | 'tablette' | 'bureau'

export const REQUETE_MOBILE = '(max-width: 767.98px), (pointer: coarse)'
export const REQUETE_TABLETTE = '(max-width: 1023.98px)'

export function modeAffichage(): ModeAffichage {
  if (typeof window === 'undefined' || !window.matchMedia) return 'bureau'
  if (window.matchMedia(REQUETE_MOBILE).matches) return 'mobile'
  return window.matchMedia(REQUETE_TABLETTE).matches ? 'tablette' : 'bureau'
}

/** version réactive de `modeAffichage` : suit la rotation de l'écran et le redimensionnement */
export function useModeAffichage() {
  const mode = ref<ModeAffichage>(modeAffichage())
  const maj = () => (mode.value = modeAffichage())
  const listes: MediaQueryList[] = []
  onMounted(() => {
    for (const q of [REQUETE_MOBILE, REQUETE_TABLETTE]) {
      const mq = window.matchMedia(q)
      mq.addEventListener('change', maj)
      listes.push(mq)
    }
    maj()
  })
  onBeforeUnmount(() => listes.forEach((mq) => mq.removeEventListener('change', maj)))
  return mode
}

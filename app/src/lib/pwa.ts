/**
 * Application installable (PWA) : enregistrement du service worker et état « installée ».
 * Le service worker n'est actif qu'en contexte sécurisé (HTTPS ou localhost) : sur l'URL http du LAN, rien n'est fait.
 */
import { ref } from 'vue'

export const swRegistration = ref<ServiceWorkerRegistration | null>(null)

/** iPhone / iPad (iPadOS se présente comme un Mac tactile) */
export const isIOS =
  typeof navigator !== 'undefined' &&
  (/iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

/** ouverte depuis l'écran d'accueil (plein écran) */
export const isStandalone =
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true)

/** Hauteur réelle de l'écran en mode installé (iOS se trompe sur 100dvh au premier affichage). */
function fixAppHeight() {
  const set = () => {
    document.documentElement.style.setProperty('--app-h', `${window.innerHeight}px`)
    if (window.scrollY !== 0) window.scrollTo(0, 0)
  }
  set()
  for (const t of [50, 250, 600, 1200]) setTimeout(set, t)
  window.addEventListener('resize', set)
  window.addEventListener('orientationchange', () => setTimeout(set, 300))
  window.addEventListener('pageshow', set)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') setTimeout(set, 50)
  })
}
if (isStandalone) {
  document.documentElement.classList.add('pwa-standalone')
  fixAppHeight()
}

export async function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !window.isSecureContext)
    return
  // en développement (vite), pas de cache : le service worker ne sert qu'aux notifications
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
    swRegistration.value = reg
    // vérifie une nouvelle version à chaque retour sur l'application
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {})
    })
  } catch (e) {
    console.warn('[pwa] service worker non enregistré', e)
  }
}

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

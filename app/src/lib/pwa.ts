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
/** ?diag=1 : affiche les hauteurs mesurées (diagnostic iPhone), remesurées au toucher */
function showDiag() {
  const box = document.createElement('pre')
  box.style.cssText =
    'position:fixed;left:8px;right:8px;top:40%;z-index:9999;background:#000c;color:#0f0;font:11px monospace;padding:8px;border-radius:6px;white-space:pre-wrap'
  document.body.appendChild(box)
  const lines: string[] = []
  const t0 = performance.now()
  const log = (why: string) => {
    const cs = getComputedStyle(document.documentElement)
    lines.push(
      `${why} t=${Math.round(performance.now() - t0)} inner=${innerHeight} vv=${Math.round(visualViewport?.height ?? 0)} client=${document.documentElement.clientHeight} screen=${screen.height} app-h=${cs.getPropertyValue('--app-h')} sat=${cs.getPropertyValue('--sat')}`,
    )
    box.textContent = lines.slice(-8).join('\n')
  }
  document.documentElement.style.setProperty('--sat', 'env(safe-area-inset-top)')
  for (const t of [0, 500, 1500, 3000]) setTimeout(() => log('auto'), t)
  addEventListener('touchend', () => setTimeout(() => log('toucher'), 300))
}

function fixAppHeight() {
  const set = () => {
    // Hauteur visible réelle. NE PAS utiliser screen.height : au lancement iOS ne peint que la zone
    // annoncée par innerHeight, le pied de page passait hors écran.
    const vv = window.visualViewport?.height ?? 0
    const h = Math.round(Math.max(window.innerHeight, vv, document.documentElement.clientHeight))
    document.documentElement.style.setProperty('--app-h', `${h}px`)
    if (window.scrollY !== 0) window.scrollTo(0, 0)
  }
  set()
  for (const t of [50, 250, 600, 1200]) setTimeout(set, t)
  window.addEventListener('resize', set)
  window.visualViewport?.addEventListener('resize', set)
  // iOS ne recalcule la zone visible qu'au premier toucher : on force un nouveau calcul de mise en page
  setTimeout(() => {
    const el = document.documentElement
    el.style.display = 'none'
    void el.offsetHeight
    el.style.display = ''
    set()
  }, 400)
  if (new URLSearchParams(location.search).has('diag') || localStorage.getItem('hexa.diag'))
    showDiag()
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

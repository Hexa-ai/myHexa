/**
 * Application installable (PWA) : enregistrement du service worker et état « installée ».
 * Le service worker n'est actif qu'en contexte sécurisé (HTTPS ou localhost) : sur l'URL http du LAN, rien n'est fait.
 */
import { ref } from 'vue'
import { hasShortViewport, pickAppHeight, type ViewportMeasure } from './appHeight'

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
  setTimeout(
    () =>
      log(
        `court=${document.documentElement.classList.contains('ios-short-viewport')} essais[${nudgeLog.join(' | ')}]`,
      ),
    3200,
  )
  addEventListener('touchend', () => setTimeout(() => log('toucher'), 300))
}

/** essais de recalcul de la hauteur (affichés par ?diag=1) */
const nudgeLog: string[] = []

/** hauteur de la zone sûre du haut (encoche / Dynamic Island), mesurée par un élément témoin */
let satProbe: HTMLDivElement | null = null
function safeTop() {
  if (!satProbe) {
    satProbe = document.createElement('div')
    satProbe.style.cssText =
      'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top)'
    document.body.appendChild(satProbe)
  }
  return parseFloat(getComputedStyle(satProbe).paddingTop) || 0
}

function fixAppHeight() {
  const measure = (): ViewportMeasure => {
    const portrait = window.matchMedia('(orientation: portrait)').matches
    return {
      inner: window.innerHeight,
      vv: window.visualViewport?.height ?? 0,
      client: document.documentElement.clientHeight,
      screenH: portrait ? window.screen.height : window.screen.width,
      sat: document.body ? safeTop() : 0,
      ios: isIOS,
    }
  }
  const set = () => {
    const m = measure()
    const short = hasShortViewport(m)
    // vue amputée : le pied de page reste en bas de la zone peinte, la bande restante prend sa couleur
    document.documentElement.classList.toggle('ios-short-viewport', short)
    document.documentElement.style.setProperty('--app-h', `${pickAppHeight(m)}px`)
    if (window.scrollY !== 0) window.scrollTo(0, 0)
  }
  set()
  for (const t of [50, 250, 600, 1200]) setTimeout(set, t)
  window.addEventListener('resize', set)
  window.visualViewport?.addEventListener('resize', set)
  // iOS ne recalcule la zone visible qu'au premier toucher. On essaie plusieurs astuces, l'une après
  // l'autre, jusqu'à ce que la hauteur annoncée soit la bonne ; chaque essai est noté pour ?diag=1.
  const tries: Array<[string, (done: () => void) => void]> = [
    [
      'viewport',
      (done) => {
        const meta = document.querySelector<HTMLMetaElement>('meta[name=viewport]')
        if (!meta) return done()
        const orig = meta.content
        meta.content = `${orig}, minimum-scale=1`
        setTimeout(() => {
          meta.content = orig
          setTimeout(done, 120)
        }, 80)
      },
    ],
    [
      'defilement',
      (done) => {
        // un défilement du document (comme un toucher) : on libère le document figé un instant
        const h = document.documentElement
        const b = document.body
        const keep = [h.style.cssText, b.style.cssText]
        h.style.setProperty('position', 'static', 'important')
        h.style.setProperty('overflow', 'auto', 'important')
        h.style.setProperty('height', 'auto', 'important')
        b.style.setProperty('position', 'static', 'important')
        b.style.setProperty('overflow', 'visible', 'important')
        b.style.setProperty('height', 'auto', 'important')
        b.style.setProperty('min-height', `${screen.height + 2}px`, 'important')
        requestAnimationFrame(() => {
          window.scrollTo(0, 1)
          setTimeout(() => {
            window.scrollTo(0, 0)
            h.style.cssText = keep[0]!
            b.style.cssText = keep[1]!
            setTimeout(done, 150)
          }, 120)
        })
      },
    ],
    [
      'zoom',
      (done) => {
        // changement d'échelle imperceptible, puis retour
        const meta = document.querySelector<HTMLMetaElement>('meta[name=viewport]')
        if (!meta) return done()
        const orig = meta.content
        meta.content = orig.replace(/initial-scale=[\d.]+/, 'initial-scale=1.0001')
        setTimeout(() => {
          meta.content = orig
          setTimeout(done, 150)
        }, 100)
      },
    ],
  ]
  const run = (i: number) => {
    const before = window.innerHeight
    if (i >= tries.length || !hasShortViewport(measure())) return set()
    const [name, fn] = tries[i]!
    fn(() => {
      set()
      nudgeLog.push(`${name}: ${before} -> ${window.innerHeight}`)
      run(i + 1)
    })
  }
  setTimeout(() => run(0), 300)
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

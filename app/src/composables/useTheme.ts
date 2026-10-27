import { ref, watchEffect } from 'vue'

export type Theme = 'light' | 'dark'
/** Style d'interface : « classique » (historique) ou « appareil » (PROTO, inspiré de Teenage Engineering). */
export type UiStyle = 'classique' | 'appareil'
const STORAGE_KEY = 'myhexa.theme'
const STYLE_KEY = 'myhexa.style'

function detectInitial(): Theme {
  if (typeof window === 'undefined') return 'dark'
  const stored = window.localStorage.getItem(STORAGE_KEY) as Theme | null
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

// style par défaut : « appareil » pour tous (décision de Julien, 27/10/2026) ; VITE_UI_STYLE=classique pour revenir à l'ancien
const DEFAULT_STYLE: UiStyle = import.meta.env.VITE_UI_STYLE === 'classique' ? 'classique' : 'appareil'
function detectStyle(): UiStyle {
  if (typeof window === 'undefined') return DEFAULT_STYLE
  const s = window.localStorage.getItem(STYLE_KEY)
  return s === 'appareil' || s === 'classique' ? s : DEFAULT_STYLE
}

const theme = ref<Theme>(detectInitial())
const uiStyle = ref<UiStyle>(detectStyle())
/** le sélecteur de style n'est proposé que là où le style « appareil » est activé (test) */
export const styleSwitchAvailable = DEFAULT_STYLE === 'appareil'

if (typeof window !== 'undefined') {
  watchEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', theme.value === 'dark')
    root.classList.toggle('light', theme.value === 'light')
    root.classList.toggle('appareil', uiStyle.value === 'appareil')
    root.style.colorScheme = theme.value
    window.localStorage.setItem(STORAGE_KEY, theme.value)
    if (styleSwitchAvailable) window.localStorage.setItem(STYLE_KEY, uiStyle.value)
  })
}

/** Couleurs des courbes : en style « appareil », encre d'abord, turquoise en second, puis tons sobres.
 *  Lu au montage des composants (le changement de style recharge la page). */
export function seriesColors(classic: string[]): string[] {
  if (uiStyle.value !== 'appareil') return classic
  const ink = theme.value === 'dark' ? '#ececea' : '#141414'
  return [ink, '#00a887', '#8b8b86', '#3b6fd8', '#c99400', '#1d9a57', '#a855f7', '#0e7490', '#b45309', '#64748b']
}

export function useTheme() {
  function toggle() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
  }
  function set(next: Theme) {
    theme.value = next
  }
  function toggleStyle() {
    uiStyle.value = uiStyle.value === 'appareil' ? 'classique' : 'appareil'
    // le style « appareil » est d'abord pensé en clair
    if (uiStyle.value === 'appareil') theme.value = 'light'
    // couleurs des courbes lues au montage : on recharge
    setTimeout(() => window.location.reload(), 50)
  }
  return { theme, toggle, set, uiStyle, toggleStyle }
}

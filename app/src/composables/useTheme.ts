import { ref, watchEffect } from 'vue'

export type Theme = 'light' | 'dark'
const STORAGE_KEY = 'myhexa.theme'

function detectInitial(): Theme {
  if (typeof window === 'undefined') return 'dark'
  const stored = window.localStorage.getItem(STORAGE_KEY) as Theme | null
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

const theme = ref<Theme>(detectInitial())

if (typeof window !== 'undefined') {
  watchEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', theme.value === 'dark')
    root.classList.toggle('light', theme.value === 'light')
    root.style.colorScheme = theme.value
    window.localStorage.setItem(STORAGE_KEY, theme.value)
  })
}

export function useTheme() {
  function toggle() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
  }
  function set(next: Theme) {
    theme.value = next
  }
  return { theme, toggle, set }
}

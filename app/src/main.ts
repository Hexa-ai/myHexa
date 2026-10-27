import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { router } from '@/router'
import { useAuthStore } from '@/stores/auth'
import App from './App.vue'
import '@/composables/useTheme'
import './style.css'
import './pwa.css'
import { registerServiceWorker } from '@/lib/pwa'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)

// Restaurer la session AVANT d'installer le router : app.use(router) lance tout de suite
// la première navigation, dont les guards voyaient alors « non connecté » et passaient
// par /login (flash de la page de connexion à chaque rechargement).
const auth = useAuthStore()
let mounted = false
function mount() {
  if (mounted) return
  mounted = true
  app.use(router)
  app.mount('#app')
  ;(window as unknown as { __myhexaMounted?: boolean }).__myhexaMounted = true
  registerServiceWorker()
}
// filet : si la restauration de session ne rend jamais la main (réseau coupé au réveil, verrou d'auth),
// on affiche quand même l'application au bout de 6 s plutôt qu'un écran blanc
setTimeout(() => {
  if (!mounted) console.warn('[boot] auth.init trop long : affichage sans attendre')
  mount()
}, 6000)
auth.init().finally(mount)

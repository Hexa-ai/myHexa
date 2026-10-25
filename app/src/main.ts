import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { router } from '@/router'
import { useAuthStore } from '@/stores/auth'
import App from './App.vue'
import '@/composables/useTheme'
import './style.css'
import './theme-appareil.css'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)

// Restaurer la session AVANT d'installer le router : app.use(router) lance tout de suite
// la première navigation, dont les guards voyaient alors « non connecté » et passaient
// par /login (flash de la page de connexion à chaque rechargement).
const auth = useAuthStore()
auth.init().finally(() => {
  app.use(router)
  app.mount('#app')
})

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { router } from '@/router'
import { useAuthStore } from '@/stores/auth'
import App from './App.vue'
import './style.css'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(router)

const auth = useAuthStore()
auth.init().finally(() => app.mount('#app'))

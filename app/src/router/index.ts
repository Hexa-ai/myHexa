import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import LoginView from '@/views/auth/LoginView.vue'
import AdminLayout from '@/views/admin/AdminLayout.vue'
import DevicesView from '@/views/admin/DevicesView.vue'
import { requireAuth } from '@/router/guards'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/login', name: 'login', component: LoginView },
    {
      path: '/admin',
      component: AdminLayout,
      beforeEnter: requireAuth,
      children: [
        { path: 'devices', name: 'admin-devices', component: DevicesView },
        { path: '', redirect: { name: 'admin-devices' } },
      ],
    },
  ],
})

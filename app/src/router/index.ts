import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import LoginView from '@/views/auth/LoginView.vue'
import AdminLayout from '@/views/admin/AdminLayout.vue'
import DevicesView from '@/views/admin/DevicesView.vue'
import DeviceDetailView from '@/views/admin/DeviceDetailView.vue'
import DevicePeriodicView from '@/views/admin/DevicePeriodicView.vue'
import FleetMapView from '@/views/admin/FleetMapView.vue'
import ReportView from '@/views/public/ReportView.vue'
import PeriodicReportView from '@/views/public/PeriodicReportView.vue'
import RecoverView from '@/views/public/RecoverView.vue'
import { requireAuth } from '@/router/guards'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/login', name: 'login', component: LoginView },
    { path: '/report', name: 'report', component: ReportView },
    { path: '/report/periodic', name: 'report-periodic', component: PeriodicReportView },
    { path: '/recover', name: 'recover', component: RecoverView },
    {
      path: '/admin',
      component: AdminLayout,
      beforeEnter: requireAuth,
      children: [
        { path: 'devices', name: 'admin-devices', component: DevicesView },
        { path: 'devices/:id', name: 'admin-device-detail', component: DeviceDetailView },
        { path: 'devices/:id/periodic', name: 'admin-device-periodic', component: DevicePeriodicView },
        { path: 'map', name: 'admin-map', component: FleetMapView },
        { path: '', redirect: { name: 'admin-devices' } },
      ],
    },
  ],
})

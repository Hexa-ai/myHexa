import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '@/views/auth/LoginView.vue'
import { useAuthStore } from '@/stores/auth'
import AdminLayout from '@/views/admin/AdminLayout.vue'
import DevicesView from '@/views/admin/DevicesView.vue'
import DeviceDetailView from '@/views/admin/DeviceDetailView.vue'
import DevicePeriodicView from '@/views/admin/DevicePeriodicView.vue'
import FleetMapView from '@/views/admin/FleetMapView.vue'
import AlarmsView from '@/views/admin/AlarmsView.vue'
import InterventionsView from '@/views/admin/InterventionsView.vue'
import RecipientsView from '@/views/admin/RecipientsView.vue'
import StaffCompaniesView from '@/views/admin/staff/CompaniesView.vue'
import StaffCompanyDetailView from '@/views/admin/staff/CompanyDetailView.vue'
import StaffDevicesView from '@/views/admin/staff/DevicesView.vue'
import StaffDeviceNewView from '@/views/admin/staff/DeviceNewView.vue'
import ReportView from '@/views/public/ReportView.vue'
import PeriodicReportView from '@/views/public/PeriodicReportView.vue'
import InterventionView from '@/views/public/InterventionView.vue'
import RecoverView from '@/views/public/RecoverView.vue'
import { requireAuth, requireAdmin, requireStaff } from '@/router/guards'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      redirect: () => {
        const auth = useAuthStore()
        if (!auth.isAuthenticated) return { name: 'login' }
        return auth.isHexaStaff ? { name: 'staff-companies' } : { name: 'admin-devices' }
      },
    },
    { path: '/login', name: 'login', component: LoginView },
    { path: '/report', name: 'report', component: ReportView },
    { path: '/report/periodic', name: 'report-periodic', component: PeriodicReportView },
    { path: '/intervention', name: 'intervention', component: InterventionView },
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
        { path: 'alarms', name: 'admin-alarms', component: AlarmsView },
        { path: 'interventions', name: 'admin-interventions', component: InterventionsView },
        {
          path: 'recipients',
          name: 'admin-recipients',
          component: RecipientsView,
          beforeEnter: requireAdmin,
        },
        { path: 'staff/companies', name: 'staff-companies', component: StaffCompaniesView, beforeEnter: requireStaff },
        { path: 'staff/companies/:id', name: 'staff-company-detail', component: StaffCompanyDetailView, beforeEnter: requireStaff },
        { path: 'staff/devices', name: 'staff-devices', component: StaffDevicesView, beforeEnter: requireStaff },
        { path: 'staff/devices/new', name: 'staff-device-new', component: StaffDeviceNewView, beforeEnter: requireStaff },
        { path: '', redirect: { name: 'admin-devices' } },
      ],
    },
  ],
})

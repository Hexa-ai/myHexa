import type { NavigationGuardWithThis } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

export const requireAuth: NavigationGuardWithThis<undefined> = (to) => {
  const auth = useAuthStore()
  if (!auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
}

export const requireAdmin: NavigationGuardWithThis<undefined> = () => {
  const auth = useAuthStore()
  if (!auth.isAuthenticated) return { name: 'login' }
  if (auth.recipient?.role !== 'admin') return { name: 'admin-devices' }
}

export const requireStaff: NavigationGuardWithThis<undefined> = () => {
  const auth = useAuthStore()
  if (!auth.isAuthenticated) return { name: 'login' }
  if (!auth.isHexaStaff) return { name: 'admin-devices' }
}

export const requireStaffAdmin: NavigationGuardWithThis<undefined> = () => {
  const auth = useAuthStore()
  if (!auth.isAuthenticated) return { name: 'login' }
  if (!auth.isHexaStaffAdmin) return { name: 'staff-companies' }
}

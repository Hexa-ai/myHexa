import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getSession: vi.fn(() => ({ data: { session: null } })),
      onAuthStateChange: vi.fn(),
    },
    from: vi.fn(),
  },
}))

describe('authStore', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('starts unauthenticated', () => {
    const store = useAuthStore()
    expect(store.isAuthenticated).toBe(false)
    expect(store.recipient).toBeNull()
  })

  it('exposes companyId null when no recipient', () => {
    const store = useAuthStore()
    expect(store.companyId).toBeNull()
  })
})

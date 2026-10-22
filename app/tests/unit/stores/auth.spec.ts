import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/lib/supabase'

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

  // Régression : le portail se figeait au retour sur l'onglet. auth-js appelle
  // ce callback sous son verrou et attend sa fin ; s'il attend une requête
  // Supabase (qui réclame le même verrou), tout se bloque jusqu'au rechargement.
  it("onAuthStateChange : le callback rend la main sans attendre de requête Supabase", async () => {
    vi.useFakeTimers()
    const recipientQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      // Requête qui ne se termine jamais, comme sous le verrou d'auth.
      maybeSingle: vi.fn(() => new Promise(() => {})),
    }
    vi.mocked(supabase.from).mockReturnValue(recipientQuery as never)
    const store = useAuthStore()
    await store.init()
    const callback = vi.mocked(supabase.auth.onAuthStateChange).mock.calls[0]![0]
    const session = { user: { id: 'u1' } } as never

    const ret = callback('SIGNED_IN', session)
    // Synchrone : rien à attendre pour auth-js…
    expect(ret).toBeUndefined()
    expect(store.isAuthenticated).toBe(true)
    // …et la requête n'est lancée qu'après, hors du verrou.
    expect(supabase.from).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(supabase.from).toHaveBeenCalledWith('recipients')
    vi.useRealTimers()
  })
})

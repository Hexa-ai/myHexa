import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/supabase'

type Recipient = Database['public']['Tables']['recipients']['Row']

export const useAuthStore = defineStore('auth', () => {
  const session = ref<Session | null>(null)
  const recipient = ref<Recipient | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const isAuthenticated = computed(() => session.value !== null)
  const companyId = computed(() => recipient.value?.company_id ?? null)

  async function loadRecipient() {
    if (!session.value) return
    const { data, error: err } = await supabase
      .from('recipients')
      .select('*')
      .eq('auth_user_id', session.value.user.id)
      .maybeSingle()
    if (err) {
      error.value = err.message
      return
    }
    recipient.value = data
  }

  async function init() {
    const { data } = await supabase.auth.getSession()
    session.value = data.session
    if (session.value) {
      await loadRecipient()
    }
    supabase.auth.onAuthStateChange(async (_event, newSession) => {
      session.value = newSession
      if (newSession) await loadRecipient()
      else recipient.value = null
    })
  }

  async function signIn(email: string, password: string) {
    loading.value = true
    error.value = null
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    loading.value = false
    if (err) {
      error.value = err.message
      return false
    }
    return true
  }

  async function signOut() {
    await supabase.auth.signOut()
    session.value = null
    recipient.value = null
  }

  return {
    session,
    recipient,
    loading,
    error,
    isAuthenticated,
    companyId,
    init,
    signIn,
    signOut,
  }
})

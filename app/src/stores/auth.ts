import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/supabase'

type Recipient = Database['public']['Tables']['recipients']['Row']

const ACT_AS_KEY = 'hexa.actAsCompanyId'

export const useAuthStore = defineStore('auth', () => {
  const session = ref<Session | null>(null)
  const recipient = ref<Recipient | null>(null)
  const companyName = ref<string | null>(null)
  const isHexaInternalCompany = ref<boolean>(false)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const isAuthenticated = computed(() => session.value !== null)
  const companyId = computed(() => recipient.value?.company_id ?? null)
  const isHexaStaff = computed(() => isHexaInternalCompany.value)
  const isHexaStaffAdmin = computed(
    () => isHexaInternalCompany.value && recipient.value?.role === 'admin',
  )

  // Pour les staff : compagnie sur laquelle on "agit". Stockée en sessionStorage,
  // perdue à la fermeture de l'onglet.
  const actAsCompanyId = ref<string | null>(
    typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(ACT_AS_KEY) : null,
  )

  watch(actAsCompanyId, (v) => {
    if (typeof sessionStorage === 'undefined') return
    if (v) sessionStorage.setItem(ACT_AS_KEY, v)
    else sessionStorage.removeItem(ACT_AS_KEY)
  })

  function setActAsCompany(id: string | null) {
    if (!isHexaStaff.value) return
    actAsCompanyId.value = id
  }

  // Toutes les vues admin doivent lire ceci à la place de companyId.
  const effectiveCompanyId = computed<string | null>(() => {
    if (isHexaStaff.value && actAsCompanyId.value) return actAsCompanyId.value
    return companyId.value
  })

  async function loadRecipient() {
    if (!session.value) return
    const { data, error: err } = await supabase
      .from('recipients')
      .select('*, companies(name, is_hexa_internal)')
      .eq('auth_user_id', session.value.user.id)
      .maybeSingle()
    if (err) {
      error.value = err.message
      return
    }
    if (data) {
      const { companies, ...rest } = data as Recipient & {
        companies: { name: string; is_hexa_internal: boolean } | null
      }
      recipient.value = rest as Recipient
      companyName.value = companies?.name ?? null
      isHexaInternalCompany.value = companies?.is_hexa_internal ?? false
    } else {
      recipient.value = null
      companyName.value = null
      isHexaInternalCompany.value = false
    }
  }

  async function init() {
    const { data } = await supabase.auth.getSession()
    session.value = data.session
    if (session.value) await loadRecipient()
    supabase.auth.onAuthStateChange(async (event, newSession) => {
      session.value = newSession
      // Ne recharger le recipient que lors d'une vraie (dé)connexion ou d'un
      // changement d'utilisateur. TOKEN_REFRESHED arrive toutes les ~30 min
      // et déclencherait une race avec les fetches en cours.
      if (!newSession) {
        recipient.value = null
        companyName.value = null
        isHexaInternalCompany.value = false
        actAsCompanyId.value = null
        return
      }
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || !recipient.value) {
        await loadRecipient()
      }
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

  async function requestPasswordReset(email: string) {
    loading.value = true
    error.value = null
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })
    loading.value = false
    if (err) {
      error.value = err.message
      return false
    }
    return true
  }

  async function sendMagicLink(email: string) {
    loading.value = true
    error.value = null
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/admin`,
      },
    })
    loading.value = false
    if (err) {
      error.value = err.message
      return false
    }
    return true
  }

  async function updatePassword(newPassword: string) {
    loading.value = true
    error.value = null
    const { error: err } = await supabase.auth.updateUser({ password: newPassword })
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
    companyName.value = null
    isHexaInternalCompany.value = false
    actAsCompanyId.value = null
  }

  return {
    session,
    recipient,
    companyName,
    loading,
    error,
    isAuthenticated,
    companyId,
    isHexaStaff,
    isHexaStaffAdmin,
    actAsCompanyId,
    setActAsCompany,
    effectiveCompanyId,
    init,
    signIn,
    signOut,
    requestPasswordReset,
    sendMagicLink,
    updatePassword,
  }
})

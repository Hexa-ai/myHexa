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
  // Un staff Hexa est forcément admin de la compagnie interne. Un viewer
  // Hexa-ai est traité comme un recipient normal (respect de restrict_to_devices).
  const isHexaStaff = computed(
    () => isHexaInternalCompany.value && recipient.value?.role === 'admin',
  )
  const isHexaStaffAdmin = isHexaStaff

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

  // Un seul chargement du recipient à la fois (connexion + événement d'auth
  // peuvent le demander en même temps).
  let recipientLoad: Promise<void> | null = null
  function ensureRecipient(): Promise<void> {
    if (!recipientLoad) {
      recipientLoad = loadRecipient().finally(() => {
        recipientLoad = null
      })
    }
    return recipientLoad
  }

  async function init() {
    const { data } = await supabase.auth.getSession()
    session.value = data.session
    if (session.value) await ensureRecipient()
    // ATTENTION : ce callback doit rester SYNCHRONE et ne jamais attendre
    // (await) un appel Supabase.
    //
    // auth-js l'exécute *à l'intérieur de son verrou d'auth* et attend sa fin
    // avant de libérer le verrou. Or toute requête Supabase commence par
    // getSession(), qui réclame ce même verrou : un `await loadRecipient()`
    // ici attend donc le verrou que l'on détient. Interblocage définitif, sans
    // erreur ni trafic réseau : plus aucune requête ne part, seul un
    // rechargement de la page répare.
    //
    // Déclencheur courant : au retour sur l'onglet (visibilitychange), auth-js
    // relit la session sous verrou et émet SIGNED_IN. Le portail "se
    // déconnectait du backend" ainsi après chaque changement d'onglet, mise en
    // veille ou verrouillage du poste.
    //
    // Recommandation Supabase : différer le travail avec setTimeout(…, 0),
    // qui s'exécute une fois le verrou libéré.
    // https://supabase.com/docs/reference/javascript/auth-onauthstatechange
    supabase.auth.onAuthStateChange((event, newSession) => {
      const previousUserId = session.value?.user.id
      session.value = newSession
      if (!newSession) {
        recipient.value = null
        companyName.value = null
        isHexaInternalCompany.value = false
        actAsCompanyId.value = null
        return
      }
      // Ne recharger le recipient que lors d'une vraie (dé)connexion ou d'un
      // changement d'utilisateur. TOKEN_REFRESHED arrive toutes les ~30 min,
      // et SIGNED_IN est réémis à chaque retour sur l'onglet pour le même
      // utilisateur : inutile de recharger dans ces cas-là.
      const sameUser = previousUserId === newSession.user.id && recipient.value !== null
      if (
        event === 'USER_UPDATED' ||
        !recipient.value ||
        (event === 'SIGNED_IN' && !sameUser)
      ) {
        setTimeout(() => void ensureRecipient(), 0)
      }
    })
  }

  async function signIn(email: string, password: string) {
    loading.value = true
    error.value = null
    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) {
      loading.value = false
      error.value = err.message
      return false
    }
    // Hors du verrou d'auth : on peut attendre le recipient avant de rendre la
    // main, la page de connexion calcule sa destination avec.
    session.value = data.session
    await ensureRecipient()
    loading.value = false
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
        emailRedirectTo: `${window.location.origin}/auth/callback`,
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
    ensureRecipient,
    signIn,
    signOut,
    requestPasswordReset,
    sendMagicLink,
    updatePassword,
  }
})

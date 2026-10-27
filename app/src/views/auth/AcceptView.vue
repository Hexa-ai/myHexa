<script setup lang="ts">
/**
 * Page d'arrivée des liens envoyés par mail (invitation, mot de passe oublié, lien de connexion).
 *
 * Le lien du mail ne fait RIEN tout seul : le jeton à usage unique n'est consommé qu'au clic sur le
 * bouton. Les antivirus de messagerie des grands groupes ouvrent les liens pour les analyser
 * (navigateur automatique, sans clic) : avant cette page, ils consommaient l'invitation et le client
 * arrivait sur un lien expiré.
 */
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useTheme } from '@/composables/useTheme'

type LinkType = 'invite' | 'recovery' | 'magiclink' | 'email'
const { theme } = useTheme()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const tokenHash = computed(() => String(route.query.token_hash ?? ''))
const type = computed<LinkType | null>(() => {
  const t = String(route.query.type ?? '')
  return (['invite', 'recovery', 'magiclink', 'email'] as const).includes(t as LinkType)
    ? (t as LinkType)
    : null
})
const texts = computed(() => {
  switch (type.value) {
    case 'invite':
      return {
        title: 'Bienvenue sur myHexa',
        lead: 'Votre accès au portail est prêt. Activez votre compte, puis choisissez votre mot de passe.',
        button: 'Activer mon compte',
      }
    case 'recovery':
      return {
        title: 'Nouveau mot de passe',
        lead: 'Continuez pour choisir un nouveau mot de passe.',
        button: 'Choisir mon mot de passe',
      }
    default:
      return {
        title: 'Connexion à myHexa',
        lead: 'Continuez pour ouvrir votre session.',
        button: 'Me connecter',
      }
  }
})
const busy = ref(false)
const error = ref<string | null>(null)

async function accept() {
  if (!tokenHash.value || !type.value) return
  busy.value = true
  error.value = null
  const { error: err } = await supabase.auth.verifyOtp({
    token_hash: tokenHash.value,
    type: type.value,
  })
  if (err) {
    busy.value = false
    error.value =
      'Ce lien a expiré ou a déjà servi. Demandez un nouveau lien ci-dessous (ou à la personne qui vous a invité).'
    return
  }
  await auth.ensureRecipient()
  if (type.value === 'invite' || type.value === 'recovery') {
    router.replace({
      name: 'reset-password',
      query: type.value === 'invite' ? { premier: '1' } : {},
    })
  } else {
    router.replace(auth.isHexaStaff ? '/admin/staff/companies' : '/admin/devices')
  }
}
</script>

<template>
  <main class="min-h-screen relative flex items-center justify-center p-6 overflow-hidden">
    <div class="absolute inset-0 hex-grid" />
    <div class="relative w-full max-w-[440px] fade-up">
      <div class="mb-8 flex flex-col items-center">
        <img
          :src="theme === 'dark' ? '/hexa-logo-dark.png' : '/hexa-logo-light.png'"
          alt="Hexa.ai"
          class="h-14 w-[200px] object-contain mb-7 select-none"
          draggable="false"
        />
        <h1 class="text-2xl font-semibold tracking-tight text-center" data-testid="accept-title">
          {{ texts.title }}
        </h1>
        <p class="mt-3 text-sm text-muted-foreground text-center max-w-sm">{{ texts.lead }}</p>
      </div>

      <div
        class="border border-border rounded-lg bg-card/70 backdrop-blur-sm p-7 space-y-4 text-center"
      >
        <template v-if="tokenHash && type">
          <button
            type="button"
            data-testid="accept-button"
            :disabled="busy"
            class="w-full bg-signal text-primary-foreground font-semibold py-3 rounded-md disabled:opacity-60 hover:brightness-110"
            @click="accept"
          >
            <span class="font-mono text-[11px] uppercase tracking-[0.22em]">{{
              busy ? 'Vérification…' : texts.button
            }}</span>
          </button>
          <p v-if="error" class="font-mono text-xs text-offline" data-testid="accept-error">
            {{ error }}
          </p>
        </template>
        <p v-else class="font-mono text-xs text-offline">
          Lien incomplet : ouvrez-le directement depuis le mail.
        </p>
        <div class="flex justify-center gap-5 pt-1">
          <router-link
            to="/auth/forgot-password"
            class="font-mono text-[11px] uppercase tracking-widest text-muted-foreground hover:text-signal transition"
            >Nouveau lien</router-link
          >
          <router-link
            to="/login"
            class="font-mono text-[11px] uppercase tracking-widest text-muted-foreground hover:text-signal transition"
            >Connexion</router-link
          >
        </div>
      </div>
    </div>
  </main>
</template>

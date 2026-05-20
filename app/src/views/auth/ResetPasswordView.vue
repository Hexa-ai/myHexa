<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useTheme } from '@/composables/useTheme'

const { theme } = useTheme()
const auth = useAuthStore()
const router = useRouter()

const password = ref('')
const confirm = ref('')
const ready = ref(false)
const localError = ref<string | null>(null)

// Supabase met automatiquement la session via le token en query string.
// On attend juste qu'elle soit chargée pour autoriser le set password.
onMounted(() => {
  // petit délai pour laisser onAuthStateChange consommer le token
  setTimeout(() => {
    ready.value = auth.isAuthenticated
    if (!auth.isAuthenticated) {
      localError.value = 'Lien expiré ou invalide. Demandez-en un nouveau.'
    }
  }, 400)
})

async function handleSubmit() {
  localError.value = null
  if (password.value.length < 8) {
    localError.value = 'Le mot de passe doit faire au moins 8 caractères.'
    return
  }
  if (password.value !== confirm.value) {
    localError.value = 'Les deux mots de passe ne correspondent pas.'
    return
  }
  const ok = await auth.updatePassword(password.value)
  if (ok) router.replace('/admin')
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
        <h1 class="text-2xl font-semibold tracking-tight">Nouveau mot de passe</h1>
        <p class="mt-3 text-sm text-muted-foreground text-center max-w-sm">
          Choisissez un mot de passe d'au moins 8 caractères.
        </p>
      </div>

      <form
        v-if="ready"
        class="border border-border rounded-lg bg-card/70 backdrop-blur-sm p-7 space-y-5"
        @submit.prevent="handleSubmit"
      >
        <div class="space-y-1.5">
          <label class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Nouveau mot de passe</label>
          <input
            v-model="password"
            type="password"
            required
            minlength="8"
            autocomplete="new-password"
            class="w-full bg-transparent border-0 border-b border-border focus:border-signal focus:outline-none px-0 py-2 text-sm font-mono"
            placeholder="••••••••"
          />
        </div>

        <div class="space-y-1.5">
          <label class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Confirmation</label>
          <input
            v-model="confirm"
            type="password"
            required
            autocomplete="new-password"
            class="w-full bg-transparent border-0 border-b border-border focus:border-signal focus:outline-none px-0 py-2 text-sm font-mono"
            placeholder="••••••••"
          />
        </div>

        <p v-if="localError || auth.error" class="font-mono text-xs text-offline">
          {{ localError || auth.error }}
        </p>

        <button
          type="submit"
          :disabled="auth.loading"
          class="w-full bg-signal text-primary-foreground font-semibold py-3 rounded-md disabled:opacity-60 hover:brightness-110"
        >
          <span class="font-mono text-[11px] uppercase tracking-[0.22em]">
            {{ auth.loading ? 'Mise à jour…' : 'Définir le mot de passe' }}
          </span>
        </button>
      </form>

      <div
        v-else
        class="border border-border rounded-lg bg-card/70 backdrop-blur-sm p-7 text-sm text-center space-y-3"
      >
        <p v-if="localError" class="font-mono text-xs text-offline">{{ localError }}</p>
        <p v-else class="text-muted-foreground">Validation du lien…</p>
        <router-link
          v-if="localError"
          to="/auth/forgot-password"
          class="inline-block mt-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground hover:text-signal transition"
        >
          Demander un nouveau lien
        </router-link>
      </div>
    </div>
  </main>
</template>

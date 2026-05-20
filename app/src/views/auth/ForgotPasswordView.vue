<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useTheme } from '@/composables/useTheme'

const { theme } = useTheme()
const auth = useAuthStore()
const email = ref('')
const sent = ref(false)

async function handleSubmit() {
  const ok = await auth.requestPasswordReset(email.value)
  if (ok) sent.value = true
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
        <h1 class="text-2xl font-semibold tracking-tight">Mot de passe oublié</h1>
        <p class="mt-3 text-sm text-muted-foreground text-center max-w-sm">
          Entrez votre email, nous vous enverrons un lien pour définir un nouveau mot de passe.
        </p>
      </div>

      <div
        v-if="sent"
        class="border border-border rounded-lg bg-card/70 backdrop-blur-sm p-7 text-sm text-center space-y-3"
      >
        <p class="text-signal font-mono uppercase tracking-widest text-[11px]">Email envoyé</p>
        <p>
          Si <span class="font-mono">{{ email }}</span> est connu, un lien vient d'être envoyé.
          Vérifiez votre boîte (et les spams).
        </p>
        <router-link
          to="/login"
          class="inline-block mt-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground hover:text-signal transition"
        >
          ← Retour à la connexion
        </router-link>
      </div>

      <form
        v-else
        class="border border-border rounded-lg bg-card/70 backdrop-blur-sm p-7 space-y-5"
        @submit.prevent="handleSubmit"
      >
        <div class="space-y-1.5">
          <label for="email" class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Email</label>
          <input
            id="email"
            v-model="email"
            type="email"
            required
            autocomplete="email"
            class="w-full bg-transparent border-0 border-b border-border focus:border-signal focus:outline-none px-0 py-2 text-sm font-mono"
            placeholder="vous@entreprise.fr"
          />
        </div>

        <p v-if="auth.error" class="font-mono text-xs text-offline">{{ auth.error }}</p>

        <button
          type="submit"
          :disabled="auth.loading"
          class="w-full bg-signal text-primary-foreground font-semibold py-3 rounded-md disabled:opacity-60 hover:brightness-110"
        >
          <span class="font-mono text-[11px] uppercase tracking-[0.22em]">
            {{ auth.loading ? 'Envoi…' : 'Envoyer le lien' }}
          </span>
        </button>

        <div class="text-center pt-2">
          <router-link
            to="/login"
            class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-signal transition"
          >
            ← Retour à la connexion
          </router-link>
        </div>
      </form>
    </div>
  </main>
</template>

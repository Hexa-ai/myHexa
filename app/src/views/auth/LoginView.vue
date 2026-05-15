<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useTheme } from '@/composables/useTheme'

const { theme, toggle: toggleTheme } = useTheme()

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const email = ref('')
const password = ref('')

onMounted(() => {
  if (auth.isAuthenticated) {
    const redirect = (route.query.redirect as string) || '/admin'
    router.replace(redirect)
  }
})

async function handleSubmit() {
  const ok = await auth.signIn(email.value, password.value)
  if (!ok) return
  const redirect = (route.query.redirect as string) || '/admin'
  router.push(redirect)
}
</script>

<template>
  <main class="min-h-screen relative flex items-center justify-center p-6 overflow-hidden">
    <div class="absolute inset-0 hex-grid" />

    <!-- corners -->
    <div class="absolute top-6 left-6 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground flex items-center gap-2">
      <span class="text-signal">⬢</span> Hexa.ai · myHexa edge
    </div>
    <div class="absolute bottom-6 right-6 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
      v1 · 2026
    </div>
    <button
      @click="toggleTheme"
      :title="theme === 'dark' ? 'Passer en clair' : 'Passer en sombre'"
      class="absolute top-5 right-6 size-8 inline-flex items-center justify-center rounded-md border border-border hover:border-signal/60 text-muted-foreground hover:text-foreground transition"
    >
      <svg v-if="theme === 'dark'" viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
      <svg v-else viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
      </svg>
    </button>

    <div class="relative w-full max-w-[440px] fade-up">
      <div class="mb-8 flex flex-col items-center">
        <img
          :src="theme === 'dark' ? '/hexa-logo-dark.png' : '/hexa-logo-light.png'"
          alt="Hexa.ai"
          class="h-14 w-[200px] object-contain mb-7 select-none drop-shadow-[0_8px_30px_rgb(232_144_46_/_0.25)]"
          draggable="false"
        />
        <div class="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-3">
          Restricted access
        </div>
        <h1 class="text-3xl font-semibold tracking-tight">
          my<span class="text-signal">Hexa</span> <span class="text-muted-foreground/70 font-light">Edge</span>
        </h1>
        <p class="mt-3 text-sm text-muted-foreground text-center max-w-sm">
          Supervisez en temps réel votre parc de capteurs Hexa.ai.
        </p>
      </div>

      <form
        @submit.prevent="handleSubmit"
        class="border border-border rounded-lg bg-card/70 backdrop-blur-sm p-7 space-y-5 shadow-[0_0_80px_-30px_rgb(0_212_170_/_0.4)]"
      >
        <div class="space-y-1.5">
          <label for="email" class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Email</label>
          <input
            id="email"
            v-model="email"
            type="email"
            required
            autocomplete="email"
            class="w-full bg-transparent border-0 border-b border-border focus:border-signal focus:outline-none px-0 py-2 text-sm font-mono placeholder:text-muted-foreground/40 transition"
            placeholder="vous@entreprise.fr"
          />
        </div>

        <div class="space-y-1.5">
          <label for="password" class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Mot de passe</label>
          <input
            id="password"
            v-model="password"
            type="password"
            required
            autocomplete="current-password"
            class="w-full bg-transparent border-0 border-b border-border focus:border-signal focus:outline-none px-0 py-2 text-sm font-mono placeholder:text-muted-foreground/40 transition"
            placeholder="••••••••"
          />
        </div>

        <p v-if="auth.error" class="font-mono text-xs text-offline flex items-center gap-2">
          <span class="size-1.5 rounded-full bg-offline" /> ERR · {{ auth.error }}
        </p>

        <button
          type="submit"
          :disabled="auth.loading"
          class="group relative w-full bg-signal text-primary-foreground font-semibold py-3 rounded-md overflow-hidden transition disabled:opacity-60 disabled:cursor-not-allowed hover:brightness-110 glow-signal"
        >
          <span class="relative z-10 flex items-center justify-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em]">
            <template v-if="auth.loading">
              <span class="blink">▍</span> authenticating
            </template>
            <template v-else>
              Enter <span class="transition group-hover:translate-x-1">→</span>
            </template>
          </span>
        </button>
      </form>

      <div class="mt-6 text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        Pas encore d'accès ? Contactez votre administrateur.
      </div>
    </div>
  </main>
</template>

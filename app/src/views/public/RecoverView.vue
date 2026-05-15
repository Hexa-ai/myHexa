<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { recoverLink } from '@/lib/api'
import { useTheme } from '@/composables/useTheme'

const route = useRoute()
const { theme, toggle: toggleTheme } = useTheme()

const email = ref('')
const submitting = ref(false)
const submitted = ref(false)
const error = ref<string | null>(null)

const reason = computed(() => String(route.query.reason ?? ''))
const fromUrl = computed(() => String(route.query.from ?? ''))

const reasonLabel = computed(() => {
  switch (reason.value) {
    case 'TOKEN_EXPIRED':
      return 'Lien expiré'
    case 'TOKEN_NOT_FOUND':
      return 'Lien invalide'
    default:
      return ''
  }
})

async function handleSubmit() {
  submitting.value = true
  error.value = null
  const res = await recoverLink(email.value, fromUrl.value || undefined)
  submitting.value = false
  if (!res.ok) {
    error.value = res.error.message
    return
  }
  submitted.value = true
}
</script>

<template>
  <main class="min-h-screen relative flex items-center justify-center p-6 overflow-hidden">
    <div class="absolute inset-0 hex-grid" />

    <div class="absolute top-6 left-6 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground flex items-center gap-2">
      <span class="text-signal">⬢</span> Hexa.ai · myHexa edge
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
      <div class="mb-8 flex flex-col items-center text-center">
        <img
          :src="theme === 'dark' ? '/hexa-logo-dark.png' : '/hexa-logo-light.png'"
          alt="Hexa.ai"
          class="h-14 w-[200px] object-contain mb-7 select-none"
          draggable="false"
        />
        <div
          v-if="reasonLabel"
          class="font-mono text-[10px] uppercase tracking-[0.3em] text-offline mb-3 flex items-center gap-2"
        >
          <span class="size-1.5 rounded-full bg-offline" /> {{ reasonLabel }}
        </div>
        <div v-else class="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-3">
          Récupération de lien
        </div>
        <h1 class="text-3xl font-semibold tracking-tight">
          Récupérer mon <span class="text-signal">lien</span>
        </h1>
        <p class="mt-3 text-sm text-muted-foreground max-w-sm">
          Saisissez l'email associé à votre compte myHexa. Si une correspondance est trouvée, vous recevrez un nouveau lien d'accès.
        </p>
      </div>

      <!-- Confirmation -->
      <div
        v-if="submitted"
        class="border border-signal/40 rounded-lg bg-signal-soft p-7 text-center shadow-[0_0_60px_-30px_rgb(0_212_170_/_0.4)]"
      >
        <div class="font-mono text-[10px] uppercase tracking-[0.3em] text-signal mb-3">
          ✓ Demande envoyée
        </div>
        <p class="text-sm">
          Si cette adresse est connue, un nouveau lien vous sera envoyé dans quelques instants.
        </p>
      </div>

      <!-- Form -->
      <form
        v-else
        @submit.prevent="handleSubmit"
        class="border border-border rounded-lg bg-card/70 backdrop-blur-sm p-7 space-y-5"
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

        <p v-if="error" class="font-mono text-xs text-offline flex items-center gap-2">
          <span class="size-1.5 rounded-full bg-offline" /> ERR · {{ error }}
        </p>

        <button
          type="submit"
          :disabled="submitting"
          class="group relative w-full bg-signal text-primary-foreground font-semibold py-3 rounded-md transition disabled:opacity-60 disabled:cursor-not-allowed hover:brightness-110 glow-signal"
        >
          <span class="relative z-10 flex items-center justify-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em]">
            <template v-if="submitting">
              <span class="blink">▍</span> envoi en cours
            </template>
            <template v-else>
              Envoyer un nouveau lien <span class="transition group-hover:translate-x-1">→</span>
            </template>
          </span>
        </button>
      </form>
    </div>
  </main>
</template>

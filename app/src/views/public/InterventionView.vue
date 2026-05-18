<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { submitIntervention, type InterventionKind, type InterventionPhotoInput } from '@/lib/api'
import { useTheme } from '@/composables/useTheme'
import { severityButtonClass, SEVERITY_ICON, SEVERITY_LABEL, type Severity } from '@/lib/utils'
import { compressImage } from '@/lib/image'
import KindPicker from '@/components/intervention/KindPicker.vue'

const MAX_PHOTOS = 5

const route = useRoute()
const { theme, toggle: toggleTheme } = useTheme()

const deviceId = computed(() => String(route.query.d ?? ''))

const kind = ref<InterventionKind | null>(null)
const technicianName = ref('')
const technicianEmail = ref('')
const technicianPhone = ref('')
const category = ref<'intervention' | 'incident' | 'controle' | 'autre'>('intervention')
const severity = ref<'info' | 'warning' | 'error'>('warning')
const message = ref('')

const submitting = ref(false)
const submitted = ref<string | null>(null)
const error = ref<string | null>(null)

interface PhotoSlot {
  preview: string
  data: InterventionPhotoInput
  sizeKb: number
}
const photoSlots = ref<PhotoSlot[]>([])
const compressing = ref(0)

async function onPhotoSelect(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  const available = MAX_PHOTOS - photoSlots.value.length
  if (available <= 0) {
    error.value = `Maximum ${MAX_PHOTOS} photos.`
    return
  }
  for (const file of files.slice(0, available)) {
    if (!file.type.startsWith('image/')) continue
    compressing.value += 1
    try {
      const compressed = await compressImage(file, { maxSize: 1600, quality: 0.85 })
      photoSlots.value.push({
        preview: `data:${compressed.contentType};base64,${compressed.dataBase64}`,
        data: {
          name: compressed.name,
          contentType: compressed.contentType,
          dataBase64: compressed.dataBase64,
        },
        sizeKb: Math.round(compressed.sizeBytes / 1024),
      })
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Erreur photo'
    } finally {
      compressing.value -= 1
    }
  }
}
function removePhoto(idx: number) {
  photoSlots.value.splice(idx, 1)
}

const CATEGORIES = [
  { value: 'intervention', label: 'Intervention' },
  { value: 'controle', label: 'Contrôle' },
  { value: 'autre', label: 'Autre' },
] as const
const SEVERITIES: readonly Severity[] = ['info', 'warning', 'error'] as const

const isSignalement = computed(() => kind.value === 'signalement')
const headerTitle = computed(() =>
  isSignalement.value ? 'Signaler une anomalie' : 'Consigner une intervention',
)
const headerSubtitle = computed(() =>
  isSignalement.value
    ? "Décrivez l'anomalie observée sur cet équipement."
    : "Renseignez les détails de votre passage sur cet équipement.",
)
const submitLabel = computed(() => (isSignalement.value ? 'Envoyer le signalement' : 'Envoyer le rapport'))
const successLabel = computed(() =>
  isSignalement.value ? '✓ Signalement enregistré' : '✓ Intervention enregistrée',
)
const successText = computed(() =>
  isSignalement.value
    ? 'Merci, votre signalement a été transmis à l\'équipe.'
    : 'Merci, votre rapport a été transmis à l\'équipe.',
)
const successAgainLabel = computed(() => (isSignalement.value ? 'Nouveau signalement' : 'Nouveau rapport'))

function resetForm() {
  technicianName.value = ''
  technicianEmail.value = ''
  technicianPhone.value = ''
  category.value = 'intervention'
  severity.value = 'warning'
  message.value = ''
  photoSlots.value = []
  error.value = null
}

function backToPicker() {
  kind.value = null
  submitted.value = null
  resetForm()
}

async function handleSubmit() {
  if (!deviceId.value) {
    error.value = 'Lien invalide.'
    return
  }
  if (!kind.value) return
  if (!technicianName.value.trim()) {
    error.value = 'Nom requis.'
    return
  }
  if (!technicianEmail.value.trim() && !technicianPhone.value.trim()) {
    error.value = 'Email ou téléphone requis.'
    return
  }
  submitting.value = true
  error.value = null
  const res = await submitIntervention({
    deviceId: deviceId.value,
    kind: kind.value,
    technicianName: technicianName.value.trim(),
    technicianContact: technicianEmail.value.trim() || null,
    technicianPhone: technicianPhone.value.trim() || null,
    category: isSignalement.value ? 'incident' : category.value,
    severity: isSignalement.value ? severity.value : 'info',
    message: message.value.trim() || null,
    photos: photoSlots.value.map((s) => s.data),
  })
  submitting.value = false
  if (!res.ok) {
    error.value = res.error.message
    return
  }
  submitted.value = res.data.id
}

function submitAnother() {
  submitted.value = null
  resetForm()
}
</script>

<template>
  <main class="min-h-screen relative flex items-center justify-center p-6 overflow-hidden">
    <div class="absolute inset-0 hex-grid" />

    <div class="absolute top-6 left-6 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground flex items-center gap-2">
      <span class="text-signal">⬢</span> Hexa.ai
    </div>
    <button
      class="absolute top-5 right-6 size-8 inline-flex items-center justify-center rounded-md border border-border hover:border-signal/60 text-muted-foreground hover:text-foreground transition"
      @click="toggleTheme"
    >
      <svg v-if="theme === 'dark'" viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
      <svg v-else viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
      </svg>
    </button>

    <div class="relative w-full max-w-[460px] fade-up">
      <div class="mb-7 flex flex-col items-center text-center">
        <img
          :src="theme === 'dark' ? '/hexa-logo-dark.png' : '/hexa-logo-light.png'"
          alt="Hexa.ai"
          class="h-12 w-[180px] object-contain mb-5 select-none"
          draggable="false"
        />
      </div>

      <!-- Step 1: choose kind -->
      <KindPicker v-if="!kind" @select="kind = $event" />

      <!-- Step 2: success screen -->
      <div
        v-else-if="submitted"
        class="border border-signal/40 rounded-lg bg-signal-soft p-7 text-center"
      >
        <div class="font-mono text-[10px] uppercase tracking-[0.3em] text-signal mb-3">
          {{ successLabel }}
        </div>
        <p class="text-sm mb-5">{{ successText }}</p>
        <div class="flex flex-col sm:flex-row gap-2 justify-center">
          <button
            class="font-mono text-[11px] uppercase tracking-[0.22em] border border-signal/40 text-signal px-4 py-2 rounded-md hover:bg-signal-soft transition"
            @click="submitAnother"
          >
            {{ successAgainLabel }}
          </button>
          <button
            class="font-mono text-[11px] uppercase tracking-[0.22em] border border-border text-muted-foreground hover:text-foreground px-4 py-2 rounded-md transition"
            @click="backToPicker"
          >
            Changer de type
          </button>
        </div>
      </div>

      <!-- Step 2: form -->
      <form
        v-else
        class="border border-border rounded-lg bg-card/70 backdrop-blur-sm p-6 space-y-5"
        @submit.prevent="handleSubmit"
      >
        <div class="flex items-center justify-between gap-3">
          <button
            type="button"
            class="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground hover:text-foreground transition inline-flex items-center gap-1"
            @click="backToPicker"
          >
            ← Retour
          </button>
          <span
            :class="[
              'font-mono text-[10px] uppercase tracking-[0.22em] px-2 py-0.5 rounded border',
              isSignalement
                ? 'border-offline/40 text-offline bg-offline/5'
                : 'border-signal/40 text-signal bg-signal/5',
            ]"
          >
            {{ isSignalement ? 'Anomalie' : 'Intervention' }}
          </span>
        </div>

        <div class="space-y-1">
          <h1 class="text-xl font-semibold tracking-tight">{{ headerTitle }}</h1>
          <p class="text-sm text-muted-foreground">{{ headerSubtitle }}</p>
        </div>

        <div class="space-y-1.5">
          <label class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Nom *</label>
          <input
            v-model="technicianName"
            type="text"
            required
            maxlength="120"
            placeholder="Jean Dupont"
            class="w-full bg-transparent border-0 border-b border-border focus:border-signal focus:outline-none px-0 py-2 text-sm font-mono transition"
          />
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="space-y-1.5">
            <label class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Email *</label>
            <input
              v-model="technicianEmail"
              type="email"
              placeholder="vous@exemple.fr"
              class="w-full bg-transparent border-0 border-b border-border focus:border-signal focus:outline-none px-0 py-2 text-sm font-mono transition"
            />
          </div>
          <div class="space-y-1.5">
            <label class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Téléphone *</label>
            <input
              v-model="technicianPhone"
              type="tel"
              placeholder="06 12 34 56 78"
              class="w-full bg-transparent border-0 border-b border-border focus:border-signal focus:outline-none px-0 py-2 text-sm font-mono transition"
            />
          </div>
        </div>
        <p class="font-mono text-[10px] text-muted-foreground/70 -mt-3">
          * Email ou téléphone : au moins un des deux.
        </p>

        <!-- Severity: signalement only -->
        <div v-if="isSignalement" class="space-y-1.5">
          <label class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Gravité</label>
          <div class="grid grid-cols-3 gap-2">
            <button
              v-for="s in SEVERITIES"
              :key="s"
              type="button"
              :class="[
                'font-mono text-[11px] uppercase tracking-[0.18em] px-3 py-2.5 rounded-md border-2 transition inline-flex items-center justify-center gap-1.5',
                severityButtonClass(s, severity === s),
              ]"
              @click="severity = s"
            >
              <span class="text-sm leading-none">{{ SEVERITY_ICON[s] }}</span>
              {{ SEVERITY_LABEL[s] }}
            </button>
          </div>
        </div>

        <!-- Category: intervention only -->
        <div v-else class="space-y-1.5">
          <label class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Catégorie</label>
          <div class="grid grid-cols-3 gap-2">
            <button
              v-for="c in CATEGORIES"
              :key="c.value"
              type="button"
              :class="[
                'font-mono text-[10px] uppercase tracking-[0.18em] px-3 py-2 rounded-md border transition',
                category === c.value
                  ? 'bg-signal text-primary-foreground border-transparent'
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-signal/40',
              ]"
              @click="category = c.value"
            >
              {{ c.label }}
            </button>
          </div>
        </div>

        <div class="space-y-1.5">
          <label class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Commentaire</label>
          <textarea
            v-model="message"
            rows="4"
            maxlength="4000"
            :placeholder="isSignalement ? 'Décrivez l\'anomalie…' : 'Décrivez l\'intervention…'"
            class="w-full bg-transparent border border-border rounded-md focus:border-signal focus:outline-none px-3 py-2 text-sm font-mono transition resize-y"
          />
        </div>

        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <label class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Photos ({{ photoSlots.length }}/{{ MAX_PHOTOS }})
            </label>
            <span v-if="compressing > 0" class="font-mono text-[10px] text-muted-foreground">
              <span class="blink">▍</span> compression…
            </span>
          </div>

          <div class="grid grid-cols-3 sm:grid-cols-5 gap-2">
            <div
              v-for="(p, i) in photoSlots"
              :key="i"
              class="relative aspect-square border border-border rounded-md overflow-hidden bg-card"
            >
              <img :src="p.preview" class="absolute inset-0 w-full h-full object-cover" />
              <button
                type="button"
                class="absolute top-1 right-1 size-5 inline-flex items-center justify-center rounded-full bg-background/80 backdrop-blur text-foreground border border-border hover:text-offline hover:border-offline/60 transition"
                aria-label="Retirer"
                @click="removePhoto(i)"
              >
                <svg viewBox="0 0 24 24" class="size-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
              <span class="absolute bottom-1 left-1 font-mono text-[9px] uppercase tracking-wider bg-background/80 backdrop-blur px-1.5 py-0.5 rounded text-muted-foreground">
                {{ p.sizeKb }} ko
              </span>
            </div>

            <label
              v-if="photoSlots.length < MAX_PHOTOS"
              class="aspect-square border-2 border-dashed border-border rounded-md flex flex-col items-center justify-center text-muted-foreground hover:border-signal/60 hover:text-signal cursor-pointer transition"
            >
              <svg viewBox="0 0 24 24" class="size-6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2z" />
                <circle cx="9" cy="9" r="2" />
                <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
              </svg>
              <span class="mt-1.5 font-mono text-[10px] uppercase tracking-wider">Ajouter</span>
              <input
                type="file"
                accept="image/*"
                multiple
                capture="environment"
                class="hidden"
                @change="onPhotoSelect"
              />
            </label>
          </div>
          <p class="font-mono text-[10px] text-muted-foreground/70">
            Les photos sont compressées localement avant l'envoi (max {{ MAX_PHOTOS }}, 1600px).
          </p>
        </div>

        <p v-if="error" class="font-mono text-xs text-offline flex items-center gap-2">
          <span class="size-1.5 rounded-full bg-offline" /> ERR · {{ error }}
        </p>

        <button
          type="submit"
          :disabled="submitting"
          class="w-full bg-signal text-primary-foreground font-semibold py-3 rounded-md transition disabled:opacity-60 disabled:cursor-not-allowed hover:brightness-110 glow-signal"
        >
          <span class="font-mono text-[11px] uppercase tracking-[0.22em]">
            <template v-if="submitting"><span class="blink">▍</span> envoi…</template>
            <template v-else>{{ submitLabel }}</template>
          </span>
        </button>
      </form>
    </div>
  </main>
</template>

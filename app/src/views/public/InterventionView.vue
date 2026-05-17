<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { submitIntervention, type InterventionPhotoInput } from '@/lib/api'
import { useTheme } from '@/composables/useTheme'
import { severityButtonClass, SEVERITY_ICON, SEVERITY_LABEL, type Severity } from '@/lib/utils'
import { compressImage } from '@/lib/image'

const MAX_PHOTOS = 5

const route = useRoute()
const { theme, toggle: toggleTheme } = useTheme()

const deviceId = computed(() => String(route.query.d ?? ''))

const technicianName = ref('')
const technicianContact = ref('')
const category = ref<'intervention' | 'incident' | 'controle' | 'autre'>('intervention')
const severity = ref<'info' | 'warning' | 'error'>('info')
const message = ref('')

const submitting = ref(false)
const submitted = ref<string | null>(null) // intervention id
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
  input.value = '' // allow selecting the same file twice
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
  { value: 'incident', label: 'Incident' },
  { value: 'controle', label: 'Contrôle' },
  { value: 'autre', label: 'Autre' },
] as const
const SEVERITIES: readonly Severity[] = ['info', 'warning', 'error'] as const

async function handleSubmit() {
  if (!deviceId.value) {
    error.value = 'Lien invalide.'
    return
  }
  submitting.value = true
  error.value = null
  const res = await submitIntervention({
    deviceId: deviceId.value,
    technicianName: technicianName.value,
    technicianContact: technicianContact.value || null,
    category: category.value,
    severity: severity.value,
    message: message.value || null,
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
  message.value = ''
  photoSlots.value = []
}
</script>

<template>
  <main class="min-h-screen relative flex items-center justify-center p-6 overflow-hidden">
    <div class="absolute inset-0 hex-grid" />

    <div class="absolute top-6 left-6 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground flex items-center gap-2">
      <span class="text-signal">⬢</span> Hexa.ai · intervention
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
        <div class="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2">
          Rapport d'intervention
        </div>
        <h1 class="text-2xl font-semibold tracking-tight">
          Signaler une <span class="text-signal">intervention</span>
        </h1>
        <p v-if="!submitted" class="mt-2 text-sm text-muted-foreground">
          Remplissez ce formulaire pour journaliser votre passage sur cet équipement.
        </p>
      </div>

      <div
        v-if="submitted"
        class="border border-signal/40 rounded-lg bg-signal-soft p-7 text-center"
      >
        <div class="font-mono text-[10px] uppercase tracking-[0.3em] text-signal mb-3">
          ✓ Intervention enregistrée
        </div>
        <p class="text-sm mb-5">
          Merci, votre rapport a été transmis à l'équipe.
        </p>
        <button
          class="font-mono text-[11px] uppercase tracking-[0.22em] border border-signal/40 text-signal px-4 py-2 rounded-md hover:bg-signal-soft transition"
          @click="submitAnother"
        >
          Nouveau rapport
        </button>
      </div>

      <form
        v-else
        class="border border-border rounded-lg bg-card/70 backdrop-blur-sm p-6 space-y-5"
        @submit.prevent="handleSubmit"
      >
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

        <div class="space-y-1.5">
          <label class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Téléphone ou email</label>
          <input
            v-model="technicianContact"
            type="text"
            placeholder="06 12 34 56 78 ou tech@exemple.fr"
            class="w-full bg-transparent border-0 border-b border-border focus:border-signal focus:outline-none px-0 py-2 text-sm font-mono transition"
          />
        </div>

        <div class="space-y-1.5">
          <label class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Catégorie</label>
          <div class="grid grid-cols-2 gap-2">
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
          <label class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Sévérité</label>
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

        <div class="space-y-1.5">
          <label class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Commentaire</label>
          <textarea
            v-model="message"
            rows="4"
            maxlength="4000"
            placeholder="Décrivez l'intervention…"
            class="w-full bg-transparent border border-border rounded-md focus:border-signal focus:outline-none px-3 py-2 text-sm font-mono transition resize-y"
          />
        </div>

        <!-- Photos -->
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
            <template v-else>Envoyer le rapport</template>
          </span>
        </button>
      </form>
    </div>
  </main>
</template>

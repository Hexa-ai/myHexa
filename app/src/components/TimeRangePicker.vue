<script setup lang="ts">
// Bouton horloge : choix d'une plage de temps précise (du … au …), en heure locale
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{ from: number; to: number; active?: boolean }>()
const emit = defineEmits<{ apply: [r: { from: number; to: number }] }>()

const open = ref(false)
const root = ref<HTMLElement | null>(null)
const a = ref('')
const b = ref('')
const err = ref('')

const pad = (n: number) => String(n).padStart(2, '0')
const toLocal = (t: number) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const fromLocal = (s: string) => (s ? new Date(s).getTime() : NaN)

function toggle() {
  open.value = !open.value
  if (open.value) {
    a.value = toLocal(props.from)
    b.value = toLocal(Math.min(props.to, Date.now()))
    err.value = ''
  }
}
watch([a, b], () => (err.value = ''))

/** raccourcis : hier, semaine dernière, mois dernier (bornes calendaires) */
function quick(k: 'yesterday' | 'lastweek' | 'lastmonth') {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  let s: Date, e: Date
  if (k === 'yesterday') {
    e = new Date(d)
    s = new Date(d)
    s.setDate(s.getDate() - 1)
  } else if (k === 'lastweek') {
    const dow = (d.getDay() + 6) % 7 // lundi = 0
    e = new Date(d)
    e.setDate(e.getDate() - dow)
    s = new Date(e)
    s.setDate(s.getDate() - 7)
  } else {
    e = new Date(d.getFullYear(), d.getMonth(), 1)
    s = new Date(d.getFullYear(), d.getMonth() - 1, 1)
  }
  a.value = toLocal(s.getTime())
  b.value = toLocal(e.getTime())
}

const span = computed(() => {
  const ms = fromLocal(b.value) - fromLocal(a.value)
  if (!(ms > 0)) return ''
  const h = ms / 36e5
  return h < 48 ? `${Math.round(h * 10) / 10} h` : `${Math.round((h / 24) * 10) / 10} jours`
})

function apply() {
  const f = fromLocal(a.value)
  const t = fromLocal(b.value)
  if (!Number.isFinite(f) || !Number.isFinite(t)) return (err.value = 'Dates incomplètes')
  if (t <= f) return (err.value = 'La fin doit être après le début')
  if (t - f > 5 * 366 * 864e5) return (err.value = 'Plage limitée à 5 ans')
  emit('apply', { from: f, to: t })
  open.value = false
}

function onDoc(e: MouseEvent) {
  if (open.value && root.value && !root.value.contains(e.target as Node)) open.value = false
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') open.value = false
}
onMounted(() => {
  document.addEventListener('mousedown', onDoc)
  document.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDoc)
  document.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div ref="root" class="relative inline-block">
    <button
      type="button"
      :class="[
        'inline-flex items-center justify-center size-[30px] rounded-sm border transition',
        active
          ? 'bg-signal text-primary-foreground border-signal'
          : 'border-border bg-card text-muted-foreground hover:text-foreground hover:border-signal/60',
      ]"
      title="Choisir une plage de temps précise"
      aria-label="Plage de temps précise"
      data-testid="range-picker"
      @click="toggle"
    >
      <svg
        viewBox="0 0 24 24"
        class="size-4"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
      >
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5V12l3 2" />
      </svg>
    </button>
    <div
      v-if="open"
      class="absolute z-40 mt-1 right-0 sm:left-0 sm:right-auto w-[290px] bg-background border border-border rounded-md shadow-lg p-3 space-y-2.5"
      data-testid="range-popover"
    >
      <div class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        Plage précise
      </div>
      <label class="block text-xs">
        <span class="text-muted-foreground">Du</span>
        <input
          v-model="a"
          type="datetime-local"
          class="mt-0.5 w-full bg-card border border-border rounded px-2 py-1 text-sm"
          data-testid="range-from"
        />
      </label>
      <label class="block text-xs">
        <span class="text-muted-foreground">Au</span>
        <input
          v-model="b"
          type="datetime-local"
          class="mt-0.5 w-full bg-card border border-border rounded px-2 py-1 text-sm"
          data-testid="range-to"
        />
      </label>
      <div class="flex flex-wrap gap-1">
        <button
          class="text-[11px] px-2 py-0.5 rounded border border-border hover:border-signal/60"
          @click="quick('yesterday')"
        >
          Hier
        </button>
        <button
          class="text-[11px] px-2 py-0.5 rounded border border-border hover:border-signal/60"
          @click="quick('lastweek')"
        >
          Semaine dernière
        </button>
        <button
          class="text-[11px] px-2 py-0.5 rounded border border-border hover:border-signal/60"
          @click="quick('lastmonth')"
        >
          Mois dernier
        </button>
      </div>
      <p v-if="err" class="text-xs text-offline" data-testid="range-error">{{ err }}</p>
      <div class="flex items-center justify-between pt-1">
        <span class="text-[11px] text-muted-foreground font-mono">{{ span }}</span>
        <button
          class="text-xs font-mono uppercase tracking-wider px-3 py-1 rounded bg-signal text-primary-foreground"
          data-testid="range-apply"
          @click="apply"
        >
          Appliquer
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Mode DIRECT — commande au niveau du tableau de bord : un seul « œil » pour toutes les box du tableau.
// Invisible tant qu'aucune box du tableau n'annonce la capacité direct (aucune différence visuelle pour les autres).
import { computed } from 'vue'
import { useLiveStore } from '@/stores/live'

const props = defineProps<{
  /** box du tableau de bord */
  deviceIds: string[]
  /** affichage permanent actif sur ce tableau (écran mural) : pas d'œil, pastille « permanent » */
  permanent?: boolean
}>()

const live = useLiveStore()
const visible = computed(() => live.anyCapable(props.deviceIds))
const on = computed(() => live.mode !== 'off')

function toggle() {
  if (on.value) live.stop()
  else live.start(props.deviceIds, 'fast')
}

const age = computed(() => {
  const s = live.ageS
  if (s === null) return '—'
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min`
})
const remaining = computed(() => {
  const ms = live.remainingMs
  if (ms === null) return ''
  const s = Math.ceil(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
})
const label = computed(() => {
  switch (live.uiState) {
    case 'live':
      return 'Direct'
    case 'connecting':
      return 'Direct…'
    case 'paused':
      return 'Direct en pause'
    case 'degraded':
      return 'Direct indisponible'
    case 'expired':
      return 'Direct arrêté'
    default:
      return ''
  }
})
</script>

<template>
  <div v-if="visible" class="inline-flex items-center gap-2" data-testid="live-control">
    <!-- affichage permanent : réglé par un admin sur le tableau, aucun bouton -->
    <span
      v-if="permanent"
      class="inline-flex items-center gap-1.5 rounded border border-signal/50 px-2.5 py-1.5 text-xs font-mono uppercase tracking-wider text-signal"
      title="Affichage permanent : valeurs mises à jour toutes les ~10 s, sans limite de durée"
      data-testid="live-permanent"
    >
      <span :class="['live-dot', live.uiState === 'live' ? '' : 'is-off']" aria-hidden="true" />
      Direct · permanent
      <span v-if="live.uiState === 'live'" class="normal-case tracking-normal text-muted-foreground"
        >{{ age }}</span
      >
    </span>
    <template v-else>
      <button
        type="button"
        :class="[
          'inline-flex items-center justify-center gap-1.5 h-[30px] rounded border px-2 text-xs font-mono uppercase tracking-wider',
          on
            ? 'border-signal text-signal'
            : 'border-border text-muted-foreground hover:border-signal/60 hover:text-foreground',
        ]"
        :aria-pressed="on"
        :aria-label="on ? 'Arrêter le direct' : 'Passer en direct'"
        :title="
          on
            ? 'Arrêter le direct (retour aux valeurs toutes les 30 min)'
            : 'Direct : valeurs toutes les 1 à 2 s pendant 15 min (sinon : relevé toutes les 30 min)'
        "
        data-testid="live-eye"
        @click="toggle"
      >
        <svg
          viewBox="0 0 24 24"
          class="size-4"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path v-if="on" d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
          <path v-else d="M3 3l18 18M10.6 5.1A9.8 9.8 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.5 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7c1.7 0 3.2-.4 4.5-1" />
          <circle v-if="on" cx="12" cy="12" r="3" fill="currentColor" />
        </svg>
        <template v-if="on">
          <span :class="['live-dot', live.uiState === 'live' ? '' : 'is-off']" aria-hidden="true" />
          <span data-testid="live-label">{{ label }}</span>
        </template>
        <span v-else class="hidden sm:inline">Direct</span>
      </button>
      <span
        v-if="on && live.uiState === 'live'"
        class="text-[11px] font-mono text-muted-foreground whitespace-nowrap"
        :title="`Dernière valeur reçue il y a ${age} · direct rapide, arrêt dans ${remaining}`"
        data-testid="live-age"
      >
        {{ age }} <span class="hidden sm:inline">· {{ remaining }}</span>
      </span>
    </template>
  </div>
</template>

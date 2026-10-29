<script setup lang="ts">
// Mode DIRECT — messages sous l'en-tête du tableau : « Continuer le direct ? » à la fin des 15 min,
// et message discret quand la connexion directe tombe (retour aux valeurs 30 min).
import { useLiveStore } from '@/stores/live'
import { FAST_DURATION_MS } from '@/lib/live'

const live = useLiveStore()
const minutes = Math.max(1, Math.round(FAST_DURATION_MS / 60_000))
</script>

<template>
  <div
    v-if="live.uiState === 'expired'"
    class="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-signal/50 bg-card/60 px-3 py-2 text-sm"
    role="status"
    data-testid="live-continue"
  >
    <span class="live-dot is-off" aria-hidden="true" />
    <span
      >Le direct s'est arrêté après {{ minutes }} min. <strong>Continuer le direct ?</strong></span
    >
    <span class="ml-auto flex gap-2">
      <button
        type="button"
        class="text-xs font-mono uppercase tracking-wider px-3 py-1.5 rounded border border-signal bg-signal text-primary-foreground"
        data-testid="live-continue-yes"
        @click="live.continueLive()"
      >
        Continuer
      </button>
      <button
        type="button"
        class="text-xs font-mono uppercase tracking-wider px-3 py-1.5 rounded border border-border hover:border-signal/60"
        data-testid="live-continue-no"
        @click="live.stop()"
      >
        Arrêter
      </button>
    </span>
  </div>
  <p
    v-else-if="live.uiState === 'degraded'"
    class="mb-4 text-xs text-muted-foreground"
    role="status"
    data-testid="live-degraded"
  >
    Connexion directe indisponible : les valeurs reviennent aux relevés toutes les 30 min. Nouvelle
    tentative automatique.
  </p>
</template>

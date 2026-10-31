<script setup lang="ts">
// Boutons de mise en page de l'éditeur : volet gauche, volet droit, focus dessin, plein écran. Posé en haut à gauche du dessin.
import type { PanneauxEditeur } from '@/composables/usePanneauxEditeur'

defineProps<{ p: PanneauxEditeur }>()
</script>

<template>
  <div class="ed-volets-barre" role="toolbar" aria-label="Mise en page de l'éditeur" data-testid="volets-barre" @pointerdown.stop>
    <button
      type="button" class="ed-volet-btn" data-testid="volet-bascule-gauche" :aria-pressed="p.gaucheOuvert.value"
      :aria-label="p.gaucheOuvert.value ? 'Replier la palette' : 'Déplier la palette'" :title="`${p.gaucheOuvert.value ? 'Replier' : 'Déplier'} la palette ( [ ou Ctrl+B )`"
      @click="p.basculerGauche()"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M9 5v14" /><path :d="p.gaucheOuvert.value ? 'M16 9l-3 3 3 3' : 'M13 9l3 3-3 3'" /></svg>
    </button>
    <button
      type="button" class="ed-volet-btn" data-testid="volet-focus" :aria-pressed="p.focusDessin.value"
      aria-label="Focus dessin (replier les deux volets)" title="Focus dessin : replie ou rouvre les deux volets ( Ctrl+Maj+B )"
      @click="p.basculerFocus()"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
    </button>
    <button
      type="button" class="ed-volet-btn" data-testid="volet-plein-ecran" :aria-pressed="p.pleinEcran.value"
      :aria-label="p.pleinEcran.value ? 'Quitter le plein écran' : 'Plein écran'" :title="`${p.pleinEcran.value ? 'Quitter le' : 'Passer en'} plein écran ( F ou F11 )`"
      @click="p.basculerPleinEcran()"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path v-if="!p.pleinEcran.value" d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
        <path v-else d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5" />
      </svg>
    </button>
    <button
      type="button" class="ed-volet-btn" data-testid="volet-bascule-droite" :aria-pressed="p.droiteOuvert.value"
      :aria-label="p.droiteOuvert.value ? 'Replier les propriétés' : 'Déplier les propriétés'" :title="`${p.droiteOuvert.value ? 'Replier' : 'Déplier'} les propriétés ( ] ou Ctrl+Alt+B )`"
      @click="p.basculerDroite()"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M15 5v14" /><path :d="p.droiteOuvert.value ? 'M8 9l3 3-3 3' : 'M11 9l-3 3 3 3'" /></svg>
    </button>
  </div>
</template>

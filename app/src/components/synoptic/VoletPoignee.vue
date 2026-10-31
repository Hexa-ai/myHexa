<script setup lang="ts">
// Poignée de redimensionnement d'un volet de l'éditeur (palette ou propriétés) : souris (glisser, double clic = largeur par défaut) et clavier (← →, Origine).
// À poser entre le volet et le dessin ; l'état vient du composable usePanneauxEditeur.
import type { CotePanneau, PanneauxEditeur } from '@/composables/usePanneauxEditeur'

const props = defineProps<{ p: PanneauxEditeur; cote: CotePanneau }>()
const largeur = () => (props.cote === 'gauche' ? props.p.largeurGauche.value : props.p.largeurDroite.value)
const ouvert = () => (props.cote === 'gauche' ? props.p.gaucheOuvert.value : props.p.droiteOuvert.value)
</script>

<template>
  <div
    v-show="ouvert()"
    class="ed-volet-poignee"
    :class="[cote, { actif: p.redimension.value === cote }]"
    role="separator"
    aria-orientation="vertical"
    tabindex="0"
    :aria-label="cote === 'gauche' ? 'Largeur de la palette' : 'Largeur des propriétés'"
    :aria-valuenow="largeur()"
    :aria-valuemin="p.limites[cote].min"
    :aria-valuemax="p.limites[cote].max"
    :data-testid="`volet-poignee-${cote}`"
    title="Glisser pour redimensionner · double clic : largeur par défaut"
    @pointerdown.stop="p.demarrerRedim(cote, $event)"
    @dblclick.stop="p.reinitialiserLargeur(cote)"
    @keydown="p.toucheRedim(cote, $event)"
  />
</template>

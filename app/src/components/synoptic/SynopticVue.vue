<script setup lang="ts">
// Dessin d'un synoptique en consultation : vue 2D (moteur historique) ou vue isométrique, selon ce que contient le document.
// Un document sans section `iso` donne exactement le dessin d'avant ; avec les deux vues, une bascule « 2D | Iso » apparaît
// (la vue enregistrée dans le document est celle d'ouverture).
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import type { CatalogueVariable, SynopticDocument, SynopticEtat } from '@/lib/synoptic/engine/types'
import { vueInitiale, vuesDisponibles, type VueSynoptique } from '@/lib/synoptic/iso/format'
import SynopticCanvas from './SynopticCanvas.vue'

// la bibliothèque iso est volumineuse : chargée seulement pour les synoptiques qui ont une vue iso
const SynopticIso = defineAsyncComponent(() => import('./SynopticIso.vue'))

const props = withDefaults(
  defineProps<{
    doc: SynopticDocument
    values: Record<string, number>
    catalogue?: CatalogueVariable[]
    fullFrame?: boolean
    gestes?: boolean
    mobile?: boolean
    cadre?: { x: number; y: number; w: number; h: number } | null
    /** cadrage enregistré de la vue 2D (rectangle du dessin en fractions) */
    vue?: { x: number; y: number; w: number; h: number } | null
  }>(),
  { catalogue: () => [], gestes: true, cadre: null, vue: null },
)
const emit = defineEmits<{
  (e: 'etat', etat: SynopticEtat): void
  (e: 'vue', vue: { x: number; y: number; w: number; h: number }): void
}>()

const dispo = computed(() => vuesDisponibles(props.doc))
const choisie = ref<VueSynoptique>(vueInitiale(props.doc))
// nouveau document (autre version) : on repart de la vue enregistrée
watch(
  () => props.doc,
  (d) => {
    if (!vuesDisponibles(d).includes(choisie.value)) choisie.value = vueInitiale(d)
  },
)
const actif = computed<VueSynoptique>(() => (dispo.value.includes(choisie.value) ? choisie.value : dispo.value[0]))
</script>

<template>
  <div class="relative h-full w-full min-h-0" data-testid="synoptic-vue" :data-vue="actif">
    <SynopticIso
      v-if="actif === 'iso' && doc.iso"
      :iso="doc.iso"
      :values="values"
      :full-frame="fullFrame"
      :gestes="gestes"
      :mobile="mobile"
      @etat="emit('etat', $event)"
    />
    <SynopticCanvas
      v-else
      :doc="doc"
      :values="values"
      :catalogue="catalogue"
      :full-frame="fullFrame"
      :gestes="gestes"
      :mobile="mobile"
      :cadre="cadre"
      :vue="vue"
      @etat="emit('etat', $event)"
      @vue="emit('vue', $event)"
    />
    <div
      v-if="dispo.length > 1"
      class="absolute z-10 flex rounded border border-border bg-background/85 p-0.5 backdrop-blur"
      style="top: max(8px, env(safe-area-inset-top)); right: max(8px, env(safe-area-inset-right))"
      role="tablist"
      aria-label="Vue du synoptique"
      data-testid="synoptic-bascule"
    >
      <button
        v-for="v in dispo"
        :key="v"
        type="button"
        role="tab"
        :aria-selected="actif === v"
        class="rounded-sm px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider"
        :class="actif === v ? 'bg-signal/15 text-signal' : 'text-muted-foreground hover:text-foreground'"
        :data-testid="`synoptic-bascule-${v}`"
        @click="choisie = v"
      >
        {{ v === 'iso' ? 'Iso' : '2D' }}
      </button>
    </div>
  </div>
</template>

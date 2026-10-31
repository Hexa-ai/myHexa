<script setup lang="ts">
// Dessin du synoptique : le squelette DOM attendu par le moteur (zone de dessin, palette, propriétés, légende, zoom)
// + le cycle de vie d'une instance du moteur. Utilisé par la tuile, la vue agrandie et l'éditeur.
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { creerSynoptique } from '@/lib/synoptic/engine/moteur'
import type {
  CatalogueVariable,
  SynopticDocument,
  SynopticEtat,
  SynopticInstance,
} from '@/lib/synoptic/engine/types'
import '@/lib/synoptic/engine/synoptique.css'
import '@/lib/synoptic/engine/adaptation.css'

const props = withDefaults(
  defineProps<{
    doc: SynopticDocument
    values: Record<string, number>
    catalogue?: CatalogueVariable[]
    /** true = éditeur (palette, propriétés, outils) ; false = consultation */
    editing?: boolean
    /** vrai quand le synoptique occupe toute la zone (vue agrandie, éditeur) */
    fullFrame?: boolean
    /** false = consultation sans geste (tuile de tablette : la page garde ses gestes) ; vrai par défaut */
    gestes?: boolean
    /** plein écran mobile : boutons de zoom adaptés au doigt */
    mobile?: boolean
    /** zone du dessin sur laquelle cadrer la vue à l'ouverture (sinon : tout le dessin) */
    cadre?: { x: number; y: number; w: number; h: number } | null
    /** cadrage enregistré (rectangle du dessin en fractions) : la vue suit la taille de la tuile ; absent = tout le dessin */
    vue?: { x: number; y: number; w: number; h: number } | null
  }>(),
  { catalogue: () => [], gestes: true, cadre: null, vue: null },
)
const emit = defineEmits<{
  (e: 'save', doc: SynopticDocument): void
  (e: 'etat', etat: SynopticEtat): void
  /** la vue a changé (geste, zoom, taille de la tuile) : rectangle visible en fractions du dessin */
  (e: 'vue', vue: { x: number; y: number; w: number; h: number }): void
}>()

const root = ref<HTMLElement | null>(null)
const inst = shallowRef<SynopticInstance | null>(null)

function creer() {
  if (!root.value) return
  inst.value?.destroy()
  inst.value = creerSynoptique(root.value, {
    doc: props.doc,
    catalogue: props.catalogue,
    values: props.values,
    pleinCadre: props.fullFrame,
    gestes: props.gestes,
    cadreVue: props.vue,
    host: {
      onSave: (d) => emit('save', d),
      onEtat: (e) => emit('etat', e),
      onVue: (v) => emit('vue', v),
    },
  })
  if (props.editing) inst.value.mode(true)
  // cadrage sur un ouvrage : après la mise en page (le moteur ajuste d'abord tout le dessin)
  const cadre = props.cadre
  if (cadre) requestAnimationFrame(() => inst.value?.cadrer(cadre))
}
onMounted(creer)
onBeforeUnmount(() => inst.value?.destroy())

// nouveau document (autre version) ou changement de mode : on repart d'une instance neuve
watch(() => props.doc, creer)
watch(() => props.editing, creer)
// cadrage modifié (réglage de la tuile) : on l'applique sans recréer le dessin
watch(
  () => props.vue,
  (v) => inst.value?.definirVue(v ?? null),
)
watch(
  () => props.values,
  (v) => inst.value?.setValues(v),
)
watch(
  () => props.catalogue,
  (c) => inst.value?.setCatalogue(c ?? []),
)

defineExpose({
  /** instance du moteur (getDoc, marquerEnregistre, annuler…) */
  instance: inst,
})
</script>

<template>
  <div
    ref="root"
    class="syn-root"
    :class="{
      'syn-plein': fullFrame,
      'syn-sans-geste': gestes === false,
      'syn-mobile': mobile,
    }"
    data-testid="synoptic-root"
  >
    <div id="edbar" class="edbar" hidden />
    <div class="synbody sans-verif">
      <aside id="palette" class="ed-palette" aria-label="Palette de symboles" hidden />
      <svg id="scene" role="img" aria-label="Synoptique du procédé" />
      <aside id="proprietes" class="ed-props" aria-label="Propriétés" hidden />
      <div class="legende">
        <span id="leg-couleurs" style="display: contents" />
        <span class="ed-only"><i class="pastille-verif" />À vérifier</span>
        <span><i class="pastille-inconnu" />État inconnu</span>
      </div>
      <div class="zoomb">
        <button id="z-plus" type="button" aria-label="Zoom avant">+</button>
        <button id="z-moins" type="button" aria-label="Zoom arrière">−</button>
        <button id="z-fit" type="button" aria-label="Ajuster">⤢</button>
      </div>
    </div>
    <div class="synfoot" hidden><span id="pied-info" class="mono" /></div>
  </div>
</template>

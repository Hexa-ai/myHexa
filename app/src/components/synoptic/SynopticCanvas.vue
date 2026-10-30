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

const props = defineProps<{
  doc: SynopticDocument
  values: Record<string, number>
  catalogue?: CatalogueVariable[]
  /** true = éditeur (palette, propriétés, outils) ; false = consultation */
  editing?: boolean
  /** vrai quand le synoptique occupe toute la zone (vue agrandie, éditeur) */
  fullFrame?: boolean
}>()
const emit = defineEmits<{
  (e: 'save', doc: SynopticDocument): void
  (e: 'etat', etat: SynopticEtat): void
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
    host: {
      onSave: (d) => emit('save', d),
      onEtat: (e) => emit('etat', e),
    },
  })
  if (props.editing) inst.value.mode(true)
}
onMounted(creer)
onBeforeUnmount(() => inst.value?.destroy())

// nouveau document (autre version) ou changement de mode : on repart d'une instance neuve
watch(() => props.doc, creer)
watch(() => props.editing, creer)
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
  <div ref="root" class="syn-root" :class="{ 'syn-plein': fullFrame }" data-testid="synoptic-root">
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

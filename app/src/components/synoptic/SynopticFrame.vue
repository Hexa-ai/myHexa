<script setup lang="ts">
// Pose son contenu sur toute la zone de contenu de l'application (au-dessus du tableau), sans API Fullscreen :
// le menu latéral et l'en-tête restent en place. Échap appelle `close`.
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useAppFrame } from '@/composables/useAppFrame'

const props = defineProps<{
  /** Q7 : vrai = plein écran (API Fullscreen) : le cadre prend tout l'écran au lieu de la zone de contenu */
  plein?: boolean
  /** vrai = posé à sa place dans le DOM (pages routées : la transition de page n'aime pas les Teleport) ; faux = sur <body> */
  enligne?: boolean
}>()
const emit = defineEmits<{ (e: 'close'): void }>()
const { style: styleZone, suivre } = useAppFrame()
const style = computed(() => (props.plein ? { position: 'fixed', inset: '0' } : styleZone.value))

function touche(ev: KeyboardEvent) {
  if (ev.key !== 'Escape' || ev.defaultPrevented) return
  // Échap sert d'abord à fermer une fenêtre ou annuler un outil du synoptique
  if (document.querySelector('.syn-root .voile, .syn-root .ed-popup')) return
  emit('close')
}
onMounted(() => {
  suivre()
  window.addEventListener('keydown', touche)
})
onBeforeUnmount(() => window.removeEventListener('keydown', touche))
</script>

<template>
  <div
    v-if="enligne"
    class="z-[500] bg-background flex flex-col"
    :style="style"
    data-testid="synoptic-frame"
  >
    <slot />
  </div>
  <Teleport v-else to="body">
    <div class="z-[500] bg-background flex flex-col" :style="style" data-testid="synoptic-frame">
      <slot />
    </div>
  </Teleport>
</template>

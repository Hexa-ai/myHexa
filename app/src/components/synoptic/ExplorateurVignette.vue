<script setup lang="ts">
// Vignette paresseuse de l'explorateur : le SVG n'est fabriqué que lorsque la case approche de l'écran (plus de 250 symboles à afficher).
import { onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps<{
  /** fabrique le contenu SVG (appelée une seule fois, quand la case devient visible) */
  fabrique: () => string
  /** vrai pour un pictogramme 2D (24 × 24, trait) : enveloppé dans un <svg> */
  pictogramme?: boolean
}>()

const racine = ref<HTMLElement | null>(null)
const html = ref('')
const pret = ref(false)
let obs: IntersectionObserver | null = null

function afficher() {
  if (pret.value) return
  pret.value = true
  html.value = props.fabrique()
  obs?.disconnect()
}

onMounted(() => {
  // sans IntersectionObserver (tests jsdom, vieux navigateurs) : on dessine tout de suite
  if (typeof IntersectionObserver === 'undefined' || !racine.value) return afficher()
  obs = new IntersectionObserver((l) => l.some((x) => x.isIntersecting) && afficher(), { rootMargin: '240px' })
  obs.observe(racine.value)
})
onBeforeUnmount(() => obs?.disconnect())
</script>

<template>
  <span ref="racine" class="expl-vign" :class="{ pret, picto: pictogramme }" aria-hidden="true">
    <svg v-if="pictogramme && pret" viewBox="0 0 24 24" v-html="html" />
    <span v-else-if="pret" class="expl-vign-iso" v-html="html" />
  </span>
</template>

<style>
.expl-vign { display: grid; place-items: center; width: 100%; height: 100%; }
.expl-vign:not(.pret) { background: linear-gradient(110deg, transparent 30%, color-mix(in oklab, var(--muted, #888) 18%, transparent) 50%, transparent 70%) 0 0 / 200% 100%; border-radius: 6px; }
.expl-vign.picto svg { width: 62%; height: 62%; fill: none; stroke: currentColor; stroke-width: 1.3; }
.expl-vign-iso { display: block; width: 100%; height: 100%; }
.expl-vign-iso > svg { width: 100%; height: 100%; }
</style>

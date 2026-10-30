<script setup lang="ts">
// Logo de l'entreprise (recadré), cliquable vers son site web (nouvel onglet). En thème sombre sans variante sombre :
// posé sur une plaque claire pour rester lisible.
import { ref, watch } from 'vue'
import { trimmedLogo, useBrand } from '@/composables/useBrand'

defineProps<{ heightClass?: string; testid?: string }>()
const { brand, logo, needsPlate } = useBrand()
const src = ref<string | null>(null)
watch(
  logo,
  async (u) => {
    src.value = null
    if (u) src.value = await trimmedLogo(u)
  },
  { immediate: true },
)
</script>

<template>
  <component
    :is="brand?.website ? 'a' : 'span'"
    v-if="brand && src"
    :href="brand.website ?? undefined"
    :target="brand.website ? '_blank' : undefined"
    :rel="brand.website ? 'noopener noreferrer' : undefined"
    :title="brand.website ? `Site de ${brand.name}` : brand.name"
    :class="['inline-flex items-center shrink-0', needsPlate && 'bg-white rounded-md px-2 py-1']"
    :data-testid="testid ?? 'brand-logo'"
  >
    <img
      :src="src"
      :alt="brand.name"
      :class="[heightClass ?? 'h-10', 'w-auto max-w-[180px] object-contain select-none']"
      draggable="false"
    />
  </component>
</template>

<script setup lang="ts">
// Barre d'en-tête d'un synoptique (tuile, vue agrandie, éditeur) : titre, âge de la donnée, alarmes, actions à droite.
import { computed } from 'vue'
import { formatRelative } from '@/lib/utils'

const props = defineProps<{
  titre: string
  enDirect: boolean
  recu: string | null
  alarmes: number
}>()
const age = computed(() => (props.recu ? formatRelative(props.recu) : null))
</script>

<template>
  <div class="flex items-center gap-2 px-3 py-2 border-b border-border min-w-0 flex-wrap">
    <h3 class="text-sm font-medium tracking-tight truncate min-w-0">{{ titre }}</h3>
    <span
      v-if="enDirect"
      class="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-signal"
      data-testid="synoptic-age"
    >
      <span class="size-1.5 rounded-full bg-signal animate-pulse" />Direct
    </span>
    <span
      v-else
      class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
      data-testid="synoptic-age"
      >{{ age ? `Données ${age} · cadence 30 min` : 'Aucune donnée reçue' }}</span
    >
    <span
      v-if="alarmes"
      class="font-mono text-[10px] uppercase tracking-widest text-destructive"
      data-testid="synoptic-alarmes"
      >{{ alarmes }} alarme{{ alarmes > 1 ? 's' : '' }}</span
    >
    <span class="flex-1" />
    <slot />
  </div>
</template>

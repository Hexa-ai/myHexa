<script setup lang="ts">
import type { InterventionKind } from '@/lib/api'

defineProps<{ deviceName?: string | null }>()
const emit = defineEmits<{ select: [kind: InterventionKind] }>()
</script>

<template>
  <div class="space-y-6">
    <header class="space-y-1">
      <h1 class="text-2xl font-semibold tracking-tight">
        <span class="text-signal">⬢</span> Que voulez-vous faire ?
      </h1>
      <p v-if="deviceName" class="text-sm text-muted-foreground">
        Équipement : <span class="font-mono">{{ deviceName }}</span>
      </p>
    </header>

    <div class="grid sm:grid-cols-2 gap-3">
      <button
        type="button"
        class="border border-border rounded-md bg-card/40 p-5 text-left hover:border-offline/60 hover:bg-offline/5 transition"
        @click="emit('select', 'signalement')"
      >
        <div class="flex items-center gap-2 mb-2">
          <span class="text-2xl">⚠</span>
          <span class="font-semibold tracking-tight">Signaler une anomalie</span>
        </div>
        <p class="text-sm text-muted-foreground">
          Vous avez constaté un problème sur cet équipement et souhaitez le remonter.
        </p>
      </button>

      <button
        type="button"
        class="border border-border rounded-md bg-card/40 p-5 text-left hover:border-signal/60 hover:bg-signal/5 transition"
        @click="emit('select', 'intervention')"
      >
        <div class="flex items-center gap-2 mb-2">
          <span class="text-2xl">🔧</span>
          <span class="font-semibold tracking-tight">Consigner une intervention</span>
        </div>
        <p class="text-sm text-muted-foreground">
          Vous êtes intervenu sur cet équipement et souhaitez journaliser l'action.
        </p>
      </button>
    </div>
  </div>
</template>

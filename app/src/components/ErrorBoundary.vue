<script setup lang="ts">
import { onErrorCaptured, ref } from 'vue'

const err = ref<Error | null>(null)

onErrorCaptured((e) => {
  err.value = e as Error
  if (import.meta.env.DEV) console.error('[ErrorBoundary]', e)
  return false
})

function reload() {
  window.location.reload()
}
</script>

<template>
  <div v-if="err" class="min-h-screen flex items-center justify-center p-8 hex-grid">
    <div class="w-full max-w-md text-center border border-border rounded-lg bg-card/70 backdrop-blur-sm p-8 fade-up">
      <div class="font-mono text-[10px] uppercase tracking-[0.3em] text-offline mb-3 flex items-center justify-center gap-2">
        <span class="size-1.5 rounded-full bg-offline" /> Fatal error
      </div>
      <h1 class="text-2xl font-semibold tracking-tight mb-2">Quelque chose a mal tourné</h1>
      <p class="font-mono text-xs text-muted-foreground break-words mb-6">
        {{ err.message }}
      </p>
      <button
        class="font-mono text-[11px] uppercase tracking-[0.22em] bg-signal text-primary-foreground px-5 py-2.5 rounded-md hover:brightness-110 transition glow-signal"
        @click="reload"
      >
        Recharger ↻
      </button>
    </div>
  </div>
  <slot v-else />
</template>

<script setup lang="ts">
import { useToasts } from '@/composables/useToasts'

const { toasts, dismiss } = useToasts()

const kindStyles: Record<string, string> = {
  info: 'border-signal/50 bg-signal/10 text-signal',
  success: 'border-signal/50 bg-signal/10 text-signal',
  alert: 'border-offline/50 bg-offline/10 text-offline',
  error: 'border-offline/50 bg-offline/10 text-offline',
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed top-4 right-4 z-[70] flex flex-col gap-2 max-w-[360px] w-[calc(100vw-2rem)]">
      <transition-group name="toast">
        <div
          v-for="t in toasts"
          :key="t.id"
          :class="['border-2 rounded-md backdrop-blur-md p-3 shadow-2xl flex items-start gap-3', kindStyles[t.kind] || kindStyles.info]"
        >
          <span class="text-lg leading-none mt-0.5 select-none">
            {{ t.kind === 'alert' || t.kind === 'error' ? '●' : 'ⓘ' }}
          </span>
          <div class="flex-1 min-w-0">
            <div class="font-semibold tracking-tight text-foreground">{{ t.title }}</div>
            <div v-if="t.body" class="font-mono text-xs text-muted-foreground mt-0.5">
              {{ t.body }}
            </div>
          </div>
          <button
            @click="dismiss(t.id)"
            class="size-5 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition"
            aria-label="Fermer"
          >
            <svg viewBox="0 0 24 24" class="size-3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </transition-group>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.25s cubic-bezier(0.2, 0.7, 0.2, 1);
}
.toast-enter-from {
  opacity: 0;
  transform: translateX(40px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(40px);
}
.toast-move {
  transition: transform 0.25s cubic-bezier(0.2, 0.7, 0.2, 1);
}
</style>

<script setup lang="ts">
/** Activer / couper les notifications d'alarme sur cet appareil (téléphone ou PC). */
import { onMounted } from 'vue'
import { usePushAlarms } from '@/composables/usePushAlarms'

const { blocker, subscribed, busy, lastError, refresh, enable, disable } = usePushAlarms()
onMounted(() => {
  if (!blocker.value) refresh()
})
</script>

<template>
  <div
    class="border border-border rounded-md bg-card/40 px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2"
    data-testid="push-alarms"
  >
    <div class="min-w-0 flex-1">
      <div class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        Notifications sur cet appareil
      </div>
      <div class="text-sm mt-0.5">
        <template v-if="blocker">Indisponibles : {{ blocker }}.</template>
        <template v-else-if="subscribed"
          >Activées : vous êtes prévenu à chaque nouvelle alarme de vos box.</template
        >
        <template v-else
          >Recevez une notification à chaque nouvelle alarme, même application fermée.</template
        >
      </div>
      <div v-if="lastError" class="text-xs text-destructive mt-1" data-testid="push-error">
        {{ lastError }}
      </div>
    </div>
    <button
      v-if="!blocker"
      data-slot="button"
      :disabled="busy"
      :class="[
        'shrink-0 h-9 px-4 rounded-md text-sm font-medium transition-colors disabled:opacity-50',
        subscribed
          ? 'border border-border hover:bg-secondary/60'
          : 'bg-primary text-primary-foreground hover:bg-primary/90',
      ]"
      data-testid="push-toggle"
      @click="subscribed ? disable() : enable()"
    >
      {{ subscribed ? 'Désactiver' : 'Activer' }}
    </button>
  </div>
</template>

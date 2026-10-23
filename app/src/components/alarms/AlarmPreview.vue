<script setup lang="ts">
// PROTOTYPE — aperçu « qui reçoit quoi » d'une box, selon les règles actuelles du firmware.
import { computed, ref } from 'vue'
import { LEVELS, type AlarmConfig, type Device, type Filters } from '@/composables/useAlarmConfig'
import { buildPreview, chList, fmtMin } from '@/composables/alarmPreview'

const props = defineProps<{ device: Device; cfg: AlarmConfig }>()
const type = ref<keyof Filters>('error')
const p = computed(() => buildPreview(props.cfg, props.device, type.value))
</script>

<template>
  <section class="space-y-2" data-testid="alarm-preview">
    <div class="flex items-center justify-between gap-2">
      <h4 class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        Aperçu : qui reçoit quoi
      </h4>
      <div class="flex gap-1 items-center text-xs">
        si une alarme
        <button
          v-for="l in LEVELS"
          :key="l.key"
          :class="[
            'w-6 h-6 rounded text-[10px] font-mono',
            type === l.key ? l.cls : 'bg-secondary/40 text-muted-foreground',
          ]"
          :data-testid="`preview-${l.key}`"
          @click="type = l.key"
        >
          {{ l.label }}
        </button>
        arrive
      </div>
    </div>
    <div class="border border-border rounded-md p-3 space-y-2 text-sm bg-secondary/10">
      <div
        class="font-mono text-[10px] uppercase tracking-wider"
        :class="p.mode === 'chain' ? 'text-signal' : 'text-muted-foreground'"
      >
        {{
          p.mode === 'chain'
            ? "Escalade — personne n'est prévenu en direct"
            : p.mode === 'direct'
              ? 'Envoi direct, tout le monde en même temps'
              : 'Aucun envoi'
        }}
      </div>
      <ol class="space-y-1.5">
        <li v-for="(s, i) in p.steps" :key="i" class="flex gap-3" data-testid="preview-step">
          <span class="w-24 shrink-0 font-mono text-xs text-muted-foreground">{{
            fmtMin(s.at)
          }}</span>
          <div class="min-w-0">
            <div class="text-xs text-muted-foreground">{{ s.label }}</div>
            <div v-if="s.sends.length" class="flex flex-wrap gap-x-3">
              <span v-for="x in s.sends" :key="x.name"
                >{{ x.name }}
                <span class="text-xs text-signal">{{ chList(x.channels) }}</span></span
              >
            </div>
            <div v-else class="text-xs text-offline">personne n'est prévenu à cette étape</div>
          </div>
        </li>
      </ol>
      <ul
        v-if="p.warnings.length"
        class="text-xs text-amber-400 space-y-0.5"
        data-testid="preview-warnings"
      >
        <li v-for="w in p.warnings" :key="w">⚠ {{ w }}</li>
      </ul>
      <ul v-if="p.notes.length" class="text-xs text-muted-foreground space-y-0.5">
        <li v-for="n in p.notes" :key="n">· {{ n }}</li>
      </ul>
    </div>
  </section>
</template>

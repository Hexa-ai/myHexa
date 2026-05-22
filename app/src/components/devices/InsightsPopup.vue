<script setup lang="ts">
import { ref } from 'vue'
import type { ReportInsight } from '@/composables/useDeviceInsights'

const props = defineProps<{
  open: boolean
  insights: ReportInsight[]
  deviceName?: string | null
}>()
const emit = defineEmits<{
  acknowledge: []
  dismiss: []
}>()

const expanded = ref<Set<string>>(new Set())

function toggle(id: string) {
  if (expanded.value.has(id)) expanded.value.delete(id)
  else expanded.value.add(id)
  expanded.value = new Set(expanded.value)
}

function severityClass(sev: number): string {
  if (sev >= 5) return 'bg-offline text-primary-foreground'
  if (sev >= 4) return 'bg-amber text-primary-foreground'
  if (sev >= 3) return 'bg-amber/70 text-foreground'
  return 'bg-secondary text-muted-foreground'
}

function severityLabel(sev: number): string {
  if (sev >= 5) return 'Critique'
  if (sev >= 4) return 'Important'
  if (sev >= 3) return 'À surveiller'
  return 'Info'
}

function kindLabel(kind: string): string {
  if (kind === 'anomaly') return 'Anomalie'
  if (kind === 'trend') return 'Tendance'
  if (kind === 'alarm_burst') return 'Rafale d’alarmes'
  if (kind === 'threshold_cross') return 'Seuil franchi'
  if (kind === 'seasonal_deviation') return 'Écart saisonnier'
  return kind
}

function fmtEvidence(e: unknown): string {
  try { return JSON.stringify(e, null, 2) } catch { return String(e) }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      @click.self="emit('dismiss')"
    >
      <div class="bg-background w-full max-w-lg border border-border rounded-lg p-6 space-y-4 max-h-[85vh] overflow-y-auto">
        <header class="flex items-start justify-between gap-3">
          <div>
            <h2 class="text-lg font-semibold">Quoi de neuf sur cet équipement</h2>
            <p v-if="deviceName" class="text-xs text-muted-foreground mt-0.5">{{ deviceName }}</p>
          </div>
          <button class="text-muted-foreground hover:text-foreground text-xl leading-none" @click="emit('dismiss')">×</button>
        </header>

        <p v-if="insights.length === 0" class="text-sm text-muted-foreground">
          Aucun signal particulier sur la période récente.
        </p>

        <ul v-else class="space-y-2">
          <li
            v-for="ins in insights"
            :key="ins.id"
            class="border border-border rounded-md bg-card/40 p-3 space-y-1.5"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="flex items-center gap-2 flex-wrap">
                <span
                  :class="['font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded', severityClass(ins.severity)]"
                  :title="`Sévérité ${ins.severity}/5`"
                >
                  {{ severityLabel(ins.severity) }}
                </span>
                <span class="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {{ kindLabel(ins.kind) }}
                </span>
                <span v-if="ins.variable_name" class="font-mono text-[10px] text-muted-foreground">
                  · {{ ins.variable_name }}
                </span>
              </div>
              <button
                class="text-[10px] font-mono text-muted-foreground hover:text-foreground uppercase tracking-wider shrink-0"
                @click="toggle(ins.id)"
              >
                {{ expanded.has(ins.id) ? 'Masquer' : 'Détails' }}
              </button>
            </div>
            <p class="text-sm font-medium">{{ ins.title }}</p>
            <p v-if="ins.body" class="text-sm text-muted-foreground">{{ ins.body }}</p>
            <pre v-if="expanded.has(ins.id)" class="text-[11px] font-mono bg-secondary/40 border border-border rounded p-2 overflow-x-auto whitespace-pre-wrap">{{ fmtEvidence(ins.evidence) }}</pre>
          </li>
        </ul>

        <footer class="flex justify-end gap-2 pt-2">
          <button
            class="px-3 py-2 text-sm border border-border rounded-md"
            @click="emit('dismiss')"
          >
            Plus tard
          </button>
          <button
            :disabled="insights.length === 0"
            class="px-3 py-2 text-sm bg-primary text-primary-foreground rounded-md disabled:opacity-60"
            @click="emit('acknowledge')"
          >
            Compris
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

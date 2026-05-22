<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { ReportInsight } from '@/composables/useDeviceInsights'

const props = defineProps<{
  open: boolean
  insights: ReportInsight[]
  deviceId: string
  deviceName?: string | null
}>()
const emit = defineEmits<{
  acknowledge: []
  dismiss: []
}>()

const router = useRouter()
const showAll = ref(false)

function openReport(ins: ReportInsight) {
  router.push({
    name: 'admin-device-periodic',
    params: { id: props.deviceId },
    query: {
      type: ins.period_kind,
      ...(ins.report_period_start ? { period: ins.report_period_start } : {}),
      ...(ins.variable_name ? { focus: ins.variable_name } : {}),
    },
  })
  emit('dismiss')
}

function fmtPeriod(ins: ReportInsight): string {
  if (!ins.report_period_start) return ''
  const d = new Date(ins.report_period_start)
  const label = ins.period_kind === 'weekly' ? 'Semaine du' : 'Journée du'
  return `${label} ${d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}`
}

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
function kindLabel(kind: string, ins?: ReportInsight): string {
  if (kind === 'anomaly') return 'Anomalie'
  if (kind === 'trend') {
    const dir = (ins?.evidence as { direction?: string } | null)?.direction
    return dir === 'down' ? 'Tendance ↘' : 'Tendance ↗'
  }
  if (kind === 'alarm_burst') return 'Rafale d’alarmes'
  if (kind === 'threshold_cross') return 'Seuil franchi'
  if (kind === 'seasonal_deviation') return 'Écart saisonnier'
  return kind
}
function kindClass(kind: string): string {
  if (kind === 'anomaly') return 'bg-amber/15 text-amber border border-amber/40'
  if (kind === 'trend') return 'bg-signal-soft text-signal border border-signal/40'
  if (kind === 'alarm_burst') return 'bg-offline-soft text-offline border border-offline/40'
  return 'bg-secondary text-muted-foreground border border-border'
}
function consolidationTag(ins: ReportInsight): { label: string; cls: string } | null {
  const ev = ins.evidence as { consolidation?: string } | null
  const c = ev?.consolidation
  if (!c) return null
  if (c === 'confirmed_at_weekly_scale') return { label: 'Confirmé à l’échelle hebdo', cls: 'bg-offline-soft text-offline border-offline/40' }
  if (c === 'mild_weekly_signal') return { label: 'Signal hebdo modéré', cls: 'bg-amber/15 text-amber border-amber/40' }
  if (c === 'demoted_no_weekly_confirmation') return { label: 'Pic isolé (non confirmé hebdo)', cls: 'bg-secondary text-muted-foreground border-border' }
  if (c === 'no_weekly_data') return { label: 'Historique hebdo insuffisant', cls: 'bg-secondary/60 text-muted-foreground border-border' }
  return null
}
function kindExplain(kind: string): string {
  if (kind === 'anomaly') return 'Écart inhabituel par rapport à l’historique récent (z-score > 2σ).'
  if (kind === 'trend') return 'Dérive significative de la moyenne sur plusieurs périodes consécutives.'
  if (kind === 'alarm_burst') return 'Concentration d’événements d’alarme nettement plus élevée que d’habitude.'
  if (kind === 'threshold_cross') return 'Une valeur a dépassé un seuil configuré.'
  if (kind === 'seasonal_deviation') return 'Écart par rapport au même créneau (jour/semaine) des périodes précédentes.'
  return ''
}
function fmtEvidence(e: unknown): string {
  try { return JSON.stringify(e, null, 2) } catch { return String(e) }
}

// --- Synthèse "ce qu'il faut retenir" ---------------------------------------

// Score combiné : severity (1-5) + bonus récence
//   < 24h  → +1
//   24-72h → +0
//   3-7j   → -0.5
//   > 7j   → -1
function priorityScore(ins: ReportInsight): number {
  const ageH = ins.created_at
    ? (Date.now() - new Date(ins.created_at).getTime()) / 3600_000
    : Infinity
  let bonus = 0
  if (ageH < 24) bonus = 1
  else if (ageH < 72) bonus = 0
  else if (ageH < 168) bonus = -0.5
  else bonus = -1
  return ins.severity + bonus
}

const sortedInsights = computed(() => {
  return [...props.insights].sort((a, b) => priorityScore(b) - priorityScore(a))
})
const topInsight = computed<ReportInsight | null>(() => sortedInsights.value[0] ?? null)
const otherCount = computed(() => Math.max(0, sortedInsights.value.length - 1))

function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return ''
  const ageH = (Date.now() - new Date(iso).getTime()) / 3600_000
  if (ageH < 1) return 'il y a moins d’une heure'
  if (ageH < 24) return `il y a ${Math.round(ageH)} h`
  const ageD = Math.round(ageH / 24)
  if (ageD === 1) return 'hier'
  if (ageD < 7) return `il y a ${ageD} j`
  return `il y a ${Math.round(ageD / 7)} sem`
}

// Synthèse paragraphe : compose à partir du top insight + compteur
const synthesisLead = computed(() => {
  const ins = topInsight.value
  if (!ins) return ''
  const kindL = kindLabel(ins.kind, ins).toLowerCase()
  const var_ = ins.variable_name ? ` sur ${ins.variable_name}` : ''
  const sevL = ins.severity >= 5 ? 'critique' : ins.severity >= 4 ? 'importante' : 'à surveiller'
  const period = fmtPeriod(ins)
  const when = fmtRelative(ins.created_at)
  return `Point d’attention principal — ${kindL}${var_}, ${sevL} (${when}${period ? ' · ' + period.toLowerCase() : ''}).`
})
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

        <!-- Vue par défaut : synthèse -->
        <template v-else-if="!showAll && topInsight">
          <div class="border border-border rounded-md bg-card/40 p-4 space-y-2">
            <div class="flex items-center gap-2 flex-wrap">
              <span
                :class="['font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold', kindClass(topInsight.kind)]"
              >
                {{ kindLabel(topInsight.kind, topInsight) }}
              </span>
              <span
                :class="['font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded', severityClass(topInsight.severity)]"
              >
                {{ severityLabel(topInsight.severity) }}
              </span>
              <span v-if="topInsight.variable_name" class="font-mono text-[10px] text-muted-foreground">
                · {{ topInsight.variable_name }}
              </span>
            </div>
            <p class="text-sm leading-relaxed">
              <span class="text-muted-foreground italic">{{ synthesisLead }}</span>
              <span class="block mt-1 font-medium">{{ topInsight.title }}</span>
            </p>
            <p v-if="topInsight.body" class="text-sm text-muted-foreground">{{ topInsight.body }}</p>
            <p v-else-if="kindExplain(topInsight.kind)" class="text-xs text-muted-foreground italic">
              {{ kindExplain(topInsight.kind) }}
            </p>
            <div v-if="consolidationTag(topInsight)" class="pt-1">
              <span :class="['inline-block font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border', consolidationTag(topInsight)!.cls]">
                {{ consolidationTag(topInsight)!.label }}
              </span>
            </div>
            <div class="pt-2 flex items-center gap-3 flex-wrap">
              <button
                v-if="topInsight.report_period_start"
                class="font-mono text-[10px] uppercase tracking-wider text-signal hover:underline"
                @click="openReport(topInsight)"
              >
                Voir le rapport →
              </button>
              <button
                v-if="otherCount > 0"
                class="font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
                @click="showAll = true"
              >
                Voir les {{ otherCount }} autre{{ otherCount > 1 ? 's' : '' }} signal{{ otherCount > 1 ? 'es' : '' }} →
              </button>
            </div>
          </div>
        </template>

        <!-- Vue dépliée : liste complète -->
        <template v-else-if="showAll">
          <button
            class="font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
            @click="showAll = false"
          >
            ← Retour à la synthèse
          </button>
          <ul class="space-y-2">
            <li
              v-for="ins in sortedInsights"
              :key="ins.id"
              class="border border-border rounded-md bg-card/40 p-3 space-y-1.5"
            >
              <div class="flex items-start justify-between gap-2">
                <div class="flex items-center gap-2 flex-wrap">
                  <span
                    :class="['font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold', kindClass(ins.kind)]"
                  >
                    {{ kindLabel(ins.kind, ins) }}
                  </span>
                  <span
                    :class="['font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded', severityClass(ins.severity)]"
                  >
                    {{ severityLabel(ins.severity) }}
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
              <p v-else-if="kindExplain(ins.kind)" class="text-xs text-muted-foreground italic">
                {{ kindExplain(ins.kind) }}
              </p>
              <p v-if="fmtPeriod(ins)" class="text-[11px] font-mono text-muted-foreground">
                {{ fmtPeriod(ins) }}
              </p>
              <div v-if="consolidationTag(ins)" class="pt-0.5">
                <span :class="['inline-block font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border', consolidationTag(ins)!.cls]">
                  {{ consolidationTag(ins)!.label }}
                </span>
              </div>
              <pre v-if="expanded.has(ins.id)" class="text-[11px] font-mono bg-secondary/40 border border-border rounded p-2 overflow-x-auto whitespace-pre-wrap">{{ fmtEvidence(ins.evidence) }}</pre>
              <div class="pt-1">
                <button
                  v-if="ins.report_period_start"
                  class="font-mono text-[10px] uppercase tracking-wider text-signal hover:underline"
                  @click="openReport(ins)"
                >
                  Voir le rapport →
                </button>
              </div>
            </li>
          </ul>
        </template>

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

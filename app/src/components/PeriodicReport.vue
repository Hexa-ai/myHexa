<script setup lang="ts">
import { computed } from 'vue'
import SeriesChart from '@/components/SeriesChart.vue'

interface ReportPoint { ts: number | string; value: number }
interface ReportVariable {
  name?: string
  description?: string
  unit?: string
  category?: string
  color?: string
  stats?: { last?: number; min?: number; max?: number; mean?: number; median?: number }
  has_chart?: boolean
  chart?: { type?: 'line' | 'bar'; points?: ReportPoint[] }
}
interface AlarmEvent {
  datetime_str?: string
  name?: string
  description?: string
  type_alarm?: string
  state_label?: string
}
export interface PeriodicPayload {
  metadata?: {
    hostname?: string
    freq_label?: string
    period_str?: string
    generated_at?: string
    timezone?: string
  }
  variables?: ReportVariable[]
  alarm_events?: AlarmEvent[]
}
export interface PeriodOption {
  period_start: string
  period_end: string | null
}

const props = defineProps<{
  payload: PeriodicPayload | null
  type: 'daily' | 'weekly'
  periodStart: string | null
  periodEnd: string | null
  periods: PeriodOption[]
}>()

const emit = defineEmits<{
  (e: 'change-type', t: 'daily' | 'weekly'): void
  (e: 'change-period', start: string): void
}>()

const variables = computed(() => props.payload?.variables ?? [])
const alarms = computed(() => props.payload?.alarm_events ?? [])

function fmtNum(v: unknown, unit?: string): string {
  if (v === null || v === undefined) return '—'
  if (typeof v !== 'number') return String(v)
  const s = Number.isInteger(v) ? String(v) : v.toFixed(3)
  return unit ? `${s} ${unit}` : s
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function periodLabel(p: PeriodOption): string {
  if (props.type === 'weekly' && p.period_end) {
    const end = new Date(`${p.period_end}T00:00:00Z`)
    end.setUTCDate(end.getUTCDate() - 1)
    const ey = end.getUTCFullYear()
    const em = String(end.getUTCMonth() + 1).padStart(2, '0')
    const ed = String(end.getUTCDate()).padStart(2, '0')
    return `${fmtDate(p.period_start)} au ${ed}/${em}/${ey}`
  }
  return fmtDate(p.period_start)
}

const headerPeriodDisplay = computed(() => {
  if (!props.periodStart) return props.payload?.metadata?.period_str ?? '—'
  let display = fmtDate(props.periodStart)
  if (props.type === 'weekly' && props.periodEnd) {
    const end = new Date(`${props.periodEnd}T00:00:00Z`)
    end.setUTCDate(end.getUTCDate() - 1)
    display += ` au ${String(end.getUTCDate()).padStart(2, '0')}/${String(end.getUTCMonth() + 1).padStart(2, '0')}/${end.getUTCFullYear()}`
  }
  return display
})

const generatedAt = computed(() => {
  const ts = props.payload?.metadata?.generated_at
  return ts ? new Date(ts).toLocaleString('fr-FR') : '—'
})

function onPeriodSelect(e: Event) {
  const v = (e.target as HTMLSelectElement).value
  if (v) emit('change-period', v)
}

const typeBadgeClass = (cat?: string) => {
  switch (cat) {
    case 'error':
      return 'bg-offline-soft text-offline'
    case 'warning':
      return 'bg-amber/15 text-amber'
    case 'info':
      return 'bg-signal-soft text-signal'
    default:
      return 'bg-muted text-muted-foreground'
  }
}
</script>

<template>
  <div class="space-y-6 fade-up">
    <!-- Type tabs (Daily / Weekly) -->
    <nav class="inline-flex gap-1 p-1 border border-border rounded-md bg-card/40">
      <button
        v-for="t in (['daily', 'weekly'] as const)"
        :key="t"
        :class="[
          'font-mono text-[11px] uppercase tracking-[0.18em] px-4 py-1.5 rounded transition whitespace-nowrap',
          type === t ? 'bg-signal text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
        ]"
        @click="emit('change-type', t)"
      >
        {{ t === 'daily' ? 'Rapport quotidien' : 'Rapport hebdomadaire' }}
      </button>
    </nav>

    <!-- Period selector -->
    <div v-if="periods.length" class="flex items-center gap-3 flex-wrap">
      <label class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Période</label>
      <select
        :value="periodStart ?? ''"
        class="bg-card border border-border rounded-md px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-signal/60 transition"
        @change="onPeriodSelect"
      >
        <option
          v-for="p in periods"
          :key="p.period_start"
          :value="p.period_start"
        >
          {{ periodLabel(p) }}
        </option>
      </select>
    </div>

    <!-- Empty -->
    <div
      v-if="!payload"
      class="border border-border rounded-md bg-card/40 p-10 text-center text-sm text-muted-foreground"
    >
      Aucun rapport {{ type === 'daily' ? 'quotidien' : 'hebdomadaire' }} disponible pour cet équipement.
    </div>

    <template v-else>
      <!-- Header -->
      <div class="border border-border rounded-md bg-card/40 p-5">
        <div class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-2">
          <span class="text-signal">⬢</span>
          {{ payload.metadata?.freq_label || (type === 'daily' ? 'Quotidien' : 'Hebdomadaire') }}
        </div>
        <h2 class="text-2xl font-semibold tracking-tight mb-1">
          {{ payload.metadata?.hostname || 'Équipement' }}
        </h2>
        <p class="font-mono text-xs text-muted-foreground">
          Période · <span class="text-foreground">{{ headerPeriodDisplay }}</span>
        </p>
      </div>

      <!-- Variables -->
      <div v-if="variables.length" class="space-y-5">
        <h3 class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Variables</h3>
        <div
          v-for="(v, i) in variables"
          :key="i"
          class="border border-border rounded-md bg-card/40 p-5 space-y-4"
        >
          <div class="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div class="font-medium tracking-tight">{{ v.name || '—' }}</div>
              <div class="mt-0.5 font-mono text-[11px] text-muted-foreground">
                {{ v.description || '—' }}
                <span v-if="v.unit"> · {{ v.unit }}</span>
                <span v-if="v.category"> · <span class="opacity-70">{{ v.category }}</span></span>
              </div>
            </div>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <div
              v-for="key in (['last', 'min', 'max', 'mean', 'median'] as const)"
              :key="key"
              class="border border-border/60 rounded px-3 py-2 bg-background/40"
            >
              <div class="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                {{ { last: 'Dernier', min: 'Min', max: 'Max', mean: 'Moy', median: 'Médiane' }[key] }}
              </div>
              <div class="font-mono text-sm tabular mt-0.5">{{ fmtNum(v.stats?.[key], v.unit) }}</div>
            </div>
          </div>

          <SeriesChart
            v-if="v.has_chart && v.chart?.points?.length"
            :points="v.chart.points"
            :label="v.name || ''"
            :unit="v.unit"
            :color="v.color || '#00d4aa'"
            :type="v.chart.type === 'bar' ? 'bar' : 'line'"
          />
          <div v-else class="text-xs font-mono text-muted-foreground text-center py-3">
            Pas de données graphiques
          </div>
        </div>
      </div>

      <!-- Alarms -->
      <div>
        <h3 class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
          Événements d'alarme
        </h3>
        <div
          v-if="!alarms.length"
          class="border border-border rounded-md bg-card/40 p-5 text-sm text-muted-foreground"
        >
          Aucun événement d'alarme sur la période.
        </div>
        <div v-else class="border border-border rounded-md bg-card/40 overflow-x-auto">
          <table class="w-full text-sm min-w-[640px]">
            <thead>
              <tr class="border-b border-border bg-card/60">
                <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-3 py-2">Horodatage</th>
                <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-3 py-2">Variable</th>
                <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-3 py-2">Description</th>
                <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-3 py-2">Type</th>
                <th class="text-right font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-3 py-2">État</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(a, i) in alarms" :key="i" class="border-b border-border/50 last:border-0">
                <td class="px-3 py-2.5 font-mono text-xs text-muted-foreground">{{ a.datetime_str || '—' }}</td>
                <td class="px-3 py-2.5 font-medium">{{ a.name || '—' }}</td>
                <td class="px-3 py-2.5 text-muted-foreground text-xs">{{ a.description || '—' }}</td>
                <td class="px-3 py-2.5">
                  <span
                    v-if="a.type_alarm"
                    :class="['inline-block font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded', typeBadgeClass(a.type_alarm)]"
                  >
                    {{ a.type_alarm }}
                  </span>
                  <span v-else class="font-mono text-xs text-muted-foreground/50">—</span>
                </td>
                <td class="px-3 py-2.5 text-right">
                  <span
                    :class="[
                      'font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded',
                      a.state_label === 'ON' ? 'bg-offline-soft text-offline' : 'bg-signal-soft text-signal',
                    ]"
                  >
                    {{ a.state_label || '—' }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <p class="text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        Généré le {{ generatedAt }}
        <span v-if="payload.metadata?.timezone"> · {{ payload.metadata.timezone }}</span>
      </p>
    </template>
  </div>
</template>

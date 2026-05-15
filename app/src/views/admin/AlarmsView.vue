<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useDevices } from '@/composables/useDevices'
import { useAutoRefresh } from '@/composables/useAutoRefresh'
import { formatRelative } from '@/lib/utils'

const router = useRouter()
const { devices, loading: devicesLoading, error: devicesError, load: loadDevices } = useDevices()

interface HistoryRow {
  device_id: string
  device_name: string | null
  ts: string | null
  variable_name: string | null
  description: string | null
  type_alarm: string | null
  state_label: string | null
}

const history = ref<HistoryRow[]>([])
const historyLoading = ref(false)
const historyError = ref<string | null>(null)

async function loadHistory() {
  if (history.value.length === 0) historyLoading.value = true
  historyError.value = null
  try {
    const { data, error: err } = await supabase
      .rpc('alarm_history')
      .order('ts', { ascending: false, nullsFirst: false })
    if (err) {
      historyError.value = err.message
      return
    }
    history.value = (data ?? []) as HistoryRow[]
  } catch (e) {
    historyError.value = e instanceof Error ? e.message : 'Unknown error'
  } finally {
    historyLoading.value = false
  }
}

async function refreshAll() {
  await Promise.all([loadDevices(), loadHistory()])
}
useAutoRefresh(refreshAll, { intervalMs: 120_000 })

// ------------------------------ Filters --------------------------------------

const TYPE_OPTIONS = ['error', 'warning', 'info'] as const
type AlarmType = (typeof TYPE_OPTIONS)[number]

const selectedDevice = ref<'all' | string>('all')
const selectedTypes = ref<Set<AlarmType>>(new Set(TYPE_OPTIONS))
const showHistory = ref(true)

function toggleType(t: AlarmType) {
  if (selectedTypes.value.has(t)) selectedTypes.value.delete(t)
  else selectedTypes.value.add(t)
  selectedTypes.value = new Set(selectedTypes.value) // trigger reactivity
}

// ------------------------------ Active alarms --------------------------------

interface ActiveAlarm {
  device_id: string
  device_name: string | null
  variable_name: string
  description: string | null
  type_alarm: AlarmType | null
  value: unknown
  ts: string | null
}

interface PayloadVar {
  name?: string
  description?: string
  value?: unknown
  category?: string
  type_alarm?: string
  timestamp?: number
}

const activeAlarms = computed<ActiveAlarm[]>(() => {
  const out: ActiveAlarm[] = []
  for (const d of devices.value) {
    const vars = ((d.status_payload as { variables?: PayloadVar[] } | null)?.variables ?? [])
    for (const v of vars) {
      if (v?.category !== 'alarm') continue
      if (v?.value === 0 || v?.value === null || v?.value === false) continue
      out.push({
        device_id: d.id,
        device_name: d.name,
        variable_name: String(v.name ?? ''),
        description: v.description ?? null,
        type_alarm: (v.type_alarm as AlarmType) ?? null,
        value: v.value,
        ts: v.timestamp ? new Date(v.timestamp).toISOString() : null,
      })
    }
  }
  return out
})

const deviceOptions = computed(() => {
  const map = new Map<string, string>()
  for (const d of devices.value) map.set(d.id, d.name ?? d.id)
  return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
})

function matchesFilters(row: { device_id: string; type_alarm: string | null }): boolean {
  if (selectedDevice.value !== 'all' && row.device_id !== selectedDevice.value) return false
  const t = (row.type_alarm ?? '').toLowerCase() as AlarmType
  if (!selectedTypes.value.has(t)) return false
  return true
}

const filteredActive = computed(() => activeAlarms.value.filter(matchesFilters))
const filteredHistory = computed(() => history.value.filter(matchesFilters))

const kpiActive = computed(() => filteredActive.value.length)
const kpiHistory = computed(() => filteredHistory.value.length)

// ------------------------------ Rendering helpers ----------------------------

const TYPE_CLASS: Record<AlarmType | 'default', string> = {
  error: 'bg-offline-soft text-offline',
  warning: 'bg-amber/15 text-amber',
  info: 'bg-signal-soft text-signal',
  default: 'bg-muted text-muted-foreground',
}

function typeClass(t: string | null) {
  const k = (t ?? '').toLowerCase() as AlarmType
  return TYPE_CLASS[k] ?? TYPE_CLASS.default
}

function fmtFullDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('fr-FR')
}

function openDevice(id: string) {
  router.push({ name: 'admin-device-detail', params: { id } })
}
</script>

<template>
  <section class="px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10 max-w-[1400px] mx-auto">
    <header class="flex flex-col md:flex-row md:items-end md:justify-between gap-5 mb-8 fade-up">
      <div>
        <div class="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-3 flex items-center gap-2">
          <span class="text-signal">⬢</span> Centre d'alarmes
        </div>
        <h1 class="text-3xl sm:text-4xl font-semibold tracking-tight">
          Alarmes<span class="text-signal">.</span>
        </h1>
        <p class="mt-3 text-sm text-muted-foreground max-w-md">
          Vue temps réel des alarmes actives + historique consolidé depuis les rapports
          quotidiens et hebdomadaires.
        </p>
      </div>

      <div class="grid grid-cols-2 gap-px bg-border border border-border rounded-sm overflow-hidden self-start md:self-auto w-full md:w-auto">
        <div class="bg-card px-4 py-2.5">
          <div class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
            <span class="size-1 rounded-full bg-offline" /> Actives
          </div>
          <div class="font-mono text-xl tabular mt-0.5" :class="kpiActive ? 'text-offline' : ''">
            {{ kpiActive.toString().padStart(2, '0') }}
          </div>
        </div>
        <div class="bg-card px-4 py-2.5">
          <div class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Historique</div>
          <div class="font-mono text-xl tabular mt-0.5">
            {{ kpiHistory.toString().padStart(2, '0') }}
          </div>
        </div>
      </div>
    </header>

    <!-- Filters -->
    <div class="flex flex-col sm:flex-row gap-3 mb-5 fade-up" style="animation-delay: 40ms">
      <select
        v-model="selectedDevice"
        class="bg-card border border-border rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:border-signal/60 transition"
      >
        <option value="all">Tous les devices</option>
        <option v-for="d in deviceOptions" :key="d.id" :value="d.id">{{ d.name }}</option>
      </select>

      <div class="flex items-center gap-1.5 flex-wrap">
        <button
          v-for="t in TYPE_OPTIONS"
          :key="t"
          @click="toggleType(t)"
          :class="[
            'font-mono text-[10px] uppercase tracking-[0.18em] px-3 py-1.5 rounded-md border transition',
            selectedTypes.has(t)
              ? typeClass(t) + ' border-transparent'
              : 'border-border text-muted-foreground hover:border-signal/40 hover:text-foreground',
          ]"
        >
          {{ t }}
        </button>
      </div>

      <button
        @click="showHistory = !showHistory"
        :class="[
          'ml-auto font-mono text-[10px] uppercase tracking-[0.18em] px-3 py-1.5 rounded-md border transition',
          showHistory
            ? 'border-signal/50 text-signal'
            : 'border-border text-muted-foreground hover:text-foreground',
        ]"
      >
        {{ showHistory ? 'Historique : ON' : 'Historique : OFF' }}
      </button>
    </div>

    <!-- Active alarms -->
    <h2 class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
      Alarmes actives ({{ kpiActive }})
    </h2>
    <div
      v-if="devicesLoading && !devices.length"
      class="border border-border rounded-md bg-card/40 p-8 text-center font-mono text-sm text-muted-foreground mb-8"
    >
      <span class="blink">▍</span> chargement…
    </div>
    <div
      v-else-if="devicesError"
      class="border border-offline/40 rounded-md bg-offline-soft p-5 font-mono text-sm text-offline mb-8"
    >
      ERR · {{ devicesError }}
    </div>
    <div
      v-else-if="filteredActive.length === 0"
      class="border border-border rounded-md bg-card/40 p-6 text-sm text-muted-foreground mb-8"
    >
      Aucune alarme active ne correspond aux filtres.
    </div>
    <div
      v-else
      class="border border-offline/40 rounded-md bg-card/60 overflow-x-auto mb-10 fade-up"
      style="animation-delay: 100ms"
    >
      <table class="w-full text-sm min-w-[720px]">
        <thead>
          <tr class="border-b border-border bg-card/80">
            <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-3">Type</th>
            <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-3">Device</th>
            <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-3">Variable</th>
            <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-3">Description</th>
            <th class="text-right font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-3 w-[160px]">Depuis</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(a, i) in filteredActive"
            :key="`${a.device_id}-${a.variable_name}`"
            class="border-b border-border/50 last:border-0 hover:bg-secondary/40 cursor-pointer transition"
            @click="openDevice(a.device_id)"
          >
            <td class="px-4 py-3">
              <span
                :class="['font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded', typeClass(a.type_alarm)]"
              >
                {{ a.type_alarm || '—' }}
              </span>
            </td>
            <td class="px-4 py-3 font-medium">{{ a.device_name || '—' }}</td>
            <td class="px-4 py-3 font-mono text-xs">{{ a.variable_name }}</td>
            <td class="px-4 py-3 text-muted-foreground text-xs">{{ a.description || '—' }}</td>
            <td class="px-4 py-3 text-right font-mono text-xs text-muted-foreground tabular">
              {{ a.ts ? formatRelative(a.ts) : '—' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- History -->
    <template v-if="showHistory">
      <h2 class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
        Historique ({{ kpiHistory }})
      </h2>
      <div
        v-if="historyLoading && !history.length"
        class="border border-border rounded-md bg-card/40 p-8 text-center font-mono text-sm text-muted-foreground"
      >
        <span class="blink">▍</span> chargement de l'historique…
      </div>
      <div
        v-else-if="historyError"
        class="border border-offline/40 rounded-md bg-offline-soft p-5 font-mono text-sm text-offline"
      >
        ERR · {{ historyError }}
      </div>
      <div
        v-else-if="filteredHistory.length === 0"
        class="border border-border rounded-md bg-card/40 p-6 text-sm text-muted-foreground"
      >
        Aucun événement d'alarme dans l'historique pour ces filtres.
      </div>
      <div v-else class="border border-border rounded-md bg-card/40 overflow-x-auto fade-up" style="animation-delay: 140ms">
        <table class="w-full text-sm min-w-[720px]">
          <thead>
            <tr class="border-b border-border bg-card/60">
              <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-3 w-[140px]">Horodatage</th>
              <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-3 w-[100px]">Type</th>
              <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-3">Device</th>
              <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-3">Variable</th>
              <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-3">Description</th>
              <th class="text-right font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-3 w-[80px]">État</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(a, i) in filteredHistory"
              :key="`${a.device_id}-${a.ts}-${a.variable_name}-${a.state_label}`"
              class="border-b border-border/50 last:border-0 hover:bg-secondary/40 cursor-pointer transition"
              @click="openDevice(a.device_id)"
            >
              <td class="px-4 py-3 font-mono text-xs text-muted-foreground tabular whitespace-nowrap">
                {{ fmtFullDate(a.ts) }}
              </td>
              <td class="px-4 py-3">
                <span
                  :class="['font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded', typeClass(a.type_alarm)]"
                >
                  {{ a.type_alarm || '—' }}
                </span>
              </td>
              <td class="px-4 py-3 font-medium">{{ a.device_name || '—' }}</td>
              <td class="px-4 py-3 font-mono text-xs">{{ a.variable_name }}</td>
              <td class="px-4 py-3 text-muted-foreground text-xs">{{ a.description || '—' }}</td>
              <td class="px-4 py-3 text-right">
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
    </template>
  </section>
</template>

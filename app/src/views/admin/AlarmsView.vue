<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useDevices } from '@/composables/useDevices'
import { useAutoRefresh } from '@/composables/useAutoRefresh'
import {
  formatRelative,
  severityPillClass,
  severityButtonClass,
  SEVERITY_ICON,
  SEVERITY_LABEL,
} from '@/lib/utils'

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
  await Promise.all([loadDevices(), loadHistory(), loadInterventions()])
}
useAutoRefresh(refreshAll, { intervalMs: 120_000 })

// ------------------------------ Filters --------------------------------------

const TYPE_OPTIONS = ['error', 'warning', 'info'] as const
type AlarmType = (typeof TYPE_OPTIONS)[number]

const selectedDevice = ref<'all' | string>('all')
const selectedTypes = ref<Set<AlarmType>>(new Set(TYPE_OPTIONS))
const mode = ref<'live' | 'history' | 'interventions'>('live')

// ------------------------------ Interventions --------------------------------

interface InterventionRow {
  id: string
  device_id: string
  created_at: string
  technician_name: string
  technician_contact: string | null
  category: 'intervention' | 'incident' | 'controle' | 'autre'
  severity: AlarmType
  message: string | null
  status: 'open' | 'resolved'
  resolved_at: string | null
  photo_paths: string[]
}

const interventions = ref<InterventionRow[]>([])
const interventionsLoading = ref(false)
const interventionsError = ref<string | null>(null)
const interventionStatusFilter = ref<'all' | 'open' | 'resolved'>('open')

async function loadInterventions() {
  if (interventions.value.length === 0) interventionsLoading.value = true
  interventionsError.value = null
  try {
    const { data, error: err } = await supabase
      .from('field_interventions')
      .select('id, device_id, created_at, technician_name, technician_contact, category, severity, message, status, resolved_at, photo_paths')
      .order('created_at', { ascending: false })
    if (err) {
      interventionsError.value = err.message
      return
    }
    interventions.value = (data ?? []) as InterventionRow[]
  } catch (e) {
    interventionsError.value = e instanceof Error ? e.message : 'Unknown error'
  } finally {
    interventionsLoading.value = false
  }
}

async function toggleInterventionStatus(row: InterventionRow) {
  const next = row.status === 'open' ? 'resolved' : 'open'
  const { error: updErr } = await supabase
    .from('field_interventions')
    .update({
      status: next,
      resolved_at: next === 'resolved' ? new Date().toISOString() : null,
    })
    .eq('id', row.id)
  if (updErr) {
    interventionsError.value = updErr.message
    return
  }
  await loadInterventions()
}

const deviceNameById = computed(() => {
  const m = new Map<string, string>()
  for (const d of devices.value) m.set(d.id, d.name ?? d.id)
  return m
})

const filteredInterventions = computed(() => {
  return interventions.value.filter((r) => {
    if (selectedDevice.value !== 'all' && r.device_id !== selectedDevice.value) return false
    if (!selectedTypes.value.has(r.severity)) return false
    if (interventionStatusFilter.value !== 'all' && r.status !== interventionStatusFilter.value) return false
    return true
  })
})
const kpiInterventions = computed(() => filteredInterventions.value.length)

// ------------------------------ Detail modal ---------------------------------

const detailRow = ref<InterventionRow | null>(null)
const detailPhotoUrls = ref<string[]>([])
const detailLightbox = ref<number | null>(null)

async function openDetail(row: InterventionRow) {
  detailRow.value = row
  detailPhotoUrls.value = []
  if (row.photo_paths.length === 0) return
  const { data, error: err } = await supabase.storage
    .from('intervention-photos')
    .createSignedUrls(row.photo_paths, 60 * 30) // 30 min
  if (err) {
    console.error('[alarms] signed urls failed', err)
    return
  }
  detailPhotoUrls.value = (data ?? [])
    .filter((d) => d.signedUrl)
    .map((d) => d.signedUrl)
}
function closeDetail() {
  detailRow.value = null
  detailPhotoUrls.value = []
  detailLightbox.value = null
}
function openLightbox(i: number) {
  detailLightbox.value = i
}
function closeLightbox() {
  detailLightbox.value = null
}

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

function typeClass(t: string | null) {
  return severityPillClass(t)
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
            'font-mono text-[10px] uppercase tracking-[0.18em] px-3 py-1.5 rounded-md border-2 transition inline-flex items-center gap-1.5',
            severityButtonClass(t, selectedTypes.has(t)),
          ]"
        >
          <span class="text-xs leading-none">{{ SEVERITY_ICON[t] }}</span>
          {{ SEVERITY_LABEL[t] }}
        </button>
      </div>

      <nav class="ml-auto inline-flex gap-1 p-1 border border-border rounded-md bg-card/40 self-start flex-wrap">
        <button
          @click="mode = 'live'"
          :class="[
            'font-mono text-[10px] uppercase tracking-[0.18em] px-3 py-1.5 rounded transition whitespace-nowrap',
            mode === 'live' ? 'bg-signal text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
          ]"
        >
          <span class="inline-flex items-center gap-1.5">
            <span
              class="size-1 rounded-full"
              :class="mode === 'live' ? 'bg-primary-foreground/80' : 'bg-offline'"
            />
            Fil de l'eau · {{ kpiActive }}
          </span>
        </button>
        <button
          @click="mode = 'history'"
          :class="[
            'font-mono text-[10px] uppercase tracking-[0.18em] px-3 py-1.5 rounded transition whitespace-nowrap',
            mode === 'history' ? 'bg-signal text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
          ]"
        >
          Historique · {{ kpiHistory }}
        </button>
        <button
          @click="mode = 'interventions'"
          :class="[
            'font-mono text-[10px] uppercase tracking-[0.18em] px-3 py-1.5 rounded transition whitespace-nowrap',
            mode === 'interventions' ? 'bg-signal text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
          ]"
        >
          Interventions · {{ kpiInterventions }}
        </button>
      </nav>
    </div>

    <!-- Live (active) alarms -->
    <template v-if="mode === 'live'">
      <div
        v-if="devicesLoading && !devices.length"
        class="border border-border rounded-md bg-card/40 p-8 text-center font-mono text-sm text-muted-foreground"
      >
        <span class="blink">▍</span> chargement…
      </div>
      <div
        v-else-if="devicesError"
        class="border border-offline/40 rounded-md bg-offline-soft p-5 font-mono text-sm text-offline"
      >
        ERR · {{ devicesError }}
      </div>
      <div
        v-else-if="filteredActive.length === 0"
        class="border border-border rounded-md bg-card/40 p-6 text-sm text-muted-foreground"
      >
        Aucune alarme active ne correspond aux filtres.
      </div>
      <div
        v-else
        class="border border-offline/40 rounded-md bg-card/60 overflow-x-auto fade-up"
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
                  :class="['inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded', typeClass(a.type_alarm)]"
                >
                  <span v-if="a.type_alarm" class="text-xs leading-none">{{ SEVERITY_ICON[a.type_alarm as 'info' | 'warning' | 'error'] || '' }}</span>
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
    </template>

    <!-- History -->
    <template v-else-if="mode === 'history'">
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
                  :class="['inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded', typeClass(a.type_alarm)]"
                >
                  <span v-if="a.type_alarm" class="text-xs leading-none">{{ SEVERITY_ICON[a.type_alarm as 'info' | 'warning' | 'error'] || '' }}</span>
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

    <!-- Interventions -->
    <template v-else>
      <div class="mb-3 flex items-center gap-1.5 flex-wrap">
        <button
          v-for="s in (['open', 'resolved', 'all'] as const)"
          :key="s"
          @click="interventionStatusFilter = s"
          :class="[
            'font-mono text-[10px] uppercase tracking-[0.18em] px-3 py-1.5 rounded-md border transition',
            interventionStatusFilter === s
              ? 'border-signal/50 text-signal bg-signal-soft'
              : 'border-border text-muted-foreground hover:text-foreground',
          ]"
        >
          {{ s === 'open' ? 'Ouvertes' : s === 'resolved' ? 'Résolues' : 'Toutes' }}
        </button>
      </div>

      <div
        v-if="interventionsLoading && !interventions.length"
        class="border border-border rounded-md bg-card/40 p-8 text-center font-mono text-sm text-muted-foreground"
      >
        <span class="blink">▍</span> chargement des interventions…
      </div>
      <div
        v-else-if="interventionsError"
        class="border border-offline/40 rounded-md bg-offline-soft p-5 font-mono text-sm text-offline"
      >
        ERR · {{ interventionsError }}
      </div>
      <div
        v-else-if="filteredInterventions.length === 0"
        class="border border-border rounded-md bg-card/40 p-6 text-sm text-muted-foreground"
      >
        Aucune intervention terrain pour ces filtres.
      </div>
      <div v-else class="border border-border rounded-md bg-card/40 overflow-x-auto fade-up" style="animation-delay: 100ms">
        <table class="w-full text-sm min-w-[840px]">
          <thead>
            <tr class="border-b border-border bg-card/60">
              <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-3 w-[140px]">Date</th>
              <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-3 w-[100px]">Sévérité</th>
              <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-3 w-[120px]">Catégorie</th>
              <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-3">Device</th>
              <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-3">Technicien</th>
              <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-3">Message</th>
              <th class="text-right font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-3 w-[150px]">Statut</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in filteredInterventions"
              :key="row.id"
              class="border-b border-border/50 last:border-0 hover:bg-secondary/40 transition cursor-pointer"
              @click="openDetail(row)"
            >
              <td class="px-4 py-3 font-mono text-xs text-muted-foreground tabular whitespace-nowrap">
                {{ fmtFullDate(row.created_at) }}
              </td>
              <td class="px-4 py-3">
                <span
                  :class="['inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded', typeClass(row.severity)]"
                >
                  <span class="text-xs leading-none">{{ SEVERITY_ICON[row.severity] }}</span>
                  {{ row.severity }}
                </span>
              </td>
              <td class="px-4 py-3 font-mono text-xs text-muted-foreground">{{ row.category }}</td>
              <td class="px-4 py-3" @click.stop>
                <button
                  @click="openDevice(row.device_id)"
                  class="font-medium hover:text-signal transition text-left"
                >
                  {{ deviceNameById.get(row.device_id) || '—' }}
                </button>
              </td>
              <td class="px-4 py-3">
                <div class="font-medium">{{ row.technician_name }}</div>
                <div v-if="row.technician_contact" class="font-mono text-[11px] text-muted-foreground">
                  {{ row.technician_contact }}
                </div>
              </td>
              <td class="px-4 py-3 text-muted-foreground text-xs max-w-[360px]">
                <div class="line-clamp-2">{{ row.message || '—' }}</div>
                <div
                  v-if="row.photo_paths.length"
                  class="mt-1 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-signal"
                >
                  <svg viewBox="0 0 24 24" class="size-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2z" />
                    <circle cx="9" cy="9" r="2" />
                    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                  </svg>
                  {{ row.photo_paths.length }} photo{{ row.photo_paths.length > 1 ? 's' : '' }}
                </div>
              </td>
              <td class="px-4 py-3 text-right" @click.stop>
                <button
                  @click="toggleInterventionStatus(row)"
                  :class="[
                    'font-mono text-[10px] uppercase tracking-wider px-2.5 py-1 rounded transition',
                    row.status === 'open'
                      ? 'bg-amber/15 text-amber hover:bg-amber/25'
                      : 'bg-signal-soft text-signal hover:bg-signal/20',
                  ]"
                >
                  {{ row.status === 'open' ? 'Marquer résolu' : '✓ Résolu' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
    <!-- Detail modal -->
    <Teleport to="body">
      <div
        v-if="detailRow"
        @click.self="closeDetail"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/85 backdrop-blur-sm fade-up"
      >
        <div class="relative border border-border rounded-lg bg-card max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          <button
            @click="closeDetail"
            class="absolute top-3 right-3 size-8 inline-flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-signal/60 transition z-10"
            aria-label="Fermer"
          >
            <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>

          <div class="p-6 space-y-5">
            <div class="flex items-center gap-2 flex-wrap">
              <span
                :class="['inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded', typeClass(detailRow.severity)]"
              >
                <span class="text-xs leading-none">{{ SEVERITY_ICON[detailRow.severity] }}</span>
                {{ detailRow.severity }}
              </span>
              <span class="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                {{ detailRow.category }}
              </span>
              <span
                :class="[
                  'font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ml-auto',
                  detailRow.status === 'open' ? 'bg-amber/15 text-amber' : 'bg-signal-soft text-signal',
                ]"
              >
                {{ detailRow.status === 'open' ? 'Ouverte' : 'Résolue' }}
              </span>
            </div>

            <div>
              <div class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                Équipement
              </div>
              <button
                @click="openDevice(detailRow.device_id)"
                class="text-lg font-semibold tracking-tight hover:text-signal transition"
              >
                {{ deviceNameById.get(detailRow.device_id) || '—' }}
              </button>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Date</div>
                <div class="font-mono text-sm">{{ fmtFullDate(detailRow.created_at) }}</div>
              </div>
              <div>
                <div class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Technicien</div>
                <div>{{ detailRow.technician_name }}</div>
                <div v-if="detailRow.technician_contact" class="font-mono text-[11px] text-muted-foreground">
                  {{ detailRow.technician_contact }}
                </div>
              </div>
            </div>

            <div v-if="detailRow.message">
              <div class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Commentaire</div>
              <div class="text-sm whitespace-pre-wrap leading-relaxed border border-border rounded-md bg-card/40 p-4">
                {{ detailRow.message }}
              </div>
            </div>

            <div v-if="detailRow.photo_paths.length">
              <div class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                Photos ({{ detailRow.photo_paths.length }})
              </div>
              <div
                v-if="!detailPhotoUrls.length"
                class="font-mono text-xs text-muted-foreground"
              >
                <span class="blink">▍</span> chargement…
              </div>
              <div v-else class="grid grid-cols-3 gap-2">
                <button
                  v-for="(url, i) in detailPhotoUrls"
                  :key="i"
                  type="button"
                  @click="openLightbox(i)"
                  class="aspect-square border border-border rounded-md overflow-hidden bg-card hover:border-signal/60 transition relative group"
                >
                  <img :src="url" class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition" />
                </button>
              </div>
            </div>

            <div class="pt-2 flex justify-end gap-2">
              <button
                @click="toggleInterventionStatus(detailRow); closeDetail()"
                :class="[
                  'font-mono text-[11px] uppercase tracking-[0.22em] px-4 py-2 rounded-md transition',
                  detailRow.status === 'open'
                    ? 'bg-signal text-primary-foreground hover:brightness-110'
                    : 'border border-border text-foreground hover:border-offline/60 hover:text-offline',
                ]"
              >
                {{ detailRow.status === 'open' ? 'Marquer résolu' : 'Rouvrir' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Photo lightbox -->
    <Teleport to="body">
      <div
        v-if="detailLightbox !== null && detailPhotoUrls[detailLightbox]"
        @click.self="closeLightbox"
        class="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-background/95 backdrop-blur-md fade-up"
      >
        <button
          @click="closeLightbox"
          class="absolute top-4 right-4 size-10 inline-flex items-center justify-center rounded-full bg-card/80 text-foreground border border-border hover:border-signal/60 transition"
          aria-label="Fermer"
        >
          <svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
        <button
          v-if="detailPhotoUrls.length > 1"
          @click="detailLightbox = (detailLightbox - 1 + detailPhotoUrls.length) % detailPhotoUrls.length"
          class="absolute left-4 size-10 inline-flex items-center justify-center rounded-full bg-card/80 text-foreground border border-border hover:border-signal/60 transition"
          aria-label="Précédente"
        >
          <svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <button
          v-if="detailPhotoUrls.length > 1"
          @click="detailLightbox = (detailLightbox + 1) % detailPhotoUrls.length"
          class="absolute right-4 size-10 inline-flex items-center justify-center rounded-full bg-card/80 text-foreground border border-border hover:border-signal/60 transition"
          aria-label="Suivante"
        >
          <svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
        <img
          :src="detailPhotoUrls[detailLightbox]"
          class="max-w-[92vw] max-h-[92vh] object-contain rounded-md shadow-2xl"
        />
      </div>
    </Teleport>
  </section>
</template>

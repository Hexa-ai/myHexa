<script setup lang="ts">
// PROTOTYPE — blocs d'alarmes (historique / statistiques) d'un tableau de bord.
// Données : événements des rapports journaliers (fichiers Parquet, ts-read mode alarms).
import { computed, ref, watch } from 'vue'
import type { DeviceWithStatus } from '@/composables/useDevices'
import { shiftRange, type Widget } from '@/composables/useDashboards'
import {
  fetchAlarms,
  fmtDur as fmtDuration,
  SEV_COLOR,
  SEV_LABEL,
  SEVERITIES,
  type AlarmResult,
  type Severity,
} from '@/composables/useAlarmHistory'

const props = defineProps<{
  widget: Widget
  range: [number, number]
  devices: Map<string, DeviceWithStatus>
  multiDevice: boolean
}>()

const w = computed(() => props.widget)
const isStats = computed(() => w.value.type === 'alarm_stats')
const ids = computed(() => [...new Set(w.value.sources.map((s) => s.device))])
const sevs = computed<Severity[]>(() => w.value.options.severities ?? ['error', 'warning'])
const limit = computed(() => w.value.options.limit ?? 20)
const data = ref<AlarmResult | null>(null)
const prev = ref<AlarmResult | null>(null)
const err = ref('')
const loading = ref(false)

async function load() {
  err.value = ''
  loading.value = true
  const f = { names: w.value.options.alarms ?? null, severities: sevs.value, limit: 2000 }
  try {
    const [a, b] = props.range
    const cmp =
      isStats.value && w.value.options.compare ? shiftRange([a, b], w.value.options.compare) : null
    const [cur, old] = await Promise.all([
      fetchAlarms(ids.value, a, b, f),
      cmp ? fetchAlarms(ids.value, cmp[0], cmp[1], f) : Promise.resolve(null),
    ])
    data.value = cur
    prev.value = old
  } catch (e) {
    err.value = (e as Error).message
  } finally {
    loading.value = false
  }
}
watch(
  () => [
    props.range[0],
    props.range[1],
    JSON.stringify(w.value.sources),
    JSON.stringify(w.value.options),
  ],
  load,
  { immediate: true },
)

const devName = (id: string) => props.devices.get(id)?.name ?? '—'
const fmtDate = (t: number) =>
  new Date(t).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
const pct = (x: number) => (x >= 10 ? x.toFixed(0) : x.toFixed(1)).replace('.', ',') + ' %'

const rows = computed(() => (data.value?.occurrences ?? []).slice(0, limit.value))
const stats = computed(() => data.value?.stats ?? [])
const prevCount = (dev: string, name: string) =>
  prev.value
    ? (prev.value.stats.find((r) => r.device === dev && r.name === name)?.count ?? 0)
    : null
const totals = computed(() =>
  SEVERITIES.filter((s) => sevs.value.includes(s)).map((s) => ({
    sev: s,
    ...(data.value?.totals[s] ?? { count: 0, duration: 0 }),
    prev: prev.value ? prev.value.totals[s].count : null,
  })),
)
const maxCount = computed(() => Math.max(1, ...stats.value.map((r) => r.count)))
const label = (dev: string, name: string) =>
  props.multiDevice ? `${devName(dev)} · ${name}` : name
const delta = (cur: number, old: number | null) => {
  if (old === null) return ''
  const d = cur - old
  return d === 0 ? '=' : (d > 0 ? '+' : '') + d
}
</script>

<template>
  <div :data-testid="isStats ? 'alarm-stats' : 'alarm-history'" class="min-w-0">
    <p v-if="err" class="text-xs text-offline">{{ err }}</p>
    <p v-else-if="loading && !data" class="text-xs text-muted-foreground">chargement…</p>
    <p
      v-else-if="data && !data.total"
      class="text-xs text-muted-foreground"
      data-testid="alarm-empty"
    >
      Aucune alarme sur la période.
    </p>

    <!-- historique : une ligne par occurrence -->
    <template v-else-if="data && !isStats">
      <div class="overflow-x-auto">
        <table class="w-full text-xs">
          <thead>
            <tr
              class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground text-left"
            >
              <th class="font-medium py-1 pr-2">Début</th>
              <th class="font-medium py-1 px-2">Fin</th>
              <th class="font-medium py-1 px-2 text-right">Durée</th>
              <th class="font-medium py-1 px-2">Alarme</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="o in rows"
              :key="o.device + o.name + o.start"
              class="border-t border-border/50"
              data-testid="alarm-row"
            >
              <td class="py-1 pr-2 font-mono tabular whitespace-nowrap text-muted-foreground">
                {{ fmtDate(o.start) }}
              </td>
              <td class="py-1 px-2 font-mono tabular whitespace-nowrap">
                <span v-if="o.end" class="text-muted-foreground">{{ fmtDate(o.end) }}</span>
                <span v-else class="text-offline">en cours</span>
              </td>
              <td class="py-1 px-2 font-mono tabular text-right whitespace-nowrap">
                {{ fmtDuration(o.duration) }}
              </td>
              <td class="py-1 px-2 min-w-0">
                <span
                  class="inline-block size-2 rounded-full mr-1.5 align-middle"
                  :style="{ background: SEV_COLOR[o.severity] }"
                  :title="SEV_LABEL[o.severity]"
                />
                <span class="font-mono">{{ label(o.device, o.name) }}</span>
                <span
                  v-if="o.description && o.description !== o.name"
                  class="text-muted-foreground"
                >
                  · {{ o.description }}</span
                >
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="data.total > rows.length" class="mt-1 text-[11px] text-muted-foreground">
        + {{ data.total - rows.length }} autres occurrences sur la période
      </p>
    </template>

    <!-- statistiques : une ligne par alarme -->
    <template v-else-if="data">
      <div
        class="flex flex-wrap gap-x-4 gap-y-1 mb-2 font-mono text-[11px]"
        data-testid="alarm-totals"
      >
        <span v-for="t in totals" :key="t.sev">
          <span
            class="inline-block size-2 rounded-full mr-1 align-middle"
            :style="{ background: SEV_COLOR[t.sev] }"
          />
          {{ SEV_LABEL[t.sev] }} : {{ t.count }}
          <span class="text-muted-foreground">({{ fmtDuration(t.duration) }})</span>
          <span v-if="t.prev !== null" class="text-muted-foreground">
            · période comparée : {{ t.prev }}</span
          >
        </span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-xs">
          <thead>
            <tr
              class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground text-right"
            >
              <th class="font-medium py-1 pr-2 text-left">Alarme</th>
              <th class="font-medium py-1 px-2">Nb</th>
              <th v-if="prev" class="font-medium py-1 px-2">Écart</th>
              <th class="font-medium py-1 px-2">% nb</th>
              <th class="font-medium py-1 px-2">Durée</th>
              <th class="font-medium py-1 px-2">% durée</th>
              <th
                class="font-medium py-1 px-2"
                title="part du temps de la période passée en alarme"
              >
                Présence
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="r in stats"
              :key="r.device + r.name"
              class="border-t border-border/50 text-right"
              data-testid="alarm-stat-row"
            >
              <td class="py-1 pr-2 text-left min-w-0">
                <span
                  class="inline-block size-2 rounded-full mr-1.5 align-middle"
                  :style="{ background: SEV_COLOR[r.severity] }"
                />
                <span class="font-mono">{{ label(r.device, r.name) }}</span>
                <span v-if="r.ongoing" class="ml-1 text-offline">en cours</span>
                <div v-if="w.options.chart" class="h-1.5 mt-1 rounded bg-secondary">
                  <div
                    class="h-1.5 rounded"
                    :style="{
                      width: (r.count / maxCount) * 100 + '%',
                      background: SEV_COLOR[r.severity],
                    }"
                  />
                </div>
              </td>
              <td class="py-1 px-2 font-mono tabular">{{ r.count }}</td>
              <td v-if="prev" class="py-1 px-2 font-mono tabular text-muted-foreground">
                {{ delta(r.count, prevCount(r.device, r.name)) }}
              </td>
              <td class="py-1 px-2 font-mono tabular">{{ pct(r.share_count) }}</td>
              <td class="py-1 px-2 font-mono tabular whitespace-nowrap">
                {{ fmtDuration(r.duration) }}
              </td>
              <td class="py-1 px-2 font-mono tabular">{{ pct(r.share_duration) }}</td>
              <td class="py-1 px-2 font-mono tabular">{{ pct(r.presence) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

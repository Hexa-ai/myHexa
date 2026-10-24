<script setup lang="ts">
// PROTOTYPE — rendu d'un bloc de tableau de bord (commun aux futurs rapports).
import { computed } from 'vue'
import HistoryChart from '@/components/HistoryChart.vue'
import type { DeviceWithStatus } from '@/composables/useDevices'
import type { HistPoint, HistVar } from '@/composables/useHistory'
import {
  combine,
  fmtDuration,
  fmtValue,
  key,
  OP_LABEL,
  STAT_LABEL,
  STATUS_FIELDS,
  stateDurations,
  statOf,
  type SeriesMap,
  type Widget,
} from '@/composables/useDashboards'
import { formatRelative, isOnline } from '@/lib/utils'

const props = defineProps<{
  widget: Widget
  data: SeriesMap
  compareData?: SeriesMap | null
  range: [number, number]
  devices: Map<string, DeviceWithStatus>
  catalogs: Record<string, HistVar[]>
  multiDevice: boolean
}>()

const COLORS = ['#00d4aa', '#5b8cff', '#f5a524', '#e05dd0', '#ff7a7a', '#8bd450']
const w = computed(() => props.widget)
const meta = (dev: string, v: string) => props.catalogs[dev]?.find((x) => x.var === v) ?? null
const devName = (id: string) => props.devices.get(id)?.name ?? '—'
const srcLabel = (dev: string, v: string) => (props.multiDevice ? `${devName(dev)} · ${v}` : v)

/** séries du bloc : une combinée si op, sinon une par source */
function seriesOf(map: SeriesMap | null | undefined) {
  if (!map) return []
  const list = w.value.sources
    .filter((s) => s.var)
    .map((s) => ({ s, ser: map.get(key(s)), m: meta(s.device, s.var) }))
    .filter((x) => !!x.ser)
  if (w.value.op && list.length > 1)
    return [
      {
        label: `${OP_LABEL[w.value.op]} · ${list.length} sources`,
        unit: list[0].m?.unit ?? list[0].ser!.unit,
        counter: list[0].m?.category === 'counter',
        state: false,
        points: combine(
          list.map((x) => x.ser!),
          w.value.op,
        ),
        desc: list.map((x) => srcLabel(x.s.device, x.s.var)).join(' + '),
      },
    ]
  return list.map((x) => ({
    label: srcLabel(x.s.device, x.s.var),
    unit: x.m?.unit ?? x.ser!.unit,
    counter: (x.m?.category ?? x.ser!.category) === 'counter',
    state: ['state', 'alarm'].includes(x.m?.category ?? ''),
    points: x.ser!.points,
    desc: x.m?.description ?? '',
  }))
}
const series = computed(() => seriesOf(props.data))
const compare = computed(() => seriesOf(props.compareData))

const title = computed(() => {
  if (w.value.title) return w.value.title
  if (series.value.length === 1) return series.value[0].label
  const first = w.value.sources.find((s) => s.var)
  if (!first || (['curve', 'bars', 'states'].includes(w.value.type) && w.value.sources.length > 1))
    return ''
  return (
    srcLabel(first.device, first.var) +
    (w.value.sources.length > 1 && w.value.op ? ` (+${w.value.sources.length - 1})` : '')
  )
})
const stat = computed(() => w.value.options.stat ?? (series.value[0]?.counter ? 'total' : 'last'))

/** valeur d'une tuile : « dernière » d'une seule source = valeur en direct du statut si plus récente */
function liveValue(): number | null {
  const s = w.value.sources[0]
  if (!s || w.value.sources.length !== 1) return null
  const d = props.devices.get(s.device)
  const vars = (d?.status_payload as { variables?: { name?: string; value?: unknown }[] } | null)
    ?.variables
  const v = vars?.find((x) => x.name === s.var)?.value
  return typeof v === 'number'
    ? v
    : typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))
      ? Number(v)
      : null
}
const tileValue = computed(() => {
  const s = series.value[0]
  if (stat.value === 'last' && props.range[1] >= Date.now() - 60e3) {
    const live = liveValue()
    if (live !== null) return live
  }
  return s ? statOf(s.points, stat.value, s.counter) : null
})
const compareValue = computed(() => {
  const s = compare.value[0]
  return s ? statOf(s.points, stat.value, s.counter) : null
})
const delta = computed(() =>
  tileValue.value !== null && compareValue.value !== null && compareValue.value !== 0
    ? ((tileValue.value - compareValue.value) / Math.abs(compareValue.value)) * 100
    : null,
)

// jauge : min / max de la période, sauf bornes fixées
const gauge = computed(() => {
  const s = series.value[0]
  const lo = w.value.options.min ?? (s ? statOf(s.points, 'min', false) : null) ?? 0
  const hi = w.value.options.max ?? (s ? statOf(s.points, 'max', false) : null) ?? 1
  const v = tileValue.value ?? lo
  const f = hi > lo ? Math.min(Math.max((v - lo) / (hi - lo), 0), 1) : 0.5
  const a = Math.PI * (1 - f)
  return { lo, hi, f, x: 60 + 48 * Math.cos(a), y: 60 - 48 * Math.sin(a) }
})

function barMs(points: HistPoint[]) {
  let m = Infinity
  for (let i = 1; i < points.length; i++) m = Math.min(m, points[i][0] - points[i - 1][0])
  const span = props.range[1] - props.range[0]
  const def = span <= 3 * 864e5 ? 3600e3 : span <= 124 * 864e5 ? 864e5 : 7 * 864e5
  return Number.isFinite(m) ? Math.min(m, def) : def
}

// statut
const statusDevices = computed(() =>
  (w.value.sources.length ? w.value.sources.map((s) => s.device) : [])
    .filter((id, i, a) => a.indexOf(id) === i)
    .map((id) => props.devices.get(id))
    .filter((d) => !!d),
)
interface StatusPayload {
  device?: { hostname?: string; version?: string; uptime?: number }
  network?: Record<string, { ip?: string | null; signal?: number | null; connected?: boolean }>
  services?: Record<string, { enabled?: boolean; active?: boolean }>
}
function statusRows(d: DeviceWithStatus): [string, string, string?][] {
  const p = (d.status_payload ?? {}) as StatusPayload
  const fields = w.value.options.fields ?? ['online', 'last_seen']
  const online = isOnline(d.last_connection_at)
  const rows: [string, string, string?][] = []
  for (const f of fields) {
    if (f === 'online')
      rows.push([
        STATUS_FIELDS.online,
        online ? 'Connectée' : 'Déconnectée',
        online ? 'text-signal' : 'text-offline',
      ])
    if (f === 'last_seen')
      rows.push([STATUS_FIELDS.last_seen, formatRelative(d.last_connection_at)])
    if (f === 'uptime' && p.device?.uptime)
      rows.push([STATUS_FIELDS.uptime, fmtDuration(p.device.uptime * 1000)])
    if (f === 'version' && p.device?.version) rows.push([STATUS_FIELDS.version, p.device.version])
    if (f === 'hostname' && p.device?.hostname)
      rows.push([STATUS_FIELDS.hostname, p.device.hostname])
    if (f === 'ip') {
      const ips = Object.entries(p.network ?? {})
        .filter(([, n]) => n?.ip)
        .map(([k, n]) => `${k} ${n.ip}`)
      if (ips.length) rows.push([STATUS_FIELDS.ip, ips.join(' · ')])
    }
    if (f === 'signal') {
      const s = Object.values(p.network ?? {}).find((n) => n?.signal != null)?.signal
      if (s != null) rows.push([STATUS_FIELDS.signal, `${s} %`])
    }
    if (f === 'services') {
      const on = Object.entries(p.services ?? {})
        .filter(([, s]) => s?.enabled)
        .map(([k]) => k)
      if (on.length) rows.push([STATUS_FIELDS.services, on.join(', ')])
    }
  }
  return rows
}

const tableRows = computed(() =>
  w.value.sources
    .filter((s) => s.var)
    .map((s) => {
      const ser = props.data.get(key(s))
      const m = meta(s.device, s.var)
      const pts = ser?.points ?? []
      const counter = m?.category === 'counter'
      return {
        label: srcLabel(s.device, s.var),
        desc: m?.description ?? '',
        unit: m?.unit ?? '',
        min: statOf(pts, 'min', counter),
        mean: statOf(pts, 'mean', counter),
        max: statOf(pts, 'max', counter),
        last: statOf(pts, counter ? 'total' : 'last', counter),
        counter,
      }
    }),
)
</script>

<template>
  <div
    class="h-full border border-border rounded-md bg-card/40 p-3 sm:p-4 flex flex-col min-w-0"
    :data-testid="`widget-${w.type}`"
  >
    <div v-if="title && w.type !== 'image'" class="flex items-baseline gap-2 mb-2 min-w-0">
      <h3 class="text-sm font-medium tracking-tight truncate shrink-0 max-w-full">{{ title }}</h3>
      <span
        v-if="series[0]?.unit && ['curve', 'bars'].includes(w.type)"
        class="font-mono text-[10px] text-muted-foreground"
        >{{ series[0].unit }}</span
      >
      <span
        v-if="series.length === 1 && series[0].desc && ['curve', 'bars'].includes(w.type)"
        class="text-[11px] text-muted-foreground truncate"
        >{{ series[0].desc }}</span
      >
    </div>

    <!-- courbe / barres -->
    <template v-if="w.type === 'curve' || w.type === 'bars'">
      <div
        v-if="!series.length"
        class="flex-1 flex items-center justify-center font-mono text-xs text-muted-foreground"
      >
        pas de données
      </div>
      <div v-for="(s, i) in series" :key="s.label" class="min-w-0">
        <div v-if="series.length > 1" class="font-mono text-[10px] text-muted-foreground mt-1">
          {{ s.label }}
        </div>
        <HistoryChart
          :points="s.points"
          :label="s.label"
          :unit="s.unit"
          :color="COLORS[i % COLORS.length]"
          :from="range[0]"
          :to="range[1]"
          :step="s.state"
          :band="w.type === 'curve'"
          :bars="w.type === 'bars' || s.counter ? barMs(s.points) : 0"
          :gap-ms="2 * 3600e3"
          :height="series.length > 1 ? '120px' : '170px'"
        />
      </div>
    </template>

    <!-- tuile valeur -->
    <template v-else-if="w.type === 'value'">
      <div class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {{ STAT_LABEL[stat] }}
      </div>
      <div class="mt-1 flex items-baseline gap-1.5">
        <span class="text-3xl font-semibold tabular tracking-tight" data-testid="tile-value">{{
          fmtValue(tileValue, w.options.decimals)
        }}</span>
        <span class="font-mono text-sm text-muted-foreground">{{ series[0]?.unit }}</span>
      </div>
      <div
        v-if="delta !== null"
        class="mt-1 font-mono text-[11px]"
        :class="delta >= 0 ? 'text-signal' : 'text-offline'"
      >
        {{ delta >= 0 ? '+' : '' }}{{ fmtValue(delta, 1) }} % vs
        {{ w.options.compare === 'year' ? 'l\u2019an dernier' : 'période précédente' }}
      </div>
      <div
        v-if="series[0]?.desc && !w.title"
        class="mt-auto pt-1 text-[11px] text-muted-foreground truncate"
      >
        {{ series[0].desc }}
      </div>
    </template>

    <!-- jauge -->
    <template v-else-if="w.type === 'gauge'">
      <svg viewBox="0 0 120 70" class="w-full max-w-[220px] mx-auto">
        <path
          d="M12 60 A48 48 0 0 1 108 60"
          fill="none"
          stroke="currentColor"
          stroke-opacity=".12"
          stroke-width="10"
          stroke-linecap="round"
        />
        <path
          :d="`M12 60 A48 48 0 0 1 ${gauge.x.toFixed(2)} ${gauge.y.toFixed(2)}`"
          fill="none"
          stroke="#00d4aa"
          stroke-width="10"
          stroke-linecap="round"
        />
        <text
          x="60"
          y="52"
          text-anchor="middle"
          class="fill-current"
          font-size="15"
          font-weight="600"
        >
          {{ fmtValue(tileValue, w.options.decimals) }}
        </text>
        <text x="60" y="66" text-anchor="middle" class="fill-current" opacity=".6" font-size="7">
          {{ series[0]?.unit }}
        </text>
        <text x="12" y="69" text-anchor="middle" class="fill-current" opacity=".55" font-size="6">
          {{ fmtValue(gauge.lo) }}
        </text>
        <text x="108" y="69" text-anchor="middle" class="fill-current" opacity=".55" font-size="6">
          {{ fmtValue(gauge.hi) }}
        </text>
      </svg>
      <div class="text-center font-mono text-[10px] text-muted-foreground">
        min / max de la période
      </div>
    </template>

    <!-- statut -->
    <template v-else-if="w.type === 'status'">
      <div class="space-y-3">
        <div v-for="d in statusDevices" :key="d.id">
          <div v-if="statusDevices.length > 1" class="flex items-center gap-2 text-sm font-medium">
            <span
              :class="[
                'size-1.5 rounded-full',
                isOnline(d.last_connection_at) ? 'bg-signal' : 'bg-offline/70',
              ]"
            />
            <RouterLink
              :to="{ name: 'admin-device-detail', params: { id: d.id } }"
              class="hover:text-signal"
              >{{ d.name }}</RouterLink
            >
          </div>
          <dl
            class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm"
            :class="statusDevices.length > 1 ? 'pl-3.5 mt-1 text-xs' : ''"
          >
            <template
              v-for="r in statusRows(d).filter(
                (x) => statusDevices.length === 1 || x[0] !== 'Connexion',
              )"
              :key="r[0]"
            >
              <dt
                class="font-mono text-[10px] uppercase tracking-wider text-muted-foreground self-center"
              >
                {{ r[0] }}
              </dt>
              <dd :class="['font-mono text-xs truncate', r[2]]">{{ r[1] }}</dd>
            </template>
          </dl>
        </div>
      </div>
    </template>

    <!-- image -->
    <template v-else-if="w.type === 'image'">
      <img
        :src="w.options.url || '/hai-p-gateway.png'"
        :alt="w.title ?? ''"
        class="flex-1 w-full max-h-56 object-contain"
      />
      <div v-if="w.title" class="mt-1 text-center text-xs text-muted-foreground">{{ w.title }}</div>
    </template>

    <!-- créneaux d'états -->
    <template v-else-if="w.type === 'states'">
      <div v-for="(s, i) in series" :key="s.label" class="mb-2">
        <div v-if="series.length > 1" class="font-mono text-[10px] text-muted-foreground">
          {{ s.label }}
        </div>
        <HistoryChart
          :points="s.points"
          :label="s.label"
          :from="range[0]"
          :to="range[1]"
          step
          :band="false"
          :color="COLORS[i % COLORS.length]"
          height="90px"
        />
        <div class="flex flex-wrap gap-x-4 gap-y-1 mt-1 font-mono text-[11px]">
          <span v-for="st in stateDurations(s.points, range[0], range[1])" :key="st.value">
            <span class="text-muted-foreground">état {{ fmtValue(st.value) }} :</span>
            {{ fmtDuration(st.ms) }}
          </span>
        </div>
      </div>
    </template>

    <!-- tableau -->
    <template v-else-if="w.type === 'table'">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr
              class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground text-right"
            >
              <th class="text-left font-medium py-1 pr-3">Variable</th>
              <th class="font-medium py-1 px-2">Min</th>
              <th class="font-medium py-1 px-2">Moy.</th>
              <th class="font-medium py-1 px-2">Max</th>
              <th class="font-medium py-1 pl-2">Dernière / total</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="r in tableRows"
              :key="r.label"
              class="border-t border-border/50 text-right font-mono text-xs"
            >
              <td class="text-left py-1.5 pr-3 font-sans text-sm">
                {{ r.label }} <span class="text-muted-foreground text-[11px]">{{ r.unit }}</span>
                <div v-if="r.desc" class="text-[11px] text-muted-foreground truncate max-w-[260px]">
                  {{ r.desc }}
                </div>
              </td>
              <td class="px-2">{{ r.counter ? '' : fmtValue(r.min) }}</td>
              <td class="px-2">{{ fmtValue(r.mean) }}</td>
              <td class="px-2">{{ r.counter ? '' : fmtValue(r.max) }}</td>
              <td class="pl-2">{{ fmtValue(r.last) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <template v-else-if="w.type === 'text'">
      <p class="text-sm whitespace-pre-line">{{ w.options.text }}</p>
    </template>
  </div>
</template>

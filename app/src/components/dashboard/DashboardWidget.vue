<script setup lang="ts">
import DocumentsBlock from '@/components/dashboard/DocumentsBlock.vue'
import { seriesColors, useTheme } from '@/composables/useTheme'
import AlarmBlock from '@/components/dashboard/AlarmBlock.vue'
import InterventionsBlock from '@/components/dashboard/InterventionsBlock.vue'
import DeviceMap, { type MarkerInput } from '@/components/DeviceMap.vue'
// PROTOTYPE — rendu d'un bloc de tableau de bord (commun aux futurs rapports).
import { computed } from 'vue'
const { uiStyle } = useTheme()
const appareil = computed(() => uiStyle.value === 'appareil')
/** graduations du bouton rotatif (style appareil) : 41 traits sur 270° */
const KNOB_TICKS = Array.from({ length: 41 }, (_, i) => {
  const a = ((-225 + (i * 270) / 40) * Math.PI) / 180
  const r2 = i % 10 ? 50 : 45
  return {
    i,
    x1: 60 + 54 * Math.cos(a),
    y1: 60 + 54 * Math.sin(a),
    x2: 60 + r2 * Math.cos(a),
    y2: 60 + r2 * Math.sin(a),
  }
})
const knobHand = (f: number, r = 30) => {
  const a = ((-225 + f * 270) * Math.PI) / 180
  return { x: 60 + r * Math.cos(a), y: 60 + r * Math.sin(a) }
}
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
  DEFAULT_STATES,
  combineStates,
  COMBINE_LABEL,
  shiftRange,
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
  /** tableau partagé : pas de lien vers la fiche des box (le destinataire n'y a pas accès) */
  noLinks?: boolean
}>()

const COLORS = seriesColors(['#00d4aa', '#5b8cff', '#f5a524', '#e05dd0', '#ff7a7a', '#8bd450'])
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

/** plusieurs courbes dans une seule tuile : 1re unité à gauche, les autres à droite */
const overlay = computed(
  () =>
    series.value.length > 1 &&
    !w.value.op &&
    !w.value.options.separate &&
    w.value.type !== 'states',
)
const overlayExtra = computed(() => {
  const leftUnit = series.value[0]?.unit ?? ''
  return series.value.slice(1).map((s, i) => ({
    points: s.points,
    label: s.label,
    unit: s.unit,
    color: COLORS[(i + 1) % COLORS.length],
    axis: (s.unit ?? '') === leftUnit ? ('left' as const) : ('right' as const),
    step: s.state,
  }))
})
const compare = computed(() => seriesOf(props.compareData))
// courbes / barres : la période de comparaison est recalée sur l'axe courant (pointillés de la même couleur)
const chartCompare = computed(
  () => w.value.options.compare && ['curve', 'bars'].includes(w.value.type),
)
const cmpShift = computed(() =>
  w.value.options.compare
    ? props.range[0] - shiftRange(props.range, w.value.options.compare)[0]
    : 0,
)
function cmpPoints(label: string): HistPoint[] | null {
  if (!chartCompare.value) return null
  const c = compare.value.find((x) => x.label === label)
  if (!c) return null
  // recalage à heure locale égale (changement d'heure : pas de décalage d'1 h des cases)
  const tzo = (t: number) => new Date(t).getTimezoneOffset() * 60e3
  return c.points
    .map((p) => {
      const t = p[0] + cmpShift.value
      return [t + tzo(t) - tzo(p[0]), p[1], p[2], p[3]] as HistPoint
    })
    .filter((p) => p[0] >= props.range[0] && p[0] < props.range[1])
}
const cmpShort = computed(() =>
  w.value.options.compare === 'year' ? 'an dernier' : 'période préc.',
)

const title = computed(() => {
  if (w.value.title) return w.value.title
  if (w.value.type === 'map') return 'Localisation'
  if (w.value.type === 'alarm_history') return 'Historique des alarmes'
  if (w.value.type === 'alarm_stats') return 'Statistiques des alarmes'
  if (series.value.length === 1) return series.value[0].label
  const first = w.value.sources.find((s) => s.var)
  const multiNoOp = w.value.sources.filter((x) => x.var).length > 1 && !w.value.op
  if (
    !first ||
    multiNoOp ||
    (['curve', 'bars', 'states'].includes(w.value.type) && w.value.sources.length > 1)
  )
    return ''
  return (
    srcLabel(first.device, first.var) +
    (w.value.sources.length > 1 && w.value.op ? ` (+${w.value.sources.length - 1})` : '')
  )
})
const stat = computed(() =>
  w.value.type === 'indicator'
    ? 'last'
    : (w.value.options.stat ?? (series.value[0]?.counter ? 'total' : 'last')),
)

/** valeur en direct (statut) d'une variable, si disponible */
function liveOf(dev: string, name: string): number | null {
  const d = props.devices.get(dev)
  const vars = (d?.status_payload as { variables?: { name?: string; value?: unknown }[] } | null)
    ?.variables
  const v = vars?.find((x) => x.name === name)?.value
  if (typeof v === 'boolean') return v ? 1 : 0
  return typeof v === 'number'
    ? v
    : typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))
      ? Number(v)
      : null
}
const isLive = computed(() => props.range[1] >= Date.now() - 60e3)

/** tuiles valeur / jauges / voyants : un élément par variable, ou un seul si une opération les combine */
interface Item {
  label: string
  unit: string | null
  desc: string
  value: number | null
  delta: number | null
  lo: number
  hi: number
  x: number
  y: number
  f: number
}
const items = computed<Item[]>(() => {
  const srcs = w.value.sources.filter((s) => s.var)
  const st = stat.value
  const build = (i: number): Item | null => {
    const ser = series.value[i]
    if (!ser && !srcs[i]) return null
    let value: number | null = null
    // valeur en direct du statut pour une variable seule (pas pour un agrégat)
    if (st === 'last' && isLive.value && !(w.value.op && srcs.length > 1) && srcs[i])
      value = liveOf(srcs[i].device, srcs[i].var)
    if (value === null && ser) value = statOf(ser.points, st, ser.counter)
    const cmpSer = compare.value[i]
    const cmp = cmpSer ? statOf(cmpSer.points, st, cmpSer.counter) : null
    const delta =
      value !== null && cmp !== null && cmp !== 0 ? ((value - cmp) / Math.abs(cmp)) * 100 : null
    const lo = w.value.options.min ?? (ser ? statOf(ser.points, 'min', false) : null) ?? 0
    const hi = w.value.options.max ?? (ser ? statOf(ser.points, 'max', false) : null) ?? 1
    const f = hi > lo ? Math.min(Math.max(((value ?? lo) - lo) / (hi - lo), 0), 1) : 0.5
    const ang = Math.PI * (1 - f)
    const m = srcs[i] ? meta(srcs[i].device, srcs[i].var) : null
    return {
      label: ser?.label ?? (srcs[i] ? srcLabel(srcs[i].device, srcs[i].var) : ''),
      unit: ser?.unit ?? m?.unit ?? null,
      desc: ser?.desc ?? m?.description ?? '',
      value,
      delta,
      lo,
      hi,
      f,
      x: 60 + 48 * Math.cos(ang),
      y: 60 - 48 * Math.sin(ang),
    }
  }
  const n = w.value.op && srcs.length > 1 ? 1 : Math.max(srcs.length, series.value.length)
  return Array.from({ length: n }, (_, i) => build(i)).filter((x): x is Item => !!x)
})
const many = computed(() => items.value.length > 1 && !w.value.options.combine)

/** voyant en synthèse : un seul état calculé + la liste des variables actives */
const combined = computed(() => {
  const mode = w.value.options.combine
  if (w.value.type !== 'indicator' || !mode || items.value.length < 2) return null
  const value = combineStates(
    items.value.map((i) => i.value),
    mode,
  )
  return {
    value,
    active: items.value.filter((i) => i.value !== null && i.value !== 0).map((i) => i.label),
    mode,
  }
})

/** carte : une box par source ; si une variable est choisie, le repère prend la couleur de son état */
const mapMarkers = computed<MarkerInput[]>(() => {
  if (w.value.type !== 'map') return []
  const seen = new Set<string>()
  const out: MarkerInput[] = []
  for (const src of w.value.sources) {
    if (seen.has(src.device)) continue
    seen.add(src.device)
    const d = props.devices.get(src.device)
    if (!d || d.latitude == null || d.longitude == null) continue
    const m: MarkerInput = {
      id: d.id,
      lat: Number(d.latitude),
      lng: Number(d.longitude),
      label: d.name ?? undefined,
      online: isOnline(d.last_connection_at),
    }
    if (src.var) {
      const look = lamp(liveOf(src.device, src.var))
      m.color = look.color
      m.stateText = `${src.var} : ${look.label}`
    }
    out.push(m)
  }
  return out
})
const mapMissing = computed(() =>
  w.value.type === 'map'
    ? [...new Set(w.value.sources.map((s) => s.device))].filter((id) => {
        const d = props.devices.get(id)
        return !d || d.latitude == null || d.longitude == null
      }).length
    : 0,
)

/** voyant : apparence de l'état courant (valeur exacte, sinon « autre ») */
function lamp(v: number | null) {
  const states = w.value.options.states?.length ? w.value.options.states : DEFAULT_STATES
  const hit = v === null ? null : states.find((s) => Number(s.value) === v)
  return (
    hit ?? {
      value: v ?? NaN,
      label: v === null ? 'inconnu' : `état ${fmtValue(v)}`,
      color: '#8a8f98',
      image: '',
    }
  )
}

/** couleur « chaude » (rouge) : en style appareil, la touche du voyant est remplie */
function isHot(color: string) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(color || '')
  if (!m) return false
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => parseInt(x, 16))
  return r > 170 && g < 110 && b < 110
}

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

const cmpText = computed(() =>
  w.value.options.compare === 'year' ? 'l\u2019an dernier' : 'période précédente',
)
const tableRows = computed(() =>
  w.value.sources
    .filter((s) => s.var)
    .map((s) => {
      const ser = props.data.get(key(s))
      const m = meta(s.device, s.var)
      const pts = ser?.points ?? []
      const counter = m?.category === 'counter'
      // comparaison : moyenne (ou total d'un compteur) contre la même statistique de la période de comparaison
      const c = props.compareData?.get(key(s))
      const main = statOf(pts, counter ? 'total' : 'mean', counter)
      const cm = c ? statOf(c.points, counter ? 'total' : 'mean', counter) : null
      return {
        delta: main !== null && cm !== null && cm !== 0 ? ((main - cm) / Math.abs(cm)) * 100 : null,
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
    class="w-mod h-full border border-border rounded-md bg-card/40 p-3 sm:p-4 flex flex-col min-w-0"
    :data-testid="`widget-${w.type}`"
  >
    <div v-if="title && w.type !== 'image'" class="flex items-baseline gap-2 mb-2 min-w-0">
      <h3 class="w-title text-sm font-medium tracking-tight truncate shrink-0 max-w-full">
        {{ title }}
      </h3>
      <span
        v-if="series[0]?.unit && !overlay && ['curve', 'bars'].includes(w.type)"
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
      <template v-else-if="overlay">
        <div
          class="flex flex-wrap gap-x-3 gap-y-0.5 mb-1 font-mono text-[10px]"
          data-testid="overlay-legend"
        >
          <span v-for="(s, i) in series" :key="s.label" class="inline-flex items-center gap-1">
            <span
              class="inline-block w-2.5 h-0.5"
              :style="{ background: COLORS[i % COLORS.length] }"
            />
            {{ s.label }} <span class="text-muted-foreground">{{ s.unit }}</span>
            <span v-if="i > 0 && overlayExtra[i - 1].axis === 'right'" class="text-muted-foreground"
              >(axe droit)</span
            >
          </span>
        </div>
        <HistoryChart
          :points="series[0].points"
          :label="series[0].label"
          :unit="series[0].unit"
          :color="COLORS[0]"
          :from="range[0]"
          :to="range[1]"
          :step="series[0].state"
          :band="false"
          :bars="w.type === 'bars' || series[0].counter ? barMs(series[0].points) : 0"
          :gap-ms="2 * 3600e3"
          :extra="overlayExtra"
          :thresholds="w.options.thresholds ?? []"
          :compare="series.map((s) => cmpPoints(s.label))"
          :compare-label="cmpShort"
          height="200px"
        />
      </template>
      <div v-for="(s, i) in overlay ? [] : series" :key="s.label" class="min-w-0">
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
          :compare="[cmpPoints(s.label)]"
          :thresholds="w.options.thresholds ?? []"
          :compare-label="cmpShort"
          :height="series.length > 1 ? '120px' : '170px'"
        />
      </div>
      <div
        v-if="chartCompare && series.length"
        class="mt-1 font-mono text-[10px] text-muted-foreground inline-flex items-center gap-1.5"
        data-testid="chart-compare-legend"
      >
        <span class="inline-block w-4 border-t border-dashed border-current" />
        {{ w.options.compare === 'year' ? 'même période l\u2019an dernier' : 'période précédente' }}
        <span v-if="!compare.length">(pas de données)</span>
      </div>
    </template>

    <!-- tuile valeur -->
    <template v-else-if="w.type === 'value'">
      <div class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {{ STAT_LABEL[stat] }}
      </div>
      <div :class="many ? 'mt-1 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 items-baseline' : ''">
        <template v-for="it in items" :key="it.label">
          <div v-if="many" class="text-xs truncate" :title="it.desc">{{ it.label }}</div>
          <div :class="many ? 'text-right' : 'mt-1'">
            <span
              :class="[
                many ? 'text-lg' : 'text-3xl big-num',
                'font-semibold tabular tracking-tight',
              ]"
              data-testid="tile-value"
              >{{ fmtValue(it.value, w.options.decimals) }}</span
            >
            <span class="w-unit font-mono text-sm text-muted-foreground ml-1">{{ it.unit }}</span>
            <div
              v-if="it.delta !== null"
              class="font-mono text-[11px]"
              :class="it.delta >= 0 ? 'text-signal' : 'text-offline'"
            >
              {{ it.delta >= 0 ? '+' : '' }}{{ fmtValue(it.delta, 1) }} % vs {{ cmpText }}
            </div>
          </div>
        </template>
      </div>
      <div
        v-if="!many && items[0]?.desc && !w.title"
        class="mt-auto pt-1 text-[11px] text-muted-foreground truncate"
      >
        {{ items[0].desc }}
      </div>
    </template>

    <!-- jauge(s) -->
    <template v-else-if="w.type === 'gauge'">
      <div
        :class="
          many ? 'grid grid-cols-2 sm:grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-2' : ''
        "
      >
        <div v-for="it in items" :key="it.label" class="min-w-0" data-testid="gauge-item">
          <div v-if="appareil" :class="['flex items-center gap-3', many ? 'flex-col' : '']">
            <svg viewBox="0 0 120 120" :class="['shrink-0', many ? 'w-[96px]' : 'w-[118px]']">
              <line
                v-for="t in KNOB_TICKS"
                :key="t.i"
                :x1="t.x1"
                :y1="t.y1"
                :x2="t.x2"
                :y2="t.y2"
                :stroke="t.i / 40 <= it.f ? 'currentColor' : 'var(--border)'"
                stroke-width="1.6"
              />
              <defs>
                <!-- néomorphisme : relief du bouton (ombre basse droite, reflet haut gauche) -->
                <filter id="knob-neu" x="-30%" y="-30%" width="160%" height="160%">
                  <feDropShadow
                    dx="3"
                    dy="3"
                    stdDeviation="3"
                    flood-color="#000"
                    flood-opacity=".18"
                  />
                  <feDropShadow
                    dx="-3"
                    dy="-3"
                    stdDeviation="3"
                    flood-color="#fff"
                    flood-opacity=".9"
                  />
                </filter>
                <radialGradient id="knob-face" cx="40%" cy="35%" r="75%">
                  <stop offset="0%" stop-color="var(--card)" />
                  <stop offset="100%" stop-color="var(--muted)" />
                </radialGradient>
              </defs>
              <circle class="knob-body" cx="60" cy="60" r="36" fill="var(--muted)" />
              <line
                x1="60"
                y1="60"
                :x2="knobHand(it.f).x"
                :y2="knobHand(it.f).y"
                class="knob-hand"
                :style="{ '--f': it.f }"
                stroke="var(--accent)"
                stroke-width="3"
                stroke-linecap="round"
              />
              <circle cx="60" cy="60" r="3" fill="currentColor" />
            </svg>
            <div class="min-w-0" :class="many ? 'text-center' : ''">
              <span class="big-num tabular" :class="many ? 'text-2xl' : 'text-4xl'">{{
                fmtValue(it.value, w.options.decimals)
              }}</span>
              <span class="w-unit font-mono text-xs text-muted-foreground ml-1">{{ it.unit }}</span>
              <div
                class="font-mono text-[10px] text-muted-foreground mt-1 uppercase tracking-widest"
              >
                {{ fmtValue(it.lo) }} — {{ fmtValue(it.hi) }}
              </div>
            </div>
          </div>
          <svg
            v-else
            viewBox="0 0 120 70"
            :class="['w-full mx-auto', many ? 'max-w-[150px]' : 'max-w-[220px]']"
          >
            <path
              d="M12 60 A48 48 0 0 1 108 60"
              fill="none"
              stroke="currentColor"
              stroke-opacity=".12"
              stroke-width="10"
              stroke-linecap="round"
            />
            <path
              :d="`M12 60 A48 48 0 0 1 ${it.x.toFixed(2)} ${it.y.toFixed(2)}`"
              fill="none"
              :stroke="COLORS[0]"
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
              {{ fmtValue(it.value, w.options.decimals) }}
            </text>
            <text
              x="60"
              y="66"
              text-anchor="middle"
              class="fill-current"
              opacity=".6"
              font-size="7"
            >
              {{ it.unit }}
            </text>
            <text
              x="12"
              y="69"
              text-anchor="middle"
              class="fill-current"
              opacity=".55"
              font-size="6"
            >
              {{ fmtValue(it.lo) }}
            </text>
            <text
              x="108"
              y="69"
              text-anchor="middle"
              class="fill-current"
              opacity=".55"
              font-size="6"
            >
              {{ fmtValue(it.hi) }}
            </text>
          </svg>
          <div
            v-if="it.delta !== null"
            class="text-center font-mono text-[11px]"
            :class="it.delta >= 0 ? 'text-signal' : 'text-offline'"
            data-testid="gauge-delta"
          >
            {{ it.delta >= 0 ? '+' : '' }}{{ fmtValue(it.delta, 1) }} % vs {{ cmpText }}
          </div>
          <div v-if="many" class="text-center text-[11px] truncate" :title="it.desc">
            {{ it.label }}
          </div>
        </div>
      </div>
      <div class="text-center font-mono text-[10px] text-muted-foreground mt-1">
        {{
          w.options.min != null || w.options.max != null
            ? 'bornes fixées'
            : 'min / max de la période'
        }}
      </div>
    </template>

    <!-- voyant de synthèse -->
    <template v-else-if="w.type === 'indicator' && combined">
      <div class="flex-1 flex items-center gap-3" data-testid="indicator-combined">
        <img
          v-if="lamp(combined.value).image"
          :src="lamp(combined.value).image"
          :alt="lamp(combined.value).label"
          class="size-16 object-contain shrink-0"
        />
        <span
          v-else
          class="size-8 rounded-full shrink-0 border border-black/10"
          :style="{
            background: lamp(combined.value).color,
            boxShadow: `0 0 10px ${lamp(combined.value).color}66`,
          }"
        />
        <div class="min-w-0">
          <div
            class="text-xl font-medium"
            :style="{ color: lamp(combined.value).color }"
            data-testid="indicator-label"
          >
            {{ lamp(combined.value).label }}
          </div>
          <div
            class="text-[11px] text-muted-foreground truncate"
            :title="combined.active.join(', ')"
          >
            {{ COMBINE_LABEL[combined.mode] }} sur {{ items.length }} ·
            {{ combined.active.length ? 'actifs : ' + combined.active.join(', ') : 'aucun actif' }}
          </div>
        </div>
      </div>
    </template>

    <!-- carte -->
    <template v-else-if="w.type === 'map'">
      <div
        v-if="mapMarkers.length"
        class="-mx-1 rounded overflow-hidden relative z-0 isolate"
        data-testid="widget-map-box"
      >
        <DeviceMap :markers="mapMarkers" height="260px" :zoom="12" />
      </div>
      <div v-else class="text-xs text-muted-foreground">
        Aucune des box choisies n'est localisée.
      </div>
      <div v-if="mapMissing" class="mt-1 font-mono text-[10px] text-muted-foreground">
        {{ mapMissing }} box sans position
      </div>
    </template>

    <!-- voyant(s) d'état -->
    <template v-else-if="w.type === 'indicator'">
      <div
        :class="
          many
            ? 'grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3'
            : 'flex-1 flex items-center justify-center'
        "
      >
        <div
          v-for="it in items"
          :key="it.label"
          :class="[
            'w-key flex items-center gap-2.5 min-w-0',
            isHot(lamp(it.value).color) && 'w-key-hot',
          ]"
          data-testid="indicator-item"
        >
          <img
            v-if="lamp(it.value).image"
            :src="lamp(it.value).image"
            :alt="lamp(it.value).label"
            :class="many ? 'size-10' : 'size-20'"
            class="object-contain shrink-0"
          />
          <span
            v-else
            :class="[many ? 'size-4' : 'size-8', 'rounded-full shrink-0 border border-black/10']"
            :style="{
              background: lamp(it.value).color,
              boxShadow: `0 0 10px ${lamp(it.value).color}66`,
            }"
          />
          <div class="min-w-0">
            <div v-if="many" class="text-xs truncate" :title="it.desc">{{ it.label }}</div>
            <div
              :class="[many ? 'text-sm' : 'text-xl', 'font-medium']"
              :style="{ color: lamp(it.value).color }"
              data-testid="indicator-label"
            >
              {{ lamp(it.value).label }}
            </div>
          </div>
        </div>
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
            <span v-if="noLinks">{{ d.name }}</span>
            <RouterLink
              v-else
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

    <!-- documents des box -->
    <DocumentsBlock
      v-else-if="w.type === 'document'"
      :ids="w.options.docs ?? []"
      :layout="w.options.docLayout ?? 'cards'"
    />

    <!-- alarmes : historique / statistiques (rapports journaliers) -->
    <AlarmBlock
      v-else-if="w.type === 'alarm_history' || w.type === 'alarm_stats'"
      :widget="w"
      :range="range"
      :devices="devices"
      :multi-device="multiDevice"
    />

    <!-- signalements : le dernier en grand avec ses photos, puis les suivants -->
    <InterventionsBlock
      v-else-if="w.type === 'interventions'"
      :widget="w"
      :range="range"
      :devices="devices"
      :multi-device="multiDevice"
    />

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
              <th
                v-if="w.options.compare"
                class="font-medium py-1 pl-2"
                :title="'Moyenne (total pour un compteur) vs ' + cmpText"
              >
                vs {{ w.options.compare === 'year' ? 'an dernier' : 'préc.' }}
              </th>
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
              <td
                v-if="w.options.compare"
                class="pl-2"
                :class="
                  r.delta === null
                    ? 'text-muted-foreground'
                    : r.delta >= 0
                      ? 'text-signal'
                      : 'text-offline'
                "
                data-testid="table-delta"
              >
                {{
                  r.delta === null ? '—' : (r.delta >= 0 ? '+' : '') + fmtValue(r.delta, 1) + ' %'
                }}
              </td>
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

<script setup lang="ts">
// Courbe d'historique sur axe temporel linéaire (ms), avec bande min/max.
// Le zoom (molette, pincement, glisser-sélection) remonte la nouvelle plage au parent qui recharge
// une résolution plus fine : c'est ce qui donne l'effet « base de séries temporelles ».
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  Tooltip,
  Filler,
  type ChartDataset,
} from 'chart.js'
import zoomPlugin from 'chartjs-plugin-zoom'
import type { HistPoint } from '@/composables/useHistory'

Chart.register(LineController, LineElement, PointElement, LinearScale, Tooltip, Filler, zoomPlugin)

const props = withDefaults(
  defineProps<{
    points: HistPoint[]
    label: string
    unit?: string | null
    color?: string
    from: number
    to: number
    step?: boolean
    band?: boolean
    cursor?: number | null
    height?: string
    /** au-delà de cet écart entre deux points, la courbe est coupée (pas de fausse interpolation) */
    gapMs?: number
  }>(),
  { unit: '', color: '#00d4aa', step: false, band: true, cursor: null, height: '180px', gapMs: 0 },
)
const emit = defineEmits<{
  (e: 'range', r: { from: number; to: number }): void
  (e: 'cursor', ts: number | null): void
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
let chart: Chart | null = null
let silent = false

const fmtDay = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' })
const fmtHour = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })
const fmtFull = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})
const fmtNum = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : Math.abs(v) >= 1000 ? v.toFixed(0) : +v.toPrecision(4) + ''

function tick(v: number | string) {
  const t = Number(v)
  const span = (chart?.scales.x.max ?? props.to) - (chart?.scales.x.min ?? props.from)
  const d = new Date(t)
  const midnight = d.getHours() === 0 && d.getMinutes() === 0
  if (span > 6 * 86400e3) return fmtDay.format(d)
  if (midnight) return [fmtHour.format(d), fmtDay.format(d)]
  return fmtHour.format(d)
}

// graduations « rondes » (5 min … 1 mois), alignées sur l'heure locale
const STEPS = [5, 15, 30, 60, 180, 360, 720, 1440, 2880, 10080, 20160, 43200].map((m) => m * 60e3)
function niceTicks(min: number, max: number): { value: number }[] {
  const step = STEPS.find((s) => (max - min) / s <= 7) ?? STEPS[STEPS.length - 1]
  const d = new Date(min)
  const off = d.getTimezoneOffset() * 60e3
  let t: number
  if (step >= 43200 * 60e3) {
    t = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime()
  } else if (step === 10080 * 60e3 || step === 20160 * 60e3) {
    const m = new Date(d.getFullYear(), d.getMonth(), d.getDate() + ((8 - d.getDay()) % 7 || 7))
    t = m.getTime()
  } else {
    t = Math.ceil((min - off) / step) * step + off
  }
  const out: { value: number }[] = []
  for (let i = 0; t <= max && i < 40; i++) {
    out.push({ value: t })
    if (step >= 43200 * 60e3) {
      const n = new Date(t)
      t = new Date(n.getFullYear(), n.getMonth() + 1, 1).getTime()
    } else t += step
  }
  return out
}

// points avec coupures : un point nul est inséré dans chaque trou plus grand que gapMs
const withGaps = computed<HistPoint[]>(() => {
  const out: HistPoint[] = []
  let prev: number | null = null
  for (const p of props.points) {
    if (props.gapMs && prev !== null && p[0] - prev > props.gapMs)
      out.push([prev + 1, null, null, null])
    out.push(p)
    prev = p[0]
  }
  return out
})

function datasets(): ChartDataset<'line'>[] {
  const pts = withGaps.value
  const avg = pts.map((p) => ({ x: p[0], y: p[1] }))
  const ds: ChartDataset<'line'>[] = []
  const hasBand = props.band && pts.some((p) => p[2] !== p[3])
  if (hasBand) {
    ds.push({
      label: 'min',
      data: pts.map((p) => ({ x: p[0], y: p[2] })),
      borderWidth: 0,
      pointRadius: 0,
      fill: false,
      stepped: props.step,
    })
    ds.push({
      label: 'max',
      data: pts.map((p) => ({ x: p[0], y: p[3] })),
      borderWidth: 0,
      pointRadius: 0,
      backgroundColor: props.color + '26',
      fill: '-1',
      stepped: props.step,
    })
  }
  ds.push({
    label: props.label,
    data: avg,
    borderColor: props.color,
    backgroundColor: props.color,
    borderWidth: 1.5,
    pointRadius: (c) => {
      if (props.points.length < 60) return 2
      const i = c.dataIndex
      // point isolé (entouré de trous) : visible malgré tout
      return pts[i - 1]?.[1] == null && pts[i + 1]?.[1] == null ? 2.5 : 0
    },
    pointHoverRadius: 3,
    stepped: props.step,
    spanGaps: false,
    tension: 0,
  })
  return ds
}

function build() {
  if (!canvas.value) return
  chart?.destroy()
  chart = new Chart(canvas.value, {
    type: 'line',
    data: { datasets: datasets() },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      parsing: false,
      normalized: true,
      interaction: { mode: 'index', intersect: false, axis: 'x' },
      plugins: {
        legend: { display: false },
        tooltip: {
          filter: (i) => i.datasetIndex === i.chart.data.datasets.length - 1,
          callbacks: {
            title: (items) => (items[0] ? fmtFull.format(new Date(items[0].parsed.x ?? 0)) : ''),
            label: (item) => {
              const p = withGaps.value[item.dataIndex]
              const u = props.unit ? ' ' + props.unit : ''
              if (!p) return ''
              return p[2] !== p[3]
                ? `${fmtNum(p[1])}${u}  (min ${fmtNum(p[2])} · max ${fmtNum(p[3])})`
                : `${fmtNum(p[1])}${u}`
            },
          },
        },
        zoom: {
          limits: { x: { minRange: 10 * 60e3 } },
          pan: { enabled: true, mode: 'x', modifierKey: 'shift', onPanComplete: done },
          zoom: {
            wheel: { enabled: true, speed: 0.15 },
            pinch: { enabled: true },
            drag: { enabled: true, backgroundColor: 'rgba(0,212,170,0.12)' },
            mode: 'x',
            onZoomComplete: done,
          },
        },
      },
      scales: {
        x: {
          type: 'linear',
          min: props.from,
          max: props.to,
          ticks: {
            callback: tick,
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 8,
            font: { size: 10 },
          },
          grid: { color: 'rgba(127,127,127,0.12)' },
          afterBuildTicks: (axis) => {
            axis.ticks = niceTicks(axis.min, axis.max)
          },
        },
        y: {
          ticks: { font: { size: 10 }, maxTicksLimit: 5 },
          grid: { color: 'rgba(127,127,127,0.12)' },
        },
      },
      onHover: (_e, els) => {
        const el = els[0]
        if (el) emit('cursor', withGaps.value[el.index]?.[0] ?? null)
      },
    },
    plugins: [
      {
        id: 'cursor',
        afterDraw(c) {
          if (props.cursor == null) return
          const x = c.scales.x.getPixelForValue(props.cursor)
          if (x < c.chartArea.left || x > c.chartArea.right) return
          const g = c.ctx
          g.save()
          g.strokeStyle = 'rgba(127,127,127,0.6)'
          g.setLineDash([3, 3])
          g.beginPath()
          g.moveTo(x, c.chartArea.top)
          g.lineTo(x, c.chartArea.bottom)
          g.stroke()
          g.restore()
        },
      },
    ],
  })
}

function done({ chart: c }: { chart: Chart }) {
  if (silent) return
  const x = c.scales.x
  emit('range', { from: Math.round(x.min), to: Math.round(x.max) })
}

onMounted(build)
onBeforeUnmount(() => chart?.destroy())
watch(
  () => [props.points, props.color, props.step, props.band, props.gapMs],
  () => {
    if (!chart) return build()
    chart.data.datasets = datasets()
    chart.update('none')
  },
)
watch(
  () => [props.from, props.to],
  () => {
    if (!chart) return
    silent = true
    const x = chart.options.scales!.x!
    x.min = props.from
    x.max = props.to
    chart.update('none')
    silent = false
  },
)
watch(
  () => props.cursor,
  () => chart?.draw(),
)
</script>

<template>
  <div class="relative w-full" :style="{ height }" @mouseleave="emit('cursor', null)">
    <canvas ref="canvas" />
  </div>
</template>

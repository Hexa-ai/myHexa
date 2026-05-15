<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  Chart,
  LineController,
  BarController,
  LineElement,
  BarElement,
  PointElement,
  CategoryScale,
  LinearScale,
  TimeScale,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import zoomPlugin from 'chartjs-plugin-zoom'
import { useChartSync } from '@/composables/useChartSync'

Chart.register(
  LineController,
  BarController,
  LineElement,
  BarElement,
  PointElement,
  CategoryScale,
  LinearScale,
  TimeScale,
  Tooltip,
  Legend,
  Filler,
  zoomPlugin,
)

interface Point {
  ts: number | string
  value: number
}

const props = withDefaults(
  defineProps<{
    points: Point[]
    label: string
    unit?: string
    color?: string
    type?: 'line' | 'bar'
    height?: string
  }>(),
  { unit: '', color: '#00d4aa', type: 'line', height: '260px' },
)

const wrapper = ref<HTMLDivElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
let chart: Chart | null = null
let timestamps: number[] = []

const isFs = ref(false)
const { activeTs, set: setSyncTs, isOwner, reset: resetSync } = useChartSync()

function fmtTs(ts: number | string): string {
  return new Date(ts).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function build() {
  if (!canvas.value) return
  if (chart) chart.destroy()
  timestamps = props.points.map((p) => new Date(p.ts).getTime())
  const labels = props.points.map((p) => fmtTs(p.ts))
  const values = props.points.map((p) => p.value)

  chart = new Chart(canvas.value.getContext('2d')!, {
    type: props.type === 'bar' ? 'bar' : 'line',
    data: {
      labels,
      datasets: [
        {
          label: `${props.label}${props.unit ? ` (${props.unit})` : ''}`,
          data: values,
          backgroundColor: props.type === 'bar' ? props.color : `${props.color}26`,
          borderColor: props.color,
          borderWidth: 2,
          fill: props.type !== 'bar',
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { display: true, position: 'top' },
        tooltip: { intersect: false, mode: 'index' },
        zoom: {
          pan: { enabled: true, mode: 'x' },
          zoom: {
            wheel: { enabled: true },
            pinch: { enabled: true },
            drag: { enabled: false },
            mode: 'x',
          },
        },
      },
      scales: {
        x: { ticks: { maxRotation: 45, minRotation: 0, autoSkip: true, maxTicksLimit: 12 } },
        y: { beginAtZero: false },
      },
      onHover: (_evt, elements) => {
        if (!elements.length || !chart) return
        const idx = elements[0].index
        const ts = timestamps[idx]
        if (Number.isFinite(ts)) setSyncTs(ts)
      },
    },
  })
}

// Listen to shared cursor: when another chart drives, highlight the closest point here.
watch(activeTs, (ts) => {
  if (!chart || ts == null) {
    chart?.setActiveElements([])
    chart?.tooltip?.setActiveElements([], { x: 0, y: 0 })
    chart?.update('none')
    return
  }
  if (isOwner()) return // our own write — skip echo
  // Find closest index by timestamp
  let best = 0
  let bestDiff = Infinity
  for (let i = 0; i < timestamps.length; i++) {
    const d = Math.abs(timestamps[i] - ts)
    if (d < bestDiff) {
      bestDiff = d
      best = i
    }
  }
  const datasetIndex = 0
  chart.setActiveElements([{ datasetIndex, index: best }])
  if (chart.tooltip) {
    chart.tooltip.setActiveElements(
      [{ datasetIndex, index: best }],
      { x: 0, y: 0 },
    )
  }
  chart.update('none')
})

function resetZoom() {
  chart?.resetZoom()
}

async function toggleFullscreen() {
  if (!wrapper.value) return
  const doc = document as Document & {
    webkitFullscreenElement?: Element | null
    webkitExitFullscreen?: () => Promise<void>
  }
  const el = wrapper.value as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void>
  }
  if (doc.fullscreenElement === wrapper.value || doc.webkitFullscreenElement === wrapper.value) {
    try {
      await (doc.exitFullscreen || doc.webkitExitFullscreen)?.call(doc)
    } catch {
      isFs.value = false
    }
    return
  }
  try {
    const req = el.requestFullscreen || el.webkitRequestFullscreen
    if (req) {
      await req.call(el)
    } else {
      // Fallback: CSS-only fake fullscreen
      isFs.value = true
    }
  } catch {
    isFs.value = true
  }
}

function onFsChange() {
  const doc = document as Document & { webkitFullscreenElement?: Element | null }
  const native = doc.fullscreenElement === wrapper.value || doc.webkitFullscreenElement === wrapper.value
  isFs.value = native || isFs.value === true && !doc.fullscreenElement && !doc.webkitFullscreenElement
    ? native
    : false
  setTimeout(() => chart?.resize(), 100)
}

function onMouseLeave() {
  if (isOwner()) resetSync()
}

onMounted(() => {
  build()
  document.addEventListener('fullscreenchange', onFsChange)
  document.addEventListener('webkitfullscreenchange', onFsChange)
})
watch(() => [props.points, props.color, props.type], build, { deep: true })
onBeforeUnmount(() => {
  chart?.destroy()
  document.removeEventListener('fullscreenchange', onFsChange)
  document.removeEventListener('webkitfullscreenchange', onFsChange)
  resetSync()
})
</script>

<template>
  <div
    ref="wrapper"
    :class="['series-chart relative w-full', isFs ? 'is-fake-fs' : '']"
    :style="{ height: isFs ? '100vh' : height }"
    @mouseleave="onMouseLeave"
  >
    <div class="absolute top-2 right-2 z-10 flex gap-1">
      <button
        type="button"
        @click="resetZoom"
        title="Réinitialiser le zoom"
        class="size-7 inline-flex items-center justify-center rounded border border-border bg-card/80 backdrop-blur-sm text-muted-foreground hover:text-signal hover:border-signal/60 transition"
      >
        <svg viewBox="0 0 24 24" class="size-3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 12a9 9 0 1 0 9-9" />
          <path d="M3 3v6h6" />
        </svg>
      </button>
      <button
        type="button"
        @click="toggleFullscreen"
        :title="isFs ? 'Quitter le plein écran' : 'Plein écran'"
        class="size-7 inline-flex items-center justify-center rounded border border-border bg-card/80 backdrop-blur-sm text-muted-foreground hover:text-signal hover:border-signal/60 transition"
      >
        <svg v-if="!isFs" viewBox="0 0 24 24" class="size-3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6" />
        </svg>
        <svg v-else viewBox="0 0 24 24" class="size-3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 3v6H3M21 9h-6V3M21 15h-6v6M9 21v-6H3" />
        </svg>
      </button>
    </div>
    <canvas ref="canvas" />
  </div>
</template>

<style scoped>
.series-chart canvas {
  cursor: crosshair;
}
.series-chart.is-fake-fs {
  position: fixed !important;
  inset: 0;
  z-index: 9999;
  background: var(--background);
  padding: 16px 20px;
}
.series-chart:fullscreen {
  background: var(--background);
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
}
.series-chart:fullscreen canvas,
.series-chart.is-fake-fs canvas {
  flex: 1;
  width: 100% !important;
  height: 100% !important;
}
</style>

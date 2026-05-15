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
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'

Chart.register(
  LineController,
  BarController,
  LineElement,
  BarElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Filler,
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
  { unit: '', color: '#00d4aa', type: 'line', height: '240px' },
)

const canvas = ref<HTMLCanvasElement | null>(null)
let chart: Chart | null = null

function fmtTs(ts: number | string): string {
  const d = new Date(ts)
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function build() {
  if (!canvas.value) return
  if (chart) chart.destroy()
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
      plugins: { legend: { display: true, position: 'top' }, tooltip: { intersect: false, mode: 'index' } },
      scales: {
        x: { ticks: { maxRotation: 45, minRotation: 0, autoSkip: true, maxTicksLimit: 12 } },
        y: { beginAtZero: false },
      },
    },
  })
}

onMounted(build)
watch(() => [props.points, props.color, props.type], build, { deep: true })
onBeforeUnmount(() => chart?.destroy())
</script>

<template>
  <div :style="{ position: 'relative', height }">
    <canvas ref="canvas" />
  </div>
</template>

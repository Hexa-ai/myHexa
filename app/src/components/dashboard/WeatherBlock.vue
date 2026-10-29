<script setup lang="ts">
// Bloc « Météo » : météo à l'adresse de la box, relevée par le portail (cron-weather, toutes les 15 min).
// Vues : maintenant / prochaines 24 h / 5 jours. Données via weather_for_devices (box visibles seulement).
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import type { DeviceWithStatus } from '@/composables/useDevices'
import WeatherIcon from '@/components/dashboard/WeatherIcon.vue'

const props = defineProps<{
  deviceIds: string[]
  view: 'now' | 'hours' | 'days'
  devices: Map<string, DeviceWithStatus>
}>()
interface Cur {
  temp: number | null
  feels: number | null
  humidity: number | null
  pressure: number | null
  wind: number | null
  wind_dir: number | null
  gust: number | null
  rain: number | null
  clouds: number | null
  cond: string | null
  is_day: boolean | null
}
interface Fc {
  t: number
  temp: number | null
  rain: number | null
  pop: number | null
  wind: number | null
  clouds: number | null
  cond: string | null
}
interface Row {
  device_id: string
  site_key: string
  current: Cur | null
  current_at: string | null
  forecast: Fc[] | null
  provider: string | null
}
const rows = ref<Row[]>([])
const loaded = ref(false)
const err = ref('')

async function load() {
  err.value = ''
  if (!props.deviceIds.length) {
    rows.value = []
    loaded.value = true
    return
  }
  const { data, error } = await supabase.rpc(
    'weather_for_devices' as never,
    {
      p_ids: props.deviceIds,
    } as never,
  )
  loaded.value = true
  if (error) {
    err.value = (error as { message: string }).message
    return
  }
  rows.value = (data ?? []) as Row[]
}
watch(() => props.deviceIds.join(','), load, { immediate: true })
// relevé toutes les 15 min : rafraîchissement du bloc toutes les 5 min
const timer = setInterval(load, 300e3)
onBeforeUnmount(() => clearInterval(timer))

const row = computed(
  () => rows.value.find((r) => r.device_id === props.deviceIds[0]) ?? rows.value[0],
)
const cur = computed(() => row.value?.current ?? null)
const night = computed(() => cur.value?.is_day === false)
const boxName = computed(() => props.devices.get(row.value?.device_id ?? '')?.name ?? '')

const COND: Record<string, string> = {
  clear: 'Dégagé',
  partly: 'Éclaircies',
  cloudy: 'Couvert',
  fog: 'Brouillard',
  drizzle: 'Bruine',
  rain: 'Pluie',
  snow: 'Neige',
  storm: 'Orage',
}
const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO']
const dir = (d: number | null) => (d == null ? '' : DIRS[Math.round(d / 45) % 8])
const n = (x: number | null | undefined, dec = 0) =>
  x == null
    ? '—'
    : x.toLocaleString('fr-FR', { maximumFractionDigits: dec, minimumFractionDigits: dec })
const ago = computed(() => {
  const t = row.value?.current_at ? Date.parse(row.value.current_at) : 0
  if (!t) return ''
  const m = Math.round((Date.now() - t) / 60e3)
  return m < 1 ? "à l'instant" : m < 60 ? `il y a ${m} min` : `il y a ${Math.round(m / 60)} h`
})
const source = computed(() =>
  row.value?.provider === 'openweathermap'
    ? 'OpenWeather'
    : row.value?.provider
      ? 'Open-Meteo'
      : '',
)

// 24 h : un point toutes les 3 h
const hours = computed(() => {
  const now = Date.now() - 3600e3
  const f = (row.value?.forecast ?? []).filter((p) => p.t >= now)
  const step = f.length > 1 && f[1].t - f[0].t <= 3600e3 ? 3 : 1
  return f.filter((_, i) => i % step === 0).slice(0, 8)
})
const hh = (t: number) =>
  new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
const isNightAt = (t: number) => {
  const h = new Date(t).getHours()
  return h < 7 || h >= 20
}

// 5 jours : min / max, cumul de pluie, condition dominante en journée
const days = computed(() => {
  const by = new Map<string, Fc[]>()
  for (const p of row.value?.forecast ?? []) {
    const k = new Date(p.t).toLocaleDateString('fr-CA')
    ;(by.get(k) ?? by.set(k, []).get(k)!).push(p)
  }
  const rank = ['clear', 'partly', 'cloudy', 'fog', 'drizzle', 'rain', 'snow', 'storm']
  return [...by.entries()].slice(0, 5).map(([k, ps]) => {
    const temps = ps.map((p) => p.temp).filter((x): x is number => x != null)
    const dayPs = ps.filter((p) => !isNightAt(p.t))
    const conds = (dayPs.length ? dayPs : ps).map((p) => p.cond).filter(Boolean) as string[]
    // condition la plus marquante présente au moins 2 fois (sinon la plus fréquente)
    const count = (c: string) => conds.filter((x) => x === c).length
    const cond =
      [...rank].reverse().find((c) => count(c) >= Math.max(2, Math.ceil(conds.length / 4))) ??
      conds.sort((a, b) => count(b) - count(a))[0] ??
      null
    const rain = ps.reduce((a, p) => a + (p.rain ?? 0), 0)
    const d = new Date(k + 'T12:00:00')
    return {
      k,
      label:
        k === new Date().toLocaleDateString('fr-CA')
          ? 'Auj.'
          : d.toLocaleDateString('fr-FR', { weekday: 'short' }),
      min: temps.length ? Math.min(...temps) : null,
      max: temps.length ? Math.max(...temps) : null,
      rain,
      pop: Math.max(0, ...ps.map((p) => p.pop ?? 0)),
      cond,
    }
  })
})
const tMin = computed(() => Math.min(...days.value.map((d) => d.min ?? 99)))
const tMax = computed(() => Math.max(...days.value.map((d) => d.max ?? -99)))
const bar = (d: { min: number | null; max: number | null }) => {
  const span = Math.max(1, tMax.value - tMin.value)
  return {
    left: (((d.min ?? tMin.value) - tMin.value) / span) * 100 + '%',
    width: Math.max(4, (((d.max ?? tMin.value) - (d.min ?? tMin.value)) / span) * 100) + '%',
  }
}
</script>

<template>
  <div class="flex-1 flex flex-col min-h-0" data-testid="weather-block" :data-view="view">
    <p v-if="err" class="text-xs text-offline">{{ err }}</p>
    <p v-else-if="loaded && !row" class="text-xs text-muted-foreground" data-testid="weather-none">
      Pas de météo pour cette box : renseignez son adresse dans sa fiche (relevé sous 15 min).
    </p>

    <template v-else-if="row && cur">
      <!-- maintenant -->
      <div v-if="view === 'now'" class="flex-1 flex flex-col justify-between gap-3">
        <div class="flex items-center gap-4">
          <WeatherIcon
            :cond="cur.cond"
            :night="night"
            :size="52"
            class="shrink-0 text-foreground"
          />
          <div class="min-w-0">
            <div
              class="text-4xl font-semibold tabular-nums leading-none"
              data-testid="weather-temp"
            >
              {{ n(cur.temp, 1) }}<span class="text-xl text-muted-foreground font-normal"> °C</span>
            </div>
            <div class="mt-1 text-sm text-muted-foreground truncate">
              {{ COND[cur.cond ?? ''] ?? '' }} · ressenti {{ n(cur.feels) }} °C
            </div>
          </div>
        </div>
        <dl class="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
          <div
            v-for="it in [
              { l: 'Humidité', v: n(cur.humidity), u: '%' },
              { l: 'Vent', v: n(cur.wind), u: `km/h ${dir(cur.wind_dir)}` },
              { l: 'Pluie', v: n(cur.rain, 1), u: 'mm/h' },
              { l: 'Pression', v: n(cur.pressure), u: 'hPa' },
            ]"
            :key="it.l"
            class="min-w-0"
          >
            <dt class="font-mono text-[9.5px] uppercase tracking-widest text-muted-foreground">
              {{ it.l }}
            </dt>
            <dd class="text-sm tabular-nums truncate">
              {{ it.v }} <span class="text-xs text-muted-foreground">{{ it.u }}</span>
            </dd>
          </div>
        </dl>
      </div>

      <!-- prochaines 24 h -->
      <div
        v-else-if="view === 'hours'"
        class="flex-1 grid grid-flow-col auto-cols-[minmax(52px,1fr)] gap-1 overflow-x-auto"
      >
        <div
          v-for="p in hours"
          :key="p.t"
          class="flex flex-col items-center gap-1.5 py-1 rounded-md"
          data-testid="weather-hour"
        >
          <span class="font-mono text-[10px] text-muted-foreground">{{ hh(p.t) }}</span>
          <WeatherIcon :cond="p.cond" :night="isNightAt(p.t)" :size="26" />
          <span class="text-sm font-medium tabular-nums">{{ n(p.temp) }}°</span>
          <span class="font-mono text-[9.5px] tabular-nums text-muted-foreground"
            >{{ n(p.pop) }} %</span
          >
        </div>
      </div>

      <!-- 5 jours -->
      <ul v-else class="flex-1 flex flex-col justify-center">
        <li
          v-for="d in days"
          :key="d.k"
          class="flex items-center gap-3 py-1.5 border-b border-border/60 last:border-0"
          data-testid="weather-day"
        >
          <span
            class="w-10 font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground"
            >{{ d.label }}</span
          >
          <WeatherIcon :cond="d.cond" :size="22" class="shrink-0" />
          <span class="w-14 font-mono text-[10px] tabular-nums text-muted-foreground">{{
            d.rain >= 0.1 ? n(d.rain, 1) + ' mm' : ''
          }}</span>
          <span class="w-8 text-right text-sm tabular-nums text-muted-foreground"
            >{{ n(d.min) }}°</span
          >
          <span class="flex-1 h-1.5 rounded-full bg-secondary relative min-w-[40px]">
            <span class="absolute inset-y-0 rounded-full bg-signal/70" :style="bar(d)" />
          </span>
          <span class="w-8 text-sm tabular-nums">{{ n(d.max) }}°</span>
        </li>
      </ul>

      <div class="mt-2 flex items-center gap-2 font-mono text-[9.5px] text-muted-foreground">
        <span class="truncate">{{ boxName }}</span>
        <span class="ml-auto shrink-0">relevé {{ ago }} · {{ source }}</span>
      </div>
    </template>
  </div>
</template>

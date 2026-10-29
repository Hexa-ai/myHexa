<script setup lang="ts">
// Bloc « Météo » : météo à l'adresse de la box, relevée par le portail (cron-weather, toutes les 15 min).
// Vues : maintenant / prochaines 24 h / 5 jours. Contenu au choix (options.weatherFields) et
// pictogrammes animés, fixes ou absents (options.weatherIcons). Données via weather_for_devices
// (box visibles seulement).
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import type { DeviceWithStatus } from '@/composables/useDevices'
import WeatherIcon from '@/components/dashboard/WeatherIcon.vue'
import {
  WEATHER_DEFAULT_FIELDS,
  type WeatherField,
  type WeatherIcons,
  type WeatherView,
} from '@/composables/useWeather'

const props = defineProps<{
  deviceIds: string[]
  view: WeatherView
  fields?: WeatherField[]
  icons?: WeatherIcons
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
// relevé toutes les 15 min : rafraîchissement du bloc toutes les 5 min (et de « il y a … » chaque minute)
const tick = ref(Date.now())
const timer = setInterval(load, 300e3)
const clock = setInterval(() => (tick.value = Date.now()), 60e3)
onBeforeUnmount(() => {
  clearInterval(timer)
  clearInterval(clock)
})

const has = (f: WeatherField) => (props.fields ?? WEATHER_DEFAULT_FIELDS[props.view]).includes(f)
const iconMode = computed(() => props.icons ?? 'animated')
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
  const m = Math.round((tick.value - t) / 60e3)
  return m < 1 ? "à l'instant" : m < 60 ? `il y a ${m} min` : `il y a ${Math.round(m / 60)} h`
})
const stale = computed(() => {
  const t = row.value?.current_at ? Date.parse(row.value.current_at) : 0
  return !t || tick.value - t > 3600e3
})
const source = computed(() =>
  row.value?.provider === 'openweathermap'
    ? 'OpenWeather'
    : row.value?.provider
      ? 'Open-Meteo'
      : '',
)
const tempTxt = computed(() => n(cur.value?.temp, 1))

/** cases de mesures de la vue « maintenant » (ordre fixe, selon le choix de l'utilisateur) */
const cells = computed(() => {
  const c = cur.value
  if (!c) return []
  const all = [
    { k: 'humidity', l: 'Humidité', v: n(c.humidity), u: '%', seg: c.humidity },
    { k: 'wind', l: 'Vent', v: n(c.wind), u: 'km/h', dir: c.wind_dir },
    { k: 'gust', l: 'Rafales', v: n(c.gust), u: 'km/h' },
    { k: 'rain', l: 'Pluie', v: n(c.rain, 1), u: 'mm/h' },
    { k: 'pressure', l: 'Pression', v: n(c.pressure), u: 'hPa' },
    { k: 'clouds', l: 'Nuages', v: n(c.clouds), u: '%', seg: c.clouds },
  ] as {
    k: WeatherField
    l: string
    v: string
    u: string
    seg?: number | null
    dir?: number | null
  }[]
  return all.filter((x) => has(x.k))
})

// 24 h : un point toutes les 3 h
const hours = computed(() => {
  const now = tick.value - 3600e3
  const f = (row.value?.forecast ?? []).filter((p) => p.t >= now)
  const step = f.length > 1 && f[1].t - f[0].t <= 3600e3 ? 3 : 1
  return f.filter((_, i) => i % step === 0).slice(0, 8)
})
const hh = (t: number) =>
  new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit' }).replace(' ', '')
const isNightAt = (t: number) => {
  const h = new Date(t).getHours()
  return h < 7 || h >= 20
}
/** courbe de température des 24 h (coordonnées 0..100 en x, 0..40 en y) */
const spark = computed(() => {
  const ts = hours.value.map((p) => p.temp)
  const v = ts.filter((x): x is number => x != null)
  if (v.length < 2) return null
  const lo = Math.min(...v),
    hi = Math.max(...v),
    span = Math.max(1, hi - lo)
  const pts = ts.map((t, i) => [
    ((i + 0.5) / ts.length) * 100,
    t == null ? null : 34 - ((t - lo) / span) * 28,
  ])
  return {
    line: pts
      .filter((p) => p[1] != null)
      .map((p) => p.join(','))
      .join(' '),
    pts: pts as [number, number | null][],
  }
})

// 5 jours : min / max, cumul de pluie, condition marquante en journée
const days = computed(() => {
  const by = new Map<string, Fc[]>()
  for (const p of row.value?.forecast ?? []) {
    const k = new Date(p.t).toLocaleDateString('fr-CA')
    ;(by.get(k) ?? by.set(k, []).get(k)!).push(p)
  }
  const rank = ['clear', 'partly', 'cloudy', 'fog', 'drizzle', 'rain', 'snow', 'storm']
  const today = new Date(tick.value).toLocaleDateString('fr-CA')
  return [...by.entries()].slice(0, 5).map(([k, ps]) => {
    const temps = ps.map((p) => p.temp).filter((x): x is number => x != null)
    const dayPs = ps.filter((p) => !isNightAt(p.t))
    const conds = (dayPs.length ? dayPs : ps).map((p) => p.cond).filter(Boolean) as string[]
    const count = (c: string) => conds.filter((x) => x === c).length
    const cond =
      [...rank].reverse().find((c) => count(c) >= Math.max(2, Math.ceil(conds.length / 4))) ??
      [...conds].sort((a, b) => count(b) - count(a))[0] ??
      null
    return {
      k,
      label:
        k === today
          ? 'Auj.'
          : new Date(k + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short' }),
      date: new Date(k + 'T12:00:00').toLocaleDateString('fr-FR', { day: '2-digit' }),
      min: temps.length ? Math.min(...temps) : null,
      max: temps.length ? Math.max(...temps) : null,
      rain: ps.reduce((a, p) => a + (p.rain ?? 0), 0),
      pop: Math.max(0, ...ps.map((p) => p.pop ?? 0)),
      wind: Math.max(0, ...ps.map((p) => p.wind ?? 0)),
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
    width: Math.max(6, (((d.max ?? tMin.value) - (d.min ?? tMin.value)) / span) * 100) + '%',
  }
}
</script>

<template>
  <div class="wxb flex-1 flex flex-col min-h-0" data-testid="weather-block" :data-view="view">
    <p v-if="err" class="text-xs text-offline">{{ err }}</p>
    <p v-else-if="loaded && !row" class="text-xs text-muted-foreground" data-testid="weather-none">
      Pas de météo pour cette box : renseignez son adresse dans sa fiche (relevé sous 15 min).
    </p>

    <template v-else-if="row && cur">
      <!-- MAINTENANT -->
      <div v-if="view === 'now'" class="flex-1 flex flex-col gap-4">
        <div class="flex items-start gap-3">
          <div class="min-w-0 flex-1">
            <div class="flex items-start gap-1 leading-none" data-testid="weather-temp">
              <span class="wxb-big big-num tabular">{{ tempTxt }}</span>
              <span class="wxb-unit pt-1.5">°C</span>
            </div>
            <div
              v-if="has('cond') || has('feels')"
              class="mt-2 wxb-label !text-[10.5px] text-foreground/80 truncate"
            >
              <span v-if="has('cond')">{{ COND[cur.cond ?? ''] ?? '' }}</span>
              <span v-if="has('cond') && has('feels')" class="text-muted-foreground"> · </span>
              <span v-if="has('feels')">ressenti {{ n(cur.feels) }}°</span>
            </div>
          </div>
          <WeatherIcon
            v-if="iconMode !== 'none'"
            :cond="cur.cond"
            :night="night"
            :size="64"
            :animated="iconMode === 'animated'"
            class="shrink-0 text-foreground -mt-1"
          />
        </div>
        <dl
          v-if="cells.length"
          class="mt-auto grid grid-cols-2 sm:grid-cols-3 border-t border-border/70"
        >
          <div
            v-for="c in cells"
            :key="c.k"
            class="wxb-cell min-w-0 pt-2 pb-1 pr-2"
            :data-field="c.k"
          >
            <dt class="wxb-label flex items-center gap-1">
              {{ c.l }}
              <svg
                v-if="c.dir != null"
                width="9"
                height="9"
                viewBox="0 0 10 10"
                class="text-signal"
                :style="{ transform: `rotate(${(c.dir ?? 0) + 180}deg)` }"
                aria-hidden="true"
              >
                <path d="M5 0.5 8.5 9 5 7 1.5 9z" fill="currentColor" />
              </svg>
              <span v-if="c.dir != null" class="text-foreground/70">{{ dir(c.dir) }}</span>
            </dt>
            <dd class="mt-0.5 flex items-baseline gap-1 min-w-0">
              <span class="text-lg tabular-nums leading-tight">{{ c.v }}</span>
              <span class="wxb-label !tracking-normal normal-case">{{ c.u }}</span>
            </dd>
            <div v-if="c.seg != null" class="mt-1 flex gap-[2px]" aria-hidden="true">
              <i
                v-for="s in 10"
                :key="s"
                :class="[
                  'block h-[3px] flex-1 rounded-[1px]',
                  s <= Math.round((c.seg ?? 0) / 10) ? 'bg-signal' : 'bg-secondary',
                ]"
              />
            </div>
          </div>
        </dl>
      </div>

      <!-- 24 HEURES -->
      <div v-else-if="view === 'hours'" class="flex-1 flex flex-col justify-center min-h-0">
        <div class="relative">
          <svg
            v-if="spark && has('temp')"
            viewBox="0 0 100 40"
            preserveAspectRatio="none"
            class="absolute inset-x-0 top-[50px] h-10 w-full pointer-events-none"
            aria-hidden="true"
          >
            <polyline
              :points="spark.line"
              fill="none"
              stroke="var(--signal, #00d4aa)"
              stroke-width="1.4"
              vector-effect="non-scaling-stroke"
              stroke-linejoin="round"
            />
          </svg>
          <div class="grid" :style="{ gridTemplateColumns: `repeat(${hours.length || 1}, 1fr)` }">
            <div
              v-for="(p, i) in hours"
              :key="p.t"
              class="flex flex-col items-center"
              data-testid="weather-hour"
            >
              <span class="wxb-label leading-[14px]">{{ hh(p.t) }}</span>
              <WeatherIcon
                v-if="iconMode !== 'none'"
                :cond="p.cond"
                :night="isNightAt(p.t)"
                :size="30"
                :animated="iconMode === 'animated'"
                class="mt-1.5"
              />
              <div class="h-10 w-full relative">
                <span
                  v-if="has('temp') && spark?.pts[i]?.[1] != null"
                  class="absolute left-1/2 -translate-x-1/2 size-[5px] rounded-full bg-card border border-signal"
                  :style="{ top: `calc(${((spark.pts[i][1] as number) / 40) * 100}% - 2.5px)` }"
                />
              </div>
              <span v-if="has('temp')" class="text-[15px] font-medium tabular-nums"
                >{{ n(p.temp) }}°</span
              >
              <span
                v-if="has('pop')"
                class="mt-1 flex items-center gap-1 wxb-label !tracking-normal"
              >
                <i class="block w-[3px] h-2 rounded-[1px] bg-secondary relative overflow-hidden">
                  <i
                    class="absolute inset-x-0 bottom-0 bg-[#3ba7ff]"
                    :style="{ height: (p.pop ?? 0) + '%' }"
                  />
                </i>
                {{ n(p.pop) }}%
              </span>
              <span v-if="has('rain')" class="wxb-label !tracking-normal"
                >{{ n(p.rain, 1) }} mm</span
              >
              <span v-if="has('wind')" class="wxb-label !tracking-normal"
                >{{ n(p.wind) }} km/h</span
              >
            </div>
          </div>
        </div>
      </div>

      <!-- 5 JOURS -->
      <ul v-else class="flex-1 flex flex-col justify-center">
        <li
          v-for="d in days"
          :key="d.k"
          class="flex items-center gap-2 min-w-0 py-[7px] border-b border-border/60 last:border-0"
          data-testid="weather-day"
        >
          <span class="w-9 shrink-0 flex flex-col gap-0.5 leading-none">
            <span class="wxb-label text-foreground/85">{{ d.label }}</span>
            <span class="wxb-label !text-[9px]">{{ d.date }}</span>
          </span>
          <WeatherIcon
            v-if="iconMode !== 'none'"
            :cond="d.cond"
            :size="26"
            :animated="iconMode === 'animated'"
            class="shrink-0"
          />
          <span v-if="has('pop')" class="w-8 shrink-0 wxb-label !tracking-normal text-[#3ba7ff]">{{
            d.pop >= 10 ? n(d.pop) + '%' : ''
          }}</span>
          <span v-if="has('rain')" class="w-11 shrink-0 wxb-label !tracking-normal">{{
            d.rain >= 0.1 ? n(d.rain, 1) + ' mm' : ''
          }}</span>
          <span v-if="has('wind')" class="shrink-0 wxb-label !tracking-normal">{{
            n(d.wind) + ' km/h'
          }}</span>
          <template v-if="has('temp')">
            <span class="w-7 shrink-0 text-right text-sm tabular-nums text-muted-foreground"
              >{{ n(d.min) }}°</span
            >
            <span class="flex-1 h-[5px] rounded-full bg-secondary relative min-w-[28px]">
              <span class="wxb-range absolute inset-y-0 rounded-full" :style="bar(d)" />
            </span>
            <span class="w-7 shrink-0 text-right text-sm tabular-nums">{{ n(d.max) }}°</span>
          </template>
        </li>
      </ul>

      <div class="mt-2 flex items-center gap-2 wxb-label !tracking-normal normal-case">
        <span
          :class="['size-1.5 rounded-full shrink-0', stale ? 'bg-muted-foreground' : 'bg-signal']"
        />
        <span class="truncate">{{ boxName }}</span>
        <span class="ml-auto shrink-0">{{ ago }} · {{ source }}</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.wxb-big {
  font-size: 64px;
  font-weight: 300;
  letter-spacing: -0.04em;
}
.wxb-unit {
  font-family: ui-monospace, 'JetBrains Mono', monospace;
  font-size: 13px;
  color: var(--muted-foreground);
}
.wxb-label {
  font-family: ui-monospace, 'JetBrains Mono', monospace;
  font-size: 9.5px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted-foreground);
}
.wxb-cell + .wxb-cell {
  padding-left: 0.6rem;
  border-left: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
}
.wxb-cell:nth-child(2n + 1) {
  padding-left: 0;
  border-left: 0;
}
@media (min-width: 640px) {
  .wxb-cell:nth-child(2n + 1) {
    padding-left: 0.6rem;
    border-left: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  }
  .wxb-cell:nth-child(3n + 1) {
    padding-left: 0;
    border-left: 0;
  }
}
.wxb-range {
  background: linear-gradient(90deg, #3ba7ff, var(--signal, #00d4aa) 55%, #f5a524);
}
</style>

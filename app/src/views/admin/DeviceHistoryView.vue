<script setup lang="ts">
// PROTOTYPE — exploration de l'historique d'une box sur n'importe quelle plage.
// Données : ts_query (niveau choisi selon la plage : 5 min ≤ 4 j, 1 h ≤ 2 mois, 1 jour au-delà).
// Zoomer (molette / glisser / pincer) recharge automatiquement une résolution plus fine.
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import HistoryChart from '@/components/HistoryChart.vue'
import {
  fetchCatalog,
  fetchHistory,
  autoLevel,
  LEVEL_LABEL,
  bucketLabel,
  sourceLabel,
  type HistVar,
  type HistResult,
} from '@/composables/useHistory'

const route = useRoute()
const router = useRouter()
const deviceId = computed(() => String(route.params.id))

const COLORS = [
  '#00d4aa',
  '#4f8cff',
  '#f5a524',
  '#e5484d',
  '#a855f7',
  '#14b8a6',
  '#ec4899',
  '#84cc16',
  '#f97316',
  '#06b6d4',
]
const MAX_VARS = 40
const DAY = 86400e3
// coupure de courbe : 1 h en 5 min (les statuts arrivent toutes les 30 min), 6 h en horaire, 3 j en journalier
const GAP: Record<string, number> = { raw: 3600e3, '1m': 3600e3, '1h': 6 * 3600e3, '1d': 3 * DAY }

const deviceName = ref('')
const catalog = ref<HistVar[]>([])
const selected = ref<string[]>([])
const search = ref('')
const showPicker = ref(false)
const loadingCat = ref(true)
const loading = ref(false)
const error = ref<string | null>(null)
const result = ref<HistResult | null>(null)
const cursor = ref<number | null>(null)
const band = ref(true)
const ms = ref(0)

const now = () => Date.now()
const range = ref<{ from: number; to: number }>({ from: now() - 7 * DAY, to: now() })
const presets = [
  { k: '24h', label: '24 h', d: 1 },
  { k: '3j', label: '3 j', d: 3 },
  { k: '7j', label: '7 j', d: 7 },
  { k: '30j', label: '30 j', d: 30 },
  { k: '3m', label: '3 mois', d: 91 },
  { k: '6m', label: '6 mois', d: 182 },
  { k: '1a', label: '1 an', d: 365 },
]
const preset = ref<string | null>('7j')

const level = computed(() => result.value?.level ?? autoLevel(range.value.from, range.value.to))
const lastDay = computed(() => {
  const d = catalog.value
    .map((v) => v.last_day)
    .sort()
    .pop()
  return d ? new Date(d + 'T23:59:59').getTime() : now()
})
const firstDay = computed(() => {
  const d = catalog.value.map((v) => v.first_day).sort()[0]
  return d ? new Date(d + 'T00:00:00').getTime() : now() - 30 * DAY
})

const filtered = computed(() => {
  const s = search.value.trim().toLowerCase()
  return catalog.value.filter(
    (v) => !s || v.var.toLowerCase().includes(s) || (v.description ?? '').toLowerCase().includes(s),
  )
})
const byVar = computed(() => Object.fromEntries(catalog.value.map((v) => [v.var, v])))
const colorOf = (v: string) => COLORS[selected.value.indexOf(v) % COLORS.length]
const shown = computed(() =>
  selected.value.map((v) => ({
    var: v,
    meta: byVar.value[v],
    series: result.value?.series.find((s) => s.var === v) ?? null,
  })),
)

const fmtDate = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})
const fmtDateTime = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})
const rangeLabel = computed(() => {
  const f = range.value.to - range.value.from < 3 * DAY ? fmtDateTime : fmtDate
  return `${f.format(range.value.from)} → ${f.format(range.value.to)}`
})
const pointsCount = computed(
  () => result.value?.series.reduce((n, s) => n + s.points.length, 0) ?? 0,
)

let seq = 0
async function load() {
  if (!selected.value.length) {
    result.value = null
    return
  }
  const my = ++seq
  loading.value = true
  error.value = null
  const t = performance.now()
  try {
    const r = await fetchHistory(deviceId.value, selected.value, range.value.from, range.value.to)
    if (my !== seq) return
    result.value = r
    ms.value = Math.round(performance.now() - t)
  } catch (e) {
    if (my === seq) error.value = (e as Error).message
  } finally {
    if (my === seq) loading.value = false
  }
}

let timer: ReturnType<typeof setTimeout> | undefined
function scheduleLoad() {
  clearTimeout(timer)
  timer = setTimeout(load, 200)
}

function setPreset(k: string) {
  const p = presets.find((x) => x.k === k)!
  preset.value = k
  const to = Math.min(now(), lastDay.value + 60e3)
  range.value = { from: to - p.d * DAY, to }
}
function onRange(r: { from: number; to: number }) {
  preset.value = null
  range.value = r
}
function shift(dir: -1 | 1) {
  const span = range.value.to - range.value.from
  preset.value = null
  range.value = { from: range.value.from + dir * span * 0.5, to: range.value.to + dir * span * 0.5 }
}
function zoomOut() {
  const span = range.value.to - range.value.from
  const mid = (range.value.from + range.value.to) / 2
  preset.value = null
  range.value = { from: mid - span, to: Math.min(mid + span, now()) }
}
function all() {
  preset.value = null
  range.value = { from: firstDay.value, to: Math.min(now(), lastDay.value + DAY) }
}

function toggle(v: string) {
  const i = selected.value.indexOf(v)
  if (i >= 0) selected.value.splice(i, 1)
  else if (selected.value.length < MAX_VARS) selected.value.push(v)
}
function selectAllFiltered() {
  for (const v of filtered.value)
    if (!selected.value.includes(v.var) && selected.value.length < MAX_VARS)
      selected.value.push(v.var)
}

// URL partageable : ?v=A,B&from=…&to=…
function syncUrl() {
  router.replace({
    query: {
      v: selected.value.join(',') || undefined,
      from: String(Math.round(range.value.from)),
      to: String(Math.round(range.value.to)),
    },
  })
}

watch(
  [selected, range],
  () => {
    syncUrl()
    scheduleLoad()
  },
  { deep: true },
)

onMounted(async () => {
  const { data } = await supabase
    .from('devices')
    .select('name')
    .eq('id', deviceId.value)
    .maybeSingle()
  deviceName.value = (data as { name?: string } | null)?.name ?? ''
  try {
    catalog.value = await fetchCatalog(deviceId.value)
  } catch (e) {
    error.value = (e as Error).message
  }
  loadingCat.value = false
  const q = route.query
  const fromQ = Number(q.from)
  const toQ = Number(q.to)
  if (fromQ && toQ && toQ > fromQ) {
    preset.value = null
    range.value = { from: fromQ, to: toQ }
  } else setPreset('7j')
  const vq = String(q.v ?? '')
    .split(',')
    .filter((v) => byVar.value[v])
  // par défaut : les variables qui ont une courbe fine (rapport journalier), sinon les 5 premières ; + volumes
  selected.value = vq.length
    ? vq
    : (catalog.value.filter((v) => v.fine).length
        ? catalog.value.filter((v) => v.fine)
        : catalog.value
      )
        .slice(0, 5)
        .map((v) => v.var)
  if (!selected.value.length) showPicker.value = true
})

// largeur des barres d'un compteur : pas entre deux cases (1 h, 1 j, 1 semaine)
function barMs(pts: [number, ...unknown[]][]) {
  let m = Infinity
  for (let i = 1; i < pts.length; i++) m = Math.min(m, pts[i][0] - pts[i - 1][0])
  const span = range.value.to - range.value.from
  const def = span <= 3 * DAY ? 3600e3 : span <= 124 * DAY ? DAY : 7 * DAY
  return Number.isFinite(m) ? Math.min(m, def) : def
}

const depth = (v: HistVar) => (v.fine ? 'courbe 5 min' : v.days > 1 ? 'tendance' : 'peu de données')
</script>

<template>
  <section class="px-3 sm:px-6 lg:px-8 py-5 sm:py-8 max-w-[1400px] mx-auto">
    <button
      class="mb-4 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-signal transition"
      @click="router.push({ name: 'admin-device-detail', params: { id: deviceId } })"
    >
      ← Retour au device
    </button>

    <header class="flex flex-wrap items-end justify-between gap-3 mb-4">
      <div>
        <p class="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Historique · prototype
        </p>
        <h1 class="text-xl sm:text-2xl font-semibold">{{ deviceName || '…' }}</h1>
      </div>
      <p class="font-mono text-[11px] text-muted-foreground" data-testid="hist-meta">
        <span class="text-foreground">{{ LEVEL_LABEL[level] }}</span>
        <span v-if="result">
          · pas {{ bucketLabel(result.bucket_s) }} · {{ result.files }} fichier{{
            result.files > 1 ? 's' : ''
          }}</span
        >
        · {{ pointsCount.toLocaleString('fr-FR') }} points
        <span v-if="ms"> · {{ ms }} ms</span>
      </p>
    </header>

    <!-- Barre de plage -->
    <div
      class="sticky top-0 z-10 -mx-3 sm:mx-0 px-3 sm:px-4 py-3 mb-4 bg-background/95 backdrop-blur border-y sm:border border-border sm:rounded-md flex flex-wrap items-center gap-2"
    >
      <div class="flex flex-wrap gap-1">
        <button
          v-for="p in presets"
          :key="p.k"
          :data-testid="'preset-' + p.k"
          class="font-mono text-[11px] px-2.5 py-1 rounded border transition"
          :class="
            preset === p.k
              ? 'border-signal text-signal bg-signal/10'
              : 'border-border hover:border-signal/60'
          "
          @click="setPreset(p.k)"
        >
          {{ p.label }}
        </button>
        <button
          class="font-mono text-[11px] px-2.5 py-1 rounded border border-border hover:border-signal/60"
          @click="all"
        >
          Tout
        </button>
      </div>
      <div class="flex items-center gap-1">
        <button
          class="font-mono text-[11px] px-2 py-1 rounded border border-border hover:border-signal/60"
          title="Reculer"
          @click="shift(-1)"
        >
          ◀
        </button>
        <button
          class="font-mono text-[11px] px-2 py-1 rounded border border-border hover:border-signal/60"
          title="Dézoomer"
          @click="zoomOut"
        >
          −
        </button>
        <button
          class="font-mono text-[11px] px-2 py-1 rounded border border-border hover:border-signal/60"
          title="Avancer"
          @click="shift(1)"
        >
          ▶
        </button>
      </div>
      <span class="font-mono text-[11px] text-foreground" data-testid="hist-range">{{
        rangeLabel
      }}</span>
      <span v-if="loading" class="font-mono text-[11px] text-muted-foreground"
        ><span class="blink">▍</span></span
      >
      <div class="ml-auto flex items-center gap-3">
        <label
          class="font-mono text-[11px] text-muted-foreground flex items-center gap-1.5 cursor-pointer"
        >
          <input v-model="band" type="checkbox" class="accent-[var(--color-signal,#00d4aa)]" />
          min/max
        </label>
        <button
          data-testid="hist-pick"
          class="font-mono text-[11px] uppercase tracking-wider px-3 py-1 rounded border border-border hover:border-signal/60"
          @click="showPicker = !showPicker"
        >
          Variables · {{ selected.length }}/{{ catalog.length }}
        </button>
      </div>
    </div>

    <div class="flex flex-col lg:flex-row gap-4">
      <!-- Sélecteur de variables -->
      <aside
        v-if="showPicker"
        class="lg:w-72 shrink-0 border border-border rounded-md bg-card/40 p-3 lg:max-h-[75vh] lg:sticky lg:top-20 flex flex-col"
        data-testid="hist-picker"
      >
        <input
          v-model="search"
          placeholder="Rechercher une variable"
          class="w-full mb-2 bg-background border border-border rounded px-2 py-1.5 text-sm"
        />
        <div class="flex justify-between mb-2 font-mono text-[10px] uppercase tracking-wider">
          <button class="text-muted-foreground hover:text-signal" @click="selectAllFiltered">
            tout cocher
          </button>
          <button class="text-muted-foreground hover:text-signal" @click="selected = []">
            aucune
          </button>
        </div>
        <p v-if="loadingCat" class="text-sm text-muted-foreground">chargement…</p>
        <p v-else-if="!catalog.length" class="text-sm text-muted-foreground">
          Aucun historique pour cette box.
        </p>
        <ul class="overflow-y-auto max-h-[50vh] lg:max-h-none -mx-1">
          <li v-for="v in filtered" :key="v.var">
            <label
              class="flex items-start gap-2 px-1 py-1.5 rounded hover:bg-muted/40 cursor-pointer"
            >
              <input
                type="checkbox"
                class="mt-1"
                :checked="selected.includes(v.var)"
                :disabled="!selected.includes(v.var) && selected.length >= MAX_VARS"
                @change="toggle(v.var)"
              />
              <span class="min-w-0">
                <span
                  class="block text-sm truncate"
                  :style="selected.includes(v.var) ? { color: colorOf(v.var) } : {}"
                >
                  {{ v.var }}
                  <span v-if="v.unit" class="text-muted-foreground text-xs">{{ v.unit }}</span>
                </span>
                <span v-if="v.description" class="block text-xs text-muted-foreground truncate">{{
                  v.description
                }}</span>
                <span class="block font-mono text-[10px] text-muted-foreground"
                  >{{ depth(v) }} · depuis {{ v.first_day }}</span
                >
              </span>
            </label>
          </li>
        </ul>
      </aside>

      <!-- Courbes -->
      <div class="flex-1 min-w-0 space-y-3">
        <div
          v-if="error"
          class="border border-offline/40 rounded-md bg-offline-soft p-4 font-mono text-sm text-offline"
        >
          ERR · {{ error }}
        </div>
        <p
          v-else-if="!selected.length"
          class="border border-border rounded-md p-8 text-center text-muted-foreground"
        >
          Choisissez des variables à afficher.
        </p>
        <article
          v-for="s in shown"
          :key="s.var"
          class="border border-border rounded-md bg-card/40 px-3 pt-2 pb-1"
          data-testid="hist-card"
        >
          <div class="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 mb-1">
            <span
              class="w-2 h-2 rounded-full self-center"
              :style="{ background: colorOf(s.var) }"
            />
            <span class="font-medium text-sm">{{ s.var }}</span>
            <span v-if="s.meta?.unit" class="text-xs text-muted-foreground">{{ s.meta.unit }}</span>
            <span
              v-if="s.meta?.description"
              class="text-xs text-muted-foreground truncate max-w-full"
              >{{ s.meta.description }}</span
            >
            <span v-if="s.series" class="ml-auto font-mono text-[10px] text-muted-foreground">
              {{ sourceLabel(s.series.sources) }} · {{ s.series.points.length }} pts
            </span>
          </div>
          <HistoryChart
            v-if="s.series && s.series.points.length"
            :points="s.series.points"
            :label="s.var"
            :unit="s.meta?.unit"
            :color="colorOf(s.var)"
            :from="range.from"
            :to="range.to"
            :step="['state', 'alarm'].includes(s.meta?.category ?? '')"
            :bars="s.meta?.category === 'counter' ? barMs(s.series.points) : 0"
            :band="band"
            :gap-ms="Math.max(GAP[level] ?? 0, (result?.bucket_s ?? 0) * 3000)"
            :cursor="cursor"
            :height="shown.length > 8 ? '130px' : '180px'"
            @range="onRange"
            @cursor="cursor = $event"
          />
          <p v-else-if="!loading" class="py-6 text-center text-xs text-muted-foreground">
            Pas de donnée sur cette plage.
          </p>
        </article>
        <p v-if="selected.length" class="font-mono text-[10px] text-muted-foreground px-1">
          Molette ou glisser pour zoomer (la résolution s'affine), Maj + glisser pour se déplacer.
          Avant décembre : courbes 5 min pour les variables du rapport journalier, sinon tendance du
          statut toutes les 30 min et min/moyenne/max du jour.
        </p>
      </div>
    </div>
  </section>
</template>

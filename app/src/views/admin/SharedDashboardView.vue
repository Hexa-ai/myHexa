<script setup lang="ts">
// Tableau partagé en lecture seule (éventuellement par une autre organisation).
// Aucune donnée de box n'est lue directement : la base renvoie le strict nécessaire
// (shared_dashboard_bundle) et ts-read ne sert que les variables des blocs (readCtx.dashboard).
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { DeviceWithStatus } from '@/composables/useDevices'
import { readCtx, type HistVar } from '@/composables/useHistory'
import {
  fetchSources,
  loadDashboard,
  loadSharedBundle,
  loadWidgets,
  PERIODS,
  sharedWithMe,
  shiftRange,
  type SeriesMap,
  type Widget,
} from '@/composables/useDashboards'
import DashboardWidget from '@/components/dashboard/DashboardWidget.vue'

const route = useRoute()
const router = useRouter()
const dashId = computed(() => String(route.params.d))

const name = ref('')
const owner = ref('')
const widgets = ref<Widget[]>([])
const devMap = ref<Map<string, DeviceWithStatus>>(new Map())
const catalogs = ref<Record<string, HistVar[]>>({})
const data = ref<SeriesMap>(new Map())
const compareData = ref<SeriesMap>(new Map())
const loading = ref(true)
const loadingData = ref(false)
const error = ref('')
const period = ref<string>((route.query.period as string) || '24h')
const range = ref<[number, number]>(PERIODS['24h'].range(Date.now()))

// lecture au titre du tableau partagé, pour toute la durée de la page
readCtx.dashboard = dashId.value
onBeforeUnmount(() => (readCtx.dashboard = null))

async function init() {
  loading.value = true
  error.value = ''
  readCtx.dashboard = dashId.value
  try {
    const [b, ws, meta, row] = await Promise.all([
      loadSharedBundle(dashId.value),
      loadWidgets(dashId.value),
      sharedWithMe(),
      loadDashboard(dashId.value),
    ])
    // période enregistrée avec le tableau, sauf choix explicite dans l'adresse
    const before = period.value
    if (!route.query.period && row?.period && PERIODS[row.period]) period.value = row.period
    const m = meta.find((x) => x.id === dashId.value)
    name.value = m?.name ?? 'Tableau partagé'
    owner.value = m?.company ?? ''
    devMap.value = new Map(
      b.devices.map((d) => [d.id, { ...d, company_id: null } as unknown as DeviceWithStatus]),
    )
    catalogs.value = b.catalogs
    // blocs « document » : seuls les documents cités dans le bloc sont lisibles (règle document_shared_with_me)
    widgets.value = ws
    if (period.value === before) await refresh() // sinon le watcher de période recharge
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

async function refresh() {
  range.value = (PERIODS[period.value] ?? PERIODS['24h']).range(Date.now())
  const srcs = widgets.value.flatMap((w) => w.sources).filter((s) => s.var)
  loadingData.value = true
  try {
    data.value = await fetchSources(srcs, range.value[0], range.value[1])
    compareData.value = new Map()
    for (const w of widgets.value.filter((x) => x.options.compare)) {
      const r = shiftRange(range.value, w.options.compare)
      const mm = await fetchSources(w.sources, r[0], r[1])
      for (const [k, v] of mm) compareData.value.set(w.options.compare + '|' + k, v)
    }
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loadingData.value = false
  }
}
function compareFor(w: Widget): SeriesMap | null {
  if (!w.options.compare) return null
  const m: SeriesMap = new Map()
  const pre = w.options.compare + '|'
  for (const [k, v] of compareData.value) if (k.startsWith(pre)) m.set(k.slice(pre.length), v)
  return m
}
watch(period, () => {
  router.replace({ query: { ...route.query, period: period.value } })
  refresh()
})
watch(dashId, init)
onMounted(init)

const SPAN: Record<string, string> = {
  '1/4': 'col-span-12 sm:col-span-6 lg:col-span-3',
  '1/3': 'col-span-12 sm:col-span-6 lg:col-span-4',
  '1/2': 'col-span-12 lg:col-span-6',
  '2/3': 'col-span-12 lg:col-span-8',
  full: 'col-span-12',
}
</script>

<template>
  <section class="px-4 sm:px-6 lg:px-8 py-6 sm:py-8 w-full" data-testid="shared-dashboard">
    <nav
      class="flex flex-wrap items-center gap-x-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
    >
      <RouterLink :to="{ name: 'admin-dashboards' }" class="hover:text-signal"
        >Tableaux de bord</RouterLink
      >
      <span>›</span>
      <span>Partagés avec moi</span>
    </nav>
    <header class="mt-3 mb-4 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
      <div class="min-w-0">
        <div class="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-1">
          Tableau partagé · lecture seule<template v-if="owner"> · {{ owner }}</template>
        </div>
        <h1 class="text-2xl sm:text-3xl font-semibold tracking-tight truncate">{{ name }}</h1>
      </div>
      <div class="flex gap-px bg-border border border-border rounded-sm overflow-x-auto max-w-full">
        <button
          v-for="(p, k) in PERIODS"
          :key="k"
          :class="[
            'px-2.5 py-1.5 text-xs font-mono whitespace-nowrap',
            period === k
              ? 'bg-signal text-primary-foreground'
              : 'bg-card text-muted-foreground hover:text-foreground',
          ]"
          @click="period = k as string"
        >
          {{ p.label }}
        </button>
      </div>
    </header>
    <p v-if="error" class="text-sm text-offline mb-4" data-testid="shared-error">{{ error }}</p>
    <p v-if="loading" class="text-sm text-muted-foreground">Chargement…</p>
    <div
      v-else-if="!error"
      class="grid grid-cols-12 gap-3"
      :class="loadingData ? 'opacity-60 transition-opacity' : ''"
      data-testid="dash-grid"
    >
      <div
        v-for="(w, i) in widgets"
        :key="i + w.type"
        :class="[SPAN[w.width] ?? 'col-span-12', 'relative']"
        data-testid="widget-slot"
      >
        <DashboardWidget
          :widget="w"
          :data="data"
          :compare-data="compareFor(w)"
          :range="range"
          :devices="devMap"
          :catalogs="catalogs"
          :multi-device="devMap.size > 1"
          :no-links="true"
        />
      </div>
    </div>
  </section>
</template>

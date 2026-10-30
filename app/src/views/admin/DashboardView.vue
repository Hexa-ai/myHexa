<script setup lang="ts">
// Tableau de bord d'une box ou d'un projet (plusieurs tableaux possibles, éditables par l'admin).
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useDevices, type DeviceWithStatus } from '@/composables/useDevices'
import { useProjects } from '@/composables/useProjects'
import { fetchCatalog, type HistVar } from '@/composables/useHistory'
import {
  defaultWidgets,
  deleteDashboard,
  downloadText,
  fetchDetailed,
  fetchSources,
  toCsv,
  loadDashboards,
  loadWidgets,
  PERIODS,
  saveDashboard,
  shiftRange,
  WIDGET_LABEL,
  type Dashboard,
  type SeriesMap,
  type Widget,
} from '@/composables/useDashboards'
import DashboardWidget from '@/components/dashboard/DashboardWidget.vue'
import WidgetEditor from '@/components/dashboard/WidgetEditor.vue'
import ReportsPanel from '@/components/dashboard/ReportsPanel.vue'
import DashboardSharePanel from '@/components/dashboard/DashboardSharePanel.vue'
import TimeRangePicker from '@/components/TimeRangePicker.vue'
import DashboardNavDrawer from '@/components/dashboard/DashboardNavDrawer.vue'
import LiveControl from '@/components/dashboard/LiveControl.vue'
import LiveBanner from '@/components/dashboard/LiveBanner.vue'
import { useLiveStore } from '@/stores/live'

const route = useRoute()
const live = useLiveStore()
const router = useRouter()
const auth = useAuthStore()
const { allDevices, load: loadDevices } = useDevices()
const { projects, load: loadProjects } = useProjects()

const scope = computed(
  () => (route.params.scope === 'project' ? 'project' : 'device') as 'device' | 'project',
)
const targetId = computed(() => String(route.params.id))

const loading = ref(true)
const error = ref<string | null>(null)
const catalogs = ref<Record<string, HistVar[]>>({})
const dashboards = ref<Dashboard[]>([])
const current = ref<Dashboard | null>(null)
const widgets = ref<Widget[]>([])
const proposed = ref(false) // tableau généré, pas encore enregistré
const data = ref<SeriesMap>(new Map())
const compareData = ref<SeriesMap>(new Map())
const loadingData = ref(false)

const project = computed(() => projects.value.find((p) => p.id === targetId.value) ?? null)
const scopeDevices = computed<DeviceWithStatus[]>(() => {
  if (scope.value === 'device') return allDevices.value.filter((d) => d.id === targetId.value)
  const ids = new Set(project.value?.device_ids ?? [])
  return allDevices.value.filter((d) => ids.has(d.id))
})
const devMap = computed(() => new Map(allDevices.value.map((d) => [d.id, d])))
// entreprise d'un NOUVEAU tableau : celle de l'utilisateur (un client à qui une box est partagée
// construit ses propres tableaux, dans sa propre organisation) ; le staff garde celle de la cible
const newCompanyId = computed<string | null>(() => {
  if (scope.value === 'project') return project.value?.company_id ?? null
  if (auth.isHexaStaff) return scopeDevices.value[0]?.company_id ?? null
  return scopeDevices.value.length ? (auth.recipient?.company_id ?? null) : null
})
// entreprise du tableau affiché (rapports, droits d'édition)
const companyId = computed<string | null>(() => current.value?.company_id || newCompanyId.value)
const heading = computed(
  () => (scope.value === 'device' ? scopeDevices.value[0]?.name : project.value?.name) ?? '…',
)
const isAdminOf = (c: string | null) =>
  auth.isHexaStaff || (!!c && auth.recipient?.role === 'admin' && auth.recipient?.company_id === c)
/** modifier le tableau affiché */
const canManage = computed(() => isAdminOf(companyId.value))
/** créer un tableau sur cette box / ce projet */
const canCreate = computed(() => isAdminOf(newCompanyId.value))
/** partage en lecture seule : tableaux portant sur les box de sa propre organisation uniquement */
const canShare = computed(
  () =>
    !!current.value?.id &&
    canManage.value &&
    !editing.value &&
    scopeDevices.value.every((d) => d.company_id === current.value?.company_id),
)
const shareOpen = ref(false)

const period = ref<string>((route.query.period as string) || '24h')
// plage précise (horloge) : prioritaire sur la période tant qu'elle est choisie, partagée par l'URL
const qn = (k: string) => Number(route.query[k]) || 0
const custom = ref<[number, number] | null>(
  qn('from') && qn('to') > qn('from') ? [qn('from'), qn('to')] : null,
)
function applyCustom(r: { from: number; to: number }) {
  custom.value = [r.from, r.to]
  router.replace({ query: { ...route.query, from: String(r.from), to: String(r.to) } })
  refresh()
}
function pickPeriod(k: string) {
  const was = custom.value
  custom.value = null
  if (period.value !== k)
    period.value = k // le watcher met à jour l'URL (sans from / to) et recharge
  else if (was) {
    router.replace({ query: { ...route.query, from: undefined, to: undefined } })
    refresh()
  }
}
const fmtR = (t: number) =>
  new Date(t).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
const customLabel = computed(() =>
  custom.value ? `${fmtR(custom.value[0])} → ${fmtR(custom.value[1])}` : '',
)

// ---- rafraîchissement automatique (valeurs « dernière », périodes glissantes) ----
const AUTO = [
  { s: 0, label: 'Arrêt' },
  { s: 30, label: '30 s' },
  { s: 60, label: '1 min' },
  { s: 300, label: '5 min' },
]
const autoRefresh = ref<number>(Number(localStorage.getItem('hai.dash.auto') ?? 60))
const lastRefresh = ref<number>(Date.now())
let autoTimer: ReturnType<typeof setInterval> | null = null
function armAuto() {
  if (autoTimer) clearInterval(autoTimer)
  autoTimer = null
  localStorage.setItem('hai.dash.auto', String(autoRefresh.value))
  if (!autoRefresh.value) return
  autoTimer = setInterval(async () => {
    // pas pendant l'édition, ni onglet masqué, ni chargement en cours
    if (editing.value || editWidget.value || document.hidden || loadingData.value) return
    if (custom.value && custom.value[1] < Date.now()) return // plage précise passée : rien de neuf
    await loadDevices()
    await refresh()
  }, autoRefresh.value * 1000)
}
watch(autoRefresh, armAuto)
onBeforeUnmount(() => autoTimer && clearInterval(autoTimer))

// plein écran (affichage mural) : le tableau seul, sans menu ni en-tête
const rootEl = ref<HTMLElement | null>(null)
const isFull = ref(false)
const onFsChange = () => (isFull.value = !!document.fullscreenElement)
onMounted(() => document.addEventListener('fullscreenchange', onFsChange))
onBeforeUnmount(() => document.removeEventListener('fullscreenchange', onFsChange))
async function toggleFull() {
  if (document.fullscreenElement) await document.exitFullscreen()
  else await rootEl.value?.requestFullscreen?.()
}
const range = ref<[number, number]>(PERIODS['24h'].range(Date.now()))

async function init() {
  loading.value = true
  error.value = null
  try {
    await Promise.all([loadDevices(), loadProjects()])
    const ids = scopeDevices.value.map((d) => d.id)
    const cats = await Promise.all(ids.map((id) => fetchCatalog(id).catch(() => [] as HistVar[])))
    catalogs.value = Object.fromEntries(ids.map((id, i) => [id, cats[i]]))
    dashboards.value = await loadDashboards(
      scope.value === 'device' ? { device: targetId.value } : { project: targetId.value },
    )
    if (route.query.new && canCreate.value) newDashboard(route.query.new === 'proposal')
    else await select((route.query.d as string) || dashboards.value[0]?.id || null)
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

async function select(id: string | null) {
  editing.value = false
  const d = dashboards.value.find((x) => x.id === id)
  if (d) {
    current.value = { ...d }
    widgets.value = await loadWidgets(d.id!)
    proposed.value = false
    if (!route.query.period) period.value = d.period
  } else {
    // aucun tableau enregistré : rien n'est créé automatiquement, l'utilisateur choisit d'en créer un
    current.value = null
    widgets.value = []
    proposed.value = false
    router.replace({ query: { ...route.query, d: undefined, new: undefined } })
    return
  }
  router.replace({ query: { ...route.query, d: current.value.id || undefined, new: undefined } })
  await refresh()
}

/** nouveau tableau (non enregistré) : vide, ou à partir d'une proposition */
function newDashboard(fromProposal: boolean) {
  {
    current.value = {
      company_id: newCompanyId.value ?? '',
      name: fromProposal ? 'Vue d\u2019ensemble' : 'Nouveau tableau',
      scope: scope.value,
      device_id: scope.value === 'device' ? targetId.value : null,
      project_id: scope.value === 'project' ? targetId.value : null,
      device_ids: [],
      period: '24h',
      is_default: false,
    }
    widgets.value = fromProposal
      ? defaultWidgets(scopeDevices.value, catalogs.value, scope.value)
      : []
    proposed.value = true
    editing.value = true
  }
  router.replace({ query: { ...route.query, d: undefined, new: undefined } })
  refresh()
}

async function refresh() {
  lastRefresh.value = Date.now()
  range.value = custom.value ?? (PERIODS[period.value] ?? PERIODS['24h']).range(Date.now())
  const srcs = widgets.value.flatMap((w) => w.sources).filter((s) => s.var)
  const cmp = widgets.value.filter((w) => w.options.compare)
  loadingData.value = true
  try {
    data.value = await fetchSources(srcs, range.value[0], range.value[1])
    compareData.value = new Map()
    for (const w of cmp) {
      const r = shiftRange(range.value, w.options.compare)
      const m = await fetchSources(w.sources, r[0], r[1])
      // une carte de comparaison par bloc, clé préfixée par l'id temporaire
      for (const [k, v] of m) compareData.value.set(w.options.compare + '|' + k, v)
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
  router.replace({
    query: { ...route.query, period: period.value, from: undefined, to: undefined },
  })
  refresh()
})
// clé texte : un tableau neuf déclencherait le watcher à chaque changement de query (période)
watch(() => `${route.params.scope}/${route.params.id}`, init)
onMounted(() => {
  init()
  armAuto()
})

// ---- mode direct ----
// box du tableau (blocs + portée) : le store ouvre UN canal par box et surveille la capacité « direct » ;
// l'œil n'apparaît que si au moins l'une d'elles l'annonce.
const liveIds = computed(() => {
  const s = new Set<string>(scopeDevices.value.map((d) => d.id))
  for (const w of widgets.value) for (const src of w.sources) if (src.device) s.add(src.device)
  return [...s].sort()
})
const liveKey = computed(() => liveIds.value.join(','))
/** variables affichées par box : seules celles-ci voyagent en direct (data 4G) */
const liveVars = computed(() => {
  const m: Record<string, string[]> = {}
  for (const id of liveIds.value) m[id] = []
  for (const w of widgets.value) for (const src of w.sources) if (src.device && src.var) (m[src.device] ??= []).push(src.var)
  return m
})
watch(
  () => JSON.stringify(liveVars.value),
  () => live.setWanted(liveVars.value),
  { immediate: true },
)
let releaseLive: (() => void) | null = null
watch(
  liveKey,
  () => {
    releaseLive?.()
    releaseLive = liveIds.value.length ? live.watch(liveIds.value) : null
    // direct en cours et liste de box modifiée : on repart sur la nouvelle liste (même cadence)
    if (live.mode !== 'off') live.start(liveIds.value, live.mode as 'fast' | 'slow')
  },
  { immediate: true },
)
/** affichage permanent demandé par l'admin sur CE tableau, et au moins une box l'annonce */
const kiosk = computed(() => !!current.value?.live_display && live.anyCapable(liveIds.value))
watch(
  [kiosk, liveKey],
  ([k]) => {
    if (k) live.start(liveIds.value, 'slow')
    else if (!k && live.mode === 'slow') live.stop()
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  releaseLive?.()
  releaseLive = null
  live.stop()
})
/** réglage « Affichage permanent » : proposé aux administrateurs, sur un tableau enregistré (colonne présente) */
const canSetKiosk = computed(() => canManage.value && !!current.value?.id && current.value.live_display !== undefined)

// ---- édition ----
const editing = ref(false)
const editIdx = ref<number | null>(null)
const editWidget = ref<Widget | null>(null)
const saving = ref(false)
const msg = ref<string | null>(null)
function addWidget() {
  editIdx.value = null
  editWidget.value = {
    type: 'value',
    width: '1/4',
    title: null,
    sources: [],
    op: null,
    options: { stat: 'last' },
  }
}
function openEdit(i: number) {
  editIdx.value = i
  editWidget.value = widgets.value[i]
}
function onEdited(w: Widget) {
  if (editIdx.value === null) widgets.value.push(w)
  else widgets.value[editIdx.value] = w
  editWidget.value = null
  refresh()
}
// glisser-déposer (PC) : le bloc déplacé prend la place du bloc cible
const dragIdx = ref<number | null>(null)
const dragOver = ref<number | null>(null)
function onDrop(j: number) {
  const i = dragIdx.value
  dragIdx.value = dragOver.value = null
  if (i === null || i === j) return
  const a = widgets.value.slice()
  const [x] = a.splice(i, 1)
  a.splice(j, 0, x)
  widgets.value = a
}
function move(i: number, d: number) {
  const j = i + d
  if (j < 0 || j >= widgets.value.length) return
  const a = widgets.value.slice()
  ;[a[i], a[j]] = [a[j], a[i]]
  widgets.value = a
}
async function save(asNew = false) {
  if (!current.value) return
  saving.value = true
  msg.value = null
  try {
    const d = { ...current.value }
    if (asNew) {
      d.id = undefined
      d.is_default = false
      d.name = prompt('Nom du nouveau tableau de bord', `${d.name} (copie)`) || d.name + ' (copie)'
    }
    d.period = period.value
    const id = await saveDashboard(d, widgets.value)
    dashboards.value = await loadDashboards(
      scope.value === 'device' ? { device: targetId.value } : { project: targetId.value },
    )
    await select(id)
    msg.value = 'Enregistré'
  } catch (e) {
    msg.value = (e as Error).message
  } finally {
    saving.value = false
  }
}
async function removeDashboard() {
  if (!current.value?.id || !confirm(`Supprimer « ${current.value.name} » ?`)) return
  await deleteDashboard(current.value.id)
  dashboards.value = dashboards.value.filter((d) => d.id !== current.value!.id)
  await select(dashboards.value[0]?.id ?? null)
}

// ---- export CSV ----
const exportOpen = ref(false)
// menu « ⋯ » des actions secondaires (mobile)
const moreOpen = ref(false)
const closeMore = (e: Event) => {
  if (!(e.target as HTMLElement | null)?.closest('[data-testid=dash-actions]')) moreOpen.value = false
}
onMounted(() => document.addEventListener('click', closeMore))
onBeforeUnmount(() => document.removeEventListener('click', closeMore))
const reportsOpen = ref(false)
const exportRes = ref<'shown' | 'detailed'>('detailed')
const exportMsg = ref<string | null>(null)
const exporting = ref(false)
const exportSources = computed(() => widgets.value.flatMap((w) => w.sources).filter((s) => s.var))
const exportDays = computed(() => Math.ceil((range.value[1] - range.value[0]) / 864e5))
async function doExport() {
  exporting.value = true
  exportMsg.value = null
  try {
    const [a, b] = range.value
    const data =
      exportRes.value === 'detailed'
        ? await fetchDetailed(
            exportSources.value,
            a,
            Math.min(b, Date.now()),
            (d, t) => (exportMsg.value = `lecture ${d}/${t}`),
          )
        : await fetchSources(exportSources.value, a, b)
    const fmt = (t: number) =>
      new Date(t).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
    const name = `${heading.value} - ${current.value?.name ?? 'tableau de bord'}`
    const csv = toCsv(
      data,
      exportSources.value,
      (id) => devMap.value.get(id)?.name ?? id,
      catalogs.value,
      [
        `myHexa · ${name}`,
        `Période : ${fmt(a)} → ${fmt(Math.min(b, Date.now()))} (heure locale)`,
        exportRes.value === 'detailed'
          ? 'Résolution : détaillée (mesures 5 min ou statut 30 min ; compteurs et volumes totalisés par heure)'
          : 'Résolution : celle du tableau de bord (moyenne par case)',
        '',
      ],
    )
    const day = new Date(a).toISOString().slice(0, 10)
    downloadText(`${name.replace(/[^\p{L}\p{N} _.-]+/gu, '_')} ${day} ${period.value}.csv`, csv)
    exportMsg.value = `${csv.split('\r\n').length - 6} lignes exportées`
  } catch (e) {
    exportMsg.value = (e as Error).message
  } finally {
    exporting.value = false
  }
}

const SPAN: Record<string, string> = {
  '1/4': 'col-span-12 sm:col-span-6 lg:col-span-3',
  '1/3': 'col-span-12 sm:col-span-6 lg:col-span-4',
  '1/2': 'col-span-12 lg:col-span-6',
  '2/3': 'col-span-12 lg:col-span-8',
  full: 'col-span-12',
}
// navigation : arborescence (panneau) + fil d'Ariane Tableaux de bord > projet > box
const treeOpen = ref(false)
const treeVersion = ref(0)
watch(dashboards, () => treeVersion.value++)
const navCurrent = computed(() => ({
  scope: scope.value,
  id: targetId.value,
  d: current.value?.id ?? null,
}))
const parentProject = computed(() =>
  scope.value === 'device'
    ? (projects.value.find((p) => p.device_ids.includes(targetId.value)) ?? null)
    : null,
)
const backTo = computed(() =>
  scope.value === 'device'
    ? { name: 'admin-device-detail', params: { id: targetId.value }, query: { fiche: '1' } }
    : { name: 'admin-projects', query: { p: targetId.value } },
)
</script>

<template>
  <section
    ref="rootEl"
    :class="[
      'px-4 sm:px-6 lg:px-8 pt-3 sm:pt-4 pb-6 sm:pb-8 w-full',
      isFull && 'bg-background overflow-auto h-full',
    ]"
  >
    <nav
      v-if="!isFull"
      class="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
      data-testid="dash-breadcrumb"
    >
      <button
        class="inline-flex items-center gap-1.5 px-2 py-1 -ml-2 rounded border border-transparent hover:border-border hover:text-foreground"
        data-testid="dash-tree-open"
        title="Arborescence des tableaux de bord"
        @click="treeOpen = true"
      >
        <svg
          viewBox="0 0 24 24"
          class="size-3.5"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        >
          <path d="M4 6h16M4 12h10M4 18h13" />
        </svg>
        <span class="hidden sm:inline">Arborescence</span>
      </button>
      <RouterLink :to="{ name: 'admin-dashboards' }" class="hover:text-signal"
        >Tableaux de bord</RouterLink
      >
      <template v-if="parentProject">
        <span>›</span>
        <RouterLink
          :to="{ name: 'admin-dashboard', params: { scope: 'project', id: parentProject.id } }"
          class="hover:text-signal normal-case tracking-normal"
          data-testid="dash-crumb-project"
          >{{ parentProject.name }}</RouterLink
        >
      </template>
      <span class="hidden sm:inline">›</span>
      <span class="hidden sm:inline text-foreground normal-case tracking-normal">{{ heading }}</span>
      <RouterLink :to="backTo" class="ml-auto hover:text-signal">
        {{ scope === 'device' ? 'fiche de la box' : 'fiche du projet' }} →
      </RouterLink>
    </nav>
    <DashboardNavDrawer
      :open="treeOpen"
      :current="navCurrent"
      :version="treeVersion"
      @close="treeOpen = false"
    />
    <!-- en-tête compact : titre + actions sur une ligne, filtres (tableau, période, actualisation) dessous ;
         tout sur une seule ligne dès 1700 px ; sur mobile les actions secondaires passent dans le menu « ⋯ » -->
    <header
      class="mt-2 mb-3 flex flex-wrap items-center gap-x-3 gap-y-2"
      data-testid="dash-header"
    >
      <h1
        class="order-1 min-w-0 flex-1 basis-40 truncate text-lg sm:text-2xl font-semibold tracking-tight"
        data-testid="dash-title"
      >
        {{ heading }}
      </h1>
      <div
        v-if="current"
        class="order-3 min-[1700px]:order-2 flex flex-wrap items-center gap-2 w-full min-[1700px]:w-auto"
        data-testid="dash-filters"
      >
        <select
          v-if="dashboards.length > 1 || (dashboards.length && proposed)"
          :value="current?.id ?? ''"
          class="md:hidden bg-card border border-border rounded-sm text-xs font-mono px-2 py-1.5"
          data-testid="dash-select"
          @change="select(($event.target as HTMLSelectElement).value || null)"
        >
          <option v-for="d in dashboards" :key="d.id" :value="d.id">{{ d.name }}</option>
        </select>
        <div
          class="flex gap-px bg-border border border-border rounded-sm overflow-x-auto max-w-full min-w-0 flex-1 sm:flex-none"
        >
          <button
            v-for="(p, k) in PERIODS"
            :key="k"
            :class="[
              'px-2.5 py-1.5 text-xs font-mono whitespace-nowrap',
              period === k && !custom
                ? 'bg-signal text-primary-foreground'
                : 'bg-card text-muted-foreground hover:text-foreground',
            ]"
            @click="pickPeriod(k as string)"
          >
            {{ p.label }}
          </button>
        </div>
        <TimeRangePicker :from="range[0]" :to="range[1]" :active="!!custom" @apply="applyCustom" />
        <span
          v-if="custom"
          class="text-[11px] font-mono text-signal whitespace-nowrap"
          data-testid="range-label"
          >{{ customLabel }}</span
        >
        <LiveControl :device-ids="liveIds" :permanent="kiosk" />
        <label
          class="flex items-center gap-1 text-[11px] font-mono text-muted-foreground"
          :title="`Actualisé à ${new Date(lastRefresh).toLocaleTimeString('fr-FR')}`"
        >
          <span class="hidden xl:inline">Actualiser</span>
          <select
            v-model.number="autoRefresh"
            class="bg-card border border-border rounded-sm px-1.5 py-1 text-xs"
            data-testid="dash-auto"
          >
            <option v-for="a in AUTO" :key="a.s" :value="a.s">{{ a.label }}</option>
          </select>
        </label>
      </div>
      <div
        v-if="current"
        class="order-2 min-[1700px]:order-3 relative flex flex-nowrap items-center gap-2 ml-auto"
        data-testid="dash-actions"
      >
        <button
          v-if="!editing"
          class="hidden md:inline-flex items-center justify-center size-[30px] rounded border border-border hover:border-signal/60 text-muted-foreground hover:text-foreground"
          :aria-label="isFull ? 'Quitter le plein écran' : 'Plein écran'"
          :title="isFull ? 'Quitter le plein écran (Échap)' : 'Afficher le tableau en plein écran'"
          data-testid="dash-fullscreen"
          @click="toggleFull"
        >
          <svg
            viewBox="0 0 24 24"
            class="size-4"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path v-if="!isFull" d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
            <path v-else d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
          </svg>
        </button>
        <button
          v-if="canManage && !editing && current"
          class="text-xs font-mono uppercase tracking-wider px-3 py-1.5 rounded border border-border hover:border-signal/60"
          data-testid="dash-edit"
          @click="editing = true"
        >
          Modifier
        </button>
        <button
          class="md:hidden text-xs font-mono px-2.5 py-1.5 rounded border border-border hover:border-signal/60"
          data-testid="dash-more"
          aria-label="Autres actions"
          :aria-expanded="moreOpen"
          @click="moreOpen = !moreOpen"
        >
          ⋯
        </button>
        <!-- CSV, Rapports, + Nouveau, Partager : en ligne dès md, menu déroulant en dessous -->
        <div
          :class="[
            moreOpen
              ? 'absolute right-0 top-full z-30 mt-1 flex flex-col items-stretch gap-1 p-2 rounded border border-border bg-card shadow-lg'
              : 'hidden',
            'md:static md:mt-0 md:flex md:flex-row md:items-center md:gap-2 md:p-0 md:border-0 md:bg-transparent md:shadow-none',
          ]"
          data-testid="dash-more-menu"
          @click="moreOpen = false"
        >
          <button
            class="text-xs font-mono uppercase tracking-wider px-3 py-1.5 rounded border border-border hover:border-signal/60 text-left"
            data-testid="dash-export"
            @click="exportOpen = !exportOpen"
          >
            CSV
          </button>
          <button
            class="text-xs font-mono uppercase tracking-wider px-3 py-1.5 rounded border border-border hover:border-signal/60 text-left"
            data-testid="dash-reports"
            @click="reportsOpen = !reportsOpen"
          >
            Rapports
          </button>
          <button
            v-if="canCreate && !editing && current"
            class="text-xs font-mono uppercase tracking-wider px-3 py-1.5 rounded border border-border hover:border-signal/60 text-left"
            data-testid="dash-new"
            @click="newDashboard(false)"
          >
            + Nouveau
          </button>
          <button
            v-if="canShare"
            class="text-xs font-mono uppercase tracking-wider px-3 py-1.5 rounded border border-border hover:border-signal/60 text-left"
            data-testid="dash-share"
            @click="shareOpen = !shareOpen"
          >
            Partager
          </button>
        </div>
      </div>
    </header>

    <LiveBanner />
    <div
      v-if="proposed && !loading"
      class="mb-4 text-xs text-muted-foreground border border-dashed border-border rounded px-3 py-2"
    >
      Nouveau tableau de bord, pas encore enregistré.
    </div>

    <!-- aucun tableau : rien n'est créé d'office -->
    <div
      v-if="!current && !loading && !error"
      class="border border-dashed border-border rounded-md px-6 py-10 text-center space-y-3"
      data-testid="dash-empty"
    >
      <p class="text-sm">
        Aucun tableau de bord pour {{ scope === 'device' ? 'cette box' : 'ce projet' }}.
      </p>
      <div v-if="canCreate" class="flex flex-wrap justify-center gap-2">
        <button
          class="text-xs font-mono uppercase tracking-wider px-3 py-1.5 rounded border border-signal bg-signal text-primary-foreground"
          data-testid="dash-new-empty"
          @click="newDashboard(false)"
        >
          Créer un tableau vide
        </button>
        <button
          class="text-xs font-mono uppercase tracking-wider px-3 py-1.5 rounded border border-border hover:border-signal/60"
          data-testid="dash-new-proposal"
          @click="newDashboard(true)"
        >
          Partir d'une proposition
        </button>
      </div>
      <RouterLink :to="backTo" class="inline-block text-xs text-muted-foreground hover:text-signal">
        {{ scope === 'device' ? 'Voir la fiche de la box' : 'Voir la fiche du projet' }} →
      </RouterLink>
    </div>

    <!-- barre d'édition -->
    <!-- onglets : plusieurs tableaux de bord pour la même box / le même projet -->
    <nav
      v-if="!editing && dashboards.length > 1"
      class="hidden md:flex gap-1 border-b border-border mb-4 overflow-x-auto"
      data-testid="dash-tabs"
    >
      <button
        v-for="d in dashboards"
        :key="d.id"
        :class="[
          'px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition',
          current?.id === d.id
            ? 'border-signal text-foreground'
            : 'border-transparent text-muted-foreground hover:text-foreground',
        ]"
        @click="select(d.id ?? null)"
      >
        {{ d.name }}
      </button>
    </nav>
    <div
      v-if="editing && current"
      class="mb-4 border border-signal/40 rounded-md bg-card/60 p-3 flex flex-col sm:flex-row sm:items-center gap-2"
      data-testid="dash-toolbar"
    >
      <input
        v-model="current.name"
        class="flex-1 bg-card border border-border rounded-sm px-2 py-1.5 text-sm"
        data-testid="dash-name"
      />
      <label
        class="text-xs flex items-center gap-1.5 text-muted-foreground"
        :title="
          scope === 'device'
            ? 'Ouvrir ce tableau à la place de la fiche de la box'
            : 'Tableau ouvert en premier pour ce projet'
        "
        ><input v-model="current.is_default" type="checkbox" data-testid="dash-default" />
        {{ scope === 'device' ? 'ouvrir à la place de la fiche' : 'tableau par défaut' }}</label
      >
      <label
        v-if="canSetKiosk"
        class="text-xs flex items-center gap-1.5 text-muted-foreground"
        title="Écran mural : les valeurs se mettent à jour toutes les ~10 s tant que le tableau est ouvert, sans limite de durée (si une box du tableau l'annonce). Réservé aux administrateurs."
        ><input v-model="current.live_display" type="checkbox" data-testid="dash-live-display" />
        affichage permanent (écran mural)</label
      >
      <button
        class="text-xs px-3 py-1.5 rounded border border-border"
        data-testid="dash-add"
        @click="addWidget"
      >
        + Bloc
      </button>
      <button
        class="text-xs px-3 py-1.5 rounded border border-signal bg-signal text-primary-foreground disabled:opacity-50"
        :disabled="saving"
        data-testid="dash-save"
        @click="save()"
      >
        Enregistrer
      </button>
      <button
        v-if="!proposed"
        class="text-xs px-3 py-1.5 rounded border border-border"
        :disabled="saving"
        @click="save(true)"
      >
        Enregistrer sous…
      </button>
      <button
        v-if="current.id"
        class="text-xs px-3 py-1.5 rounded border border-offline/40 text-offline"
        @click="removeDashboard"
      >
        Supprimer
      </button>
      <button
        class="text-xs px-3 py-1.5 rounded border border-border"
        @click="select(current.id ?? dashboards[0]?.id ?? null)"
      >
        Annuler
      </button>
    </div>
    <DashboardSharePanel
      v-if="shareOpen && canShare && current?.id"
      :dashboard-id="current.id"
      @close="shareOpen = false"
    />
    <template v-if="reportsOpen">
      <ReportsPanel
        v-if="current?.id && companyId"
        :dashboard-id="current.id"
        :company-id="companyId"
        :dashboard-name="heading"
        :can-manage="canManage"
      />
      <div
        v-else
        class="mb-4 border border-dashed border-border rounded px-3 py-2 text-xs text-muted-foreground"
        data-testid="reports-need-save"
      >
        Les rapports s'appuient sur un tableau de bord enregistré.<span v-if="canManage">
          Enregistrez d'abord celui-ci (« Modifier » puis « Enregistrer »).</span
        >
      </div>
    </template>
    <div
      v-if="exportOpen"
      class="mb-4 border border-border rounded-md bg-card/60 p-3 text-sm"
      data-testid="export-panel"
    >
      <div class="font-medium mb-2">Exporter les données du tableau de bord (Excel)</div>
      <p class="text-xs text-muted-foreground mb-2">
        {{ exportSources.length }} variable(s), période affichée ({{
          custom ? customLabel : PERIODS[period]?.label
        }}). Une ligne par date, une colonne par variable.
      </p>
      <div class="flex flex-col sm:flex-row gap-3 mb-3">
        <label class="flex items-center gap-1.5"
          ><input v-model="exportRes" type="radio" value="detailed" /> Détaillée (5 min, volumes par
          heure)</label
        >
        <label class="flex items-center gap-1.5"
          ><input v-model="exportRes" type="radio" value="shown" /> Comme affiché (plus
          léger)</label
        >
      </div>
      <p v-if="exportRes === 'detailed' && exportDays > 93" class="text-xs text-offline mb-2">
        Période longue ({{ exportDays }} jours) : l'export détaillé peut prendre plusieurs minutes.
      </p>
      <div class="flex items-center gap-3">
        <button
          class="text-xs px-3 py-1.5 rounded border border-signal bg-signal text-primary-foreground disabled:opacity-50"
          :disabled="exporting || !exportSources.length"
          data-testid="export-go"
          @click="doExport"
        >
          Télécharger le CSV
        </button>
        <span
          v-if="exportMsg"
          class="font-mono text-xs text-muted-foreground"
          data-testid="export-msg"
          >{{ exportMsg }}</span
        >
      </div>
    </div>
    <p
      v-if="msg"
      class="mb-3 font-mono text-xs"
      :class="msg === 'Enregistré' ? 'text-signal' : 'text-offline'"
    >
      {{ msg }}
    </p>

    <div v-if="loading" class="font-mono text-sm text-muted-foreground">
      <span class="blink">▍</span> chargement…
    </div>
    <div
      v-else-if="error"
      class="border border-offline/40 rounded-md bg-offline-soft p-4 font-mono text-sm text-offline"
    >
      ERR · {{ error }}
    </div>
    <div
      v-else
      class="grid grid-cols-12 gap-3"
      :class="loadingData ? 'opacity-60 transition-opacity' : ''"
      data-testid="dash-grid"
    >
      <div
        v-for="(w, i) in widgets"
        :key="i + w.type"
        :class="[
          SPAN[w.width] ?? 'col-span-12',
          'relative',
          editing && 'cursor-move',
          dragIdx === i && 'opacity-40',
          dragOver === i && dragIdx !== i && 'ring-2 ring-signal rounded-md',
        ]"
        :draggable="editing"
        :style="{ '--i': i }"
        data-testid="widget-slot"
        @dragstart="dragIdx = i"
        @dragover.prevent="dragOver = i"
        @dragleave="dragOver === i && (dragOver = null)"
        @drop.prevent="onDrop(i)"
        @dragend="dragIdx = dragOver = null"
      >
        <DashboardWidget
          :widget="w"
          :data="data"
          :compare-data="compareFor(w)"
          :range="range"
          :devices="devMap"
          :catalogs="catalogs"
          :multi-device="scopeDevices.length > 1"
        />
        <!-- en édition : calque qui capte la souris (carte, liens) pour permettre le glisser-déposer -->
        <div
          v-if="editing"
          class="absolute inset-0 z-10 rounded-md"
          title="Glisser pour déplacer"
        />
        <div
          v-if="editing"
          class="z-20 absolute top-1 right-1 flex gap-0.5 bg-background/90 border border-border rounded p-0.5 font-mono text-[10px]"
        >
          <span class="px-1 text-muted-foreground">{{ WIDGET_LABEL[w.type] }}</span>
          <button class="px-1 hover:text-signal" title="Avancer" @click="move(i, -1)">▲</button>
          <button class="px-1 hover:text-signal" title="Reculer" @click="move(i, 1)">▼</button>
          <button class="px-1 hover:text-signal" data-testid="widget-edit" @click="openEdit(i)">
            modifier
          </button>
          <button class="px-1 hover:text-offline" @click="widgets.splice(i, 1)">×</button>
        </div>
      </div>
    </div>

    <WidgetEditor
      v-if="editWidget"
      :widget="editWidget"
      :devices="scopeDevices"
      :catalogs="catalogs"
      :company-id="companyId"
      @save="onEdited"
      @cancel="editWidget = null"
    />
  </section>
</template>

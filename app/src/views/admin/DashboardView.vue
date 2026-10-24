<script setup lang="ts">
// PROTOTYPE — tableau de bord d'une box ou d'un projet (plusieurs tableaux possibles, éditables par l'admin).
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

const route = useRoute()
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
const companyId = computed(
  () =>
    (scope.value === 'device' ? scopeDevices.value[0]?.company_id : project.value?.company_id) ??
    null,
)
const heading = computed(
  () => (scope.value === 'device' ? scopeDevices.value[0]?.name : project.value?.name) ?? '…',
)
const canManage = computed(
  () =>
    auth.isHexaStaff ||
    (auth.recipient?.role === 'admin' && auth.recipient?.company_id === companyId.value),
)

const period = ref<string>((route.query.period as string) || '24h')

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
    await select((route.query.d as string) || dashboards.value[0]?.id || null)
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
    current.value = {
      company_id: companyId.value ?? '',
      name: 'Vue d\u2019ensemble',
      scope: scope.value,
      device_id: scope.value === 'device' ? targetId.value : null,
      project_id: scope.value === 'project' ? targetId.value : null,
      device_ids: [],
      period: '24h',
      is_default: true,
    }
    widgets.value = defaultWidgets(scopeDevices.value, catalogs.value, scope.value)
    proposed.value = true
  }
  router.replace({ query: { ...route.query, d: current.value.id || undefined } })
  await refresh()
}

async function refresh() {
  lastRefresh.value = Date.now()
  range.value = (PERIODS[period.value] ?? PERIODS['24h']).range(Date.now())
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
  router.replace({ query: { ...route.query, period: period.value } })
  refresh()
})
// clé texte : un tableau neuf déclencherait le watcher à chaque changement de query (période)
watch(() => `${route.params.scope}/${route.params.id}`, init)
onMounted(() => {
  init()
  armAuto()
})

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
const backTo = computed(() =>
  scope.value === 'device'
    ? { name: 'admin-device-detail', params: { id: targetId.value } }
    : { name: 'admin-projects', query: { p: targetId.value } },
)
</script>

<template>
  <section
    ref="rootEl"
    :class="[
      'px-4 sm:px-6 lg:px-8 py-6 sm:py-8 w-full',
      isFull && 'bg-background overflow-auto h-full',
    ]"
  >
    <RouterLink
      :to="backTo"
      class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-signal"
    >
      ← {{ scope === 'device' ? 'retour à la box' : 'retour au projet' }}
    </RouterLink>
    <header class="mt-3 mb-4 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
      <div class="min-w-0">
        <div class="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-1">
          Tableau de bord · {{ scope === 'device' ? 'box' : 'projet' }} · prototype
        </div>
        <h1 class="text-2xl sm:text-3xl font-semibold tracking-tight truncate">{{ heading }}</h1>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <select
          v-if="dashboards.length > 1 || (dashboards.length && proposed)"
          :value="current?.id ?? ''"
          class="bg-card border border-border rounded-sm text-xs font-mono px-2 py-1.5"
          data-testid="dash-select"
          @change="select(($event.target as HTMLSelectElement).value || null)"
        >
          <option v-for="d in dashboards" :key="d.id" :value="d.id">{{ d.name }}</option>
        </select>
        <div
          class="flex gap-px bg-border border border-border rounded-sm overflow-x-auto max-w-full"
        >
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
        <label
          class="flex items-center gap-1 text-[11px] font-mono text-muted-foreground"
          :title="`Actualisé à ${new Date(lastRefresh).toLocaleTimeString('fr-FR')}`"
        >
          <span class="hidden sm:inline">Actualiser</span>
          <select
            v-model.number="autoRefresh"
            class="bg-card border border-border rounded-sm px-1.5 py-1 text-xs"
            data-testid="dash-auto"
          >
            <option v-for="a in AUTO" :key="a.s" :value="a.s">{{ a.label }}</option>
          </select>
        </label>
        <button
          class="text-xs font-mono uppercase tracking-wider px-3 py-1.5 rounded border border-border hover:border-signal/60"
          data-testid="dash-export"
          @click="exportOpen = !exportOpen"
        >
          CSV
        </button>
        <button
          class="text-xs font-mono uppercase tracking-wider px-3 py-1.5 rounded border border-border hover:border-signal/60"
          data-testid="dash-reports"
          @click="reportsOpen = !reportsOpen"
        >
          Rapports
        </button>
        <button
          v-if="!editing"
          class="hidden md:inline-flex text-xs font-mono uppercase tracking-wider px-3 py-1.5 rounded border border-border hover:border-signal/60"
          :title="isFull ? 'Quitter le plein écran (Échap)' : 'Afficher le tableau en plein écran'"
          data-testid="dash-fullscreen"
          @click="toggleFull"
        >
          {{ isFull ? 'Quitter' : 'Plein écran' }}
        </button>
        <button
          v-if="canManage && !editing"
          class="text-xs font-mono uppercase tracking-wider px-3 py-1.5 rounded border border-border hover:border-signal/60"
          data-testid="dash-edit"
          @click="editing = true"
        >
          Modifier
        </button>
      </div>
    </header>

    <div
      v-if="proposed && !loading"
      class="mb-4 text-xs text-muted-foreground border border-dashed border-border rounded px-3 py-2"
    >
      Tableau de bord proposé automatiquement (pas encore enregistré).<span v-if="canManage">
        « Modifier » pour l'adapter.</span
      >
    </div>

    <!-- barre d'édition -->
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
      <label class="text-xs flex items-center gap-1.5 text-muted-foreground"
        ><input v-model="current.is_default" type="checkbox" /> par défaut</label
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
        @click="select(current.id ?? null)"
      >
        Annuler
      </button>
    </div>
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
        {{ exportSources.length }} variable(s), période affichée ({{ PERIODS[period]?.label }}). Une
        ligne par date, une colonne par variable.
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

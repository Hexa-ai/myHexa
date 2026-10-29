<script setup lang="ts">
import { uploadImage } from '@/composables/useBranding'
import AlarmWidgetEditor from '@/components/dashboard/AlarmWidgetEditor.vue'
import { supabase } from '@/lib/supabase'
// PROTOTYPE — édition d'un bloc : type, titre, largeur, sources (box + variable), opération, options.
import { computed, ref } from 'vue'
import type { DeviceWithStatus } from '@/composables/useDevices'
import type { HistVar } from '@/composables/useHistory'
import {
  DEFAULT_ALARM_STATES,
  DEFAULT_STATES,
  COMBINE_LABEL,
  OP_LABEL,
  STAT_LABEL,
  STATUS_FIELDS,
  THRESHOLD_COLORS,
  WIDGET_LABEL,
  isAlarmWidget,
  type Op,
  type Stat,
  type Widget,
  type WidgetType,
  type WidgetWidth,
} from '@/composables/useDashboards'

const props = defineProps<{
  widget: Widget
  devices: DeviceWithStatus[]
  catalogs: Record<string, HistVar[]>
  companyId?: string | null
}>()
const emit = defineEmits<{ (e: 'save', w: Widget): void; (e: 'cancel'): void }>()

const w = ref<Widget>(JSON.parse(JSON.stringify(props.widget)))

// envoi d'image (voyants, bloc image) vers le bucket public de l'entreprise
const uploading = ref(false)
const uploadErr = ref('')
async function pickImage(ev: Event, set: (url: string) => void) {
  const f = (ev.target as HTMLInputElement).files?.[0]
  ;(ev.target as HTMLInputElement).value = ''
  if (!f || !props.companyId) return
  uploading.value = true
  uploadErr.value = ''
  try {
    set(await uploadImage(props.companyId, f))
  } catch (e) {
    uploadErr.value = (e as Error).message
  } finally {
    uploading.value = false
  }
}
const WIDTHS: WidgetWidth[] = ['1/4', '1/3', '1/2', '2/3', 'full']
const needsVars = computed(
  () =>
    !['status', 'image', 'text', 'map', 'document', 'interventions', 'weather'].includes(
      w.value.type,
    ) &&
    !isAlarmWidget(w.value.type),
)
const multi = computed(() => props.devices.length > 1)

const newDev = ref(props.devices[0]?.id ?? '')
const newVar = ref('')
const vars = computed(() => props.catalogs[newDev.value] ?? [])
const boxVars = computed(() => vars.value.filter((v) => v.category !== 'weather'))
const weatherVars = computed(() => vars.value.filter((v) => v.category === 'weather'))
function addSource() {
  if (!newDev.value || !newVar.value) return
  if (!w.value.sources.some((s) => s.device === newDev.value && s.var === newVar.value))
    w.value.sources.push({ device: newDev.value, var: newVar.value })
  newVar.value = ''
}
const devName = (id: string) => props.devices.find((d) => d.id === id)?.name ?? id.slice(0, 8)
const unitOf = (dev: string, v: string) => props.catalogs[dev]?.find((x) => x.var === v)?.unit ?? ''
const units = computed(() => [
  ...new Set(w.value.sources.filter((s) => s.var).map((s) => unitOf(s.device, s.var))),
])

function setType(t: WidgetType) {
  w.value.type = t
  if (t === 'indicator') {
    initStates()
    w.value.op = null
  }
  if (t === 'map') {
    w.value.op = null
    if (w.value.width === '1/4' || w.value.width === '1/3') w.value.width = '1/2'
    w.value.sources = props.devices.map((d) => ({ device: d.id, var: '' }))
    initStates()
  } else if (isAlarmWidget(t)) {
    w.value.op = null
    if (!w.value.sources.length || w.value.sources.some((s) => s.var))
      w.value.sources = props.devices.map((d) => ({ device: d.id, var: '' }))
    w.value.options.severities ??= ['error', 'warning']
    w.value.options.compare ??= null
    if (w.value.width === '1/4' || w.value.width === '1/3')
      w.value.width = t === 'alarm_history' ? 'full' : '1/2'
  } else if (t === 'interventions') {
    w.value.op = null
    if (!w.value.sources.length || w.value.sources.some((s) => s.var))
      w.value.sources = props.devices.map((d) => ({ device: d.id, var: '' }))
    w.value.options.kinds ??= ['signalement']
    w.value.options.openOnly ??= true
    w.value.options.photos ??= true
    w.value.options.limit ??= 5
    if (w.value.width === '1/4' || w.value.width === '1/3') w.value.width = '1/2'
  } else if (t === 'weather') {
    w.value.op = null
    if (!w.value.sources.length || w.value.sources.some((s) => s.var))
      w.value.sources = props.devices.slice(0, 1).map((d) => ({ device: d.id, var: '' }))
    w.value.options.weatherView ??= 'now'
  } else if (t === 'status') {
    w.value.sources = props.devices.map((d) => ({ device: d.id, var: '' }))
    w.value.options.fields ??= ['online', 'last_seen', 'uptime', 'version']
  } else if (['image', 'text'].includes(t)) w.value.sources = []
  else if (t === 'document') {
    w.value.sources = []
    if (w.value.width === '1/4' || w.value.width === '1/3') w.value.width = '1/2'
    w.value.options.docs ??= []
    void loadDocs()
  } else w.value.sources = w.value.sources.filter((s) => s.var)
}
// documents des box du tableau (plans, manuels, photos) : choix libre, affichés dans le bloc
const docs = ref<{ id: string; device_id: string; name: string; kind: string }[]>([])
async function loadDocs() {
  const ids = props.devices.map((d) => d.id)
  if (!ids.length) return
  const { data } = await supabase
    .from('device_documents')
    .select('id, device_id, name, kind')
    .in('device_id', ids)
    .order('name')
  docs.value = data ?? []
}
if (w.value.type === 'document') void loadDocs()
function toggleDoc(id: string) {
  const a = w.value.options.docs ?? []
  w.value.options.docs = a.includes(id) ? a.filter((x) => x !== id) : [...a, id]
}
function toggleField(f: string) {
  const a = w.value.options.fields ?? []
  w.value.options.fields = a.includes(f) ? a.filter((x) => x !== f) : [...a, f]
}
// carte : variable d'état facultative par box (colore le repère)
const stateVars = (dev: string) => {
  // historique (ts_vars) + variables du dernier statut (les alarmes n'ont souvent pas d'historique)
  const out = new Map<string, { var: string }>()
  for (const v of props.catalogs[dev] ?? [])
    if (['state', 'alarm'].includes(v.category ?? '')) out.set(v.var, { var: v.var })
  const st = props.devices.find((d) => d.id === dev)?.status_payload as {
    variables?: { name?: string; category?: string }[]
  } | null
  for (const v of st?.variables ?? [])
    if (v.name && ['state', 'alarm'].includes(v.category ?? '')) out.set(v.name, { var: v.name })
  return [...out.values()]
}
function setMapVar(dev: string, v: string) {
  const s = w.value.sources.find((x) => x.device === dev)
  if (s) s.var = v
}
function toggleStatusDevice(id: string) {
  const has = w.value.sources.some((s) => s.device === id)
  w.value.sources = has
    ? w.value.sources.filter((s) => s.device !== id)
    : [...w.value.sources, { device: id, var: '' }]
}
const isChart = computed(() => ['curve', 'bars'].includes(w.value.type))
// seuils d'une courbe : trait horizontal + libellé
function addThreshold() {
  const t = w.value.options.thresholds ?? []
  t.push({ value: 0, label: '', color: THRESHOLD_COLORS[t.length % THRESHOLD_COLORS.length].color })
  w.value.options.thresholds = t
}
function toggleKind(k: 'signalement' | 'intervention') {
  const a = w.value.options.kinds ?? ['signalement']
  const n = a.includes(k) ? a.filter((x) => x !== k) : [...a, k]
  w.value.options.kinds = n.length ? n : [k === 'signalement' ? 'intervention' : 'signalement']
}
function setMode(m: 'overlay' | 'separate') {
  w.value.op = null
  w.value.options.separate = m === 'separate'
}
// voyant : un état par valeur (libellé, couleur, image facultative)
function initStates() {
  if (w.value.options.states?.length) return
  const first = w.value.sources[0]
  const cat = first
    ? props.catalogs[first.device]?.find((v) => v.var === first.var)?.category
    : null
  w.value.options.states = JSON.parse(
    JSON.stringify(cat === 'alarm' ? DEFAULT_ALARM_STATES : DEFAULT_STATES),
  )
}
function addState() {
  const st = w.value.options.states ?? []
  st.push({
    value: st.length ? Math.max(...st.map((x) => Number(x.value))) + 1 : 0,
    label: '',
    color: '#2563eb',
  })
  w.value.options.states = st
}
function save() {
  if (
    w.value.type === 'indicator' ||
    (w.value.type === 'map' && w.value.sources.some((s) => s.var))
  )
    initStates()
  if (w.value.sources.filter((s) => s.var).length < 2) w.value.op = null
  if (w.value.options.thresholds)
    w.value.options.thresholds = w.value.options.thresholds
      .filter((t) => typeof t.value === 'number' && Number.isFinite(t.value))
      .map((t) => ({ ...t, label: (t.label ?? '').trim().slice(0, 60) }))
  emit('save', w.value)
}
</script>

<template>
  <div
    class="fixed inset-0 z-[600] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-6"
    @click.self="emit('cancel')"
  >
    <div
      class="w-full sm:max-w-2xl max-h-[92vh] overflow-auto bg-background border border-border rounded-t-lg sm:rounded-lg p-4 sm:p-5"
      data-testid="widget-editor"
    >
      <h2 class="font-semibold mb-3">Bloc</h2>

      <div class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
        Type
      </div>
      <div class="flex flex-wrap gap-1.5 mb-4">
        <button
          v-for="(lbl, t) in WIDGET_LABEL"
          :key="t"
          :class="[
            'text-xs px-2.5 py-1 rounded border',
            w.type === t
              ? 'border-signal text-signal'
              : 'border-border text-muted-foreground hover:border-signal/50',
          ]"
          @click="setType(t as WidgetType)"
        >
          {{ lbl }}
        </button>
      </div>

      <div class="grid sm:grid-cols-2 gap-3 mb-4">
        <label class="text-sm">
          <span class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
            >Titre (facultatif)</span
          >
          <input
            v-model="w.title"
            class="mt-1 w-full bg-card border border-border rounded-sm px-2 py-1.5 text-sm"
          />
        </label>
        <div>
          <span class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
            >Largeur (grand écran)</span
          >
          <div class="mt-1 flex gap-1">
            <button
              v-for="x in WIDTHS"
              :key="x"
              :class="[
                'flex-1 text-xs py-1.5 rounded border font-mono',
                w.width === x ? 'border-signal text-signal' : 'border-border text-muted-foreground',
              ]"
              @click="w.width = x"
            >
              {{ x === 'full' ? 'pleine' : x }}
            </button>
          </div>
        </div>
      </div>

      <!-- sources -->
      <template v-if="needsVars">
        <div class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
          Variables
        </div>
        <div class="space-y-1 mb-2">
          <div
            v-for="(s, i) in w.sources"
            :key="s.device + s.var"
            class="flex items-center gap-2 text-sm"
          >
            <span class="flex-1 truncate">
              <span v-if="multi" class="text-muted-foreground">{{ devName(s.device) }} · </span
              >{{ s.var }}
              <span class="font-mono text-[10px] text-muted-foreground">{{
                unitOf(s.device, s.var)
              }}</span>
            </span>
            <button
              class="font-mono text-[10px] text-muted-foreground hover:text-offline"
              @click="w.sources.splice(i, 1)"
            >
              retirer
            </button>
          </div>
        </div>
        <div class="flex flex-col sm:flex-row gap-2 mb-3">
          <select
            v-if="multi"
            v-model="newDev"
            class="min-w-0 sm:max-w-[40%] bg-card border border-border rounded-sm px-2 py-1.5 text-sm"
            data-testid="src-device"
          >
            <option v-for="d in devices" :key="d.id" :value="d.id">{{ d.name }}</option>
          </select>
          <select
            v-model="newVar"
            class="flex-1 min-w-0 bg-card border border-border rounded-sm px-2 py-1.5 text-sm"
            data-testid="src-var"
          >
            <option value="">— variable —</option>
            <option v-for="v in boxVars" :key="v.var" :value="v.var">
              {{ v.var }}{{ v.unit ? ` (${v.unit})` : ''
              }}{{ v.description ? ` — ${v.description}` : '' }}
            </option>
            <!-- météo relevée par le portail à l'adresse de la box -->
            <optgroup v-if="weatherVars.length" label="Météo (adresse de la box)">
              <option v-for="v in weatherVars" :key="v.var" :value="v.var">
                {{ v.description?.replace(/^Météo : /, '') ?? v.var }}{{ v.unit ? ` (${v.unit})` : '' }}
              </option>
            </optgroup>
          </select>
          <button
            class="shrink-0 text-xs px-3 py-1.5 rounded border border-signal/50 text-signal disabled:opacity-40"
            :disabled="!newVar"
            data-testid="src-add"
            @click="addSource"
          >
            Ajouter
          </button>
        </div>
        <div
          v-if="w.type === 'indicator' && w.sources.length > 1"
          class="mb-3"
          data-testid="combine"
        >
          <span class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
            >Plusieurs états</span
          >
          <div class="mt-1 flex flex-wrap gap-1">
            <button
              :class="[
                'text-xs px-2.5 py-1 rounded border',
                !w.options.combine
                  ? 'border-signal text-signal'
                  : 'border-border text-muted-foreground',
              ]"
              data-testid="combine-none"
              @click="w.options.combine = null"
            >
              Un voyant par variable
            </button>
            <button
              v-for="(l, c) in COMBINE_LABEL"
              :key="c"
              :class="[
                'text-xs px-2.5 py-1 rounded border',
                w.options.combine === c
                  ? 'border-signal text-signal'
                  : 'border-border text-muted-foreground',
              ]"
              :data-testid="`combine-${c}`"
              @click="w.options.combine = c"
            >
              Synthèse : {{ l.toLowerCase() }}
            </button>
          </div>
          <p class="mt-1 text-[11px] text-muted-foreground">
            Synthèse : un seul voyant. « Au moins un actif » / « tous actifs » donnent 0 ou 1 (actif
            = valeur non nulle) ; « le plus élevé » garde la valeur la plus haute (ex. 0 normal, 1
            alerte, 2 défaut).
          </p>
        </div>
        <div v-else-if="w.sources.length > 1" class="mb-3">
          <span class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
            >Plusieurs variables</span
          >
          <div class="mt-1 flex flex-wrap gap-1">
            <button
              v-if="isChart"
              :class="[
                'text-xs px-2.5 py-1 rounded border',
                !w.op && !w.options.separate
                  ? 'border-signal text-signal'
                  : 'border-border text-muted-foreground',
              ]"
              data-testid="op-overlay"
              @click="setMode('overlay')"
            >
              Même graphique (2 axes si unités différentes)
            </button>
            <button
              :class="[
                'text-xs px-2.5 py-1 rounded border',
                !w.op && (w.options.separate || !isChart)
                  ? 'border-signal text-signal'
                  : 'border-border text-muted-foreground',
              ]"
              data-testid="op-separate"
              @click="setMode('separate')"
            >
              {{ isChart ? 'Graphiques séparés' : 'Afficher chacune' }}
            </button>
            <button
              v-for="(lbl, o) in OP_LABEL"
              :key="o"
              :class="[
                'text-xs px-2.5 py-1 rounded border',
                w.op === o ? 'border-signal text-signal' : 'border-border text-muted-foreground',
              ]"
              :data-testid="`op-${o}`"
              @click="w.op = o as Op"
            >
              {{ lbl }}
            </button>
          </div>
          <p v-if="w.op && units.length > 1" class="mt-1 text-[11px] text-offline">
            Unités différentes ({{ units.join(', ') }}) : le résultat n'aura pas de sens.
          </p>
          <p
            v-if="isChart && !w.op && !w.options.separate && units.length > 2"
            class="mt-1 text-[11px] text-offline"
          >
            Plus de 2 unités ({{ units.join(', ') }}) : l'axe de droite les mélange, préférer des
            graphiques séparés.
          </p>
        </div>
      </template>

      <!-- options -->
      <div
        v-if="['table', 'curve', 'bars'].includes(w.type)"
        class="grid sm:grid-cols-2 gap-3 mb-3"
      >
        <label class="text-sm">
          <span class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
            >Comparer avec</span
          >
          <select
            data-testid="widget-compare-table"
            v-model="w.options.compare"
            class="mt-1 w-full bg-card border border-border rounded-sm px-2 py-1.5 text-sm"
          >
            <option :value="null">rien</option>
            <option value="previous">période précédente</option>
            <option value="year">même période l'an dernier</option>
          </select>
        </label>
      </div>
      <!-- seuils (courbes, barres) -->
      <div v-if="isChart" class="mb-3" data-testid="threshold-editor">
        <div class="flex items-center gap-2 mb-1">
          <span class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
            >Seuils</span
          >
          <span class="text-[11px] text-muted-foreground"
            >traits horizontaux pointillés, sur l'axe de gauche</span
          >
        </div>
        <div
          v-for="(t, i) in w.options.thresholds ?? []"
          :key="i"
          class="flex flex-wrap items-center gap-1.5 mb-1.5"
          data-testid="threshold-row"
        >
          <input
            v-model.number="t.value"
            type="number"
            step="any"
            placeholder="valeur"
            class="w-28 bg-card border border-border rounded-sm px-2 py-1.5 text-sm"
            data-testid="threshold-value"
          />
          <input
            v-model="t.label"
            type="text"
            maxlength="60"
            placeholder="description (ex. seuil haut)"
            class="flex-1 min-w-[10rem] bg-card border border-border rounded-sm px-2 py-1.5 text-sm"
            data-testid="threshold-label"
          />
          <div class="flex gap-1">
            <button
              v-for="c in THRESHOLD_COLORS"
              :key="c.color"
              type="button"
              :title="c.label"
              :class="[
                'h-6 w-6 rounded-full border-2',
                t.color === c.color ? 'border-foreground' : 'border-transparent',
              ]"
              :style="{ background: c.color }"
              @click="t.color = c.color"
            />
          </div>
          <button
            type="button"
            class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-offline px-1"
            @click="w.options.thresholds!.splice(i, 1)"
          >
            retirer
          </button>
        </div>
        <button
          type="button"
          class="font-mono text-[10px] uppercase tracking-widest px-2.5 py-1 rounded border border-border hover:bg-muted"
          data-testid="threshold-add"
          @click="addThreshold"
        >
          + Ajouter un seuil
        </button>
      </div>

      <!-- signalements -->
      <div
        v-if="w.type === 'interventions'"
        class="mb-3 space-y-3"
        data-testid="interventions-editor"
      >
        <div v-if="devices.length > 1">
          <div class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
            Box
          </div>
          <div class="flex flex-wrap gap-x-4 gap-y-1">
            <label
              v-for="d in devices"
              :key="d.id"
              class="inline-flex items-center gap-1.5 text-sm"
            >
              <input
                type="checkbox"
                :checked="w.sources.some((s) => s.device === d.id)"
                @change="toggleStatusDevice(d.id)"
              />
              {{ d.name }}
            </label>
          </div>
        </div>
        <div>
          <div class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
            Afficher
          </div>
          <div class="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <label class="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                :checked="(w.options.kinds ?? ['signalement']).includes('signalement')"
                @change="toggleKind('signalement')"
              />
              signalements
            </label>
            <label class="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                :checked="(w.options.kinds ?? []).includes('intervention')"
                @change="toggleKind('intervention')"
              />
              interventions
            </label>
            <label class="inline-flex items-center gap-1.5">
              <input
                v-model="w.options.photos"
                type="checkbox"
                data-testid="interventions-photos"
              />
              photos
            </label>
          </div>
        </div>
        <div class="grid sm:grid-cols-2 gap-3">
          <label class="text-sm">
            <span class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
              >Lesquels</span
            >
            <select
              v-model="w.options.openOnly"
              class="mt-1 w-full bg-card border border-border rounded-sm px-2 py-1.5 text-sm"
            >
              <option :value="true">les ouverts (non résolus)</option>
              <option :value="false">ceux de la période du tableau</option>
            </select>
          </label>
          <label class="text-sm">
            <span class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
              >Nombre affiché</span
            >
            <input
              v-model.number="w.options.limit"
              type="number"
              min="1"
              max="20"
              class="mt-1 w-full bg-card border border-border rounded-sm px-2 py-1.5 text-sm"
            />
          </label>
        </div>
      </div>

      <div v-if="['value', 'gauge'].includes(w.type)" class="grid sm:grid-cols-2 gap-3 mb-3">
        <label class="text-sm">
          <span class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
            >Valeur affichée</span
          >
          <select
            v-model="w.options.stat"
            class="mt-1 w-full bg-card border border-border rounded-sm px-2 py-1.5 text-sm"
          >
            <option v-for="(lbl, s) in STAT_LABEL" :key="s" :value="s as Stat">{{ lbl }}</option>
          </select>
        </label>
        <label class="text-sm">
          <span class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
            >Comparer avec</span
          >
          <select
            data-testid="widget-compare"
            v-model="w.options.compare"
            class="mt-1 w-full bg-card border border-border rounded-sm px-2 py-1.5 text-sm"
          >
            <option :value="null">rien</option>
            <option value="previous">période précédente</option>
            <option value="year">même période l'an dernier</option>
          </select>
        </label>
        <template v-if="w.type === 'gauge'">
          <label class="text-sm">
            <span class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
              >Min (vide = min de la période)</span
            >
            <input
              v-model.number="w.options.min"
              type="number"
              class="mt-1 w-full bg-card border border-border rounded-sm px-2 py-1.5 text-sm"
            />
          </label>
          <label class="text-sm">
            <span class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
              >Max (vide = max de la période)</span
            >
            <input
              v-model.number="w.options.max"
              type="number"
              class="mt-1 w-full bg-card border border-border rounded-sm px-2 py-1.5 text-sm"
            />
          </label>
        </template>
      </div>
      <div
        v-if="w.type === 'indicator' || (w.type === 'map' && w.sources.some((s) => s.var))"
        class="mb-3"
        data-testid="states-editor"
      >
        <div class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
          Apparence par état (valeur exacte ; une valeur non listée s'affiche en gris)
        </div>
        <div
          v-for="(st, i) in w.options.states ?? []"
          :key="i"
          class="flex flex-wrap sm:flex-nowrap items-center gap-2 mb-1.5"
        >
          <input
            v-model.number="st.value"
            type="number"
            class="w-16 bg-card border border-border rounded-sm px-2 py-1 text-sm"
            title="valeur"
          />
          <input
            v-model="st.color"
            type="color"
            class="w-9 h-8 bg-card border border-border rounded-sm"
            title="couleur"
          />
          <input
            v-model="st.label"
            placeholder="libellé (ex. Marche)"
            class="flex-1 min-w-[110px] bg-card border border-border rounded-sm px-2 py-1 text-sm"
          />
          <img
            v-if="st.image"
            :src="st.image"
            alt=""
            class="w-8 h-8 object-contain rounded-sm border border-border bg-white"
          />
          <label
            v-if="companyId"
            class="text-[11px] px-2 py-1 rounded border border-border cursor-pointer hover:border-signal/60"
            title="image PNG ou JPEG, 2 Mo max."
          >
            {{ st.image ? 'changer l’image' : 'image…' }}
            <input
              type="file"
              accept="image/png,image/jpeg"
              class="hidden"
              data-testid="state-image-input"
              @change="pickImage($event, (u) => (st.image = u))"
            />
          </label>
          <button
            v-if="st.image"
            class="font-mono text-[10px] text-muted-foreground"
            @click="st.image = undefined"
          >
            sans image
          </button>
          <button
            class="font-mono text-[10px] text-muted-foreground hover:text-offline"
            @click="w.options.states!.splice(i, 1)"
          >
            retirer
          </button>
        </div>
        <button
          class="text-xs px-2.5 py-1 rounded border border-border"
          data-testid="state-add"
          @click="addState"
        >
          + État
        </button>
      </div>
      <div v-if="w.type === 'map'" class="mb-3" data-testid="map-editor">
        <div class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
          Box sur la carte (et état qui colore le repère, facultatif)
        </div>
        <div
          v-for="d in devices"
          :key="d.id"
          class="flex flex-col sm:flex-row sm:items-center gap-1.5 mb-1"
        >
          <label class="text-sm flex items-center gap-1.5 sm:w-1/2 min-w-0">
            <input
              type="checkbox"
              :checked="w.sources.some((s) => s.device === d.id)"
              @change="toggleStatusDevice(d.id)"
            />
            <span class="truncate">{{ d.name }}</span>
            <span v-if="d.latitude == null" class="font-mono text-[10px] text-muted-foreground"
              >sans position</span
            >
          </label>
          <select
            v-if="w.sources.some((s) => s.device === d.id) && stateVars(d.id).length"
            :value="w.sources.find((s) => s.device === d.id)?.var ?? ''"
            class="flex-1 bg-card border border-border rounded-sm px-2 py-1 text-sm"
            data-testid="map-var"
            @change="setMapVar(d.id, ($event.target as HTMLSelectElement).value)"
          >
            <option value="">couleur : connexion / alarmes</option>
            <option v-for="v in stateVars(d.id)" :key="v.var" :value="v.var">
              couleur selon {{ v.var }}
            </option>
          </select>
        </div>
      </div>
      <AlarmWidgetEditor
        v-if="isAlarmWidget(w.type)"
        :key="w.type"
        :widget="w"
        :devices="devices"
      />
      <div v-if="w.type === 'status'" class="mb-3">
        <div class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
          Champs
        </div>
        <div class="flex flex-wrap gap-x-4 gap-y-1">
          <label
            v-for="(lbl, f) in STATUS_FIELDS"
            :key="f"
            class="text-sm flex items-center gap-1.5"
          >
            <input
              type="checkbox"
              :checked="(w.options.fields ?? []).includes(f as string)"
              @change="toggleField(f as string)"
            />
            {{ lbl }}
          </label>
        </div>
        <template v-if="multi">
          <div
            class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mt-3 mb-1"
          >
            Box
          </div>
          <div class="flex flex-wrap gap-x-4 gap-y-1">
            <label v-for="d in devices" :key="d.id" class="text-sm flex items-center gap-1.5">
              <input
                type="checkbox"
                :checked="w.sources.some((s) => s.device === d.id)"
                @change="toggleStatusDevice(d.id)"
              />
              {{ d.name }}
            </label>
          </div>
        </template>
      </div>
      <div v-if="w.type === 'weather'" class="mb-3 space-y-3" data-testid="weather-editor">
        <div>
          <div class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
            Affichage
          </div>
          <div class="inline-flex gap-1 p-1 border border-border rounded-md bg-card/40">
            <button
              v-for="o in [
                { v: 'now', l: 'Maintenant' },
                { v: 'hours', l: '24 heures' },
                { v: 'days', l: '5 jours' },
              ] as const"
              :key="o.v"
              type="button"
              :data-testid="`weather-view-${o.v}`"
              :class="[
                'px-3 py-1 rounded text-xs transition',
                (w.options.weatherView ?? 'now') === o.v
                  ? 'bg-signal/15 text-signal'
                  : 'text-muted-foreground hover:text-foreground',
              ]"
              @click="w.options.weatherView = o.v"
            >
              {{ o.l }}
            </button>
          </div>
        </div>
        <div v-if="multi">
          <div class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
            Box (adresse)
          </div>
          <select
            :value="w.sources[0]?.device ?? ''"
            class="bg-card border border-border rounded-sm px-2 py-1.5 text-sm"
            data-testid="weather-device"
            @change="
              w.sources = [{ device: ($event.target as HTMLSelectElement).value, var: '' }]
            "
          >
            <option v-for="d in devices" :key="d.id" :value="d.id">{{ d.name }}</option>
          </select>
        </div>
        <p class="text-xs text-muted-foreground">
          Météo relevée par le portail toutes les 15 min à l'adresse de la box. Les mesures sont
          aussi disponibles comme variables (groupe « Météo ») dans les courbes.
        </p>
      </div>
      <div v-if="w.type === 'document'" class="mb-3" data-testid="docs-layout">
        <div class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
          Présentation
        </div>
        <div class="inline-flex gap-1 p-1 border border-border rounded-md bg-card/40">
          <button
            v-for="o in [
              { v: 'cards', l: 'Fiches' },
              { v: 'list', l: 'Liste' },
            ] as const"
            :key="o.v"
            type="button"
            :data-testid="`docs-layout-${o.v}`"
            :class="[
              'px-3 py-1 rounded text-xs transition',
              (w.options.docLayout ?? 'cards') === o.v
                ? 'bg-signal/15 text-signal'
                : 'text-muted-foreground hover:text-foreground',
            ]"
            @click="w.options.docLayout = o.v"
          >
            {{ o.l }}
          </button>
        </div>
      </div>
      <div v-if="w.type === 'document'" class="mb-3" data-testid="docs-editor">
        <div class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
          Documents à afficher
        </div>
        <p v-if="!docs.length" class="text-xs text-muted-foreground">
          Aucun document sur ces box (à ajouter depuis la fiche de la box).
        </p>
        <div v-for="d in devices" :key="d.id">
          <template v-if="docs.some((x) => x.device_id === d.id)">
            <div v-if="devices.length > 1" class="font-mono text-[10px] text-muted-foreground mt-2">
              {{ d.name }}
            </div>
            <label
              v-for="x in docs.filter((x) => x.device_id === d.id)"
              :key="x.id"
              class="flex items-center gap-2 text-sm py-0.5"
            >
              <input
                type="checkbox"
                :checked="(w.options.docs ?? []).includes(x.id)"
                data-testid="doc-check"
                @change="toggleDoc(x.id)"
              />
              <span class="truncate">{{ x.name }}</span>
            </label>
          </template>
        </div>
      </div>
      <label v-if="w.type === 'image'" class="block text-sm mb-3">
        <span class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
          >Adresse de l'image</span
        >
        <div class="mt-1 flex gap-2">
          <input
            v-model="w.options.url"
            placeholder="https://…"
            class="flex-1 min-w-0 bg-card border border-border rounded-sm px-2 py-1.5 text-sm"
          />
          <span
            v-if="companyId"
            class="text-xs px-2.5 py-1.5 rounded border border-border cursor-pointer hover:border-signal/60 relative"
          >
            Envoyer un fichier
            <input
              type="file"
              accept="image/png,image/jpeg"
              class="absolute inset-0 opacity-0 cursor-pointer"
              data-testid="image-input"
              @change="pickImage($event, (u) => (w.options.url = u))"
            />
          </span>
        </div>
      </label>
      <label v-if="w.type === 'text'" class="block text-sm mb-3">
        <span class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
          >Texte</span
        >
        <textarea
          v-model="w.options.text"
          rows="3"
          class="mt-1 w-full bg-card border border-border rounded-sm px-2 py-1.5 text-sm"
        />
      </label>

      <p v-if="uploadErr" class="text-xs text-offline mb-2">{{ uploadErr }}</p>
      <p v-if="uploading" class="text-xs text-muted-foreground mb-2">Envoi de l'image…</p>
      <div class="flex justify-end gap-2 mt-4">
        <button class="text-xs px-3 py-1.5 rounded border border-border" @click="emit('cancel')">
          Annuler
        </button>
        <button
          class="text-xs px-3 py-1.5 rounded border border-signal bg-signal text-primary-foreground"
          data-testid="widget-ok"
          @click="save"
        >
          Valider
        </button>
      </div>
    </div>
  </div>
</template>

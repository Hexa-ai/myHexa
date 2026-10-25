<script setup lang="ts">
// PROTOTYPE — réglages des blocs d'alarmes : box, alarmes retenues, gravités, lignes, comparaison.
import { computed, onMounted, ref } from 'vue'
import type { DeviceWithStatus } from '@/composables/useDevices'
import type { Widget } from '@/composables/useDashboards'
import {
  fetchAlarms,
  SEV_COLOR,
  SEV_LABEL,
  SEVERITIES,
  type AlarmName,
  type Severity,
} from '@/composables/useAlarmHistory'

const props = defineProps<{ widget: Widget; devices: DeviceWithStatus[] }>()
const w = computed(() => props.widget)
const multi = computed(() => props.devices.length > 1)
const isStats = computed(() => w.value.type === 'alarm_stats')

// alarmes connues des box du bloc (12 derniers mois) pour le filtre par nom
const known = ref<AlarmName[]>([])
const loadErr = ref('')
async function loadNames() {
  loadErr.value = ''
  try {
    const ids = [...new Set(w.value.sources.map((s) => s.device))]
    const to = Date.now()
    known.value = (await fetchAlarms(ids, to - 366 * 864e5, to, { limit: 1 })).names
  } catch (e) {
    loadErr.value = (e as Error).message
  }
}
onMounted(loadNames)

function toggleDevice(id: string) {
  const has = w.value.sources.some((s) => s.device === id)
  w.value.sources = has
    ? w.value.sources.filter((s) => s.device !== id)
    : [...w.value.sources, { device: id, var: '' }]
  void loadNames()
}
const sevs = computed<Severity[]>(() => w.value.options.severities ?? ['error', 'warning'])
function toggleSev(s: Severity) {
  const a = sevs.value
  w.value.options.severities = a.includes(s) ? a.filter((x) => x !== s) : [...a, s]
}
const picked = computed(() => w.value.options.alarms ?? [])
function toggleAlarm(n: string) {
  const a = picked.value
  w.value.options.alarms = a.includes(n) ? a.filter((x) => x !== n) : [...a, n]
}
const shown = computed(() => known.value.filter((n) => sevs.value.includes(n.severity)))
const LBL = 'font-mono text-[10px] uppercase tracking-widest text-muted-foreground'
</script>

<template>
  <div class="mb-3 space-y-3" data-testid="alarm-editor">
    <div v-if="multi">
      <div :class="[LBL, 'mb-1']">Box</div>
      <div class="flex flex-wrap gap-x-4 gap-y-1">
        <label v-for="d in devices" :key="d.id" class="text-sm flex items-center gap-1.5">
          <input
            type="checkbox"
            :checked="w.sources.some((s) => s.device === d.id)"
            @change="toggleDevice(d.id)"
          />
          {{ d.name }}
        </label>
      </div>
    </div>
    <div>
      <div :class="[LBL, 'mb-1']">Gravité</div>
      <div class="flex gap-1.5">
        <button
          v-for="s in SEVERITIES"
          :key="s"
          :data-testid="`alarm-sev-${s}`"
          :class="[
            'text-xs px-2.5 py-1 rounded border inline-flex items-center gap-1.5',
            sevs.includes(s) ? 'border-signal text-signal' : 'border-border text-muted-foreground',
          ]"
          @click="toggleSev(s)"
        >
          <span class="size-2 rounded-full" :style="{ background: SEV_COLOR[s] }" />
          {{ SEV_LABEL[s] }}
        </button>
      </div>
    </div>
    <div>
      <div :class="[LBL, 'mb-1']">
        Alarmes
        <span class="normal-case tracking-normal">
          ({{ picked.length ? picked.length + ' choisie(s)' : 'toutes' }})
        </span>
      </div>
      <p v-if="loadErr" class="text-xs text-offline">{{ loadErr }}</p>
      <p v-else-if="!shown.length" class="text-xs text-muted-foreground">
        Aucune alarme connue sur 12 mois pour ces box et gravités.
      </p>
      <div v-else class="max-h-40 overflow-y-auto border border-border rounded-sm p-2 space-y-0.5">
        <label
          v-for="n in shown"
          :key="n.name"
          class="text-xs flex items-center gap-1.5"
          data-testid="alarm-pick"
        >
          <input type="checkbox" :checked="picked.includes(n.name)" @change="toggleAlarm(n.name)" />
          <span
            class="size-2 rounded-full shrink-0"
            :style="{ background: SEV_COLOR[n.severity] }"
          />
          <span class="font-mono truncate">{{ n.name }}</span>
          <span v-if="n.description" class="text-muted-foreground truncate"
            >· {{ n.description }}</span
          >
        </label>
      </div>
      <button
        v-if="picked.length"
        class="mt-1 text-[11px] text-muted-foreground underline"
        @click="w.options.alarms = []"
      >
        toutes les alarmes
      </button>
    </div>
    <div class="grid sm:grid-cols-2 gap-3">
      <label v-if="!isStats" class="text-sm">
        <span :class="LBL">Lignes affichées</span>
        <input
          v-model.number="w.options.limit"
          type="number"
          min="5"
          max="200"
          placeholder="20"
          data-testid="alarm-limit"
          class="mt-1 w-full bg-card border border-border rounded-sm px-2 py-1.5 text-sm"
        />
      </label>
      <template v-else>
        <label class="text-sm">
          <span :class="LBL">Comparer avec</span>
          <select
            v-model="w.options.compare"
            data-testid="alarm-compare"
            class="mt-1 w-full bg-card border border-border rounded-sm px-2 py-1.5 text-sm"
          >
            <option :value="null">rien</option>
            <option value="previous">période précédente</option>
            <option value="year">même période l'an dernier</option>
          </select>
        </label>
        <label class="text-sm flex items-center gap-1.5 mt-5">
          <input v-model="w.options.chart" type="checkbox" data-testid="alarm-chart" />
          Barres (de la plus fréquente à la moins fréquente)
        </label>
      </template>
    </div>
  </div>
</template>

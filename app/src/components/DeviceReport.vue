<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { formatRelative, isOnline } from '@/lib/utils'
import DeviceMap from '@/components/DeviceMap.vue'

interface Device {
  id: string
  name: string | null
  address: string | null
  latitude: number | null
  longitude: number | null
}

interface StatusPayload {
  device?: { hostname?: string; version?: string; uptime?: number; timezone?: string }
  variables?: Array<{
    name?: string
    description?: string
    value: unknown
    unit?: string
    category?: string
    timestamp?: string
    type_alarm?: string
  }>
  network?: Record<string, { ip?: string | null; connected?: boolean; mode?: string; ssid?: string | null }>
  services?: Record<string, { enabled?: boolean }>
}

interface Status {
  payload: StatusPayload
  receivedAt: string
}

const props = withDefaults(
  defineProps<{
    device: Device
    status: Status | null
    role?: string
    expiresAt?: string | null
    canEditLocation?: boolean
  }>(),
  { role: 'viewer', expiresAt: null, canEditLocation: false },
)

const emit = defineEmits<{
  (e: 'save-location', address: string): void
}>()

const activeTab = ref<'data' | 'status' | 'config'>('data')

const mapRef = ref<InstanceType<typeof DeviceMap> | null>(null)

const mapMarkers = computed(() => {
  const d = props.device
  if (d.latitude == null || d.longitude == null) return []
  return [
    {
      id: d.id,
      lat: Number(d.latitude),
      lng: Number(d.longitude),
      label: d.name ?? undefined,
      online: online.value,
    },
  ]
})

watch(activeTab, async (t) => {
  if (t === 'data') {
    await nextTick()
    mapRef.value?.invalidateSize()
  }
})

const addressDraft = ref('')
const savingLocation = ref(false)
const locationFeedback = ref<{ kind: 'success' | 'error'; message: string } | null>(null)

watch(
  () => props.device.address,
  (v) => { addressDraft.value = v ?? '' },
  { immediate: true },
)

function submitAddress() {
  const a = addressDraft.value.trim()
  if (!a) return
  locationFeedback.value = null
  savingLocation.value = true
  emit('save-location', a)
}

defineExpose({
  setLocationFeedback(kind: 'success' | 'error', message: string) {
    locationFeedback.value = { kind, message }
    savingLocation.value = false
  },
  resetSaving() {
    savingLocation.value = false
  },
})

const online = computed(() => isOnline(props.status?.receivedAt))
const lastSeen = computed(() => formatRelative(props.status?.receivedAt))
const isAdmin = computed(() => props.role === 'admin')
const payload = computed<StatusPayload>(() => props.status?.payload ?? {})

const activeAlarms = computed(() =>
  (payload.value.variables ?? []).filter(
    (v) => v?.category === 'alarm' && v?.value !== 0 && v?.value !== null && v?.value !== false,
  ),
)
const measures = computed(() => (payload.value.variables ?? []).filter((v) => v?.category === 'measure'))
const counters = computed(() => (payload.value.variables ?? []).filter((v) => v?.category === 'counter'))
const states = computed(() => (payload.value.variables ?? []).filter((v) => v?.category === 'state'))

function formatValue(v: unknown, unit?: string): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? 'vrai' : 'faux'
  if (typeof v === 'number') {
    const s = Number.isInteger(v) ? String(v) : v.toFixed(2)
    return unit ? `${s} ${unit}` : s
  }
  return String(v)
}
</script>

<template>
  <div class="space-y-6 fade-up">
    <!-- Header -->
    <header class="flex items-end justify-between flex-wrap gap-4">
      <div>
        <div class="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-2 flex items-center gap-2">
          <span class="text-signal">⬢</span>
          Équipement · {{ isAdmin ? 'admin' : 'lecture' }}
        </div>
        <h1 class="text-3xl font-semibold tracking-tight">{{ device.name || '—' }}</h1>
        <p class="mt-2 text-sm text-muted-foreground font-mono">
          Dernière télémétrie · {{ lastSeen }}
        </p>
      </div>
      <div class="flex items-center gap-2">
        <span
          v-if="online"
          class="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider px-3 py-1.5 rounded-md bg-signal-soft text-signal"
        >
          <span class="size-1.5 rounded-full bg-signal pulse-dot" />
          Online
        </span>
        <span
          v-else
          class="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider px-3 py-1.5 rounded-md bg-offline-soft text-offline"
        >
          <span class="size-1.5 rounded-full bg-offline" />
          Offline
        </span>
        <span
          v-if="activeAlarms.length"
          class="font-mono text-[11px] uppercase tracking-wider px-3 py-1.5 rounded-md bg-offline-soft text-offline"
        >
          {{ activeAlarms.length }} alarme(s)
        </span>
      </div>
    </header>

    <!-- Tabs -->
    <nav class="inline-flex gap-1 p-1 border border-border rounded-md bg-card/40">
      <button
        v-for="tab in (['data', 'status', 'config'] as const)"
        :key="tab"
        @click="activeTab = tab"
        :class="[
          'font-mono text-[11px] uppercase tracking-[0.18em] px-4 py-1.5 rounded transition',
          activeTab === tab
            ? 'bg-signal text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground',
        ]"
      >
        {{ tab === 'data' ? 'Données' : tab === 'status' ? 'État' : 'Configuration' }}
      </button>
    </nav>

    <!-- Données -->
    <section v-if="activeTab === 'data'" class="space-y-6">
      <div class="border border-border rounded-md bg-card/40 p-5 space-y-4">
        <div>
          <div class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Adresse</div>
          <div class="text-sm">{{ device.address || '—' }}</div>
        </div>
        <DeviceMap
          v-if="mapMarkers.length"
          ref="mapRef"
          :markers="mapMarkers"
          height="240px"
          :zoom="14"
        />
      </div>

      <div>
        <h2 class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Alarmes</h2>
        <div
          v-if="!activeAlarms.length"
          class="border border-border rounded-md bg-card/40 p-5 text-sm text-muted-foreground"
        >
          Aucune alarme active.
        </div>
        <div v-else class="border border-offline/40 rounded-md bg-card/60 overflow-hidden">
          <table class="w-full text-sm">
            <tbody>
              <tr v-for="(a, i) in activeAlarms" :key="i" class="border-b border-border/50 last:border-0">
                <td class="px-4 py-3 font-medium">{{ a.name }}</td>
                <td class="px-4 py-3 text-muted-foreground text-xs">{{ a.description }}</td>
                <td class="px-4 py-3 text-right font-mono text-xs text-offline tabular">
                  {{ formatValue(a.value, a.unit) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="measures.length">
        <h2 class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Mesures</h2>
        <div class="border border-border rounded-md bg-card/40 overflow-hidden">
          <table class="w-full text-sm">
            <tbody>
              <tr v-for="(m, i) in measures" :key="i" class="border-b border-border/50 last:border-0">
                <td class="px-4 py-3 font-medium">{{ m.name }}</td>
                <td class="px-4 py-3 text-muted-foreground text-xs">{{ m.description }}</td>
                <td class="px-4 py-3 text-right font-mono text-xs tabular">{{ formatValue(m.value, m.unit) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="counters.length">
        <h2 class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Compteurs</h2>
        <div class="border border-border rounded-md bg-card/40 overflow-hidden">
          <table class="w-full text-sm">
            <tbody>
              <tr v-for="(c, i) in counters" :key="i" class="border-b border-border/50 last:border-0">
                <td class="px-4 py-3 font-medium">{{ c.name }}</td>
                <td class="px-4 py-3 text-muted-foreground text-xs">{{ c.description }}</td>
                <td class="px-4 py-3 text-right font-mono text-xs tabular">{{ formatValue(c.value, c.unit) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="states.length">
        <h2 class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-3">États</h2>
        <div class="border border-border rounded-md bg-card/40 overflow-hidden">
          <table class="w-full text-sm">
            <tbody>
              <tr v-for="(s, i) in states" :key="i" class="border-b border-border/50 last:border-0">
                <td class="px-4 py-3 font-medium">{{ s.name }}</td>
                <td class="px-4 py-3 text-muted-foreground text-xs">{{ s.description }}</td>
                <td class="px-4 py-3 text-right font-mono text-xs tabular">{{ formatValue(s.value, s.unit) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- État -->
    <section v-if="activeTab === 'status'" class="space-y-5">
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-px bg-border border border-border rounded-md overflow-hidden">
        <div class="bg-card px-5 py-4">
          <div class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Version</div>
          <div class="font-mono mt-1">{{ payload.device?.version || '—' }}</div>
        </div>
        <div class="bg-card px-5 py-4">
          <div class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Uptime</div>
          <div class="mt-1 tabular">
            {{ payload.device?.uptime ? Math.floor(payload.device.uptime / 3600) + 'h' : '—' }}
          </div>
        </div>
        <div class="bg-card px-5 py-4">
          <div class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Timezone</div>
          <div class="mt-1">{{ payload.device?.timezone || '—' }}</div>
        </div>
      </div>

      <div v-if="payload.network">
        <h2 class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Réseau</h2>
        <div class="grid sm:grid-cols-2 gap-3">
          <div
            v-for="(ifc, name) in payload.network"
            :key="name"
            class="border border-border rounded-md bg-card/40 p-4"
          >
            <div class="flex items-center gap-2">
              <span :class="['size-1.5 rounded-full', ifc.connected ? 'bg-signal' : 'bg-muted-foreground/40']" />
              <span class="font-mono text-xs uppercase tracking-wider">{{ name }}</span>
            </div>
            <div class="mt-2 font-mono text-xs text-muted-foreground">{{ ifc.ip || '—' }}</div>
          </div>
        </div>
      </div>

      <div v-if="payload.services && Object.keys(payload.services).length">
        <h2 class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Services</h2>
        <div class="border border-border rounded-md bg-card/40 overflow-hidden">
          <table class="w-full text-sm">
            <tbody>
              <tr v-for="(svc, name) in payload.services" :key="name" class="border-b border-border/50 last:border-0">
                <td class="px-4 py-2.5 font-mono text-xs">{{ name }}</td>
                <td class="px-4 py-2.5 text-right">
                  <span
                    :class="[
                      'font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded',
                      svc.enabled ? 'bg-signal-soft text-signal' : 'bg-muted text-muted-foreground',
                    ]"
                  >
                    {{ svc.enabled ? 'actif' : 'inactif' }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- Configuration -->
    <section v-if="activeTab === 'config'" class="space-y-4">
      <p v-if="!isAdmin" class="font-mono text-xs text-muted-foreground">
        Accès en lecture seule — seuls les administrateurs peuvent modifier la configuration.
      </p>

      <div v-else class="border border-border rounded-md bg-card/40 p-5">
        <div class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
          Adresse enregistrée
        </div>
        <div class="text-sm mb-5 break-words">
          {{ device.address || 'Aucune adresse renseignée.' }}
        </div>

        <template v-if="canEditLocation">
          <form @submit.prevent="submitAddress" class="space-y-3">
            <div class="space-y-1.5">
              <label
                for="address-input"
                class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
              >
                Nouvelle adresse
              </label>
              <input
                id="address-input"
                v-model="addressDraft"
                type="text"
                required
                placeholder="Ex: 12 rue de la Paix, 75002 Paris"
                class="w-full bg-transparent border-0 border-b border-border focus:border-signal focus:outline-none px-0 py-2 text-sm font-mono placeholder:text-muted-foreground/40 transition"
              />
            </div>

            <p
              v-if="locationFeedback"
              :class="[
                'font-mono text-xs flex items-center gap-2',
                locationFeedback.kind === 'success' ? 'text-signal' : 'text-offline',
              ]"
            >
              <span
                :class="[
                  'size-1.5 rounded-full',
                  locationFeedback.kind === 'success' ? 'bg-signal' : 'bg-offline',
                ]"
              />
              {{ locationFeedback.message }}
            </p>

            <button
              type="submit"
              :disabled="savingLocation"
              class="bg-signal text-primary-foreground font-semibold px-5 py-2.5 rounded-md transition disabled:opacity-60 disabled:cursor-not-allowed hover:brightness-110"
            >
              <span class="font-mono text-[11px] uppercase tracking-[0.22em]">
                <template v-if="savingLocation">
                  <span class="blink">▍</span> enregistrement
                </template>
                <template v-else>Enregistrer</template>
              </span>
            </button>
          </form>
        </template>
        <slot v-else name="config-extra" />
      </div>
    </section>

    <footer v-if="expiresAt" class="pt-6 text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
      Lien valide jusqu'au {{ new Date(expiresAt).toLocaleString('fr-FR') }}
    </footer>
  </div>
</template>

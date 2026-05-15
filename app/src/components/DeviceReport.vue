<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { formatRelative, isOnline } from '@/lib/utils'
import DeviceMap from '@/components/DeviceMap.vue'
import QRCodeBlock from '@/components/QRCodeBlock.vue'
import { useTailscaleReachable } from '@/composables/useTailscaleReachable'

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
  network?: Record<string, NetworkInterface>
  services?: Record<string, { enabled?: boolean }>
}

interface NetworkInterface {
  ip?: string | null
  mask?: string | null
  gateway?: string | null
  dns?: string[] | null
  mode?: string | null
  ssid?: string | null
  signal?: number | null
  technology?: string | null
  operator?: string | null
  connected?: boolean
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
    vncHost?: string | null
    vncPort?: number | null
    canEditVnc?: boolean
    periodicHref?: ((type: 'daily' | 'weekly') => string) | null
    interventionUrl?: string | null
  }>(),
  {
    role: 'viewer',
    expiresAt: null,
    canEditLocation: false,
    vncHost: null,
    vncPort: 5900,
    canEditVnc: false,
    periodicHref: null,
    interventionUrl: null,
  },
)

const emit = defineEmits<{
  (e: 'save-location', address: string): void
  (e: 'save-vnc', payload: { host: string | null; port: number }): void
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
  setVncFeedback(kind: 'success' | 'error', message: string) {
    vncFeedback.value = { kind, message }
    savingVnc.value = false
  },
  resetSaving() {
    savingLocation.value = false
    savingVnc.value = false
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

const NETWORK_ORDER: Array<{ key: string; label: string }> = [
  { key: 'eth0', label: 'Ethernet 0' },
  { key: 'eth1', label: 'Ethernet 1' },
  { key: 'wlan0', label: 'Wi-Fi' },
  { key: 'wwan0', label: '4G / Cellulaire' },
  { key: 'tailscale', label: 'Tailscale' },
]

const networkInterfaces = computed(() => {
  const net = payload.value.network ?? {}
  return NETWORK_ORDER.filter((n) => net[n.key]).map((n) => ({
    ...n,
    ifc: net[n.key] as NetworkInterface,
  }))
})

function interfaceRows(ifc: NetworkInterface): Array<[string, string]> {
  const rows: Array<[string, string]> = []
  if (ifc.ip) rows.push(['IP', ifc.ip])
  if (ifc.mask) rows.push(['Masque', ifc.mask])
  if (ifc.gateway) rows.push(['Passerelle', ifc.gateway])
  if (Array.isArray(ifc.dns) && ifc.dns.length) rows.push(['DNS', ifc.dns.join(', ')])
  if (ifc.mode) rows.push(['Mode', ifc.mode])
  if (ifc.ssid) rows.push(['SSID', ifc.ssid])
  if (ifc.signal != null) rows.push(['Signal', `${ifc.signal}%`])
  if (ifc.technology) rows.push(['Techno', String(ifc.technology).toUpperCase()])
  if (ifc.operator) rows.push(['Opérateur', ifc.operator])
  return rows
}

const { reachable: tsReachable, probe: probeTs } = useTailscaleReachable()

onMounted(() => {
  const ip = payload.value.network?.tailscale?.ip
  if (ip && payload.value.network?.tailscale?.connected) probeTs(ip)
})

watch(
  () => payload.value.network?.tailscale?.ip,
  (ip) => {
    if (ip && payload.value.network?.tailscale?.connected) probeTs(ip)
  },
)

const vncHostDraft = ref<string>('')
const vncPortDraft = ref<number>(5900)
const savingVnc = ref(false)
const vncFeedback = ref<{ kind: 'success' | 'error'; message: string } | null>(null)

watch(
  () => [props.vncHost, props.vncPort] as const,
  ([h, p]) => {
    vncHostDraft.value = h ?? ''
    vncPortDraft.value = p ?? 5900
  },
  { immediate: true },
)

const vncEnabled = computed(() => !!props.vncHost)
const vncFullUrl = computed(() => {
  if (!props.vncHost) return null
  return `vnc://${props.vncHost}:${props.vncPort ?? 5900}`
})

function submitVnc() {
  vncFeedback.value = null
  savingVnc.value = true
  emit('save-vnc', {
    host: vncHostDraft.value.trim() || null,
    port: Number(vncPortDraft.value) || 5900,
  })
}

const copiedTailscaleIp = ref<string | null>(null)
async function copyTailscaleIp(ip: string) {
  try {
    await navigator.clipboard.writeText(ip)
    copiedTailscaleIp.value = ip
    setTimeout(() => {
      if (copiedTailscaleIp.value === ip) copiedTailscaleIp.value = null
    }, 1500)
  } catch {
    // ignore — clipboard may be unavailable
  }
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

    <!-- Tabs + Periodic links -->
    <div class="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
      <nav class="inline-flex gap-1 p-1 border border-border rounded-md bg-card/40 overflow-x-auto max-w-full self-start">
        <button
          v-for="tab in (['data', 'status', 'config'] as const)"
          :key="tab"
          @click="activeTab = tab"
          :class="[
            'font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.18em] px-3 sm:px-4 py-1.5 rounded transition whitespace-nowrap',
            activeTab === tab
              ? 'bg-signal text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground',
          ]"
        >
          {{ tab === 'data' ? 'Données' : tab === 'status' ? 'État' : 'Configuration' }}
        </button>
      </nav>

      <div v-if="periodicHref" class="flex items-center gap-2 flex-wrap">
        <a
          :href="periodicHref('daily')"
          class="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] border border-border text-foreground px-3 py-1.5 rounded-md hover:border-signal/60 hover:text-signal transition"
        >
          <svg viewBox="0 0 24 24" class="size-3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 3v18h18" />
            <path d="M7 14l4-4 4 4 5-6" />
          </svg>
          Quotidien
        </a>
        <a
          :href="periodicHref('weekly')"
          class="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] border border-border text-foreground px-3 py-1.5 rounded-md hover:border-signal/60 hover:text-signal transition"
        >
          Hebdomadaire
        </a>
      </div>
    </div>

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
        <div v-else class="border border-offline/40 rounded-md bg-card/60 overflow-x-auto">
          <table class="w-full text-sm min-w-[480px]">
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
        <div class="border border-border rounded-md bg-card/40 overflow-x-auto">
          <table class="w-full text-sm min-w-[480px]">
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
        <div class="border border-border rounded-md bg-card/40 overflow-x-auto">
          <table class="w-full text-sm min-w-[480px]">
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
        <div class="border border-border rounded-md bg-card/40 overflow-x-auto">
          <table class="w-full text-sm min-w-[480px]">
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

      <div v-if="networkInterfaces.length">
        <h2 class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Réseau</h2>
        <div class="grid sm:grid-cols-2 gap-3">
          <div
            v-for="{ key, label, ifc } in networkInterfaces"
            :key="key"
            class="border border-border rounded-md bg-card/40 p-4 flex flex-col"
          >
            <div class="flex items-center gap-2 flex-wrap">
              <span :class="['size-1.5 rounded-full shrink-0', ifc.connected ? 'bg-signal pulse-dot' : 'bg-muted-foreground/40']" />
              <span class="font-medium text-sm">{{ label }}</span>
              <span class="font-mono text-[10px] text-muted-foreground/70 uppercase tracking-wider">{{ key }}</span>
              <span
                v-if="!ifc.connected"
                class="ml-auto font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
              >
                déconnecté
              </span>
            </div>

            <dl
              v-if="interfaceRows(ifc).length"
              class="mt-3 space-y-1 text-xs"
            >
              <div
                v-for="[k, v] in interfaceRows(ifc)"
                :key="k"
                class="flex items-baseline gap-3"
              >
                <dt class="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70 shrink-0 w-[78px]">
                  {{ k }}
                </dt>
                <dd class="font-mono break-all text-foreground/90">{{ v }}</dd>
              </div>
            </dl>
            <div v-else class="mt-3 font-mono text-xs text-muted-foreground/70">—</div>

            <div
              v-if="key === 'tailscale' && ifc.ip && ifc.connected && online"
              class="mt-3 flex items-center gap-2 flex-wrap"
            >
              <a
                v-if="tsReachable === true"
                :href="`http://${ifc.ip}`"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] bg-signal text-primary-foreground px-3 py-1.5 rounded-md hover:brightness-110 transition"
              >
                <svg viewBox="0 0 24 24" class="size-3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <path d="M15 3h6v6" />
                  <path d="M10 14 21 3" />
                </svg>
                Ouvrir
              </a>
              <span
                v-else-if="tsReachable === false"
                class="font-mono text-[10px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5"
                title="Activez Tailscale sur votre poste pour ouvrir"
              >
                <span class="size-1.5 rounded-full bg-muted-foreground/40" /> Hors Tailscale
              </span>
              <a
                v-if="tsReachable === true && vncEnabled"
                :href="vncFullUrl!"
                :title="vncFullUrl!"
                class="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] border border-signal/50 text-signal px-3 py-1.5 rounded-md hover:bg-signal-soft transition"
              >
                <svg viewBox="0 0 24 24" class="size-3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="2" y="4" width="20" height="14" rx="2" />
                  <path d="M8 21h8M12 18v3" />
                </svg>
                VNC
              </a>
              <button
                type="button"
                @click="copyTailscaleIp(ifc.ip!)"
                class="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] border border-border text-foreground px-3 py-1.5 rounded-md hover:border-signal/60 hover:text-signal transition"
              >
                <template v-if="copiedTailscaleIp === ifc.ip">
                  ✓ Copié
                </template>
                <template v-else>
                  <svg viewBox="0 0 24 24" class="size-3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  Copier l'IP
                </template>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div v-if="payload.services && Object.keys(payload.services).length">
        <h2 class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Services</h2>
        <div class="border border-border rounded-md bg-card/40 overflow-x-auto">
          <table class="w-full text-sm min-w-[480px]">
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

      <div v-else class="space-y-5">
        <!-- QR intervention block -->
        <div v-if="interventionUrl" class="border border-border rounded-md bg-card/40 p-5">
          <div class="flex items-start justify-between gap-4 flex-wrap">
            <div class="flex-1 min-w-[200px]">
              <div class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                QR intervention terrain
              </div>
              <p class="text-sm text-muted-foreground mb-2">
                À imprimer / coller sur l'équipement. Les techniciens scannent → formulaire mobile pour journaliser une intervention sans avoir besoin d'un compte.
              </p>
              <p class="font-mono text-[11px] text-muted-foreground/80 break-all">
                {{ interventionUrl }}
              </p>
            </div>
            <QRCodeBlock
              :value="interventionUrl"
              :size="180"
              :download="`intervention-${device.name || device.id}`"
              :sublabel="device.name || ''"
            />
          </div>
        </div>

        <!-- VNC block -->
        <div class="border border-border rounded-md bg-card/40 p-5">
          <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Accès VNC
            </div>
            <a
              v-if="vncEnabled && online && tsReachable === true"
              :href="vncFullUrl!"
              :title="vncFullUrl!"
              class="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] bg-signal text-primary-foreground px-3 py-1.5 rounded-md hover:brightness-110 transition"
            >
              <svg viewBox="0 0 24 24" class="size-3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="4" width="20" height="14" rx="2" />
                <path d="M8 21h8M12 18v3" />
              </svg>
              Ouvrir VNC
            </a>
          </div>

          <p v-if="!vncEnabled" class="text-sm text-muted-foreground">
            Aucun serveur VNC configuré.
          </p>
          <p v-else class="font-mono text-xs text-muted-foreground break-all">
            {{ vncFullUrl }}
          </p>

          <template v-if="canEditVnc">
            <form @submit.prevent="submitVnc" class="mt-4 space-y-3">
              <div class="grid grid-cols-1 sm:grid-cols-[1fr_120px] gap-3">
                <div class="space-y-1.5">
                  <label class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Hôte VNC (souvent l'IP Tailscale)
                  </label>
                  <input
                    v-model="vncHostDraft"
                    type="text"
                    placeholder="100.64.x.x ou laisser vide pour désactiver"
                    class="w-full bg-transparent border-0 border-b border-border focus:border-signal focus:outline-none px-0 py-2 text-sm font-mono placeholder:text-muted-foreground/40 transition"
                  />
                </div>
                <div class="space-y-1.5">
                  <label class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Port
                  </label>
                  <input
                    v-model.number="vncPortDraft"
                    type="number"
                    min="1"
                    max="65535"
                    class="w-full bg-transparent border-0 border-b border-border focus:border-signal focus:outline-none px-0 py-2 text-sm font-mono transition"
                  />
                </div>
              </div>

              <p
                v-if="vncFeedback"
                :class="[
                  'font-mono text-xs flex items-center gap-2',
                  vncFeedback.kind === 'success' ? 'text-signal' : 'text-offline',
                ]"
              >
                <span
                  :class="[
                    'size-1.5 rounded-full',
                    vncFeedback.kind === 'success' ? 'bg-signal' : 'bg-offline',
                  ]"
                />
                {{ vncFeedback.message }}
              </p>

              <button
                type="submit"
                :disabled="savingVnc"
                class="bg-signal text-primary-foreground font-semibold px-5 py-2.5 rounded-md transition disabled:opacity-60 disabled:cursor-not-allowed hover:brightness-110"
              >
                <span class="font-mono text-[11px] uppercase tracking-[0.22em]">
                  <template v-if="savingVnc">
                    <span class="blink">▍</span> enregistrement
                  </template>
                  <template v-else>Enregistrer VNC</template>
                </span>
              </button>
            </form>
          </template>
        </div>

        <!-- Location block -->
        <div class="border border-border rounded-md bg-card/40 p-5">
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
      </div>
    </section>

    <footer v-if="expiresAt" class="pt-6 text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
      Lien valide jusqu'au {{ new Date(expiresAt).toLocaleString('fr-FR') }}
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useDevices } from '@/composables/useDevices'
import {
  formatRelative,
  isOnline,
  activeInterfaces,
  tailscaleIp,
  activeAlarmCount,
  type InterfaceKey,
} from '@/lib/utils'
import { useTailscaleReachable } from '@/composables/useTailscaleReachable'

const router = useRouter()
const { devices, loading, error, load } = useDevices()
const query = ref('')

const { reachable: tsReachable, probe: probeTs } = useTailscaleReachable()

function openDevice(id: string) {
  router.push({ name: 'admin-device-detail', params: { id } })
}

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return devices.value
  return devices.value.filter((d) =>
    [d.name, d.serial_number, d.mac_eth0, d.address]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q)),
  )
})

const onlineCount = computed(() => devices.value.filter((d) => isOnline(d.last_connection_at)).length)
const offlineCount = computed(() => devices.value.length - onlineCount.value)
const totalAlarms = computed(() =>
  devices.value.reduce((sum, d) => sum + activeAlarmCount(d.status_payload), 0),
)

interface Row {
  id: string
  name: string | null
  serial: string | null
  online: boolean
  lastSeenIso: string | null
  interfaces: InterfaceKey[]
  alarmCount: number
  tsIp: string | null
}

const rows = computed<Row[]>(() =>
  filtered.value.map((d) => ({
    id: d.id,
    name: d.name,
    serial: d.serial_number,
    online: isOnline(d.last_connection_at),
    lastSeenIso: d.last_connection_at,
    interfaces: activeInterfaces(d.status_payload),
    alarmCount: activeAlarmCount(d.status_payload),
    tsIp: tailscaleIp(d.status_payload),
  })),
)

// Probe Tailscale reachability once we have at least one device with a Tailscale IP
watch(
  devices,
  (list) => {
    if (tsReachable.value !== null) return
    const first = list.find((d) => tailscaleIp(d.status_payload))
    if (first) probeTs(tailscaleIp(first.status_payload)!)
  },
  { immediate: true },
)

onMounted(load)

const IFC_LABEL: Record<InterfaceKey, string> = {
  eth0: 'Ethernet 0',
  eth1: 'Ethernet 1',
  wlan0: 'Wi-Fi',
  wwan0: '4G',
  tailscale: 'Tailscale',
}
const IFC_SHORT: Record<InterfaceKey, string> = {
  eth0: 'ETH0',
  eth1: 'ETH1',
  wlan0: 'WIFI',
  wwan0: '4G',
  tailscale: 'VPN',
}
</script>

<template>
  <section class="px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10 max-w-[1400px] mx-auto">
    <!-- Heading -->
    <header class="flex flex-col md:flex-row md:items-end md:justify-between gap-5 mb-8 sm:mb-10 fade-up">
      <div>
        <div class="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-3 flex items-center gap-2">
          <span class="text-signal">⬢</span> Fleet · read-only
        </div>
        <h1 class="text-3xl sm:text-4xl font-semibold tracking-tight">
          Devices<span class="text-signal">.</span>
        </h1>
        <p class="mt-3 text-sm text-muted-foreground max-w-md">
          Inventaire en direct des capteurs déployés. Statut basé sur la dernière télémétrie (seuil 1 h).
        </p>
      </div>

      <!-- KPI strip -->
      <div class="grid grid-cols-4 gap-px bg-border border border-border rounded-sm overflow-hidden self-start md:self-auto w-full md:w-auto">
        <div class="bg-card px-3 sm:px-4 py-2.5 sm:py-3 min-w-0">
          <div class="text-[9px] sm:text-[10px] uppercase tracking-widest text-muted-foreground">Total</div>
          <div class="font-mono text-xl sm:text-2xl tabular mt-0.5">{{ devices.length.toString().padStart(2, '0') }}</div>
        </div>
        <div class="bg-card px-3 sm:px-4 py-2.5 sm:py-3 min-w-0">
          <div class="text-[9px] sm:text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
            <span class="size-1 rounded-full bg-signal pulse-dot" /> Online
          </div>
          <div class="font-mono text-xl sm:text-2xl tabular mt-0.5 text-signal">{{ onlineCount.toString().padStart(2, '0') }}</div>
        </div>
        <div class="bg-card px-3 sm:px-4 py-2.5 sm:py-3 min-w-0">
          <div class="text-[9px] sm:text-[10px] uppercase tracking-widest text-muted-foreground">Offline</div>
          <div class="font-mono text-xl sm:text-2xl tabular mt-0.5" :class="offlineCount > 0 ? 'text-offline' : ''">
            {{ offlineCount.toString().padStart(2, '0') }}
          </div>
        </div>
        <div class="bg-card px-3 sm:px-4 py-2.5 sm:py-3 min-w-0">
          <div class="text-[9px] sm:text-[10px] uppercase tracking-widest text-muted-foreground">Alarmes</div>
          <div class="font-mono text-xl sm:text-2xl tabular mt-0.5" :class="totalAlarms > 0 ? 'text-offline' : ''">
            {{ totalAlarms.toString().padStart(2, '0') }}
          </div>
        </div>
      </div>
    </header>

    <!-- Toolbar -->
    <div class="flex items-center justify-between gap-3 mb-3 fade-up" style="animation-delay: 60ms">
      <div class="relative flex-1 sm:flex-none sm:w-72">
        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono text-xs">⌕</span>
        <input
          v-model="query"
          type="search"
          placeholder="filter devices…"
          class="w-full pl-8 pr-3 py-2 bg-card border border-border rounded-sm text-sm font-mono placeholder:text-muted-foreground/60 focus:outline-none focus:border-signal/60 focus:ring-1 focus:ring-signal/40 transition"
        />
      </div>
      <div class="flex items-center gap-3 shrink-0">
        <span
          v-if="tsReachable === true"
          class="hidden sm:inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-signal"
          title="Vous êtes connecté au réseau Tailscale"
        >
          <span class="size-1.5 rounded-full bg-signal pulse-dot" /> Tailscale OK
        </span>
        <span
          v-else-if="tsReachable === false"
          class="hidden sm:inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
          title="Tailscale non détecté sur votre navigateur"
        >
          <span class="size-1.5 rounded-full bg-muted-foreground/40" /> Tailscale off
        </span>
        <span class="text-[10px] sm:text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
          {{ filtered.length }} / {{ devices.length }}
        </span>
      </div>
    </div>

    <!-- Status / loading -->
    <div v-if="loading" class="border border-border rounded-sm bg-card/40 p-10 text-center font-mono text-sm text-muted-foreground">
      <span class="blink">▍</span> loading telemetry…
    </div>
    <div v-else-if="error" class="border border-offline/40 rounded-sm bg-offline-soft p-5 font-mono text-sm text-offline">
      ERR · {{ error }}
    </div>

    <!-- Desktop table -->
    <div v-else class="hidden md:block border border-border rounded-sm bg-card/40 overflow-hidden fade-up" style="animation-delay: 120ms">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-border bg-card/60">
            <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-3 w-[140px]">Status</th>
            <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-3">Name</th>
            <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-3 w-[100px]">Alarmes</th>
            <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-3 w-[160px]">Réseau</th>
            <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-3 w-[120px]">Accès</th>
            <th class="text-right font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-3 w-[180px]">Last seen</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(r, i) in rows"
            :key="r.id"
            @click="openDevice(r.id)"
            class="group border-b border-border/50 last:border-0 hover:bg-secondary/40 cursor-pointer transition-colors fade-up"
            :style="{ animationDelay: `${Math.min(i * 25, 400)}ms` }"
          >
            <td class="px-4 py-3.5">
              <span class="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider">
                <span :class="['size-1.5 rounded-full', r.online ? 'bg-signal pulse-dot' : 'bg-offline/70']" />
                <span :class="r.online ? 'text-signal' : 'text-offline/80'">
                  {{ r.online ? 'online' : 'offline' }}
                </span>
              </span>
            </td>
            <td class="px-4 py-3.5">
              <div class="flex items-center gap-2">
                <span class="opacity-0 group-hover:opacity-100 text-signal transition">›</span>
                <span class="font-medium tracking-tight">{{ r.name || '—' }}</span>
              </div>
            </td>
            <td class="px-4 py-3.5">
              <span
                v-if="r.alarmCount > 0"
                class="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-offline-soft text-offline tabular"
              >
                <span class="size-1 rounded-full bg-offline" /> {{ r.alarmCount }}
              </span>
              <span v-else class="font-mono text-xs text-muted-foreground/50">—</span>
            </td>
            <td class="px-4 py-3.5">
              <div v-if="r.interfaces.length" class="flex items-center gap-1.5 flex-wrap">
                <span
                  v-for="k in r.interfaces"
                  :key="k"
                  :title="IFC_LABEL[k]"
                  class="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-signal-soft text-signal"
                >
                  <span class="size-1 rounded-full bg-signal" />
                  {{ IFC_SHORT[k] }}
                </span>
              </div>
              <span v-else class="font-mono text-xs text-muted-foreground/50">—</span>
            </td>
            <td class="px-4 py-3.5">
              <a
                v-if="r.tsIp && tsReachable === true"
                :href="`http://${r.tsIp}`"
                target="_blank"
                rel="noopener noreferrer"
                :title="`Tailscale · ${r.tsIp}`"
                @click.stop
                class="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] bg-signal text-primary-foreground px-2.5 py-1 rounded-md hover:brightness-110 transition"
              >
                <svg viewBox="0 0 24 24" class="size-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <path d="M15 3h6v6M10 14 21 3" />
                </svg>
                Ouvrir
              </a>
              <span
                v-else-if="r.tsIp && tsReachable === false"
                class="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/60"
                title="Activez Tailscale sur votre poste"
              >
                Hors VPN
              </span>
              <span
                v-else-if="r.tsIp"
                class="font-mono text-[10px] text-muted-foreground/40"
                title="Détection…"
              >
                …
              </span>
              <span v-else class="font-mono text-xs text-muted-foreground/50">—</span>
            </td>
            <td class="px-4 py-3.5 text-right">
              <span class="font-mono text-xs text-muted-foreground tabular">
                {{ formatRelative(r.lastSeenIso) }}
              </span>
            </td>
          </tr>
          <tr v-if="rows.length === 0">
            <td colspan="6" class="px-5 py-16 text-center">
              <div class="text-2xl text-muted-foreground/60 font-light">Aucun device</div>
              <div class="mt-2 text-xs font-mono uppercase tracking-wider text-muted-foreground">
                no devices matching current view
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Mobile cards -->
    <div v-if="!loading && !error" class="md:hidden space-y-2 fade-up" style="animation-delay: 120ms">
      <button
        v-for="(r, i) in rows"
        :key="r.id"
        @click="openDevice(r.id)"
        class="w-full text-left border border-border rounded-md bg-card/40 px-4 py-3.5 hover:bg-secondary/40 transition-colors fade-up"
        :style="{ animationDelay: `${Math.min(i * 25, 400)}ms` }"
      >
        <div class="flex items-center justify-between gap-3 mb-1.5">
          <span class="font-medium tracking-tight truncate">{{ r.name || '—' }}</span>
          <span
            class="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider shrink-0"
            :class="r.online ? 'text-signal' : 'text-offline/80'"
          >
            <span :class="['size-1.5 rounded-full', r.online ? 'bg-signal pulse-dot' : 'bg-offline/70']" />
            {{ r.online ? 'online' : 'offline' }}
          </span>
        </div>
        <div class="flex items-center justify-between gap-3 mb-1.5">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span
              v-if="r.alarmCount > 0"
              class="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-offline-soft text-offline tabular"
            >
              <span class="size-1 rounded-full bg-offline" /> {{ r.alarmCount }} alarme
            </span>
            <span
              v-for="k in r.interfaces"
              :key="k"
              :title="IFC_LABEL[k]"
              class="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-signal-soft text-signal"
            >
              {{ IFC_SHORT[k] }}
            </span>
          </div>
          <span class="font-mono text-[11px] tabular text-muted-foreground shrink-0">
            {{ formatRelative(r.lastSeenIso) }}
          </span>
        </div>
        <div v-if="r.tsIp && tsReachable === true" class="mt-2">
          <a
            :href="`http://${r.tsIp}`"
            target="_blank"
            rel="noopener noreferrer"
            @click.stop
            class="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] bg-signal text-primary-foreground px-2.5 py-1 rounded-md"
          >
            Ouvrir ↗
          </a>
        </div>
      </button>
      <div
        v-if="rows.length === 0"
        class="border border-border rounded-md bg-card/40 p-10 text-center"
      >
        <div class="text-xl text-muted-foreground/60 font-light">Aucun device</div>
      </div>
    </div>
  </section>
</template>

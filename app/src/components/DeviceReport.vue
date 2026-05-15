<script setup lang="ts">
import { computed, ref } from 'vue'
import { formatRelative, isOnline } from '@/lib/utils'

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
  }>(),
  { role: 'viewer', expiresAt: null },
)

const activeTab = ref<'data' | 'status' | 'config'>('data')

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
      <div class="border border-border rounded-md bg-card/40 p-5">
        <div class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Adresse</div>
        <div class="text-sm">{{ device.address || '—' }}</div>
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
        <div class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Adresse enregistrée</div>
        <div class="text-sm mb-4">{{ device.address || 'Aucune adresse renseignée.' }}</div>
        <slot name="config-extra">
          <p class="text-xs text-muted-foreground">
            Le formulaire de mise à jour sera disponible dans la prochaine itération.
          </p>
        </slot>
      </div>
    </section>

    <footer v-if="expiresAt" class="pt-6 text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
      Lien valide jusqu'au {{ new Date(expiresAt).toLocaleString('fr-FR') }}
    </footer>
  </div>
</template>

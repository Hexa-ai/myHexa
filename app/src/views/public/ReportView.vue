<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { viewReport, type ViewReportData } from '@/lib/api'
import { formatRelative, isOnline } from '@/lib/utils'
import { useTheme } from '@/composables/useTheme'

const route = useRoute()
const router = useRouter()
const { theme, toggle: toggleTheme } = useTheme()

const loading = ref(true)
const error = ref<{ code: string; message: string } | null>(null)
const data = ref<ViewReportData | null>(null)
const activeTab = ref<'data' | 'status' | 'config'>('data')

const token = computed(() => String(route.query.t ?? ''))
const deviceId = computed(() => String(route.query.d ?? ''))

onMounted(async () => {
  if (!token.value || !deviceId.value) {
    error.value = { code: 'MISSING_PARAMS', message: 'Lien incomplet' }
    loading.value = false
    return
  }
  const res = await viewReport(token.value, deviceId.value)
  loading.value = false
  if (res.ok) {
    data.value = res.data
    return
  }
  if (res.error.code === 'TOKEN_EXPIRED' || res.error.code === 'TOKEN_NOT_FOUND') {
    router.replace({
      name: 'recover',
      query: { reason: res.error.code, from: route.fullPath },
    })
    return
  }
  error.value = res.error
})

const online = computed(() => isOnline(data.value?.status?.receivedAt))
const lastSeen = computed(() => formatRelative(data.value?.status?.receivedAt))
const isAdmin = computed(() => data.value?.role === 'admin')

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
  network?: Record<string, { ip?: string; connected?: boolean; mode?: string; ssid?: string }>
  services?: Record<string, { enabled?: boolean }>
}

const payload = computed<StatusPayload>(() => (data.value?.status?.payload as StatusPayload) ?? {})

const activeAlarms = computed(() =>
  (payload.value.variables ?? []).filter(
    (v) => v?.category === 'alarm' && v?.value !== 0 && v?.value !== null && v?.value !== false,
  ),
)
const measures = computed(() =>
  (payload.value.variables ?? []).filter((v) => v?.category === 'measure'),
)
const counters = computed(() =>
  (payload.value.variables ?? []).filter((v) => v?.category === 'counter'),
)
const states = computed(() =>
  (payload.value.variables ?? []).filter((v) => v?.category === 'state'),
)

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
  <main class="min-h-screen hex-grid">
    <!-- Top bar -->
    <header class="h-12 border-b border-border bg-background/60 backdrop-blur-sm flex items-center justify-between px-5">
      <div class="flex items-center gap-2.5 text-xs font-mono text-muted-foreground">
        <span class="text-signal">⬢</span>
        <span>Hexa.ai</span>
        <span class="text-muted-foreground/50">/</span>
        <span class="text-foreground">report</span>
      </div>
      <button
        @click="toggleTheme"
        :title="theme === 'dark' ? 'Passer en clair' : 'Passer en sombre'"
        class="size-7 inline-flex items-center justify-center rounded-md border border-border hover:border-signal/60 text-muted-foreground hover:text-foreground transition"
      >
        <svg v-if="theme === 'dark'" viewBox="0 0 24 24" class="size-3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
        <svg v-else viewBox="0 0 24 24" class="size-3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
        </svg>
      </button>
    </header>

    <div class="max-w-5xl mx-auto px-6 py-10">
      <!-- Loading -->
      <div v-if="loading" class="border border-border rounded-md bg-card/40 p-10 text-center font-mono text-sm text-muted-foreground">
        <span class="blink">▍</span> chargement du rapport…
      </div>

      <!-- Error (non-expired) -->
      <div v-else-if="error" class="border border-offline/40 rounded-md bg-offline-soft p-6 text-center">
        <div class="font-mono text-[10px] uppercase tracking-[0.3em] text-offline mb-3">
          {{ error.code }}
        </div>
        <p class="text-base">{{ error.message }}</p>
      </div>

      <!-- Report -->
      <div v-else-if="data" class="space-y-6 fade-up">
        <!-- Header -->
        <header class="flex items-end justify-between flex-wrap gap-4">
          <div>
            <div class="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-2 flex items-center gap-2">
              <span class="text-signal">⬢</span>
              Équipement · {{ isAdmin ? 'admin' : 'lecture' }}
            </div>
            <h1 class="text-3xl font-semibold tracking-tight">
              {{ data.device.name || '—' }}
            </h1>
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

        <!-- Données panel -->
        <section v-if="activeTab === 'data'" class="space-y-6">
          <!-- Localisation -->
          <div class="border border-border rounded-md bg-card/40 p-5">
            <div class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
              Adresse
            </div>
            <div class="text-sm">{{ data.device.address || '—' }}</div>
          </div>

          <!-- Alarmes -->
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
                    <td class="px-4 py-3 text-right font-mono text-xs text-offline tabular">{{ formatValue(a.value, a.unit) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Mesures -->
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

          <!-- Compteurs -->
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

          <!-- États -->
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

        <!-- État panel -->
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
                <div class="mt-2 font-mono text-xs text-muted-foreground">
                  {{ ifc.ip || '—' }}
                </div>
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

        <!-- Configuration panel -->
        <section v-if="activeTab === 'config'" class="space-y-4">
          <p v-if="!isAdmin" class="font-mono text-xs text-muted-foreground">
            Accès en lecture seule — seuls les administrateurs peuvent modifier la configuration.
          </p>
          <div v-else class="border border-border rounded-md bg-card/40 p-5">
            <div class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Adresse enregistrée</div>
            <div class="text-sm mb-4">{{ data.device.address || 'Aucune adresse renseignée.' }}</div>
            <p class="text-xs text-muted-foreground">
              Le formulaire de mise à jour sera disponible dans la prochaine itération (Task 10 LocationView).
            </p>
          </div>
        </section>

        <footer class="pt-6 text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Lien valide jusqu'au {{ new Date(data.expiresAt).toLocaleString('fr-FR') }}
        </footer>
      </div>
    </div>
  </main>
</template>

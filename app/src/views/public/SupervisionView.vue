<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { viewSupervision, type ViewSupervisionData } from '@/lib/api'
import { useTheme } from '@/composables/useTheme'
import DeviceMap, { type MarkerInput } from '@/components/DeviceMap.vue'

const route = useRoute()
const { theme } = useTheme()

const loading = ref(true)
const error = ref<{ code: string; message: string } | null>(null)
const data = ref<ViewSupervisionData | null>(null)

const token = computed(() => String(route.query.t ?? ''))

const markers = computed<MarkerInput[]>(() => {
  if (!data.value) return []
  return data.value.devices
    .filter((d) => d.latitude != null && d.longitude != null)
    .map((d) => ({
      id: d.id,
      lat: Number(d.latitude),
      lng: Number(d.longitude),
      label: d.name ?? undefined,
      online: d.online,
      severity: d.alarm_count > 0 ? ('warning' as const) : null,
    }))
})

const sortedDevices = computed(() => {
  if (!data.value) return []
  return [...data.value.devices].sort((a, b) => {
    // Alarms first, then offline, then online
    const sa = a.alarm_count > 0 ? 0 : a.online ? 2 : 1
    const sb = b.alarm_count > 0 ? 0 : b.online ? 2 : 1
    if (sa !== sb) return sa - sb
    return (a.name ?? '').localeCompare(b.name ?? '')
  })
})

function deviceHref(id: string): string {
  return `/report?t=${encodeURIComponent(token.value)}&d=${encodeURIComponent(id)}`
}

function formatRelative(iso: string | null): string {
  if (!iso) return 'jamais'
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 60) return `il y a ${mins} min`
  if (mins < 1440) return `il y a ${Math.floor(mins / 60)}h`
  return `il y a ${Math.floor(mins / 1440)}j`
}

onMounted(async () => {
  if (!token.value) {
    error.value = { code: 'MISSING_TOKEN', message: 'Lien invalide' }
    loading.value = false
    return
  }
  const res = await viewSupervision(token.value)
  loading.value = false
  if (!res.ok) {
    error.value = res.error
    return
  }
  data.value = res.data
})
</script>

<template>
  <main class="min-h-screen bg-background text-foreground">
    <header class="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
      <div class="max-w-[1200px] mx-auto px-4 sm:px-6 py-4 flex items-center justify-between flex-wrap gap-3">
        <div class="flex items-center gap-3">
          <img
            :src="theme === 'dark' ? '/hexa-logo-dark.png' : '/hexa-logo-light.png'"
            alt="Hexa.ai"
            class="h-7 w-auto"
          />
          <div class="border-l border-border pl-3">
            <div class="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Supervision
            </div>
            <div class="font-semibold tracking-tight">
              {{ data?.company?.name ?? '—' }}
            </div>
          </div>
        </div>
        <div v-if="data?.recipient?.name" class="font-mono text-xs text-muted-foreground">
          {{ data.recipient.name }}
        </div>
      </div>
    </header>

    <div v-if="loading" class="max-w-[1200px] mx-auto px-4 sm:px-6 py-10 text-center text-muted-foreground font-mono text-sm">
      <span class="blink">▍</span> Chargement…
    </div>

    <div
      v-else-if="error"
      class="max-w-[600px] mx-auto px-4 sm:px-6 py-16 text-center"
    >
      <div class="border border-offline/40 bg-offline-soft rounded-md p-8">
        <div class="font-mono text-[10px] uppercase tracking-[0.3em] text-offline mb-3">
          {{ error.code }}
        </div>
        <p class="text-foreground mb-4">{{ error.message }}</p>
        <router-link
          to="/recover"
          class="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-signal hover:underline"
        >
          Demander un nouveau lien →
        </router-link>
      </div>
    </div>

    <div v-else-if="data" class="max-w-[1200px] mx-auto px-4 sm:px-6 py-6 space-y-6">
      <!-- Stats -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border border border-border rounded-md overflow-hidden">
        <div class="bg-card px-4 py-3">
          <div class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Équipements</div>
          <div class="font-mono text-2xl tabular mt-0.5">{{ data.devices.length.toString().padStart(2, '0') }}</div>
        </div>
        <div class="bg-card px-4 py-3">
          <div class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
            <span class="size-1 rounded-full bg-signal pulse-dot" /> Online
          </div>
          <div class="font-mono text-2xl tabular mt-0.5 text-signal">
            {{ data.devices.filter((d) => d.online).length.toString().padStart(2, '0') }}
          </div>
        </div>
        <div class="bg-card px-4 py-3">
          <div class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Offline</div>
          <div
            class="font-mono text-2xl tabular mt-0.5"
            :class="data.devices.filter((d) => !d.online).length > 0 ? 'text-offline' : ''"
          >
            {{ data.devices.filter((d) => !d.online).length.toString().padStart(2, '0') }}
          </div>
        </div>
        <div class="bg-card px-4 py-3">
          <div class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Alarmes</div>
          <div
            class="font-mono text-2xl tabular mt-0.5"
            :class="data.devices.reduce((a, d) => a + d.alarm_count, 0) > 0 ? 'text-warn' : ''"
          >
            {{ data.devices.reduce((a, d) => a + d.alarm_count, 0).toString().padStart(2, '0') }}
          </div>
        </div>
      </div>

      <!-- Map -->
      <div v-if="markers.length" class="rounded-md overflow-hidden border border-border">
        <DeviceMap :markers="markers" height="320px" />
      </div>

      <!-- Devices list -->
      <section>
        <h2 class="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground mb-3">
          Mes équipements
        </h2>
        <div class="grid gap-2">
          <a
            v-for="d in sortedDevices"
            :key="d.id"
            :href="deviceHref(d.id)"
            class="group block border border-border bg-card/40 hover:border-signal/60 hover:bg-card transition rounded-md px-4 py-3"
          >
            <div class="flex items-center justify-between gap-3 flex-wrap">
              <div class="flex items-center gap-3 min-w-0">
                <span
                  class="size-2 rounded-full shrink-0"
                  :class="d.alarm_count > 0 ? 'bg-warn' : d.online ? 'bg-signal' : 'bg-offline'"
                />
                <div class="min-w-0">
                  <div class="font-medium truncate">{{ d.name ?? '—' }}</div>
                  <div class="font-mono text-[11px] text-muted-foreground truncate">
                    {{ d.address ?? '—' }}
                    <span v-if="d.last_status_at" class="ml-1 opacity-70">· {{ formatRelative(d.last_status_at) }}</span>
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-3 shrink-0">
                <span
                  v-if="d.alarm_count > 0"
                  class="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-warn/15 text-warn"
                >
                  {{ d.alarm_count }} alarme{{ d.alarm_count > 1 ? 's' : '' }}
                </span>
                <span
                  v-else-if="d.online"
                  class="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-signal-soft text-signal"
                >
                  Online
                </span>
                <span
                  v-else
                  class="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-offline-soft text-offline"
                >
                  Offline
                </span>
                <span class="font-mono text-[10px] uppercase tracking-wider text-muted-foreground group-hover:text-signal transition">
                  Détails →
                </span>
              </div>
            </div>
          </a>
        </div>
      </section>

      <footer class="pt-6 text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        Lien valide jusqu'au {{ new Date(data.expiresAt).toLocaleString('fr-FR') }}
      </footer>
    </div>
  </main>
</template>

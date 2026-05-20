<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useDevices } from '@/composables/useDevices'
import { isOnline, maxActiveAlarmSeverity } from '@/lib/utils'
import { useAutoRefresh } from '@/composables/useAutoRefresh'
import DeviceMap, { type MarkerInput } from '@/components/DeviceMap.vue'

const router = useRouter()
const { devices, loading, error, load } = useDevices()

useAutoRefresh(load, { intervalMs: 120_000 })

const markers = computed<MarkerInput[]>(() =>
  devices.value
    .filter((d) => d.latitude != null && d.longitude != null)
    .map((d) => ({
      id: d.id,
      lat: Number(d.latitude),
      lng: Number(d.longitude),
      label: d.name ?? undefined,
      online: isOnline(d.last_connection_at),
      severity: maxActiveAlarmSeverity(d.status_payload),
    })),
)

const missingCount = computed(() => devices.value.length - markers.value.length)
const onlineCount = computed(() => markers.value.filter((m) => m.online).length)
const offlineCount = computed(() => markers.value.length - onlineCount.value)

function onSelect(id: string) {
  router.push({ name: 'admin-device-detail', params: { id } })
}
</script>

<template>
  <section class="px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10 w-full h-full flex flex-col">
    <!-- Header -->
    <header class="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6 fade-up">
      <div>
        <div class="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-2 flex items-center gap-2">
          <span class="text-signal">⬢</span> Fleet · map view
        </div>
        <h1 class="text-2xl sm:text-3xl font-semibold tracking-tight">
          Carte de la <span class="text-signal">flotte</span>
        </h1>
        <p
          v-if="missingCount > 0"
          class="mt-2 font-mono text-xs text-muted-foreground"
        >
          {{ missingCount }} équipement(s) sans coordonnées — invisibles sur la carte.
        </p>
      </div>

      <div class="grid grid-cols-3 gap-px bg-border border border-border rounded-sm overflow-hidden self-start md:self-auto w-full md:w-auto">
        <div class="bg-card px-3 sm:px-5 py-2.5 sm:py-3 min-w-0">
          <div class="font-mono text-[9px] sm:text-[10px] uppercase tracking-widest text-muted-foreground">Géoloc.</div>
          <div class="font-mono text-xl sm:text-2xl tabular mt-0.5">{{ markers.length.toString().padStart(2, '0') }}</div>
        </div>
        <div class="bg-card px-3 sm:px-5 py-2.5 sm:py-3 min-w-0">
          <div class="font-mono text-[9px] sm:text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
            <span class="size-1 rounded-full bg-signal pulse-dot" /> Online
          </div>
          <div class="font-mono text-xl sm:text-2xl tabular mt-0.5 text-signal">
            {{ onlineCount.toString().padStart(2, '0') }}
          </div>
        </div>
        <div class="bg-card px-3 sm:px-5 py-2.5 sm:py-3 min-w-0">
          <div class="font-mono text-[9px] sm:text-[10px] uppercase tracking-widest text-muted-foreground">Offline</div>
          <div
            class="font-mono text-xl sm:text-2xl tabular mt-0.5"
            :class="offlineCount > 0 ? 'text-offline' : ''"
          >
            {{ offlineCount.toString().padStart(2, '0') }}
          </div>
        </div>
      </div>
    </header>

    <!-- Body -->
    <div
      v-if="loading"
      class="flex-1 border border-border rounded-md bg-card/40 flex items-center justify-center font-mono text-sm text-muted-foreground"
    >
      <span><span class="blink">▍</span> chargement de la flotte…</span>
    </div>
    <div
      v-else-if="error"
      class="flex-1 border border-offline/40 rounded-md bg-offline-soft p-6 text-center font-mono text-offline"
    >
      ERR · {{ error }}
    </div>
    <div
      v-else-if="!markers.length"
      class="flex-1 border border-border rounded-md bg-card/40 flex flex-col items-center justify-center text-center p-10"
    >
      <div class="text-2xl text-muted-foreground/70 font-light mb-2">Aucun device géolocalisé</div>
      <p class="text-xs font-mono uppercase tracking-wider text-muted-foreground">
        Ajoute une adresse dans la fiche d'un équipement pour le voir apparaître ici.
      </p>
    </div>
    <DeviceMap
      v-else
      :markers="markers"
      height="100%"
      class="flex-1 fade-up"
      style="animation-delay: 80ms"
      @select="onSelect"
    />
  </section>
</template>

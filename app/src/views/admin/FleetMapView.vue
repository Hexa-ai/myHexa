<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useDevices } from '@/composables/useDevices'
import { isOnline, maxActiveAlarmSeverity } from '@/lib/utils'
import { useAutoRefresh } from '@/composables/useAutoRefresh'
import DeviceMap, { type MarkerInput } from '@/components/DeviceMap.vue'

const router = useRouter()
const route = useRoute()
const { devices, loading, error, load } = useDevices()

useAutoRefresh(load, { intervalMs: 120_000 })

// --- Play mode (kiosque) -----------------------------------------------------
const PLAY_INTERVAL_MS = 5_000
const mapRef = ref<InstanceType<typeof DeviceMap> | null>(null)
const isPlaying = ref(false)
const playIndex = ref(0)
let playTimer: ReturnType<typeof setInterval> | undefined

function nextStep() {
  if (!markers.value.length) return
  playIndex.value = (playIndex.value + 1) % markers.value.length
  const m = markers.value[playIndex.value]
  mapRef.value?.focusMarker(m.id)
}

function startPlay() {
  if (!markers.value.length) return
  isPlaying.value = true
  playIndex.value = -1 // so nextStep lands on 0
  nextStep()
  playTimer = setInterval(nextStep, PLAY_INTERVAL_MS)
  // Reflect in URL for kiosk persistence
  router.replace({ query: { ...route.query, play: '1' } })
}

function stopPlay() {
  isPlaying.value = false
  if (playTimer) {
    clearInterval(playTimer)
    playTimer = undefined
  }
  mapRef.value?.closeAllTooltips()
  mapRef.value?.fitAll()
  const q = { ...route.query }
  delete q.play
  router.replace({ query: q })
}

function togglePlay() {
  isPlaying.value ? stopPlay() : startPlay()
}

// Activate from URL on mount (e.g. /admin/map?play=1 on a kiosk)
onMounted(() => {
  const wanted = String(route.query.play ?? '').toLowerCase()
  if (wanted === '1' || wanted === 'true') {
    // wait until devices are loaded
    const tryStart = () => {
      if (markers.value.length) startPlay()
      else setTimeout(tryStart, 500)
    }
    tryStart()
  }
})

// If devices list is fully cleared during play, stop
watch(
  () => markers.value.length,
  (n) => {
    if (!n && isPlaying.value) stopPlay()
  },
)

onBeforeUnmount(() => {
  if (playTimer) clearInterval(playTimer)
})

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

      <div class="flex items-center gap-3 self-start md:self-auto w-full md:w-auto">
        <button
          type="button"
          :disabled="!markers.length"
          :class="[
            'inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider px-3 py-1.5 rounded-md border transition',
            isPlaying
              ? 'bg-signal text-primary-foreground border-signal hover:brightness-110'
              : 'border-border text-muted-foreground hover:border-signal/60 hover:text-signal',
            !markers.length && 'opacity-50 cursor-not-allowed',
          ]"
          @click="togglePlay"
        >
          <template v-if="isPlaying">
            <svg viewBox="0 0 24 24" class="size-3" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="0.5"/><rect x="14" y="5" width="4" height="14" rx="0.5"/></svg>
            Pause · {{ playIndex + 1 }}/{{ markers.length }}
          </template>
          <template v-else>
            <svg viewBox="0 0 24 24" class="size-3" fill="currentColor"><path d="M7 5v14l12-7z"/></svg>
            Mode kiosque
          </template>
        </button>

      <div class="grid grid-cols-3 gap-px bg-border border border-border rounded-sm overflow-hidden flex-1 md:flex-initial">
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
      ref="mapRef"
      :markers="markers"
      height="100%"
      class="flex-1 fade-up"
      style="animation-delay: 80ms"
      @select="onSelect"
    />
  </section>
</template>

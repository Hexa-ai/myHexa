<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { viewReport, updateLocation, type ViewReportData } from '@/lib/api'
import { useTheme } from '@/composables/useTheme'
import DeviceReport from '@/components/DeviceReport.vue'

const route = useRoute()
const router = useRouter()
const { theme, toggle: toggleTheme } = useTheme()

const loading = ref(true)
const error = ref<{ code: string; message: string } | null>(null)
const data = ref<ViewReportData | null>(null)
const reportRef = ref<InstanceType<typeof DeviceReport> | null>(null)

const token = computed(() => String(route.query.t ?? ''))
const deviceId = computed(() => String(route.query.d ?? ''))

async function onSaveLocation(address: string) {
  if (!data.value) return
  const res = await updateLocation({ token: token.value, deviceId: deviceId.value, address })
  if (!res.ok) {
    reportRef.value?.setLocationFeedback('error', res.error.message)
    return
  }
  // Optimistically update local state
  data.value = {
    ...data.value,
    device: {
      ...data.value.device,
      address: res.data.address,
      latitude: res.data.latitude,
      longitude: res.data.longitude,
    },
  }
  reportRef.value?.setLocationFeedback('success', 'Adresse mise à jour.')
}

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
</script>

<template>
  <main class="min-h-screen hex-grid">
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

    <div class="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 lg:py-10">
      <div v-if="loading" class="border border-border rounded-md bg-card/40 p-10 text-center font-mono text-sm text-muted-foreground">
        <span class="blink">▍</span> chargement du rapport…
      </div>

      <div v-else-if="error" class="border border-offline/40 rounded-md bg-offline-soft p-6 text-center">
        <div class="font-mono text-[10px] uppercase tracking-[0.3em] text-offline mb-3">
          {{ error.code }}
        </div>
        <p class="text-base">{{ error.message }}</p>
      </div>

      <DeviceReport
        v-else-if="data"
        ref="reportRef"
        :device="data.device"
        :status="data.status as any"
        :role="data.role"
        :expires-at="data.expiresAt"
        :can-edit-location="data.role === 'admin'"
        :periodic-href="(t) => router.resolve({ name: 'report-periodic', query: { t: token, d: deviceId, type: t } }).href"
        @save-location="onSaveLocation"
      />
    </div>
  </main>
</template>

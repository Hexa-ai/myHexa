<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { viewPeriodicReport, type ViewPeriodicReportData } from '@/lib/api'
import { useTheme } from '@/composables/useTheme'
import PeriodicReport, { type PeriodicPayload } from '@/components/PeriodicReport.vue'

const route = useRoute()
const router = useRouter()
const { theme, toggle: toggleTheme } = useTheme()

const loading = ref(true)
const error = ref<{ code: string; message: string } | null>(null)
const data = ref<ViewPeriodicReportData | null>(null)

const token = computed(() => String(route.query.t ?? ''))
const deviceId = computed(() => String(route.query.d ?? ''))
const type = computed<'daily' | 'weekly'>(() =>
  route.query.type === 'weekly' ? 'weekly' : 'daily',
)
const period = computed(() => (route.query.period ? String(route.query.period) : undefined))

async function reload() {
  loading.value = true
  error.value = null
  if (!token.value || !deviceId.value) {
    error.value = { code: 'MISSING_PARAMS', message: 'Lien incomplet' }
    loading.value = false
    return
  }
  const res = await viewPeriodicReport(token.value, deviceId.value, type.value, period.value)
  loading.value = false
  if (res.ok) {
    data.value = res.data
    return
  }
  if (res.error.code === 'TOKEN_EXPIRED' || res.error.code === 'TOKEN_NOT_FOUND') {
    router.replace({ name: 'recover', query: { reason: res.error.code, from: route.fullPath } })
    return
  }
  error.value = res.error
}

onMounted(reload)
watch([token, deviceId, type, period], reload)

function setType(t: 'daily' | 'weekly') {
  router.push({
    name: 'report-periodic',
    query: { t: token.value, d: deviceId.value, type: t },
  })
}
function setPeriod(p: string) {
  router.push({
    name: 'report-periodic',
    query: { t: token.value, d: deviceId.value, type: type.value, period: p },
  })
}

function backHref() {
  return router.resolve({
    name: 'report',
    query: { t: token.value, d: deviceId.value },
  }).href
}
</script>

<template>
  <main class="min-h-screen hex-grid">
    <header class="h-12 border-b border-border bg-background/60 backdrop-blur-sm flex items-center justify-between px-3 sm:px-5">
      <div class="flex items-center gap-2 sm:gap-2.5 text-xs font-mono text-muted-foreground min-w-0">
        <span class="text-signal">⬢</span>
        <span class="hidden sm:inline">Hexa.ai</span>
        <span class="text-muted-foreground/50 hidden sm:inline">/</span>
        <span>report</span>
        <span class="text-muted-foreground/50">/</span>
        <span class="text-foreground">{{ type === 'daily' ? 'quotidien' : 'hebdomadaire' }}</span>
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
      <a
        :href="backHref()"
        class="mb-6 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-signal transition"
      >
        ← Retour au device
      </a>

      <div v-if="loading" class="border border-border rounded-md bg-card/40 p-10 text-center font-mono text-sm text-muted-foreground">
        <span class="blink">▍</span> chargement du rapport…
      </div>
      <div v-else-if="error" class="border border-offline/40 rounded-md bg-offline-soft p-6 text-center">
        <div class="font-mono text-[10px] uppercase tracking-[0.3em] text-offline mb-3">{{ error.code }}</div>
        <p>{{ error.message }}</p>
      </div>
      <PeriodicReport
        v-else-if="data"
        :payload="data.payload as PeriodicPayload | null"
        :type="data.type"
        :period-start="data.periodStart"
        :period-end="data.periodEnd"
        :periods="data.periods"
        @change-type="setType"
        @change-period="setPeriod"
      />
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PeriodicReport from '@/components/PeriodicReport.vue'
import { usePeriodicReport, type PeriodicType } from '@/composables/usePeriodicReport'

const route = useRoute()
const router = useRouter()
const { loading, error, result, load } = usePeriodicReport()

const deviceId = computed(() => String(route.params.id))
const type = computed<PeriodicType>(() =>
  route.query.type === 'weekly' ? 'weekly' : 'daily',
)
const period = computed(() => (route.query.period ? String(route.query.period) : null))

async function reload() {
  await load(deviceId.value, type.value, period.value)
}

onMounted(reload)
watch([type, period, deviceId], reload)

function setType(t: PeriodicType) {
  router.push({
    name: 'admin-device-periodic',
    params: { id: deviceId.value },
    query: { type: t },
  })
}

function setPeriod(p: string) {
  router.push({
    name: 'admin-device-periodic',
    params: { id: deviceId.value },
    query: { type: type.value, period: p },
  })
}
</script>

<template>
  <section class="px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10 max-w-[1200px] mx-auto">
    <button
      class="mb-6 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-signal transition"
      @click="router.push({ name: 'admin-device-detail', params: { id: deviceId } })"
    >
      ← Retour au device
    </button>

    <div v-if="loading" class="border border-border rounded-md bg-card/40 p-10 text-center font-mono text-sm text-muted-foreground">
      <span class="blink">▍</span> chargement du rapport…
    </div>
    <div v-else-if="error" class="border border-offline/40 rounded-md bg-offline-soft p-6 text-center font-mono text-offline">
      ERR · {{ error }}
    </div>
    <PeriodicReport
      v-else
      :payload="result.payload"
      :type="type"
      :period-start="result.periodStart"
      :period-end="result.periodEnd"
      :periods="result.periods"
      @change-type="setType"
      @change-period="setPeriod"
    />
  </section>
</template>

<script setup lang="ts">
// Page « Tableaux de bord » : arborescence Projet > tableaux du projet + box du projet > tableaux de la box,
// puis box hors projet. Une box ou un projet sans tableau enregistré a toujours un « tableau proposé ».
import { computed, onMounted, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useDevices } from '@/composables/useDevices'
import { useProjects } from '@/composables/useProjects'
import { loadDashboards, type Dashboard } from '@/composables/useDashboards'
import DashboardTree from '@/components/dashboard/DashboardTree.vue'

const auth = useAuthStore()
const { devices, load: loadDevices } = useDevices()
const { projects, load: loadProjects } = useProjects()
const dashboards = ref<Dashboard[]>([])
const loading = ref(true)
const error = ref('')

const companyId = computed(() =>
  auth.isHexaStaff && !auth.actAsCompanyId ? null : auth.effectiveCompanyId,
)

async function loadAll() {
  loading.value = true
  error.value = ''
  try {
    const [, , d] = await Promise.all([
      loadDevices(),
      loadProjects(companyId.value),
      loadDashboards(companyId.value && auth.isHexaStaff ? { company: companyId.value } : {}),
    ])
    dashboards.value = d
  } catch (e) {
    error.value = (e as Error).message
  }
  loading.value = false
}
onMounted(loadAll)
watch(companyId, loadAll)
</script>

<template>
  <section class="px-4 sm:px-6 lg:px-8 py-6 sm:py-8 w-full max-w-3xl">
    <div class="mb-5">
      <div class="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        Supervision
      </div>
      <h1 class="text-2xl font-semibold tracking-tight">Tableaux de bord</h1>
      <p class="text-sm text-muted-foreground mt-1">
        Projets, puis leurs box : dépliez pour voir les tableaux. Un tableau « proposé » est généré
        tant qu’aucun n’est enregistré.
      </p>
    </div>
    <p v-if="error" class="text-sm text-offline mb-4">{{ error }}</p>
    <p v-if="loading && !devices.length" class="text-sm text-muted-foreground">Chargement…</p>
    <DashboardTree v-else :projects="projects" :devices="devices" :dashboards="dashboards" />
  </section>
</template>

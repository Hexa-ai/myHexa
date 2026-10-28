<script setup lang="ts">
// Page « Tableaux de bord » : arborescence Projet > tableaux du projet + box du projet > tableaux de la box,
// puis box hors projet. Une box ou un projet sans tableau enregistré a toujours un « tableau proposé ».
import { computed, onMounted, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useDevices } from '@/composables/useDevices'
import { useProjects } from '@/composables/useProjects'
import {
  loadDashboards,
  sharedWithMe,
  type Dashboard,
  type SharedDashboard,
} from '@/composables/useDashboards'
import DashboardTree from '@/components/dashboard/DashboardTree.vue'

const auth = useAuthStore()
const { devices, load: loadDevices } = useDevices()
const { projects, load: loadProjects } = useProjects()
const dashboards = ref<Dashboard[]>([])
const shared = ref<SharedDashboard[]>([])
const loading = ref(true)
const error = ref('')

const companyId = computed(() =>
  auth.isHexaStaff && !auth.actAsCompanyId ? null : auth.effectiveCompanyId,
)

async function loadAll() {
  loading.value = true
  error.value = ''
  try {
    const [, , d, sh] = await Promise.all([
      loadDevices(),
      loadProjects(companyId.value),
      loadDashboards(companyId.value && auth.isHexaStaff ? { company: companyId.value } : {}),
      sharedWithMe().catch(() => [] as SharedDashboard[]),
    ])
    // les tableaux partagés avec moi sont listés à part (lecture seule, sans accès aux box)
    const sharedIds = new Set(sh.map((x) => x.id))
    dashboards.value = d.filter((x) => !sharedIds.has(x.id!) || x.company_id === companyId.value)
    shared.value = sh
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
    <p v-if="loading && !devices.length && !shared.length" class="text-sm text-muted-foreground">
      Chargement…
    </p>
    <DashboardTree
      v-else-if="devices.length || !shared.length"
      :projects="projects"
      :devices="devices"
      :dashboards="dashboards"
    />
    <div v-if="shared.length" class="mt-8" data-testid="shared-list">
      <div class="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2">
        Partagés avec moi · lecture seule
      </div>
      <ul class="border border-border rounded-md divide-y divide-border bg-card/40">
        <li v-for="x in shared" :key="x.id">
          <RouterLink
            :to="{ name: 'admin-dashboard-shared', params: { d: x.id } }"
            class="flex items-center gap-3 px-3 py-2.5 hover:bg-card"
          >
            <span class="flex-1 min-w-0 truncate">{{ x.name }}</span>
            <span class="text-xs text-muted-foreground truncate">{{ x.company }}</span>
          </RouterLink>
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup lang="ts">
// Panneau latéral « arborescence » ouvert depuis un tableau de bord : on monte/descend projet > box > tableaux
// sans repasser par la liste.
import { computed, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useDevices } from '@/composables/useDevices'
import { useProjects } from '@/composables/useProjects'
import { loadDashboards, type Dashboard } from '@/composables/useDashboards'
import DashboardTree from '@/components/dashboard/DashboardTree.vue'

const props = defineProps<{
  open: boolean
  current: { scope: 'device' | 'project'; id: string; d?: string | null } | null
  /** change quand un tableau est enregistré/supprimé : recharge */
  version?: number
}>()
const emit = defineEmits<{ close: [] }>()
const auth = useAuthStore()
const { devices, load: loadDevices } = useDevices()
const { projects, load: loadProjects } = useProjects()
const dashboards = ref<Dashboard[]>([])
const loaded = ref(false)
const companyId = computed(() =>
  auth.isHexaStaff && !auth.actAsCompanyId ? null : auth.effectiveCompanyId,
)

async function load() {
  const [, , d] = await Promise.all([
    loadDevices(),
    loadProjects(companyId.value),
    loadDashboards(companyId.value && auth.isHexaStaff ? { company: companyId.value } : {}),
  ])
  dashboards.value = d
  loaded.value = true
}
watch(
  () => [props.open, props.version, companyId.value],
  () => {
    if (props.open) void load()
  },
  { immediate: true },
)
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-50 flex" data-testid="dash-tree-drawer">
      <div class="absolute inset-0 bg-black/30" @click="emit('close')" />
      <aside
        class="relative w-80 max-w-[85vw] h-full bg-background border-r border-border shadow-xl flex flex-col"
      >
        <div class="flex items-center gap-2 px-4 py-3 border-b border-border">
          <span class="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground"
            >Tableaux de bord</span
          >
          <RouterLink
            :to="{ name: 'admin-dashboards' }"
            class="ml-auto font-mono text-[10px] text-muted-foreground hover:text-signal"
            @click="emit('close')"
          >
            vue d’ensemble
          </RouterLink>
          <button
            class="text-muted-foreground hover:text-foreground px-1"
            aria-label="Fermer"
            @click="emit('close')"
          >
            ✕
          </button>
        </div>
        <div class="flex-1 overflow-auto p-3">
          <p v-if="!loaded" class="text-xs text-muted-foreground">Chargement…</p>
          <DashboardTree
            v-else
            compact
            :projects="projects"
            :devices="devices"
            :dashboards="dashboards"
            :current="current"
            @navigate="emit('close')"
          />
        </div>
      </aside>
    </div>
  </Teleport>
</template>

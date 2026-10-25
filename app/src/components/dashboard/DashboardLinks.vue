<script setup lang="ts">
// Liste des tableaux de bord d'une box ou d'un projet (fiche) + création
import { onMounted, ref, watch } from 'vue'
import { loadDashboards, type Dashboard } from '@/composables/useDashboards'

const props = defineProps<{ scope: 'device' | 'project'; id: string; canManage: boolean }>()
const boards = ref<Dashboard[]>([])
const loaded = ref(false)

async function load() {
  boards.value = await loadDashboards(
    props.scope === 'device' ? { device: props.id } : { project: props.id },
  ).catch(() => [])
  loaded.value = true
}
onMounted(load)
watch(() => props.id, load)

const to = (d?: string, n?: string) => ({
  name: 'admin-dashboard',
  params: { scope: props.scope, id: props.id },
  query: d ? { d } : n ? { new: n } : {},
})
</script>

<template>
  <div
    v-if="loaded && (boards.length || canManage)"
    class="flex flex-wrap items-center gap-2 mb-6"
    data-testid="device-dashboards"
  >
    <span class="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground mr-1">
      Tableaux de bord
    </span>
    <RouterLink
      v-for="b in boards"
      :key="b.id"
      :to="to(b.id)"
      class="inline-flex items-center gap-1.5 text-sm border border-border rounded-md px-3 py-1.5 hover:border-signal/60 hover:text-signal transition"
      data-testid="device-dashboard-link"
    >
      <svg
        viewBox="0 0 24 24"
        class="size-3.5"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
      >
        <path d="M4 15a8 8 0 1 1 16 0" />
        <path d="M12 15l4-4" />
      </svg>
      {{ b.name }}
      <span
        v-if="b.is_default"
        class="font-mono text-[9px] uppercase tracking-wider text-muted-foreground"
        :title="scope === 'device' ? 'ouvert à la place de la fiche' : 'tableau par défaut'"
        >défaut</span
      >
    </RouterLink>
    <RouterLink
      v-if="canManage"
      :to="to(undefined, 'empty')"
      class="text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-signal px-2 py-1.5"
      data-testid="device-dashboard-new"
    >
      + Nouveau tableau
    </RouterLink>
  </div>
</template>

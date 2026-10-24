<script setup lang="ts">
// Arborescence des tableaux de bord : Projet > (tableaux du projet) + Box du projet > tableaux de la box,
// puis les box hors projet. Repliable, état mémorisé ; la recherche déplie ce qui correspond.
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { Dashboard } from '@/composables/useDashboards'
import type { ProjectOverview } from '@/composables/useProjects'
import type { DeviceWithStatus } from '@/composables/useDevices'
import { isOnline } from '@/lib/utils'

const props = defineProps<{
  projects: ProjectOverview[]
  devices: DeviceWithStatus[]
  dashboards: Dashboard[]
  /** position courante (surlignée et dépliée) */
  current?: { scope: 'device' | 'project'; id: string; d?: string | null } | null
  compact?: boolean
}>()
const emit = defineEmits<{ navigate: [] }>()
const router = useRouter()
const q = ref('')

const KEY = 'hexa.dashTree.open'
const open = ref<Set<string>>(new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]')))
watch(open, (v) => localStorage.setItem(KEY, JSON.stringify([...v])), { deep: true })
function toggle(k: string) {
  const s = new Set(open.value)
  if (s.has(k)) s.delete(k)
  else s.add(k)
  open.value = s
}
// la position courante est toujours dépliée
watch(
  () => props.current,
  (c) => {
    if (!c) return
    const s = new Set(open.value)
    if (c.scope === 'project') s.add('p:' + c.id)
    else {
      s.add('d:' + c.id)
      const p = props.projects.find((x) => x.device_ids.includes(c.id))
      if (p) s.add('p:' + p.id)
    }
    open.value = s
  },
  { immediate: true },
)

const has = (s: string | null | undefined) =>
  (s ?? '').toLowerCase().includes(q.value.toLowerCase())
const boardsOf = (scope: 'device' | 'project', id: string) =>
  props.dashboards.filter((d) => (scope === 'device' ? d.device_id === id : d.project_id === id))
const devName = (d: DeviceWithStatus) => d.name ?? d.id.slice(0, 8)

interface DevNode {
  d: DeviceWithStatus
  boards: Dashboard[]
  hit: boolean
}
const devNode = (d: DeviceWithStatus): DevNode => {
  const boards = boardsOf('device', d.id)
  return { d, boards, hit: !q.value || has(d.name) || boards.some((b) => has(b.name)) }
}
const tree = computed(() => {
  const inProject = new Set(props.projects.flatMap((p) => p.device_ids))
  const projects = props.projects
    .map((p) => {
      const boards = boardsOf('project', p.id)
      const devs = props.devices.filter((d) => p.device_ids.includes(d.id)).map(devNode)
      const self = !q.value || has(p.name) || boards.some((b) => has(b.name))
      return {
        p,
        boards,
        devs: self && q.value ? devs : devs.filter((x) => x.hit),
        hit: self || devs.some((x) => x.hit),
      }
    })
    .filter((x) => x.hit)
  const loose = props.devices
    .filter((d) => !inProject.has(d.id))
    .map(devNode)
    .filter((x) => x.hit)
  return { projects, loose }
})
const isOpen = (k: string) => !!q.value || open.value.has(k)
function expandAll(v: boolean) {
  open.value = v
    ? new Set([...props.projects.map((p) => 'p:' + p.id), ...props.devices.map((d) => 'd:' + d.id)])
    : new Set()
}

function go(scope: 'device' | 'project', id: string, d?: string) {
  router.push({ name: 'admin-dashboard', params: { scope, id }, query: d ? { d } : {} })
  emit('navigate')
}
const here = (scope: string, id: string, d?: string) =>
  props.current?.scope === scope &&
  props.current.id === id &&
  (d === undefined ? !props.current.d : props.current.d === d)
const row =
  'flex items-center gap-1.5 w-full text-left rounded-sm px-1.5 py-1 hover:bg-secondary/60 transition'
</script>

<template>
  <div
    :class="['text-sm', compact ? '' : 'border border-border rounded-md bg-card/60 p-3']"
    data-testid="dash-tree"
  >
    <div class="flex items-center gap-2 mb-2">
      <input
        v-model="q"
        type="search"
        placeholder="Rechercher…"
        class="flex-1 min-w-0 bg-card border border-border rounded-sm px-2 py-1.5 text-sm focus:outline-none focus:border-signal/60"
        data-testid="tree-search"
      />
      <button
        class="font-mono text-[10px] text-muted-foreground hover:text-foreground"
        title="Tout déplier"
        @click="expandAll(true)"
      >
        + tout
      </button>
      <button
        class="font-mono text-[10px] text-muted-foreground hover:text-foreground"
        title="Tout replier"
        @click="expandAll(false)"
      >
        − tout
      </button>
    </div>

    <!-- tableau(x) d'un nœud -->
    <template v-for="n in tree.projects" :key="n.p.id">
      <div data-testid="tree-project">
        <button :class="row" @click="toggle('p:' + n.p.id)">
          <svg
            viewBox="0 0 24 24"
            :class="['size-3 shrink-0 transition-transform', isOpen('p:' + n.p.id) && 'rotate-90']"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
          <svg
            viewBox="0 0 24 24"
            class="size-4 shrink-0 text-muted-foreground"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
          >
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          </svg>
          <span class="font-medium truncate">{{ n.p.name }}</span>
          <span class="ml-auto font-mono text-[10px] text-muted-foreground shrink-0"
            >{{ n.p.online }}/{{ n.p.devices }}</span
          >
        </button>
        <div v-if="isOpen('p:' + n.p.id)" class="ml-4 pl-2 border-l border-border">
          <button
            v-for="b in n.boards.length ? n.boards : [null]"
            :key="b?.id ?? 'prop'"
            :class="[
              row,
              here('project', n.p.id, b?.id) ? 'bg-signal/10 text-signal' : 'text-foreground',
            ]"
            data-testid="tree-board"
            @click="go('project', n.p.id, b?.id)"
          >
            <svg
              viewBox="0 0 24 24"
              class="size-3.5 shrink-0"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
            >
              <path d="M4 15a8 8 0 1 1 16 0" />
              <path d="M12 15l4-4" />
            </svg>
            <span :class="['truncate', !b && 'italic text-muted-foreground']">{{
              b?.name ?? 'Tableau proposé'
            }}</span>
          </button>
          <template v-for="x in n.devs" :key="x.d.id">
            <button :class="row" data-testid="tree-device" @click="toggle('d:' + x.d.id)">
              <svg
                viewBox="0 0 24 24"
                :class="[
                  'size-3 shrink-0 transition-transform',
                  isOpen('d:' + x.d.id) && 'rotate-90',
                ]"
                fill="none"
                stroke="currentColor"
                stroke-width="2.2"
              >
                <path d="M9 6l6 6-6 6" />
              </svg>
              <span
                :class="[
                  'size-1.5 rounded-full shrink-0',
                  isOnline(x.d.last_connection_at) ? 'bg-signal' : 'bg-offline',
                ]"
              />
              <span class="truncate">{{ devName(x.d) }}</span>
            </button>
            <div v-if="isOpen('d:' + x.d.id)" class="ml-4 pl-2 border-l border-border">
              <button
                v-for="b in x.boards.length ? x.boards : [null]"
                :key="b?.id ?? 'prop'"
                :class="[
                  row,
                  here('device', x.d.id, b?.id) ? 'bg-signal/10 text-signal' : 'text-foreground',
                ]"
                data-testid="tree-board"
                @click="go('device', x.d.id, b?.id)"
              >
                <svg
                  viewBox="0 0 24 24"
                  class="size-3.5 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                >
                  <path d="M4 15a8 8 0 1 1 16 0" />
                  <path d="M12 15l4-4" />
                </svg>
                <span :class="['truncate', !b && 'italic text-muted-foreground']">{{
                  b?.name ?? 'Tableau proposé'
                }}</span>
              </button>
            </div>
          </template>
        </div>
      </div>
    </template>

    <template v-if="tree.loose.length">
      <div
        class="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground mt-3 mb-1 px-1.5"
      >
        Box hors projet
      </div>
      <template v-for="x in tree.loose" :key="x.d.id">
        <button :class="row" data-testid="tree-device" @click="toggle('d:' + x.d.id)">
          <svg
            viewBox="0 0 24 24"
            :class="['size-3 shrink-0 transition-transform', isOpen('d:' + x.d.id) && 'rotate-90']"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
          <span
            :class="[
              'size-1.5 rounded-full shrink-0',
              isOnline(x.d.last_connection_at) ? 'bg-signal' : 'bg-offline',
            ]"
          />
          <span class="truncate">{{ devName(x.d) }}</span>
          <span
            v-if="x.boards.length"
            class="ml-auto font-mono text-[10px] text-muted-foreground"
            >{{ x.boards.length }}</span
          >
        </button>
        <div v-if="isOpen('d:' + x.d.id)" class="ml-4 pl-2 border-l border-border">
          <button
            v-for="b in x.boards.length ? x.boards : [null]"
            :key="b?.id ?? 'prop'"
            :class="[
              row,
              here('device', x.d.id, b?.id) ? 'bg-signal/10 text-signal' : 'text-foreground',
            ]"
            data-testid="tree-board"
            @click="go('device', x.d.id, b?.id)"
          >
            <svg
              viewBox="0 0 24 24"
              class="size-3.5 shrink-0"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
            >
              <path d="M4 15a8 8 0 1 1 16 0" />
              <path d="M12 15l4-4" />
            </svg>
            <span :class="['truncate', !b && 'italic text-muted-foreground']">{{
              b?.name ?? 'Tableau proposé'
            }}</span>
          </button>
        </div>
      </template>
    </template>
    <p
      v-if="!tree.projects.length && !tree.loose.length"
      class="text-xs text-muted-foreground px-1.5 py-2"
    >
      Aucun résultat.
    </p>
  </div>
</template>

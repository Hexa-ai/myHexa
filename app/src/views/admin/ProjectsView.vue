<script setup lang="ts">
// PROTOTYPE — projets : regrouper les box d'une entreprise par site / machine.
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useDevices } from '@/composables/useDevices'
import { useProjects, projectState } from '@/composables/useProjects'
import { useAutoRefresh } from '@/composables/useAutoRefresh'
import { formatRelative, isOnline, maxActiveAlarmSeverity } from '@/lib/utils'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { devices, load: loadDevices } = useDevices()
const { projects, loading, error, load, create, update, remove, setDevicesProject } = useProjects()

// staff sans « agit comme » : tous les projets (lecture) ; création réservée à une compagnie choisie
const staffAll = computed(() => auth.isHexaStaff && !auth.actAsCompanyId)
const companyId = computed(() => (staffAll.value ? null : auth.effectiveCompanyId))
async function loadAll() {
  await Promise.all([loadDevices(), load(companyId.value)])
}
useAutoRefresh(loadAll, { intervalMs: 120_000 })
watch(companyId, loadAll)

const canManage = computed(
  () => auth.isHexaStaff || (auth.recipient?.role === 'admin' && !!companyId.value),
)
const byId = computed(() => new Map(devices.value.map((d) => [d.id, d])))
const assigned = computed(() => new Set(projects.value.flatMap((p) => p.device_ids)))
const unassigned = computed(() =>
  devices.value.filter(
    (d) => !assigned.value.has(d.id) && (!companyId.value || d.company_id === companyId.value),
  ),
)

const cards = computed(() =>
  projects.value.map((p) => {
    const ds = p.device_ids.map((id) => byId.value.get(id)).filter((d) => !!d)
    const online = ds.filter((d) => isOnline(d.last_connection_at)).length
    const sev = ds.map((d) => maxActiveAlarmSeverity(d.status_payload))
    const alarm = sev.includes('error') ? 'error' : sev.includes('warning') ? 'warning' : null
    return { ...p, ds, onlineNow: online, state: projectState(online, ds.length, alarm) }
  }),
)

const STATE: Record<string, { label: string; cls: string }> = {
  ok: { label: 'Tout connecté', cls: 'text-signal border-signal/40' },
  partial: { label: 'Box déconnectée', cls: 'text-amber-500 border-amber-500/40' },
  offline: { label: 'Déconnecté', cls: 'text-offline border-offline/40' },
  error: { label: 'Alarme', cls: 'text-offline border-offline/40' },
  warning: { label: 'Vigilance', cls: 'text-amber-500 border-amber-500/40' },
  empty: { label: 'Vide', cls: 'text-muted-foreground border-border' },
}

const openId = ref<string | null>((route.query.p as string) || null)
watch(openId, (id) => router.replace({ query: { ...route.query, p: id || undefined } }))

// --- gestion (admin) ---
const newName = ref('')
const newDesc = ref('')
const busy = ref(false)
const msg = ref<string | null>(null)
async function run(fn: () => Promise<unknown>) {
  busy.value = true
  msg.value = null
  try {
    await fn()
    await loadAll()
  } catch (e) {
    msg.value = (e as Error).message
  } finally {
    busy.value = false
  }
}
function addProject() {
  if (!newName.value.trim() || !companyId.value) return
  run(async () => {
    const id = await create(companyId.value!, newName.value, newDesc.value)
    newName.value = ''
    newDesc.value = ''
    openId.value = id
  })
}
const editName = ref('')
const editDesc = ref('')
watch(openId, () => {
  const p = projects.value.find((x) => x.id === openId.value)
  editName.value = p?.name ?? ''
  editDesc.value = p?.description ?? ''
})
watch(projects, () => {
  const p = projects.value.find((x) => x.id === openId.value)
  if (p && !editName.value) {
    editName.value = p.name
    editDesc.value = p.description ?? ''
  }
})
const toAdd = ref<string[]>([])
</script>

<template>
  <section class="px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10 w-full">
    <header class="mb-6 fade-up">
      <div class="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-2">
        Projets · prototype
      </div>
      <h1 class="text-2xl sm:text-3xl font-semibold tracking-tight">Projets</h1>
      <p class="mt-1 text-sm text-muted-foreground max-w-2xl">
        Un projet regroupe les box d'un même site ou d'une même machine. Il a un seul repère sur la
        carte, avec la synthèse de ses box, et servira de périmètre aux tableaux de bord et aux
        rapports.
      </p>
    </header>

    <p v-if="staffAll" class="mb-4 font-mono text-[11px] text-muted-foreground">
      Staff : tous les projets. Choisir une compagnie (« agit comme ») pour en créer.
    </p>
    <div v-if="loading && !projects.length" class="font-mono text-sm text-muted-foreground">
      <span class="blink">▍</span> chargement…
    </div>
    <div
      v-else-if="error"
      class="border border-offline/40 rounded-md bg-offline-soft p-4 font-mono text-sm text-offline"
    >
      ERR · {{ error }}
    </div>

    <template v-else>
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="project-cards">
        <article
          v-for="p in cards"
          :key="p.id"
          :class="[
            'neu-card border rounded-md bg-card/40 p-4 cursor-pointer transition hover:border-signal/50',
            openId === p.id ? 'border-signal/70' : 'border-border',
          ]"
          data-testid="project-card"
          @click="openId = openId === p.id ? null : p.id"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <h2 class="font-semibold tracking-tight truncate">{{ p.name }}</h2>
              <p v-if="p.description" class="text-xs text-muted-foreground truncate">
                {{ p.description }}
              </p>
            </div>
            <span
              :class="[
                'shrink-0 font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border',
                STATE[p.state].cls,
              ]"
            >
              {{ STATE[p.state].label }}
            </span>
          </div>
          <div class="mt-3 flex items-baseline gap-2 font-mono">
            <span class="text-2xl tabular">{{ p.onlineNow }}</span>
            <span class="text-sm text-muted-foreground">/ {{ p.ds.length }} box connectées</span>
          </div>
          <div class="mt-2 flex flex-wrap gap-1.5">
            <span
              v-for="d in p.ds"
              :key="d.id"
              class="inline-flex items-center gap-1 font-mono text-[10px] px-1.5 py-0.5 rounded bg-secondary/60"
            >
              <span
                :class="[
                  'size-1.5 rounded-full',
                  isOnline(d.last_connection_at) ? 'bg-signal' : 'bg-offline/70',
                ]"
              />
              {{ d.name }}
            </span>
          </div>
        </article>
        <div
          v-if="!cards.length"
          class="border border-dashed border-border rounded-md p-6 text-sm text-muted-foreground"
        >
          Aucun projet pour l'instant.
        </div>
      </div>

      <!-- détail du projet ouvert -->
      <div
        v-for="p in cards.filter((c) => c.id === openId)"
        :key="'d' + p.id"
        class="mt-6 border border-border rounded-md bg-card/40 p-4 sm:p-5"
        data-testid="project-detail"
      >
        <div class="flex items-center justify-between gap-3 mb-3">
          <h3 class="font-semibold">{{ p.name }} · box du projet</h3>
          <RouterLink
            :to="{ name: 'admin-dashboard', params: { scope: 'project', id: p.id } }"
            class="font-mono text-[10px] uppercase tracking-[0.18em] border border-signal/50 text-signal px-3 py-1.5 rounded-md hover:bg-signal/10"
            data-testid="project-dashboard-link"
          >
            Tableau de bord
          </RouterLink>
        </div>
        <table class="w-full text-sm">
          <tbody>
            <tr v-for="d in p.ds" :key="d.id" class="border-b border-border/50 last:border-0">
              <td class="py-2 pr-3 w-24">
                <span
                  :class="[
                    'font-mono text-[10px] uppercase',
                    isOnline(d.last_connection_at) ? 'text-signal' : 'text-offline/80',
                  ]"
                >
                  {{ isOnline(d.last_connection_at) ? 'online' : 'offline' }}
                </span>
              </td>
              <td class="py-2 pr-3">
                <RouterLink
                  :to="{ name: 'admin-device-detail', params: { id: d.id } }"
                  class="hover:text-signal"
                  >{{ d.name }}</RouterLink
                >
              </td>
              <td
                class="py-2 pr-3 font-mono text-[11px] text-muted-foreground hidden sm:table-cell"
              >
                {{ formatRelative(d.last_connection_at) }}
              </td>
              <td v-if="canManage && p.can_manage" class="py-2 text-right">
                <button
                  class="font-mono text-[10px] uppercase text-muted-foreground hover:text-offline"
                  :disabled="busy"
                  @click="run(() => setDevicesProject([d.id], null))"
                >
                  Retirer
                </button>
              </td>
            </tr>
          </tbody>
        </table>

        <div v-if="canManage && p.can_manage" class="mt-5 grid gap-4 lg:grid-cols-2">
          <div>
            <div class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
              Ajouter des box (sans projet)
            </div>
            <div v-if="!unassigned.length" class="text-xs text-muted-foreground">
              Toutes les box sont déjà dans un projet.
            </div>
            <div v-else class="max-h-48 overflow-auto border border-border rounded p-2 space-y-1">
              <label
                v-for="d in unassigned"
                :key="d.id"
                class="flex items-center gap-2 text-sm cursor-pointer"
              >
                <input v-model="toAdd" type="checkbox" :value="d.id" /> {{ d.name }}
              </label>
            </div>
            <button
              class="mt-2 font-mono text-[11px] uppercase tracking-wider px-3 py-1.5 rounded border border-signal/50 text-signal disabled:opacity-40"
              :disabled="busy || !toAdd.length"
              data-testid="project-add-devices"
              @click="
                run(async () => {
                  await setDevicesProject(toAdd, p.id)
                  toAdd = []
                })
              "
            >
              Ajouter {{ toAdd.length || '' }}
            </button>
          </div>
          <div>
            <div class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
              Projet
            </div>
            <input
              v-model="editName"
              class="w-full mb-2 bg-card border border-border rounded-sm px-2 py-1.5 text-sm"
              placeholder="Nom"
            />
            <input
              v-model="editDesc"
              class="w-full mb-2 bg-card border border-border rounded-sm px-2 py-1.5 text-sm"
              placeholder="Description"
            />
            <div class="flex gap-2">
              <button
                class="font-mono text-[11px] uppercase tracking-wider px-3 py-1.5 rounded border border-border hover:border-signal/60"
                :disabled="busy"
                @click="
                  run(() => update(p.id, { name: editName.trim(), description: editDesc || null }))
                "
              >
                Enregistrer
              </button>
              <button
                class="font-mono text-[11px] uppercase tracking-wider px-3 py-1.5 rounded border border-offline/40 text-offline"
                :disabled="busy"
                @click="
                  run(async () => {
                    await remove(p.id)
                    openId = null
                  })
                "
              >
                Supprimer le projet
              </button>
            </div>
            <p class="mt-1 text-[11px] text-muted-foreground">
              Supprimer le projet ne supprime pas les box : elles redeviennent « sans projet ».
            </p>
          </div>
        </div>
      </div>

      <!-- création -->
      <div
        v-if="canManage && companyId"
        class="mt-6 border border-border rounded-md bg-card/40 p-4 max-w-xl"
      >
        <div class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
          Nouveau projet
        </div>
        <div class="flex flex-col sm:flex-row gap-2">
          <input
            v-model="newName"
            data-testid="project-new-name"
            class="flex-1 bg-card border border-border rounded-sm px-2 py-1.5 text-sm"
            placeholder="Nom (site, machine…)"
            @keyup.enter="addProject"
          />
          <input
            v-model="newDesc"
            class="flex-1 bg-card border border-border rounded-sm px-2 py-1.5 text-sm"
            placeholder="Description (facultatif)"
          />
          <button
            class="font-mono text-[11px] uppercase tracking-wider px-3 py-1.5 rounded border border-signal/50 text-signal disabled:opacity-40"
            :disabled="busy || !newName.trim()"
            data-testid="project-create"
            @click="addProject"
          >
            Créer
          </button>
        </div>
      </div>
      <p v-if="msg" class="mt-3 font-mono text-xs text-offline">{{ msg }}</p>
    </template>
  </section>
</template>

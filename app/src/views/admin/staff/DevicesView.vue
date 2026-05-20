<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useStaffCompanies } from '@/composables/useStaffCompanies'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

interface DeviceRow {
  id: string
  name: string
  mac_eth0: string | null
  company_id: string
  created_at: string
  last_connection_at: string | null
}

const router = useRouter()
const { companies, fetch: fetchCompanies } = useStaffCompanies()

const devices = ref<DeviceRow[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const filterCompany = ref<'all' | string>('all')
const filterStatus = ref<'all' | 'online' | 'offline'>('all')

const ONLINE_THRESHOLD_MS = 60 * 60 * 1000 // 1h

async function load() {
  loading.value = true
  error.value = null
  const { data, error: err } = await supabase
    .from('devices')
    .select('id, name, mac_eth0, company_id, created_at, last_connection_at')
    .order('name')
  loading.value = false
  if (err) { error.value = err.message; return }
  devices.value = (data ?? []) as DeviceRow[]
}

const companyName = computed(() => {
  const m = new Map<string, string>()
  for (const c of companies.value) m.set(c.id, c.name)
  return m
})

function isOnline(d: DeviceRow): boolean {
  if (!d.last_connection_at) return false
  return Date.now() - new Date(d.last_connection_at).getTime() < ONLINE_THRESHOLD_MS
}

const filtered = computed(() =>
  devices.value.filter((d) => {
    if (filterCompany.value !== 'all' && d.company_id !== filterCompany.value) return false
    if (filterStatus.value === 'online' && !isOnline(d)) return false
    if (filterStatus.value === 'offline' && isOnline(d)) return false
    return true
  }),
)

function goCompany(id: string) {
  router.push({ name: 'staff-company-detail', params: { id } })
}

function provision() {
  router.push({ name: 'staff-device-new' })
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}

onMounted(() => { fetchCompanies(); load() })
</script>

<template>
  <div class="p-4 sm:p-6 space-y-4">
    <header class="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h1 class="text-xl font-semibold tracking-tight">Devices (global)</h1>
        <p class="text-sm text-muted-foreground">Tous les devices, toutes compagnies.</p>
      </div>
      <button
        v-if="auth.isHexaStaffAdmin"
        type="button"
        class="font-mono text-[10px] uppercase tracking-wider border border-signal/50 text-signal px-3 py-1.5 rounded-md hover:bg-signal-soft transition"
        @click="provision"
      >
        + Provisionner
      </button>
    </header>

    <div class="flex flex-wrap gap-2">
      <select v-model="filterCompany" class="bg-card border border-border rounded-md px-3 py-1.5 text-sm font-mono">
        <option value="all">Toutes les compagnies</option>
        <option v-for="c in companies" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
      <select v-model="filterStatus" class="bg-card border border-border rounded-md px-3 py-1.5 text-sm font-mono">
        <option value="all">Tous statuts</option>
        <option value="online">Online</option>
        <option value="offline">Offline</option>
      </select>
    </div>

    <p v-if="loading" class="text-sm text-muted-foreground">Chargement…</p>
    <p v-if="error" class="text-sm text-offline">{{ error }}</p>

    <div class="border border-border rounded-md bg-card/40 overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-card/60 border-b border-border">
          <tr>
            <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-3">Nom</th>
            <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-3">MAC eth0</th>
            <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-3">Compagnie</th>
            <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-3 w-[160px]">Dernière connexion</th>
            <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-3 w-[100px]">Statut</th>
            <th class="text-right font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-3 w-[80px]">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in filtered" :key="d.id" class="border-b border-border/50 last:border-0 hover:bg-secondary/40 transition">
            <td class="px-4 py-3 font-medium">{{ d.name }}</td>
            <td class="px-4 py-3 font-mono text-xs text-muted-foreground">{{ d.mac_eth0 ?? '—' }}</td>
            <td class="px-4 py-3">
              <button class="hover:text-signal transition" @click="goCompany(d.company_id)">
                {{ companyName.get(d.company_id) ?? d.company_id }}
              </button>
            </td>
            <td class="px-4 py-3 font-mono text-xs text-muted-foreground tabular">{{ fmtDate(d.last_connection_at) }}</td>
            <td class="px-4 py-3">
              <span
                :class="[
                  'inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded',
                  isOnline(d) ? 'bg-signal-soft text-signal' : 'bg-offline-soft text-offline',
                ]"
              >
                <span :class="['size-1.5 rounded-full', isOnline(d) ? 'bg-signal' : 'bg-offline']" />
                {{ isOnline(d) ? 'Online' : 'Offline' }}
              </span>
            </td>
            <td class="px-4 py-3 text-right">
              <router-link
                v-if="auth.isHexaStaffAdmin"
                :to="{ name: 'staff-device-edit', params: { id: d.id } }"
                class="font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-signal transition"
              >
                ✎ éditer
              </router-link>
            </td>
          </tr>
          <tr v-if="!filtered.length && !loading">
            <td colspan="6" class="px-4 py-8 text-center text-muted-foreground text-sm">Aucun device</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

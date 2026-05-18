<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { SEVERITY_ICON } from '@/lib/utils'

interface InterventionRow {
  id: string
  device_id: string
  created_at: string
  technician_name: string
  technician_contact: string | null
  technician_phone: string | null
  category: 'intervention' | 'incident' | 'controle' | 'autre'
  severity: 'info' | 'warning' | 'error'
  message: string | null
  status: 'open' | 'resolved'
  resolved_at: string | null
  photo_paths: string[]
}

const auth = useAuthStore()
const router = useRouter()
const items = ref<InterventionRow[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const statusFilter = ref<'open' | 'resolved' | 'all'>('open')
const deviceNameById = ref<Map<string, string>>(new Map())

async function load() {
  if (!auth.companyId) return
  loading.value = true
  error.value = null

  const { data: devs, error: devErr } = await supabase
    .from('devices')
    .select('id, name')
    .eq('company_id', auth.companyId)
  if (devErr) {
    loading.value = false
    error.value = devErr.message
    return
  }
  deviceNameById.value = new Map((devs ?? []).map((d) => [d.id, d.name ?? '—']))
  const deviceIds = Array.from(deviceNameById.value.keys())
  if (deviceIds.length === 0) {
    items.value = []
    loading.value = false
    return
  }

  const { data, error: err } = await supabase
    .from('field_interventions')
    .select('id, device_id, created_at, technician_name, technician_contact, technician_phone, category, severity, message, status, resolved_at, photo_paths')
    .eq('kind', 'intervention')
    .in('device_id', deviceIds)
    .order('created_at', { ascending: false })
    .limit(200)
  loading.value = false
  if (err) {
    error.value = err.message
    return
  }
  items.value = (data ?? []) as InterventionRow[]
}

const filtered = computed(() => {
  if (statusFilter.value === 'all') return items.value
  return items.value.filter((r) => r.status === statusFilter.value)
})

const counts = computed(() => ({
  open: items.value.filter((r) => r.status === 'open').length,
  resolved: items.value.filter((r) => r.status === 'resolved').length,
  all: items.value.length,
}))

function fmt(d: string) {
  return new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}

const CATEGORY_LABEL: Record<InterventionRow['category'], string> = {
  intervention: 'Intervention',
  incident: 'Incident',
  controle: 'Contrôle',
  autre: 'Autre',
}

function severityClass(sev: InterventionRow['severity']) {
  if (sev === 'error') return 'bg-offline-soft text-offline'
  if (sev === 'warning') return 'bg-amber/15 text-amber'
  return 'bg-secondary text-muted-foreground'
}

function openDevice(id: string) {
  router.push({ name: 'admin-device-detail', params: { id } })
}

async function toggleStatus(row: InterventionRow) {
  const next = row.status === 'open' ? 'resolved' : 'open'
  const { error: e } = await supabase
    .from('field_interventions')
    .update({ status: next, resolved_at: next === 'resolved' ? new Date().toISOString() : null })
    .eq('id', row.id)
  if (e) {
    error.value = e.message
    return
  }
  row.status = next
  row.resolved_at = next === 'resolved' ? new Date().toISOString() : null
}

onMounted(load)
watch(() => auth.companyId, load)
</script>

<template>
  <div class="p-4 sm:p-6 space-y-4">
    <header class="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h1 class="text-xl font-semibold tracking-tight">Interventions</h1>
        <p class="text-sm text-muted-foreground">Registre des actions terrain (techniciens).</p>
      </div>
      <div class="flex gap-1.5">
        <button
          v-for="s in (['open', 'resolved', 'all'] as const)"
          :key="s"
          :class="[
            'font-mono text-[10px] uppercase tracking-[0.18em] px-3 py-1.5 rounded-md border transition',
            statusFilter === s
              ? 'border-signal/50 text-signal bg-signal-soft'
              : 'border-border text-muted-foreground hover:text-foreground',
          ]"
          @click="statusFilter = s"
        >
          {{ s === 'open' ? 'Ouvertes' : s === 'resolved' ? 'Résolues' : 'Toutes' }}
          <span class="ml-1 tabular text-muted-foreground/70">{{ counts[s] }}</span>
        </button>
      </div>
    </header>

    <p v-if="loading" class="text-sm text-muted-foreground">Chargement…</p>
    <p v-if="error" class="text-sm text-offline">{{ error }}</p>

    <div class="border border-border rounded-md bg-card/40 overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-card/60 border-b border-border">
          <tr>
            <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-3 w-[150px]">Date</th>
            <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-3 w-[140px]">Catégorie</th>
            <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-3">Équipement</th>
            <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-3">Contact</th>
            <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-3">Message</th>
            <th class="text-right font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-3 w-[160px]">Statut</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in filtered"
            :key="row.id"
            class="border-b border-border/50 last:border-0 hover:bg-secondary/40 transition"
          >
            <td class="px-4 py-3 font-mono text-xs text-muted-foreground tabular whitespace-nowrap">
              {{ fmt(row.created_at) }}
            </td>
            <td class="px-4 py-3">
              <span :class="['inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded', severityClass(row.severity)]">
                <span class="text-xs leading-none">{{ SEVERITY_ICON[row.severity] }}</span>
                {{ CATEGORY_LABEL[row.category] }}
              </span>
            </td>
            <td class="px-4 py-3">
              <button
                class="font-medium hover:text-signal transition text-left"
                @click="openDevice(row.device_id)"
              >
                {{ deviceNameById.get(row.device_id) || '—' }}
              </button>
            </td>
            <td class="px-4 py-3">
              <div class="font-medium">{{ row.technician_name }}</div>
              <div v-if="row.technician_contact" class="font-mono text-[11px] text-muted-foreground">{{ row.technician_contact }}</div>
              <div v-if="row.technician_phone" class="font-mono text-[11px] text-muted-foreground">{{ row.technician_phone }}</div>
            </td>
            <td class="px-4 py-3 text-muted-foreground text-xs max-w-[360px]">
              <div class="line-clamp-2">{{ row.message || '—' }}</div>
            </td>
            <td class="px-4 py-3 text-right">
              <button
                :class="[
                  'font-mono text-[10px] uppercase tracking-wider px-2.5 py-1 rounded transition',
                  row.status === 'open'
                    ? 'bg-amber/15 text-amber hover:bg-amber/25'
                    : 'bg-signal-soft text-signal hover:bg-signal/20',
                ]"
                @click="toggleStatus(row)"
              >
                {{ row.status === 'open' ? 'Marquer résolue' : '✓ Résolue' }}
              </button>
            </td>
          </tr>
          <tr v-if="!filtered.length && !loading">
            <td colspan="6" class="px-4 py-8 text-center text-muted-foreground text-sm">
              Aucune intervention
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

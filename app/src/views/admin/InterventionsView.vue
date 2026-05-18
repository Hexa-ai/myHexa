<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { SEVERITY_ICON } from '@/lib/utils'
import { useAutoRefresh } from '@/composables/useAutoRefresh'
import { injectAlarmCounts } from '@/composables/useAlarmCounts'

const alarmCounts = injectAlarmCounts()

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
function fmtFull(d: string) {
  return new Date(d).toLocaleString('fr-FR')
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
  alarmCounts?.refresh()
}

// Detail modal + lightbox
const detailRow = ref<InterventionRow | null>(null)
const detailPhotoUrls = ref<string[]>([])
const detailLightbox = ref<number | null>(null)

async function openDetail(row: InterventionRow) {
  detailRow.value = row
  detailPhotoUrls.value = []
  if (row.photo_paths.length === 0) return
  const { data, error: err } = await supabase.storage
    .from('intervention-photos')
    .createSignedUrls(row.photo_paths, 60 * 30)
  if (err) {
    console.error('[interventions] signed urls failed', err)
    return
  }
  detailPhotoUrls.value = (data ?? [])
    .map((d) => d.signedUrl)
    .filter((u): u is string => Boolean(u))
}
function closeDetail() {
  detailRow.value = null
  detailPhotoUrls.value = []
  detailLightbox.value = null
}
function openLightbox(i: number) { detailLightbox.value = i }
function closeLightbox() { detailLightbox.value = null }

onMounted(load)
watch(() => auth.companyId, load)
useAutoRefresh(load, { intervalMs: 60_000 })
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
            class="border-b border-border/50 last:border-0 hover:bg-secondary/40 transition cursor-pointer"
            @click="openDetail(row)"
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
            <td class="px-4 py-3" @click.stop>
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
              <div
                v-if="row.photo_paths.length"
                class="mt-1 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-signal"
              >
                <svg viewBox="0 0 24 24" class="size-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2z" />
                  <circle cx="9" cy="9" r="2" />
                  <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                </svg>
                {{ row.photo_paths.length }} photo{{ row.photo_paths.length > 1 ? 's' : '' }}
              </div>
            </td>
            <td class="px-4 py-3 text-right" @click.stop>
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

    <!-- Detail modal -->
    <Teleport to="body">
      <div
        v-if="detailRow"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/85 backdrop-blur-sm fade-up"
        @click.self="closeDetail"
      >
        <div class="relative border border-border rounded-lg bg-card max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          <button
            class="absolute top-3 right-3 size-8 inline-flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-signal/60 transition z-10"
            aria-label="Fermer"
            @click="closeDetail"
          >
            <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>

          <div class="p-6 space-y-5">
            <div class="flex items-center gap-2 flex-wrap pr-12">
              <span
                :class="['inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded', severityClass(detailRow.severity)]"
              >
                <span class="text-xs leading-none">{{ SEVERITY_ICON[detailRow.severity] }}</span>
                {{ CATEGORY_LABEL[detailRow.category] }}
              </span>
              <span
                :class="[
                  'font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded',
                  detailRow.status === 'open' ? 'bg-amber/15 text-amber' : 'bg-signal-soft text-signal',
                ]"
              >
                {{ detailRow.status === 'open' ? 'Ouverte' : 'Résolue' }}
              </span>
            </div>

            <div>
              <div class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Équipement</div>
              <button
                class="text-lg font-semibold tracking-tight hover:text-signal transition"
                @click="openDevice(detailRow.device_id)"
              >
                {{ deviceNameById.get(detailRow.device_id) || '—' }}
              </button>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Date</div>
                <div class="font-mono text-sm">{{ fmtFull(detailRow.created_at) }}</div>
              </div>
              <div>
                <div class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Technicien</div>
                <div>{{ detailRow.technician_name }}</div>
                <div v-if="detailRow.technician_contact" class="font-mono text-[11px] text-muted-foreground">
                  {{ detailRow.technician_contact }}
                </div>
                <div v-if="detailRow.technician_phone" class="font-mono text-[11px] text-muted-foreground">
                  {{ detailRow.technician_phone }}
                </div>
              </div>
            </div>

            <div v-if="detailRow.message">
              <div class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Commentaire</div>
              <div class="text-sm whitespace-pre-wrap leading-relaxed border border-border rounded-md bg-card/40 p-4">
                {{ detailRow.message }}
              </div>
            </div>

            <div v-if="detailRow.photo_paths.length">
              <div class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                Photos ({{ detailRow.photo_paths.length }})
              </div>
              <div v-if="!detailPhotoUrls.length" class="font-mono text-xs text-muted-foreground">
                <span class="blink">▍</span> chargement…
              </div>
              <div v-else class="grid grid-cols-3 gap-2">
                <button
                  v-for="(url, i) in detailPhotoUrls"
                  :key="i"
                  type="button"
                  class="aspect-square border border-border rounded-md overflow-hidden bg-card hover:border-signal/60 transition relative group"
                  @click="openLightbox(i)"
                >
                  <img :src="url" class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition" />
                </button>
              </div>
            </div>

            <div class="pt-2 flex justify-end gap-2">
              <button
                :class="[
                  'font-mono text-[11px] uppercase tracking-[0.22em] px-4 py-2 rounded-md transition',
                  detailRow.status === 'open'
                    ? 'bg-signal text-primary-foreground hover:brightness-110'
                    : 'border border-border text-foreground hover:border-offline/60 hover:text-offline',
                ]"
                @click="toggleStatus(detailRow); closeDetail()"
              >
                {{ detailRow.status === 'open' ? 'Marquer résolue' : 'Rouvrir' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Lightbox -->
    <Teleport to="body">
      <div
        v-if="detailLightbox !== null && detailPhotoUrls[detailLightbox]"
        class="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-background/95 backdrop-blur-md fade-up"
        @click.self="closeLightbox"
      >
        <button
          class="absolute top-4 right-4 size-10 inline-flex items-center justify-center rounded-full bg-card/80 text-foreground border border-border hover:border-signal/60 transition"
          aria-label="Fermer"
          @click="closeLightbox"
        >
          <svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
        <button
          v-if="detailPhotoUrls.length > 1"
          class="absolute left-4 size-10 inline-flex items-center justify-center rounded-full bg-card/80 text-foreground border border-border hover:border-signal/60 transition"
          aria-label="Précédente"
          @click="detailLightbox = (detailLightbox - 1 + detailPhotoUrls.length) % detailPhotoUrls.length"
        >
          <svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <button
          v-if="detailPhotoUrls.length > 1"
          class="absolute right-4 size-10 inline-flex items-center justify-center rounded-full bg-card/80 text-foreground border border-border hover:border-signal/60 transition"
          aria-label="Suivante"
          @click="detailLightbox = (detailLightbox + 1) % detailPhotoUrls.length"
        >
          <svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
        <img
          :src="detailPhotoUrls[detailLightbox]"
          class="max-w-[92vw] max-h-[92vh] object-contain rounded-md shadow-2xl"
        />
      </div>
    </Teleport>
  </div>
</template>

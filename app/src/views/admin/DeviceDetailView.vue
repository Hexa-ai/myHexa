<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useAutoRefresh } from '@/composables/useAutoRefresh'
import DeviceReport from '@/components/DeviceReport.vue'
import InsightsPopup from '@/components/devices/InsightsPopup.vue'
import DeviceDocuments from '@/components/devices/DeviceDocuments.vue'
import { useDeviceInsights } from '@/composables/useDeviceInsights'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const loading = ref(true)
const error = ref<string | null>(null)

interface Device {
  id: string
  company_id: string | null
  name: string | null
  address: string | null
  latitude: number | null
  longitude: number | null
  vnc_host: string | null
  vnc_port: number | null
}

interface Status {
  payload: Record<string, unknown>
  receivedAt: string
}

const device = ref<Device | null>(null)
const status = ref<Status | null>(null)
const reportRef = ref<InstanceType<typeof DeviceReport> | null>(null)

const role = computed(() => auth.recipient?.role ?? 'viewer')
const canEdit = computed(() => role.value === 'admin')
// Seul un admin de la compagnie PROPRIÉTAIRE du device (ou staff Hexa) peut
// le (re)partager. Un destinataire qui a reçu le device via shared_devices
// ne doit pas pouvoir le repartager — cohérent avec l'edge function share-device.
const canShare = computed(() => {
  if (auth.isHexaStaff) return true
  if (role.value !== 'admin') return false
  return device.value?.company_id != null && device.value.company_id === auth.recipient?.company_id
})
const interventionUrl = computed(() => {
  if (!device.value || typeof window === 'undefined') return null
  return `${window.location.origin}/intervention?d=${device.value.id}`
})

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number; displayName: string } | null> {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('q', address)
  url.searchParams.set('format', 'json')
  url.searchParams.set('limit', '1')
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!r.ok) return null
    const arr = (await r.json()) as Array<{ lat: string; lon: string; display_name?: string }>
    if (!Array.isArray(arr) || arr.length === 0) return null
    const lat = parseFloat(arr[0].lat)
    const lng = parseFloat(arr[0].lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    return { lat, lng, displayName: arr[0].display_name ?? address }
  } catch {
    return null
  }
}

async function onSaveLocation(address: string) {
  if (!device.value || !canEdit.value) return
  const geo = await geocodeAddress(address)
  if (!geo) {
    reportRef.value?.setLocationFeedback('error', 'Adresse introuvable.')
    return
  }
  const { data: updated, error: updErr } = await supabase
    .from('devices')
    .update({ address: geo.displayName, latitude: geo.lat, longitude: geo.lng })
    .eq('id', device.value.id)
    .select('id, company_id, name, address, latitude, longitude, vnc_host, vnc_port')
    .single()
  if (updErr) {
    reportRef.value?.setLocationFeedback('error', updErr.message)
    return
  }
  device.value = updated
  reportRef.value?.setLocationFeedback('success', 'Adresse géocodée et enregistrée.')
}

async function onSaveVnc({ host, port }: { host: string | null; port: number }) {
  if (!device.value || !canEdit.value) return
  const { data: updated, error: updErr } = await supabase
    .from('devices')
    .update({ vnc_host: host, vnc_port: port })
    .eq('id', device.value.id)
    .select('id, company_id, name, address, latitude, longitude, vnc_host, vnc_port')
    .single()
  if (updErr) {
    reportRef.value?.setVncFeedback('error', updErr.message)
    return
  }
  device.value = updated
  reportRef.value?.setVncFeedback(
    'success',
    host ? 'Configuration VNC enregistrée.' : 'VNC désactivé.',
  )
}

async function loadDetail() {
  const deviceId = String(route.params.id)
  // Soft-refresh: only show the spinner on the initial load
  if (!device.value) loading.value = true
  error.value = null

  try {
    const { data: d, error: dErr } = await supabase
      .from('devices')
      .select('id, company_id, name, address, latitude, longitude, vnc_host, vnc_port')
      .eq('id', deviceId)
      .maybeSingle()

    if (dErr) {
      error.value = dErr.message
      return
    }
    if (!d) {
      error.value = 'Équipement introuvable ou non accessible.'
      return
    }
    device.value = d

    const { data: s, error: sErr } = await supabase
      .from('reports')
      .select('payload, received_at')
      .eq('device_id', d.id)
      .eq('type', 'status')
      .order('received_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!sErr && s) {
      status.value = {
        payload: (s.payload as Record<string, unknown>) ?? {},
        receivedAt: s.received_at as string,
      }
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Unknown error'
  } finally {
    loading.value = false
  }
}

useAutoRefresh(loadDetail, { intervalMs: 120_000 })

// --- Insights intelligents (popup) ------------------------------------------
const insightsApi = useDeviceInsights(() => device.value?.id ?? null)
// Lance init dès que le device est chargé pour la 1ère fois
watch(
  () => device.value?.id,
  (id, prev) => {
    if (id && id !== prev) insightsApi.init()
  },
)

// --- Partage avec un destinataire externe -----------------------------------
const shareOpen = ref(false)
const shareEmail = ref('')
const shareSubmitting = ref(false)
const shareResult = ref<string | null>(null)

interface CurrentShare { id: string; name: string; contact_email: string }
const currentShares = ref<CurrentShare[]>([])
const sharesLoading = ref(false)
const revokingId = ref<string | null>(null)

async function loadShares() {
  if (!device.value) return
  sharesLoading.value = true
  try {
    const { data, error: err } = await supabase
      .from('recipients')
      .select('id, name, contact_email, shared_devices')
      .contains('shared_devices', [device.value.id])
    if (err) throw new Error(err.message)
    currentShares.value = (data ?? []).map((r) => ({
      id: r.id, name: r.name, contact_email: r.contact_email ?? '',
    }))
  } catch (e) {
    shareResult.value = `Erreur : ${(e as Error).message}`
  } finally {
    sharesLoading.value = false
  }
}

async function revokeShare(s: CurrentShare) {
  if (!device.value) return
  if (!confirm(`Retirer le partage de cet équipement avec ${s.contact_email} ?`)) return
  revokingId.value = s.id
  try {
    const { data, error: err } = await supabase.functions.invoke('share-device', {
      body: { device_id: device.value.id, recipient_email: s.contact_email, revoke: true },
    })
    if (err) throw new Error(err.message)
    if (!data?.ok) throw new Error(data?.error?.message ?? 'Erreur')
    await loadShares()
  } catch (e) {
    shareResult.value = `Erreur : ${(e as Error).message}`
  } finally {
    revokingId.value = null
  }
}

function openShare() {
  shareEmail.value = ''
  shareResult.value = null
  shareOpen.value = true
  loadShares()
}
async function submitShare() {
  if (!device.value) return
  if (!shareEmail.value.includes('@')) {
    shareResult.value = 'Email invalide'
    return
  }
  shareSubmitting.value = true
  shareResult.value = null
  try {
    const { data, error: err } = await supabase.functions.invoke('share-device', {
      body: { device_id: device.value.id, recipient_email: shareEmail.value.trim().toLowerCase() },
    })
    if (err) throw new Error(err.message)
    if (!data?.ok) throw new Error(data?.error?.message ?? 'Erreur')
    if (data.data.status === 'already_shared') {
      shareResult.value = `Déjà partagé avec ${data.data.recipient_email}`
    } else {
      shareResult.value = `Partagé avec ${data.data.recipient_email} ✓`
    }
    shareEmail.value = ''
    await loadShares()
  } catch (e) {
    shareResult.value = `Erreur : ${(e as Error).message}`
  } finally {
    shareSubmitting.value = false
  }
}
</script>

<template>
  <section class="px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10 max-w-[1200px] mx-auto">
    <div class="mb-6 flex items-center justify-between gap-3 flex-wrap">
      <button
        class="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-signal transition"
        @click="router.push({ name: 'admin-devices' })"
      >
        ← Retour à la flotte
      </button>
      <button
        v-if="canShare"
        type="button"
        class="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider border border-border text-muted-foreground hover:border-signal/60 hover:text-signal px-3 py-1.5 rounded-md transition"
        @click="openShare"
      >
        ↗ Partager avec un destinataire
      </button>
    </div>

    <!-- Insights intelligents popup -->
    <InsightsPopup
      :open="insightsApi.shouldShowPopup.value"
      :insights="insightsApi.insights.value"
      :device-id="device?.id ?? ''"
      :device-name="device?.name"
      @acknowledge="insightsApi.acknowledge"
      @dismiss="insightsApi.dismiss"
    />

    <!-- Share modal -->
    <Teleport to="body">
      <div
        v-if="shareOpen"
        class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
        @click.self="shareOpen = false"
      >
        <div class="bg-background w-full max-w-md border border-border rounded-lg p-6 space-y-4">
          <header class="flex items-center justify-between">
            <h2 class="text-lg font-semibold">Partager cet équipement</h2>
            <button class="text-muted-foreground hover:text-foreground text-xl leading-none" @click="shareOpen = false">×</button>
          </header>
          <p class="text-sm text-muted-foreground">
            Le destinataire (par email) verra cet équipement en plus de ses équipements habituels.
            Il doit déjà exister comme destinataire dans une compagnie ou comme guest.
          </p>
          <label class="block">
            <span class="text-xs uppercase tracking-wide text-muted-foreground">Email du destinataire</span>
            <input
              v-model="shareEmail"
              type="email"
              autocomplete="off"
              class="mt-1 w-full border border-border bg-secondary/30 rounded-md px-3 py-2 text-sm"
              placeholder="prenom.nom@exemple.fr"
              @keyup.enter="submitShare"
            />
          </label>
          <p v-if="shareResult" class="text-sm" :class="shareResult.startsWith('Erreur') ? 'text-red-500' : 'text-signal'">
            {{ shareResult }}
          </p>

          <div class="border-t border-border pt-3">
            <div class="text-xs uppercase tracking-wide text-muted-foreground mb-2">
              Partages actifs
            </div>
            <div v-if="sharesLoading" class="text-xs text-muted-foreground">Chargement…</div>
            <div v-else-if="currentShares.length === 0" class="text-xs text-muted-foreground">
              Aucun partage pour cet équipement.
            </div>
            <ul v-else class="space-y-1.5">
              <li
                v-for="s in currentShares"
                :key="s.id"
                class="flex items-center justify-between gap-2 text-sm"
              >
                <span class="truncate">
                  <span class="font-medium">{{ s.name }}</span>
                  <span class="text-muted-foreground"> · {{ s.contact_email }}</span>
                </span>
                <button
                  :disabled="revokingId === s.id"
                  class="font-mono text-[10px] uppercase tracking-wider border border-border text-muted-foreground hover:border-offline/60 hover:text-offline px-2 py-1 rounded-md transition disabled:opacity-50"
                  @click="revokeShare(s)"
                >
                  {{ revokingId === s.id ? '…' : 'Retirer' }}
                </button>
              </li>
            </ul>
          </div>

          <footer class="flex justify-end gap-2">
            <button class="px-3 py-2 text-sm border border-border rounded-md" @click="shareOpen = false">Fermer</button>
            <button
              :disabled="shareSubmitting"
              class="px-3 py-2 text-sm bg-primary text-primary-foreground rounded-md disabled:opacity-60"
              @click="submitShare"
            >
              {{ shareSubmitting ? 'Partage…' : 'Partager' }}
            </button>
          </footer>
        </div>
      </div>
    </Teleport>

    <div
      v-if="loading"
      class="border border-border rounded-md bg-card/40 p-10 text-center font-mono text-sm text-muted-foreground"
    >
      <span class="blink">▍</span> chargement…
    </div>

    <div
      v-else-if="error"
      class="border border-offline/40 rounded-md bg-offline-soft p-6 text-center"
    >
      <div class="font-mono text-[10px] uppercase tracking-[0.3em] text-offline mb-3">Erreur</div>
      <p>{{ error }}</p>
    </div>

    <DeviceReport
      v-else-if="device"
      ref="reportRef"
      :device="device"
      :status="status"
      :role="role"
      :can-edit-location="canEdit"
      :can-edit-vnc="canEdit"
      :vnc-host="device.vnc_host"
      :vnc-port="device.vnc_port"
      :periodic-href="(t) => router.resolve({ name: 'admin-device-periodic', params: { id: device!.id }, query: { type: t } }).href"
      :intervention-url="interventionUrl"
      @save-location="onSaveLocation"
      @save-vnc="onSaveVnc"
    />

    <DeviceDocuments
      v-if="device && !loading && !error"
      class="mt-6"
      :device-id="device.id"
      :can-edit="canShare"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useAutoRefresh } from '@/composables/useAutoRefresh'
import DeviceReport from '@/components/DeviceReport.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const loading = ref(true)
const error = ref<string | null>(null)

interface Device {
  id: string
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
  if (!device.value) return
  const geo = await geocodeAddress(address)
  if (!geo) {
    reportRef.value?.setLocationFeedback('error', 'Adresse introuvable.')
    return
  }
  const { data: updated, error: updErr } = await supabase
    .from('devices')
    .update({ address: geo.displayName, latitude: geo.lat, longitude: geo.lng })
    .eq('id', device.value.id)
    .select('id, name, address, latitude, longitude, vnc_host, vnc_port')
    .single()
  if (updErr) {
    reportRef.value?.setLocationFeedback('error', updErr.message)
    return
  }
  device.value = updated
  reportRef.value?.setLocationFeedback('success', 'Adresse géocodée et enregistrée.')
}

async function onSaveVnc({ host, port }: { host: string | null; port: number }) {
  if (!device.value) return
  const { data: updated, error: updErr } = await supabase
    .from('devices')
    .update({ vnc_host: host, vnc_port: port })
    .eq('id', device.value.id)
    .select('id, name, address, latitude, longitude, vnc_host, vnc_port')
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
      .select('id, name, address, latitude, longitude, vnc_host, vnc_port')
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
</script>

<template>
  <section class="px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10 max-w-[1200px] mx-auto">
    <button
      class="mb-6 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-signal transition"
      @click="router.push({ name: 'admin-devices' })"
    >
      ← Retour à la flotte
    </button>

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
  </section>
</template>

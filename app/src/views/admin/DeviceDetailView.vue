<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
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

async function onSaveLocation(address: string) {
  if (!device.value) return
  // RLS protects the company; admin can update only own-company devices
  const { data: updated, error: updErr } = await supabase
    .from('devices')
    .update({ address })
    .eq('id', device.value.id)
    .select('id, name, address, latitude, longitude')
    .single()
  if (updErr) {
    reportRef.value?.setLocationFeedback('error', updErr.message)
    return
  }
  device.value = updated
  reportRef.value?.setLocationFeedback('success', 'Adresse enregistrée.')
}

async function loadDetail(deviceId: string) {
  loading.value = true
  error.value = null

  // RLS already restricts to the user's company
  const { data: d, error: dErr } = await supabase
    .from('devices')
    .select('id, name, address, latitude, longitude')
    .eq('id', deviceId)
    .maybeSingle()

  if (dErr) {
    error.value = dErr.message
    loading.value = false
    return
  }
  if (!d) {
    error.value = 'Équipement introuvable ou non accessible.'
    loading.value = false
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

  loading.value = false
}

onMounted(() => loadDetail(String(route.params.id)))
</script>

<template>
  <section class="px-8 py-10 max-w-[1200px] mx-auto">
    <button
      @click="router.push({ name: 'admin-devices' })"
      class="mb-6 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-signal transition"
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
      @save-location="onSaveLocation"
    />
  </section>
</template>

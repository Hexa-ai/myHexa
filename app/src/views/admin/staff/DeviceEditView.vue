<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useStaffCompanies } from '@/composables/useStaffCompanies'

const route = useRoute()
const router = useRouter()
const { companies, fetch } = useStaffCompanies()

const id = computed(() => String(route.params.id ?? ''))

const name = ref('')
const serialNumber = ref('')
const macEth0 = ref('')
const hasBattery = ref(false)
const hasSupercap = ref(false)
const osVersion = ref('')
const osInstallDate = ref('')
const invoiceNumber = ref('')
const companyId = ref<string>('')
const tokenSet = ref(false)

const loading = ref(false)
const saving = ref(false)
const error = ref<string | null>(null)
const flash = ref<string | null>(null)

const canSubmit = computed(() => name.value.trim() && companyId.value)

async function load() {
  if (!id.value) return
  loading.value = true
  error.value = null
  const { data, error: err } = await supabase
    .from('devices')
    .select('id, name, serial_number, mac_eth0, has_battery, has_supercap, os_version, os_install_date, invoice_number, company_id, token')
    .eq('id', id.value)
    .maybeSingle()
  loading.value = false
  if (err) { error.value = err.message; return }
  if (!data) { error.value = 'Device introuvable'; return }
  name.value = data.name
  serialNumber.value = data.serial_number ?? ''
  macEth0.value = data.mac_eth0 ?? ''
  hasBattery.value = data.has_battery
  hasSupercap.value = data.has_supercap
  osVersion.value = data.os_version ?? ''
  osInstallDate.value = data.os_install_date ?? ''
  invoiceNumber.value = data.invoice_number ?? ''
  companyId.value = data.company_id
  tokenSet.value = !!data.token
}

async function save() {
  if (!canSubmit.value) return
  saving.value = true
  error.value = null
  flash.value = null
  const { error: err } = await supabase
    .from('devices')
    .update({
      name: name.value.trim(),
      serial_number: serialNumber.value.trim() || null,
      mac_eth0: macEth0.value.trim() || null,
      has_battery: hasBattery.value,
      has_supercap: hasSupercap.value,
      os_version: osVersion.value.trim() || null,
      os_install_date: osInstallDate.value || null,
      invoice_number: invoiceNumber.value.trim() || null,
      company_id: companyId.value,
    })
    .eq('id', id.value)
  saving.value = false
  if (err) { error.value = err.message; return }
  flash.value = '✓ Enregistré'
  setTimeout(() => (flash.value = null), 2000)
}

async function resetToken() {
  if (!confirm('Réinitialiser le token de ce device ? Il devra re-bootstrap via le flow n8n.')) return
  saving.value = true
  error.value = null
  const { error: err } = await supabase
    .from('devices')
    .update({ token: null })
    .eq('id', id.value)
  saving.value = false
  if (err) { error.value = err.message; return }
  tokenSet.value = false
  flash.value = '✓ Token réinitialisé'
  setTimeout(() => (flash.value = null), 2500)
}

onMounted(() => { fetch(); load() })
watch(id, load)
</script>

<template>
  <div class="p-4 sm:p-6 max-w-xl mx-auto space-y-5">
    <header>
      <router-link :to="{ name: 'staff-devices' }" class="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground hover:text-foreground transition">
        ← Devices
      </router-link>
      <h1 class="mt-1 text-xl font-semibold tracking-tight">Éditer le device</h1>
    </header>

    <p v-if="loading" class="text-sm text-muted-foreground">Chargement…</p>

    <form v-if="!loading" class="space-y-4" @submit.prevent="save">
      <div class="space-y-1.5">
        <label class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Nom *</label>
        <input
          v-model="name"
          type="text"
          required
          class="w-full bg-transparent border-0 border-b border-border focus:border-signal focus:outline-none px-0 py-2 text-sm font-mono"
        />
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div class="space-y-1.5">
          <label class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">N° de série</label>
          <input
            v-model="serialNumber"
            type="text"
            class="w-full bg-transparent border-0 border-b border-border focus:border-signal focus:outline-none px-0 py-2 text-sm font-mono"
          />
        </div>
        <div class="space-y-1.5">
          <label class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">MAC eth0</label>
          <input
            v-model="macEth0"
            type="text"
            class="w-full bg-transparent border-0 border-b border-border focus:border-signal focus:outline-none px-0 py-2 text-sm font-mono"
          />
        </div>
      </div>

      <div class="space-y-1.5">
        <label class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Compagnie</label>
        <select v-model="companyId" required class="w-full bg-card border border-border rounded-md px-3 py-2 text-sm font-mono">
          <option v-for="c in companies" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label class="flex items-center gap-2 cursor-pointer">
          <input v-model="hasBattery" type="checkbox" class="size-4 accent-signal" />
          <span class="text-sm">Pile / batterie</span>
        </label>
        <label class="flex items-center gap-2 cursor-pointer">
          <input v-model="hasSupercap" type="checkbox" class="size-4 accent-signal" />
          <span class="text-sm">Super-condensateur</span>
        </label>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div class="space-y-1.5">
          <label class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Version OS (livraison)</label>
          <input
            v-model="osVersion"
            type="text"
            class="w-full bg-transparent border-0 border-b border-border focus:border-signal focus:outline-none px-0 py-2 text-sm font-mono"
          />
        </div>
        <div class="space-y-1.5">
          <label class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Date installation OS</label>
          <input
            v-model="osInstallDate"
            type="date"
            class="w-full bg-transparent border-0 border-b border-border focus:border-signal focus:outline-none px-0 py-2 text-sm font-mono"
          />
        </div>
      </div>

      <div class="space-y-1.5">
        <label class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">N° de facture</label>
        <input
          v-model="invoiceNumber"
          type="text"
          class="w-full bg-transparent border-0 border-b border-border focus:border-signal focus:outline-none px-0 py-2 text-sm font-mono"
        />
      </div>

      <!-- Token management -->
      <div class="border border-border rounded-md bg-card/40 p-4 space-y-2">
        <div class="flex items-center justify-between gap-3">
          <div>
            <div class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Token bootstrap</div>
            <div class="text-sm">
              <span v-if="tokenSet" class="text-signal">● présent</span>
              <span v-else class="text-muted-foreground">○ absent (device peut re-bootstrap)</span>
            </div>
          </div>
          <button
            v-if="tokenSet"
            type="button"
            :disabled="saving"
            class="font-mono text-[10px] uppercase tracking-wider border border-offline/50 text-offline px-3 py-1.5 rounded hover:bg-offline/10 transition disabled:opacity-50"
            @click="resetToken"
          >
            ⟲ Réinitialiser le token
          </button>
        </div>
      </div>

      <p v-if="error" class="text-sm text-offline">{{ error }}</p>
      <p v-if="flash" class="text-sm text-signal">{{ flash }}</p>

      <div class="flex justify-end gap-2">
        <button type="button" class="font-mono text-[11px] uppercase tracking-[0.22em] px-4 py-2 rounded-md border border-border" @click="router.back()">
          Retour
        </button>
        <button
          type="submit"
          :disabled="!canSubmit || saving"
          class="font-mono text-[11px] uppercase tracking-[0.22em] bg-signal text-primary-foreground px-4 py-2 rounded-md hover:brightness-110 disabled:opacity-50 transition"
        >
          {{ saving ? 'Enregistrement…' : 'Enregistrer' }}
        </button>
      </div>
    </form>
  </div>
</template>

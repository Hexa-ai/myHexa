<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

interface CompanyDetail {
  id: string
  name: string
  is_hexa_internal: boolean
  created_at: string
  status_email_frequency: 'none' | 'daily' | 'weekly'
}
interface DeviceLite {
  id: string
  name: string
  mac_eth0: string | null
  last_connection_at: string | null
}
interface RecipientLite {
  id: string
  name: string
  contact_email: string | null
  role: string
}

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const company = ref<CompanyDetail | null>(null)
const devices = ref<DeviceLite[]>([])
const recipients = ref<RecipientLite[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

const editing = ref(false)
const editedName = ref('')

const id = computed(() => String(route.params.id ?? ''))

async function load() {
  if (!id.value) return
  loading.value = true
  error.value = null

  const [{ data: c, error: cErr }, { data: ds, error: dErr }, { data: rs, error: rErr }] =
    await Promise.all([
      supabase.from('companies').select('id, name, is_hexa_internal, created_at, status_email_frequency').eq('id', id.value).maybeSingle(),
      supabase.from('devices').select('id, name, mac_eth0, last_connection_at').eq('company_id', id.value).order('name'),
      supabase.from('recipients').select('id, name, contact_email, role').eq('company_id', id.value),
    ])

  loading.value = false
  if (cErr) { error.value = cErr.message; return }
  if (dErr) { error.value = dErr.message; return }
  if (rErr) { error.value = rErr.message; return }

  company.value = c as CompanyDetail
  devices.value = (ds ?? []) as DeviceLite[]
  recipients.value = (rs ?? []) as RecipientLite[]
  editedName.value = company.value?.name ?? ''
}

async function saveName() {
  if (!company.value) return
  const name = editedName.value.trim()
  if (!name) return
  const { error: err } = await supabase.from('companies').update({ name }).eq('id', company.value.id)
  if (err) { error.value = err.message; return }
  company.value.name = name
  editing.value = false
}

const sendingReport = ref(false)
const sendReportResult = ref<string | null>(null)

async function sendReportNow() {
  if (!company.value) return
  sendingReport.value = true
  sendReportResult.value = null
  try {
    const { data, error: err } = await supabase.functions.invoke('cron-status-email', {
      body: { company_id: company.value.id },
    })
    if (err) throw new Error(err.message)
    if (!data?.ok) throw new Error(data?.error ?? 'Erreur inconnue')
    if (data.queued) {
      sendReportResult.value = `Envoi en cours pour ${data.recipients} destinataire(s) — les mails arrivent dans quelques secondes.`
    } else {
      sendReportResult.value = `${data.mails_sent} mail(s) envoyé(s) · ${data.recipients} destinataire(s)`
    }
  } catch (e) {
    sendReportResult.value = e instanceof Error ? `Erreur : ${e.message}` : 'Erreur inconnue'
  } finally {
    sendingReport.value = false
  }
}

async function setFrequency(value: 'none' | 'daily' | 'weekly') {
  if (!company.value) return
  const prev = company.value.status_email_frequency
  company.value.status_email_frequency = value
  const { error: err } = await supabase
    .from('companies')
    .update({ status_email_frequency: value })
    .eq('id', company.value.id)
  if (err) {
    company.value.status_email_frequency = prev
    error.value = err.message
  }
}

function enterAs() {
  if (!company.value) return
  auth.setActAsCompany(company.value.id)
  router.push({ name: 'admin-devices' })
}

function provisionDevice() {
  if (!company.value) return
  router.push({ name: 'staff-device-new', query: { company: company.value.id } })
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}

onMounted(load)
watch(id, load)
</script>

<template>
  <div class="p-4 sm:p-6 space-y-6">
    <header class="flex items-center justify-between flex-wrap gap-3">
      <div>
        <router-link
          :to="{ name: 'staff-companies' }"
          class="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground hover:text-foreground transition"
        >
          ← Compagnies
        </router-link>
        <div class="mt-1 flex items-center gap-3">
          <h1 v-if="!editing" class="text-xl font-semibold tracking-tight">
            {{ company?.name ?? '—' }}
            <span v-if="company?.is_hexa_internal" class="ml-2 font-mono text-[10px] uppercase tracking-wider text-signal">interne</span>
          </h1>
          <input
            v-else
            v-model="editedName"
            type="text"
            class="text-xl font-semibold tracking-tight bg-transparent border-b border-signal focus:outline-none"
            @keydown.enter="saveName"
            @keydown.escape="editing = false"
          />
          <button
            v-if="auth.isHexaStaffAdmin && !editing"
            type="button"
            class="font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-signal transition"
            @click="editing = true"
          >
            ✎ renommer
          </button>
          <button
            v-if="editing"
            type="button"
            class="font-mono text-[10px] uppercase tracking-wider text-signal"
            @click="saveName"
          >
            ✓ enregistrer
          </button>
        </div>
      </div>
      <button
        type="button"
        class="font-mono text-[11px] uppercase tracking-[0.22em] border border-signal/50 text-signal px-4 py-2 rounded-md hover:bg-signal-soft transition"
        @click="enterAs"
      >
        Entrer comme {{ company?.name ?? '…' }} →
      </button>
    </header>

    <p v-if="loading" class="text-sm text-muted-foreground">Chargement…</p>
    <p v-if="error" class="text-sm text-offline">{{ error }}</p>

    <section
      v-if="auth.isHexaStaffAdmin && company"
      class="border border-border rounded-md bg-card/40 p-4 flex items-center justify-between flex-wrap gap-3"
    >
      <div>
        <div class="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-1">
          Résumé status par email
        </div>
        <p class="text-xs text-muted-foreground">
          Pilote l'envoi automatique du brief IA + état de la flotte aux destinataires de la compagnie.
        </p>
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        <div class="inline-flex rounded-md border border-border overflow-hidden font-mono text-[10px] uppercase tracking-wider">
          <button
            v-for="opt in (['none', 'weekly', 'daily'] as const)"
            :key="opt"
            type="button"
            :class="[
              'px-3 py-1.5 transition border-r border-border last:border-r-0',
              company.status_email_frequency === opt
                ? 'bg-signal text-primary-foreground'
                : 'bg-transparent text-muted-foreground hover:text-foreground',
            ]"
            @click="setFrequency(opt)"
          >
            {{ opt === 'none' ? 'Aucun' : opt === 'daily' ? 'Quotidien' : 'Hebdo (mardi)' }}
          </button>
        </div>
        <button
          type="button"
          :disabled="sendingReport"
          class="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider border border-border text-muted-foreground hover:border-signal/60 hover:text-signal px-3 py-1.5 rounded-md transition disabled:opacity-60 disabled:cursor-not-allowed"
          @click="sendReportNow"
        >
          {{ sendingReport ? 'Envoi…' : '✉ Envoyer maintenant' }}
        </button>
      </div>
    </section>
    <p
      v-if="sendReportResult"
      class="text-xs font-mono text-muted-foreground -mt-3"
    >
      {{ sendReportResult }}
    </p>

    <section class="space-y-2">
      <div class="flex items-center justify-between">
        <h2 class="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          Devices · {{ devices.length }}
        </h2>
        <button
          v-if="auth.isHexaStaffAdmin"
          type="button"
          class="font-mono text-[10px] uppercase tracking-wider border border-signal/50 text-signal px-2.5 py-1 rounded hover:bg-signal-soft transition"
          @click="provisionDevice"
        >
          + Provisionner
        </button>
      </div>
      <div class="border border-border rounded-md bg-card/40 overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-card/60 border-b border-border">
            <tr>
              <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-2">Nom</th>
              <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-2">MAC eth0</th>
              <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-2">Dernière connexion</th>
              <th class="text-right font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-2 w-[80px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in devices" :key="d.id" class="border-b border-border/50 last:border-0">
              <td class="px-4 py-2 font-medium">{{ d.name }}</td>
              <td class="px-4 py-2 font-mono text-xs text-muted-foreground">{{ d.mac_eth0 ?? '—' }}</td>
              <td class="px-4 py-2 font-mono text-xs text-muted-foreground">{{ fmtDate(d.last_connection_at) }}</td>
              <td class="px-4 py-2 text-right">
                <router-link
                  v-if="auth.isHexaStaffAdmin"
                  :to="{ name: 'staff-device-edit', params: { id: d.id } }"
                  class="font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-signal transition"
                >
                  ✎ éditer
                </router-link>
              </td>
            </tr>
            <tr v-if="!devices.length">
              <td colspan="4" class="px-4 py-6 text-center text-muted-foreground text-sm">Aucun device</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="space-y-2">
      <h2 class="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
        Recipients · {{ recipients.length }}
      </h2>
      <div class="border border-border rounded-md bg-card/40 overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-card/60 border-b border-border">
            <tr>
              <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-2">Nom</th>
              <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-2">Email</th>
              <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-2 w-[120px]">Rôle</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in recipients" :key="r.id" class="border-b border-border/50 last:border-0">
              <td class="px-4 py-2 font-medium">{{ r.name }}</td>
              <td class="px-4 py-2 text-muted-foreground">{{ r.contact_email ?? '—' }}</td>
              <td class="px-4 py-2 font-mono text-xs text-muted-foreground">{{ r.role }}</td>
            </tr>
            <tr v-if="!recipients.length">
              <td colspan="3" class="px-4 py-6 text-center text-muted-foreground text-sm">Aucun recipient</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="text-xs text-muted-foreground">
        Pour inviter un recipient dans cette compagnie, utilise "Entrer comme {{ company?.name ?? '…' }}" puis va dans Destinataires.
      </p>
    </section>
  </div>
</template>

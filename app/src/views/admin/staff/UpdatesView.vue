<script setup lang="ts">
// PROTOTYPE — mise à jour du firmware des box à distance (staff Hexa-AI).
// Firmware >= 1.3.7, commande run_update (docs/remote-commands.md) : la box télécharge le paquet,
// l'installe puis redémarre ; 3 acquittements espacés d'un push (~30 min), 1 à 2 h au total.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useStaffCompanies } from '@/composables/useStaffCompanies'
import { useAuthStore } from '@/stores/auth'

interface Box {
  id: string
  name: string
  company_id: string
  remote_seen_at: string | null
  running_version: string | null
  pkg_version: string | null
  candidate_version: string | null
  reboot_required: boolean | null
  update_running: boolean | null
  last_connection_at: string | null
}
interface Cmd {
  id: string
  device_id: string
  type: 'run_update' | 'reboot'
  state: 'queued' | 'sent' | 'in_progress' | 'acked' | 'failed' | 'cancelled'
  issued_at: string
  acked_at: string | null
  ack_status: string | null
  ack_detail: string | null
  payload: { version?: string | null }
}
type Tone = 'muted' | 'ok' | 'info' | 'warn' | 'bad'
interface UState {
  key: 'none' | 'busy' | 'reboot' | 'available' | 'uptodate'
  label: string
  detail?: string
  tone: Tone
  cmd?: Cmd
}

const auth = useAuthStore()
const { companies, fetch: fetchCompanies } = useStaffCompanies()
const boxes = ref<Box[]>([])
const cmds = ref<Cmd[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const flash = ref<string | null>(null)
const filterCompany = ref('all')
const onlyTodo = ref(true)
const selected = ref<string[]>([])
const confirmIds = ref<string[] | null>(null)
const busy = ref(false)

async function load() {
  loading.value = true
  error.value = null
  const since = new Date(Date.now() - 7 * 86400e3).toISOString()
  const [b, c] = await Promise.all([
    supabase
      .from('devices')
      .select(
        'id, name, company_id, remote_seen_at, running_version, pkg_version, candidate_version, reboot_required, update_running, last_connection_at',
      )
      .order('name'),
    supabase
      .from('device_commands')
      .select('id, device_id, type, state, issued_at, acked_at, ack_status, ack_detail, payload')
      .in('type', ['run_update', 'reboot'])
      .gte('issued_at', since)
      .order('issued_at', { ascending: false }),
  ])
  loading.value = false
  if (b.error || c.error) {
    error.value = (b.error ?? c.error)!.message
    return
  }
  boxes.value = (b.data ?? []) as unknown as Box[]
  cmds.value = (c.data ?? []) as unknown as Cmd[]
  selected.value = selected.value.filter((id) => state(boxById.value.get(id)!)?.key === 'available')
}
const boxById = computed(() => new Map(boxes.value.map((b) => [b.id, b])))
const companyName = computed(() => new Map(companies.value.map((c) => [c.id, c.name])))
const lastCmd = (id: string) =>
  cmds.value.find((c) => c.device_id === id && c.state !== 'cancelled')

const ACK_FR: [RegExp, string][] = [
  [/installation started/i, 'téléchargement et installation en cours'],
  [/waiting for reboot/i, 'installée, redémarrage en cours'],
]
const ackFr = (d: string | null) => ACK_FR.find(([r]) => d && r.test(d))?.[1] ?? d ?? ''
const ago = (iso: string | null) => {
  if (!iso) return '—'
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  return m < 60
    ? `il y a ${m} min`
    : m < 2880
      ? `il y a ${Math.round(m / 60)} h`
      : `il y a ${Math.round(m / 1440)} j`
}

function state(b: Box): UState {
  const c = lastCmd(b.id)
  if (!b.remote_seen_at)
    return {
      key: 'none',
      label: 'mise à jour sur site',
      detail: 'firmware antérieur à 1.3.7 ou pilotage à distance désactivé sur la box',
      tone: 'muted',
    }
  const L =
    c?.type === 'reboot'
      ? { q: 'Redémarrage programmé', s: 'Redémarrage envoyé', p: 'Redémarrage en cours' }
      : { q: 'Mise à jour programmée', s: 'Mise à jour envoyée', p: 'Mise à jour en cours' }
  if (c?.state === 'queued')
    return {
      key: 'busy',
      label: L.q,
      detail: 'partira au prochain contact de la box (≤ 30 min)',
      tone: 'info',
      cmd: c,
    }
  if (c?.state === 'sent')
    return {
      key: 'busy',
      label: L.s,
      detail: `la box l'a reçue ${ago(c.issued_at)}, réponse au prochain contact`,
      tone: 'info',
      cmd: c,
    }
  if (c?.state === 'in_progress')
    return {
      key: 'busy',
      label: L.p,
      detail: ackFr(c.ack_detail),
      tone: 'info',
      cmd: c,
    }
  if (b.update_running)
    return {
      key: 'busy',
      label: 'Installation en cours',
      detail: 'lancée sur la box',
      tone: 'info',
    }
  const recent =
    c && c.acked_at && Date.now() - new Date(c.acked_at).getTime() < 86400e3 ? c : undefined
  const failed =
    recent?.state === 'failed'
      ? `dernier essai refusé : ${recent.ack_detail ?? recent.ack_status}`
      : undefined
  if (b.reboot_required)
    return {
      key: 'reboot',
      label: 'Installée, redémarrage nécessaire',
      detail: failed ?? 'la nouvelle version ne tourne qu’après redémarrage',
      tone: 'warn',
    }
  if (b.candidate_version)
    return {
      key: 'available',
      label: `v${b.candidate_version} disponible`,
      detail: failed,
      tone: failed ? 'bad' : 'warn',
    }
  return {
    key: 'uptodate',
    label: 'À jour',
    detail:
      recent?.state === 'acked' && recent.type === 'run_update'
        ? `mise à jour faite : ${recent.ack_detail}`
        : undefined,
    tone: 'ok',
  }
}
const TONE: Record<Tone, string> = {
  muted: 'text-muted-foreground',
  ok: 'text-online',
  info: 'text-signal',
  warn: 'text-amber-400',
  bad: 'text-offline',
}
const stale = (b: Box) =>
  !!b.remote_seen_at && Date.now() - new Date(b.remote_seen_at).getTime() > 2 * 3600e3

const rows = computed(() =>
  boxes.value
    .filter((b) => filterCompany.value === 'all' || b.company_id === filterCompany.value)
    .map((b) => ({ b, s: state(b) }))
    .filter((r) => !onlyTodo.value || ['busy', 'reboot', 'available'].includes(r.s.key)),
)
const counts = computed(() => {
  const n = { available: 0, busy: 0, reboot: 0, uptodate: 0, none: 0 }
  for (const b of boxes.value)
    if (filterCompany.value === 'all' || b.company_id === filterCompany.value) n[state(b).key]++
  return n
})
const selectable = computed(() =>
  rows.value.filter((r) => r.s.key === 'available').map((r) => r.b.id),
)

async function runUpdates(ids: string[]) {
  busy.value = true
  const out: string[] = []
  for (const id of ids) {
    const { data, error: e } = await supabase.rpc('queue_run_update', { p_device: id })
    const r = data as { status: string; detail?: string; target?: string } | null
    const name = boxById.value.get(id)?.name
    out.push(
      e
        ? `${name} : ${e.message}`
        : r?.status === 'queued'
          ? `${name} → v${r.target}`
          : `${name} : ${r?.detail}`,
    )
  }
  busy.value = false
  confirmIds.value = null
  selected.value = []
  flash.value = out.join(' · ')
  await load()
}
async function reboot(b: Box) {
  if (!confirm(`Redémarrer ${b.name} ? La supervision est coupée quelques minutes.`)) return
  const { data, error: e } = await supabase.rpc('queue_reboot', { p_device: b.id })
  const r = data as { status: string; detail?: string } | null
  flash.value = e
    ? e.message
    : r?.status === 'queued'
      ? `${b.name} : redémarrage programmé`
      : `${b.name} : ${r?.detail}`
  await load()
}
async function cancel(c: Cmd) {
  const { data, error: e } = await supabase.rpc('cancel_device_command', { p_id: c.id })
  const r = data as { status: string; detail?: string } | null
  flash.value = e ? e.message : r?.status === 'cancelled' ? 'annulée' : (r?.detail ?? '')
  await load()
}

let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  fetchCompanies()
  load()
  timer = setInterval(load, 60_000)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <div class="p-3 sm:p-6 space-y-4" data-testid="staff-updates">
    <header class="space-y-1">
      <h1 class="text-xl font-semibold tracking-tight">
        Mises à jour des box
        <span
          class="ml-2 align-middle font-mono text-[9px] uppercase tracking-widest border border-amber-500/60 text-amber-400 rounded px-1.5 py-0.5"
          >prototype</span
        >
      </h1>
      <p class="text-sm text-muted-foreground max-w-3xl">
        La box télécharge la nouvelle version (~120 Mo, parfois en 4G), l'installe puis redémarre :
        supervision coupée quelques minutes. Chaque étape remonte au contact suivant de la box
        (toutes les 30 min) : compter 1 à 2 h. Pas de retour à une version antérieure.
      </p>
    </header>

    <div class="flex flex-wrap items-center gap-2 text-sm">
      <select
        v-model="filterCompany"
        class="bg-card border border-border rounded-md px-3 py-1.5 text-sm w-full sm:w-auto"
      >
        <option value="all">Toutes les entreprises</option>
        <option v-for="c in companies" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
      <label class="flex items-center gap-2 text-muted-foreground cursor-pointer">
        <input v-model="onlyTodo" type="checkbox" /> seulement celles qui ont quelque chose à faire
      </label>
      <span class="text-xs text-muted-foreground font-mono" data-testid="update-counts">
        {{ counts.available }} à mettre à jour · {{ counts.busy }} en cours · {{ counts.reboot }} à
        redémarrer · {{ counts.uptodate }} à jour · {{ counts.none }} sur site
      </span>
      <span v-if="loading" class="text-xs text-muted-foreground">Chargement…</span>
    </div>
    <p v-if="error" class="text-sm text-offline">{{ error }}</p>
    <p v-if="flash" class="text-sm text-primary" data-testid="update-flash">{{ flash }}</p>

    <div
      v-if="auth.isHexaStaffAdmin && selectable.length"
      class="flex flex-wrap items-center gap-2 text-sm"
    >
      <button
        class="text-xs text-muted-foreground hover:text-signal"
        @click="selected = selected.length === selectable.length ? [] : [...selectable]"
      >
        {{ selected.length === selectable.length ? 'tout décocher' : 'tout cocher' }}
      </button>
      <button
        class="px-3 py-1.5 bg-primary text-primary-foreground rounded-md disabled:opacity-40"
        :disabled="!selected.length"
        data-testid="update-selected"
        @click="confirmIds = [...selected]"
      >
        Mettre à jour la sélection ({{ selected.length }})
      </button>
    </div>

    <ul class="border border-border rounded-md divide-y divide-border/60" data-testid="update-list">
      <li
        v-for="{ b, s } in rows"
        :key="b.id"
        class="flex flex-wrap sm:flex-nowrap items-start sm:items-center gap-x-3 gap-y-1.5 px-3 sm:px-4 py-3"
        data-testid="update-row"
      >
        <input
          v-if="auth.isHexaStaffAdmin"
          v-model="selected"
          type="checkbox"
          :value="b.id"
          :disabled="s.key !== 'available'"
          :class="['mt-1 sm:mt-0', s.key !== 'available' && 'invisible']"
          :aria-label="`sélectionner ${b.name}`"
        />
        <div class="min-w-0 flex-1 sm:flex-none sm:w-64">
          <div class="text-sm font-medium break-words">{{ b.name }}</div>
          <div class="text-[11px] text-muted-foreground">
            {{ companyName.get(b.company_id) ?? '—' }}
          </div>
        </div>
        <div
          class="font-mono text-xs w-full sm:w-52 shrink-0 order-last sm:order-none pl-7 sm:pl-0"
        >
          {{ b.running_version ? `v${b.running_version}` : 'version inconnue' }}
          <span
            v-if="b.pkg_version && b.running_version && b.pkg_version !== b.running_version"
            class="text-muted-foreground"
            >(installée v{{ b.pkg_version }})</span
          >
        </div>
        <div
          class="min-w-0 basis-full sm:basis-auto sm:flex-1 order-last sm:order-none pl-7 sm:pl-0"
        >
          <div :class="['text-sm', TONE[s.tone]]" data-testid="update-state">{{ s.label }}</div>
          <div v-if="s.detail" class="text-xs text-muted-foreground">{{ s.detail }}</div>
          <div v-if="stale(b)" class="text-xs text-amber-400">
            pas de nouvelles de la box depuis {{ ago(b.remote_seen_at).replace('il y a ', '') }}
          </div>
        </div>
        <div v-if="auth.isHexaStaffAdmin" class="flex gap-2 shrink-0 ml-auto">
          <button
            v-if="s.key === 'available'"
            class="px-2.5 py-1 text-xs border border-signal/60 text-signal rounded-md hover:bg-signal/10"
            @click="confirmIds = [b.id]"
          >
            Mettre à jour
          </button>
          <button
            v-if="s.key === 'reboot'"
            class="px-2.5 py-1 text-xs border border-amber-400/60 text-amber-400 rounded-md"
            @click="reboot(b)"
          >
            Redémarrer
          </button>
          <button
            v-if="s.cmd?.state === 'queued'"
            class="px-2.5 py-1 text-xs border border-border rounded-md text-muted-foreground hover:text-offline"
            @click="cancel(s.cmd!)"
          >
            Annuler
          </button>
        </div>
      </li>
      <li v-if="!rows.length && !loading" class="px-4 py-3 text-sm text-muted-foreground">
        {{ onlyTodo ? 'Rien à faire : toutes les box pilotables sont à jour.' : 'Aucune box.' }}
      </li>
    </ul>

    <!-- confirmation -->
    <div
      v-if="confirmIds"
      class="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-3"
      @click.self="confirmIds = null"
    >
      <div
        class="bg-card border border-border rounded-lg p-4 sm:p-5 w-full max-w-md space-y-3"
        data-testid="update-confirm"
      >
        <h3 class="font-semibold">Mettre à jour {{ confirmIds.length }} box ?</h3>
        <ul class="text-sm max-h-48 overflow-y-auto space-y-0.5">
          <li v-for="id in confirmIds" :key="id">
            {{ boxById.get(id)?.name }}
            <span class="font-mono text-xs text-muted-foreground"
              >v{{ boxById.get(id)?.running_version ?? '?' }} → v{{
                boxById.get(id)?.candidate_version
              }}</span
            >
          </li>
        </ul>
        <ul class="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
          <li>la box redémarre à la fin : supervision et alarmes coupées quelques minutes ;</li>
          <li>1 à 2 h avant confirmation, ne pas conclure à un échec avant ;</li>
          <li>pas de retour à la version précédente.</li>
        </ul>
        <div class="flex justify-end gap-2">
          <button class="px-3 py-1.5 text-sm text-muted-foreground" @click="confirmIds = null">
            Annuler
          </button>
          <button
            class="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md disabled:opacity-40"
            :disabled="busy"
            data-testid="update-go"
            @click="runUpdates(confirmIds!)"
          >
            {{ busy ? 'Envoi…' : 'Lancer la mise à jour' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

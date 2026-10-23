<script setup lang="ts">
// PROTOTYPE — Destinataires d'alarme pilotés depuis le portail.
// Le portail stocke l'état VOULU (alarm_contacts + alarm_subscriptions) ; la box rapporte l'état CONSTATÉ
// (bloc notifications de son dernier status). « Envoyer » met en file une commande set_recipients
// servie à la box à son prochain push (~30 min).
import { computed, onMounted, ref, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

type Filters = { info: boolean; warning: boolean; error: boolean }
type Channels = { email: boolean; sms: boolean; call: boolean }
interface Contact {
  id: string
  company_id: string
  name: string
  email: string
  phone: string
  enabled: boolean
  channels: Channels
  schedule_days: string[]
  recipient_id: string | null
}
interface Sub {
  contact_id: string
  device_id: string
  box_recipient_id: string
  filters: Filters
  channels_override: Channels | null
}
interface BoxRecipient {
  id: string
  name: string
  email?: string
  phone?: string
  enabled?: boolean
  filters?: Filters
  channels?: Channels
}
interface Device {
  id: string
  name: string
  remote_seen_at: string | null
  running_version: string | null
  recipients_hash: string | null
  recipients_hash_ref: string | null
  reported: BoxRecipient[] | null
  escalation: {
    mode?: string
    levels?: { name: string; delay_seconds: number; members: string[] }[]
  } | null
  pending: number
  lastAck: { status: string; detail: string | null; at: string | null } | null
}

const DAYS = [
  ['monday', 'L'],
  ['tuesday', 'M'],
  ['wednesday', 'M'],
  ['thursday', 'J'],
  ['friday', 'V'],
  ['saturday', 'S'],
  ['sunday', 'D'],
] as const
const LEVELS: { key: keyof Filters; label: string; cls: string }[] = [
  { key: 'error', label: 'E', cls: 'bg-offline/80 text-white' },
  { key: 'warning', label: 'W', cls: 'bg-amber-500/80 text-black' },
  { key: 'info', label: 'I', cls: 'bg-signal/70 text-black' },
]

const auth = useAuthStore()
const companyId = computed(() => auth.effectiveCompanyId)
const canEdit = computed(() => auth.recipient?.role === 'admin' || auth.isHexaStaffAdmin)

const loading = ref(false)
const flash = ref<string | null>(null)
const contacts = ref<Contact[]>([])
const subs = ref<Sub[]>([])
const devices = ref<Device[]>([])
const showAll = ref(false)
const companyLabel = ref<string | null>(null)

function setFlash(msg: string) {
  flash.value = msg
  setTimeout(() => (flash.value === msg ? (flash.value = null) : null), 4000)
}

async function load() {
  if (!companyId.value) return
  loading.value = true
  try {
    const [c, d] = await Promise.all([
      supabase.from('alarm_contacts').select('*').eq('company_id', companyId.value).order('name'),
      supabase
        .from('devices')
        .select('id, name, remote_seen_at, running_version, recipients_hash, recipients_hash_ref')
        .eq('company_id', companyId.value)
        .order('name'),
    ])
    if (c.error) throw c.error
    if (d.error) throw d.error
    contacts.value = (c.data ?? []) as unknown as Contact[]
    const co = await supabase
      .from('companies')
      .select('name')
      .eq('id', companyId.value)
      .maybeSingle()
    companyLabel.value = co.data?.name ?? null
    const ids = (d.data ?? []).map((x) => x.id)
    const [s, r, cmd] = await Promise.all([
      supabase
        .from('alarm_subscriptions')
        .select('contact_id, device_id, box_recipient_id, filters, channels_override')
        .in('device_id', ids),
      supabase
        .from('reports')
        .select('device_id, notifications:payload->notifications')
        .eq('type', 'status')
        .in('device_id', ids),
      supabase
        .from('device_commands')
        .select('device_id, state, ack_status, ack_detail, acked_at, issued_at, type')
        .in('device_id', ids)
        .in('type', ['set_recipients', 'set_escalation'])
        .order('issued_at', { ascending: false }),
    ])
    if (s.error) throw s.error
    subs.value = (s.data ?? []) as unknown as Sub[]
    type Notif = { recipients?: BoxRecipient[]; mode?: string; escalation?: Device['escalation'] }
    const notif = new Map<string, Notif | null>()
    for (const row of (r.data ?? []) as unknown as {
      device_id: string
      notifications: Notif | null
    }[])
      notif.set(row.device_id, row.notifications)
    const cmds = cmd.data ?? []
    devices.value = (d.data ?? []).map((x): Device => {
      const n = notif.get(x.id)
      const mine = cmds.filter((k) => k.device_id === x.id)
      const acked = mine.find((k) => k.ack_status)
      return {
        ...x,
        reported: n ? ((n.recipients ?? []) as BoxRecipient[]) : null,
        escalation: n?.escalation ? { ...n.escalation, mode: n.mode } : null,
        pending: mine.filter((k) => ['queued', 'sent', 'in_progress'].includes(k.state)).length,
        lastAck: acked
          ? { status: acked.ack_status ?? '', detail: acked.ack_detail, at: acked.acked_at }
          : null,
      }
    })
  } catch (e) {
    setFlash(`Erreur : ${(e as Error).message}`)
  } finally {
    loading.value = false
  }
}
onMounted(load)
watch(companyId, load)

// --- lecture -------------------------------------------------------------------------------
const subKey = (c: string, d: string) => `${c}|${d}`
const subMap = computed(
  () => new Map(subs.value.map((s) => [subKey(s.contact_id, s.device_id), s])),
)
const contactById = computed(() => new Map(contacts.value.map((c) => [c.id, c])))

const visibleDevices = computed(() =>
  showAll.value
    ? devices.value
    : devices.value.filter(
        (d) => d.reported !== null || subs.value.some((s) => s.device_id === d.id),
      ),
)

// Écart portail ↔ box : on compare la liste voulue et la liste rapportée, destinataire par destinataire.
function same(a: unknown, b: unknown) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}
function norm(f?: Filters | Channels) {
  return f ? Object.fromEntries(Object.entries(f).sort()) : null
}
function diffCount(d: Device): number {
  const wanted = subs.value.filter((s) => s.device_id === d.id)
  const got = new Map((d.reported ?? []).map((r) => [r.id, r]))
  let n = 0
  for (const s of wanted) {
    const c = contactById.value.get(s.contact_id)
    const r = got.get(s.box_recipient_id)
    if (!c || !r) {
      n++
      continue
    }
    if (r.name !== c.name || (r.email ?? '') !== c.email || !same(norm(r.filters), norm(s.filters)))
      n++
    else if (
      !same(norm(r.channels), norm(s.channels_override ?? c.channels)) ||
      (r.enabled ?? true) !== c.enabled
    )
      n++
    got.delete(s.box_recipient_id)
  }
  return n + got.size
}

type SyncState = { label: string; cls: string; hint: string }
function syncState(d: Device): SyncState {
  if (d.pending)
    return {
      label: 'en attente',
      cls: 'text-amber-400',
      hint: 'commande envoyée au prochain push de la box (~30 min)',
    }
  if (d.recipients_hash && d.recipients_hash_ref && d.recipients_hash !== d.recipients_hash_ref)
    return {
      label: 'modifié sur la box',
      cls: 'text-offline',
      hint: 'la liste a été changée localement sur la box',
    }
  if (d.lastAck && !['ok', 'duplicate', 'pending'].includes(d.lastAck.status) && diffCount(d))
    return { label: 'refusé', cls: 'text-offline', hint: d.lastAck.detail ?? '' }
  if (d.reported === null)
    return {
      label: 'pas de config reçue',
      cls: 'text-muted-foreground',
      hint: "la box n'envoie pas sa configuration de notifications",
    }
  const n = diffCount(d)
  if (n)
    return {
      label: `${n} écart${n > 1 ? 's' : ''}`,
      cls: 'text-amber-400',
      hint: 'le portail diffère de la box : « envoyer » pour appliquer',
    }
  return { label: 'à jour', cls: 'text-online', hint: 'identique à la configuration de la box' }
}
function pilotable(d: Device) {
  return !!d.remote_seen_at
}

// --- édition --------------------------------------------------------------------------------
async function toggleFilter(contact: Contact, d: Device, key: keyof Filters) {
  if (!canEdit.value) return
  const s = subMap.value.get(subKey(contact.id, d.id))
  if (!s) {
    const filters = { info: false, warning: true, error: true }
    const { data, error } = await supabase
      .from('alarm_subscriptions')
      .insert({ contact_id: contact.id, device_id: d.id, filters })
      .select('contact_id, device_id, box_recipient_id, filters, channels_override')
      .single()
    if (error) return setFlash(`Erreur : ${error.message}`)
    subs.value.push(data as Sub)
    return
  }
  const filters = { ...s.filters, [key]: !s.filters[key] }
  if (!filters.info && !filters.warning && !filters.error) {
    // plus aucun type : on retire l'abonnement
    const { error } = await supabase
      .from('alarm_subscriptions')
      .delete()
      .match({ contact_id: contact.id, device_id: d.id })
    if (error) return setFlash(`Erreur : ${error.message}`)
    subs.value = subs.value.filter((x) => x !== s)
    return
  }
  const { error } = await supabase
    .from('alarm_subscriptions')
    .update({ filters })
    .match({ contact_id: contact.id, device_id: d.id })
  if (error) return setFlash(`Erreur : ${error.message}`)
  s.filters = filters
}

async function addToAll(contact: Contact) {
  const targets = visibleDevices.value.filter((d) => !subMap.value.has(subKey(contact.id, d.id)))
  if (!targets.length) return setFlash(`${contact.name} est déjà sur toutes les box affichées`)
  if (!confirm(`Ajouter ${contact.name} (erreurs + warnings) sur ${targets.length} box ?`)) return
  const rows = targets.map((d) => ({
    contact_id: contact.id,
    device_id: d.id,
    filters: { info: false, warning: true, error: true },
  }))
  const { data, error } = await supabase
    .from('alarm_subscriptions')
    .insert(rows)
    .select('contact_id, device_id, box_recipient_id, filters, channels_override')
  if (error) return setFlash(`Erreur : ${error.message}`)
  subs.value.push(...((data ?? []) as Sub[]))
  setFlash(`${contact.name} ajouté sur ${targets.length} box`)
}

const copyFrom = ref<Device | null>(null)
const copyTo = ref<string[]>([])
async function doCopy() {
  const src = copyFrom.value
  if (!src || !copyTo.value.length) return
  const srcSubs = subs.value.filter((s) => s.device_id === src.id)
  const rows = copyTo.value.flatMap((dev) =>
    srcSubs.map((s) => ({ contact_id: s.contact_id, device_id: dev, filters: s.filters })),
  )
  // remplace la liste des box cibles par celle de la box source
  const del = await supabase.from('alarm_subscriptions').delete().in('device_id', copyTo.value)
  if (del.error) return setFlash(`Erreur : ${del.error.message}`)
  if (rows.length) {
    const { error } = await supabase.from('alarm_subscriptions').insert(rows)
    if (error) return setFlash(`Erreur : ${error.message}`)
  }
  setFlash(`Destinataires de ${src.name} copiés sur ${copyTo.value.length} box (à envoyer)`)
  copyFrom.value = null
  copyTo.value = []
  await load()
}

async function send(d: Device, force = false) {
  if (!pilotable(d)) return
  const { data, error } = await supabase.rpc('queue_alarm_sync', { p_device: d.id, p_force: force })
  if (error) return setFlash(`Erreur : ${error.message}`)
  const res = data as { status: string; detail?: string }
  if (res.status === 'conflict') {
    if (confirm(`${d.name} : ${res.detail}.\n\nImposer quand même la liste du portail ?`))
      return send(d, true)
    return
  }
  if (res.status !== 'queued') return setFlash(`${d.name} : ${res.detail ?? res.status}`)
  setFlash(`${d.name} : envoi programmé (appliqué au prochain push de la box)`)
  await load()
}

async function importFromBoxes() {
  if (!companyId.value) return
  const { data, error } = await supabase.rpc('import_alarm_config', { p_company: companyId.value })
  if (error) return setFlash(`Erreur : ${error.message}`)
  const r = data as { devices: number; contacts_created: number; subscriptions_created: number }
  setFlash(
    `Import : ${r.devices} box lues, ${r.contacts_created} contacts et ${r.subscriptions_created} abonnements créés`,
  )
  await load()
}

// --- fiche contact ---------------------------------------------------------------------------
const editing = ref<Contact | null>(null)
const draft = ref<Contact | null>(null)
function openContact(c: Contact | null) {
  const base: Contact = c ?? {
    id: '',
    company_id: companyId.value ?? '',
    name: '',
    email: '',
    phone: '',
    enabled: true,
    channels: { email: true, sms: false, call: false },
    schedule_days: DAYS.map((d) => d[0]),
    recipient_id: null,
  }
  editing.value = c
  draft.value = JSON.parse(JSON.stringify(base))
}
const draftBoxes = computed(() =>
  draft.value?.id
    ? subs.value
        .filter((s) => s.contact_id === draft.value!.id)
        .map((s) => ({ s, d: devices.value.find((x) => x.id === s.device_id) }))
    : [],
)
function toggleDay(day: string) {
  if (!draft.value) return
  const set = new Set(draft.value.schedule_days)
  if (set.has(day)) set.delete(day)
  else set.add(day)
  draft.value.schedule_days = DAYS.map((d) => d[0]).filter((d) => set.has(d))
}
async function saveContact() {
  const c = draft.value
  if (!c || !c.name.trim()) return
  const row = {
    company_id: c.company_id,
    name: c.name.trim(),
    email: c.email.trim(),
    phone: c.phone.trim(),
    enabled: c.enabled,
    channels: c.channels,
    schedule_days: c.schedule_days,
    updated_at: new Date().toISOString(),
  }
  const q = c.id
    ? supabase.from('alarm_contacts').update(row).eq('id', c.id)
    : supabase.from('alarm_contacts').insert(row)
  const { error } = await q
  if (error) return setFlash(`Erreur : ${error.message}`)
  setFlash(`${row.name} enregistré`)
  draft.value = null
  await load()
}
async function deleteContact() {
  const c = draft.value
  if (!c?.id || !confirm(`Supprimer ${c.name} de l'annuaire et de toutes ses box ?`)) return
  const { error } = await supabase.from('alarm_contacts').delete().eq('id', c.id)
  if (error) return setFlash(`Erreur : ${error.message}`)
  draft.value = null
  await load()
}
const channelLabel = (ch: Channels) =>
  [ch.email && 'mail', ch.sms && 'SMS', ch.call && 'appel'].filter(Boolean).join(' · ') ||
  'aucun canal'
const memberName = (d: Device, id: string) =>
  (d.reported ?? []).find((r) => r.id === id)?.name ?? id

const escalationDevices = computed(() =>
  visibleDevices.value.filter((d) => d.escalation?.levels?.length),
)
</script>

<template>
  <div class="p-6 space-y-5" data-testid="alarm-recipients">
    <header class="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <h1 class="text-xl font-semibold">
          Destinataires d'alarme
          <span
            class="ml-2 align-middle font-mono text-[9px] uppercase tracking-widest border border-amber-500/60 text-amber-400 rounded px-1.5 py-0.5"
            >prototype</span
          >
        </h1>
        <p class="text-sm text-muted-foreground max-w-3xl">
          Qui reçoit les alarmes de quelles box, pour {{ companyLabel ?? '—' }}. Cliquer sur E / W /
          I (erreur, warning, info) pour changer les types reçus, puis « envoyer » : la box applique
          la liste à son prochain envoi (~30 min).
        </p>
      </div>
      <div v-if="canEdit" class="flex gap-2 flex-wrap">
        <button
          class="px-3 py-2 text-sm border border-border rounded-md hover:border-signal"
          @click="importFromBoxes"
        >
          Importer depuis les box
        </button>
        <button
          class="px-3 py-2 text-sm bg-primary text-primary-foreground rounded-md"
          @click="openContact(null)"
        >
          + Contact
        </button>
      </div>
    </header>

    <div class="flex items-center gap-4 text-sm">
      <label class="flex items-center gap-2 text-muted-foreground cursor-pointer">
        <input v-model="showAll" type="checkbox" /> afficher toutes les box ({{ devices.length }})
      </label>
      <span v-if="loading" class="text-muted-foreground">Chargement…</span>
      <span v-if="flash" class="text-primary">{{ flash }}</span>
    </div>

    <p v-if="!loading && !contacts.length" class="text-sm text-muted-foreground">
      Aucun contact d'alarme. « Importer depuis les box » reprend les destinataires déjà configurés
      sur les box.
    </p>

    <!-- Matrice box × contacts -->
    <div v-if="contacts.length" class="border border-border rounded-md overflow-x-auto">
      <table class="text-sm w-full border-collapse" data-testid="alarm-matrix">
        <thead>
          <tr class="bg-secondary/30">
            <th class="text-left font-normal px-3 py-2 sticky left-0 bg-card min-w-[230px]">
              <span class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
                >Box</span
              >
            </th>
            <th
              v-for="c in contacts"
              :key="c.id"
              class="px-2 py-2 font-normal align-bottom min-w-[96px]"
            >
              <button
                class="text-left w-full hover:text-signal"
                :title="`${c.email} ${c.phone}`"
                @click="openContact(c)"
              >
                <div
                  :class="[
                    'text-xs font-medium leading-tight',
                    !c.enabled && 'line-through text-muted-foreground',
                  ]"
                >
                  {{ c.name }}
                </div>
                <div class="font-mono text-[9px] text-muted-foreground">
                  {{ channelLabel(c.channels) }}
                </div>
              </button>
              <button
                v-if="canEdit"
                class="mt-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground hover:text-signal"
                @click="addToAll(c)"
              >
                + toutes
              </button>
            </th>
            <th class="px-3 py-2 font-normal text-left min-w-[270px]">
              <span class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
                >Synchro</span
              >
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="d in visibleDevices"
            :key="d.id"
            class="border-t border-border/60 hover:bg-secondary/10"
          >
            <td class="px-3 py-2 sticky left-0 bg-card">
              <div class="font-medium text-xs">{{ d.name }}</div>
              <div class="font-mono text-[9px] text-muted-foreground">
                {{ d.running_version ? `v${d.running_version}` : '' }}
                <span
                  v-if="!pilotable(d)"
                  title="pas de pilotage à distance reçu (firmware ou option « Enable remote management »)"
                  >· non pilotable</span
                >
              </div>
            </td>
            <td v-for="c in contacts" :key="c.id" class="px-2 py-2 text-center">
              <div class="inline-flex gap-0.5">
                <template v-if="subMap.get(subKey(c.id, d.id))">
                  <button
                    v-for="l in LEVELS"
                    :key="l.key"
                    :disabled="!canEdit"
                    :class="[
                      'w-5 h-5 rounded text-[10px] font-mono transition',
                      subMap.get(subKey(c.id, d.id))!.filters[l.key]
                        ? l.cls
                        : 'bg-secondary/40 text-muted-foreground/40',
                    ]"
                    :title="l.key"
                    @click="toggleFilter(c, d, l.key)"
                  >
                    {{ l.label }}
                  </button>
                </template>
                <button
                  v-else-if="canEdit"
                  class="w-5 h-5 rounded text-xs text-muted-foreground/40 hover:text-signal hover:bg-secondary/40"
                  title="ajouter (erreurs + warnings)"
                  @click="toggleFilter(c, d, 'error')"
                >
                  +
                </button>
              </div>
            </td>
            <td class="px-3 py-2">
              <div class="flex items-center gap-2 flex-wrap">
                <span
                  :class="['font-mono text-[10px] uppercase tracking-wider', syncState(d).cls]"
                  :title="syncState(d).hint"
                >
                  {{ syncState(d).label }}
                </span>
                <template v-if="canEdit">
                  <button
                    v-if="pilotable(d) && subs.some((s) => s.device_id === d.id)"
                    class="font-mono text-[9px] uppercase tracking-wider border border-border px-2 py-0.5 rounded hover:border-signal"
                    @click="send(d)"
                  >
                    envoyer
                  </button>
                  <button
                    v-if="subs.some((s) => s.device_id === d.id)"
                    class="font-mono text-[9px] uppercase tracking-wider text-muted-foreground hover:text-signal"
                    @click="((copyFrom = d), (copyTo = []))"
                  >
                    copier vers…
                  </button>
                </template>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Escalades rapportées par les box (lecture seule dans ce prototype) -->
    <section v-if="escalationDevices.length" class="space-y-2">
      <h2 class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        Escalade (configurée sur la box)
      </h2>
      <div
        v-for="d in escalationDevices"
        :key="d.id"
        class="border border-border rounded-md bg-card/40 p-4"
      >
        <div class="text-sm font-medium mb-2">{{ d.name }}</div>
        <ol class="flex flex-wrap gap-2 items-center text-xs">
          <template v-for="(lv, i) in d.escalation!.levels" :key="i">
            <li class="border border-border rounded px-2 py-1">
              <div class="font-mono text-[9px] uppercase text-muted-foreground">
                {{ lv.name }} ·
                {{ i === 0 ? 'immédiat' : `+${Math.round(lv.delay_seconds / 60)} min` }}
              </div>
              <div>{{ lv.members.map((m) => memberName(d, m)).join(', ') }}</div>
            </li>
            <span v-if="i < d.escalation!.levels!.length - 1" class="text-muted-foreground">→</span>
          </template>
        </ol>
      </div>
    </section>

    <!-- Copier vers… -->
    <div
      v-if="copyFrom"
      class="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4"
      @click.self="copyFrom = null"
    >
      <div class="bg-card border border-border rounded-md p-5 w-full max-w-md space-y-3">
        <h3 class="font-semibold">Copier les destinataires de {{ copyFrom.name }}</h3>
        <p class="text-xs text-muted-foreground">
          La liste des box cochées sera remplacée par celle-ci (à envoyer ensuite).
        </p>
        <div class="max-h-72 overflow-y-auto space-y-1">
          <label
            v-for="d in devices.filter((x) => x.id !== copyFrom!.id)"
            :key="d.id"
            class="flex items-center gap-2 text-sm"
          >
            <input v-model="copyTo" type="checkbox" :value="d.id" /> {{ d.name }}
          </label>
        </div>
        <div class="flex justify-end gap-2">
          <button class="px-3 py-1.5 text-sm" @click="copyFrom = null">Annuler</button>
          <button
            class="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md"
            :disabled="!copyTo.length"
            @click="doCopy"
          >
            Copier sur {{ copyTo.length }} box
          </button>
        </div>
      </div>
    </div>

    <!-- Fiche contact -->
    <div
      v-if="draft"
      class="fixed inset-0 z-40 bg-black/50 flex justify-end"
      @click.self="draft = null"
    >
      <aside
        class="bg-card border-l border-border w-full max-w-md h-full overflow-y-auto p-5 space-y-4"
        data-testid="contact-drawer"
      >
        <h3 class="font-semibold">{{ draft.id ? draft.name : 'Nouveau contact' }}</h3>
        <label class="block text-sm"
          >Nom
          <input
            v-model="draft.name"
            :disabled="!canEdit"
            class="mt-1 w-full border border-border bg-secondary/30 rounded-md px-3 py-2"
          />
        </label>
        <label class="block text-sm"
          >Email
          <input
            v-model="draft.email"
            :disabled="!canEdit"
            type="email"
            class="mt-1 w-full border border-border bg-secondary/30 rounded-md px-3 py-2"
          />
        </label>
        <label class="block text-sm"
          >Téléphone
          <input
            v-model="draft.phone"
            :disabled="!canEdit"
            class="mt-1 w-full border border-border bg-secondary/30 rounded-md px-3 py-2"
          />
        </label>
        <div class="text-sm">
          Canaux
          <div class="flex gap-4 mt-1">
            <label
              v-for="ch in ['email', 'sms', 'call'] as const"
              :key="ch"
              class="flex items-center gap-1"
            >
              <input v-model="draft.channels[ch]" :disabled="!canEdit" type="checkbox" />
              {{ { email: 'mail', sms: 'SMS', call: 'appel' }[ch] }}
            </label>
          </div>
        </div>
        <div class="text-sm">
          Jours de réception
          <div class="flex gap-1 mt-1">
            <button
              v-for="[day, l] in DAYS"
              :key="day"
              :disabled="!canEdit"
              :class="[
                'w-8 h-8 rounded text-xs',
                draft.schedule_days.includes(day)
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary/40 text-muted-foreground',
              ]"
              @click="toggleDay(day)"
            >
              {{ l }}
            </button>
          </div>
        </div>
        <label class="flex items-center gap-2 text-sm">
          <input v-model="draft.enabled" :disabled="!canEdit" type="checkbox" /> actif
        </label>
        <div class="text-sm">
          Accès au portail :
          <span v-if="draft.recipient_id" class="text-online">oui</span>
          <span v-else class="text-muted-foreground"
            >non <span class="text-xs">(invitation : étape suivante du prototype)</span></span
          >
        </div>
        <div v-if="draftBoxes.length" class="text-sm">
          Box ({{ draftBoxes.length }})
          <ul class="mt-1 space-y-1">
            <li
              v-for="{ s, d } in draftBoxes"
              :key="s.device_id"
              class="flex justify-between text-xs"
            >
              <span>{{ d?.name }}</span>
              <span class="font-mono">{{
                LEVELS.filter((l) => s.filters[l.key])
                  .map((l) => l.label)
                  .join(' ')
              }}</span>
            </li>
          </ul>
        </div>
        <div v-if="canEdit" class="flex justify-between pt-2">
          <button v-if="draft.id" class="text-sm text-offline" @click="deleteContact">
            Supprimer
          </button>
          <span v-else />
          <div class="flex gap-2">
            <button class="px-3 py-1.5 text-sm" @click="draft = null">Annuler</button>
            <button
              class="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md"
              @click="saveContact"
            >
              Enregistrer
            </button>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

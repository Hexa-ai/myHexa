<script setup lang="ts">
// Parc des box (staff Hexa-AI) : tableau éditable, réception de lot, livraison, retours, garantie, export / réimport, journal
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useStaffCompanies } from '@/composables/useStaffCompanies'
import {
  useFleet,
  sb,
  pgMsg,
  normField,
  fmtDay,
  warrantyOf,
  warrantyText,
  toCsv,
  STATUS_LABEL,
  type EditableField,
  type FleetDevice,
  type FleetStatus,
} from '@/composables/useFleet'
import FleetDeliverDialog from '@/components/fleet/FleetDeliverDialog.vue'
import FleetReceiveDialog from '@/components/fleet/FleetReceiveDialog.vue'
import FleetImportDialog from '@/components/fleet/FleetImportDialog.vue'
import FleetJournal from '@/components/fleet/FleetJournal.vue'

const auth = useAuthStore()
const router = useRouter()
const canEdit = computed(() => auth.isHexaStaffAdmin)
const { companies, fetch: fetchCompanies } = useStaffCompanies()
const { devices, defaultWarranty, loading, error, load, setDefaultWarranty, updateField } =
  useFleet()

const hexaId = computed(() => companies.value.find((c) => c.is_hexa_internal)?.id ?? '')
const companyName = (id: string) => companies.value.find((c) => c.id === id)?.name ?? '—'

// --- filtres ---
const q = ref('')
const fStatus = ref<'all' | FleetStatus>('all')
const fCompany = ref('all')
const fWarranty = ref<'all' | 'ok' | 'soon' | 'expired'>('all')
const fAnomaly = ref(false)

const dupMac = computed(() => {
  const m = new Map<string, number>()
  for (const d of devices.value) {
    const k = d.mac_eth0?.trim().toLowerCase()
    if (k) m.set(k, (m.get(k) ?? 0) + 1)
  }
  return m
})
const dupSn = computed(() => {
  const m = new Map<string, number>()
  for (const d of devices.value) {
    const k = d.serial_number?.trim().toUpperCase()
    if (k) m.set(k, (m.get(k) ?? 0) + 1)
  }
  return m
})
const isDupMac = (d: FleetDevice) =>
  !!d.mac_eth0 && dupMac.value.get(d.mac_eth0.trim().toLowerCase())! > 1
const isDupSn = (d: FleetDevice) =>
  !!d.serial_number && dupSn.value.get(d.serial_number.trim().toUpperCase())! > 1
const badMac = (d: FleetDevice) => !!d.mac_eth0 && d.mac_eth0 !== d.mac_eth0.trim()
function anomalies(d: FleetDevice): string[] {
  const a: string[] = []
  if (!d.mac_eth0) a.push('sans MAC')
  else if (badMac(d)) a.push('MAC avec espace')
  if (isDupMac(d)) a.push('MAC en double')
  if (!d.serial_number) a.push('sans n° de série')
  if (isDupSn(d)) a.push('n° de série en double')
  if (d.fleet_status === 'delivered' && !d.invoice_number) a.push('sans facture')
  if (d.fleet_status === 'delivered' && !d.delivered_at) a.push('sans date de livraison')
  return a
}

const w = (d: FleetDevice) => warrantyOf(d, defaultWarranty.value)

const filtered = computed(() => {
  const s = q.value.trim().toLowerCase()
  return devices.value.filter((d) => {
    if (fStatus.value !== 'all' && d.fleet_status !== fStatus.value) return false
    if (fCompany.value !== 'all' && d.company_id !== fCompany.value) return false
    if (fWarranty.value !== 'all' && w(d).state !== fWarranty.value) return false
    if (fAnomaly.value && !anomalies(d).length) return false
    if (!s) return true
    return [
      d.name,
      d.serial_number,
      d.mac_eth0,
      d.invoice_number,
      companyName(d.company_id),
      d.supplier,
      d.purchase_ref,
    ].some((x) => x?.toLowerCase().includes(s))
  })
})

const counts = computed(() => {
  const c: Record<string, number> = {
    stock: 0,
    delivered: 0,
    return: 0,
    scrapped: 0,
    soon: 0,
    anomalies: 0,
  }
  for (const d of devices.value) {
    c[d.fleet_status]++
    if (w(d).state === 'soon') c.soon++
    if (anomalies(d).length) c.anomalies++
  }
  return c
})

// --- sélection ---
const selected = ref<Set<string>>(new Set())
const selDevices = computed(() => devices.value.filter((d) => selected.value.has(d.id)))
const allChecked = computed(
  () => filtered.value.length > 0 && filtered.value.every((d) => selected.value.has(d.id)),
)
function toggle(id: string) {
  const s = new Set(selected.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  selected.value = s
}
function toggleAll() {
  selected.value = allChecked.value ? new Set() : new Set(filtered.value.map((d) => d.id))
}

// --- édition en ligne ---
const editing = ref<{ id: string; f: EditableField } | null>(null)
const draft = ref('')
const cellError = ref<{ id: string; f: string; msg: string } | null>(null)
const saved = ref<string | null>(null)

function startEdit(d: FleetDevice, f: EditableField) {
  if (!canEdit.value) return
  editing.value = { id: d.id, f }
  const v = d[f]
  draft.value =
    v === null || v === undefined ? '' : f.endsWith('_at') ? fmtDay(String(v)) : String(v).trim()
  cellError.value = null
  nextTick(() => {
    const el = document.querySelector<HTMLInputElement>('[data-testid=cell-input]')
    el?.focus()
    el?.select()
  })
}
async function commit() {
  const e = editing.value
  if (!e) return
  const d = devices.value.find((x) => x.id === e.id)
  editing.value = null
  if (!d) return
  const [v, err] = normField(e.f, draft.value)
  if (err) {
    cellError.value = { id: e.id, f: e.f, msg: err }
    return
  }
  if (String(v ?? '') === String(d[e.f] ?? '')) return
  try {
    await updateField(e.id, e.f, v)
    saved.value = e.id + e.f
    setTimeout(() => (saved.value = null), 1200)
  } catch (x) {
    cellError.value = { id: e.id, f: e.f, msg: pgMsg(x) }
  }
}
function cancelEdit() {
  editing.value = null
}
const isEditing = (d: FleetDevice, f: EditableField) =>
  editing.value?.id === d.id && editing.value.f === f
const errOf = (d: FleetDevice, f: EditableField) =>
  cellError.value?.id === d.id && cellError.value.f === f ? cellError.value.msg : ''

// --- actions ---
const dialog = ref<'deliver' | 'receive' | 'import' | null>(null)
const journal = ref<FleetDevice | null>(null)
const notice = ref<string | null>(null)
function flash(m: string) {
  notice.value = m
  setTimeout(() => (notice.value = null), 4000)
}

async function addRow(from?: FleetDevice) {
  const { data, error: e } = await sb
    .from('devices')
    .insert({
      name: from?.name ?? 'Stock',
      company_id: hexaId.value,
      fleet_status: 'stock',
      received_at: from?.received_at ?? new Date().toISOString().slice(0, 10),
      supplier: from?.supplier ?? null,
      purchase_ref: from?.purchase_ref ?? null,
      os_version: from?.os_version ?? null,
      has_battery: from?.has_battery ?? false,
      has_supercap: from?.has_supercap ?? false,
    })
    .select('id')
    .single()
  if (e) {
    flash(pgMsg(e))
    return
  }
  await load()
  fStatus.value = 'all'
  q.value = ''
  const d = devices.value.find((x) => x.id === data.id)
  if (d) startEdit(d, 'serial_number')
}

async function toStock(status: 'stock' | 'return' | 'scrapped') {
  const ids = selDevices.value.map((d) => d.id)
  const label = {
    stock: 'remettre en stock',
    return: 'passer en retour / RMA',
    scrapped: 'mettre au rebut',
  }[status]
  const reason = window.prompt(
    `${label} ${ids.length} box ? Elles reviennent chez Hexa-AI ; l'ancien client et la facture restent dans le journal.\nMotif (facultatif) :`,
    '',
  )
  if (reason === null) return
  const { error: e } = await sb.rpc('fleet_to_stock', {
    p_ids: ids,
    p_status: status,
    p_note: reason || null,
  })
  if (e) {
    flash(pgMsg(e))
    return
  }
  selected.value = new Set()
  await load()
  flash(`${ids.length} box : ${STATUS_LABEL[status].toLowerCase()}`)
}

function exportCsv() {
  const rows = selDevices.value.length ? selDevices.value : filtered.value
  const blob = new Blob([toCsv(rows, companyName)], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `parc-box-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

async function editDefaultWarranty() {
  const v = window.prompt(
    'Durée de garantie par défaut (mois), modifiable box par box :',
    String(defaultWarranty.value),
  )
  if (v === null) return
  const n = Number(v)
  if (!Number.isInteger(n) || n < 0 || n > 240) return flash('Durée invalide')
  try {
    await setDefaultWarranty(n)
  } catch (x) {
    flash(pgMsg(x))
  }
}

async function onDone(msg: string) {
  dialog.value = null
  selected.value = new Set()
  await Promise.all([load(), fetchCompanies()])
  flash(msg)
}

const COLS: { f: EditableField; label: string; cls: string }[] = [
  { f: 'serial_number', label: 'N° de série', cls: 'font-mono w-[120px]' },
  { f: 'mac_eth0', label: 'MAC eth0', cls: 'font-mono w-[150px]' },
  { f: 'name', label: 'Nom', cls: 'min-w-[140px]' },
  { f: 'invoice_number', label: 'Facture', cls: 'font-mono w-[110px]' },
  { f: 'delivered_at', label: 'Livraison', cls: 'font-mono w-[96px]' },
  { f: 'warranty_months', label: 'Durée (mois)', cls: 'font-mono w-[70px]' },
]
const show = (d: FleetDevice, f: EditableField) => {
  const v = d[f]
  return v === null || v === undefined || v === ''
    ? ''
    : f.endsWith('_at')
      ? fmtDay(String(v))
      : String(v)
}
const STATUS_CLS: Record<FleetStatus, string> = {
  stock: 'bg-secondary text-foreground',
  delivered: 'bg-signal-soft text-signal',
  return: 'bg-amber-500/15 text-amber-600',
  scrapped: 'bg-offline-soft text-offline',
}
const BTN =
  'font-mono text-[10px] uppercase tracking-wider border border-border px-3 py-1.5 rounded-md hover:bg-secondary transition'
const INP = 'bg-card border border-border rounded-md px-3 py-1.5 text-sm'
const TH =
  'text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-2 py-2'
const W_CLS = {
  none: '',
  ok: 'text-signal',
  soon: 'text-amber-600',
  expired: 'text-muted-foreground',
}

onMounted(() => {
  fetchCompanies()
  load()
})
</script>

<template>
  <div class="p-4 sm:p-6 space-y-4">
    <header class="flex items-start justify-between flex-wrap gap-3">
      <div>
        <h1 class="text-xl font-semibold tracking-tight">Parc des box</h1>
        <p class="text-sm text-muted-foreground" data-testid="fleet-counts">
          {{ devices.length }} box · {{ counts.stock }} en stock · {{ counts.delivered }} livrées
          <span v-if="counts.return"> · {{ counts.return }} en retour</span>
          <span v-if="counts.scrapped"> · {{ counts.scrapped }} au rebut</span>
          · garantie par défaut
          <button
            class="underline decoration-dotted hover:text-signal"
            :disabled="!canEdit"
            data-testid="fleet-default-warranty"
            @click="editDefaultWarranty"
          >
            {{ defaultWarranty }} mois
          </button>
        </p>
      </div>
      <div v-if="canEdit" class="flex flex-wrap gap-2">
        <button
          :class="[BTN, 'border-signal/50 text-signal']"
          data-testid="fleet-receive-open"
          @click="dialog = 'receive'"
        >
          Réception d'un lot
        </button>
        <button :class="BTN" data-testid="fleet-add" @click="addRow()">Ajouter une ligne</button>
        <button :class="BTN" data-testid="fleet-export" @click="exportCsv">Exporter</button>
        <button :class="BTN" data-testid="fleet-import-open" @click="dialog = 'import'">
          Réimporter
        </button>
      </div>
    </header>

    <div class="flex flex-wrap gap-2 items-center">
      <input
        v-model="q"
        data-testid="fleet-search"
        :class="[INP, 'w-56']"
        placeholder="N° de série, MAC, facture, client…"
      />
      <select v-model="fStatus" data-testid="fleet-status" :class="INP">
        <option value="all">Tous statuts</option>
        <option v-for="(l, k) in STATUS_LABEL" :key="k" :value="k">{{ l }}</option>
      </select>
      <select v-model="fCompany" :class="INP">
        <option value="all">Toutes les entreprises</option>
        <option v-for="c in companies" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
      <select v-model="fWarranty" data-testid="fleet-warranty" :class="INP">
        <option value="all">Garantie : toutes</option>
        <option value="ok">Sous garantie</option>
        <option value="soon">Expire dans les 3 mois ({{ counts.soon }})</option>
        <option value="expired">Hors garantie</option>
      </select>
      <label class="inline-flex items-center gap-1.5 text-sm">
        <input v-model="fAnomaly" type="checkbox" data-testid="fleet-anomalies" /> À compléter ({{
          counts.anomalies
        }})
      </label>
    </div>

    <div
      v-if="canEdit && selected.size"
      class="sticky top-0 z-10 flex flex-wrap items-center gap-2 border border-signal/40 bg-background rounded-md px-3 py-2"
      data-testid="fleet-selection"
    >
      <span class="text-sm">{{ selected.size }} sélectionnée(s)</span>
      <button
        :class="[BTN, 'border-signal/50 text-signal']"
        data-testid="fleet-deliver-open"
        @click="dialog = 'deliver'"
      >
        Livrer
      </button>
      <button :class="BTN" data-testid="fleet-to-stock" @click="toStock('stock')">
        Remettre en stock
      </button>
      <button :class="BTN" @click="toStock('return')">Retour / RMA</button>
      <button :class="BTN" @click="toStock('scrapped')">Rebut</button>
      <button
        v-if="selected.size === 1"
        :class="BTN"
        data-testid="fleet-duplicate"
        @click="addRow(selDevices[0])"
      >
        Dupliquer
      </button>
      <button
        class="ml-auto text-xs text-muted-foreground hover:text-foreground"
        @click="selected = new Set()"
      >
        Désélectionner
      </button>
    </div>

    <p v-if="notice" class="text-sm text-signal" data-testid="fleet-notice">{{ notice }}</p>
    <p v-if="loading && !devices.length" class="text-sm text-muted-foreground">Chargement…</p>
    <p v-if="error" class="text-sm text-offline">{{ error }}</p>

    <div class="border border-border rounded-md bg-card/40 overflow-x-auto">
      <table class="w-full text-sm" data-testid="fleet-table">
        <thead class="bg-card/60 border-b border-border">
          <tr>
            <th v-if="canEdit" class="px-2 py-2 w-8">
              <input type="checkbox" :checked="allChecked" @change="toggleAll" />
            </th>
            <th v-for="c in COLS" :key="c.f" :class="TH">{{ c.label }}</th>
            <th :class="TH">Entreprise</th>
            <th :class="TH">Statut</th>
            <th :class="TH">Garantie</th>
            <th :class="[TH, 'w-8']"></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="d in filtered"
            :key="d.id"
            :class="[
              'border-b border-border/50 last:border-0 hover:bg-secondary/30',
              selected.has(d.id) ? 'bg-signal/5' : '',
            ]"
            data-testid="fleet-row"
            :data-id="d.id"
          >
            <td v-if="canEdit" class="px-2 py-1">
              <input type="checkbox" :checked="selected.has(d.id)" @change="toggle(d.id)" />
            </td>
            <td
              v-for="c in COLS"
              :key="c.f"
              :class="['px-2 py-1 text-xs', c.cls, canEdit ? 'cursor-text' : '']"
              :data-field="c.f"
              @click="!isEditing(d, c.f) && startEdit(d, c.f)"
            >
              <input
                v-if="isEditing(d, c.f)"
                v-model="draft"
                data-testid="cell-input"
                class="w-full bg-background border border-signal rounded px-1.5 py-0.5 text-xs"
                :placeholder="c.f === 'delivered_at' ? 'JJ/MM/AAAA' : ''"
                @keydown.enter.prevent="commit"
                @keydown.esc.prevent="cancelEdit"
                @blur="commit"
              />
              <span
                v-else
                :class="[
                  'block truncate rounded px-1.5 py-0.5 min-h-[1.4rem]',
                  saved === d.id + c.f ? 'bg-signal-soft' : '',
                  (c.f === 'mac_eth0' && (isDupMac(d) || badMac(d))) ||
                  (c.f === 'serial_number' && isDupSn(d))
                    ? 'text-offline'
                    : '',
                  canEdit ? 'hover:bg-secondary' : '',
                ]"
                :title="
                  c.f === 'mac_eth0' && isDupMac(d)
                    ? 'MAC en double'
                    : c.f === 'serial_number' && isDupSn(d)
                      ? 'n° de série en double'
                      : ''
                "
              >
                <template v-if="c.f === 'warranty_months' && d.warranty_months === null">
                  <span class="text-muted-foreground/60" title="durée par défaut">{{
                    defaultWarranty
                  }}</span>
                </template>
                <template v-else>{{ show(d, c.f) || (canEdit ? '·' : '—') }}</template>
              </span>
              <span
                v-if="errOf(d, c.f)"
                class="block text-[10px] text-offline"
                data-testid="cell-error"
                >{{ errOf(d, c.f) }}</span
              >
            </td>
            <td class="px-2 py-1 text-xs whitespace-nowrap">
              <button
                class="hover:text-signal"
                @click="router.push({ name: 'staff-company-detail', params: { id: d.company_id } })"
              >
                {{ companyName(d.company_id) }}
              </button>
            </td>
            <td class="px-2 py-1">
              <span
                :class="[
                  'font-mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded whitespace-nowrap',
                  STATUS_CLS[d.fleet_status],
                ]"
              >
                {{ STATUS_LABEL[d.fleet_status] }}
              </span>
            </td>
            <td
              class="px-2 py-1 text-xs whitespace-nowrap"
              :class="W_CLS[w(d).state]"
              data-testid="fleet-w"
            >
              <template v-if="w(d).state !== 'none'">
                {{ warrantyText(w(d)) }}
                <span class="text-muted-foreground">· {{ fmtDay(w(d).end) }}</span>
              </template>
            </td>
            <td class="px-2 py-1 text-right">
              <button
                class="text-[10px] font-mono uppercase text-muted-foreground hover:text-signal"
                data-testid="fleet-journal-open"
                @click="journal = d"
              >
                Journal
              </button>
            </td>
          </tr>
          <tr v-if="!filtered.length && !loading">
            <td colspan="10" class="px-4 py-8 text-center text-muted-foreground text-sm">
              Aucune box
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="text-xs text-muted-foreground">
      Cliquer sur une cellule pour la modifier (Entrée pour valider, Échap pour annuler).
      L'entreprise ne change que par « Livrer » ou « Remettre en stock ». La garantie se calcule à
      partir de la date de livraison ; la durée en gris est celle par défaut, une durée saisie la
      remplace pour la box.
    </p>

    <FleetDeliverDialog
      v-if="dialog === 'deliver'"
      :devices="selDevices"
      :companies="companies"
      @close="dialog = null"
      @done="onDone(`${selected.size} box livrée(s)`)"
    />
    <FleetReceiveDialog
      v-if="dialog === 'receive'"
      :existing="devices"
      :hexa-id="hexaId"
      @close="dialog = null"
      @done="(n) => onDone(`${n} box ajoutée(s) au stock`)"
    />
    <FleetImportDialog
      v-if="dialog === 'import'"
      :devices="devices"
      @close="dialog = null"
      @done="(n) => onDone(`${n} box mise(s) à jour`)"
    />
    <FleetJournal
      v-if="journal"
      :key="journal.id"
      :device="journal"
      :company-name="companyName"
      :can-edit="canEdit"
      @close="journal = null"
      @changed="load"
    />
  </div>
</template>

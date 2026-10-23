<script setup lang="ts">
// PROTOTYPE — Destinataires d'alarme pilotés depuis le portail (myHexa-test).
// Vue « liste » : une ligne par box, ses destinataires en étiquettes ; clic -> panneau box (destinataires + escalade).
// Vue « tableau » : box × contacts, pratique quand l'annuaire est petit.
import { computed, onMounted, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import {
  DAYS,
  LEVELS,
  DEFAULT_FILTERS,
  channelLabel,
  useAlarmConfig,
  type Contact,
  type Device,
} from '@/composables/useAlarmConfig'
import BoxAlarmPanel from '@/components/alarms/BoxAlarmPanel.vue'

const auth = useAuthStore()
const cfg = useAlarmConfig()
const { loading, flash, contacts, subs, devices } = cfg
const companyId = computed(() => auth.effectiveCompanyId)
const canEdit = computed(() => auth.recipient?.role === 'admin' || auth.isHexaStaffAdmin)
const reload = () => cfg.load(companyId.value)
onMounted(reload)
watch(companyId, reload)

const view = ref<'list' | 'table'>('list')
const showAll = ref(false)
const filter = ref('')
const visibleDevices = computed(() => {
  const q = filter.value.trim().toLowerCase()
  return devices.value
    .filter(
      (d) =>
        showAll.value || q || d.reported !== null || cfg.subsOf(d.id).length || cfg.escOf(d.id),
    )
    .filter((d) => {
      if (!q) return true
      if (d.name.toLowerCase().includes(q)) return true
      return cfg
        .subsOf(d.id)
        .some((s) => cfg.contactById.value.get(s.contact_id)?.name.toLowerCase().includes(q))
    })
})

// --- panneau box ---------------------------------------------------------------------------
const openBoxId = ref<string | null>(null)
const openBox = computed(() => devices.value.find((d) => d.id === openBoxId.value) ?? null)

// --- copier vers ---------------------------------------------------------------------------
const copyFrom = ref<Device | null>(null)
const copyTo = ref<string[]>([])
async function doCopy() {
  if (!copyFrom.value || !copyTo.value.length) return
  if (
    !confirm(
      `Remplacer les destinataires de ${copyTo.value.length} box par ceux de ${copyFrom.value.name} ?`,
    )
  )
    return
  await cfg.copySubs(copyFrom.value, copyTo.value)
  copyFrom.value = null
  copyTo.value = []
  await reload()
}

// --- fiche contact -------------------------------------------------------------------------
const draft = ref<Contact | null>(null)
const addTo = ref<string[]>([])
function openContact(c: Contact | null) {
  draft.value = JSON.parse(
    JSON.stringify(
      c ?? {
        id: '',
        company_id: companyId.value ?? '',
        name: '',
        email: '',
        phone: '',
        enabled: true,
        channels: { email: true, sms: false, call: false },
        schedule_days: DAYS.map((d) => d[0]),
        recipient_id: null,
      },
    ),
  )
  addTo.value = []
}
const draftSubs = computed(() =>
  draft.value?.id
    ? subs.value
        .filter((s) => s.contact_id === draft.value!.id)
        .map((s) => ({ s, d: devices.value.find((x) => x.id === s.device_id) }))
    : [],
)
const notYetOn = computed(() =>
  draft.value?.id ? devices.value.filter((d) => !cfg.subOf(draft.value!.id, d.id)) : [],
)
function toggleDay(day: string) {
  if (!draft.value) return
  const set = new Set(draft.value.schedule_days)
  if (set.has(day)) set.delete(day)
  else set.add(day)
  draft.value.schedule_days = DAYS.map((d) => d[0]).filter((d) => set.has(d))
}
async function saveContact() {
  if (!draft.value?.name.trim()) return
  if (await cfg.saveContact(draft.value)) {
    draft.value = null
    await reload()
  }
}
async function addContactToBoxes() {
  if (!draft.value?.id || !addTo.value.length) return
  const n = await cfg.addSubs(
    addTo.value.map((d) => ({
      contact_id: draft.value!.id,
      device_id: d,
      filters: DEFAULT_FILTERS,
    })),
  )
  cfg.setFlash(`${draft.value.name} ajouté sur ${n} box (erreurs + warnings, à envoyer)`)
  addTo.value = []
}
async function deleteContact() {
  if (
    !draft.value?.id ||
    !confirm(`Supprimer ${draft.value.name} de l'annuaire et de toutes ses box ?`)
  )
    return
  if (await cfg.deleteContact(draft.value)) {
    draft.value = null
    await reload()
  }
}
async function importFromBoxes() {
  if (!companyId.value) return
  await cfg.importFromBoxes(companyId.value)
  await reload()
}
async function sendRow(d: Device) {
  await cfg.send(d)
  await reload()
}
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
          Qui reçoit les alarmes de quelles box, pour {{ cfg.companyLabel.value ?? '—' }}. Ouvrir
          une box pour régler ses destinataires et son escalade, puis « envoyer » : la box applique
          au prochain push (~30 min).
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

    <div class="flex items-center gap-4 text-sm flex-wrap">
      <div
        class="inline-flex border border-border rounded-md overflow-hidden"
        data-testid="view-switch"
      >
        <button
          :class="['px-3 py-1.5', view === 'list' ? 'bg-secondary' : 'text-muted-foreground']"
          @click="view = 'list'"
        >
          Par box
        </button>
        <button
          :class="['px-3 py-1.5', view === 'table' ? 'bg-secondary' : 'text-muted-foreground']"
          @click="view = 'table'"
        >
          Tableau
        </button>
      </div>
      <input
        v-model="filter"
        type="search"
        placeholder="Filtrer (box ou contact)"
        autocomplete="off"
        data-1p-ignore="true"
        data-lpignore="true"
        class="border border-border bg-secondary/30 rounded-md px-3 py-1.5 w-56"
      />
      <label class="flex items-center gap-2 text-muted-foreground cursor-pointer">
        <input v-model="showAll" type="checkbox" /> toutes les box ({{ devices.length }})
      </label>
      <span class="text-muted-foreground">{{ contacts.length }} contacts</span>
      <span v-if="loading" class="text-muted-foreground">Chargement…</span>
      <span v-if="flash" class="text-primary">{{ flash }}</span>
    </div>

    <!-- Vue par box -->
    <ul
      v-if="view === 'list'"
      class="border border-border rounded-md divide-y divide-border/60"
      data-testid="alarm-list"
    >
      <li
        v-for="d in visibleDevices"
        :key="d.id"
        class="flex items-center gap-4 px-4 py-3 hover:bg-secondary/10 cursor-pointer"
        @click="openBoxId = d.id"
      >
        <div class="w-64 shrink-0">
          <div class="text-sm font-medium">{{ d.name }}</div>
          <div class="font-mono text-[10px] text-muted-foreground">
            {{ d.running_version ? `v${d.running_version}` : '' }}
            <span
              v-if="!cfg.pilotable(d)"
              title="la box n'a pas envoyé d'infos de pilotage à distance"
              >· non pilotable</span
            >
          </div>
        </div>
        <div class="flex-1 flex flex-wrap gap-1.5 min-w-0">
          <span
            v-for="s in cfg.subsOf(d.id)"
            :key="s.contact_id"
            class="inline-flex items-center gap-1 text-xs border border-border rounded-full pl-2 pr-1 py-0.5"
          >
            {{ cfg.contactById.value.get(s.contact_id)?.name }}
            <span class="inline-flex gap-px">
              <span
                v-for="l in LEVELS.filter((x) => s.filters[x.key])"
                :key="l.key"
                :class="[
                  'w-3.5 h-3.5 rounded-sm text-[8px] leading-[14px] text-center font-mono',
                  l.cls,
                ]"
                >{{ l.label }}</span
              >
            </span>
          </span>
          <span v-if="!cfg.subsOf(d.id).length" class="text-xs text-muted-foreground"
            >aucun destinataire</span
          >
          <span
            v-if="cfg.escOf(d.id) || d.reportedEscalation"
            class="text-xs text-signal border border-signal/40 rounded-full px-2 py-0.5"
            title="escalade configurée"
          >
            ⇢ escalade {{ (cfg.escOf(d.id)?.config ?? d.reportedEscalation)!.levels.length }} niv.
            {{
              (cfg.escOf(d.id)?.config ?? d.reportedEscalation)!.mode === 'immediate'
                ? '(désactivée)'
                : ''
            }}
          </span>
        </div>
        <div class="w-56 shrink-0 flex items-center justify-end gap-2" @click.stop>
          <span
            :class="[
              'font-mono text-[10px] uppercase tracking-wider text-right',
              cfg.syncState(d).cls,
            ]"
            :title="cfg.syncState(d).hint"
          >
            {{ cfg.syncState(d).label }}
          </span>
          <button
            v-if="
              canEdit &&
              cfg.pilotable(d) &&
              (cfg.diffCount(d) || cfg.escalationDirty(d.id)) &&
              !d.pending
            "
            class="font-mono text-[9px] uppercase tracking-wider border border-border px-2 py-0.5 rounded hover:border-signal"
            @click="sendRow(d)"
          >
            envoyer
          </button>
        </div>
      </li>
      <li v-if="!visibleDevices.length" class="px-4 py-3 text-sm text-muted-foreground">
        Aucune box.
      </li>
    </ul>

    <!-- Vue tableau (petits annuaires) -->
    <div v-else class="border border-border rounded-md overflow-x-auto">
      <p v-if="contacts.length > 12" class="px-3 py-2 text-xs text-amber-400">
        {{ contacts.length }} contacts : la vue « Par box » est plus lisible.
      </p>
      <table class="text-sm w-full border-collapse" data-testid="alarm-matrix">
        <thead>
          <tr class="bg-secondary/30">
            <th class="text-left font-normal px-3 py-2 sticky left-0 bg-card min-w-[220px]">Box</th>
            <th
              v-for="c in contacts"
              :key="c.id"
              class="px-2 py-2 font-normal align-bottom min-w-[90px]"
            >
              <button
                class="text-left w-full hover:text-signal text-xs font-medium"
                @click="openContact(c)"
              >
                {{ c.name }}
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in visibleDevices" :key="d.id" class="border-t border-border/60">
            <td class="px-3 py-2 sticky left-0 bg-card">
              <button class="text-xs font-medium hover:text-signal" @click="openBoxId = d.id">
                {{ d.name }}
              </button>
              <div :class="['font-mono text-[9px] uppercase', cfg.syncState(d).cls]">
                {{ cfg.syncState(d).label }}
              </div>
            </td>
            <td v-for="c in contacts" :key="c.id" class="px-2 py-2 text-center">
              <div v-if="cfg.subOf(c.id, d.id)" class="inline-flex gap-0.5">
                <button
                  v-for="l in LEVELS"
                  :key="l.key"
                  :disabled="!canEdit"
                  :class="[
                    'w-5 h-5 rounded text-[10px] font-mono',
                    cfg.subOf(c.id, d.id)!.filters[l.key]
                      ? l.cls
                      : 'bg-secondary/40 text-muted-foreground/40',
                  ]"
                  @click="cfg.toggleFilter(cfg.subOf(c.id, d.id)!, l.key)"
                >
                  {{ l.label }}
                </button>
              </div>
              <button
                v-else-if="canEdit"
                class="w-5 h-5 rounded text-xs text-muted-foreground/40 hover:text-signal"
                @click="cfg.addSubs([{ contact_id: c.id, device_id: d.id }])"
              >
                +
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <BoxAlarmPanel
      v-if="openBox"
      :device="openBox"
      :cfg="cfg"
      :can-edit="canEdit"
      @close="((openBoxId = null), reload())"
      @copy="(d) => ((copyFrom = d), (copyTo = []))"
      @changed="reload"
    />

    <!-- Copier vers… -->
    <div
      v-if="copyFrom"
      class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      @click.self="copyFrom = null"
    >
      <div class="bg-card border border-border rounded-md p-5 w-full max-w-md space-y-3">
        <h3 class="font-semibold">Copier les destinataires de {{ copyFrom.name }}</h3>
        <p class="text-xs text-muted-foreground">
          La liste des box cochées sera remplacée (types d'alarme compris), à envoyer ensuite.
          L'escalade n'est pas copiée.
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
          Canaux (sur toutes ses box)
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
        <label class="flex items-center gap-2 text-sm"
          ><input v-model="draft.enabled" :disabled="!canEdit" type="checkbox" /> actif</label
        >
        <div class="text-sm">
          Accès au portail :
          <span v-if="draft.recipient_id" class="text-online">oui</span>
          <span v-else class="text-muted-foreground"
            >non <span class="text-xs">(invitation : étape suivante)</span></span
          >
        </div>
        <div v-if="canEdit" class="flex justify-between">
          <button v-if="draft.id" class="text-sm text-offline" @click="deleteContact">
            Supprimer
          </button>
          <span v-else />
          <div class="flex gap-2">
            <button class="px-3 py-1.5 text-sm" @click="draft = null">Fermer</button>
            <button
              class="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md"
              @click="saveContact"
            >
              Enregistrer
            </button>
          </div>
        </div>

        <div v-if="draft.id" class="text-sm space-y-2 border-t border-border pt-4">
          <div>Ses box ({{ draftSubs.length }})</div>
          <ul class="space-y-1">
            <li
              v-for="{ s, d } in draftSubs"
              :key="s.device_id"
              class="flex justify-between items-center text-xs"
            >
              <span>{{ d?.name }}</span>
              <span class="font-mono"
                >{{
                  LEVELS.filter((l) => s.filters[l.key])
                    .map((l) => l.label)
                    .join(' ')
                }}
                <span
                  v-if="cfg.levelsUsing(s.device_id, s.box_recipient_id).length"
                  class="text-signal"
                  >· escalade</span
                >
              </span>
            </li>
          </ul>
          <div v-if="canEdit && notYetOn.length" class="space-y-1" data-testid="add-to-boxes">
            <div class="text-muted-foreground">Ajouter à des box (erreurs + warnings)</div>
            <div class="max-h-48 overflow-y-auto space-y-1 border border-border rounded-md p-2">
              <label v-for="d in notYetOn" :key="d.id" class="flex items-center gap-2 text-xs">
                <input v-model="addTo" type="checkbox" :value="d.id" /> {{ d.name }}
              </label>
            </div>
            <div class="flex gap-2 justify-end">
              <button
                class="text-xs text-muted-foreground hover:text-signal"
                @click="addTo = notYetOn.map((d) => d.id)"
              >
                tout cocher
              </button>
              <button
                class="px-3 py-1 text-xs bg-primary text-primary-foreground rounded-md disabled:opacity-40"
                :disabled="!addTo.length"
                @click="addContactToBoxes"
              >
                Ajouter sur {{ addTo.length }} box
              </button>
            </div>
          </div>
          <p class="text-xs text-muted-foreground">
            Canaux actuels : {{ channelLabel(draft.channels) }}
          </p>
        </div>
      </aside>
    </div>
  </div>
</template>

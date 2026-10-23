<script setup lang="ts">
// PROTOTYPE — Destinataires d'alarme pilotés depuis le portail (myHexa-test).
// UNE liste de personnes (recipients) : accès portail et/ou alarmes de box, sur une seule fiche.
// Vue « Par box » : une ligne par box ; clic -> panneau box (destinataires + escalade).
// Vue « Tableau » : box × personnes, pratique quand l'entreprise est petite.
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import {
  CHANNELS,
  DAYS,
  LEVELS,
  DEFAULT_FILTERS,
  channelLabel,
  useAlarmConfig,
  type Device,
  type Person,
} from '@/composables/useAlarmConfig'
import BoxAlarmPanel from '@/components/alarms/BoxAlarmPanel.vue'

const auth = useAuthStore()
const route = useRoute()
const cfg = useAlarmConfig()
const { loading, flash, people, subs, devices } = cfg
const companyId = computed(() => auth.effectiveCompanyId)
const canEdit = computed(() => auth.recipient?.role === 'admin' || auth.isHexaStaffAdmin)
const reload = () => cfg.load(companyId.value)
onMounted(async () => {
  await reload()
  const pid = route.query.person
  if (typeof pid === 'string') openPerson(cfg.personById.value.get(pid) ?? null)
})
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
        .some((s) => cfg.personById.value.get(s.recipient_id)?.name.toLowerCase().includes(q))
    })
})
const portalCount = computed(() => people.value.filter((p) => p.portal_access).length)

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

// --- fiche personne ------------------------------------------------------------------------
const draft = ref<Person | null>(null)
const addTo = ref<string[]>([])
const inviteRole = ref<'viewer' | 'admin'>('viewer')
function openPerson(p: Person | null) {
  draft.value = JSON.parse(
    JSON.stringify(
      p ?? {
        id: '',
        company_id: companyId.value ?? null,
        name: '',
        contact_email: '',
        phone: '',
        role: 'viewer',
        auth_user_id: null,
        portal_access: false,
        alarm_enabled: true,
        alarm_channels: { email: true, sms: false, call: false },
        alarm_schedule_days: DAYS.map((d) => d[0]),
        restrict_to_devices: null,
      },
    ),
  )
  addTo.value = []
}
const openPersonById = (id: string) => {
  openBoxId.value = null
  openPerson(cfg.personById.value.get(id) ?? null)
}
const draftSubs = computed(() =>
  draft.value?.id
    ? subs.value
        .filter((s) => s.recipient_id === draft.value!.id)
        .map((s) => ({ s, d: devices.value.find((x) => x.id === s.device_id) }))
    : [],
)
const notYetOn = computed(() =>
  draft.value?.id ? devices.value.filter((d) => !cfg.subOf(draft.value!.id, d.id)) : [],
)
const invisible = computed(() => (draft.value ? cfg.invisibleBoxes(draft.value) : []))
function toggleDay(day: string) {
  if (!draft.value) return
  const set = new Set(draft.value.alarm_schedule_days)
  if (set.has(day)) set.delete(day)
  else set.add(day)
  draft.value.alarm_schedule_days = DAYS.map((d) => d[0]).filter((d) => set.has(d))
}
async function savePerson() {
  if (!draft.value?.name.trim()) return
  if (await cfg.savePerson(draft.value)) {
    draft.value = null
    await reload()
  }
}
async function addPersonToBoxes() {
  if (!draft.value?.id || !addTo.value.length) return
  const n = await cfg.addSubs(
    addTo.value.map((d) => ({
      recipient_id: draft.value!.id,
      device_id: d,
      filters: DEFAULT_FILTERS,
    })),
  )
  cfg.setFlash(`${draft.value.name} ajouté sur ${n} box (erreurs + warnings, à envoyer)`)
  addTo.value = []
}
async function deletePerson() {
  if (
    !draft.value?.id ||
    !confirm(`Supprimer ${draft.value.name} et le retirer de toutes ses box ?`)
  )
    return
  if (await cfg.deletePerson(draft.value)) {
    draft.value = null
    await reload()
  }
}
async function invite() {
  const p = draft.value
  if (!p?.id || !p.contact_email) return
  if (!confirm(`Un mail d'invitation au portail sera envoyé à ${p.contact_email}. Continuer ?`))
    return
  if (await cfg.invite(p, inviteRole.value)) {
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
  <div class="p-3 sm:p-6 space-y-4 sm:space-y-5" data-testid="alarm-recipients">
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
          Qui reçoit les alarmes de quelles box, pour {{ cfg.companyLabel.value ?? '—' }}. Les
          personnes sont les mêmes que dans « Destinataires » : avec ou sans accès au portail.
          Ouvrir une box pour régler ses destinataires et son escalade, puis « envoyer » : la box
          applique au prochain push (~30 min).
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
          @click="openPerson(null)"
        >
          + Personne
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
        placeholder="Filtrer (box ou personne)"
        autocomplete="off"
        data-1p-ignore="true"
        data-lpignore="true"
        class="border border-border bg-secondary/30 rounded-md px-3 py-1.5 w-full sm:w-56"
      />
      <label class="flex items-center gap-2 text-muted-foreground cursor-pointer">
        <input v-model="showAll" type="checkbox" /> toutes les box ({{ devices.length }})
      </label>
      <span class="text-muted-foreground" data-testid="people-count"
        >{{ people.length }} personnes · {{ portalCount }} avec accès portail</span
      >
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
        class="flex flex-wrap sm:flex-nowrap items-start sm:items-center gap-x-4 gap-y-2 px-3 sm:px-4 py-3 hover:bg-secondary/10 cursor-pointer"
        @click="openBoxId = d.id"
      >
        <div class="min-w-0 flex-1 sm:flex-none sm:w-64 sm:shrink-0">
          <div class="text-sm font-medium">{{ d.name }}</div>
          <div class="font-mono text-[10px] text-muted-foreground">
            {{ d.running_version ? `v${d.running_version}` : '' }}
            <span
              v-if="cfg.capability(d).level !== 'full'"
              :title="cfg.capability(d).hint"
              data-testid="fw-badge"
              :class="[
                'ml-1 px-1 rounded border',
                cfg.capability(d).level === 'none'
                  ? 'border-offline/50 text-offline'
                  : 'border-amber-400/50 text-amber-400',
              ]"
              >{{ cfg.capability(d).label }}</span
            >
          </div>
        </div>
        <div
          class="order-last sm:order-none basis-full sm:basis-auto flex-1 flex flex-wrap gap-1.5 min-w-0"
        >
          <span
            v-for="s in cfg.subsOf(d.id)"
            :key="s.recipient_id"
            class="inline-flex items-center gap-1 text-xs border border-border rounded-full pl-2 pr-1 py-0.5"
          >
            {{ cfg.personById.value.get(s.recipient_id)?.name }}
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
            v-if="cfg.escOf(d.id)"
            class="text-xs text-signal border border-signal/40 rounded-full px-2 py-0.5"
            title="escalade configurée"
          >
            ⇢ escalade {{ cfg.escOf(d.id)!.config.levels.length }} niv.
            {{ cfg.escOf(d.id)!.config.mode === 'immediate' ? '(désactivée)' : '' }}
          </span>
        </div>
        <div class="shrink-0 sm:w-56 flex items-center justify-end gap-2" @click.stop>
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

    <!-- Vue tableau (petites entreprises) -->
    <div v-else class="border border-border rounded-md overflow-x-auto">
      <p class="sm:hidden px-2 py-1.5 text-[11px] text-muted-foreground border-b border-border/60">
        ← glisser pour voir toutes les personnes →
      </p>
      <p v-if="people.length > 12" class="px-3 py-2 text-xs text-amber-400">
        {{ people.length }} personnes : la vue « Par box » est plus lisible.
      </p>
      <table class="text-sm w-full border-collapse" data-testid="alarm-matrix">
        <thead>
          <tr class="bg-secondary/30">
            <th
              class="text-left font-normal px-2 sm:px-3 py-2 sticky left-0 z-10 bg-card w-28 min-w-28 max-w-28 sm:w-auto sm:min-w-[220px] sm:max-w-none"
            >
              Box
            </th>
            <th
              v-for="c in people"
              :key="c.id"
              class="px-1.5 sm:px-2 py-2 font-normal align-bottom min-w-[70px] sm:min-w-[90px]"
            >
              <button
                class="text-left w-full hover:text-signal text-xs font-medium"
                @click="openPerson(c)"
              >
                {{ c.name }}
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in visibleDevices" :key="d.id" class="border-t border-border/60">
            <td
              class="px-2 sm:px-3 py-2 sticky left-0 z-10 bg-card text-left w-28 min-w-28 max-w-28 sm:w-auto sm:min-w-[220px] sm:max-w-none shadow-[1px_0_0_var(--border)]"
            >
              <button
                class="text-xs font-medium hover:text-signal text-left break-words [overflow-wrap:anywhere]"
                @click="openBoxId = d.id"
              >
                {{ d.name }}
              </button>
              <div :class="['font-mono text-[9px] uppercase', cfg.syncState(d).cls]">
                {{ cfg.syncState(d).label }}
              </div>
              <div
                v-if="cfg.capability(d).level !== 'full'"
                :title="cfg.capability(d).hint"
                :class="[
                  'font-mono text-[9px]',
                  cfg.capability(d).level === 'none' ? 'text-offline' : 'text-amber-400',
                ]"
              >
                {{ cfg.capability(d).label }}
              </div>
            </td>
            <td v-for="c in people" :key="c.id" class="px-1 sm:px-2 py-2 text-center">
              <div v-if="cfg.subOf(c.id, d.id)" class="inline-flex gap-0.5">
                <button
                  v-for="l in LEVELS"
                  :key="l.key"
                  :disabled="!canEdit || !cfg.pilotable(d)"
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
                v-else-if="canEdit && cfg.pilotable(d)"
                class="w-5 h-5 rounded text-xs text-muted-foreground/40 hover:text-signal"
                @click="cfg.addSubs([{ recipient_id: c.id, device_id: d.id }])"
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
      @person="openPersonById"
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
            v-for="d in devices.filter((x) => x.id !== copyFrom!.id && cfg.pilotable(x))"
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

    <!-- Fiche personne -->
    <div
      v-if="draft"
      class="fixed inset-0 z-40 bg-black/50 flex justify-end"
      @click.self="draft = null"
    >
      <aside
        class="bg-card border-l border-border w-full max-w-md h-full overflow-y-auto p-5 space-y-4"
        data-testid="person-drawer"
      >
        <h3 class="font-semibold">{{ draft.id ? draft.name : 'Nouvelle personne' }}</h3>
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
            v-model="draft.contact_email"
            :disabled="!canEdit || draft.portal_access"
            :title="draft.portal_access ? 'identifiant de connexion au portail' : ''"
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

        <!-- Volet 1 : accès portail -->
        <section
          class="border border-border rounded-md p-3 space-y-2 text-sm"
          data-testid="portal-section"
        >
          <h4 class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Accès au portail
          </h4>
          <template v-if="draft.portal_access">
            <div>
              Oui — <b>{{ draft.role === 'admin' ? 'administrateur' : 'lecteur' }}</b
              >,
              {{
                draft.restrict_to_devices?.length
                  ? `${draft.restrict_to_devices.length} box visibles`
                  : 'toutes les box'
              }}. Reçoit aussi les mails du portail (rapports, connectivité).
            </div>
            <p v-if="invisible.length" class="text-xs text-amber-400">
              Reçoit les alarmes de {{ invisible.length }} box qu'il ne voit pas dans le portail :
              {{ invisible.join(', ') }}.
            </p>
            <RouterLink to="/admin/recipients" class="text-xs text-signal hover:underline"
              >régler son accès dans « Destinataires »</RouterLink
            >
          </template>
          <template v-else>
            <div class="text-muted-foreground">
              Non — reçoit seulement les alarmes de ses box, aucun mail du portail.
            </div>
            <div v-if="canEdit && draft.id" class="flex items-center gap-2">
              <select
                v-model="inviteRole"
                class="border border-border bg-secondary/30 rounded px-2 py-1 text-xs"
              >
                <option value="viewer">lecteur</option>
                <option value="admin">administrateur</option>
              </select>
              <button
                class="px-3 py-1 text-xs border border-border rounded-md hover:border-signal disabled:opacity-40"
                :disabled="!draft.contact_email"
                :title="draft.contact_email ? '' : 'il faut un email'"
                @click="invite"
              >
                Inviter au portail
              </button>
            </div>
          </template>
        </section>

        <!-- Volet 2 : alarmes des box -->
        <section
          class="border border-border rounded-md p-3 space-y-3 text-sm"
          data-testid="alarm-section"
        >
          <h4 class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Alarmes des box
          </h4>
          <div>
            Ses canaux (sur toutes ses box, escalade comprise)
            <div class="flex gap-4 mt-1">
              <label v-for="ch in CHANNELS" :key="ch.key" class="flex items-center gap-1">
                <input
                  v-model="draft.alarm_channels[ch.key]"
                  :disabled="!canEdit"
                  type="checkbox"
                />
                {{ ch.label }}
                <span v-if="ch.key === 'call'" class="text-[10px] text-muted-foreground"
                  >(escalade seulement)</span
                >
              </label>
            </div>
            <ul
              class="mt-1 text-[11px] text-muted-foreground space-y-0.5"
              data-testid="channel-help"
            >
              <li>
                Alarmes non escaladées : envoi immédiat par mail et SMS cochés (jamais d'appel).
              </li>
              <li>
                Alarmes escaladées : seulement s'il est dans un niveau, et seulement par les canaux
                cochés ici.
              </li>
              <li
                v-if="(draft.alarm_channels.sms || draft.alarm_channels.call) && !draft.phone"
                class="text-amber-400"
              >
                SMS / appel cochés mais pas de numéro : vérifier le téléphone.
              </li>
              <li v-if="draft.alarm_channels.email && !draft.contact_email" class="text-amber-400">
                Mail coché mais pas d'email.
              </li>
            </ul>
          </div>
          <div>
            Jours de réception
            <div class="flex gap-1 mt-1">
              <button
                v-for="[day, l] in DAYS"
                :key="day"
                :disabled="!canEdit"
                :class="[
                  'w-8 h-8 rounded text-xs',
                  draft.alarm_schedule_days.includes(day)
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary/40 text-muted-foreground',
                ]"
                @click="toggleDay(day)"
              >
                {{ l }}
              </button>
            </div>
          </div>
          <label class="flex items-center gap-2"
            ><input v-model="draft.alarm_enabled" :disabled="!canEdit" type="checkbox" /> alarmes
            actives</label
          >

          <div v-if="draft.id" class="space-y-2 border-t border-border pt-3">
            <div>Ses box ({{ draftSubs.length }})</div>
            <ul class="space-y-1">
              <li v-for="{ s, d } in draftSubs" :key="s.device_id" class="text-xs">
                <div class="flex justify-between items-center">
                  <span>{{ d?.name }}</span>
                  <span class="font-mono">{{
                    LEVELS.filter((l) => s.filters[l.key])
                      .map((l) => l.label)
                      .join(' ')
                  }}</span>
                </div>
                <div v-if="s.channels_override" class="text-amber-400">
                  sur cette box : {{ channelLabel(s.channels_override) }}
                </div>
                <div v-for="lv in cfg.receives(s).levels" :key="lv.n" class="text-signal">
                  escalade niveau {{ lv.n }} : {{ channelLabel(lv.ch)
                  }}{{ lv.exception ? ' (exception)' : '' }}
                </div>
              </li>
            </ul>
            <div v-if="canEdit && notYetOn.length" class="space-y-1" data-testid="add-to-boxes">
              <div class="text-muted-foreground">Ajouter à des box (erreurs + warnings)</div>
              <div class="max-h-48 overflow-y-auto space-y-1 border border-border rounded-md p-2">
                <label
                  v-for="d in notYetOn"
                  :key="d.id"
                  :title="cfg.capability(d).hint"
                  :class="[
                    'flex items-center gap-2 text-xs',
                    !cfg.pilotable(d) && 'text-muted-foreground/50 cursor-not-allowed',
                  ]"
                >
                  <input
                    v-model="addTo"
                    type="checkbox"
                    :value="d.id"
                    :disabled="!cfg.pilotable(d)"
                  />
                  {{ d.name }}
                  <span v-if="!cfg.pilotable(d)" class="text-[10px]">firmware non compatible</span>
                </label>
              </div>
              <div class="flex gap-2 justify-end">
                <button
                  class="text-xs text-muted-foreground hover:text-signal"
                  @click="addTo = notYetOn.filter((d) => cfg.pilotable(d)).map((d) => d.id)"
                >
                  tout cocher
                </button>
                <button
                  class="px-3 py-1 text-xs bg-primary text-primary-foreground rounded-md disabled:opacity-40"
                  :disabled="!addTo.length"
                  @click="addPersonToBoxes"
                >
                  Ajouter sur {{ addTo.length }} box
                </button>
              </div>
            </div>
          </div>
        </section>

        <div v-if="canEdit" class="flex justify-between">
          <button
            v-if="draft.id && !draft.portal_access"
            class="text-sm text-offline"
            @click="deletePerson"
          >
            Supprimer
          </button>
          <span v-else />
          <div class="flex gap-2">
            <button class="px-3 py-1.5 text-sm" @click="draft = null">Fermer</button>
            <button
              class="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md"
              @click="savePerson"
            >
              Enregistrer
            </button>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

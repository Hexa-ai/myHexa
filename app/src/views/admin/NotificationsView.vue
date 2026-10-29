<script setup lang="ts">
// Notifications envoyées par le portail, réglées par l'administrateur de l'entreprise :
//  - perte / retour de liaison d'une box (la box ne peut pas le signaler elle-même),
//    destinataires choisis box par box, délai, mode maintenance ;
//  - récapitulatif d'état : fréquence, jour, résumé IA, destinataires.
// Les alarmes restent envoyées par les box (page « Alertes · destinataires »).
import { computed, onMounted, ref, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

// colonnes / fonctions récentes, absentes des types générés
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any

interface Person {
  id: string
  name: string
  contact_email: string | null
  role: string | null
  portal_access: boolean
  status_email: boolean
  restrict_to_devices: string[] | null
}
interface Box {
  id: string
  name: string | null
  alerts_paused_until: string | null
}
interface Settings {
  connectivity_alerts_enabled: boolean
  connectivity_delay_minutes: number
  status_email_frequency: 'none' | 'daily' | 'weekly'
  status_email_weekday: number
  status_email_ai: boolean
}

const auth = useAuthStore()
const companyId = computed(() => auth.effectiveCompanyId)
const canEdit = computed(() => auth.recipient?.role === 'admin' || auth.isHexaStaffAdmin)

const loading = ref(false)
const saving = ref(false)
const flash = ref<string | null>(null)
const error = ref<string | null>(null)
const people = ref<Person[]>([])
const boxes = ref<Box[]>([])
const subs = ref(new Set<string>())
const settings = ref<Settings | null>(null)
const saved = ref('')
const pauseFor = ref<Record<string, string>>({})

const DELAYS = [
  [30, '30 min'],
  [60, '1 heure'],
  [240, '4 heures'],
] as const
const WEEKDAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
const key = (r: string, d: string) => `${r}|${d}`
const withEmail = computed(() => people.value.filter((p) => p.contact_email))
const portalPeople = computed(() => withEmail.value.filter((p) => p.portal_access))
const dirty = computed(() => !!settings.value && JSON.stringify(settings.value) !== saved.value)

function say(msg: string) {
  flash.value = msg
  setTimeout(() => {
    if (flash.value === msg) flash.value = null
  }, 4000)
}

async function load() {
  if (!companyId.value) return
  loading.value = true
  error.value = null
  const [c, r, d] = await Promise.all([
    sb
      .from('companies')
      .select(
        'connectivity_alerts_enabled, connectivity_delay_minutes, status_email_frequency, status_email_weekday, status_email_ai',
      )
      .eq('id', companyId.value)
      .maybeSingle(),
    sb
      .from('recipients')
      .select('id, name, contact_email, role, portal_access, status_email, restrict_to_devices')
      .eq('company_id', companyId.value)
      .order('name'),
    sb
      .from('devices')
      .select('id, name, alerts_paused_until')
      .eq('company_id', companyId.value)
      .order('name'),
  ])
  const err = c.error ?? r.error ?? d.error
  if (err) error.value = err.message
  settings.value = (c.data as Settings | null) ?? null
  saved.value = JSON.stringify(settings.value)
  people.value = (r.data ?? []) as Person[]
  boxes.value = (d.data ?? []) as Box[]
  pauseFor.value = Object.fromEntries(boxes.value.map((b) => [b.id, '']))
  const ids = boxes.value.map((b) => b.id)
  const s = ids.length
    ? await sb
        .from('connectivity_subscriptions')
        .select('recipient_id, device_id')
        .in('device_id', ids)
    : { data: [] as { recipient_id: string; device_id: string }[] }
  subs.value = new Set(
    (s.data ?? []).map((x: { recipient_id: string; device_id: string }) =>
      key(x.recipient_id, x.device_id),
    ),
  )
  loading.value = false
}
onMounted(load)
watch(companyId, load)

async function saveSettings() {
  if (!settings.value || !companyId.value) return
  saving.value = true
  const s = settings.value
  const { error: e } = await sb.rpc('set_company_notifications', {
    p_company: companyId.value,
    p_connectivity_enabled: s.connectivity_alerts_enabled,
    p_connectivity_delay: s.connectivity_delay_minutes,
    p_status_frequency: s.status_email_frequency,
    p_status_weekday: s.status_email_weekday,
    p_status_ai: s.status_email_ai,
  })
  saving.value = false
  if (e) return say(`Erreur : ${e.message}`)
  saved.value = JSON.stringify(s)
  say('Réglages enregistrés')
}

const canSee = (p: Person, b: Box) =>
  !p.portal_access || !p.restrict_to_devices || p.restrict_to_devices.includes(b.id)

async function toggleSub(p: Person, b: Box) {
  const k = key(p.id, b.id)
  const on = subs.value.has(k)
  const next = new Set(subs.value)
  if (on) next.delete(k)
  else next.add(k)
  subs.value = next
  const { error: e } = on
    ? await sb
        .from('connectivity_subscriptions')
        .delete()
        .eq('recipient_id', p.id)
        .eq('device_id', b.id)
    : await sb.from('connectivity_subscriptions').insert({ recipient_id: p.id, device_id: b.id })
  if (e) {
    say(`Erreur : ${e.message}`)
    await load()
  }
}

async function bulk(scope: 'admins' | 'members' | 'none') {
  if (!companyId.value) return
  const label = {
    admins: 'tous les administrateurs',
    members: 'tous les membres ayant accès au portail',
    none: 'personne',
  }[scope]
  if (!confirm(`Remplacer le choix actuel : ${label}, sur toutes les box ?`)) return
  const { data, error: e } = await sb.rpc('connectivity_subscribe_all', {
    p_company: companyId.value,
    p_scope: scope,
  })
  if (e) return say(`Erreur : ${e.message}`)
  say(`${data ?? 0} abonnement(s) en place`)
  await load()
}

async function toggleStatus(p: Person) {
  const v = !p.status_email
  p.status_email = v
  const { error: e } = await sb.from('recipients').update({ status_email: v }).eq('id', p.id)
  if (e) {
    p.status_email = !v
    say(`Erreur : ${e.message}`)
  }
}

const paused = (b: Box) => !!b.alerts_paused_until && new Date(b.alerts_paused_until) > new Date()
const fmt = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
async function setPause(b: Box, hours: number | null) {
  const until = hours ? new Date(Date.now() + hours * 3600_000).toISOString() : null
  const { error: e } = await sb.rpc('set_device_alerts_pause', {
    p_device: b.id,
    p_until: until,
  })
  if (e) return say(`Erreur : ${e.message}`)
  b.alerts_paused_until = until
  pauseFor.value[b.id] = ''
  say(until ? `${b.name} en maintenance jusqu'au ${fmt(until)}` : `Alertes reprises pour ${b.name}`)
}
</script>

<template>
  <div class="p-3 sm:p-6 space-y-5 max-w-6xl" data-testid="notifications-view">
    <header class="space-y-1">
      <h1 class="text-xl font-semibold">Notifications</h1>
      <p class="text-sm text-muted-foreground max-w-3xl">
        Les mails envoyés par le portail pour votre entreprise. Les alarmes, elles, sont envoyées
        par les box : voir
        <RouterLink to="/admin/alarm-recipients" class="text-signal hover:underline"
          >Alertes · destinataires</RouterLink
        >.
      </p>
      <p v-if="!canEdit" class="text-xs text-amber-400">
        Consultation seule : seuls les administrateurs modifient ces réglages.
      </p>
    </header>

    <p v-if="loading" class="text-sm text-muted-foreground">Chargement…</p>
    <p v-if="error" class="text-sm text-offline">{{ error }}</p>
    <p v-if="flash" class="text-sm text-primary" data-testid="notif-flash">{{ flash }}</p>

    <template v-if="settings">
      <!-- Perte de liaison -->
      <section
        class="neu-card border border-border rounded-md p-4 space-y-4"
        data-testid="conn-section"
      >
        <div class="flex items-start justify-between gap-4 flex-wrap">
          <div class="space-y-1">
            <h2 class="font-semibold">Perte de liaison d'une box</h2>
            <p class="text-xs text-muted-foreground max-w-2xl">
              Une box coupée ne peut pas prévenir elle-même : le portail envoie un mail quand elle
              n'a plus donné de nouvelles depuis le délai choisi, puis un autre à son retour. Un
              seul mail par personne regroupe toutes les box concernées.
            </p>
          </div>
          <label class="flex items-center gap-2 text-sm cursor-pointer">
            <input
              v-model="settings.connectivity_alerts_enabled"
              type="checkbox"
              :disabled="!canEdit"
              data-testid="conn-enabled"
            />
            Activées
          </label>
        </div>
        <div class="flex items-center gap-3 flex-wrap text-sm">
          <span class="text-muted-foreground">Délai sans nouvelles</span>
          <select
            v-model.number="settings.connectivity_delay_minutes"
            :disabled="!canEdit || !settings.connectivity_alerts_enabled"
            class="border border-border bg-secondary/30 rounded-md px-2 py-1.5"
            data-testid="conn-delay"
          >
            <option v-for="[v, l] in DELAYS" :key="v" :value="v">{{ l }}</option>
          </select>
        </div>

        <div class="space-y-2">
          <div class="flex items-center gap-2 flex-wrap text-sm">
            <span class="text-muted-foreground mr-1">Qui reçoit, box par box</span>
            <template v-if="canEdit">
              <button
                class="px-2.5 py-1 text-xs border border-border rounded-md hover:border-signal"
                data-testid="bulk-admins"
                @click="bulk('admins')"
              >
                Tous les administrateurs
              </button>
              <button
                class="px-2.5 py-1 text-xs border border-border rounded-md hover:border-signal"
                @click="bulk('members')"
              >
                Tous les membres
              </button>
              <button
                class="px-2.5 py-1 text-xs border border-border rounded-md hover:border-signal"
                @click="bulk('none')"
              >
                Personne
              </button>
            </template>
          </div>
          <div class="border border-border rounded-md overflow-x-auto">
            <table class="text-sm w-full border-collapse" data-testid="conn-matrix">
              <thead>
                <tr class="bg-secondary/30">
                  <th
                    class="text-left font-normal px-3 py-2 sticky left-0 z-10 bg-card min-w-40 sm:min-w-56"
                  >
                    Box
                  </th>
                  <th
                    v-for="p in withEmail"
                    :key="p.id"
                    class="px-2 py-2 font-normal align-bottom min-w-[84px] text-xs"
                  >
                    <div class="font-medium">{{ p.name }}</div>
                    <div class="text-[10px] text-muted-foreground">
                      {{
                        p.portal_access
                          ? p.role === 'admin'
                            ? 'admin'
                            : 'lecteur'
                          : 'sans accès portail'
                      }}
                    </div>
                  </th>
                  <th class="px-3 py-2 font-normal text-left text-xs min-w-44">Maintenance</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="b in boxes" :key="b.id" class="neu-row border-t border-border/60">
                  <td class="px-3 py-2 sticky left-0 z-10 bg-card text-xs font-medium">
                    {{ b.name }}
                  </td>
                  <td v-for="p in withEmail" :key="p.id" class="px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      :checked="subs.has(key(p.id, b.id))"
                      :disabled="!canEdit || !canSee(p, b)"
                      :title="canSee(p, b) ? '' : 'cette personne ne voit pas cette box'"
                      :data-testid="`sub-${p.id}-${b.id}`"
                      @change="toggleSub(p, b)"
                    />
                  </td>
                  <td class="px-3 py-2 text-xs">
                    <div v-if="paused(b)" class="flex items-center gap-2 flex-wrap">
                      <span class="text-amber-400" data-testid="paused-label"
                        >jusqu'au {{ fmt(b.alerts_paused_until!) }}</span
                      >
                      <button
                        v-if="canEdit"
                        class="text-signal hover:underline"
                        @click="setPause(b, null)"
                      >
                        Reprendre
                      </button>
                    </div>
                    <select
                      v-else-if="canEdit"
                      v-model="pauseFor[b.id]"
                      class="border border-border bg-secondary/30 rounded px-1.5 py-1"
                      :data-testid="`pause-${b.id}`"
                      @change="setPause(b, Number(pauseFor[b.id]))"
                    >
                      <option value="">aucune</option>
                      <option value="4">4 heures</option>
                      <option value="24">24 heures</option>
                      <option value="168">7 jours</option>
                    </select>
                    <span v-else class="text-muted-foreground">aucune</span>
                  </td>
                </tr>
                <tr v-if="!boxes.length">
                  <td class="px-3 py-3 text-muted-foreground" :colspan="withEmail.length + 2">
                    Aucune box.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="text-[11px] text-muted-foreground">
            Une personne sans accès au portail peut recevoir ces mails (astreinte, par exemple).
            Pendant une maintenance, aucune alerte de liaison n'est envoyée pour la box.
          </p>
        </div>
      </section>

      <!-- Récapitulatif d'état -->
      <section
        class="neu-card border border-border rounded-md p-4 space-y-4"
        data-testid="status-section"
      >
        <div class="space-y-1">
          <h2 class="font-semibold">Récapitulatif d'état</h2>
          <p class="text-xs text-muted-foreground max-w-2xl">
            Un mail qui résume l'état des box : en ligne, inactives, en alarme. Envoyé vers 6 h aux
            personnes cochées, chacune pour les box qu'elle voit.
          </p>
        </div>
        <div class="flex items-center gap-3 flex-wrap text-sm">
          <span class="text-muted-foreground">Fréquence</span>
          <select
            v-model="settings.status_email_frequency"
            :disabled="!canEdit"
            class="border border-border bg-secondary/30 rounded-md px-2 py-1.5"
            data-testid="status-frequency"
          >
            <option value="none">jamais</option>
            <option value="daily">tous les jours</option>
            <option value="weekly">chaque semaine</option>
          </select>
          <template v-if="settings.status_email_frequency === 'weekly'">
            <span class="text-muted-foreground">le</span>
            <select
              v-model.number="settings.status_email_weekday"
              :disabled="!canEdit"
              class="border border-border bg-secondary/30 rounded-md px-2 py-1.5"
              data-testid="status-weekday"
            >
              <option v-for="(d, i) in WEEKDAYS" :key="d" :value="i + 1">{{ d }}</option>
            </select>
          </template>
        </div>
        <label class="flex items-start gap-2 text-sm cursor-pointer max-w-2xl">
          <input
            v-model="settings.status_email_ai"
            type="checkbox"
            class="mt-1"
            :disabled="!canEdit || settings.status_email_frequency === 'none'"
            data-testid="status-ai"
          />
          <span>
            Ajouter un résumé rédigé par l'IA
            <span class="block text-xs text-muted-foreground"
              >L'état des box est alors transmis à Google (Gemini) pour rédiger le résumé.</span
            >
          </span>
        </label>
        <div class="space-y-1">
          <div class="text-sm text-muted-foreground">Qui le reçoit</div>
          <div class="flex flex-wrap gap-x-5 gap-y-1.5">
            <label
              v-for="p in portalPeople"
              :key="p.id"
              class="flex items-center gap-2 text-sm cursor-pointer"
            >
              <input
                type="checkbox"
                :checked="p.status_email"
                :disabled="!canEdit"
                :data-testid="`status-${p.id}`"
                @change="toggleStatus(p)"
              />
              {{ p.name }}
              <span class="text-[10px] text-muted-foreground">{{
                p.role === 'admin' ? 'admin' : 'lecteur'
              }}</span>
            </label>
            <span v-if="!portalPeople.length" class="text-sm text-muted-foreground"
              >Personne n'a accès au portail.</span
            >
          </div>
        </div>
      </section>

      <div v-if="canEdit" class="flex items-center gap-3">
        <button
          class="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md disabled:opacity-40"
          :disabled="!dirty || saving"
          data-testid="notif-save"
          @click="saveSettings"
        >
          {{ saving ? 'Enregistrement…' : 'Enregistrer les réglages' }}
        </button>
        <span v-if="dirty" class="text-xs text-amber-400">Modifications non enregistrées</span>
        <span class="text-xs text-muted-foreground"
          >Les choix de destinataires et de maintenance s'appliquent tout de suite.</span
        >
      </div>
    </template>
  </div>
</template>

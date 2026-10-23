<script setup lang="ts">
// PROTOTYPE — éditeur de la chaîne d'escalade d'une box (format set_escalation du firmware).
// Canaux : un membre suit SES canaux (fiche personne, ou exception sur la box) ; on ne règle ici
// que des exceptions explicites. Le portail envoie à la box chaque membre avec ses canaux résolus.
import { computed, ref, watch } from 'vue'
import {
  CHANNELS,
  LEVELS,
  channelLabel,
  same,
  type AlarmConfig,
  type Channels,
  type Device,
  type Escalation,
} from '@/composables/useAlarmConfig'
import AlarmPreview from './AlarmPreview.vue'

const props = defineProps<{ device: Device; cfg: AlarmConfig; canEdit: boolean }>()

const DEFAULT: Escalation = {
  mode: 'escalation',
  types: { error: true, warning: false, info: false },
  cumulative: false,
  stop_on_clear: true,
  closure_notice: false,
  levels: [],
}

const stored = computed(() => props.cfg.escOf(props.device.id)?.config ?? null)
const draft = ref<Escalation | null>(null)
function reset() {
  draft.value = stored.value ? JSON.parse(JSON.stringify({ ...DEFAULT, ...stored.value })) : null
}
watch(() => props.device.id, reset, { immediate: true })
const changed = computed(
  () => !same(draft.value, stored.value ? { ...DEFAULT, ...stored.value } : null),
)

const members = computed(() =>
  props.cfg.subsOf(props.device.id).map((s) => {
    const p = props.cfg.personById.value.get(s.recipient_id)
    const reported = props.device.reported?.find((r) => r.id === s.box_recipient_id)
    const ch = props.cfg.channelsOn(s)
    const hasPhone = !!(p?.phone || reported?.phone)
    // canaux réellement utilisables (cochés sur la fiche ET coordonnée présente)
    const usable = CHANNELS.filter(
      (c) => ch?.[c.key] && (c.key === 'email' ? !!p?.contact_email : hasPhone),
    )
    return {
      id: s.box_recipient_id,
      name: p?.name ?? s.box_recipient_id,
      channels: ch,
      usable: usable.map((c) => c.key),
      enabled: p?.alarm_enabled ?? true,
      filters: s.filters,
    }
  }),
)
type Member = (typeof members.value)[number]
const escalatedTypes = computed(() => LEVELS.filter((l) => draft.value?.types[l.key]))
/** pourquoi ce membre ne recevrait rien dans la chaîne (null = joignable) */
function unreachable(m: Member): string | null {
  if (!m.enabled) return 'alarmes désactivées sur sa fiche'
  if (!escalatedTypes.value.some((l) => m.filters[l.key]))
    return `ne reçoit pas les ${escalatedTypes.value.map((l) => l.label).join('/') || '—'} sur cette box`
  if (!m.usable.length) return 'aucun canal utilisable (fiche ou coordonnées)'
  return null
}
/** types escaladés qu'il ne reçoit pas (joignable seulement pour une partie) */
const partial = (m: Member) =>
  escalatedTypes.value.filter((l) => !m.filters[l.key]).map((l) => l.label)
/** abonnés à un type escaladé qui ne sont dans aucun niveau : ils ne recevront plus rien pour ce type */
const leftOut = computed(() => {
  const d = draft.value
  if (!d || d.mode !== 'escalation') return []
  const inChain = new Set(d.levels.flatMap((l) => l.members))
  return members.value
    .filter((m) => m.enabled && !inChain.has(m.id))
    .map((m) => ({
      name: m.name,
      types: escalatedTypes.value.filter((l) => m.filters[l.key]).map((l) => l.label),
    }))
    .filter((x) => x.types.length)
})
const memberOf = (id: string) => members.value.find((m) => m.id === id)

function create() {
  draft.value = JSON.parse(JSON.stringify(DEFAULT))
  addLevel()
}
function addLevel() {
  if (!draft.value) return
  const n = draft.value.levels.length
  draft.value.levels.push({
    name: `Niveau ${n + 1}`,
    delay_seconds: n === 0 ? 60 : 300,
    reminders: 0,
    members: [],
    channels: { email: true, sms: false, call: false },
    member_channels: {},
  })
}
function removeLevel(i: number) {
  draft.value?.levels.splice(i, 1)
}
function moveLevel(i: number, dir: -1 | 1) {
  const l = draft.value?.levels
  if (!l || i + dir < 0 || i + dir >= l.length) return
  ;[l[i], l[i + dir]] = [l[i + dir], l[i]]
}
function toggleMember(i: number, id: string) {
  const lv = draft.value!.levels[i]
  if (lv.members.includes(id)) {
    lv.members = lv.members.filter((m) => m !== id)
    delete lv.member_channels[id]
  } else lv.members.push(id)
}
/** canaux effectifs d'un membre à ce niveau */
const eff = (i: number, id: string): Channels =>
  draft.value!.levels[i].member_channels[id] ??
  memberOf(id)?.channels ??
  draft.value!.levels[i].channels
function toggleChannel(i: number, id: string, key: keyof Channels) {
  const lv = draft.value!.levels[i]
  const next = { ...eff(i, id), [key]: !eff(i, id)[key] }
  // revenu à ses canaux habituels -> plus d'exception
  if (same(next, memberOf(id)?.channels)) delete lv.member_channels[id]
  else lv.member_channels[id] = next
}
function resetChannels(i: number, id: string) {
  delete draft.value!.levels[i].member_channels[id]
}
const minutes = (s: number) => Math.round(s / 60)
function setMinutes(i: number, v: string) {
  draft.value!.levels[i].delay_seconds =
    Math.min(1440, Math.max(1, Math.round(Number(v) || 1))) * 60
}

const problems = computed(() => {
  const d = draft.value
  if (!d) return []
  const out: string[] = []
  if (!d.levels.length) out.push('aucun niveau')
  if (!d.types.error && !d.types.warning && !d.types.info)
    out.push("aucun type d'alarme ne déclenche la chaîne")
  d.levels.forEach((l, i) => {
    if (!l.members.length) out.push(`niveau ${i + 1} sans membre`)
    for (const m of l.members) {
      if (!memberOf(m))
        out.push(
          `niveau ${i + 1} : ${props.cfg.memberName(props.device.id, m)} n'est plus destinataire de la box`,
        )
      else if (unreachable(memberOf(m)!))
        out.push(
          `niveau ${i + 1} : ${memberOf(m)!.name} ne serait pas prévenu (${unreachable(memberOf(m)!)})`,
        )
      else if (!CHANNELS.some((c) => eff(i, m)[c.key] && memberOf(m)!.usable.includes(c.key)))
        out.push(`niveau ${i + 1} : ${memberOf(m)!.name} ne serait prévenu par aucun canal`)
    }
  })
  return out
})

const saving = ref(false)
async function save() {
  if (!draft.value || problems.value.length) return
  saving.value = true
  const okSave = await props.cfg.saveEscalation(
    props.device.id,
    JSON.parse(JSON.stringify(draft.value)),
  )
  saving.value = false
  if (okSave) props.cfg.setFlash(`Escalade de ${props.device.name} enregistrée (à envoyer)`)
}
</script>

<template>
  <section class="space-y-3" data-testid="escalation-editor">
    <div class="flex items-center justify-between">
      <h4 class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        Escalade
      </h4>
      <span
        v-if="cfg.escalationDirty(device.id)"
        class="font-mono text-[10px] uppercase text-amber-400"
        >modifiée — à envoyer</span
      >
    </div>

    <div v-if="!draft" class="text-sm text-muted-foreground">
      Pas d'escalade : chaque alarme part en même temps à tous les destinataires, sur leurs canaux.
      <button v-if="canEdit" class="ml-2 text-signal hover:underline" @click="create">
        Créer une escalade
      </button>
    </div>

    <template v-else>
      <div class="flex flex-wrap gap-4 text-sm items-center">
        <label class="flex items-center gap-2">
          Mode
          <select
            v-model="draft.mode"
            :disabled="!canEdit"
            class="border border-border bg-secondary/30 rounded px-2 py-1"
          >
            <option value="escalation">escalade (niveau par niveau)</option>
            <option value="immediate">immédiat (tout le monde)</option>
          </select>
        </label>
        <div class="flex items-center gap-1">
          Alarmes escaladées
          <button
            v-for="l in LEVELS"
            :key="l.key"
            :disabled="!canEdit"
            :class="[
              'w-6 h-6 rounded text-[10px] font-mono',
              draft.types[l.key] ? l.cls : 'bg-secondary/40 text-muted-foreground/40',
            ]"
            @click="draft.types[l.key] = !draft.types[l.key]"
          >
            {{ l.label }}
          </button>
        </div>
      </div>
      <p v-if="leftOut.length" class="text-xs text-amber-400" data-testid="left-out">
        ⚠ Pendant l'escalade, personne n'est prévenu en direct. Ne recevront rien :
        <span v-for="(x, k) in leftOut" :key="x.name"
          >{{ k ? ', ' : '' }}<b>{{ x.name }}</b> ({{ x.types.join('/') }})</span
        >. Ajoute-les à un niveau si besoin.
      </p>
      <p class="text-xs text-muted-foreground">
        <template v-if="draft.mode === 'immediate'"
          >Mode immédiat : la chaîne reste enregistrée sur la box, prête à être réactivée.</template
        >
        <template v-else>
          Chaque membre est prévenu sur <b>ses canaux habituels</b> (ceux de sa fiche ou de cette
          box). Cliquer un canal crée une exception pour ce niveau seulement (la box ne peut que
          retirer des canaux, pas en ajouter).
        </template>
      </p>

      <ol class="space-y-2">
        <li
          v-for="(lv, i) in draft.levels"
          :key="i"
          class="border border-border rounded-md p-3 bg-card/40 space-y-2"
          data-testid="esc-level"
        >
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-mono text-[10px] text-muted-foreground">{{ i + 1 }}.</span>
            <input
              v-model="lv.name"
              :disabled="!canEdit"
              maxlength="64"
              class="flex-1 min-w-[120px] border border-border bg-secondary/30 rounded px-2 py-1 text-sm"
            />
            <label class="text-xs flex items-center gap-1">
              attendre
              <input
                :value="minutes(lv.delay_seconds)"
                :disabled="!canEdit"
                type="number"
                min="1"
                class="w-14 border border-border bg-secondary/30 rounded px-1 py-0.5"
                @change="setMinutes(i, ($event.target as HTMLInputElement).value)"
              />
              min
            </label>
            <label class="text-xs flex items-center gap-1">
              relances
              <input
                v-model.number="lv.reminders"
                :disabled="!canEdit"
                type="number"
                min="0"
                max="10"
                class="w-12 border border-border bg-secondary/30 rounded px-1 py-0.5"
              />
            </label>
            <template v-if="canEdit">
              <button
                class="text-xs text-muted-foreground hover:text-signal"
                title="monter"
                @click="moveLevel(i, -1)"
              >
                ↑
              </button>
              <button
                class="text-xs text-muted-foreground hover:text-signal"
                title="descendre"
                @click="moveLevel(i, 1)"
              >
                ↓
              </button>
              <button
                class="text-xs text-offline"
                title="supprimer le niveau"
                @click="removeLevel(i)"
              >
                ✕
              </button>
            </template>
          </div>

          <ul v-if="lv.members.length" class="space-y-1">
            <li
              v-for="m in lv.members"
              :key="m"
              class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs border-b border-border/40 sm:border-0 pb-1.5 sm:pb-0"
              data-testid="level-member"
            >
              <span
                :class="[
                  'basis-[calc(100%-2rem)] sm:basis-auto sm:w-40 sm:truncate font-medium sm:font-normal',
                  !memberOf(m) && 'text-offline',
                ]"
                >{{ cfg.memberName(device.id, m) }}{{ memberOf(m) ? '' : ' ⚠' }}</span
              >
              <span class="inline-flex gap-1 order-2 sm:order-none">
                <button
                  v-for="c in CHANNELS"
                  :key="c.key"
                  :disabled="
                    !canEdit ||
                    !memberOf(m) ||
                    (!memberOf(m)!.usable.includes(c.key) && !eff(i, m)[c.key])
                  "
                  :title="
                    memberOf(m) && !memberOf(m)!.usable.includes(c.key)
                      ? memberOf(m)!.channels?.[c.key]
                        ? 'pas de coordonnée (email ou numéro) : la box ne pourra pas l\'utiliser'
                        : 'pas coché sur sa fiche : la box ne l\'utilisera pas (l\'escalade ne peut que retirer des canaux)'
                      : ''
                  "
                  :class="[
                    'px-1.5 py-0.5 rounded border',
                    eff(i, m)[c.key] && memberOf(m) && !memberOf(m)!.usable.includes(c.key)
                      ? 'border-offline/60 text-offline line-through'
                      : eff(i, m)[c.key]
                        ? 'border-signal bg-signal/15 text-foreground'
                        : 'border-border text-muted-foreground/50',
                  ]"
                  @click="toggleChannel(i, m, c.key)"
                >
                  {{ c.label }}
                </button>
              </span>
              <span
                v-if="lv.member_channels[m]"
                class="text-amber-400 order-3 sm:order-none"
                data-testid="channel-exception"
              >
                exception (habituellement : {{ channelLabel(memberOf(m)?.channels) }})
                <button v-if="canEdit" class="underline ml-1" @click="resetChannels(i, m)">
                  rétablir
                </button>
              </span>
              <span v-else class="text-muted-foreground/60 order-3 sm:order-none"
                >comme d'habitude</span
              >
              <button
                v-if="canEdit"
                class="ml-auto order-1 sm:order-none text-muted-foreground hover:text-offline px-1"
                title="retirer du niveau"
                @click="toggleMember(i, m)"
              >
                ✕
              </button>
            </li>
          </ul>
          <div v-if="canEdit" class="flex flex-wrap gap-1.5 items-center">
            <span class="text-[10px] text-muted-foreground">ajouter :</span>
            <button
              v-for="m in members.filter((x) => !lv.members.includes(x.id))"
              :key="m.id"
              :disabled="!!unreachable(m)"
              :title="unreachable(m) ? `Ne peut pas être prévenu : ${unreachable(m)}` : ''"
              data-testid="add-member"
              :class="[
                'text-xs px-2 py-0.5 rounded-full border',
                unreachable(m)
                  ? 'border-border/50 text-muted-foreground/40 cursor-not-allowed'
                  : 'border-border text-muted-foreground hover:border-signal hover:text-foreground',
              ]"
              @click="toggleMember(i, m.id)"
            >
              + {{ m.name }}
              <span class="text-[10px] opacity-70">
                {{
                  unreachable(m)
                    ? `— ${unreachable(m)}`
                    : m.usable
                        .map((k) =>
                          channelLabel({
                            email: k === 'email',
                            sms: k === 'sms',
                            call: k === 'call',
                          }),
                        )
                        .join(' · ')
                }}
                {{
                  !unreachable(m) && partial(m).length ? `(pas les ${partial(m).join('/')})` : ''
                }}
              </span>
            </button>
          </div>
        </li>
      </ol>
      <button v-if="canEdit" class="text-sm text-signal hover:underline" @click="addLevel">
        + niveau
      </button>

      <div class="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <label class="flex items-center gap-1"
          ><input v-model="draft.cumulative" :disabled="!canEdit" type="checkbox" /> cumuler (les
          niveaux précédents continuent de recevoir)</label
        >
        <label class="flex items-center gap-1"
          ><input v-model="draft.stop_on_clear" :disabled="!canEdit" type="checkbox" /> arrêter
          quand l'alarme disparaît</label
        >
        <label class="flex items-center gap-1"
          ><input v-model="draft.closure_notice" :disabled="!canEdit" type="checkbox" /> prévenir à
          la clôture</label
        >
      </div>

      <AlarmPreview
        v-if="changed"
        :device="device"
        :cfg="cfg"
        :esc="draft"
        title="Aperçu avec tes modifications (pas encore enregistrées)"
      />
      <ul v-if="problems.length" class="text-xs text-offline list-disc pl-5">
        <li v-for="p in problems" :key="p">{{ p }}</li>
      </ul>
      <div v-if="canEdit && changed" class="flex justify-end gap-2">
        <button class="px-3 py-1.5 text-sm" @click="reset">Annuler</button>
        <button
          class="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md disabled:opacity-40"
          :disabled="!!problems.length || saving"
          @click="save"
        >
          Enregistrer l'escalade
        </button>
      </div>
    </template>
  </section>
</template>

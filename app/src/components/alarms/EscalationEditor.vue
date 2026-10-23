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
  props.cfg.subsOf(props.device.id).map((s) => ({
    id: s.box_recipient_id,
    name: props.cfg.personById.value.get(s.recipient_id)?.name ?? s.box_recipient_id,
    channels: props.cfg.channelsOn(s),
  })),
)
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
      else if (!CHANNELS.some((c) => eff(i, m)[c.key]))
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
              class="flex items-center gap-2 text-xs"
              data-testid="level-member"
            >
              <span :class="['w-40 truncate', !memberOf(m) && 'text-offline']"
                >{{ cfg.memberName(device.id, m) }}{{ memberOf(m) ? '' : ' ⚠' }}</span
              >
              <span class="inline-flex gap-1">
                <button
                  v-for="c in CHANNELS"
                  :key="c.key"
                  :disabled="
                    !canEdit ||
                    !memberOf(m) ||
                    (!memberOf(m)!.channels?.[c.key] && !eff(i, m)[c.key])
                  "
                  :title="
                    memberOf(m) && !memberOf(m)!.channels?.[c.key]
                      ? 'pas activé sur sa fiche : la box ne l\'utilisera pas (l\'escalade ne peut que restreindre ses canaux)'
                      : ''
                  "
                  :class="[
                    'px-1.5 py-0.5 rounded border',
                    eff(i, m)[c.key] && memberOf(m) && !memberOf(m)!.channels?.[c.key]
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
                class="text-amber-400"
                data-testid="channel-exception"
              >
                exception (habituellement : {{ channelLabel(memberOf(m)?.channels) }})
                <button v-if="canEdit" class="underline ml-1" @click="resetChannels(i, m)">
                  rétablir
                </button>
              </span>
              <span v-else class="text-muted-foreground/60">comme d'habitude</span>
              <button
                v-if="canEdit"
                class="ml-auto text-muted-foreground hover:text-offline"
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
              class="text-xs px-2 py-0.5 rounded-full border border-border text-muted-foreground hover:border-signal hover:text-foreground"
              @click="toggleMember(i, m.id)"
            >
              + {{ m.name }}
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

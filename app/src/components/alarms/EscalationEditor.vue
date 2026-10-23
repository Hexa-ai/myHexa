<script setup lang="ts">
// PROTOTYPE — éditeur de la chaîne d'escalade d'une box (format set_escalation du firmware).
import { computed, ref, watch } from 'vue'
import {
  LEVELS,
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
const CH: (keyof Channels)[] = ['email', 'sms', 'call']
const CH_LABEL: Record<keyof Channels, string> = { email: 'mail', sms: 'SMS', call: 'appel' }

const stored = computed(
  () => props.cfg.escOf(props.device.id)?.config ?? props.device.reportedEscalation ?? null,
)
const draft = ref<Escalation | null>(null)
function reset() {
  draft.value = stored.value ? JSON.parse(JSON.stringify({ ...DEFAULT, ...stored.value })) : null
}
watch(() => props.device.id, reset, { immediate: true })
const changed = computed(
  () =>
    JSON.stringify(draft.value) !==
    JSON.stringify(stored.value ? { ...DEFAULT, ...stored.value } : null),
)

const members = computed(() =>
  props.cfg.subsOf(props.device.id).map((s) => ({
    id: s.box_recipient_id,
    name: props.cfg.contactById.value.get(s.contact_id)?.name ?? s.box_recipient_id,
  })),
)

function create() {
  draft.value = JSON.parse(JSON.stringify(DEFAULT))
  addLevel()
}
function addLevel() {
  if (!draft.value) return
  const n = draft.value.levels.length
  draft.value.levels.push({
    name: `Niveau ${n + 1}`,
    delay_seconds: n === 0 ? 0 : 300,
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
const minutes = (s: number) => Math.round(s / 60)
function setMinutes(i: number, v: string) {
  draft.value!.levels[i].delay_seconds = Math.max(0, Math.round(Number(v) || 0)) * 60
}

const problems = computed(() => {
  const d = draft.value
  if (!d) return []
  const ids = new Set(members.value.map((m) => m.id))
  const out: string[] = []
  if (d.mode === 'escalation' && !d.levels.length) out.push('aucun niveau')
  d.levels.forEach((l, i) => {
    if (!l.members.length) out.push(`niveau ${i + 1} sans membre`)
    for (const m of l.members)
      if (!ids.has(m))
        out.push(
          `niveau ${i + 1} : ${props.cfg.memberName(props.device.id, m)} n'est plus destinataire de la box`,
        )
    if (!l.channels.email && !l.channels.sms && !l.channels.call)
      out.push(`niveau ${i + 1} sans canal`)
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
      >
        modifiée — à envoyer
      </span>
    </div>

    <div v-if="!draft" class="text-sm text-muted-foreground">
      Pas d'escalade : toutes les alarmes partent en même temps à tous les destinataires.
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
          Alarmes concernées
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
      <p v-if="draft.mode === 'immediate'" class="text-xs text-muted-foreground">
        Mode immédiat : la chaîne reste enregistrée sur la box, prête à être réactivée.
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
              class="flex-1 min-w-[120px] border border-border bg-secondary/30 rounded px-2 py-1 text-sm"
            />
            <label class="text-xs flex items-center gap-1">
              {{ i === 0 ? 'après' : 'puis après' }}
              <input
                :value="minutes(lv.delay_seconds)"
                :disabled="!canEdit"
                type="number"
                min="0"
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
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="m in members"
              :key="m.id"
              :disabled="!canEdit"
              :class="[
                'text-xs px-2 py-0.5 rounded-full border transition',
                lv.members.includes(m.id)
                  ? 'border-signal text-foreground bg-signal/15'
                  : 'border-border text-muted-foreground/60',
              ]"
              @click="toggleMember(i, m.id)"
            >
              {{ m.name }}
            </button>
            <span
              v-for="m in lv.members.filter((x) => !members.some((y) => y.id === x))"
              :key="m"
              class="text-xs px-2 py-0.5 rounded-full border border-offline text-offline"
              title="n'est plus destinataire de cette box"
            >
              {{ cfg.memberName(device.id, m) }} ⚠
            </span>
          </div>
          <div class="flex gap-3 text-xs">
            <label v-for="ch in CH" :key="ch" class="flex items-center gap-1">
              <input v-model="lv.channels[ch]" :disabled="!canEdit" type="checkbox" />
              {{ CH_LABEL[ch] }}
            </label>
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

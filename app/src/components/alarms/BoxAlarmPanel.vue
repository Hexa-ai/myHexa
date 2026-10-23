<script setup lang="ts">
// PROTOTYPE — panneau d'une box : ses destinataires d'alarme + son escalade.
import { computed, ref } from 'vue'
import { LEVELS, channelLabel, type AlarmConfig, type Device } from '@/composables/useAlarmConfig'
import EscalationEditor from './EscalationEditor.vue'
import AlarmPreview from './AlarmPreview.vue'

const props = defineProps<{ device: Device; cfg: AlarmConfig; canEdit: boolean }>()
const emit = defineEmits<{ close: []; copy: [Device]; changed: []; person: [string] }>()

const rows = computed(() =>
  props.cfg
    .subsOf(props.device.id)
    .map((s) => ({
      s,
      p: props.cfg.personById.value.get(s.recipient_id),
      r: props.cfg.receives(s),
    }))
    .sort((a, b) => (a.p?.name ?? '').localeCompare(b.p?.name ?? '')),
)
const search = ref('')
const candidates = computed(() => {
  const q = search.value.trim().toLowerCase()
  return props.cfg.people.value
    .filter((c) => !props.cfg.subOf(c.id, props.device.id))
    .filter(
      (c) => !q || `${c.name} ${c.contact_email ?? ''} ${c.phone ?? ''}`.toLowerCase().includes(q),
    )
    .slice(0, 8)
})
async function add(personId: string) {
  await props.cfg.addSubs([{ recipient_id: personId, device_id: props.device.id }])
  search.value = ''
}
const state = computed(() => props.cfg.syncState(props.device))
// compatibilité firmware : pas de réglage possible sur une box qui ne saurait pas l'appliquer
const cap = computed(() => props.cfg.capability(props.device))
const edit = computed(() => props.canEdit && cap.value.level !== 'none')
const escEdit = computed(() => props.canEdit && cap.value.level === 'full')
async function send() {
  await props.cfg.send(props.device)
  emit('changed')
}
/** types d'alarme reçus directement (hors escalade) */
const direct = (r: ReturnType<AlarmConfig['receives']>, filters: Record<string, boolean>) =>
  LEVELS.filter((l) => filters[l.key] && !r.escTypes.includes(l.label)).map((l) => l.label)
</script>

<template>
  <div class="fixed inset-0 z-40 bg-black/50 flex justify-end" @click.self="emit('close')">
    <aside
      class="bg-card border-l border-border w-full max-w-2xl h-full overflow-y-auto p-5 space-y-5"
      data-testid="box-panel"
    >
      <header class="flex items-start justify-between gap-3">
        <div>
          <h3 class="font-semibold">{{ device.name }}</h3>
          <div class="font-mono text-[10px] text-muted-foreground">
            {{ device.running_version ? `v${device.running_version} · ` : '' }}
            <span :class="state.cls" :title="state.hint">{{ state.label }}</span>
          </div>
          <p
            v-if="cap.level !== 'full'"
            :class="[
              'text-xs mt-1 rounded border px-2 py-1',
              cap.level === 'none'
                ? 'border-offline/50 text-offline'
                : 'border-amber-400/50 text-amber-400',
            ]"
            data-testid="fw-compat"
          >
            {{ cap.level === 'none' ? 'Lecture seule' : 'Escalade en lecture seule' }}
            — {{ cap.hint }}
            <template v-if="cap.level === 'none'">
              Affichage en lecture seule de ce que la box a déclaré.</template
            >
          </p>
          <p
            v-if="device.lastAck && ['error', 'rejected'].includes(device.lastAck.status)"
            class="text-xs text-offline mt-1"
          >
            Dernier refus de la box ({{ device.lastAck.type }}) : {{ device.lastAck.detail }}
          </p>
        </div>
        <div class="flex gap-2 shrink-0">
          <button
            v-if="canEdit && cfg.pilotable(device)"
            class="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md"
            data-testid="box-send"
            @click="send"
          >
            Envoyer à la box
          </button>
          <button
            class="px-2 text-muted-foreground hover:text-foreground"
            data-testid="box-close"
            @click="emit('close')"
          >
            ✕
          </button>
        </div>
      </header>

      <section class="space-y-2">
        <div class="flex items-center justify-between">
          <h4 class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Destinataires ({{ rows.length }})
          </h4>
          <button
            v-if="edit && rows.length"
            class="font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-signal"
            @click="emit('copy', device)"
          >
            copier vers d'autres box…
          </button>
        </div>
        <ul class="divide-y divide-border/60 border border-border rounded-md">
          <li
            v-for="{ s, p, r } in rows"
            :key="s.recipient_id"
            class="flex items-center gap-3 px-3 py-2"
            data-testid="box-recipient"
          >
            <div class="flex-1 min-w-0">
              <button
                :class="[
                  'text-sm hover:text-signal text-left',
                  p && !p.alarm_enabled && 'line-through text-muted-foreground',
                ]"
                @click="emit('person', s.recipient_id)"
              >
                {{ p?.name }}
                <span
                  v-if="p && !p.portal_access"
                  class="ml-1 font-mono text-[9px] uppercase text-muted-foreground border border-border rounded px-1"
                  >sans accès portail</span
                >
              </button>
              <div class="text-[11px] text-muted-foreground space-y-0.5">
                <div v-if="direct(r, s.filters).length">
                  {{ direct(r, s.filters).join(' ') }} : directement, par
                  {{ channelLabel(r.channels) }}
                  <span v-if="s.channels_override" class="text-amber-400"
                    >(propre à cette box)</span
                  >
                </div>
                <div v-for="lv in r.levels" :key="lv.n" class="text-signal">
                  {{ r.escTypes.join(' ') }} : escalade niveau {{ lv.n }}, par
                  {{ channelLabel(lv.ch) }}
                  <span v-if="lv.exception" class="text-amber-400">(exception)</span>
                </div>
                <div
                  v-if="
                    r.escTypes.length &&
                    !r.levels.length &&
                    LEVELS.some((l) => s.filters[l.key] && r.escTypes.includes(l.label))
                  "
                  class="text-amber-400"
                >
                  {{ r.escTypes.join(' ') }} : passe par l'escalade, dont il ne fait pas partie
                </div>
              </div>
            </div>
            <div class="flex gap-0.5">
              <button
                v-for="l in LEVELS"
                :key="l.key"
                :disabled="!edit"
                :title="l.key"
                :class="[
                  'w-6 h-6 rounded text-[10px] font-mono',
                  s.filters[l.key] ? l.cls : 'bg-secondary/40 text-muted-foreground/40',
                ]"
                @click="cfg.toggleFilter(s, l.key)"
              >
                {{ l.label }}
              </button>
            </div>
            <button
              v-if="edit"
              class="text-xs text-muted-foreground hover:text-offline"
              title="retirer de la box"
              @click="cfg.removeSub(s)"
            >
              ✕
            </button>
          </li>
          <li v-if="!rows.length" class="px-3 py-2 text-sm text-muted-foreground">
            Aucun destinataire.
          </li>
        </ul>
        <div v-if="edit" class="relative">
          <input
            v-model="search"
            type="search"
            placeholder="Ajouter une personne de l'entreprise…"
            autocomplete="off"
            data-1p-ignore="true"
            data-lpignore="true"
            class="w-full border border-border bg-secondary/30 rounded-md px-3 py-2 text-sm"
          />
          <ul
            v-if="search"
            class="absolute z-10 mt-1 w-full bg-card border border-border rounded-md shadow-lg"
          >
            <li v-for="c in candidates" :key="c.id">
              <button
                class="w-full text-left px-3 py-1.5 text-sm hover:bg-secondary/50"
                @click="add(c.id)"
              >
                {{ c.name }}
                <span class="text-xs text-muted-foreground">{{ c.contact_email || c.phone }}</span>
              </button>
            </li>
            <li v-if="!candidates.length" class="px-3 py-1.5 text-sm text-muted-foreground">
              Personne : créez-la avec « + Personne ».
            </li>
          </ul>
        </div>
      </section>

      <AlarmPreview :device="device" :cfg="cfg" />

      <EscalationEditor :device="device" :cfg="cfg" :can-edit="escEdit" />
    </aside>
  </div>
</template>

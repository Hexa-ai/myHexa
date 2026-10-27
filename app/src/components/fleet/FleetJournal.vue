<script setup lang="ts">
// Journal d'une box : réception, livraison, retours, modifications ; annulation d'une modification descriptive
import { computed, onMounted, ref } from 'vue'
import {
  sb,
  pgMsg,
  fmtDay,
  EDITABLE,
  FIELD_LABEL,
  STATUS_LABEL,
  type FleetDevice,
  type FleetStatus,
} from '@/composables/useFleet'

const props = defineProps<{
  device: FleetDevice
  companyName: (id: string) => string
  canEdit: boolean
}>()
const emit = defineEmits<{ close: []; changed: [] }>()

interface Ev {
  id: number
  at: string
  kind: string
  changes: Record<string, [unknown, unknown]> | null
  note: string | null
}
const events = ref<Ev[]>([])
const note = ref('')
const error = ref<string | null>(null)

const KIND: Record<string, string> = {
  received: 'Entrée dans le parc',
  delivered: 'Livraison',
  stock: 'Remise en stock',
  return: 'Retour / RMA',
  scrapped: 'Mise au rebut',
  status: 'Changement de statut',
  edit: 'Modification',
  import: 'Import',
  revert: 'Annulation',
  note: 'Note',
}

async function load() {
  const { data, error: e } = await sb
    .from('device_events')
    .select('id, at, kind, changes, note')
    .eq('device_id', props.device.id)
    .order('at', { ascending: false })
  if (e) error.value = pgMsg(e)
  events.value = data ?? []
}
onMounted(load)

function val(f: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return '(vide)'
  if (f === 'company_id') return props.companyName(String(v))
  if (f === 'fleet_status') return STATUS_LABEL[v as FleetStatus] ?? String(v)
  if (f.endsWith('_at')) return fmtDay(String(v))
  return String(v)
}

/** modifications annulables : champs descriptifs uniquement */
const revertable = (e: Ev) =>
  ['edit', 'import'].includes(e.kind) &&
  !!e.changes &&
  Object.keys(e.changes).every((f) => (EDITABLE as readonly string[]).includes(f))

async function revert(e: Ev) {
  if (!e.changes) return
  const row: Record<string, unknown> = { id: props.device.id }
  for (const [f, [before]] of Object.entries(e.changes)) row[f] = before
  const { error: err } = await sb.rpc('fleet_apply', { p_rows: [row], p_kind: 'revert' })
  if (err) {
    error.value = pgMsg(err)
    return
  }
  emit('changed')
  load()
}

async function addNote() {
  if (!note.value.trim()) return
  const { error: err } = await sb
    .from('device_events')
    .insert({ device_id: props.device.id, kind: 'note', note: note.value.trim() })
  if (err) {
    error.value = pgMsg(err)
    return
  }
  note.value = ''
  load()
}

const title = computed(() => props.device.serial_number || props.device.name)
</script>

<template>
  <div class="fixed inset-0 z-50 bg-black/40 flex justify-end" @click.self="emit('close')">
    <aside
      class="bg-background border-l border-border w-full max-w-md h-full overflow-y-auto p-5 space-y-4"
      data-testid="fleet-journal"
    >
      <div class="flex items-start justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold tracking-tight font-mono">{{ title }}</h2>
          <p class="text-xs text-muted-foreground">
            {{ device.name }} · {{ companyName(device.company_id) }}
          </p>
        </div>
        <button class="text-muted-foreground hover:text-foreground text-sm" @click="emit('close')">
          Fermer
        </button>
      </div>

      <form v-if="canEdit" class="flex gap-2" @submit.prevent="addNote">
        <input
          v-model="note"
          data-testid="journal-note"
          class="flex-1 bg-card border border-border rounded-md px-3 py-1.5 text-sm"
          placeholder="Ajouter une note (RMA, panne, remplacement…)"
        />
        <button class="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-secondary">
          Ajouter
        </button>
      </form>
      <p v-if="error" class="text-sm text-offline">{{ error }}</p>

      <ol class="space-y-3">
        <li
          v-for="e in events"
          :key="e.id"
          class="neu-card border border-border rounded-md p-3 text-sm"
          data-testid="journal-event"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="font-medium">{{ KIND[e.kind] ?? e.kind }}</span>
            <span class="font-mono text-[11px] text-muted-foreground">
              {{
                new Date(e.at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
              }}
            </span>
          </div>
          <p v-if="e.note" class="mt-1 text-sm">{{ e.note }}</p>
          <ul v-if="e.changes" class="mt-1 space-y-0.5 text-xs">
            <li v-for="(ch, f) in e.changes" :key="f">
              <span class="text-muted-foreground">{{ FIELD_LABEL[f] ?? f }} :&nbsp;</span>
              <template v-if="e.kind !== 'received'">
                <span class="font-mono line-through text-muted-foreground">{{
                  val(String(f), ch[0])
                }}</span>
                →
              </template>
              <span class="font-mono">{{ val(String(f), ch[1]) }}</span>
            </li>
          </ul>
          <button
            v-if="canEdit && revertable(e)"
            class="mt-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-signal"
            data-testid="journal-revert"
            @click="revert(e)"
          >
            Annuler cette modification
          </button>
        </li>
        <li v-if="!events.length" class="text-sm text-muted-foreground">
          Aucun événement enregistré (le journal démarre avec le parc).
        </li>
      </ol>
    </aside>
  </div>
</template>

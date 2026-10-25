<script setup lang="ts">
// Livraison : box sélectionnées -> entreprise (existante ou créée sur place), facture, date, projet
import { computed, onMounted, ref, watch } from 'vue'
import { sb, pgMsg, type FleetDevice } from '@/composables/useFleet'

const props = defineProps<{
  devices: FleetDevice[]
  companies: { id: string; name: string; is_hexa_internal: boolean }[]
}>()
const emit = defineEmits<{ close: []; done: [] }>()

const query = ref('')
const companyId = ref<string | null>(null)
const invoice = ref('')
const date = ref(new Date().toISOString().slice(0, 10))
const projectId = ref<string | null>(null)
const projects = ref<{ id: string; name: string; company_id: string }[]>([])
const busy = ref(false)
const error = ref<string | null>(null)

onMounted(async () => {
  const { data } = await sb.from('projects').select('id, name, company_id').order('name')
  projects.value = data ?? []
})

const clients = computed(() => props.companies.filter((c) => !c.is_hexa_internal))
const matches = computed(() => {
  const q = query.value.trim().toLowerCase()
  return q ? clients.value.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 8) : []
})
const exact = computed(() =>
  clients.value.find((c) => c.name.toLowerCase() === query.value.trim().toLowerCase()),
)
const chosen = computed(() => props.companies.find((c) => c.id === companyId.value) ?? null)
const newName = computed(() => (!companyId.value && !exact.value ? query.value.trim() : ''))
const companyProjects = computed(() =>
  projects.value.filter((p) => p.company_id === (companyId.value ?? exact.value?.id)),
)
watch(companyId, () => (projectId.value = null))

function pick(id: string) {
  companyId.value = id
  query.value = props.companies.find((c) => c.id === id)?.name ?? ''
}
function onType() {
  companyId.value = null
}

const canSubmit = computed(() => !busy.value && (companyId.value || exact.value || newName.value))

async function submit() {
  busy.value = true
  error.value = null
  const { error: e } = await sb.rpc('fleet_deliver', {
    p_ids: props.devices.map((d) => d.id),
    p_company_id: companyId.value ?? exact.value?.id ?? null,
    p_new_company: newName.value || null,
    p_invoice: invoice.value || null,
    p_date: date.value || null,
    p_project_id: projectId.value,
  })
  busy.value = false
  if (e) {
    error.value = pgMsg(e)
    return
  }
  emit('done')
}
</script>

<template>
  <div
    class="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto"
    @click.self="emit('close')"
  >
    <form
      class="bg-background border border-border rounded-lg w-full max-w-lg p-5 space-y-4 mt-10"
      data-testid="fleet-deliver"
      @submit.prevent="submit"
    >
      <h2 class="text-lg font-semibold tracking-tight">Livrer {{ devices.length }} box</h2>
      <p class="text-xs text-muted-foreground font-mono truncate">
        {{ devices.map((d) => d.serial_number || d.name).join(', ') }}
      </p>

      <label class="block space-y-1">
        <span class="text-xs text-muted-foreground">Entreprise</span>
        <input
          v-model="query"
          data-testid="deliver-company"
          class="w-full bg-card border border-border rounded-md px-3 py-2 text-sm"
          placeholder="Rechercher ou saisir une nouvelle entreprise"
          autocomplete="off"
          @input="onType"
        />
      </label>
      <div
        v-if="!companyId && matches.length"
        class="border border-border rounded-md divide-y divide-border/60 -mt-2"
      >
        <button
          v-for="c in matches"
          :key="c.id"
          type="button"
          class="w-full text-left px-3 py-1.5 text-sm hover:bg-secondary/60"
          @click="pick(c.id)"
        >
          {{ c.name }}
        </button>
      </div>
      <p v-if="chosen || exact" class="text-xs text-signal -mt-2">
        Entreprise existante : {{ (chosen ?? exact)!.name }}
      </p>
      <p v-else-if="newName" class="text-xs text-amber-600 -mt-2" data-testid="deliver-new-company">
        Nouvelle entreprise « {{ newName }} » : elle sera créée à la validation.
      </p>

      <div class="grid grid-cols-2 gap-3">
        <label class="block space-y-1">
          <span class="text-xs text-muted-foreground">N° de facture</span>
          <input
            v-model="invoice"
            data-testid="deliver-invoice"
            class="w-full bg-card border border-border rounded-md px-3 py-2 text-sm font-mono"
          />
        </label>
        <label class="block space-y-1">
          <span class="text-xs text-muted-foreground">Date de livraison</span>
          <input
            v-model="date"
            type="date"
            class="w-full bg-card border border-border rounded-md px-3 py-2 text-sm"
          />
        </label>
      </div>
      <label v-if="companyProjects.length" class="block space-y-1">
        <span class="text-xs text-muted-foreground">Projet (facultatif)</span>
        <select
          v-model="projectId"
          class="w-full bg-card border border-border rounded-md px-3 py-2 text-sm"
        >
          <option :value="null">Aucun</option>
          <option v-for="p in companyProjects" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
      </label>

      <p v-if="error" class="text-sm text-offline">{{ error }}</p>
      <div class="flex justify-end gap-2">
        <button
          type="button"
          class="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
          @click="emit('close')"
        >
          Annuler
        </button>
        <button
          type="submit"
          :disabled="!canSubmit"
          data-testid="deliver-submit"
          class="px-3 py-1.5 text-sm rounded-md bg-signal text-background disabled:opacity-40"
        >
          Livrer
        </button>
      </div>
    </form>
  </div>
</template>

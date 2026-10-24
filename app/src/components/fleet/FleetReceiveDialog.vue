<script setup lang="ts">
// Réception d'un lot : infos communes une fois, puis une ligne par box (n° de série ; MAC), collées depuis Excel ou tapées
import { computed, ref } from 'vue'
import { sb, pgMsg, normMac, macValid, normSerial, type FleetDevice } from '@/composables/useFleet'

const props = defineProps<{ existing: FleetDevice[]; hexaId: string }>()
const emit = defineEmits<{ close: []; done: [n: number] }>()

const today = new Date().toISOString().slice(0, 10)
const receivedAt = ref(today)
const supplier = ref('')
const purchaseRef = ref('')
const name = ref('Stock')
const osVersion = ref('')
const hasBattery = ref(false)
const hasSupercap = ref(false)
const text = ref('')
const busy = ref(false)
const error = ref<string | null>(null)

interface Line {
  n: number
  serial: string | null
  mac: string | null
  err: string | null
}

const lines = computed<Line[]>(() => {
  const macs = new Set(props.existing.map((d) => d.mac_eth0?.trim().toLowerCase()).filter(Boolean))
  const sns = new Set(
    props.existing.map((d) => d.serial_number?.trim().toUpperCase()).filter(Boolean),
  )
  const seenM = new Set<string>()
  const seenS = new Set<string>()
  const out: Line[] = []
  text.value.split(/\r?\n/).forEach((raw, i) => {
    if (!raw.trim()) return
    const parts = raw
      .split(/[\t;,]|\s{2,}/)
      .map((x) => x.trim())
      .filter(Boolean)
    // ordre libre : la colonne qui ressemble à une MAC est la MAC
    let mac: string | null = null
    let serial: string | null = null
    for (const p of parts) {
      // ressemble à une MAC : séparateurs « : » ou « - », ou 12 chiffres hexa
      const macLike = /^[0-9a-f]{1,2}([:-][0-9a-f]{0,2})+$/i.test(p) || /^[0-9a-f]{12}$/i.test(p)
      if (!mac && macLike) mac = normMac(p)
      else if (!serial) serial = normSerial(p)
    }
    let err: string | null = null
    if (!serial && !mac) err = 'ligne vide'
    else if (mac && !macValid(mac)) err = 'MAC invalide'
    else if (mac && macs.has(mac)) err = 'MAC déjà dans le parc'
    else if (serial && sns.has(serial)) err = 'n° de série déjà dans le parc'
    else if (mac && seenM.has(mac)) err = 'MAC en double dans la liste'
    else if (serial && seenS.has(serial)) err = 'n° de série en double dans la liste'
    if (mac) seenM.add(mac)
    if (serial) seenS.add(serial)
    out.push({ n: i + 1, serial, mac, err })
  })
  return out
})
const nErr = computed(() => lines.value.filter((l) => l.err).length)
const nMissingMac = computed(() => lines.value.filter((l) => !l.err && !l.mac).length)

async function submit() {
  if (!lines.value.length || nErr.value) return
  busy.value = true
  error.value = null
  const rows = lines.value.map((l) => ({
    name: name.value.trim() || 'Stock',
    serial_number: l.serial,
    mac_eth0: l.mac,
    company_id: props.hexaId,
    fleet_status: 'stock',
    received_at: receivedAt.value || null,
    supplier: supplier.value.trim() || null,
    purchase_ref: purchaseRef.value.trim() || null,
    os_version: osVersion.value.trim() || null,
    has_battery: hasBattery.value,
    has_supercap: hasSupercap.value,
  }))
  const { error: e } = await sb.from('devices').insert(rows)
  busy.value = false
  if (e) {
    error.value = pgMsg(e)
    return
  }
  emit('done', rows.length)
}
</script>

<template>
  <div
    class="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto"
    @click.self="emit('close')"
  >
    <form
      class="bg-background border border-border rounded-lg w-full max-w-2xl p-5 space-y-4 mt-6"
      data-testid="fleet-receive"
      @submit.prevent="submit"
    >
      <h2 class="text-lg font-semibold tracking-tight">Réception d'un lot</h2>
      <p class="text-xs text-muted-foreground">
        Infos communes à toutes les box du lot. Elles arrivent en stock chez Hexa-AI.
      </p>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <label class="block space-y-1">
          <span class="text-xs text-muted-foreground">Date de réception</span>
          <input
            v-model="receivedAt"
            type="date"
            class="w-full bg-card border border-border rounded-md px-3 py-2 text-sm"
          />
        </label>
        <label class="block space-y-1">
          <span class="text-xs text-muted-foreground">Fournisseur</span>
          <input
            v-model="supplier"
            data-testid="receive-supplier"
            class="w-full bg-card border border-border rounded-md px-3 py-2 text-sm"
          />
        </label>
        <label class="block space-y-1">
          <span class="text-xs text-muted-foreground">Réf. commande</span>
          <input
            v-model="purchaseRef"
            data-testid="receive-ref"
            class="w-full bg-card border border-border rounded-md px-3 py-2 text-sm font-mono"
          />
        </label>
        <label class="block space-y-1">
          <span class="text-xs text-muted-foreground">Nom par défaut</span>
          <input
            v-model="name"
            class="w-full bg-card border border-border rounded-md px-3 py-2 text-sm"
          />
        </label>
        <label class="block space-y-1">
          <span class="text-xs text-muted-foreground">Version d'OS</span>
          <input
            v-model="osVersion"
            class="w-full bg-card border border-border rounded-md px-3 py-2 text-sm font-mono"
          />
        </label>
        <div class="flex items-end gap-4 pb-2 text-sm">
          <label class="inline-flex items-center gap-1.5"
            ><input v-model="hasBattery" type="checkbox" /> Batterie</label
          >
          <label class="inline-flex items-center gap-1.5"
            ><input v-model="hasSupercap" type="checkbox" /> Supercap</label
          >
        </div>
      </div>

      <label class="block space-y-1">
        <span class="text-xs text-muted-foreground">
          Une box par ligne : n° de série et adresse MAC (colonnes collées depuis Excel, ou séparées
          par ; ou une tabulation)
        </span>
        <textarea
          v-model="text"
          rows="8"
          data-testid="receive-lines"
          class="w-full bg-card border border-border rounded-md px-3 py-2 text-sm font-mono"
          placeholder="ES262200498	88:a2:9e:93:14:6e&#10;ES262200499	88:a2:9e:93:14:6f"
        />
      </label>

      <div
        v-if="lines.length"
        class="border border-border rounded-md max-h-56 overflow-y-auto"
        data-testid="receive-preview"
      >
        <table class="w-full text-xs font-mono">
          <thead class="bg-card/60 text-muted-foreground">
            <tr>
              <th class="text-left px-2 py-1">#</th>
              <th class="text-left px-2 py-1">N° de série</th>
              <th class="text-left px-2 py-1">MAC</th>
              <th class="text-left px-2 py-1"></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="l in lines"
              :key="l.n"
              :class="l.err ? 'text-offline' : ''"
              class="border-t border-border/50"
            >
              <td class="px-2 py-1 text-muted-foreground">{{ l.n }}</td>
              <td class="px-2 py-1">{{ l.serial ?? '—' }}</td>
              <td class="px-2 py-1">{{ l.mac ?? '—' }}</td>
              <td class="px-2 py-1">
                {{ l.err ?? (l.mac ? '' : 'sans MAC : pas de provisionnement') }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="text-xs text-muted-foreground" data-testid="receive-summary">
        {{ lines.length }} box<span v-if="nErr" class="text-offline">
          · {{ nErr }} erreur(s) à corriger</span
        >
        <span v-if="nMissingMac"> · {{ nMissingMac }} sans MAC</span>
      </p>

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
          data-testid="receive-submit"
          :disabled="busy || !lines.length || nErr > 0"
          class="px-3 py-1.5 text-sm rounded-md bg-signal text-background disabled:opacity-40"
        >
          Ajouter {{ lines.length }} box au stock
        </button>
      </div>
    </form>
  </div>
</template>

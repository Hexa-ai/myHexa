<script setup lang="ts">
// Options du bloc « Synoptique » dans l'éditeur de bloc : box, choix d'un synoptique existant, ou création (vide / import JSON).
import { ref, watch } from 'vue'
import type { Widget } from '@/composables/useDashboards'
import type { DeviceWithStatus } from '@/composables/useDevices'
import {
  chargerSynoptique,
  creerSynoptique,
  listerSynoptiques,
  type Synoptic,
} from '@/lib/synoptic/api'
import { documentVide, lireImport } from '@/lib/synoptic/documents'
import { variablesLiees } from '@/lib/synoptic/variables'
import SynopticCadrageOptions from './SynopticCadrageOptions.vue'

const props = defineProps<{
  widget: Widget
  devices: DeviceWithStatus[]
  companyId?: string | null
}>()
const w = props.widget

const existants = ref<Synoptic[]>([])
const nom = ref('')
const erreur = ref('')
const occupe = ref(false)

const deviceId = () => w.sources[0]?.device ?? props.devices[0]?.id ?? ''

async function lister() {
  existants.value = deviceId() ? await listerSynoptiques(deviceId()).catch(() => []) : []
}
watch(() => w.sources[0]?.device, lister, { immediate: true })

function choisirBox(id: string) {
  w.sources = [{ device: id, var: '' }]
  w.options.synoptic_id = undefined
  w.options.synoptic_vars = []
}

async function choisir(s: Synoptic) {
  w.options.synoptic_id = s.id
  if (!w.title) w.title = s.name
  const c = await chargerSynoptique(s.id).catch(() => null)
  w.options.synoptic_vars = c?.doc ? variablesLiees(c.doc) : []
}

async function creer(texteJson?: string) {
  erreur.value = ''
  const company = props.companyId ?? props.devices.find((d) => d.id === deviceId())?.company_id
  if (!company || !deviceId()) {
    erreur.value = 'Choisissez une box.'
    return
  }
  const importe = texteJson !== undefined ? lireImport(texteJson) : null
  if (importe?.erreur) {
    erreur.value = `Import impossible : ${importe.erreur}`
    return
  }
  const titre = nom.value.trim() || importe?.doc?.modele.meta?.titre || 'Synoptique'
  occupe.value = true
  try {
    const s = await creerSynoptique({
      companyId: company,
      deviceId: deviceId(),
      name: titre,
      doc: importe?.doc ?? documentVide(titre),
      source: importe ? 'import' : 'manual',
    })
    existants.value = [...existants.value, s]
    await choisir(s)
    nom.value = ''
  } catch (e) {
    erreur.value = (e as Error).message
  } finally {
    occupe.value = false
  }
}

async function surFichier(ev: Event) {
  const input = ev.target as HTMLInputElement
  const f = input.files?.[0]
  input.value = ''
  if (f) await creer(await f.text())
}
</script>

<template>
  <div class="mb-3 space-y-3" data-testid="synoptic-editor">
    <div v-if="devices.length > 1">
      <div class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
        Box
      </div>
      <select
        :value="deviceId()"
        class="bg-card border border-border rounded-sm px-2 py-1.5 text-sm"
        data-testid="synoptic-device"
        @change="choisirBox(($event.target as HTMLSelectElement).value)"
      >
        <option v-for="d in devices" :key="d.id" :value="d.id">{{ d.name }}</option>
      </select>
    </div>

    <div>
      <div class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
        Synoptique
      </div>
      <div v-if="existants.length" class="flex flex-wrap gap-1.5 mb-2">
        <button
          v-for="s in existants"
          :key="s.id"
          type="button"
          :class="[
            'text-xs px-2.5 py-1 rounded border',
            w.options.synoptic_id === s.id
              ? 'border-signal text-signal'
              : 'border-border text-muted-foreground hover:border-signal/50',
          ]"
          data-testid="synoptic-existant"
          @click="choisir(s)"
        >
          {{ s.name }}
        </button>
      </div>
      <p v-else class="text-xs text-muted-foreground mb-2">Aucun synoptique pour cette box.</p>
      <div class="flex flex-wrap items-center gap-2">
        <input
          v-model="nom"
          placeholder="Nom du nouveau synoptique"
          maxlength="120"
          class="bg-card border border-border rounded-sm px-2 py-1.5 text-sm min-w-0 flex-1"
          data-testid="synoptic-nom"
        />
        <button
          type="button"
          class="text-xs px-2.5 py-1.5 rounded border border-border hover:border-signal/50 disabled:opacity-50"
          :disabled="occupe"
          data-testid="synoptic-creer-vide"
          @click="creer()"
        >
          Créer un synoptique vide
        </button>
        <label
          class="text-xs px-2.5 py-1.5 rounded border border-border hover:border-signal/50 cursor-pointer"
        >
          Importer un JSON
          <input
            type="file"
            accept=".json,application/json"
            class="hidden"
            data-testid="synoptic-import"
            @change="surFichier"
          />
        </label>
      </div>
      <p v-if="erreur" class="text-xs text-destructive mt-2" data-testid="synoptic-erreur">
        {{ erreur }}
      </p>
      <p v-else-if="w.options.synoptic_id" class="text-xs text-muted-foreground mt-2">
        Synoptique choisi. Il se dessine depuis le bloc, bouton « Éditer le synoptique »
        (ordinateur).
      </p>
    </div>

    <SynopticCadrageOptions :widget="widget" />
  </div>
</template>

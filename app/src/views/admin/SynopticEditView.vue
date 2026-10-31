<script setup lang="ts">
// Éditeur de synoptique en plein cadre (toute la zone de contenu de l'application, menu latéral conservé).
// Enregistrer = nouvelle version ; « Retour » revient au tableau d'où l'on vient (query `retour`).
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { useDevices } from '@/composables/useDevices'
import { useSynoptic, useSynopticLive } from '@/composables/useSynoptic'
import { enregistrerVersion, synchroniserBlocs } from '@/lib/synoptic/api'
import type { SynopticDocument, SynopticEtat } from '@/lib/synoptic/engine/types'
import SynopticCanvas from '@/components/synoptic/SynopticCanvas.vue'
import SynopticFrame from '@/components/synoptic/SynopticFrame.vue'
import SynopticBar from '@/components/synoptic/SynopticBar.vue'
import SynopticResumeEditor from '@/components/synoptic/SynopticResumeEditor.vue'
import type { ResumeConfig } from '@/lib/synoptic/engine/types'

const route = useRoute()
const router = useRouter()
const id = computed(() => String(route.params.id))
const { allDevices, load } = useDevices()
onMounted(load)

const deviceId = ref<string>()
const device = computed(() => allDevices.value.find((d) => d.id === deviceId.value) ?? null)
const {
  charge,
  doc,
  chargement,
  erreur,
  values,
  enDirect,
  recu,
  variables,
  catalogue,
  chargerCatalogue,
  recharger,
} = useSynoptic(id, device)
watch(charge, (c) => (deviceId.value = c?.synoptic.device_ids[0]))
watch(() => device.value?.id, chargerCatalogue, { immediate: true })
useSynopticLive(deviceId, variables)

const etat = ref<SynopticEtat | null>(null)
const message = ref('')
const enregistrement = ref(false)
const canvas = ref<InstanceType<typeof SynopticCanvas> | null>(null)
const modifie = computed(() => !!etat.value?.modifie)

// onglets de l'éditeur : le dessin (toujours monté, caché sous l'autre onglet) et le résumé mobile
const onglet = ref<'dessin' | 'resume'>('dessin')
/** instantané du document pris à l'ouverture de l'onglet « Résumé mobile » (le dessin reste la référence) */
const docResume = ref<SynopticDocument | null>(null)
function ouvrirOnglet(o: 'dessin' | 'resume') {
  if (o === 'resume') docResume.value = canvas.value?.instance?.getDoc() ?? null
  onglet.value = o
}
function changerResume(c: ResumeConfig | undefined) {
  canvas.value?.instance?.setResume(c)
}

const retour = computed(() =>
  typeof route.query.retour === 'string' ? route.query.retour : '/admin/devices',
)
function revenir() {
  if (
    modifie.value &&
    !window.confirm('Des modifications ne sont pas enregistrées. Quitter quand même ?')
  )
    return
  void router.push(retour.value)
}

async function enregistrer(d?: SynopticDocument) {
  const instance = canvas.value?.instance
  const document = d ?? instance?.getDoc()
  if (!document || enregistrement.value) return
  enregistrement.value = true
  message.value = ''
  try {
    const v = await enregistrerVersion(id.value, document, 'manual')
    await synchroniserBlocs(id.value, document).catch(() => undefined)
    instance?.marquerEnregistre()
    message.value = `Version ${v} enregistrée`
    // retour au tableau : le tableau recharge le synoptique à l'affichage
    void router.push(retour.value)
  } catch (e) {
    message.value = `Échec de l'enregistrement : ${(e as Error).message}`
  } finally {
    enregistrement.value = false
  }
}

onBeforeRouteLeave(() => {
  if (modifie.value && !enregistrement.value && message.value === '') {
    return window.confirm('Des modifications ne sont pas enregistrées. Quitter quand même ?')
  }
  return true
})
defineExpose({ recharger })
</script>

<template>
  <div>
    <SynopticFrame enligne @close="() => undefined">
      <SynopticBar
        :titre="`Édition · ${charge?.synoptic.name ?? 'Synoptique'}`"
        :en-direct="enDirect"
        :recu="recu"
        :alarmes="etat?.alarmes ?? 0"
      >
        <span v-if="message" class="text-xs text-muted-foreground" data-testid="synoptic-message">{{
          message
        }}</span>
        <div class="flex rounded border border-border p-0.5" role="tablist" aria-label="Partie de l'éditeur">
          <button
            v-for="o in [
              { id: 'dessin', libelle: 'Dessin' },
              { id: 'resume', libelle: 'Résumé mobile' },
            ] as const"
            :key="o.id"
            type="button"
            role="tab"
            :aria-selected="onglet === o.id"
            class="rounded-sm px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider"
            :class="onglet === o.id ? 'bg-signal/15 text-signal' : 'text-muted-foreground hover:text-foreground'"
            :data-testid="`synoptic-onglet-${o.id}`"
            @click="ouvrirOnglet(o.id)"
          >
            {{ o.libelle }}
          </button>
        </div>
        <button
          type="button"
          class="text-xs px-2.5 py-1 rounded border border-border text-muted-foreground hover:text-foreground"
          data-testid="synoptic-retour"
          @click="revenir"
        >
          ← Retour au tableau
        </button>
      </SynopticBar>
      <p v-if="erreur" class="p-4 text-sm text-destructive">{{ erreur }}</p>
      <p v-else-if="chargement && !doc" class="p-4 text-sm text-muted-foreground">Chargement…</p>
      <div v-else-if="doc" class="relative flex-1 min-h-0">
        <SynopticResumeEditor
          v-if="onglet === 'resume' && docResume"
          class="absolute inset-0 z-10 bg-background"
          :doc="docResume"
          :values="values"
          @change="changerResume"
        />
        <SynopticCanvas
          ref="canvas"
          :inert="onglet === 'resume'"
          :doc="doc"
          :values="values"
          :catalogue="catalogue"
          editing
          full-frame
          @save="enregistrer"
          @etat="etat = $event"
        />
      </div>
    </SynopticFrame>
  </div>
</template>

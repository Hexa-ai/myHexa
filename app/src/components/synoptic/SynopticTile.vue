<script setup lang="ts">
// Tuile « synoptique » d'un tableau de bord : âge de la donnée, alarmes, et selon l'appareil
// - bureau : dessin animé ajusté à la tuile (tout le dessin, centré, à toute taille de tuile ; ou cadrage enregistré dans les options), bouton « Agrandir » (zone de contenu), bouton « Éditer » (droit de modifier) ;
// - tablette : dessin sans capture de geste + « Plein écran » ;
// - mobile : résumé lisible (alarmes, ouvrages) et « Voir le synoptique » (plein écran) ; aucun geste n'est capté.
import { computed, ref, toRef, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useSynoptic } from '@/composables/useSynoptic'
import { useAuthStore } from '@/stores/auth'
import { usePeutEditerIci, useModeAffichage } from '@/lib/synoptic/environnement'
import { construireResume, type CadreDessin } from '@/lib/synoptic/resume'
import { lireCadre } from '@/lib/synoptic/cadrage'
import type { DeviceWithStatus } from '@/composables/useDevices'
import type { SynopticEtat } from '@/lib/synoptic/engine/types'
import SynopticCanvas from './SynopticCanvas.vue'
import SynopticFrame from './SynopticFrame.vue'
import SynopticBar from './SynopticBar.vue'
import SynopticSummary from './SynopticSummary.vue'
import SynopticMobileFull from './SynopticMobileFull.vue'

const props = defineProps<{
  synopticId?: string
  title: string | null
  device: DeviceWithStatus | null | undefined
  /** cadrage enregistré dans les options de la tuile (rectangle du dessin en fractions) ; absent = ajusté automatiquement */
  cadreTuile?: unknown
}>()
const vueEnregistree = computed(() => lireCadre(props.cadreTuile) ?? null)

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const { charge, doc, chargement, erreur, values, enDirect, recu } = useSynoptic(
  toRef(props, 'synopticId'),
  toRef(props, 'device'),
)

const agrandi = ref(false)
const etat = ref<SynopticEtat | null>(null)
const bureau = usePeutEditerIci()
const mode = useModeAffichage()
// plein écran mobile / tablette (cadre = ouvrage sur lequel centrer, absent = tout le dessin)
const pleinEcran = ref(false)
const cadre = ref<CadreDessin | null>(null)
function ouvrirPleinEcran(c: CadreDessin | null = null) {
  cadre.value = c
  pleinEcran.value = true
}
watch(mode, (m) => {
  if (m === 'bureau') pleinEcran.value = false
  else agrandi.value = false
})
const resume = computed(() =>
  mode.value === 'mobile' && doc.value ? construireResume(doc.value, values.value) : null,
)
const nbAlarmes = computed(() => resume.value?.alarmes.length ?? etat.value?.alarmes ?? 0)
const peutModifier = computed(
  () =>
    auth.isHexaStaff ||
    (!!charge.value &&
      auth.recipient?.role === 'admin' &&
      auth.recipient?.company_id === charge.value.synoptic.company_id),
)
const peutEditer = computed(() => peutModifier.value && bureau.value && !!charge.value)
const titre = computed(() => props.title || charge.value?.synoptic.name || 'Synoptique')

function editer() {
  if (!props.synopticId) return
  void router.push({
    name: 'admin-synoptic-edit',
    params: { id: props.synopticId },
    query: { retour: route.fullPath },
  })
}
</script>

<template>
  <div
    class="h-full border border-border rounded-md bg-card/40 flex flex-col min-w-0 min-h-0 overflow-hidden"
    data-testid="widget-synoptic"
  >
    <SynopticBar :titre="titre" :en-direct="enDirect" :recu="recu" :alarmes="nbAlarmes">
      <button
        v-if="peutEditer"
        type="button"
        class="text-xs px-2.5 py-1 rounded border border-signal text-signal"
        data-testid="synoptic-editer-tuile"
        @click="editer"
      >
        Éditer le synoptique
      </button>
      <button
        v-if="mode === 'tablette'"
        type="button"
        class="text-xs px-2.5 py-1 rounded border border-border text-muted-foreground hover:border-signal/50 hover:text-foreground"
        data-testid="synoptic-plein-ecran"
        @click="ouvrirPleinEcran()"
      >
        Plein écran
      </button>
      <button
        v-else-if="mode === 'bureau'"
        type="button"
        class="text-xs px-2.5 py-1 rounded border border-border text-muted-foreground hover:border-signal/50 hover:text-foreground"
        data-testid="synoptic-agrandir"
        @click="agrandi = true"
      >
        Agrandir
      </button>
    </SynopticBar>
    <p v-if="erreur" class="p-4 text-sm text-destructive">{{ erreur }}</p>
    <p v-else-if="chargement && !doc" class="p-4 text-sm text-muted-foreground">Chargement…</p>
    <p v-else-if="!doc" class="p-4 text-sm text-muted-foreground">
      Ce synoptique est vide.
      <button v-if="peutEditer" type="button" class="underline text-signal" @click="editer">
        Ouvrir l'éditeur
      </button>
    </p>
    <SynopticSummary
      v-else-if="resume"
      :resume="resume"
      class="min-h-0 overflow-y-auto"
      @ouvrir="ouvrirPleinEcran"
    />
    <div v-else-if="!agrandi" class="flex-1 min-h-0">
      <SynopticCanvas
        :doc="doc"
        :values="values"
        :gestes="mode === 'bureau'"
        :vue="vueEnregistree"
        @etat="etat = $event"
      />
    </div>
    <div v-else class="flex-1 grid place-items-center text-sm text-muted-foreground">
      Affiché en grand
    </div>

    <SynopticMobileFull
      v-if="pleinEcran && doc && mode !== 'bureau'"
      :doc="doc"
      :values="values"
      :cadre="cadre"
      @close="pleinEcran = false"
    />
    <SynopticFrame v-if="agrandi && doc" @close="agrandi = false">
      <SynopticBar :titre="titre" :en-direct="enDirect" :recu="recu" :alarmes="etat?.alarmes ?? 0">
        <button
          v-if="peutEditer"
          type="button"
          class="text-xs px-2.5 py-1 rounded border border-signal text-signal"
          data-testid="synoptic-editer"
          @click="editer"
        >
          Éditer le synoptique
        </button>
        <button
          type="button"
          class="text-xs px-2.5 py-1 rounded border border-border text-muted-foreground hover:text-foreground"
          data-testid="synoptic-reduire"
          @click="agrandi = false"
        >
          Réduire (Échap)
        </button>
      </SynopticBar>
      <div class="flex-1 min-h-0">
        <SynopticCanvas :doc="doc" :values="values" full-frame @etat="etat = $event" />
      </div>
    </SynopticFrame>
  </div>
</template>

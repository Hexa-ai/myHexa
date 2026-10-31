<script setup lang="ts">
// Éditeur de synoptique en plein cadre (toute la zone de contenu de l'application, menu latéral conservé).
// Enregistrer = nouvelle version ; « Retour » revient au tableau d'où l'on vient (query `retour`).
import { computed, defineAsyncComponent, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { useDevices } from '@/composables/useDevices'
import { useSynoptic, useSynopticLive } from '@/composables/useSynoptic'
import { enregistrerVersion, synchroniserBlocs } from '@/lib/synoptic/api'
import type { SynopticDocument, SynopticEtat } from '@/lib/synoptic/engine/types'
import SynopticCanvas from '@/components/synoptic/SynopticCanvas.vue'
import SynopticFrame from '@/components/synoptic/SynopticFrame.vue'
import SynopticBar from '@/components/synoptic/SynopticBar.vue'
import SynopticSpotlight from '@/components/synoptic/SynopticSpotlight.vue'
import { entrees2d, entreesIso } from '@/lib/synoptic/catalogue-symboles'
import { catalogue as catalogueIso } from '@/lib/synoptic/iso/lib'
import type { Entree } from '@/lib/synoptic/recherche'
import SynopticResumeEditor from '@/components/synoptic/SynopticResumeEditor.vue'
import type { ResumeConfig } from '@/lib/synoptic/engine/types'
import { isoVide, normaliserIso, variablesIso, vueInitiale, type IsoSection, type VueSynoptique } from '@/lib/synoptic/iso/format'
import { valeursDuStatut } from '@/lib/synoptic/variables'

// l'éditeur isométrique (et la bibliothèque de dessin) ne se charge que si on ouvre la vue Iso
const SynopticIso = defineAsyncComponent(() => import('@/components/synoptic/SynopticIso.vue'))

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
const isoComp = ref<{
  armer(t: string): void
  elements(): { id: string; nom: string; type: string }[]
  selectionnerElement(id: string): boolean
  lierVariableSelection(v: string): boolean
} | null>(null)
const spotlight = ref<InstanceType<typeof SynopticSpotlight> | null>(null)
// ── vue isométrique : la section `iso` du document est tenue ici (le moteur 2D ne la connaît pas) et fusionnée à l'enregistrement
const vueEdition = ref<VueSynoptique>('2d')
const iso = ref<IsoSection>(isoVide())
const isoRef = ref('') // instantané enregistré, pour savoir si l'iso a changé
const vueRef = ref<VueSynoptique>('2d')
watch(
  doc,
  (d) => {
    if (!d) return
    iso.value = d.iso ? normaliserIso(d.iso) : isoVide()
    isoRef.value = JSON.stringify(iso.value)
    vueEdition.value = vueInitiale(d)
    vueRef.value = vueEdition.value
  },
  { immediate: true },
)
const isoVideScene = computed(() => !iso.value.composants.length && !iso.value.liaisons.length)
const isoModifie = computed(
  () => JSON.stringify(iso.value) !== isoRef.value || (!isoVideScene.value && vueEdition.value !== vueRef.value),
)
/** valeurs pour l'aperçu en direct de l'éditeur iso : celles du synoptique + celles des variables que l'on vient de relier */
const valuesIso = computed(() => ({
  ...valeursDuStatut(device.value?.status_payload, variablesIso(iso.value)),
  ...values.value,
}))
/** document à enregistrer : le 2D du moteur + la section iso (omise tant qu'elle est vide : le document reste celui d'avant) */
function avecIsoEdite(d: SynopticDocument): SynopticDocument {
  const { iso: _ancien, ...reste } = d
  void _ancien
  if (isoVideScene.value) return reste
  return { ...reste, iso: { ...iso.value, vue: vueEdition.value } }
}
const modifie = computed(() => !!etat.value?.modifie || isoModifie.value)

// onglets de l'éditeur : le dessin (toujours monté, caché sous l'autre onglet) et le résumé mobile
const onglet = ref<'dessin' | 'resume'>('dessin')
/** instantané du document pris à l'ouverture de l'onglet « Résumé mobile » (le dessin reste la référence) */
const docResume = ref<SynopticDocument | null>(null)
function ouvrirOnglet(o: 'dessin' | 'resume') {
  if (o === 'resume') {
    const d = canvas.value?.instance?.getDoc()
    docResume.value = d ? avecIsoEdite(d) : null
  }
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
  const brut = d ?? instance?.getDoc()
  if (!brut || enregistrement.value) return
  const document = avecIsoEdite(brut)
  enregistrement.value = true
  message.value = ''
  try {
    const v = await enregistrerVersion(id.value, document, 'manual')
    await synchroniserBlocs(id.value, document).catch(() => undefined)
    instance?.marquerEnregistre()
    isoRef.value = JSON.stringify(iso.value)
    vueRef.value = vueEdition.value
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

// ── recherche Spotlight (Ctrl+K) : symboles 2D / iso, éléments du synoptique courant, variables de la box
const symbolesRecherche = computed<Entree[]>(() => [...entreesIso(catalogueIso()), ...entrees2d()])
const elementsRecherche = computed(() =>
  vueEdition.value === 'iso' ? (isoComp.value?.elements() ?? iso.value.composants.map((c) => ({ id: c.id, nom: c.libelle || c.tag || c.id, type: c.type }))) : (canvas.value?.instance?.elements?.() ?? []),
)
const variablesRecherche = computed(() => catalogue.value.map((v) => ({ nom: v.nom, description: v.description, unite: v.unite })))
/** passe à la vue voulue (et à l'onglet Dessin), puis attend que le composant soit monté */
async function irVers(vue: VueSynoptique) {
  onglet.value = 'dessin'
  vueEdition.value = vue
  await nextTick()
  await nextTick()
}
async function rechercheSymbole(e: Entree) {
  await irVers(e.contexte)
  if (e.contexte === 'iso') isoComp.value?.armer(e.id)
  else canvas.value?.instance?.armer?.(e.id)
}
async function rechercheElement(e: Entree) {
  await irVers(e.contexte)
  if (e.contexte === 'iso') isoComp.value?.selectionnerElement(e.id)
  else canvas.value?.instance?.selectionnerElement?.(e.id)
}
function rechercheVariable(e: Entree) {
  const ok = vueEdition.value === 'iso' ? isoComp.value?.lierVariableSelection(e.id) : canvas.value?.instance?.lierVariableSelection?.(e.id)
  message.value = ok ? `Variable ${e.id} reliée à l'élément sélectionné` : 'Sélectionnez d’abord un élément à relier'
}
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
        <div class="flex rounded border border-border p-0.5" role="tablist" aria-label="Vue éditée" data-testid="synoptic-bascule-edition">
          <button
            v-for="o in [
              { id: '2d', libelle: '2D' },
              { id: 'iso', libelle: 'Iso' },
            ] as const"
            :key="o.id"
            type="button"
            role="tab"
            :aria-selected="vueEdition === o.id"
            class="rounded-sm px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider"
            :class="vueEdition === o.id ? 'bg-signal/15 text-signal' : 'text-muted-foreground hover:text-foreground'"
            :data-testid="`synoptic-vue-${o.id}`"
            @click="vueEdition = o.id"
          >
            {{ o.libelle }}
          </button>
        </div>
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
          data-testid="synoptic-recherche"
          title="Rechercher un symbole, un élément ou une variable (Ctrl+K)"
          @click="spotlight?.ouvrir()"
        >
          Rechercher <kbd class="ml-1 text-[10px] opacity-70">Ctrl K</kbd>
        </button>
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
        <SynopticIso
          v-if="vueEdition === 'iso' && onglet === 'dessin'"
          ref="isoComp"
          class="absolute inset-0 z-[5] bg-background"
          :iso="iso"
          :values="valuesIso"
          :catalogue="catalogue"
          editing
          full-frame
          @change="iso = $event"
          @recherche="spotlight?.ouvrir()"
          @save="enregistrer()"
        />
        <SynopticCanvas
          ref="canvas"
          :inert="onglet === 'resume' || vueEdition === 'iso'"
          :class="{ invisible: vueEdition === 'iso' && onglet === 'dessin' }"
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
    <SynopticSpotlight
      v-if="doc"
      ref="spotlight"
      :contexte="vueEdition"
      :symboles="symbolesRecherche"
      :elements="elementsRecherche"
      :variables="variablesRecherche"
      :icone2d="(c: string) => canvas?.instance?.icone?.(c) ?? ''"
      :selection-presente="true"
      @symbole="rechercheSymbole"
      @element="rechercheElement"
      @variable="rechercheVariable"
    />
  </div>
</template>

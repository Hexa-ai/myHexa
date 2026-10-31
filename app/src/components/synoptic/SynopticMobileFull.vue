<script setup lang="ts">
// Synoptique en plein écran sur mobile / tablette : couvre tout le viewport (au-dessus du menu et de l'en-tête du portail),
// sans API Fullscreen. Seul endroit où le dessin reçoit les gestes : pincement à deux doigts, déplacement à un doigt,
// double tap = tout voir. Fermeture : croix discrète, retour du téléphone (une entrée d'historique est ajoutée), Échap.
import { onBeforeUnmount, onMounted } from 'vue'
import type { SynopticDocument, SynopticEtat } from '@/lib/synoptic/engine/types'
import type { CadreDessin } from '@/lib/synoptic/resume'
import SynopticVue from './SynopticVue.vue'

withDefaults(
  defineProps<{
    doc: SynopticDocument
    values: Record<string, number>
    /** ouvrage sur lequel centrer la vue (absent = tout le dessin) */
    cadre?: CadreDessin | null
  }>(),
  { cadre: null },
)
const emit = defineEmits<{ (e: 'close'): void; (e: 'etat', etat: SynopticEtat): void }>()

const ETAT_HISTORIQUE = 'synopticPleinEcran'
let historiqueAjoute = false
let fermeture = false

/** ferme par le retour du navigateur : popstate fait ensuite le travail */
function fermer() {
  if (historiqueAjoute && history.state?.[ETAT_HISTORIQUE]) history.back()
  else emit('close')
}
function auRetour() {
  // le retour du téléphone a déjà dépilé notre entrée
  historiqueAjoute = false
  if (!fermeture) {
    fermeture = true
    emit('close')
  }
}
function auClavier(ev: KeyboardEvent) {
  if (ev.key !== 'Escape' || ev.defaultPrevented) return
  // Échap sert d'abord à fermer la fenêtre de détail d'un équipement
  if (document.querySelector('.syn-root .voile, .syn-root .ed-popup, .syn-root .detail-fond:not([hidden])')) return
  fermer()
}

let debordementAvant = { body: '', html: '' }
onMounted(() => {
  // défilement de la page bloqué pendant l'ouverture
  debordementAvant = { body: document.body.style.overflow, html: document.documentElement.style.overflow }
  document.body.style.overflow = 'hidden'
  document.documentElement.style.overflow = 'hidden'
  // même adresse, état du routeur conservé : le routeur ne voit qu'un retour sur la page courante
  history.pushState({ ...history.state, [ETAT_HISTORIQUE]: true }, '')
  historiqueAjoute = true
  window.addEventListener('popstate', auRetour)
  window.addEventListener('keydown', auClavier)
})
onBeforeUnmount(() => {
  window.removeEventListener('popstate', auRetour)
  window.removeEventListener('keydown', auClavier)
  document.body.style.overflow = debordementAvant.body
  document.documentElement.style.overflow = debordementAvant.html
  // fermé autrement que par le retour (démontage direct) : on retire notre entrée d'historique
  if (historiqueAjoute && history.state?.[ETAT_HISTORIQUE]) history.back()
})
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-[1000] bg-background touch-none overscroll-none"
      style="height: 100dvh"
      role="dialog"
      aria-modal="true"
      aria-label="Synoptique en plein écran"
      data-testid="synoptic-mobile-full"
    >
      <SynopticVue
        :doc="doc"
        :values="values"
        :cadre="cadre"
        full-frame
        mobile
        @etat="emit('etat', $event)"
      />
      <!-- zone tactile de 44 px, pastille discrète semi-transparente -->
      <button
        type="button"
        class="absolute z-10 grid size-11 place-items-center text-foreground/60 active:text-foreground"
        style="
          top: max(4px, env(safe-area-inset-top));
          left: max(4px, env(safe-area-inset-left));
        "
        aria-label="Fermer le synoptique"
        data-testid="synoptic-fermer"
        @click="fermer"
      >
        <span
          class="grid size-8 place-items-center rounded-full border border-border bg-background/60 backdrop-blur-sm"
        >
          <svg
            class="size-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </span>
      </button>
    </div>
  </Teleport>
</template>

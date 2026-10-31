<script setup lang="ts">
// Réglage « Cadrage » d'une tuile synoptique : aperçu à la forme de la tuile, zoom et déplacement libres, puis
// « Enregistrer la vue actuelle » (options.synoptic_cadre : rectangle du dessin en fractions, valable pour toute taille de tuile)
// ou « Ajuster automatiquement » (par défaut : tout le dessin, centré).
import { computed, ref, watch } from 'vue'
import type { Widget } from '@/composables/useDashboards'
import { chargerSynoptique } from '@/lib/synoptic/api'
import type { SynopticDocument } from '@/lib/synoptic/engine/types'
import {
  cadreAvecZoom,
  cadreDepuisVue,
  vueDepuisCadre,
  lireCadre,
  zoomDeCadre,
  ZOOM_MAX,
  ZOOM_MIN,
  type Cadre,
} from '@/lib/synoptic/cadrage'
import { colWidthPx, GAP_PX, widgetCols, widgetRows, rowsPx } from '@/lib/dashboardGrid'
import SynopticCanvas from './SynopticCanvas.vue'

const props = defineProps<{ widget: Widget }>()
const w = props.widget

const doc = ref<SynopticDocument | null>(null)
watch(
  () => w.options.synoptic_id,
  async (id) => {
    doc.value = null
    if (!id) return
    doc.value = (await chargerSynoptique(id).catch(() => null))?.doc ?? null
  },
  { immediate: true },
)

const enregistre = computed(() => lireCadre(w.options.synoptic_cadre) ?? null)
/** vue affichée dans l'aperçu (suit les gestes) */
const courante = ref<Cadre | null>(null)
const canvas = ref<{ instance: { definirVue(c: Cadre | null): void; vue(): Cadre } | null } | null>(null)

// aperçu à la forme de la tuile (grille de 1200 px de large à titre indicatif), contenu dans 560 × 300
const dims = computed(() => {
  const cols = widgetCols(w)
  const wPx = cols * colWidthPx(1200) + (cols - 1) * GAP_PX
  const hPx = rowsPx(widgetRows(w))
  const f = Math.min(560 / wPx, 300 / hPx)
  return { w: Math.round(wPx * f), h: Math.round(hPx * f) }
})

const zoom = computed(() => zoomDeCadre(courante.value))
function surZoom(ev: Event) {
  const z = Number((ev.target as HTMLInputElement).value)
  canvas.value?.instance?.definirVue(cadreAvecZoom(courante.value, z))
}
const arrondi = (n: number) => Math.round(n * 10000) / 10000
/** la vue `c` (aperçu) équivaut au cadrage `ref` (null = automatique) à la forme actuelle de l'aperçu ? */
function equivaut(c: Cadre, ref: Cadre | null): boolean {
  const d = doc.value?.layout
  if (!d) return false
  const r = cadreDepuisVue(vueDepuisCadre(ref, d, (c.w * d.w) / (c.h * d.h)), d)
  return [c.x - r.x, c.y - r.y, c.w - r.w, c.h - r.h].every((v) => Math.abs(v) < 0.003)
}
function enregistrer() {
  const c = courante.value
  if (!c || equivaut(c, null)) return automatique()
  w.options.synoptic_cadre = { x: arrondi(c.x), y: arrondi(c.y), w: arrondi(c.w), h: arrondi(c.h) }
}
function automatique() {
  delete w.options.synoptic_cadre
  canvas.value?.instance?.definirVue(null)
}
const libelle = computed(() =>
  enregistre.value ? `enregistré (zoom ×${zoomDeCadre(enregistre.value).toFixed(1)})` : 'automatique (tout le dessin)',
)
const modifie = computed(() => {
  const c = courante.value
  return !!c && !equivaut(c, enregistre.value)
})
</script>

<template>
  <div v-if="w.options.synoptic_id" class="space-y-2" data-testid="synoptic-cadrage">
    <div class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
      Cadrage · <span class="normal-case tracking-normal" data-testid="cadrage-etat">{{ libelle }}</span>
    </div>
    <div
      class="relative border border-border rounded overflow-hidden bg-card/40"
      :style="{ width: dims.w + 'px', height: dims.h + 'px', maxWidth: '100%' }"
      data-testid="cadrage-apercu"
    >
      <SynopticCanvas
        v-if="doc"
        ref="canvas"
        :doc="doc"
        :values="{}"
        :vue="enregistre"
        @vue="courante = $event"
      />
      <p v-else class="p-3 text-xs text-muted-foreground">Chargement de l'aperçu…</p>
    </div>
    <div class="flex flex-wrap items-center gap-3">
      <label class="flex items-center gap-2 text-xs text-muted-foreground">
        Zoom
        <input
          type="range"
          :min="ZOOM_MIN"
          :max="ZOOM_MAX"
          step="0.1"
          :value="zoom"
          class="w-40"
          data-testid="cadrage-zoom"
          @input="surZoom"
        />
        <span class="font-mono w-10">×{{ zoom.toFixed(1) }}</span>
      </label>
      <button
        type="button"
        class="text-xs px-2.5 py-1 rounded border border-signal text-signal disabled:opacity-40 disabled:border-border disabled:text-muted-foreground"
        :disabled="!modifie"
        data-testid="cadrage-enregistrer"
        @click="enregistrer"
      >
        Enregistrer la vue actuelle
      </button>
      <button
        type="button"
        class="text-xs px-2.5 py-1 rounded border border-border text-muted-foreground hover:border-signal/50 hover:text-foreground"
        data-testid="cadrage-auto"
        @click="automatique"
      >
        Ajuster automatiquement
      </button>
    </div>
    <p class="text-xs text-muted-foreground">
      Déplacez le dessin à la souris, zoomez avec le curseur (ou Ctrl + molette), puis enregistrez : la zone
      choisie reste entièrement visible quelle que soit la taille de la tuile. L'aperçu est indicatif.
    </p>
  </div>
</template>

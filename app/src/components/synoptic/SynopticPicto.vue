<script setup lang="ts">
// Pictogramme d'équipement pour le résumé mobile : trait fin, plat (style Teenage Engineering / Nothing).
// Vert quand ça tourne (la roue / l'hélice tourne), rouge en défaut, gris à l'arrêt, pointillé si inconnu.
// Vanne : papillon plein si ouverte. Cuve : remplissage au niveau réel.
import { computed } from 'vue'
import type { PictoResume } from '@/lib/synoptic/resume'

const props = defineProps<{ picto: PictoResume }>()
const tourne = computed(() => props.picto.etat === 'marche')
const TEXTE: Record<PictoResume['etat'], string> = {
  marche: 'en marche',
  arret: 'à l’arrêt',
  defaut: 'en défaut',
  ouvert: 'ouverte',
  ferme: 'fermée',
  inconnu: 'état inconnu',
}
const titre = computed(() => `${props.picto.libelle} — ${TEXTE[props.picto.etat]}`)
// hauteur de liquide dans la cuve (viewBox 24 : intérieur de y=5 à y=20)
const yNiveau = computed(() => 20 - 15 * (props.picto.niveau ?? 0))
</script>

<template>
  <span
    class="picto"
    :class="`picto-${picto.etat}`"
    :title="titre"
    :aria-label="titre"
    role="img"
    data-testid="synoptic-picto"
    :data-famille="picto.famille"
    :data-etat="picto.etat"
  >
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <!-- pompe centrifuge : volute + roue à 3 aubes -->
      <template v-if="picto.famille === 'pompe'">
        <circle cx="12" cy="12" r="8" />
        <path d="M12 4h8" />
        <g class="rot" :class="{ on: tourne }">
          <path d="M12 12l0-4.5M12 12l3.9 2.25M12 12l-3.9 2.25" />
          <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
        </g>
      </template>
      <!-- moteur : carcasse M + ventilateur arrière qui tourne -->
      <template v-else-if="picto.famille === 'moteur'">
        <circle cx="12" cy="12" r="8" />
        <g class="rot" :class="{ on: tourne }">
          <path d="M12 12q2.5-3 0-5.5M12 12q3 2.5 5.5 0M12 12q-2.5 3 0 5.5M12 12q-3-2.5-5.5 0" />
        </g>
      </template>
      <!-- ventilateur : hélice 3 pales -->
      <template v-else-if="picto.famille === 'ventilateur'">
        <circle cx="12" cy="12" r="9" stroke-dasharray="2 2" />
        <g class="rot" :class="{ on: tourne }">
          <path d="M12 12c-1-3 0-6 2-6.5s1.5 4-2 6.5zM12 12c3 .5 5 3 4 5s-3.5-1-4-5zM12 12c-2 2.5-5.5 2.5-6 .5s3-3 6-.5z" />
        </g>
      </template>
      <!-- vanne : papillon, plein si ouverte -->
      <template v-else-if="picto.famille === 'vanne'">
        <path d="M4 7v10l8-5zM20 7v10l-8-5z" :fill="picto.etat === 'ouvert' ? 'currentColor' : 'none'" />
        <path d="M12 12V5M9.5 5h5" />
      </template>
      <!-- cuve : remplissage au niveau -->
      <template v-else>
        <path d="M5 4v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V4" />
        <rect
          v-if="picto.niveau != null"
          x="6.5"
          :y="yNiveau"
          width="11"
          :height="20 - yNiveau - 1.5"
          fill="currentColor"
          stroke="none"
          opacity=".55"
        />
      </template>
    </svg>
  </span>
</template>

<style scoped>
.picto {
  --picto-run: #46c46a;
  display: inline-flex;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  color: var(--muted-foreground);
}
:global(.light) .picto {
  --picto-run: #2f9e52;
}
.picto svg {
  width: 100%;
  height: 100%;
}
.picto-marche,
.picto-ouvert {
  color: var(--picto-run);
}
.picto-defaut {
  color: var(--destructive);
}
.picto-inconnu {
  opacity: 0.45;
}
.rot {
  transform-origin: 12px 12px;
  transform-box: view-box;
}
.rot.on {
  animation: picto-tourne 1.6s linear infinite;
}
@keyframes picto-tourne {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .rot.on {
    animation: none;
  }
}
</style>

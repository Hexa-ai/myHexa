<script setup lang="ts">
// Pictogramme météo en trait (pas d'emoji), animé si demandé : rayons du soleil qui tournent,
// nuages qui dérivent, pluie / bruine / neige qui tombent, éclair qui clignote, brouillard qui glisse.
// Les animations sont coupées si le système demande moins de mouvement (prefers-reduced-motion).
withDefaults(
  defineProps<{ cond: string | null; night?: boolean; size?: number; animated?: boolean }>(),
  { night: false, size: 28, animated: true },
)
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 32 32"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    :class="['wx', { 'wx-anim': animated }]"
    :data-cond="cond ?? ''"
  >
    <!-- ciel dégagé -->
    <template v-if="cond === 'clear' || !cond">
      <g v-if="night">
        <path class="wx-moon" d="M20 6a10 10 0 1 0 6 14A8 8 0 0 1 20 6z" />
        <path class="wx-star" d="M8 7v2M7 8h2" />
        <path class="wx-star wx-d2" d="M25 26v2M24 27h2" />
      </g>
      <g v-else>
        <circle class="wx-sun" cx="16" cy="16" r="5.5" />
        <g class="wx-rays">
          <path
            class="wx-sun"
            d="M16 3.5v3M16 25.5v3M3.5 16h3M25.5 16h3M7.2 7.2l2.1 2.1M22.7 22.7l2.1 2.1M7.2 24.8l2.1-2.1M22.7 9.3l2.1-2.1"
          />
        </g>
      </g>
    </template>
    <template v-else>
      <!-- astre derrière le nuage -->
      <g v-if="cond === 'partly'">
        <path v-if="night" class="wx-moon" d="M15 4.5a6.5 6.5 0 1 0 6.5 8.5A5 5 0 0 1 15 4.5z" />
        <g v-else>
          <circle class="wx-sun" cx="12" cy="11" r="4" />
          <g class="wx-rays wx-rays-s">
            <path
              class="wx-sun"
              d="M12 3.5v1.8M4.5 11h1.8M6.7 5.7l1.3 1.3M17.3 5.7 16 7M6.7 16.3 8 15"
            />
          </g>
        </g>
      </g>
      <!-- nuage -->
      <g class="wx-cloud">
        <path
          d="M9.5 23h13a5 5 0 0 0 .6-9.96A7 7 0 0 0 9.8 14.5 4.3 4.3 0 0 0 9.5 23z"
          class="wx-cloud-body"
        />
      </g>
      <!-- précipitations -->
      <g v-if="cond === 'rain' || cond === 'storm'">
        <path class="wx-drop" d="M12 25.5l-1 2.5" />
        <path class="wx-drop wx-d2" d="M17 25.5l-1 2.5" />
        <path class="wx-drop wx-d3" d="M22 25.5l-1 2.5" />
      </g>
      <g v-else-if="cond === 'drizzle'">
        <path class="wx-drop" d="M12 26.5v.3" stroke-width="2.2" />
        <path class="wx-drop wx-d2" d="M17 26.5v.3" stroke-width="2.2" />
        <path class="wx-drop wx-d3" d="M22 26.5v.3" stroke-width="2.2" />
      </g>
      <g v-else-if="cond === 'snow'">
        <path class="wx-flake" d="M12 25.5v2.4M10.8 26.7h2.4" />
        <path class="wx-flake wx-d2" d="M18 25.5v2.4M16.8 26.7h2.4" />
        <path class="wx-flake wx-d3" d="M24 25.5v2.4M22.8 26.7h2.4" />
      </g>
      <g v-else-if="cond === 'fog'" class="wx-fog">
        <path d="M7 26.5h18" />
        <path class="wx-d2" d="M10 29.5h12" />
      </g>
      <path
        v-if="cond === 'storm'"
        class="wx-bolt"
        d="M18 21.5l-3 4.5h3.5l-2.5 4.5"
        stroke-width="1.8"
      />
    </template>
  </svg>
</template>

<style scoped>
.wx {
  overflow: visible;
}
.wx-sun,
.wx-bolt {
  color: #f5a524;
}
.wx-moon,
.wx-star {
  color: #8aa4ff;
}
.wx-cloud-body {
  fill: var(--card, #fff);
}
.wx-drop,
.wx-flake {
  color: #3ba7ff;
}
.wx-cloud,
.wx-drop,
.wx-flake,
.wx-fog path,
.wx-star {
  transform-box: fill-box;
  transform-origin: center;
}
.wx-rays {
  transform-box: view-box;
  transform-origin: 16px 16px;
}
.wx-rays-s {
  transform-origin: 12px 11px;
}
.wx-anim .wx-rays {
  animation: wx-spin 24s linear infinite;
}
.wx-anim .wx-cloud {
  animation: wx-drift 7s ease-in-out infinite;
}
.wx-anim .wx-drop {
  animation: wx-fall 1.1s linear infinite;
}
.wx-anim .wx-flake {
  animation: wx-snow 3.2s linear infinite;
}
.wx-anim .wx-bolt {
  animation: wx-flash 3.4s linear infinite;
}
.wx-anim .wx-fog path {
  animation: wx-slide 5s ease-in-out infinite;
}
.wx-anim .wx-star {
  animation: wx-twinkle 3s ease-in-out infinite;
}
.wx-anim .wx-d2 {
  animation-delay: -0.4s;
}
.wx-anim .wx-d3 {
  animation-delay: -0.75s;
}
.wx-anim .wx-flake.wx-d2 {
  animation-delay: -1.1s;
}
.wx-anim .wx-flake.wx-d3 {
  animation-delay: -2.2s;
}
.wx-anim .wx-fog .wx-d2 {
  animation-delay: -2.5s;
}
@keyframes wx-spin {
  to {
    transform: rotate(360deg);
  }
}
@keyframes wx-drift {
  0%,
  100% {
    transform: translateX(-0.6px);
  }
  50% {
    transform: translateX(0.9px);
  }
}
@keyframes wx-fall {
  0% {
    transform: translate(0.5px, -2.5px);
    opacity: 0;
  }
  20% {
    opacity: 1;
  }
  100% {
    transform: translate(-1px, 3px);
    opacity: 0;
  }
}
@keyframes wx-snow {
  0% {
    transform: translate(0, -2.5px) rotate(0);
    opacity: 0;
  }
  20% {
    opacity: 1;
  }
  50% {
    transform: translate(0.8px, 0.5px) rotate(45deg);
  }
  100% {
    transform: translate(-0.5px, 3.5px) rotate(90deg);
    opacity: 0;
  }
}
@keyframes wx-flash {
  0%,
  58%,
  100% {
    opacity: 0.15;
  }
  60%,
  64% {
    opacity: 1;
  }
  62% {
    opacity: 0.25;
  }
  72% {
    opacity: 0.15;
  }
}
@keyframes wx-slide {
  0%,
  100% {
    transform: translateX(-1.2px);
  }
  50% {
    transform: translateX(1.2px);
  }
}
@keyframes wx-twinkle {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.25;
  }
}
@media (prefers-reduced-motion: reduce) {
  .wx-anim * {
    animation: none !important;
  }
}
</style>

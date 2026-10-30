<script setup lang="ts">
// Cuve cylindrique en verre remplie d'un liquide animé : vagues sur 3 couches, bulles qui montent,
// ménisque, reflets. Animations 100 % CSS (transform/opacity, compositées) : pas de boucle JS ;
// mises en pause hors écran / onglet caché ; statique si « réduire les animations ».
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { Threshold } from '@/composables/useDashboards'
import { markerPos, useOffscreenPause, usePrefersReducedMotion } from './gaugeUtil'

const props = withDefaults(
  defineProps<{
    f: number
    text: string
    unit?: string | null
    loText: string
    hiText: string
    midText?: string
    lo: number
    hi: number
    color: string
    bubbles?: boolean
    thresholds?: Threshold[]
    compact?: boolean
  }>(),
  { unit: null, midText: '', bubbles: true, thresholds: () => [], compact: false },
)

const root = ref<HTMLElement | null>(null)
const paused = useOffscreenPause(root)
const reduced = usePrefersReducedMotion()

// niveau affiché : monte doucement de 0 vers la valeur (transition CSS sur --lv)
const shown = ref(0)
onMounted(() => nextTick(() => requestAnimationFrame(() => (shown.value = props.f))))
watch(
  () => props.f,
  (v) => (shown.value = v),
)

/** courbe sinusoïdale fermée : `periods` ondulations par demi-largeur (boucle sans couture à -50 %) */
function wave(periods: number, amp: number, phase: number, h = 12) {
  const W = 200
  const steps = 96
  let top = ''
  for (let i = 0; i <= steps; i++) {
    const x = (W * i) / steps
    const y = h / 2 - amp * Math.sin((x / (W / 2)) * periods * 2 * Math.PI + phase)
    top += `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`
  }
  return { top, fill: `${top}L${W} ${h}L0 ${h}Z` }
}
const waves = [
  { cls: 'w1', ...wave(1, 4.2, 0.8), op: 0.38 },
  { cls: 'w2', ...wave(2, 3.3, 2.4), op: 0.62 },
  { cls: 'w3', ...wave(3, 2.2, 4.1), op: 1 },
]

// bulles : tailles, vitesses, positions et oscillations tirées au hasard une fois par cuve
const rnd = (a: number, b: number) => a + Math.random() * (b - a)
const bubbleList = computed(() => {
  if (!props.bubbles || reduced.value || props.f < 0.06) return []
  return bubbleSeed.value
})
const bubbleSeed = ref(
  Array.from({ length: 16 }, (_, i) => ({
    i,
    x: rnd(8, 90),
    s: rnd(3, 9),
    d: rnd(4.2, 9.5),
    dl: -rnd(0, 9),
    sw: rnd(1.1, 2.6),
    a: rnd(2, 7),
  })),
)

const ticks = Array.from({ length: 11 }, (_, i) => i / 10)
const marks = computed(() =>
  props.thresholds
    .map((t) => ({ t, p: markerPos(t, props.lo, props.hi) }))
    .filter((m): m is { t: Threshold; p: number } => m.p !== null),
)
</script>

<template>
  <div
    ref="root"
    :class="['gtank', compact && 'gtank-compact', paused && 'is-paused', reduced && 'is-rm']"
    :style="{ '--lc': color, '--lv': shown }"
    data-testid="gauge-tank"
    :data-f="f.toFixed(3)"
    :data-color="color"
    :data-bubbles="bubbleList.length"
    role="meter"
    :aria-valuemin="lo"
    :aria-valuemax="hi"
    :aria-valuenow="f * (hi - lo) + lo"
  >
    <div class="gtank-row">
      <div class="gtank-glass">
        <div class="gtank-liquid" data-testid="tank-liquid">
          <div class="gtank-surface">
            <svg
              v-for="w in waves"
              :key="w.cls"
              :class="['gtank-wave', w.cls]"
              viewBox="0 0 200 12"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path :d="w.fill" :fill-opacity="w.op" />
              <path
                v-if="w.cls === 'w3'"
                :d="w.top"
                fill="none"
                stroke="#fff"
                stroke-opacity=".6"
                stroke-width="1"
                vector-effect="non-scaling-stroke"
              />
            </svg>
          </div>
          <div class="gtank-body" data-testid="tank-body" />
          <i class="gtank-men gtank-men-l" />
          <i class="gtank-men gtank-men-r" />
        </div>
        <div v-if="bubbleList.length" class="gtank-bubbles" data-testid="tank-bubbles">
          <span
            v-for="b in bubbleList"
            :key="b.i"
            class="bub"
            data-testid="tank-bubble"
            :style="{
              '--x': `${b.x}%`,
              '--s': `${b.s}px`,
              '--d': `${b.d}s`,
              '--dl': `${b.dl}s`,
              '--sw': `${b.sw}s`,
              '--a': `${b.a}px`,
            }"
            ><i
          /></span>
        </div>
        <div class="gtank-shade" />
        <div class="gtank-streak" />
        <div class="gtank-rim" />
      </div>
      <div class="gtank-scale font-mono" aria-hidden="true">
        <i
          v-for="p in ticks"
          :key="p"
          class="gtank-tick"
          :class="(p * 10) % 5 === 0 && 'major'"
          :style="{ bottom: `${p * 100}%` }"
        />
        <i
          v-for="(m, k) in marks"
          :key="'m' + k"
          class="gtank-mark"
          :style="{ bottom: `${m.p * 100}%`, background: m.t.color }"
          :title="`${m.t.label || 'Seuil'} : ${m.t.value}`"
          data-testid="gauge-mark"
        />
        <span class="gtank-lbl" style="bottom: 0">{{ loText }}</span>
        <span v-if="midText" class="gtank-lbl" style="bottom: 50%">{{ midText }}</span>
        <span class="gtank-lbl" style="bottom: 100%">{{ hiText }}</span>
      </div>
    </div>
    <div class="gtank-val">
      <span class="big-num tabular gtank-num">{{ text }}</span>
      <span v-if="unit" class="w-unit font-mono text-xs text-muted-foreground ml-1">{{
        unit
      }}</span>
    </div>
  </div>
</template>

<style>
@property --lv {
  syntax: '<number>';
  inherits: true;
  initial-value: 0;
}
</style>

<style scoped>
.gtank {
  --h: 170px;
  --w: calc(var(--h) * 0.62);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1.1rem;
  min-width: 0;
  transition: --lv 1.6s cubic-bezier(0.22, 1, 0.36, 1);
}
.gtank-compact {
  --h: 118px;
  flex-direction: column;
  gap: 0.4rem;
}
.gtank-row {
  display: flex;
  align-items: stretch;
  gap: 0.45rem;
}
.gtank-glass {
  position: relative;
  width: var(--w);
  height: var(--h);
  container-type: size;
  border-radius: 50% / 6%;
  overflow: hidden;
  background: color-mix(in srgb, var(--muted-foreground) 9%, transparent);
  box-shadow:
    inset 0 0 0 1.5px color-mix(in srgb, var(--muted-foreground) 45%, transparent),
    0 8px 16px -10px rgb(0 0 0 / 0.4);
  isolation: isolate;
}
.gtank-liquid {
  position: absolute;
  inset: 0;
  transform: translateY(calc((1 - var(--lv)) * 100%));
  --body-top: color-mix(in srgb, var(--lc) 88%, #fff);
}
.gtank-body {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(120% 60% at 30% 0%, rgb(255 255 255 / 0.22), transparent 60%),
    linear-gradient(180deg, var(--lc) 0%, color-mix(in srgb, var(--lc) 66%, #02121c) 100%);
}
.gtank-surface {
  position: absolute;
  left: 0;
  right: 0;
  top: -11px;
  height: 12px;
  transform-origin: 50% 100%;
  animation: tank-slosh 6.5s ease-in-out infinite alternate;
}
.gtank-wave {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 200%;
  height: 12px;
  fill: var(--lc);
  will-change: transform;
}
.w1 {
  animation: tank-drift 9s linear infinite reverse;
  bottom: 2px;
  fill: var(--body-top);
}
.w2 {
  animation: tank-drift 6s linear infinite;
  bottom: 1px;
}
.w3 {
  animation: tank-drift 4.2s linear infinite reverse;
}
.gtank-men {
  position: absolute;
  top: -6px;
  width: 7px;
  height: 7px;
}
.gtank-men-l {
  left: 0;
  background: radial-gradient(circle at 100% 0, transparent 6px, var(--lc) 6.6px);
}
.gtank-men-r {
  right: 0;
  background: radial-gradient(circle at 0 0, transparent 6px, var(--lc) 6.6px);
}
.gtank-bubbles {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.bub {
  position: absolute;
  left: var(--x);
  bottom: 3cqh;
  width: var(--s);
  height: var(--s);
  animation: tank-rise var(--d) linear var(--dl) infinite;
  will-change: transform, opacity;
}
.bub i {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  border: 1px solid rgb(255 255 255 / 0.75);
  background: radial-gradient(
    circle at 32% 30%,
    rgb(255 255 255 / 0.9),
    rgb(255 255 255 / 0.12) 48%,
    rgb(255 255 255 / 0.04)
  );
  animation: tank-sway var(--sw) ease-in-out infinite alternate;
}
.gtank-shade {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(
    90deg,
    rgb(0 0 0 / 0.2),
    rgb(0 0 0 / 0) 20%,
    rgb(255 255 255 / 0.1) 62%,
    rgb(255 255 255 / 0) 78%,
    rgb(255 255 255 / 0.16) 90%,
    rgb(0 0 0 / 0.22)
  );
}
.gtank-streak {
  position: absolute;
  left: 15%;
  top: 11%;
  bottom: 9%;
  width: 7%;
  border-radius: 999px;
  pointer-events: none;
  background: linear-gradient(
    180deg,
    rgb(255 255 255 / 0.7),
    rgb(255 255 255 / 0.1) 70%,
    transparent
  );
  opacity: 0.8;
}
.gtank-rim {
  position: absolute;
  left: 1.5px;
  right: 1.5px;
  top: 1px;
  height: 11%;
  border-radius: 50%;
  pointer-events: none;
  border: 1.5px solid rgb(255 255 255 / 0.55);
  border-top-color: rgb(255 255 255 / 0.25);
  background: linear-gradient(180deg, rgb(255 255 255 / 0.1), transparent);
}
.gtank-scale {
  position: relative;
  width: 2.4rem;
  height: var(--h);
  font-size: 9px;
  letter-spacing: 0.06em;
  color: var(--muted-foreground);
}
.gtank-tick {
  position: absolute;
  left: 0;
  width: 5px;
  height: 1px;
  background: var(--muted-foreground);
  opacity: 0.55;
}
.gtank-tick.major {
  width: 9px;
  opacity: 0.9;
}
.gtank-mark {
  position: absolute;
  left: 0;
  width: 14px;
  height: 3px;
  border-radius: 1px;
  transform: translateY(50%);
}
.gtank-lbl {
  position: absolute;
  left: 14px;
  transform: translateY(50%);
  white-space: nowrap;
}
.gtank-num {
  font-size: 2.25rem;
  line-height: 1;
}
.gtank-compact .gtank-num {
  font-size: 1.5rem;
}

@keyframes tank-drift {
  to {
    transform: translateX(-50%);
  }
}
@keyframes tank-slosh {
  from {
    transform: translateY(0.8px) rotate(-0.5deg);
  }
  to {
    transform: translateY(-1.2px) rotate(0.5deg);
  }
}
@keyframes tank-rise {
  0% {
    transform: translateY(0) scale(0.5);
    opacity: 0;
  }
  6% {
    opacity: 0.9;
    transform: translateY(-1cqh) scale(1);
  }
  88% {
    opacity: 0.85;
  }
  100% {
    transform: translateY(calc(max(0px, var(--lv) * 100cqh - 3cqh - 6px) * -1)) scale(1.3);
    opacity: 0;
  }
}
@keyframes tank-sway {
  from {
    transform: translateX(calc(var(--a) * -1));
  }
  to {
    transform: translateX(var(--a));
  }
}

.is-paused *,
.is-paused .bub,
.is-paused .gtank-wave {
  animation-play-state: paused !important;
}
@media (prefers-reduced-motion: reduce) {
  .gtank,
  .gtank * {
    animation: none !important;
    transition: none !important;
  }
  .w1 {
    transform: translateX(-12%);
  }
  .w2 {
    transform: translateX(-30%);
  }
  .w3 {
    transform: translateX(-4%);
  }
}
</style>

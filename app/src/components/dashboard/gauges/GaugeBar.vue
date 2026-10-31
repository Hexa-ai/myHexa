<script setup lang="ts">
// Jauge en barre segmentée (style appareil / Nothing) : horizontale ou verticale.
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { Threshold } from '@/composables/useDashboards'
import { markerPos, usePrefersReducedMotion } from './gaugeUtil'

const props = withDefaults(
  defineProps<{
    orient: 'h' | 'v'
    /** niveau 0..1 */
    f: number
    /** valeur déjà formatée */
    text: string
    unit?: string | null
    loText: string
    hiText: string
    midText?: string
    lo: number
    hi: number
    color: string
    thresholds?: Threshold[]
    compact?: boolean
  }>(),
  { unit: null, midText: '', thresholds: () => [], compact: false },
)

const reduced = usePrefersReducedMotion()
const N = computed(() => (props.orient === 'h' ? 40 : 24))
// montée progressive des segments au chargement
const shown = ref(0)
onMounted(() => nextTick(() => requestAnimationFrame(() => (shown.value = props.f))))
watch(
  () => props.f,
  (v) => (shown.value = v),
)
const segs = computed(() =>
  Array.from({ length: N.value }, (_, i) => {
    const part = Math.min(Math.max(shown.value * N.value - i, 0), 1)
    return { i, part }
  }),
)
const onCount = computed(() => Math.round(props.f * N.value))
const marks = computed(() =>
  props.thresholds
    .map((t) => ({ t, p: markerPos(t, props.lo, props.hi) }))
    .filter((m): m is { t: Threshold; p: number } => m.p !== null),
)
</script>

<template>
  <div
    :class="['gbar', `gbar-${orient}`, compact && 'gbar-compact', reduced && 'gbar-rm']"
    data-testid="gauge-bar"
    :data-orient="orient"
    :data-f="f.toFixed(3)"
    :data-color="color"
    :data-on="onCount"
    :style="{ '--gc': color }"
    role="meter"
    :aria-valuemin="lo"
    :aria-valuemax="hi"
    :aria-valuenow="f * (hi - lo) + lo"
  >
    <div class="gbar-val">
      <span class="big-num tabular gbar-num">{{ text }}</span>
      <span v-if="unit" class="w-unit font-mono text-xs text-muted-foreground ml-1">{{
        unit
      }}</span>
    </div>
    <div class="gbar-track-wrap">
      <div class="gbar-track">
        <i
          v-for="s in segs"
          :key="s.i"
          class="gbar-seg"
          :class="s.part > 0 && 'on'"
          :style="{
            '--p': s.part,
            '--d': `${s.i * (orient === 'h' ? 12 : 20)}ms`,
            ...(s.i % (orient === 'h' ? 10 : 6) === 0 ? { '--major': 1 } : {}),
          }"
        />
      </div>
      <div class="gbar-scale font-mono">
        <span class="gbar-lo">{{ loText }}</span>
        <span v-if="midText" class="gbar-mid">{{ midText }}</span>
        <span class="gbar-hi">{{ hiText }}</span>
        <i
          v-for="(m, k) in marks"
          :key="k"
          class="gbar-mark"
          :style="{ '--mp': m.p, background: m.t.color }"
          :title="`${m.t.label || 'Seuil'} : ${m.t.value}`"
          data-testid="gauge-mark"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.gbar {
  display: flex;
  gap: 0.5rem;
  min-width: 0;
}
.gbar-h {
  flex-direction: column;
}
.gbar-v {
  flex-direction: row-reverse;
  align-items: stretch;
  justify-content: center;
  gap: 0.9rem;
}
.gbar-v .gbar-val {
  align-self: center;
}
.gbar-num {
  font-size: 2.25rem;
  line-height: 1;
}
.gbar-compact .gbar-num {
  font-size: 1.5rem;
}
.gbar-track-wrap {
  position: relative;
  min-width: 0;
}
.gbar-v .gbar-track-wrap {
  display: flex;
  gap: 0.35rem;
}
.gbar-track {
  display: flex;
  gap: 2px;
  height: 22px;
}
.gbar-compact .gbar-track {
  height: 16px;
}
.gbar-v .gbar-track {
  flex-direction: column-reverse;
  height: 150px;
  width: 26px;
}
.gbar-v.gbar-compact .gbar-track {
  height: 104px;
  width: 20px;
}
.gbar-seg {
  flex: 1;
  border-radius: 2px;
  background: var(--border);
  transition: none;
}
.gbar-seg.on {
  background: var(--gc);
  opacity: calc(0.35 + 0.65 * var(--p, 1));
}
.gbar:not(.gbar-rm) .gbar-seg {
  transition:
    background-color 0.35s ease var(--d, 0ms),
    opacity 0.35s ease var(--d, 0ms);
}
.gbar-scale {
  position: relative;
  display: flex;
  justify-content: space-between;
  font-size: 9px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted-foreground);
  margin-top: 4px;
  min-height: 12px;
}
.gbar-mid {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
}
.gbar-mark {
  position: absolute;
  top: -9px;
  left: calc(var(--mp) * 100%);
  width: 3px;
  height: 7px;
  border-radius: 1px;
  transform: translateX(-50%);
}
.gbar-v .gbar-scale {
  flex-direction: column-reverse;
  margin-top: 0;
  min-height: 0;
  min-width: 2.3rem;
  text-align: left;
}
.gbar-v .gbar-mid {
  left: auto;
  top: 50%;
  left: 0;
  right: auto;
  transform: translateY(-50%);
}
.gbar-v .gbar-mark {
  top: auto;
  left: auto;
  right: auto;
  left: -9px;
  bottom: calc(var(--mp) * 100%);
  width: 6px;
  height: 3px;
  transform: translateY(50%);
}
</style>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import L, { type Map as LeafletMap, type CircleMarker } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useTheme } from '@/composables/useTheme'

export interface MarkerInput {
  id: string
  lat: number
  lng: number
  label?: string
  online?: boolean
  href?: string
}

const props = withDefaults(
  defineProps<{
    markers: MarkerInput[]
    height?: string
    zoom?: number
    interactive?: boolean
  }>(),
  { height: '260px', zoom: 13, interactive: true },
)

const emit = defineEmits<{
  (e: 'select', id: string): void
}>()

const { theme } = useTheme()
const mapEl = ref<HTMLElement | null>(null)
let map: LeafletMap | null = null
let layer: L.LayerGroup | null = null
let tileLayer: L.TileLayer | null = null

const TILES = {
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
}
const ATTR = '&copy; OpenStreetMap &middot; CartoDB'

function colorFor(m: MarkerInput): string {
  if (m.online === false) return '#ff7a7a'
  return '#00d4aa'
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function tooltipHtml(m: MarkerInput): string {
  const stateClass = m.online === false ? 'is-offline' : 'is-online'
  const stateLabel = m.online === false ? 'Offline' : 'Online'
  const name = escapeHtml(m.label ?? '—')
  return `
    <div class="hai-tip ${stateClass}">
      <div class="hai-tip-halo"></div>
      <div class="hai-tip-ripple"></div>
      <img src="/hai-p-gateway.png" class="hai-tip-img" alt="" />
      <div class="hai-tip-text">
        <div class="hai-tip-name">${name}</div>
        <div class="hai-tip-state">${stateLabel}</div>
      </div>
    </div>
  `
}

function buildMarkers() {
  if (!map) return
  if (layer) layer.clearLayers()
  else layer = L.layerGroup().addTo(map)

  const valid = props.markers.filter((m) => Number.isFinite(m.lat) && Number.isFinite(m.lng))
  if (!valid.length) return

  const circles: CircleMarker[] = []
  for (const m of valid) {
    const c = L.circleMarker([m.lat, m.lng], {
      color: '#ffffff',
      weight: 2,
      fillColor: colorFor(m),
      fillOpacity: 1,
      radius: 8,
    })
    c.bindTooltip(tooltipHtml(m), {
      direction: 'top',
      offset: [0, -10],
      className: 'hai-rich-tooltip',
      opacity: 1,
    })
    c.on('click', () => emit('select', m.id))
    c.addTo(layer!)
    circles.push(c)
  }

  if (valid.length === 1) {
    map.setView([valid[0].lat, valid[0].lng], props.zoom)
  } else {
    const group = L.featureGroup(circles)
    map.fitBounds(group.getBounds().pad(0.2))
  }
}

function applyTiles() {
  if (!map) return
  if (tileLayer) {
    map.removeLayer(tileLayer)
  }
  tileLayer = L.tileLayer(theme.value === 'dark' ? TILES.dark : TILES.light, {
    maxZoom: 19,
    subdomains: 'abcd',
    attribution: ATTR,
  }).addTo(map)
}

onMounted(() => {
  if (!mapEl.value) return
  map = L.map(mapEl.value, {
    zoomControl: props.interactive,
    scrollWheelZoom: props.interactive,
    dragging: props.interactive,
    doubleClickZoom: props.interactive,
    boxZoom: props.interactive,
    keyboard: props.interactive,
    touchZoom: props.interactive,
  })
  applyTiles()
  buildMarkers()
})

watch(() => props.markers, buildMarkers, { deep: true })
watch(theme, applyTiles)

onBeforeUnmount(() => {
  map?.remove()
  map = null
})

defineExpose({
  invalidateSize: () => map?.invalidateSize(),
})
</script>

<template>
  <div
    ref="mapEl"
    :style="{ height }"
    class="w-full rounded-md overflow-hidden border border-border bg-card/40"
  />
</template>

<style>
/* Leaflet attribution + zoom control styling for dark theme */
.leaflet-container {
  background: var(--card);
  font-family: var(--font-sans);
}
.leaflet-control-attribution {
  background: rgba(0, 0, 0, 0.55) !important;
  color: var(--muted-foreground) !important;
  font-size: 10px !important;
}
.leaflet-control-attribution a {
  color: var(--signal) !important;
}
.dark .leaflet-control-zoom a {
  background: var(--card) !important;
  color: var(--foreground) !important;
  border-color: var(--border) !important;
}
.dark .leaflet-control-zoom a:hover {
  background: var(--secondary) !important;
}
.leaflet-tooltip {
  background: var(--card);
  color: var(--foreground);
  border: 1px solid var(--border);
  font-family: var(--font-sans);
  font-size: 12px;
  padding: 4px 8px;
}
.leaflet-tooltip-top:before {
  border-top-color: var(--border);
}

/* Rich tooltip with animated HAI-P icon */
.leaflet-tooltip.hai-rich-tooltip {
  background: transparent !important;
  border: 0 !important;
  padding: 0 !important;
  box-shadow: none !important;
  pointer-events: none;
}
.leaflet-tooltip.hai-rich-tooltip:before {
  display: none;
}
.hai-tip {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 10px 6px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--card) 92%, transparent);
  border: 1px solid var(--border);
  backdrop-filter: blur(6px);
  min-width: 96px;
}
.hai-tip-halo {
  position: absolute;
  top: 6px;
  left: 50%;
  transform: translateX(-50%);
  width: 70px;
  height: 70px;
  border-radius: 50%;
  filter: blur(14px);
  pointer-events: none;
}
.hai-tip.is-online .hai-tip-halo {
  background: color-mix(in srgb, var(--signal) 55%, transparent);
  animation: hai-tip-pulse 2.4s ease-in-out infinite;
}
.hai-tip.is-offline .hai-tip-halo {
  background: color-mix(in srgb, var(--muted-foreground) 25%, transparent);
}
.hai-tip-ripple {
  position: absolute;
  top: 6px;
  left: 50%;
  transform: translateX(-50%);
  width: 70px;
  height: 70px;
  border-radius: 50%;
  border: 1px solid color-mix(in srgb, var(--signal) 45%, transparent);
  pointer-events: none;
  opacity: 0;
}
.hai-tip.is-online .hai-tip-ripple {
  animation: hai-tip-ripple 2.4s ease-out infinite;
}
.hai-tip-img {
  position: relative;
  width: 70px;
  height: auto;
  object-fit: contain;
  opacity: 0.95;
  user-select: none;
}
.dark .hai-tip-img {
  filter: invert(1);
  opacity: 0.85;
}
.hai-tip-text {
  position: relative;
  margin-top: 4px;
  text-align: center;
  font-family: var(--font-mono);
  line-height: 1.2;
}
.hai-tip-name {
  font-size: 11px;
  font-weight: 600;
  color: var(--foreground);
  white-space: nowrap;
}
.hai-tip-state {
  margin-top: 2px;
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
}
.hai-tip.is-online .hai-tip-state {
  color: var(--signal);
}
.hai-tip.is-offline .hai-tip-state {
  color: var(--offline, #ff7a7a);
}

@keyframes hai-tip-pulse {
  0%, 100% { opacity: 0.45; transform: translateX(-50%) scale(0.95); }
  50%       { opacity: 0.9;  transform: translateX(-50%) scale(1.05); }
}
@keyframes hai-tip-ripple {
  0%   { opacity: 0.6; transform: translateX(-50%) scale(0.85); }
  100% { opacity: 0;   transform: translateX(-50%) scale(1.35); }
}
@media (prefers-reduced-motion: reduce) {
  .hai-tip-halo, .hai-tip-ripple { animation: none !important; }
}
</style>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import L, { type Map as LeafletMap, type Marker } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useTheme } from '@/composables/useTheme'

export interface MarkerInput {
  id: string
  lat: number
  lng: number
  label?: string
  online?: boolean
  severity?: 'error' | 'warning' | null
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
const circlesById = new Map<string, Marker>()

const TILES = {
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
}
const ATTR = '&copy; OpenStreetMap &middot; CartoDB'

function markerStateClass(m: MarkerInput): string {
  if (m.online === false) return 'hai-marker-offline'
  if (m.severity === 'error') return 'hai-marker-error'
  if (m.severity === 'warning') return 'hai-marker-warning'
  return 'hai-marker-ok'
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
  let stateClass: string
  let stateLabel: string
  if (m.online === false) {
    stateClass = 'is-offline'
    stateLabel = 'Offline'
  } else if (m.severity === 'error') {
    stateClass = 'is-error'
    stateLabel = 'Alarme'
  } else if (m.severity === 'warning') {
    stateClass = 'is-warning'
    stateLabel = 'Vigilance'
  } else {
    stateClass = 'is-online'
    stateLabel = 'Online'
  }
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

  circlesById.clear()
  const circles: Marker[] = []
  for (const m of valid) {
    const icon = L.divIcon({
      className: `hai-marker ${markerStateClass(m)}`,
      html: '<span class="hai-marker-dot"></span>',
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    })
    const c = L.marker([m.lat, m.lng], { icon })
    c.bindTooltip(tooltipHtml(m), {
      direction: 'top',
      offset: [0, -10],
      className: 'hai-rich-tooltip',
      opacity: 1,
    })
    c.on('click', () => emit('select', m.id))
    c.addTo(layer!)
    circles.push(c)
    circlesById.set(m.id, c)
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
  focusMarker(
    id: string,
    opts?: { zoom?: number; duration?: number; withOverview?: boolean },
  ) {
    if (!map) return
    const c = circlesById.get(id)
    if (!c) return
    circlesById.forEach((other, key) => {
      if (key !== id) other.closeTooltip()
    })

    const ll = c.getLatLng()
    const targetZoom = opts?.zoom ?? 10
    const flyDuration = opts?.duration ?? 2
    const flyIn = () => {
      map!.flyTo(ll, targetZoom, { duration: flyDuration, easeLinearity: 0.35 })
      setTimeout(() => c.openTooltip(), flyDuration * 1000 * 0.6)
    }

    if (opts?.withOverview && circlesById.size > 1) {
      const group = L.featureGroup(Array.from(circlesById.values()))
      // Zoom out to fleet overview first, then fly in
      map.flyToBounds(group.getBounds().pad(0.2), {
        duration: 1.4,
        easeLinearity: 0.35,
      })
      setTimeout(flyIn, 1500)
    } else {
      flyIn()
    }
  },
  closeAllTooltips() {
    circlesById.forEach((c) => c.closeTooltip())
  },
  fitAll() {
    if (!map || circlesById.size === 0) return
    const group = L.featureGroup(Array.from(circlesById.values()))
    map.fitBounds(group.getBounds().pad(0.2))
  },
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
.hai-tip.is-warning .hai-tip-halo {
  background: color-mix(in srgb, var(--warn, #f5a524) 55%, transparent);
  animation: hai-tip-pulse 1.2s ease-in-out infinite;
}
.hai-tip.is-error .hai-tip-halo {
  background: color-mix(in srgb, var(--offline, #ff7a7a) 55%, transparent);
  animation: hai-tip-pulse 1.2s ease-in-out infinite;
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
.hai-tip.is-warning .hai-tip-ripple {
  border-color: color-mix(in srgb, var(--warn, #f5a524) 50%, transparent);
  animation: hai-tip-ripple 1.2s ease-out infinite;
}
.hai-tip.is-error .hai-tip-ripple {
  border-color: color-mix(in srgb, var(--offline, #ff7a7a) 55%, transparent);
  animation: hai-tip-ripple 1.2s ease-out infinite;
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
.hai-tip.is-warning .hai-tip-state {
  color: var(--warn, #f5a524);
}
.hai-tip.is-error .hai-tip-state,
.hai-tip.is-offline .hai-tip-state {
  color: var(--offline, #ff7a7a);
}

/* HTML markers (divIcon) — keep their pixel size during zoom */
.hai-marker {
  background: transparent;
  border: 0;
  pointer-events: auto;
}
.hai-marker-dot {
  display: block;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid #ffffff;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.25), 0 2px 6px rgba(0, 0, 0, 0.35);
  background: #00d4aa;
  transition: transform 0.15s ease;
}
.hai-marker-offline .hai-marker-dot,
.hai-marker-error .hai-marker-dot   { background: #ff7a7a; }
.hai-marker-warning .hai-marker-dot { background: #f5a524; }
.hai-marker-ok .hai-marker-dot      { background: #00d4aa; }
.hai-marker:hover .hai-marker-dot   { transform: scale(1.25); }

.hai-marker-warning .hai-marker-dot { animation: hai-marker-pulse 1.2s ease-in-out infinite; }
.hai-marker-error   .hai-marker-dot { animation: hai-marker-pulse 1.0s ease-in-out infinite; }

@keyframes hai-marker-pulse {
  0%, 100% { box-shadow: 0 0 0 0   rgba(255, 122, 122, 0.6); }
  50%       { box-shadow: 0 0 0 10px rgba(255, 122, 122, 0); }
}
.hai-marker-warning .hai-marker-dot {
  animation-name: hai-marker-pulse-warn;
}
@keyframes hai-marker-pulse-warn {
  0%, 100% { box-shadow: 0 0 0 0   rgba(245, 165, 36, 0.6); }
  50%       { box-shadow: 0 0 0 10px rgba(245, 165, 36, 0); }
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

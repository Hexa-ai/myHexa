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
    if (m.label) {
      c.bindTooltip(m.label, { direction: 'top', offset: [0, -8] })
    }
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
</style>

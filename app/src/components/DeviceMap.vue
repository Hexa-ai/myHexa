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
  /** couleur imposée (voyant d'état du tableau de bord) et libellé d'état associé */
  color?: string
  stateText?: string
  /** repère de projet : un carré avec le nombre de box et la synthèse d'état */
  project?: { total: number; online: number; names?: string[] }
  /** position transmise par la box (4G) : précision en mètres -> cercle + mention dans l'infobulle */
  fromBox?: boolean
  accuracyM?: number | null
}

const props = withDefaults(
  defineProps<{
    markers: MarkerInput[]
    height?: string
    zoom?: number
    interactive?: boolean
    /** trace des positions successives de la box (historique 4G), du plus ancien au plus récent */
    track?: Array<[number, number]>
  }>(),
  { height: '260px', zoom: 13, interactive: true, track: () => [] },
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

const CARTO_KEY = import.meta.env.VITE_CARTO_API_KEY ?? ''
const cartoTiles = (style: string) =>
  `https://{s}.basemaps.cartocdn.com/rastertiles/${style}/{z}/{x}/{y}.png?key=${CARTO_KEY}`
const TILES = {
  dark: cartoTiles('dark_all'),
  light: cartoTiles('light_all'),
}
const ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &middot; ' +
  '&copy; <a href="https://carto.com/attributions">CARTO</a>'

function markerStateClass(m: MarkerInput): string {
  if (m.project) {
    const { total, online } = m.project
    if (total > 0 && online === 0) return 'hai-marker-offline'
    if (online < total) return 'hai-marker-partial'
  }
  if (m.online === false) return 'hai-marker-offline'
  if (m.severity === 'error') return 'hai-marker-error'
  if (m.severity === 'warning') return 'hai-marker-warning'
  return 'hai-marker-ok'
}

/** 1250 -> « 1,3 km », 480 -> « 480 m » */
function formatAccuracy(m: number): string {
  return m >= 1000
    ? `${(m / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km`
    : `${Math.round(m)} m`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function projectTooltipHtml(m: MarkerInput): string {
  const { total, online, names = [] } = m.project!
  const off = total - online
  const stateClass =
    online === 0
      ? 'is-offline'
      : off > 0
        ? 'is-warning'
        : m.severity
          ? 'is-' + m.severity
          : 'is-online'
  const stateLabel =
    online === 0
      ? 'Tout déconnecté'
      : off > 0
        ? `${off} box déconnectée${off > 1 ? 's' : ''} sur ${total}`
        : m.severity
          ? 'Alarme en cours'
          : `${total} box connectée${total > 1 ? 's' : ''}`
  const list = names.slice(0, 6).map(escapeHtml).join(' · ') + (names.length > 6 ? ' …' : '')
  return `
    <div class="hai-tip ${stateClass}">
      <div class="hai-tip-text">
        <div class="hai-tip-kind">Projet</div>
        <div class="hai-tip-name">${escapeHtml(m.label ?? '—')}</div>
        <div class="hai-tip-state">${stateLabel}</div>
        <div class="hai-tip-list">${list}</div>
      </div>
    </div>
  `
}

function tooltipHtml(m: MarkerInput): string {
  if (m.project) return projectTooltipHtml(m)
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
  if (m.stateText) stateLabel = m.stateText + (m.online === false ? ' (offline)' : '')
  const name = escapeHtml(m.label ?? '—')
  const approx = m.fromBox
    ? `<div class="hai-tip-approx" data-testid="map-approx">Position 4G approximative${
        m.accuracyM != null ? ` ±${formatAccuracy(m.accuracyM)}` : ''
      }</div>`
    : ''
  return `
    <div class="hai-tip ${stateClass}"${m.color ? ` style="--tip-accent:${escapeHtml(m.color)}"` : ''}>
      <img src="/hai-p-gateway.png" class="hai-tip-img" alt="" />
      <div class="hai-tip-text">
        <div class="hai-tip-name">${name}</div>
        <div class="hai-tip-state">${stateLabel}</div>
        ${approx}
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
    const icon = m.project
      ? L.divIcon({
          className: `hai-marker hai-marker-project ${markerStateClass(m)}`,
          html: `<span class="hai-marker-dot">${m.project.online}/${m.project.total}</span>`,
          iconSize: [34, 22],
          iconAnchor: [17, 11],
        })
      : L.divIcon({
          className: `hai-marker ${markerStateClass(m)}`,
          html: m.color
            ? `<span class="hai-marker-dot" style="background:${escapeHtml(m.color)};box-shadow:0 0 10px ${escapeHtml(m.color)}"></span>`
            : '<span class="hai-marker-dot"></span>',
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
    if (m.fromBox && m.accuracyM != null && m.accuracyM > 0) {
      // cercle de précision (turquoise, discret) sous le repère
      L.circle([m.lat, m.lng], {
        radius: m.accuracyM,
        color: '#00d4aa',
        weight: 1,
        opacity: 0.7,
        fillColor: '#00d4aa',
        fillOpacity: 0.12,
        interactive: false,
        className: 'hai-accuracy-circle',
      }).addTo(layer!)
    }
    c.addTo(layer!)
    circles.push(c)
    circlesById.set(m.id, c)
  }

  if (props.track.length > 1) {
    L.polyline(props.track, {
      color: '#00d4aa',
      weight: 2,
      opacity: 0.8,
      dashArray: '4 6',
      interactive: false,
      className: 'hai-track',
    }).addTo(layer!)
  }

  // une seule box : cadrer sur son cercle de précision et sa trace (sans dépasser le zoom prévu).
  // Bornes calculées à la main : Circle.getBounds() exige une carte déjà positionnée.
  const one = valid.length === 1 ? valid[0] : null
  if (one && (one.accuracyM || props.track.length > 1)) {
    const bounds = L.latLngBounds([[one.lat, one.lng]])
    if (one.fromBox && one.accuracyM) {
      const dLat = one.accuracyM / 111320
      const dLng = one.accuracyM / (111320 * Math.max(0.05, Math.cos((one.lat * Math.PI) / 180)))
      bounds.extend([one.lat - dLat, one.lng - dLng]).extend([one.lat + dLat, one.lng + dLng])
    }
    if (props.track.length > 1) bounds.extend(L.latLngBounds(props.track))
    map.fitBounds(bounds.pad(0.15), { maxZoom: props.zoom })
  } else if (valid.length === 1) {
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
    maxZoom: 20,
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

watch(() => [props.markers, props.track], buildMarkers, { deep: true })
watch(theme, applyTiles)

onBeforeUnmount(() => {
  map?.remove()
  map = null
})

defineExpose({
  invalidateSize: () => map?.invalidateSize(),
  focusMarker(id: string, opts?: { zoom?: number; duration?: number; withOverview?: boolean }) {
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
.hai-tip-approx {
  margin-top: 3px;
  font-size: 9px;
  letter-spacing: 0.04em;
  color: var(--muted-foreground);
  white-space: normal;
  max-width: 130px;
  text-align: center;
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
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.25),
    0 2px 6px rgba(0, 0, 0, 0.35);
  background: #00d4aa;
  transition: transform 0.15s ease;
}
.hai-marker-offline .hai-marker-dot,
.hai-marker-error .hai-marker-dot {
  background: #ff7a7a;
}
.hai-marker-warning .hai-marker-dot {
  background: #f5a524;
}
.hai-marker-ok .hai-marker-dot {
  background: #00d4aa;
}
.hai-marker:hover .hai-marker-dot {
  transform: scale(1.25);
}
/* projet : carré arrondi avec connectées / total */
.hai-marker-project .hai-marker-dot {
  width: 34px;
  height: 22px;
  border-radius: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  font:
    600 10px/1 ui-monospace,
    monospace;
  color: #04130f;
}
.hai-marker-partial .hai-marker-dot {
  background: #f5a524;
}
.hai-tip-kind {
  font-family: ui-monospace, monospace;
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  opacity: 0.6;
}
.hai-tip-list {
  font-size: 10px;
  opacity: 0.7;
  margin-top: 2px;
  max-width: 220px;
  white-space: normal;
}

.hai-marker-warning .hai-marker-dot {
  animation: hai-marker-pulse 1.2s ease-in-out infinite;
}
.hai-marker-error .hai-marker-dot {
  animation: hai-marker-pulse 1s ease-in-out infinite;
}

@keyframes hai-marker-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(255, 122, 122, 0.6);
  }
  50% {
    box-shadow: 0 0 0 10px rgba(255, 122, 122, 0);
  }
}
.hai-marker-warning .hai-marker-dot {
  animation-name: hai-marker-pulse-warn;
}
@keyframes hai-marker-pulse-warn {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(245, 165, 36, 0.6);
  }
  50% {
    box-shadow: 0 0 0 10px rgba(245, 165, 36, 0);
  }
}
</style>

<script setup lang="ts">
// Stylized line-art rendering of the HAI-P Gateway monitoring box.
// Uses currentColor for strokes so it adapts to theme. LEDs use the
// signal mint color to evoke "live monitoring".
withDefaults(
  defineProps<{
    /** Whether to animate one LED pulsing (for "live" effect). */
    animated?: boolean
  }>(),
  { animated: false },
)
</script>

<template>
  <svg
    viewBox="0 0 220 320"
    fill="none"
    stroke="currentColor"
    stroke-width="1.4"
    stroke-linecap="round"
    stroke-linejoin="round"
    role="img"
    aria-label="HAI-P Gateway"
  >
    <!-- Antennas -->
    <g>
      <line x1="85" y1="65" x2="78" y2="10" />
      <circle cx="78" cy="10" r="2.4" fill="currentColor" />
      <line x1="115" y1="65" x2="122" y2="14" />
      <circle cx="122" cy="14" r="2.4" fill="currentColor" />
    </g>

    <!-- Antenna ports (top of body) -->
    <rect x="75" y="60" width="20" height="8" rx="1.5" />
    <rect x="112" y="60" width="20" height="8" rx="1.5" />

    <!-- DIN-rail mounting bracket (left ear) -->
    <path d="M 55 90 L 38 90 L 38 240 L 55 240" />
    <line x1="55" y1="105" x2="55" y2="225" />

    <!-- Main body -->
    <rect x="55" y="68" width="125" height="220" rx="3" />

    <!-- Ventilation grille (left half) -->
    <g opacity="0.55">
      <line x1="65" y1="90" x2="65" y2="270" />
      <line x1="72" y1="90" x2="72" y2="270" />
      <line x1="79" y1="90" x2="79" y2="270" />
      <line x1="86" y1="90" x2="86" y2="270" />
      <line x1="93" y1="90" x2="93" y2="270" />
      <line x1="100" y1="90" x2="100" y2="270" />
      <line x1="107" y1="90" x2="107" y2="270" />
      <line x1="114" y1="90" x2="114" y2="270" />
    </g>

    <!-- Brand mark (small hexagon stamp) -->
    <g transform="translate(85 100)">
      <polygon points="0,-5 4.3,-2.5 4.3,2.5 0,5 -4.3,2.5 -4.3,-2.5" />
    </g>

    <!-- Right panel divider -->
    <line x1="125" y1="78" x2="125" y2="278" />

    <!-- LED panel -->
    <g class="leds">
      <!-- Left column labels (subtle dots) -->
      <circle cx="135" cy="95" r="2.4" fill="currentColor" class="led-pwr" />
      <circle cx="135" cy="108" r="2.4" />
      <circle cx="135" cy="121" r="2.4" />
      <circle cx="135" cy="134" r="2.4" />
      <!-- Right column -->
      <circle cx="160" cy="95" r="2.4" />
      <circle cx="160" cy="108" r="2.4" class="led-signal" />
      <circle cx="160" cy="121" r="2.4" />
      <circle cx="160" cy="134" r="2.4" />
    </g>

    <!-- I/O terminal block A (small, top) -->
    <rect x="135" y="155" width="35" height="14" rx="1" />
    <line x1="143" y1="155" x2="143" y2="169" />
    <line x1="153" y1="155" x2="153" y2="169" />
    <line x1="163" y1="155" x2="163" y2="169" />

    <!-- I/O terminal block B (larger, bottom) -->
    <rect x="135" y="180" width="35" height="32" rx="1" />
    <g>
      <line x1="143" y1="180" x2="143" y2="212" />
      <line x1="153" y1="180" x2="153" y2="212" />
      <line x1="163" y1="180" x2="163" y2="212" />
      <line x1="135" y1="196" x2="170" y2="196" />
    </g>

    <!-- Ethernet ports (2 RJ45) -->
    <g>
      <rect x="135" y="225" width="35" height="18" rx="1.5" />
      <line x1="139" y1="240" x2="139" y2="244" />
      <line x1="166" y1="240" x2="166" y2="244" />

      <rect x="135" y="252" width="35" height="18" rx="1.5" />
      <line x1="139" y1="267" x2="139" y2="271" />
      <line x1="166" y1="267" x2="166" y2="271" />
    </g>

    <!-- Base shadow line -->
    <line x1="48" y1="295" x2="187" y2="295" opacity="0.3" />
  </svg>
</template>

<style scoped>
.led-pwr {
  color: #00d4aa;
  fill: #00d4aa;
  stroke: #00d4aa;
}
.led-signal {
  color: #00d4aa;
  fill: #00d4aa;
  stroke: #00d4aa;
}

.leds .led-signal {
  animation: pulse 2.4s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 0.35; }
  50% { opacity: 1; }
}
</style>

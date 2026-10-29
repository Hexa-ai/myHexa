<script setup lang="ts">
// Pictogramme météo en trait (pas d'emoji) : soleil, lune, nuages, pluie, neige, orage, brouillard.
defineProps<{ cond: string | null; night?: boolean; size?: number }>()
</script>

<template>
  <svg
    :width="size ?? 28"
    :height="size ?? 28"
    viewBox="0 0 32 32"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    :data-cond="cond ?? ''"
  >
    <!-- astre seul -->
    <template v-if="cond === 'clear'">
      <path v-if="night" d="M20 6a10 10 0 1 0 6 14A8 8 0 0 1 20 6z" />
      <template v-else>
        <circle cx="16" cy="16" r="5.5" />
        <path
          d="M16 3.5v3M16 25.5v3M3.5 16h3M25.5 16h3M7.2 7.2l2.1 2.1M22.7 22.7l2.1 2.1M7.2 24.8l2.1-2.1M22.7 9.3l2.1-2.1"
        />
      </template>
    </template>
    <template v-else>
      <!-- astre derrière le nuage -->
      <template v-if="cond === 'partly'">
        <path v-if="night" d="M15 5a6.5 6.5 0 1 0 6.5 8.5A5 5 0 0 1 15 5z" />
        <template v-else>
          <circle cx="12" cy="11" r="4" />
          <path d="M12 3.5v1.8M4.5 11h1.8M6.7 5.7l1.3 1.3M17.3 5.7 16 7" />
        </template>
      </template>
      <!-- nuage -->
      <path
        d="M9.5 24h13a5 5 0 0 0 .6-9.96A7 7 0 0 0 9.8 15.5 4.3 4.3 0 0 0 9.5 24z"
        :class="cond === 'partly' ? 'fill-card' : ''"
      />
      <path v-if="cond === 'rain'" d="M12 27l-1 2.5M17 27l-1 2.5M22 27l-1 2.5" />
      <path
        v-else-if="cond === 'drizzle'"
        d="M12 27.5v.5M17 27.5v.5M22 27.5v.5"
        stroke-width="2.2"
      />
      <path
        v-else-if="cond === 'snow'"
        d="M12 27v2.4M10.8 28.2h2.4M18 27v2.4M16.8 28.2h2.4M24 27v2.4M22.8 28.2h2.4"
      />
      <path v-else-if="cond === 'storm'" d="M17.5 24.5l-2.5 3.5h3l-2 3" />
      <path v-else-if="cond === 'fog'" d="M7 27.5h18M10 30h12" />
    </template>
  </svg>
</template>

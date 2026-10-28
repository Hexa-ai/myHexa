<script setup lang="ts">
// Barre d'onglets du bas (téléphone < 768 px, et application installée) : icône + libellé,
// zone de sécurité du bas respectée. Reprend le principe du dashboard interne Hexa-AI.
defineProps<{
  active: 'devices' | 'dashboards' | 'projects' | 'alarms' | null
  alarms: number
  menuOpen: boolean
}>()
const emit = defineEmits<{
  go: ['devices' | 'dashboards' | 'projects' | 'alarms']
  menu: []
}>()
const tabs = [
  { k: 'devices', label: 'Box', d: 'M4 6h16v12H4z M8 10h.01 M12 10h.01 M4 14h16' },
  {
    k: 'dashboards',
    label: 'Tableaux',
    d: 'M4 4h7v9H4z M13 4h7v5h-7z M13 11h7v9h-7z M4 15h7v5H4z',
  },
  { k: 'projects', label: 'Projets', d: 'M3 7h7l2 2h9v10H3z' },
  { k: 'alarms', label: 'Alarmes', d: 'M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z M10 20a2 2 0 0 0 4 0' },
] as const
</script>

<template>
  <nav class="mobile-tabs md:hidden" aria-label="Navigation principale" data-testid="mobile-tabs">
    <button
      v-for="t in tabs"
      :key="t.k"
      type="button"
      :class="['mobile-tab', active === t.k && 'is-active']"
      :aria-current="active === t.k ? 'page' : undefined"
      :data-testid="`tab-${t.k}`"
      @click="emit('go', t.k)"
    >
      <span class="relative">
        <svg
          viewBox="0 0 24 24"
          class="size-5"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linejoin="round"
          stroke-linecap="round"
        >
          <path :d="t.d" />
        </svg>
        <span v-if="t.k === 'alarms' && alarms > 0" class="mobile-tab-badge tabular">{{
          alarms > 99 ? '99+' : alarms
        }}</span>
      </span>
      <span>{{ t.label }}</span>
    </button>
    <button
      type="button"
      :class="['mobile-tab', menuOpen && 'is-active']"
      data-testid="tab-menu"
      @click="emit('menu')"
    >
      <svg
        viewBox="0 0 24 24"
        class="size-5"
        fill="none"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linecap="round"
      >
        <path d="M4 7h16 M4 12h16 M4 17h16" />
      </svg>
      <span>Menu</span>
    </button>
  </nav>
</template>

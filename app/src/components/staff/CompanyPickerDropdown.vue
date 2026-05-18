<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useStaffCompanies } from '@/composables/useStaffCompanies'

const props = defineProps<{ modelValue: string | null }>()
const emit = defineEmits<{ 'update:modelValue': [id: string | null] }>()

const open = ref(false)
const query = ref('')
const { companies, fetch } = useStaffCompanies()
onMounted(() => fetch())

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return companies.value
  return companies.value.filter((c) => c.name.toLowerCase().includes(q))
})

const currentName = computed(
  () => companies.value.find((c) => c.id === props.modelValue)?.name ?? null,
)

function select(id: string) {
  emit('update:modelValue', id)
  open.value = false
  query.value = ''
}
</script>

<template>
  <div class="relative">
    <button
      type="button"
      class="font-mono text-[11px] uppercase tracking-wider border border-signal/50 bg-signal/10 text-signal px-2.5 py-1 rounded inline-flex items-center gap-1.5 hover:bg-signal/20 transition"
      @click="open = !open"
    >
      {{ currentName ?? 'Choisir une compagnie…' }}
      <span class="text-[10px]">▾</span>
    </button>
    <div
      v-if="open"
      class="absolute top-full left-0 mt-1 w-64 border border-border bg-card rounded-md shadow-lg z-50"
    >
      <input
        v-model="query"
        type="text"
        placeholder="Rechercher…"
        class="w-full px-3 py-2 bg-transparent border-b border-border text-sm font-mono focus:outline-none focus:border-signal"
        @click.stop
      />
      <div class="max-h-72 overflow-y-auto">
        <button
          v-for="c in filtered"
          :key="c.id"
          type="button"
          class="w-full text-left px-3 py-2 text-sm hover:bg-secondary/50 transition flex items-center justify-between"
          @click="select(c.id)"
        >
          <span>{{ c.name }}</span>
          <span
            v-if="c.is_hexa_internal"
            class="font-mono text-[9px] uppercase tracking-wider text-signal"
          >
            interne
          </span>
        </button>
        <p v-if="!filtered.length" class="px-3 py-3 text-sm text-muted-foreground">
          Aucune compagnie
        </p>
      </div>
    </div>
  </div>
</template>

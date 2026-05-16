<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  modelValue: string[] | null
  devices: Array<{ id: string; name: string | null }>
}>()
const emit = defineEmits<{ 'update:modelValue': [val: string[] | null] }>()

const allSelected = computed(() => props.modelValue === null)
const selected = computed(() => new Set(props.modelValue ?? []))

function toggleAll() {
  emit('update:modelValue', allSelected.value ? [] : null)
}

function toggle(id: string) {
  if (allSelected.value) {
    emit('update:modelValue', props.devices.filter((d) => d.id !== id).map((d) => d.id))
    return
  }
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  emit('update:modelValue', Array.from(next))
}
</script>

<template>
  <div class="space-y-2">
    <label class="flex items-center gap-2 text-sm">
      <input type="checkbox" :checked="allSelected" @change="toggleAll" />
      <span class="font-medium">Tous les devices</span>
    </label>
    <div v-if="!allSelected" class="max-h-48 overflow-y-auto border border-border rounded-md p-2 space-y-1">
      <label v-for="d in devices" :key="d.id" class="flex items-center gap-2 text-sm py-0.5">
        <input
          type="checkbox"
          :checked="selected.has(d.id)"
          @change="toggle(d.id)"
        />
        <span>{{ d.name ?? d.id }}</span>
      </label>
      <p v-if="devices.length === 0" class="text-xs text-muted-foreground">Aucun device</p>
    </div>
  </div>
</template>

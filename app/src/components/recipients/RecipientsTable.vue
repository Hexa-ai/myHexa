<script setup lang="ts">
import { computed } from 'vue'
import type { Recipient } from '@/composables/useRecipients'

const props = defineProps<{
  items: Recipient[]
  search: string
}>()
const emit = defineEmits<{
  edit: [r: Recipient]
  remove: [r: Recipient]
}>()

const filtered = computed(() => {
  const q = props.search.trim().toLowerCase()
  if (!q) return props.items
  return props.items.filter(
    (r) =>
      r.name.toLowerCase().includes(q) ||
      (r.contact_email?.toLowerCase().includes(q) ?? false),
  )
})

function accessLabel(r: Recipient): string {
  const restrict = r.restrict_to_devices?.length ?? 0
  const shared = r.shared_devices?.length ?? 0
  const parts: string[] = []
  if (restrict > 0) parts.push(`${restrict} équipement${restrict > 1 ? 's' : ''}`)
  else parts.push('Tous')
  if (shared > 0) parts.push(`+${shared} partagé${shared > 1 ? 's' : ''}`)
  return parts.join(' · ')
}
</script>

<template>
  <div class="border border-border rounded-md overflow-x-auto">
    <table class="w-full text-sm">
      <thead class="bg-secondary/30 text-xs uppercase tracking-wide text-muted-foreground">
        <tr>
          <th class="text-left px-3 py-2">Nom</th>
          <th class="text-left px-3 py-2">Email</th>
          <th class="text-left px-3 py-2">Téléphone</th>
          <th class="text-left px-3 py-2">Rôle</th>
          <th class="text-left px-3 py-2">Accès</th>
          <th class="text-right px-3 py-2">Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in filtered" :key="r.id" class="border-t border-border">
          <td class="px-3 py-2">{{ r.name }}</td>
          <td class="px-3 py-2">{{ r.contact_email ?? '—' }}</td>
          <td class="px-3 py-2">{{ r.phone ?? '—' }}</td>
          <td class="px-3 py-2">{{ r.role }}</td>
          <td class="px-3 py-2">{{ accessLabel(r) }}</td>
          <td class="px-3 py-2 text-right space-x-3 whitespace-nowrap">
            <button class="text-xs hover:underline" @click="emit('edit', r)">Éditer</button>
            <button class="text-xs text-red-500 hover:underline" @click="emit('remove', r)">Supprimer</button>
          </td>
        </tr>
        <tr v-if="filtered.length === 0">
          <td colspan="6" class="px-3 py-6 text-center text-muted-foreground">Aucun destinataire</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

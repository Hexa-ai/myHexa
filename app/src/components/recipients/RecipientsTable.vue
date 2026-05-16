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
  invite: [r: Recipient]
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

function deviceLabel(r: Recipient): string {
  if (r.allowed_device_ids === null) return 'Tous'
  if (r.allowed_device_ids.length === 0) return '—'
  return String(r.allowed_device_ids.length)
}

function typeOf(r: Recipient): 'Membre' | 'Externe' {
  return r.auth_user_id ? 'Membre' : 'Externe'
}

function canInvite(r: Recipient): boolean {
  return r.auth_user_id === null
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
          <th class="text-left px-3 py-2">Type</th>
          <th class="text-left px-3 py-2">Rôle</th>
          <th class="text-left px-3 py-2">Devices</th>
          <th class="text-right px-3 py-2">Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in filtered" :key="r.id" class="border-t border-border">
          <td class="px-3 py-2">{{ r.name }}</td>
          <td class="px-3 py-2">{{ r.contact_email ?? '—' }}</td>
          <td class="px-3 py-2">{{ r.phone ?? '—' }}</td>
          <td class="px-3 py-2">
            <span class="text-xs px-1.5 py-0.5 rounded border border-border">{{ typeOf(r) }}</span>
          </td>
          <td class="px-3 py-2">{{ r.role }}</td>
          <td class="px-3 py-2">{{ deviceLabel(r) }}</td>
          <td class="px-3 py-2 text-right space-x-3 whitespace-nowrap">
            <button
              v-if="canInvite(r)"
              @click="emit('invite', r)"
              class="text-xs text-primary hover:underline"
              title="Inviter comme membre"
            >
              Inviter
            </button>
            <button @click="emit('edit', r)" class="text-xs hover:underline">Éditer</button>
            <button @click="emit('remove', r)" class="text-xs text-red-500 hover:underline">Supprimer</button>
          </td>
        </tr>
        <tr v-if="filtered.length === 0">
          <td colspan="7" class="px-3 py-6 text-center text-muted-foreground">Aucun destinataire</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

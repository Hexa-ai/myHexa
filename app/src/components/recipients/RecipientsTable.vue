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
  <div>
  <div class="hidden md:block border border-border rounded-md overflow-x-auto">
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
          <td class="px-3 py-2">
            <span class="inline-flex items-center gap-2">
              {{ r.name }}
              <span
                v-if="r.company_id === null"
                title="Destinataire externe (sans compagnie d'attache)"
                class="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-secondary text-muted-foreground border border-border"
              >externe</span>
            </span>
          </td>
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

  <!-- Mobile cards -->
  <div class="md:hidden space-y-2 fade-up">
    <div
      v-for="(r, i) in filtered"
      :key="`mr-${r.id}`"
      class="border border-border rounded-md bg-card/40 px-4 py-3 fade-up"
      :style="{ animationDelay: `${Math.min(i * 25, 400)}ms` }"
    >
      <div class="flex items-center justify-between gap-2 mb-1.5">
        <span class="flex items-center gap-2 min-w-0">
          <span class="font-medium tracking-tight truncate">{{ r.name }}</span>
          <span
            v-if="r.company_id === null"
            class="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-secondary text-muted-foreground border border-border shrink-0"
          >externe</span>
        </span>
        <span class="font-mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-secondary/60 text-muted-foreground shrink-0">
          {{ r.role }}
        </span>
      </div>
      <div class="text-xs text-muted-foreground space-x-1">
        <span>{{ r.contact_email ?? '—' }}</span>
        <span v-if="r.phone">· {{ r.phone }}</span>
        <span>· {{ accessLabel(r) }}</span>
      </div>
      <div class="mt-2 flex items-center gap-3 justify-end">
        <button class="text-xs hover:underline" @click="emit('edit', r)">Éditer</button>
        <button class="text-xs text-red-500 hover:underline" @click="emit('remove', r)">Supprimer</button>
      </div>
    </div>
    <div v-if="filtered.length === 0" class="border border-border rounded-md bg-card/40 p-6 text-center text-muted-foreground text-sm">
      Aucun destinataire
    </div>
  </div>
  </div>
</template>

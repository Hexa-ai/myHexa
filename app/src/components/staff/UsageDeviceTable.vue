<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import {
  deviceBytes,
  deviceFiles,
  deviceTsMonth,
  fmtBytes,
  type UsageDevice,
} from '@/composables/useUsage'

const props = defineProps<{ rows: UsageDevice[]; showCompany?: boolean }>()

type Key = 'name' | 'vars' | 'files' | 'bytes' | 'month' | 'status'
const sortKey = ref<Key>('bytes')
const asc = ref(false)
function sortBy(k: Key) {
  if (sortKey.value === k) asc.value = !asc.value
  else {
    sortKey.value = k
    asc.value = k === 'name'
  }
}
const val = (d: UsageDevice, k: Key): number | string =>
  k === 'name'
    ? d.device_name.toLowerCase()
    : k === 'vars'
      ? d.vars
      : k === 'files'
        ? deviceFiles(d)
        : k === 'bytes'
          ? deviceBytes(d)
          : k === 'month'
            ? deviceTsMonth(d)
            : d.status_24h
const sorted = computed(() =>
  [...props.rows].sort((a, b) => {
    const x = val(a, sortKey.value)
    const y = val(b, sortKey.value)
    const c = x < y ? -1 : x > y ? 1 : 0
    return asc.value ? c : -c
  }),
)
const th =
  'font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-3 py-2.5 cursor-pointer select-none hover:text-foreground'
const arrow = (k: Key) => (sortKey.value === k ? (asc.value ? ' ↑' : ' ↓') : '')
function ago(iso: string | null) {
  if (!iso) return 'jamais'
  const h = (Date.now() - Date.parse(iso)) / 3.6e6
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`
  if (h < 48) return `${Math.round(h)} h`
  return `${Math.round(h / 24)} j`
}
</script>

<template>
  <div
    class="border border-border rounded-md bg-card/40 overflow-x-auto"
    data-testid="usage-devices"
  >
    <table class="w-full text-sm">
      <thead class="bg-card/60 border-b border-border">
        <tr>
          <th :class="th" class="text-left" @click="sortBy('name')">Box{{ arrow('name') }}</th>
          <th v-if="showCompany" class="text-left" :class="th">Client</th>
          <th :class="th" class="text-left">Connexion</th>
          <th :class="th" class="text-right" @click="sortBy('vars')">
            Variables{{ arrow('vars') }}
          </th>
          <th :class="th" class="text-right" @click="sortBy('status')">
            Statuts 24 h{{ arrow('status') }}
          </th>
          <th :class="th" class="text-right" @click="sortBy('files')">
            Fichiers{{ arrow('files') }}
          </th>
          <th :class="th" class="text-right" @click="sortBy('bytes')">
            Stockage{{ arrow('bytes') }}
          </th>
          <th :class="th" class="text-right" @click="sortBy('month')">
            Historique / mois{{ arrow('month') }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="d in sorted"
          :key="d.device_id"
          class="border-b border-border/50 last:border-0 hover:bg-secondary/40"
        >
          <td class="px-3 py-2">
            <RouterLink
              :to="{ name: 'admin-device-detail', params: { id: d.device_id } }"
              class="font-medium hover:text-signal"
              >{{ d.device_name }}</RouterLink
            >
          </td>
          <td v-if="showCompany" class="px-3 py-2 text-muted-foreground truncate max-w-[160px]">
            {{ d.company_name }}
          </td>
          <td class="px-3 py-2 font-mono text-xs whitespace-nowrap">
            <span
              :class="[
                'inline-block size-1.5 rounded-full mr-1.5 align-middle',
                d.connected ? 'bg-online' : 'bg-muted-foreground/40',
              ]"
            />
            <span :class="d.connected ? '' : 'text-muted-foreground'">{{
              ago(d.last_connection_at)
            }}</span>
          </td>
          <td class="px-3 py-2 text-right font-mono tabular">{{ d.vars }}</td>
          <td class="px-3 py-2 text-right font-mono tabular text-muted-foreground">
            {{ d.status_24h }}
          </td>
          <td class="px-3 py-2 text-right font-mono tabular text-muted-foreground">
            {{ deviceFiles(d) }}
          </td>
          <td
            class="px-3 py-2 text-right font-mono tabular"
            :title="`historique ${fmtBytes(d.ts_bytes)} · documents ${fmtBytes(d.doc_bytes)} · photos ${fmtBytes(d.photo_bytes)} · rapports en base ${fmtBytes(d.report_bytes)}`"
          >
            {{ fmtBytes(deviceBytes(d)) }}
          </td>
          <td class="px-3 py-2 text-right font-mono tabular text-muted-foreground">
            {{ deviceTsMonth(d) ? fmtBytes(deviceTsMonth(d)) : '–' }}
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td colspan="8" class="px-4 py-6 text-center text-muted-foreground text-sm">
            Aucune box
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

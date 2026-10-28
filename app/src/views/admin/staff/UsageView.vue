<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import UsageDeviceTable from '@/components/staff/UsageDeviceTable.vue'
import {
  fmtBytes,
  loadUsageDevices,
  loadUsagePlatform,
  loadUsageTrend,
  totals,
  type UsageDevice,
  type UsagePlatform,
  type UsageTrendRow,
} from '@/composables/useUsage'

const route = useRoute()
const router = useRouter()
const rows = ref<UsageDevice[]>([])
const platform = ref<UsagePlatform | null>(null)
const trend = ref<UsageTrendRow[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const selected = ref<string | null>((route.query.c as string) || null)

async function load() {
  loading.value = true
  error.value = null
  try {
    const [r, p, t] = await Promise.all([loadUsageDevices(), loadUsagePlatform(), loadUsageTrend()])
    rows.value = r
    platform.value = p
    trend.value = t
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}
onMounted(load)

const global = computed(() => totals(rows.value))
const companyFiles = computed(() => {
  const m = new Map<string, number>()
  for (const f of platform.value?.company_files ?? []) m.set(f.company_id, f.bytes)
  return m
})
const byCompany = computed(() => {
  const m = new Map<string, { id: string; name: string; rows: UsageDevice[] }>()
  for (const d of rows.value) {
    const id = d.company_id ?? '-'
    if (!m.has(id)) m.set(id, { id, name: d.company_name ?? 'Sans client', rows: [] })
    m.get(id)!.rows.push(d)
  }
  return [...m.values()]
    .map((c) => ({ ...c, t: totals(c.rows), extra: companyFiles.value.get(c.id) ?? 0 }))
    .sort((a, b) => b.t.bytes + b.extra - (a.t.bytes + a.extra) || b.t.boxes - a.t.boxes)
})
const selectedCompany = computed(() => byCompany.value.find((c) => c.id === selected.value))
function select(id: string) {
  selected.value = selected.value === id ? null : id
  router.replace({ query: selected.value ? { c: selected.value } : {} })
}
const storageTotal = computed(() =>
  (platform.value?.buckets ?? []).reduce((s, b) => s + Number(b.bytes || 0), 0),
)
const filesTotal = computed(() =>
  (platform.value?.buckets ?? []).reduce((s, b) => s + Number(b.files || 0), 0),
)
const perBoxMonth = computed(() =>
  global.value.active ? global.value.ts_month / global.value.active : 0,
)
const BUCKET: Record<string, string> = {
  'ts-archive': 'Historique',
  'device-docs': 'Documents',
  'intervention-photos': 'Photos d’intervention',
  reports: 'Rapports PDF',
  branding: 'Logos',
}
// tendance : croissance du stockage entre le premier et le dernier relevé
const growth = computed(() => {
  const t = trend.value
  if (t.length < 2) return null
  const a = t[0]!
  const b = t[t.length - 1]!
  const days = (Date.parse(b.day) - Date.parse(a.day)) / 864e5
  return days > 0 ? { days, perMonth: ((b.bytes - a.bytes) / days) * 30 } : null
})
const maxBytes = computed(() => Math.max(1, ...trend.value.map((r) => r.bytes)))
const card = 'border border-border rounded-md bg-card/40 px-4 py-3'
const label = 'font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground'
</script>

<template>
  <div class="p-4 sm:p-6 space-y-6" data-testid="usage-view">
    <header class="flex items-end justify-between flex-wrap gap-3">
      <div>
        <h1 class="text-xl font-semibold tracking-tight">Consommation</h1>
        <p class="text-sm text-muted-foreground">
          Box, variables et stockage, au global, par client et par box (vue staff Hexa-ai).
        </p>
      </div>
      <button
        type="button"
        class="font-mono text-[10px] uppercase tracking-wider border border-border px-3 py-1.5 rounded-md hover:border-signal/60"
        :disabled="loading"
        @click="load"
      >
        Actualiser
      </button>
    </header>

    <p v-if="error" class="text-sm text-offline" data-testid="usage-error">{{ error }}</p>
    <p v-else-if="loading && !rows.length" class="text-sm text-muted-foreground">Chargement…</p>

    <template v-if="rows.length">
      <!-- global -->
      <section class="grid grid-cols-2 lg:grid-cols-5 gap-3" data-testid="usage-global">
        <div :class="card">
          <div :class="label">Box</div>
          <div class="text-2xl font-semibold tabular mt-1">{{ global.boxes }}</div>
          <div class="text-xs text-muted-foreground mt-0.5">
            {{ global.connected }} connectées (1 h) · {{ global.active }} avec 7 j d’historique ou
            plus
          </div>
        </div>
        <div :class="card">
          <div :class="label">Variables</div>
          <div class="text-2xl font-semibold tabular mt-1">{{ global.vars }}</div>
          <div class="text-xs text-muted-foreground mt-0.5">
            {{ global.status_24h }} statuts reçus en 24 h
          </div>
        </div>
        <div :class="card">
          <div :class="label">Stockage fichiers</div>
          <div class="text-2xl font-semibold tabular mt-1">{{ fmtBytes(storageTotal) }}</div>
          <div class="text-xs text-muted-foreground mt-0.5">{{ filesTotal }} fichiers</div>
        </div>
        <div :class="card">
          <div :class="label">Base de données</div>
          <div class="text-2xl font-semibold tabular mt-1">
            {{ fmtBytes(platform?.db_bytes ?? 0) }}
          </div>
          <div class="text-xs text-muted-foreground mt-0.5">
            dont rapports reçus {{ fmtBytes(global.report_bytes) }}
          </div>
        </div>
        <div :class="card">
          <div :class="label">Historique / box / mois</div>
          <div class="text-2xl font-semibold tabular mt-1">{{ fmtBytes(perBoxMonth) }}</div>
          <div class="text-xs text-muted-foreground mt-0.5">
            moyenne des box avec historique ({{ fmtBytes(global.ts_month) }} / mois au total)
          </div>
        </div>
      </section>

      <section class="grid lg:grid-cols-2 gap-3">
        <div :class="card" data-testid="usage-buckets">
          <div :class="label" class="mb-2">Répartition du stockage</div>
          <ul class="space-y-1.5 text-sm">
            <li
              v-for="b in platform?.buckets ?? []"
              :key="b.bucket"
              class="flex items-center gap-3"
            >
              <span class="w-44 truncate">{{ BUCKET[b.bucket] ?? b.bucket }}</span>
              <span class="flex-1 h-1.5 rounded bg-secondary overflow-hidden">
                <span
                  class="block h-full bg-signal/70"
                  :style="{ width: `${storageTotal ? (b.bytes / storageTotal) * 100 : 0}%` }"
                />
              </span>
              <span class="w-16 text-right font-mono tabular text-xs">{{ fmtBytes(b.bytes) }}</span>
              <span class="w-20 text-right font-mono tabular text-xs text-muted-foreground"
                >{{ b.files }} fich.</span
              >
            </li>
          </ul>
        </div>
        <div :class="card" data-testid="usage-trend">
          <div :class="label" class="mb-2">Évolution (relevé chaque nuit)</div>
          <template v-if="trend.length >= 2">
            <div class="flex items-end gap-0.5 h-20">
              <span
                v-for="r in trend"
                :key="r.day"
                class="flex-1 bg-signal/60 rounded-t-sm min-h-[2px]"
                :style="{ height: `${(r.bytes / maxBytes) * 100}%` }"
                :title="`${r.day} : ${fmtBytes(r.bytes)}, ${r.boxes} box, ${r.vars} variables`"
              />
            </div>
            <div class="text-xs text-muted-foreground mt-2">
              {{ trend.length }} relevés ·
              <template v-if="growth"
                >croissance {{ fmtBytes(Math.max(0, growth.perMonth)) }} / mois</template
              >
            </div>
          </template>
          <p v-else class="text-sm text-muted-foreground">
            Premier relevé le {{ trend[0]?.day ?? 'cette nuit' }}. La courbe et la croissance
            apparaissent à partir du deuxième relevé. En attendant, la colonne « Historique / mois »
            estime la croissance à partir des jours d’historique déjà stockés.
          </p>
        </div>
      </section>

      <!-- par client -->
      <section class="space-y-2">
        <h2 :class="label">Par client</h2>
        <div
          class="border border-border rounded-md bg-card/40 overflow-x-auto"
          data-testid="usage-companies"
        >
          <table class="w-full text-sm">
            <thead class="bg-card/60 border-b border-border">
              <tr class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                <th class="text-left font-medium px-3 py-2.5">Client</th>
                <th class="text-right font-medium px-3 py-2.5">Box</th>
                <th class="text-right font-medium px-3 py-2.5">Connectées</th>
                <th class="text-right font-medium px-3 py-2.5">Variables</th>
                <th class="text-right font-medium px-3 py-2.5">Fichiers</th>
                <th class="text-right font-medium px-3 py-2.5">Stockage</th>
                <th class="text-right font-medium px-3 py-2.5">Historique / mois</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="c in byCompany"
                :key="c.id"
                :class="[
                  'border-b border-border/50 last:border-0 cursor-pointer',
                  selected === c.id ? 'bg-secondary' : 'hover:bg-secondary/40',
                ]"
                :data-testid="`usage-company-${c.id}`"
                @click="select(c.id)"
              >
                <td class="px-3 py-2 font-medium">{{ c.name }}</td>
                <td class="px-3 py-2 text-right font-mono tabular">{{ c.t.boxes }}</td>
                <td class="px-3 py-2 text-right font-mono tabular text-muted-foreground">
                  {{ c.t.connected }}
                </td>
                <td class="px-3 py-2 text-right font-mono tabular">{{ c.t.vars }}</td>
                <td class="px-3 py-2 text-right font-mono tabular text-muted-foreground">
                  {{ c.t.files }}
                </td>
                <td class="px-3 py-2 text-right font-mono tabular">
                  {{ fmtBytes(c.t.bytes + c.extra) }}
                </td>
                <td class="px-3 py-2 text-right font-mono tabular text-muted-foreground">
                  {{ c.t.ts_month ? fmtBytes(c.t.ts_month) : '–' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- détail par box -->
      <section class="space-y-2">
        <h2 :class="label">
          Par box{{ selectedCompany ? ` · ${selectedCompany.name}` : ' · toutes' }}
        </h2>
        <UsageDeviceTable
          :rows="selectedCompany ? selectedCompany.rows : rows"
          :show-company="!selectedCompany"
        />
        <p class="text-xs text-muted-foreground">
          Stockage = historique + documents + photos + rapports reçus en base (détail au survol). «
          Historique / mois » = taille de l’historique rapportée à ses jours couverts. Connectée =
          dernier message il y a moins d’une heure.
        </p>
      </section>
    </template>
  </div>
</template>

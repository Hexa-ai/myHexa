<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useStaffCompanies } from '@/composables/useStaffCompanies'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/lib/supabase'

const router = useRouter()
const auth = useAuthStore()
const { companies, loading, error, fetch, refresh } = useStaffCompanies()

const showCreate = ref(false)
const newName = ref('')
const creating = ref(false)
const createError = ref<string | null>(null)

onMounted(() => fetch())

const sorted = computed(() => [...companies.value].sort((a, b) => a.name.localeCompare(b.name)))

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR')
}

async function createCompany() {
  const name = newName.value.trim()
  if (!name) { createError.value = 'Nom requis'; return }
  creating.value = true
  createError.value = null
  const { error: err } = await supabase.from('companies').insert({ name })
  creating.value = false
  if (err) { createError.value = err.message; return }
  newName.value = ''
  showCreate.value = false
  await refresh()
}

function openCompany(id: string) {
  router.push({ name: 'staff-company-detail', params: { id } })
}

function enterAs(id: string) {
  auth.setActAsCompany(id)
  router.push({ name: 'admin-devices' })
}
</script>

<template>
  <div class="p-4 sm:p-6 space-y-4">
    <header class="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h1 class="text-xl font-semibold tracking-tight">Compagnies</h1>
        <p class="text-sm text-muted-foreground">Toutes les compagnies clientes (vue staff Hexa-ai).</p>
      </div>
      <button
        v-if="auth.isHexaStaffAdmin"
        type="button"
        class="font-mono text-[10px] uppercase tracking-wider border border-signal/50 text-signal px-3 py-1.5 rounded-md hover:bg-signal-soft transition"
        @click="showCreate = !showCreate"
      >
        + Nouvelle compagnie
      </button>
    </header>

    <div
      v-if="showCreate"
      class="border border-border rounded-md bg-card/40 p-4 flex flex-col sm:flex-row gap-2"
    >
      <input
        v-model="newName"
        type="text"
        placeholder="Nom de la compagnie"
        class="flex-1 bg-transparent border-0 border-b border-border focus:border-signal focus:outline-none px-0 py-2 text-sm font-mono"
        @keydown.enter="createCompany"
      />
      <button
        type="button"
        :disabled="creating"
        class="font-mono text-[11px] uppercase tracking-[0.22em] bg-signal text-primary-foreground px-4 py-2 rounded-md hover:brightness-110 disabled:opacity-50 transition"
        @click="createCompany"
      >
        Créer
      </button>
    </div>
    <p v-if="createError" class="text-sm text-offline">{{ createError }}</p>

    <p v-if="loading && !companies.length" class="text-sm text-muted-foreground">Chargement…</p>
    <p v-if="error" class="text-sm text-offline">{{ error }}</p>

    <div class="hidden md:block border border-border rounded-md bg-card/40 overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-card/60 border-b border-border">
          <tr>
            <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-3">Nom</th>
            <th class="text-right font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-3 w-[100px]">Devices</th>
            <th class="text-right font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-3 w-[120px]">Recipients</th>
            <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-3 w-[120px]">Créée le</th>
            <th class="text-right font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-3 w-[200px]">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="c in sorted"
            :key="c.id"
            class="border-b border-border/50 last:border-0 hover:bg-secondary/40 transition cursor-pointer"
            @click="openCompany(c.id)"
          >
            <td class="px-4 py-3">
              <div class="font-medium flex items-center gap-2">
                {{ c.name }}
                <span v-if="c.is_hexa_internal" class="font-mono text-[9px] uppercase tracking-wider text-signal">interne</span>
              </div>
            </td>
            <td class="px-4 py-3 text-right font-mono tabular text-muted-foreground">{{ c.devices_count }}</td>
            <td class="px-4 py-3 text-right font-mono tabular text-muted-foreground">{{ c.recipients_count }}</td>
            <td class="px-4 py-3 font-mono text-xs text-muted-foreground tabular">{{ fmtDate(c.created_at) }}</td>
            <td class="px-4 py-3 text-right" @click.stop>
              <button
                type="button"
                class="font-mono text-[10px] uppercase tracking-wider border border-signal/50 text-signal px-2.5 py-1 rounded hover:bg-signal-soft transition"
                @click="enterAs(c.id)"
              >
                Entrer →
              </button>
            </td>
          </tr>
          <tr v-if="!sorted.length && !loading">
            <td colspan="5" class="px-4 py-8 text-center text-muted-foreground text-sm">
              Aucune compagnie
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Mobile cards -->
    <div class="md:hidden space-y-2 fade-up">
      <button
        v-for="(c, i) in sorted"
        :key="`mc-${c.id}`"
        class="w-full text-left border border-border rounded-md bg-card/40 px-4 py-3 hover:bg-secondary/40 transition-colors fade-up"
        :style="{ animationDelay: `${Math.min(i * 25, 400)}ms` }"
        @click="openCompany(c.id)"
      >
        <div class="flex items-center justify-between gap-2 mb-1.5">
          <div class="font-medium tracking-tight truncate flex items-center gap-2 min-w-0">
            <span class="truncate">{{ c.name }}</span>
            <span v-if="c.is_hexa_internal" class="font-mono text-[9px] uppercase tracking-wider text-signal shrink-0">interne</span>
          </div>
          <span class="font-mono text-[10px] tabular text-muted-foreground shrink-0">{{ fmtDate(c.created_at) }}</span>
        </div>
        <div class="flex items-center justify-between gap-2">
          <div class="text-xs text-muted-foreground font-mono">
            <span class="tabular">{{ c.devices_count }}</span> devices ·
            <span class="tabular">{{ c.recipients_count }}</span> recipients
          </div>
          <div @click.stop>
            <button
              type="button"
              class="font-mono text-[10px] uppercase tracking-wider border border-signal/50 text-signal px-2.5 py-1 rounded hover:bg-signal-soft transition"
              @click="enterAs(c.id)"
            >
              Entrer →
            </button>
          </div>
        </div>
      </button>
      <div v-if="!sorted.length && !loading" class="border border-border rounded-md bg-card/40 p-6 text-center text-muted-foreground text-sm">
        Aucune compagnie
      </div>
    </div>
  </div>
</template>

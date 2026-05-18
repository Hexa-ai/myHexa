<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useStaffCompanies } from '@/composables/useStaffCompanies'

const route = useRoute()
const router = useRouter()
const { companies, fetch } = useStaffCompanies()

const name = ref('')
const macEth0 = ref('')
const companyId = ref<string>(String(route.query.company ?? ''))
const submitting = ref(false)
const error = ref<string | null>(null)

onMounted(() => fetch())

const canSubmit = computed(() => name.value.trim() && companyId.value)

async function submit() {
  if (!canSubmit.value) return
  submitting.value = true
  error.value = null
  const { error: err } = await supabase
    .from('devices')
    .insert({
      name: name.value.trim(),
      mac_eth0: macEth0.value.trim() || null,
      company_id: companyId.value,
    })
    .select('id')
    .single()
  submitting.value = false
  if (err) { error.value = err.message; return }
  router.push({ name: 'staff-company-detail', params: { id: companyId.value } })
}
</script>

<template>
  <div class="p-4 sm:p-6 max-w-xl mx-auto space-y-5">
    <header>
      <router-link :to="{ name: 'staff-devices' }" class="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground hover:text-foreground transition">
        ← Devices
      </router-link>
      <h1 class="mt-1 text-xl font-semibold tracking-tight">Provisionner un device</h1>
      <p class="text-sm text-muted-foreground">
        Crée un device assigné à une compagnie. L'IoT pourra ensuite bootstrap son token via le flow n8n existant.
      </p>
    </header>

    <form class="space-y-4" @submit.prevent="submit">
      <div class="space-y-1.5">
        <label class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Nom *</label>
        <input
          v-model="name"
          type="text"
          required
          placeholder="ex. CTP-Aubervilliers-01"
          class="w-full bg-transparent border-0 border-b border-border focus:border-signal focus:outline-none px-0 py-2 text-sm font-mono"
        />
      </div>
      <div class="space-y-1.5">
        <label class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">MAC eth0 (optionnel)</label>
        <input
          v-model="macEth0"
          type="text"
          placeholder="aa:bb:cc:dd:ee:ff"
          class="w-full bg-transparent border-0 border-b border-border focus:border-signal focus:outline-none px-0 py-2 text-sm font-mono"
        />
      </div>
      <div class="space-y-1.5">
        <label class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Compagnie cible *</label>
        <select v-model="companyId" required class="w-full bg-card border border-border rounded-md px-3 py-2 text-sm font-mono">
          <option value="">— Sélectionner —</option>
          <option v-for="c in companies" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
      </div>

      <p v-if="error" class="text-sm text-offline">{{ error }}</p>

      <div class="flex justify-end gap-2">
        <button type="button" class="font-mono text-[11px] uppercase tracking-[0.22em] px-4 py-2 rounded-md border border-border" @click="router.back()">
          Annuler
        </button>
        <button
          type="submit"
          :disabled="!canSubmit || submitting"
          class="font-mono text-[11px] uppercase tracking-[0.22em] bg-signal text-primary-foreground px-4 py-2 rounded-md hover:brightness-110 disabled:opacity-50 transition"
        >
          {{ submitting ? 'Création…' : 'Créer le device' }}
        </button>
      </div>
    </form>
  </div>
</template>

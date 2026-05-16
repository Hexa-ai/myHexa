<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useRecipients, type Recipient, type InvitePayload } from '@/composables/useRecipients'
import RecipientsTable from '@/components/recipients/RecipientsTable.vue'
import RecipientFormDrawer from '@/components/recipients/RecipientFormDrawer.vue'

const auth = useAuthStore()
const { items, loading, error, fetchAll, invite, update, remove } = useRecipients()

const devices = ref<Array<{ id: string; name: string | null }>>([])
const search = ref('')
const drawerOpen = ref(false)
const editing = ref<Recipient | null>(null)
const flash = ref<string | null>(null)

async function loadDevices() {
  if (!auth.companyId) return
  const { data } = await supabase
    .from('devices')
    .select('id, name')
    .eq('company_id', auth.companyId)
    .order('name', { ascending: true })
  devices.value = data ?? []
}

onMounted(async () => {
  await Promise.all([fetchAll(), loadDevices()])
})

function openCreate() {
  editing.value = null
  drawerOpen.value = true
}

function openEdit(r: Recipient) {
  editing.value = r
  drawerOpen.value = true
}

function setFlash(msg: string) {
  flash.value = msg
  setTimeout(() => {
    if (flash.value === msg) flash.value = null
  }, 4000)
}

async function handleInvite(payload: InvitePayload) {
  try {
    const res = await invite(payload)
    setFlash(
      res.invited
        ? `Invitation envoyée à ${payload.contact_email}`
        : `Destinataire ${payload.contact_email} créé`,
    )
    drawerOpen.value = false
  } catch (e) {
    setFlash(`Erreur : ${(e as Error).message}`)
  }
}

async function handleSave(id: string, patch: Partial<Recipient>) {
  try {
    await update(id, patch)
    setFlash('Destinataire mis à jour')
    drawerOpen.value = false
  } catch (e) {
    setFlash(`Erreur : ${(e as Error).message}`)
  }
}

async function handleRemove(r: Recipient) {
  if (!confirm(`Supprimer ${r.name} ?`)) return
  try {
    await remove(r.id)
    setFlash(`${r.name} supprimé`)
  } catch (e) {
    setFlash(`Erreur : ${(e as Error).message}`)
  }
}

async function handleResend(r: Recipient) {
  if (!r.contact_email) return
  try {
    const res = await invite({
      recipient_id: r.id,
      name: r.name,
      contact_email: r.contact_email,
      role: (r.role as 'admin' | 'viewer') ?? 'viewer',
      type: 'member',
    })
    setFlash(
      res.invited ? `Invitation envoyée à ${r.contact_email}` : 'Invitation traitée',
    )
  } catch (e) {
    setFlash(`Erreur : ${(e as Error).message}`)
  }
}
</script>

<template>
  <div class="p-6 space-y-4">
    <header class="flex items-center justify-between gap-4 flex-wrap">
      <div>
        <h1 class="text-xl font-semibold">Destinataires</h1>
        <p class="text-sm text-muted-foreground">
          Membres (accès portail) et externes (email uniquement) pour {{ auth.companyName ?? '—' }}.
        </p>
      </div>
      <button class="px-3 py-2 text-sm bg-primary text-primary-foreground rounded-md" @click="openCreate">
        + Ajouter
      </button>
    </header>

    <input
      v-model="search"
      placeholder="Rechercher (nom, email)"
      class="w-full sm:max-w-xs border border-border bg-secondary/30 rounded-md px-3 py-2 text-sm"
    />

    <p v-if="loading" class="text-sm text-muted-foreground">Chargement…</p>
    <p v-if="error" class="text-sm text-red-500">{{ error }}</p>
    <p v-if="flash" class="text-sm text-primary">{{ flash }}</p>

    <RecipientsTable
      :items="items"
      :search="search"
      @edit="openEdit"
      @remove="handleRemove"
      @invite="handleResend"
    />

    <RecipientFormDrawer
      v-model:open="drawerOpen"
      :recipient="editing"
      :devices="devices"
      @invite="handleInvite"
      @save="handleSave"
    />
  </div>
</template>

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
  if (!auth.effectiveCompanyId) return
  const { data } = await supabase
    .from('devices')
    .select('id, name')
    .eq('company_id', auth.effectiveCompanyId)
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
    // Pour un staff Hexa "act-as" une autre compagnie, on force company_id
    // = compagnie effective (sinon l'edge function retombe sur la compagnie
    // native du caller = Hexa-ai, et le recipient atterrit au mauvais endroit).
    // Si le form a déjà mis company_id (cas externe = null), on respecte.
    const effectivePayload: InvitePayload =
      payload.company_id === undefined && auth.isHexaStaff && auth.effectiveCompanyId
        ? { ...payload, company_id: auth.effectiveCompanyId }
        : payload
    const res = await invite(effectivePayload)
    setFlash(
      res.invited
        ? `Invitation envoyée à ${effectivePayload.contact_email}`
        : `Destinataire ${effectivePayload.contact_email} créé`,
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
  const isExternal = r.company_id === null
  const prompt = isExternal
    ? `Retirer vos partages avec ${r.name} ? Si ${r.name} a aussi des partages d'autres compagnies, il les conservera ; sinon le compte sera supprimé.`
    : `Supprimer ${r.name} ?`
  if (!confirm(prompt)) return
  try {
    const mode = await remove(r.id)
    setFlash(mode === 'unshared' ? `Partages retirés pour ${r.name}` : `${r.name} supprimé`)
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
          Destinataires (accès portail + mails) de {{ auth.companyName ?? '—' }}.
        </p>
      </div>
      <button class="px-3 py-2 text-sm bg-primary text-primary-foreground rounded-md" @click="openCreate">
        + Ajouter
      </button>
    </header>

    <input
      v-model="search"
      type="search"
      placeholder="Rechercher (nom, email)"
      autocomplete="off"
      data-lpignore="true"
      data-1p-ignore="true"
      data-form-type="other"
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

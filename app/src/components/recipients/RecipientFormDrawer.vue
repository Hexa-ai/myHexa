<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import DeviceMultiSelect from './DeviceMultiSelect.vue'
import type { Recipient, InvitePayload } from '@/composables/useRecipients'

const props = defineProps<{
  open: boolean
  recipient: Recipient | null
  devices: Array<{ id: string; name: string | null }>
}>()
const emit = defineEmits<{
  'update:open': [val: boolean]
  invite: [payload: InvitePayload]
  save: [id: string, patch: Partial<Recipient>]
}>()

const isEdit = computed(() => props.recipient !== null)

const name = ref('')
const email = ref('')
const phone = ref('')
const role = ref<'admin' | 'viewer'>('viewer')
const type = ref<'member' | 'external'>('external')
const allowedDevices = ref<string[] | null>(null)
const submitting = ref(false)
const error = ref<string | null>(null)

watch(
  () => props.open,
  (o) => {
    if (!o) return
    if (props.recipient) {
      name.value = props.recipient.name
      email.value = props.recipient.contact_email ?? ''
      phone.value = props.recipient.phone ?? ''
      role.value = (props.recipient.role as 'admin' | 'viewer') ?? 'viewer'
      type.value = props.recipient.auth_user_id ? 'member' : 'external'
      allowedDevices.value = props.recipient.allowed_device_ids
    } else {
      name.value = ''
      email.value = ''
      phone.value = ''
      role.value = 'viewer'
      type.value = 'external'
      allowedDevices.value = null
    }
    error.value = null
  },
)

function close() {
  if (!submitting.value) emit('update:open', false)
}

function submit() {
  error.value = null
  if (!name.value.trim()) {
    error.value = 'Nom requis'
    return
  }
  if (!email.value.includes('@')) {
    error.value = 'Email invalide'
    return
  }
  submitting.value = true
  try {
    if (isEdit.value && props.recipient) {
      emit('save', props.recipient.id, {
        name: name.value.trim(),
        phone: phone.value.trim() || null,
        role: role.value,
        allowed_device_ids: allowedDevices.value,
      })
    } else {
      emit('invite', {
        name: name.value.trim(),
        contact_email: email.value.trim().toLowerCase(),
        phone: phone.value.trim() || null,
        role: role.value,
        type: type.value,
        allowed_device_ids: allowedDevices.value,
      })
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center sm:justify-end"
    @click.self="close"
  >
    <div class="bg-background w-full sm:max-w-md h-full sm:h-auto sm:max-h-[90vh] overflow-y-auto border-l border-border p-6 space-y-4">
      <header class="flex items-center justify-between">
        <h2 class="text-lg font-semibold">
          {{ isEdit ? 'Modifier le destinataire' : 'Ajouter un destinataire' }}
        </h2>
        <button @click="close" class="text-muted-foreground hover:text-foreground text-xl leading-none" aria-label="Fermer">×</button>
      </header>

      <div class="space-y-3">
        <label class="block">
          <span class="text-xs uppercase tracking-wide text-muted-foreground">Nom</span>
          <input v-model="name" class="mt-1 w-full border border-border bg-secondary/30 rounded-md px-3 py-2 text-sm" />
        </label>

        <label class="block">
          <span class="text-xs uppercase tracking-wide text-muted-foreground">Email</span>
          <input
            v-model="email"
            type="email"
            :disabled="isEdit"
            class="mt-1 w-full border border-border bg-secondary/30 rounded-md px-3 py-2 text-sm disabled:opacity-60"
          />
          <span v-if="isEdit" class="text-xs text-muted-foreground">L'email ne peut pas être modifié.</span>
        </label>

        <label class="block">
          <span class="text-xs uppercase tracking-wide text-muted-foreground">Téléphone (optionnel)</span>
          <input v-model="phone" class="mt-1 w-full border border-border bg-secondary/30 rounded-md px-3 py-2 text-sm" />
        </label>

        <div v-if="!isEdit">
          <span class="text-xs uppercase tracking-wide text-muted-foreground">Type</span>
          <div class="mt-1 flex gap-3 text-sm">
            <label class="flex items-center gap-1"><input type="radio" value="member" v-model="type" /> Membre (invite)</label>
            <label class="flex items-center gap-1"><input type="radio" value="external" v-model="type" /> Externe (email)</label>
          </div>
        </div>

        <div>
          <span class="text-xs uppercase tracking-wide text-muted-foreground">Rôle</span>
          <div class="mt-1 flex gap-3 text-sm">
            <label class="flex items-center gap-1"><input type="radio" value="viewer" v-model="role" /> Viewer</label>
            <label class="flex items-center gap-1"><input type="radio" value="admin" v-model="role" /> Admin</label>
          </div>
        </div>

        <div>
          <span class="text-xs uppercase tracking-wide text-muted-foreground">Devices accessibles</span>
          <DeviceMultiSelect v-model="allowedDevices" :devices="devices" class="mt-2" />
        </div>
      </div>

      <p v-if="error" class="text-sm text-red-500">{{ error }}</p>

      <footer class="flex justify-end gap-2 pt-2">
        <button @click="close" class="px-3 py-2 text-sm border border-border rounded-md">Annuler</button>
        <button
          @click="submit"
          :disabled="submitting"
          class="px-3 py-2 text-sm bg-primary text-primary-foreground rounded-md disabled:opacity-60"
        >
          {{ isEdit ? 'Enregistrer' : (type === 'member' ? 'Créer + envoyer l\'invite' : 'Créer') }}
        </button>
      </footer>
    </div>
  </div>
</template>

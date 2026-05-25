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
// Type de destinataire :
//  - interne : appartient à la compagnie (company_id = caller's company)
//  - externe : guest (company_id = null), accès défini uniquement via shared_devices
const isExternal = ref(false)
// Mode d'accès intra-compagnie (interne uniquement)
const accessMode = ref<'all' | 'restricted'>('all')
const restrictToDevices = ref<string[] | null>(null)
// Devices partagés (obligatoire si externe)
const sharedDevicesSelection = ref<string[]>([])
const submitting = ref(false)
const error = ref<string | null>(null)

const sharedDevicesCount = computed(() => props.recipient?.shared_devices?.length ?? 0)

watch(
  () => props.open,
  (o) => {
    if (!o) return
    if (props.recipient) {
      name.value = props.recipient.name
      email.value = props.recipient.contact_email ?? ''
      phone.value = props.recipient.phone ?? ''
      role.value = (props.recipient.role as 'admin' | 'viewer') ?? 'viewer'
      isExternal.value = props.recipient.company_id === null
      const restrict = props.recipient.restrict_to_devices
      if (restrict && restrict.length > 0) {
        accessMode.value = 'restricted'
        restrictToDevices.value = restrict
      } else {
        accessMode.value = 'all'
        restrictToDevices.value = null
      }
      sharedDevicesSelection.value = (props.recipient.shared_devices ?? [])
        .filter((id) => props.devices.some((d) => d.id === id))
    } else {
      name.value = ''
      email.value = ''
      phone.value = ''
      role.value = 'viewer'
      isExternal.value = false
      accessMode.value = 'all'
      restrictToDevices.value = null
      sharedDevicesSelection.value = []
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
  if (isExternal.value && sharedDevicesSelection.value.length === 0) {
    error.value = 'Sélectionne au moins un équipement à partager pour un destinataire externe.'
    return
  }
  submitting.value = true
  const effectiveRestrict = isExternal.value
    ? null
    : accessMode.value === 'restricted' && restrictToDevices.value && restrictToDevices.value.length > 0
      ? restrictToDevices.value
      : null
  const effectiveShared = isExternal.value ? sharedDevicesSelection.value : null
  try {
    if (isEdit.value && props.recipient) {
      emit('save', props.recipient.id, {
        name: name.value.trim(),
        phone: phone.value.trim() || null,
        role: role.value,
        restrict_to_devices: effectiveRestrict,
        shared_devices: effectiveShared,
      })
    } else {
      emit('invite', {
        name: name.value.trim(),
        contact_email: email.value.trim().toLowerCase(),
        phone: phone.value.trim() || null,
        role: role.value,
        company_id: isExternal.value ? null : undefined,
        restrict_to_devices: effectiveRestrict,
        shared_devices: effectiveShared,
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
        <button class="text-muted-foreground hover:text-foreground text-xl leading-none" aria-label="Fermer" @click="close">×</button>
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

        <label class="flex items-start gap-2 text-sm border border-border rounded-md p-3 bg-secondary/20">
          <input v-model="isExternal" type="checkbox" :disabled="isEdit" class="mt-1" />
          <span>
            <strong>Destinataire externe</strong>
            <span class="block text-xs text-muted-foreground">
              N'appartient à aucune compagnie. Accès défini exclusivement par les équipements que vous lui partagez ci-dessous.
            </span>
          </span>
        </label>

        <div v-if="!isExternal">
          <span class="text-xs uppercase tracking-wide text-muted-foreground">Rôle</span>
          <div class="mt-1 flex gap-3 text-sm">
            <label class="flex items-center gap-1"><input v-model="role" type="radio" value="viewer" /> Viewer</label>
            <label class="flex items-center gap-1"><input v-model="role" type="radio" value="admin" /> Admin</label>
          </div>
        </div>

        <fieldset v-if="!isExternal" class="space-y-2 pt-1">
          <legend class="text-xs uppercase tracking-wide text-muted-foreground">Accès aux équipements de la compagnie</legend>
          <label class="flex items-start gap-2 text-sm">
            <input v-model="accessMode" type="radio" value="all" class="mt-1" />
            <span>
              <strong>Tous les équipements</strong>
              <span class="block text-xs text-muted-foreground">Le destinataire voit aussi les nouveaux équipements ajoutés ensuite.</span>
            </span>
          </label>
          <label class="flex items-start gap-2 text-sm">
            <input v-model="accessMode" type="radio" value="restricted" class="mt-1" />
            <span>
              <strong>Sélection limitée</strong>
              <span class="block text-xs text-muted-foreground">Limiter à quelques équipements précis.</span>
            </span>
          </label>
          <div v-if="accessMode === 'restricted'" class="pl-6">
            <DeviceMultiSelect v-model="restrictToDevices" :devices="devices" />
          </div>
        </fieldset>

        <fieldset v-if="isExternal" class="space-y-2 pt-1">
          <legend class="text-xs uppercase tracking-wide text-muted-foreground">Équipements à partager (depuis votre compagnie)</legend>
          <p class="text-xs text-muted-foreground">Au moins un équipement requis.</p>
          <div class="max-h-48 overflow-y-auto border border-border rounded-md p-2 space-y-1">
            <label v-for="d in devices" :key="d.id" class="flex items-center gap-2 text-sm py-0.5">
              <input
                type="checkbox"
                :checked="sharedDevicesSelection.includes(d.id)"
                @change="(e) => {
                  const checked = (e.target as HTMLInputElement).checked
                  if (checked) sharedDevicesSelection = [...sharedDevicesSelection, d.id]
                  else sharedDevicesSelection = sharedDevicesSelection.filter((x) => x !== d.id)
                }"
              />
              <span>{{ d.name ?? d.id }}</span>
            </label>
            <p v-if="devices.length === 0" class="text-xs text-muted-foreground">Aucun équipement dans votre compagnie.</p>
          </div>
        </fieldset>

        <div v-if="isEdit && !isExternal && sharedDevicesCount > 0" class="border border-border rounded-md p-3 bg-secondary/30 text-xs">
          <div class="font-mono uppercase tracking-wide text-muted-foreground mb-1">Équipements partagés depuis d'autres compagnies</div>
          <p class="text-foreground">{{ sharedDevicesCount }} équipement(s) partagé(s). Ces partages se gèrent depuis la fiche de chaque équipement.</p>
        </div>
      </div>

      <p v-if="error" class="text-sm text-red-500">{{ error }}</p>

      <footer class="flex justify-end gap-2 pt-2">
        <button class="px-3 py-2 text-sm border border-border rounded-md" @click="close">Annuler</button>
        <button
          :disabled="submitting"
          class="px-3 py-2 text-sm bg-primary text-primary-foreground rounded-md disabled:opacity-60"
          @click="submit"
        >
          {{ isEdit ? 'Enregistrer' : 'Créer + envoyer l\'invitation' }}
        </button>
      </footer>
    </div>
  </div>
</template>

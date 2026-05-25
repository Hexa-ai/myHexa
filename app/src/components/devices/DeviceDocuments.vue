<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useDeviceDocuments, type DeviceDocument, type DocumentKind, KIND_LABELS, fmtSize } from '@/composables/useDeviceDocuments'

const props = defineProps<{
  deviceId: string | null
  canEdit: boolean
}>()

const api = useDeviceDocuments(() => props.deviceId)
const { items, loading, error } = api

// Charge à chaque changement de device
onMounted(() => { if (props.deviceId) api.fetchAll() })
watch(() => props.deviceId, (v) => { if (v) api.fetchAll() })

// --- Form upload ------------------------------------------------------------
const showForm = ref(false)
const file = ref<File | null>(null)
const kind = ref<DocumentKind>('plan_electrique')
const description = ref('')
const isPublic = ref(false)
const submitting = ref(false)
const formError = ref<string | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

function pickFile(e: Event) {
  const t = e.target as HTMLInputElement
  file.value = t.files && t.files.length > 0 ? t.files[0] : null
}

function resetForm() {
  file.value = null
  description.value = ''
  isPublic.value = false
  kind.value = 'plan_electrique'
  formError.value = null
  if (fileInput.value) fileInput.value.value = ''
}

async function submit() {
  if (!file.value) { formError.value = 'Sélectionne un fichier'; return }
  submitting.value = true
  formError.value = null
  try {
    await api.upload(file.value, kind.value, {
      description: description.value.trim() || null,
      isPublic: isPublic.value,
    })
    resetForm()
    showForm.value = false
  } catch (e) {
    formError.value = (e as Error).message
  } finally {
    submitting.value = false
  }
}

// --- Actions item ------------------------------------------------------------
const downloadingId = ref<string | null>(null)
async function download(doc: DeviceDocument) {
  downloadingId.value = doc.id
  try {
    const url = await api.getDownloadUrl(doc)
    if (url) window.open(url, '_blank', 'noopener')
  } finally {
    downloadingId.value = null
  }
}

async function confirmRemove(doc: DeviceDocument) {
  if (!confirm(`Supprimer "${doc.name}" ?`)) return
  try { await api.remove(doc) } catch (e) { alert((e as Error).message) }
}

async function togglePublic(doc: DeviceDocument) {
  try { await api.togglePublic(doc) } catch (e) { alert((e as Error).message) }
}

// --- Helpers d'affichage -----------------------------------------------------
function iconChar(doc: DeviceDocument): string {
  const m = (doc.mime_type ?? '').toLowerCase()
  if (m.startsWith('image/')) return '🖼'
  if (m === 'application/pdf') return '📄'
  if (m.includes('word') || m.includes('document')) return '📝'
  if (m.includes('sheet') || m.includes('excel') || m.includes('csv')) return '📊'
  if (m.includes('zip') || m.includes('compressed')) return '🗜'
  return '📎'
}

const sorted = computed(() => [...items.value].sort((a, b) =>
  new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
))
</script>

<template>
  <section class="border border-border rounded-md bg-card/40 p-5 space-y-4">
    <header class="flex items-center justify-between gap-3 flex-wrap">
      <div>
        <h3 class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Documents</h3>
        <p class="text-xs text-muted-foreground mt-1">
          Plans électriques, analyses fonctionnelles, manuels, photos. Cochez « Accessible via QR code » pour rendre un document consultable depuis la page d'intervention sans login.
        </p>
      </div>
      <button
        v-if="canEdit && !showForm"
        type="button"
        class="font-mono text-[10px] uppercase tracking-wider border border-border text-muted-foreground hover:border-signal/60 hover:text-signal px-3 py-1.5 rounded-md transition"
        @click="showForm = true"
      >
        + Ajouter
      </button>
    </header>

    <!-- Form upload -->
    <div v-if="showForm && canEdit" class="border border-border rounded-md bg-secondary/20 p-4 space-y-3">
      <label class="block">
        <span class="text-xs uppercase tracking-wide text-muted-foreground">Fichier</span>
        <input
          ref="fileInput"
          type="file"
          class="mt-1 block w-full text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-border file:bg-secondary file:text-foreground file:text-xs file:cursor-pointer"
          @change="pickFile"
        />
      </label>
      <label class="block">
        <span class="text-xs uppercase tracking-wide text-muted-foreground">Type</span>
        <select v-model="kind" class="mt-1 w-full border border-border bg-secondary/30 rounded-md px-3 py-2 text-sm">
          <option v-for="(label, key) in KIND_LABELS" :key="key" :value="key">{{ label }}</option>
        </select>
      </label>
      <label class="block">
        <span class="text-xs uppercase tracking-wide text-muted-foreground">Description (optionnel)</span>
        <input v-model="description" type="text" class="mt-1 w-full border border-border bg-secondary/30 rounded-md px-3 py-2 text-sm" placeholder="Notes contextuelles…" />
      </label>
      <label class="flex items-start gap-2 text-sm border border-border rounded-md p-3 bg-card/40">
        <input v-model="isPublic" type="checkbox" class="mt-1" />
        <span>
          <strong>Accessible via QR code</strong>
          <span class="block text-xs text-muted-foreground">Affiché sur la page publique d'intervention (sans login).</span>
        </span>
      </label>
      <p v-if="formError" class="text-sm text-red-500">{{ formError }}</p>
      <div class="flex justify-end gap-2">
        <button class="px-3 py-2 text-sm border border-border rounded-md" :disabled="submitting" @click="showForm = false; resetForm()">Annuler</button>
        <button
          :disabled="submitting"
          class="px-3 py-2 text-sm bg-primary text-primary-foreground rounded-md disabled:opacity-60"
          @click="submit"
        >
          {{ submitting ? 'Upload…' : 'Téléverser' }}
        </button>
      </div>
    </div>

    <p v-if="loading && items.length === 0" class="text-xs text-muted-foreground font-mono">Chargement…</p>
    <p v-if="error" class="text-sm text-red-500">{{ error }}</p>
    <p v-if="!loading && items.length === 0" class="text-sm text-muted-foreground italic">
      Aucun document rattaché à cet équipement.
    </p>

    <ul v-if="items.length > 0" class="space-y-2">
      <li
        v-for="doc in sorted"
        :key="doc.id"
        class="border border-border rounded-md bg-background/40 px-3 py-2.5 flex items-center justify-between gap-3"
      >
        <div class="flex items-center gap-3 min-w-0">
          <span class="text-xl shrink-0" aria-hidden="true">{{ iconChar(doc) }}</span>
          <div class="min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-sm font-medium truncate">{{ doc.name }}</span>
              <span class="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-secondary text-muted-foreground border border-border">
                {{ KIND_LABELS[doc.kind as DocumentKind] ?? doc.kind }}
              </span>
              <span
                v-if="doc.is_public"
                title="Accessible via QR code"
                class="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-signal-soft text-signal border border-signal/40"
              >
                Public
              </span>
            </div>
            <div class="text-[11px] font-mono text-muted-foreground mt-0.5">
              {{ fmtSize(doc.size_bytes) }}
              · {{ new Date(doc.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) }}
              <span v-if="doc.description"> · {{ doc.description }}</span>
            </div>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button
            class="font-mono text-[10px] uppercase tracking-wider text-signal hover:underline disabled:opacity-50"
            :disabled="downloadingId === doc.id"
            @click="download(doc)"
          >
            {{ downloadingId === doc.id ? '…' : 'Télécharger' }}
          </button>
          <button
            v-if="canEdit"
            class="font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
            :title="doc.is_public ? 'Rendre privé' : 'Rendre public (QR code)'"
            @click="togglePublic(doc)"
          >
            {{ doc.is_public ? '→ Privé' : '→ Public' }}
          </button>
          <button
            v-if="canEdit"
            class="font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-offline"
            @click="confirmRemove(doc)"
          >
            Supprimer
          </button>
        </div>
      </li>
    </ul>
  </section>
</template>

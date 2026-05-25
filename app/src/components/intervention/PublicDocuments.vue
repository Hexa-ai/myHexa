<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/supabase'
import { KIND_LABELS, fmtSize, type DocumentKind } from '@/composables/useDeviceDocuments'

type Doc = Database['public']['Tables']['device_documents']['Row']

const props = defineProps<{ deviceId: string }>()

const docs = ref<Doc[]>([])
const loading = ref(false)
const downloadingId = ref<string | null>(null)

async function load() {
  loading.value = true
  const { data } = await supabase
    .from('device_documents')
    .select('*')
    .eq('device_id', props.deviceId)
    .eq('is_public', true)
    .order('created_at', { ascending: false })
  loading.value = false
  docs.value = data ?? []
}

onMounted(load)
watch(() => props.deviceId, load)

async function download(doc: Doc) {
  downloadingId.value = doc.id
  try {
    const { data } = await supabase.storage
      .from('device-docs')
      .createSignedUrl(doc.file_path, 600, { download: doc.name })
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener')
  } finally {
    downloadingId.value = null
  }
}

function iconChar(doc: Doc): string {
  const m = (doc.mime_type ?? '').toLowerCase()
  if (m.startsWith('image/')) return '🖼'
  if (m === 'application/pdf') return '📄'
  if (m.includes('word') || m.includes('document')) return '📝'
  if (m.includes('sheet') || m.includes('excel') || m.includes('csv')) return '📊'
  return '📎'
}
</script>

<template>
  <section v-if="docs.length > 0 || loading" class="border border-border rounded-lg bg-card/40 p-5 space-y-3">
    <header>
      <h3 class="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
        Documentation
      </h3>
      <p class="text-xs text-muted-foreground mt-1">
        Documents associés à cet équipement, mis à disposition sur site.
      </p>
    </header>

    <p v-if="loading && docs.length === 0" class="text-xs text-muted-foreground font-mono">
      Chargement…
    </p>

    <ul v-if="docs.length > 0" class="space-y-2">
      <li
        v-for="doc in docs"
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
            </div>
            <div class="text-[11px] font-mono text-muted-foreground mt-0.5">
              {{ fmtSize(doc.size_bytes) }}
              <span v-if="doc.description"> · {{ doc.description }}</span>
            </div>
          </div>
        </div>
        <button
          class="font-mono text-[10px] uppercase tracking-wider text-signal hover:underline disabled:opacity-50 shrink-0"
          :disabled="downloadingId === doc.id"
          @click="download(doc)"
        >
          {{ downloadingId === doc.id ? '…' : 'Ouvrir' }}
        </button>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
// Bloc « Documents » d'un tableau de bord : documents choisis parmi ceux des box (plans, manuels, photos…).
// Un seul document image ou PDF : aperçu dans le bloc. Liens signés de courte durée (bucket privé).
import { computed, ref, watch } from 'vue'
import { supabase } from '@/lib/supabase'

const props = defineProps<{ ids: string[] }>()
interface Doc {
  id: string
  name: string
  kind: string
  mime_type: string | null
  size_bytes: number | null
  file_path: string
}
const KIND: Record<string, string> = {
  plan_electrique: 'Plan électrique',
  analyse_fonctionnelle: 'Analyse fonctionnelle',
  manuel: 'Manuel',
  photo: 'Photo',
  autre: 'Document',
}
const docs = ref<Doc[]>([])
const preview = ref<string | null>(null)
const err = ref('')

async function signed(d: Doc, download = false) {
  const { data, error } = await supabase.storage
    .from('device-docs')
    .createSignedUrl(d.file_path, 600, download ? { download: d.name } : undefined)
  if (error) throw new Error(error.message)
  return data.signedUrl
}
async function load() {
  err.value = ''
  preview.value = null
  if (!props.ids.length) {
    docs.value = []
    return
  }
  const { data, error } = await supabase
    .from('device_documents')
    .select('id, name, kind, mime_type, size_bytes, file_path')
    .in('id', props.ids)
  if (error) {
    err.value = error.message
    return
  }
  docs.value = props.ids
    .map((id) => (data ?? []).find((d) => d.id === id))
    .filter((d): d is Doc => !!d)
  const one = docs.value.length === 1 ? docs.value[0] : null
  if (one && /^(image\/|application\/pdf)/.test(one.mime_type ?? ''))
    preview.value = await signed(one).catch(() => null)
}
watch(() => props.ids.join(','), load, { immediate: true })
const isPdf = computed(() => docs.value[0]?.mime_type === 'application/pdf')

async function open(d: Doc) {
  try {
    window.open(await signed(d), '_blank', 'noopener')
  } catch (e) {
    err.value = (e as Error).message
  }
}
const size = (n: number | null) =>
  n == null
    ? ''
    : n > 1e6
      ? (n / 1e6).toFixed(1).replace('.', ',') + ' Mo'
      : Math.max(1, Math.round(n / 1e3)) + ' ko'
</script>

<template>
  <div class="flex-1 flex flex-col min-h-0" data-testid="docs-block">
    <template v-if="preview">
      <iframe
        v-if="isPdf"
        :src="preview + '#toolbar=0&view=FitH'"
        class="w-full h-72 rounded-sm border border-border bg-white"
        title="aperçu"
      />
      <img v-else :src="preview" :alt="docs[0]?.name" class="w-full max-h-72 object-contain" />
    </template>
    <ul class="mt-1 divide-y divide-border">
      <li v-for="d in docs" :key="d.id" class="flex items-center gap-2 py-1.5 text-sm">
        <svg
          viewBox="0 0 24 24"
          class="size-4 shrink-0 text-muted-foreground"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
        >
          <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" />
          <path d="M14 3v5h5" />
        </svg>
        <span class="min-w-0 flex-1">
          <span class="block truncate" :title="d.name">{{ d.name }}</span>
          <span class="block font-mono text-[10px] text-muted-foreground"
            >{{ KIND[d.kind] ?? d.kind }} · {{ size(d.size_bytes) }}</span
          >
        </span>
        <button
          class="shrink-0 text-xs px-2 py-0.5 rounded border border-border hover:border-signal/60"
          data-testid="doc-open"
          @click="open(d)"
        >
          Ouvrir
        </button>
      </li>
    </ul>
    <p v-if="!docs.length && !err" class="text-xs text-muted-foreground">Aucun document choisi.</p>
    <p v-if="err" class="text-xs text-offline">{{ err }}</p>
  </div>
</template>

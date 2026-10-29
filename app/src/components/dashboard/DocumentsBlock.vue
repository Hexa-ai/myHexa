<script setup lang="ts">
// Bloc « Documents » d'un tableau de bord : documents choisis parmi ceux des box (plans, manuels, photos…).
// Deux présentations au choix (options.docLayout) : fiches par format ou liste. Pas d'aperçu tassé dans
// la tuile : un clic ouvre le PDF en grand dans une visionneuse (sur téléphone : visionneuse du
// téléphone), l'image en plein écran, les autres formats se téléchargent. Liens signés courts (bucket privé).
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { supabase } from '@/lib/supabase'

const props = defineProps<{ ids: string[]; layout?: 'cards' | 'list' }>()
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
const thumbs = ref<Record<string, string>>({})
const err = ref('')
const layout = computed(() => props.layout ?? 'cards')

const ext = (d: Doc) => (d.name.match(/\.([A-Za-z0-9]{1,5})$/)?.[1] ?? '').toLowerCase()
const isPdf = (d: Doc) => d.mime_type === 'application/pdf' || ext(d) === 'pdf'
const isImage = (d: Doc) =>
  (d.mime_type ?? '').startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext(d))
/** pastille de format : PDF, IMG, sinon l'extension (DOCX, XLSX, DWG…) */
function fmt(d: Doc) {
  if (isPdf(d)) return 'PDF'
  if (isImage(d)) return 'IMG'
  const e = ext(d).toUpperCase()
  return e && e.length <= 4 ? e : 'FICH'
}
const action = (d: Doc) => (isPdf(d) ? 'Lire' : isImage(d) ? 'Voir' : 'Télécharger')

async function signed(d: Doc, download = false) {
  const { data, error } = await supabase.storage
    .from('device-docs')
    .createSignedUrl(d.file_path, 600, download ? { download: d.name } : undefined)
  if (error) throw new Error(error.message)
  return data.signedUrl
}
async function load() {
  err.value = ''
  thumbs.value = {}
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
  if (layout.value === 'cards')
    for (const d of docs.value.filter(isImage))
      signed(d)
        .then((u) => (thumbs.value = { ...thumbs.value, [d.id]: u }))
        .catch(() => {})
}
watch(() => props.ids.join(',') + layout.value, load, { immediate: true })

async function clickLink(href: string) {
  const a = document.createElement('a')
  a.href = href
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

// visionneuse
const viewer = ref<{ doc: Doc; url: string } | null>(null)
const isPhone = () => window.matchMedia('(max-width: 767px)').matches
async function open(d: Doc) {
  err.value = ''
  try {
    if (!isPdf(d) && !isImage(d)) return await clickLink(await signed(d, true))
    const url = await signed(d)
    // sur téléphone un PDF dans un cadre se lit mal : visionneuse du téléphone
    if (isPdf(d) && isPhone()) {
      window.open(url, '_blank', 'noopener')
      return
    }
    viewer.value = { doc: d, url }
  } catch (e) {
    err.value = (e as Error).message
  }
}
const newTab = (url: string) => window.open(url, '_blank', 'noopener')
async function download(d: Doc) {
  try {
    await clickLink(await signed(d, true))
  } catch (e) {
    err.value = (e as Error).message
  }
}
const onKey = (e: KeyboardEvent) => {
  if (e.key === 'Escape') viewer.value = null
}
watch(viewer, (v) =>
  v ? window.addEventListener('keydown', onKey) : window.removeEventListener('keydown', onKey),
)
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

const size = (n: number | null) =>
  n == null
    ? ''
    : n > 1e6
      ? (n / 1e6).toFixed(1).replace('.', ',') + ' Mo'
      : Math.max(1, Math.round(n / 1e3)) + ' ko'
const meta = (d: Doc) => [KIND[d.kind] ?? d.kind, size(d.size_bytes)].filter(Boolean).join(' · ')
</script>

<template>
  <div class="flex-1 flex flex-col min-h-0" data-testid="docs-block" :data-layout="layout">
    <!-- A : fiches par format -->
    <div
      v-if="layout === 'cards' && docs.length"
      class="grid gap-2.5 overflow-auto min-h-0 grid-cols-[repeat(auto-fill,minmax(140px,1fr))]"
    >
      <button
        v-for="d in docs"
        :key="d.id"
        type="button"
        class="text-left rounded-lg bg-secondary/50 p-2.5 flex flex-col gap-2 transition hover:bg-secondary hover:ring-1 hover:ring-signal/60"
        data-testid="doc-open"
        :title="`${action(d)} : ${d.name}`"
        @click="open(d)"
      >
        <span class="relative h-20 rounded-md bg-secondary grid place-items-center overflow-hidden">
          <img
            v-if="thumbs[d.id]"
            :src="thumbs[d.id]"
            :alt="d.name"
            class="size-full object-cover"
          />
          <span
            v-else-if="isPdf(d)"
            class="absolute inset-x-6 inset-y-2.5 rounded-[3px] bg-white shadow-sm p-2 flex flex-col gap-1.5"
          >
            <i class="block h-[3px] rounded bg-neutral-300" />
            <i class="block h-[3px] w-3/4 rounded bg-neutral-300" />
            <i class="block h-[3px] rounded bg-neutral-300" />
            <i class="block h-[3px] w-1/2 rounded bg-neutral-300" />
            <span class="doc-fmt doc-fmt-solid absolute -right-3 -bottom-1 !text-[9px]">PDF</span>
          </span>
          <span v-else :class="['doc-fmt', isImage(d) ? 'doc-fmt-solid' : 'doc-fmt-line']">{{
            fmt(d)
          }}</span>
        </span>
        <span class="min-w-0">
          <span class="block truncate text-[12.5px] font-medium">{{ d.name }}</span>
          <span
            class="block truncate font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground"
            >{{ meta(d) }}</span
          >
        </span>
      </button>
    </div>

    <!-- B : liste -->
    <ul v-else-if="docs.length" class="overflow-auto min-h-0">
      <li v-for="d in docs" :key="d.id" class="border-b border-border/60 last:border-0">
        <button
          type="button"
          class="w-full flex items-center gap-3 px-1.5 py-2 rounded-md text-left hover:bg-secondary/60 transition"
          data-testid="doc-open"
          @click="open(d)"
        >
          <span
            :class="[
              'doc-fmt min-w-[46px] text-center',
              isPdf(d) || isImage(d) ? 'doc-fmt-solid' : 'doc-fmt-line',
            ]"
            >{{ fmt(d) }}</span
          >
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm" :title="d.name">{{ d.name }}</span>
            <span class="block truncate font-mono text-[10px] text-muted-foreground">{{
              meta(d)
            }}</span>
          </span>
          <span class="shrink-0 font-mono text-[10px] uppercase tracking-widest text-signal">{{
            action(d)
          }}</span>
        </button>
      </li>
    </ul>

    <p v-if="!docs.length && !err" class="text-xs text-muted-foreground">Aucun document choisi.</p>
    <p v-if="err" class="text-xs text-offline">{{ err }}</p>

    <!-- visionneuse : PDF en grand, image plein écran -->
    <Teleport to="body">
      <div
        v-if="viewer"
        class="fixed inset-0 z-[700] bg-black/70 backdrop-blur-sm flex flex-col p-3 sm:p-6"
        data-testid="doc-viewer"
        @click.self="viewer = null"
      >
        <div class="flex items-center gap-3 text-white mb-3 min-w-0">
          <span class="doc-fmt doc-fmt-light">{{ fmt(viewer.doc) }}</span>
          <span class="flex-1 min-w-0 truncate font-medium">{{ viewer.doc.name }}</span>
          <button type="button" class="doc-vbtn hidden sm:inline-flex" @click="newTab(viewer.url)">
            Nouvel onglet
          </button>
          <button
            type="button"
            class="doc-vbtn doc-vbtn-main"
            data-testid="doc-download"
            @click="download(viewer.doc)"
          >
            Télécharger
          </button>
          <button
            type="button"
            class="doc-vbtn"
            data-testid="doc-close"
            aria-label="Fermer"
            @click="viewer = null"
          >
            Fermer
          </button>
        </div>
        <iframe
          v-if="isPdf(viewer.doc)"
          :src="viewer.url + '#view=FitH'"
          class="flex-1 w-full rounded-lg bg-neutral-600"
          :title="viewer.doc.name"
        />
        <div v-else class="flex-1 min-h-0 grid place-items-center" @click.self="viewer = null">
          <img
            :src="viewer.url"
            :alt="viewer.doc.name"
            class="max-w-full max-h-full object-contain rounded-md"
          />
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.doc-fmt {
  display: inline-block;
  font-family: ui-monospace, 'JetBrains Mono', monospace;
  font-weight: 500;
  font-size: 11px;
  letter-spacing: 0.12em;
  padding: 5px 8px;
  border-radius: 6px;
  line-height: 1;
}
.doc-fmt-solid {
  background: var(--foreground);
  color: var(--background);
}
.doc-fmt-line {
  color: var(--foreground);
  box-shadow: inset 0 0 0 1.5px var(--foreground);
}
.doc-fmt-light {
  background: #fff;
  color: #0a0f14;
}
.doc-vbtn {
  font-family: ui-monospace, 'JetBrains Mono', monospace;
  font-size: 10.5px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  padding: 8px 12px;
  border-radius: 8px;
  background: rgb(255 255 255 / 0.12);
  white-space: nowrap;
}
.doc-vbtn:hover {
  background: rgb(255 255 255 / 0.2);
}
.doc-vbtn-main {
  background: #00d4aa;
  color: #0a0f14;
}
.doc-vbtn-main:hover {
  background: #19e0ba;
}
</style>

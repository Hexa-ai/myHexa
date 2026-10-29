<script setup lang="ts">
// Bloc « Signalements » d'un tableau de bord : le dernier signalement en grand (description,
// box, gravité, auteur) avec la galerie de ses photos, puis les suivants en liste.
// Rechargé à chaque rafraîchissement du tableau (la plage change) : pensé pour un écran mural.
import { computed, ref, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import type { DeviceWithStatus } from '@/composables/useDevices'
import type { Widget } from '@/composables/useDashboards'
import { formatRelative, SEVERITY_LABEL, severityPillClass, type Severity } from '@/lib/utils'

const props = defineProps<{
  widget: Widget
  range: [number, number]
  devices: Map<string, DeviceWithStatus>
  multiDevice: boolean
}>()

interface Row {
  id: string
  device_id: string
  created_at: string
  technician_name: string | null
  category: string
  severity: Severity
  message: string
  status: string
  kind: string
  photo_paths: string[] | null
}
const CATEGORY_LABEL: Record<string, string> = {
  intervention: 'Intervention',
  incident: 'Incident',
  controle: 'Contrôle',
  autre: 'Autre',
}

const w = computed(() => props.widget)
const ids = computed(() => [...new Set(w.value.sources.map((s) => s.device))])
const kinds = computed(() =>
  w.value.options.kinds?.length ? w.value.options.kinds : ['signalement'],
)
const openOnly = computed(() => w.value.options.openOnly ?? true)
const showPhotos = computed(() => w.value.options.photos ?? true)
const limit = computed(() => w.value.options.limit ?? 5)

const rows = ref<Row[]>([])
const err = ref('')
const loading = ref(false)
const picked = ref<string | null>(null)
// URL signées gardées d'un rafraîchissement à l'autre (pas de clignotement sur un écran)
const urls = ref<Record<string, string>>({})
const photoErr = ref(false)

async function load() {
  err.value = ''
  if (!ids.value.length) {
    rows.value = []
    return
  }
  loading.value = true
  try {
    let q = supabase
      .from('field_interventions')
      .select(
        'id, device_id, created_at, technician_name, category, severity, message, status, kind, photo_paths',
      )
      .in('device_id', ids.value)
      .in('kind', kinds.value)
      .order('created_at', { ascending: false })
      .limit(limit.value)
    if (openOnly.value) q = q.eq('status', 'open')
    else
      q = q
        .gte('created_at', new Date(props.range[0]).toISOString())
        .lte('created_at', new Date(props.range[1]).toISOString())
    const { data, error } = await q
    if (error) throw new Error(error.message)
    rows.value = (data ?? []) as Row[]
    if (picked.value && !rows.value.some((r) => r.id === picked.value)) picked.value = null
    await signPhotos()
  } catch (e) {
    err.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

const main = computed(() => rows.value.find((r) => r.id === picked.value) ?? rows.value[0] ?? null)
const others = computed(() => rows.value.filter((r) => r.id !== main.value?.id))
const mainPhotos = computed(() =>
  (main.value?.photo_paths ?? []).map((p) => urls.value[p]).filter((u): u is string => !!u),
)

async function signPhotos() {
  photoErr.value = false
  if (!showPhotos.value) return
  const need = (main.value?.photo_paths ?? []).filter((p) => !urls.value[p])
  if (!need.length) return
  const { data, error } = await supabase.storage
    .from('intervention-photos')
    .createSignedUrls(need, 60 * 60)
  if (error || !(data ?? []).some((d) => d.signedUrl)) {
    photoErr.value = true
    return
  }
  const next = { ...urls.value }
  for (const d of data ?? []) if (d.path && d.signedUrl) next[d.path] = d.signedUrl
  urls.value = next
}
watch(main, () => void signPhotos())

watch(
  () => [
    props.range[0],
    props.range[1],
    JSON.stringify(w.value.sources),
    JSON.stringify(w.value.options),
  ],
  load,
  { immediate: true },
)

const devName = (id: string) => props.devices.get(id)?.name ?? '—'
const fmtDate = (t: string) =>
  new Date(t).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
const zoom = ref<string | null>(null)
</script>

<template>
  <div class="flex-1 min-h-0 flex flex-col gap-2" data-testid="interventions-block">
    <div v-if="err" class="text-xs text-offline font-mono">
      Signalements inaccessibles : {{ err }}
    </div>
    <div
      v-else-if="!rows.length"
      class="flex-1 grid place-items-center text-sm text-muted-foreground py-6"
      data-testid="interventions-empty"
    >
      {{
        loading
          ? 'Chargement…'
          : openOnly
            ? 'Aucun signalement ouvert.'
            : 'Aucun signalement sur la période.'
      }}
    </div>
    <template v-else-if="main">
      <!-- dernier signalement (ou celui choisi dans la liste) -->
      <div class="rounded-md border border-border p-3" data-testid="intervention-main">
        <div class="flex flex-wrap items-center gap-1.5 mb-1.5">
          <span
            :class="[
              'px-1.5 py-0.5 rounded font-mono text-[10px] uppercase',
              severityPillClass(main.severity),
            ]"
          >
            {{ SEVERITY_LABEL[main.severity] ?? main.severity }}
          </span>
          <span
            class="px-1.5 py-0.5 rounded font-mono text-[10px] uppercase border border-border text-muted-foreground"
          >
            {{ CATEGORY_LABEL[main.category] ?? main.category }}
          </span>
          <span
            v-if="main.status !== 'open'"
            class="px-1.5 py-0.5 rounded font-mono text-[10px] uppercase border border-border text-muted-foreground"
            >résolu</span
          >
          <span
            class="ml-auto font-mono text-[11px] text-muted-foreground"
            :title="fmtDate(main.created_at)"
          >
            {{ formatRelative(main.created_at) }}
          </span>
        </div>
        <div class="text-sm font-medium">
          {{ devName(main.device_id) }}
          <span v-if="main.technician_name" class="text-muted-foreground font-normal"
            >· {{ main.technician_name }}</span
          >
        </div>
        <p class="mt-1 text-sm whitespace-pre-line break-words" data-testid="intervention-message">
          {{ main.message }}
        </p>
        <div
          v-if="showPhotos && (main.photo_paths ?? []).length"
          class="mt-2 grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-1.5"
          data-testid="intervention-gallery"
        >
          <button
            v-for="u in mainPhotos"
            :key="u"
            type="button"
            class="block aspect-square overflow-hidden rounded border border-border bg-muted"
            title="Agrandir"
            @click="zoom = u"
          >
            <img
              :src="u"
              alt="Photo du signalement"
              class="h-full w-full object-cover"
              loading="lazy"
            />
          </button>
          <div
            v-if="photoErr"
            class="col-span-full font-mono text-xs text-offline"
            data-testid="photo-error"
          >
            Photo inaccessible.
          </div>
          <div
            v-else-if="mainPhotos.length < (main.photo_paths ?? []).length"
            class="col-span-full font-mono text-xs text-muted-foreground"
          >
            chargement des photos…
          </div>
        </div>
      </div>
      <!-- signalements suivants -->
      <ul
        v-if="others.length"
        class="divide-y divide-border text-sm"
        data-testid="intervention-list"
      >
        <li v-for="r in others" :key="r.id">
          <button
            type="button"
            class="w-full flex items-center gap-2 py-1.5 text-left hover:bg-muted/50 rounded-sm px-1"
            @click="picked = r.id"
          >
            <span
              :class="[
                'px-1 rounded font-mono text-[9px] uppercase shrink-0',
                severityPillClass(r.severity),
              ]"
            >
              {{ SEVERITY_LABEL[r.severity] ?? r.severity }}
            </span>
            <span v-if="multiDevice" class="shrink-0 font-medium">{{ devName(r.device_id) }}</span>
            <span class="truncate text-muted-foreground">{{ r.message }}</span>
            <span
              v-if="(r.photo_paths ?? []).length"
              class="shrink-0 font-mono text-[10px] text-muted-foreground"
              >{{ (r.photo_paths ?? []).length }} photo{{
                (r.photo_paths ?? []).length > 1 ? 's' : ''
              }}</span
            >
            <span class="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">{{
              formatRelative(r.created_at)
            }}</span>
          </button>
        </li>
      </ul>
    </template>
    <!-- photo agrandie -->
    <div
      v-if="zoom"
      class="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4"
      data-testid="photo-zoom"
      @click="zoom = null"
    >
      <img
        :src="zoom"
        alt="Photo du signalement"
        class="max-h-full max-w-full object-contain rounded"
      />
    </div>
  </div>
</template>

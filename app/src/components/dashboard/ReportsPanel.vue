<script setup lang="ts">
// PROTOTYPE — rapports périodiques d'un tableau de bord : modèles, aperçu, envoi manuel, historique.
import { onMounted, ref, watch } from 'vue'
import {
  archiveUrl,
  deleteReport,
  FREQ_LABEL,
  loadRecipients,
  loadReports,
  loadRuns,
  newTemplate,
  previewReport,
  runReport,
  saveReport,
  scheduleLabel,
  WEEKDAYS,
  type Frequency,
  type RecipientLite,
  type ReportRun,
  type ReportTemplate,
} from '@/composables/useReports'
import { loadLogo, removeLogo, uploadLogo } from '@/composables/useBranding'

const props = defineProps<{
  dashboardId: string
  companyId: string
  dashboardName: string
  canManage: boolean
}>()

const reports = ref<ReportTemplate[]>([])
const runs = ref<ReportRun[]>([])
const recipients = ref<RecipientLite[]>([])
const edited = ref<ReportTemplate | null>(null)
const busy = ref(false)
const msg = ref('')
const err = ref('')
const preview = ref<{ subject: string; html: string; csv: string } | null>(null)
const previewWidth = ref<'pc' | 'mobile'>('pc')

const fmt = (s?: string | null) =>
  s ? new Date(s).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—'
const fmtDay = (s: string) =>
  new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })

// logo de l'entreprise (en-tête des mails et des PDF)
const logo = ref<string | null>(null)
async function onLogo(ev: Event) {
  const f = (ev.target as HTMLInputElement).files?.[0]
  ;(ev.target as HTMLInputElement).value = ''
  if (!f) return
  await wrap(async () => {
    logo.value = await uploadLogo(props.companyId, f)
    msg.value = 'Logo enregistré : il apparaîtra en tête des rapports.'
  })
}
const dropLogo = () =>
  wrap(async () => {
    if (!confirm('Retirer le logo des rapports ?')) return
    await removeLogo(props.companyId)
    logo.value = null
  })

async function refresh() {
  err.value = ''
  try {
    logo.value = await loadLogo(props.companyId)
    reports.value = await loadReports(props.dashboardId)
    runs.value = await loadRuns(reports.value.map((r) => r.id!))
    if (props.canManage && !recipients.value.length)
      recipients.value = await loadRecipients(props.companyId)
  } catch (e) {
    err.value = (e as Error).message
  }
}
onMounted(refresh)
watch(() => props.dashboardId, refresh)

function create() {
  edited.value = newTemplate(props.companyId, props.dashboardId, `Rapport — ${props.dashboardName}`)
  preview.value = null
}
function edit(r: ReportTemplate) {
  edited.value = JSON.parse(JSON.stringify(r))
  preview.value = null
}
function toggleRecipient(id: string) {
  const l = edited.value!.recipient_ids
  const i = l.indexOf(id)
  if (i >= 0) l.splice(i, 1)
  else l.push(id)
}

async function wrap(f: () => Promise<void>) {
  busy.value = true
  err.value = ''
  msg.value = ''
  try {
    await f()
  } catch (e) {
    err.value = (e as Error).message
  } finally {
    busy.value = false
  }
}
const save = () =>
  wrap(async () => {
    await saveReport(edited.value!)
    edited.value = null
    msg.value = 'Rapport enregistré.'
    await refresh()
  })
const remove = (r: ReportTemplate) =>
  wrap(async () => {
    if (!confirm(`Supprimer le rapport « ${r.name} » ?`)) return
    await deleteReport(r.id!)
    await refresh()
  })
const doPreview = (t: ReportTemplate) =>
  wrap(async () => {
    const r = await previewReport(t)
    preview.value = { subject: r.subject, html: r.html, csv: r.csv }
  })
const previewPdf = (t: ReportTemplate) =>
  wrap(async () => {
    const r = await previewReport(t, true)
    if (!r.pdf) throw new Error('PDF non généré')
    const bin = Uint8Array.from(atob(r.pdf), (c) => c.charCodeAt(0))
    const url = URL.createObjectURL(new Blob([bin], { type: 'application/pdf' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${r.subject}.pdf`.replace(/[\\/:*?"<>|]/g, '-')
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 60000)
    msg.value = 'Aperçu PDF téléchargé.'
  })
// retour visible sur la ligne du rapport (le message du haut est hors de vue sur un long panneau)
const sending = ref<string | null>(null)
const rowMsg = ref<Record<string, { ok: boolean; text: string }>>({})
const sendNow = async (r: ReportTemplate) => {
  if (sending.value) return
  sending.value = r.id!
  rowMsg.value = { ...rowMsg.value, [r.id!]: { ok: true, text: 'Génération et envoi en cours…' } }
  await wrap(async () => {
    try {
      const res = await runReport(r.id!)
      const text =
        res.status === 'sent'
          ? `Envoyé à ${res.sent_to.join(', ')}.${res.error ? ' ' + res.error : ''}`
          : `Rapport généré et archivé, non envoyé : ${res.error ?? ''}`
      rowMsg.value = { ...rowMsg.value, [r.id!]: { ok: res.status === 'sent', text } }
      await refresh()
    } catch (e) {
      rowMsg.value = { ...rowMsg.value, [r.id!]: { ok: false, text: (e as Error).message } }
      throw e
    } finally {
      sending.value = null
    }
  })
}
// ouverture d'une archive : fenêtre ouverte AU CLIC (sinon bloquée par Safari / iPhone après l'attente
// de l'URL signée), puis redirigée ; erreur affichée sous l'historique
const archiveErr = ref('')
const open = async (path: string | null) => {
  if (!path) return
  archiveErr.value = ''
  const w = window.open('', '_blank')
  try {
    const url = await archiveUrl(path)
    if (w) w.location.href = url
    else window.location.href = url
  } catch (e) {
    w?.close()
    archiveErr.value = `Archive inaccessible : ${(e as Error).message}`
  }
}
function downloadCsv() {
  if (!preview.value) return
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([preview.value.csv], { type: 'text/csv;charset=utf-8' }))
  a.download = `${props.dashboardName} - apercu.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

const STATUS: Record<ReportRun['status'], [string, string]> = {
  sent: ['envoyé', 'text-signal'],
  not_sent: ['archivé, non envoyé', 'text-muted-foreground'],
  error: ['erreur', 'text-offline'],
}
</script>

<template>
  <section
    class="mb-4 border border-border rounded-md bg-card/60 p-3 text-sm"
    data-testid="reports-panel"
  >
    <div class="flex items-center gap-2 mb-2">
      <div class="font-medium flex-1">Rapports périodiques</div>
      <button
        v-if="canManage && !edited"
        class="text-xs px-3 py-1.5 rounded border border-border hover:border-signal/60"
        data-testid="report-new"
        @click="create"
      >
        + Rapport
      </button>
    </div>
    <p class="text-xs text-muted-foreground mb-3">
      Le rapport reprend les blocs de ce tableau de bord sur la période écoulée (la veille, la
      semaine ou le mois précédent) et l'envoie par e-mail : graphiques en images, PDF A4 et CSV en
      pièces jointes en option.
    </p>
    <div
      v-if="canManage && !edited"
      class="flex flex-wrap items-center gap-2 mb-3 text-xs"
      data-testid="report-logo"
    >
      <span class="text-muted-foreground">Logo des rapports :</span>
      <img
        v-if="logo"
        :src="logo"
        alt="logo"
        class="h-8 max-w-[140px] object-contain bg-white rounded-sm p-0.5 border border-border"
        data-testid="report-logo-img"
      />
      <span v-else class="text-muted-foreground italic">aucun</span>
      <label class="px-2.5 py-1 rounded border border-border cursor-pointer hover:border-signal/60">
        {{ logo ? 'Changer' : 'Ajouter un logo' }}
        <input
          type="file"
          accept="image/png,image/jpeg"
          class="hidden"
          data-testid="report-logo-input"
          @change="onLogo"
        />
      </label>
      <button v-if="logo" class="underline text-muted-foreground" @click="dropLogo">retirer</button>
      <span class="text-muted-foreground">(PNG ou JPEG, 2 Mo max.)</span>
    </div>
    <p v-if="err" class="text-xs text-offline mb-2" data-testid="report-error">{{ err }}</p>
    <p v-if="msg" class="text-xs text-signal mb-2" data-testid="report-msg">{{ msg }}</p>

    <!-- liste -->
    <div v-if="!edited">
      <div v-if="!reports.length" class="text-xs text-muted-foreground">
        Aucun rapport pour ce tableau de bord.
      </div>
      <div
        v-for="r in reports"
        :key="r.id"
        class="border-t border-border/60 py-2 flex flex-col sm:flex-row sm:items-center gap-2"
        data-testid="report-row"
      >
        <div class="flex-1 min-w-0">
          <div class="font-medium truncate">
            {{ r.name }}
            <span v-if="!r.enabled" class="font-mono text-[10px] uppercase text-muted-foreground"
              >(désactivé)</span
            >
          </div>
          <div class="text-xs text-muted-foreground">
            {{ FREQ_LABEL[r.frequency] }}, {{ scheduleLabel(r) }} ·
            {{ r.recipient_ids.length }} destinataire(s)
            <span v-if="r.attach_pdf">· PDF joint</span>
            <span v-if="r.attach_csv">· CSV joint</span>
          </div>
          <div class="text-[11px] text-muted-foreground">
            Prochain envoi : {{ r.enabled ? fmt(r.next_run_at) : '—' }}
          </div>
          <p
            v-if="rowMsg[r.id!]"
            class="text-xs mt-1 break-words"
            :class="rowMsg[r.id!].ok ? 'text-signal' : 'text-offline'"
            data-testid="report-send-status"
          >
            {{ rowMsg[r.id!].text }}
          </p>
        </div>
        <div class="flex flex-wrap gap-1.5">
          <button
            class="text-xs px-2.5 py-1 rounded border border-border"
            :disabled="busy"
            data-testid="report-preview"
            @click="doPreview(r)"
          >
            Aperçu
          </button>
          <template v-if="canManage">
            <button
              class="text-xs px-2.5 py-1 rounded border border-border inline-flex items-center gap-1.5"
              :class="sending === r.id ? 'border-signal/60 text-signal' : ''"
              :disabled="busy"
              :aria-busy="sending === r.id"
              data-testid="report-send"
              @click="sendNow(r)"
            >
              <span
                v-if="sending === r.id"
                class="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin"
                aria-hidden="true"
              />
              {{ sending === r.id ? 'Envoi en cours…' : 'Envoyer maintenant' }}
            </button>
            <button
              class="text-xs px-2.5 py-1 rounded border border-border"
              data-testid="report-edit"
              @click="edit(r)"
            >
              Modifier
            </button>
            <button
              class="text-xs px-2.5 py-1 rounded border border-offline/40 text-offline"
              @click="remove(r)"
            >
              Supprimer
            </button>
          </template>
        </div>
      </div>

      <!-- historique -->
      <details v-if="runs.length" class="mt-3" data-testid="report-runs">
        <summary class="text-xs text-muted-foreground cursor-pointer">
          Derniers rapports générés ({{ runs.length }})
        </summary>
        <div
          v-for="x in runs"
          :key="x.id"
          class="text-xs flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1 border-t border-border/40"
        >
          <span class="font-mono">{{ fmt(x.created_at) }}</span>
          <span class="text-muted-foreground"
            >période {{ fmtDay(x.period_from) }} → {{ fmtDay(x.period_to) }}</span
          >
          <span :class="STATUS[x.status][1]">{{ STATUS[x.status][0] }}</span>
          <span v-if="x.sent_to.length" class="text-muted-foreground"
            >à {{ x.sent_to.join(', ') }}</span
          >
          <span v-if="x.error" class="text-muted-foreground italic">{{ x.error }}</span>
          <button v-if="x.pdf_path" class="underline" @click="open(x.pdf_path)">PDF</button>
          <button v-if="x.csv_path" class="underline" @click="open(x.csv_path)">CSV</button>
        </div>
      </details>
      <p v-if="archiveErr" class="text-xs text-offline mt-1" data-testid="report-archive-error">
        {{ archiveErr }}
      </p>
    </div>

    <!-- édition -->
    <div v-else class="grid gap-3" data-testid="report-editor">
      <input
        v-model="edited.name"
        class="bg-card border border-border rounded-sm px-2 py-1.5 text-sm"
        placeholder="Nom du rapport"
        data-testid="report-name"
      />
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-xs text-muted-foreground w-24">Fréquence</span>
        <button
          v-for="(l, f) in FREQ_LABEL"
          :key="f"
          :class="[
            'text-xs px-2.5 py-1 rounded border',
            edited.frequency === f
              ? 'border-signal bg-signal text-primary-foreground'
              : 'border-border',
          ]"
          :data-testid="`report-freq-${f}`"
          @click="edited.frequency = f as Frequency"
        >
          {{ l }}
        </button>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-xs text-muted-foreground w-24">Envoi</span>
        <select
          v-if="edited.frequency === 'weekly'"
          v-model.number="edited.weekday"
          class="bg-card border border-border rounded-sm px-2 py-1 text-sm"
        >
          <option v-for="(d, i) in WEEKDAYS" :key="d" :value="i + 1">le {{ d }}</option>
        </select>
        <select
          v-if="edited.frequency === 'monthly'"
          v-model.number="edited.monthday"
          class="bg-card border border-border rounded-sm px-2 py-1 text-sm"
        >
          <option v-for="d in 28" :key="d" :value="d">le {{ d === 1 ? '1er' : d }} du mois</option>
        </select>
        <select
          v-model.number="edited.send_hour"
          class="bg-card border border-border rounded-sm px-2 py-1 text-sm"
          data-testid="report-hour"
        >
          <option v-for="h in 24" :key="h" :value="h - 1">à {{ h - 1 }} h</option>
        </select>
        <span class="text-xs text-muted-foreground">→ {{ scheduleLabel(edited) }}</span>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <span
          class="text-xs text-muted-foreground w-full sm:w-auto"
          data-testid="report-compare-hint"
          >Comparaisons : celles réglées sur les blocs du tableau</span
        >
        <label class="text-xs flex items-center gap-1.5 ml-2"
          ><input v-model="edited.attach_pdf" type="checkbox" data-testid="report-pdf" /> joindre le
          PDF (A4)</label
        >
        <label class="text-xs flex items-center gap-1.5 ml-2"
          ><input v-model="edited.attach_csv" type="checkbox" data-testid="report-csv" /> joindre le
          CSV des données</label
        >
        <label class="text-xs flex items-center gap-1.5 ml-2"
          ><input v-model="edited.enabled" type="checkbox" /> actif</label
        >
      </div>
      <div>
        <div class="text-xs text-muted-foreground mb-1">
          Destinataires ({{ edited.recipient_ids.length }})
        </div>
        <div
          class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 max-h-48 overflow-auto"
          data-testid="report-recipients"
        >
          <label
            v-for="r in recipients"
            :key="r.id"
            :class="['text-xs flex items-center gap-1.5', !r.contact_email && 'opacity-50']"
            :title="r.contact_email ? '' : 'pas d’adresse e-mail'"
          >
            <input
              type="checkbox"
              :disabled="!r.contact_email"
              :checked="edited.recipient_ids.includes(r.id)"
              @change="toggleRecipient(r.id)"
            />
            <span class="truncate">{{ r.name || r.contact_email }}</span>
            <span class="text-muted-foreground truncate">{{ r.contact_email }}</span>
          </label>
        </div>
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          class="text-xs px-3 py-1.5 rounded border border-signal bg-signal text-primary-foreground disabled:opacity-50"
          :disabled="busy || !edited.name.trim()"
          data-testid="report-save"
          @click="save"
        >
          Enregistrer
        </button>
        <button
          class="text-xs px-3 py-1.5 rounded border border-border"
          :disabled="busy"
          data-testid="report-preview-edit"
          @click="doPreview(edited)"
        >
          Aperçu
        </button>
        <button
          class="text-xs px-3 py-1.5 rounded border border-border"
          :disabled="busy"
          data-testid="report-pdf-preview"
          @click="previewPdf(edited)"
        >
          Aperçu PDF
        </button>
        <button class="text-xs px-3 py-1.5 rounded border border-border" @click="edited = null">
          Annuler
        </button>
      </div>
    </div>

    <!-- aperçu -->
    <div v-if="preview" class="mt-3 border-t border-border pt-3" data-testid="report-preview-box">
      <div class="flex flex-wrap items-center gap-2 mb-2">
        <div class="text-xs flex-1 min-w-0 truncate">
          <span class="text-muted-foreground">Objet :</span> {{ preview.subject }}
        </div>
        <button
          v-for="v in ['pc', 'mobile'] as const"
          :key="v"
          :class="[
            'text-xs px-2 py-1 rounded border',
            previewWidth === v ? 'border-signal' : 'border-border',
          ]"
          @click="previewWidth = v"
        >
          {{ v === 'pc' ? 'Ordinateur' : 'Téléphone' }}
        </button>
        <button class="text-xs px-2 py-1 rounded border border-border" @click="downloadCsv">
          CSV
        </button>
        <button class="text-xs px-2 py-1 rounded border border-border" @click="preview = null">
          Fermer
        </button>
      </div>
      <iframe
        :srcdoc="preview.html"
        :class="[
          'block mx-auto bg-white rounded border border-border h-[70vh]',
          previewWidth === 'pc' ? 'w-full max-w-[700px]' : 'w-[380px] max-w-full',
        ]"
        sandbox=""
        title="Aperçu du rapport"
        data-testid="report-iframe"
      />
    </div>
  </section>
</template>

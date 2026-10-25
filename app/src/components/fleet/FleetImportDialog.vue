<script setup lang="ts">
// Réimport d'un export CSV : lien par identifiant interne, champs descriptifs seulement,
// aperçu avant/après, erreurs bloquantes, application tout ou rien (fleet_apply)
import { computed, ref } from 'vue'
import {
  sb,
  pgMsg,
  parseCsv,
  normField,
  fmtDay,
  CSV_COLS,
  CSV_HEAD,
  EDITABLE,
  FIELD_LABEL,
  type EditableField,
  type FleetDevice,
} from '@/composables/useFleet'

const props = defineProps<{ devices: FleetDevice[] }>()
const emit = defineEmits<{ close: []; done: [n: number] }>()

const fileName = ref('')
const rows = ref<string[][] | null>(null)
const busy = ref(false)
const error = ref<string | null>(null)

async function onFile(ev: Event) {
  const f = (ev.target as HTMLInputElement).files?.[0]
  if (!f) return
  fileName.value = f.name
  rows.value = parseCsv(await f.text())
}

interface Change {
  id: string
  label: string
  diffs: { f: EditableField; before: string; after: string }[]
  patch: Record<string, string | number | null>
}

const show = (f: EditableField, v: unknown) =>
  v === null || v === undefined || v === '' ? '' : f.endsWith('_at') ? fmtDay(String(v)) : String(v)

const analysis = computed(() => {
  const errors: string[] = []
  const warnings: string[] = []
  const changes: Change[] = []
  if (!rows.value) return { errors, warnings, changes }
  const head = rows.value[0].map((h) => h.trim())
  const col = (c: string) => head.findIndex((h) => h === CSV_HEAD[c] || h === c)
  const iId = col('id')
  if (iId < 0) {
    errors.push(
      'colonne « id » absente : seul un fichier exporté depuis le parc peut être réimporté',
    )
    return { errors, warnings, changes }
  }
  const byId = new Map(props.devices.map((d) => [d.id, d]))
  const final = new Map(props.devices.map((d) => [d.id, { mac: d.mac_eth0, sn: d.serial_number }]))
  const seen = new Set<string>()
  rows.value.slice(1).forEach((r, k) => {
    const line = k + 2
    const id = (r[iId] ?? '').trim()
    const d = byId.get(id)
    if (!d) {
      errors.push(
        `ligne ${line} : identifiant inconnu « ${id || 'vide'} » (les créations passent par « Réception d'un lot »)`,
      )
      return
    }
    if (seen.has(id)) {
      errors.push(`ligne ${line} : box présente deux fois`)
      return
    }
    seen.add(id)
    const patch: Record<string, string | number | null> = {}
    const diffs: Change['diffs'] = []
    for (const f of EDITABLE) {
      const i = col(f)
      if (i < 0) continue
      const [v, err] = normField(f, r[i] ?? '')
      if (err) {
        errors.push(`ligne ${line} (${d.serial_number || d.name}) : ${FIELD_LABEL[f]} : ${err}`)
        continue
      }
      const cur = d[f] ?? null
      // MAC / n° de série : comparés une fois nettoyés (espaces historiques, casse)
      const curN =
        f === 'mac_eth0' || f === 'serial_number' ? normField(f, String(cur ?? ''))[0] : cur
      if (String(v ?? '') !== String(curN ?? '')) {
        patch[f] = v
        diffs.push({ f, before: show(f, cur), after: show(f, v) })
      }
    }
    if (diffs.length) {
      changes.push({ id, label: d.serial_number || d.name, diffs, patch })
      const fx = final.get(id)!
      if ('mac_eth0' in patch) fx.mac = patch.mac_eth0 as string | null
      if ('serial_number' in patch) fx.sn = patch.serial_number as string | null
    }
  })
  // doublons sur l'état final (parc entier)
  const count = (k: 'mac' | 'sn') => {
    const m = new Map<string, number>()
    for (const v of final.values()) if (v[k]) m.set(v[k]!, (m.get(v[k]!) ?? 0) + 1)
    return m
  }
  const cm = count('mac')
  const cs = count('sn')
  for (const c of changes) {
    const v = final.get(c.id)!
    if ('mac_eth0' in c.patch && v.mac && cm.get(v.mac)! > 1)
      errors.push(`${c.label} : MAC ${v.mac} déjà utilisée par une autre box`)
    if ('serial_number' in c.patch && v.sn && cs.get(v.sn)! > 1)
      errors.push(`${c.label} : n° de série ${v.sn} déjà utilisé`)
  }
  const ro = ['entreprise', 'statut'].filter((c) => col(c) >= 0)
  if (ro.length)
    warnings.push(
      'Les colonnes entreprise et statut sont ignorées : une livraison ou un retour se fait par les boutons du parc.',
    )
  if (CSV_COLS.some((c) => c !== 'id' && col(c) < 0))
    warnings.push('Colonnes absentes : non modifiées.')
  return { errors, warnings, changes }
})

const nDiffs = computed(() => analysis.value.changes.reduce((n, c) => n + c.diffs.length, 0))

async function apply() {
  busy.value = true
  error.value = null
  const { error: e } = await sb.rpc('fleet_apply', {
    p_rows: analysis.value.changes.map((c) => ({ id: c.id, ...c.patch })),
    p_kind: 'import',
  })
  busy.value = false
  if (e) {
    error.value = pgMsg(e)
    return
  }
  emit('done', analysis.value.changes.length)
}
</script>

<template>
  <div
    class="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto"
    @click.self="emit('close')"
  >
    <div
      class="bg-background border border-border rounded-lg w-full max-w-3xl p-5 space-y-4 mt-6"
      data-testid="fleet-import"
    >
      <h2 class="text-lg font-semibold tracking-tight">Réimporter un export</h2>
      <p class="text-xs text-muted-foreground">
        Seuls les champs descriptifs sont mis à jour (nom, n° de série, MAC, facture, dates,
        garantie, fournisseur, note). Rien n'est créé ni supprimé, et l'entreprise, le projet et le
        jeton ne changent pas.
      </p>
      <input
        type="file"
        accept=".csv,text/csv"
        data-testid="import-file"
        class="text-sm"
        @change="onFile"
      />

      <template v-if="rows">
        <div
          v-if="analysis.errors.length"
          class="border border-offline/50 bg-offline-soft rounded-md p-3 text-xs space-y-1"
          data-testid="import-errors"
        >
          <p class="font-medium text-offline">
            {{ analysis.errors.length }} erreur(s) : rien ne sera appliqué tant qu'elles restent.
          </p>
          <p v-for="(e, i) in analysis.errors.slice(0, 30)" :key="i">{{ e }}</p>
        </div>
        <p v-for="(w, i) in analysis.warnings" :key="'w' + i" class="text-xs text-muted-foreground">
          {{ w }}
        </p>

        <p class="text-sm" data-testid="import-summary">
          {{ analysis.changes.length }} box modifiée(s), {{ nDiffs }} changement(s)
        </p>
        <div
          v-if="analysis.changes.length"
          class="border border-border rounded-md max-h-80 overflow-y-auto"
        >
          <table class="w-full text-xs">
            <thead class="bg-card/60 text-muted-foreground sticky top-0">
              <tr>
                <th class="text-left px-2 py-1">Box</th>
                <th class="text-left px-2 py-1">Champ</th>
                <th class="text-left px-2 py-1">Avant</th>
                <th class="text-left px-2 py-1">Après</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="c in analysis.changes" :key="c.id">
                <tr
                  v-for="(d, j) in c.diffs"
                  :key="c.id + d.f"
                  class="border-t border-border/50"
                  data-testid="import-diff"
                >
                  <td class="px-2 py-1 font-mono">{{ j === 0 ? c.label : '' }}</td>
                  <td class="px-2 py-1">{{ FIELD_LABEL[d.f] }}</td>
                  <td class="px-2 py-1 font-mono text-muted-foreground line-through">
                    {{ d.before || '(vide)' }}
                  </td>
                  <td class="px-2 py-1 font-mono">{{ d.after || '(vide)' }}</td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </template>

      <p v-if="error" class="text-sm text-offline">{{ error }}</p>
      <div class="flex justify-end gap-2">
        <button
          type="button"
          class="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
          @click="emit('close')"
        >
          Annuler
        </button>
        <button
          type="button"
          data-testid="import-apply"
          :disabled="busy || !rows || analysis.errors.length > 0 || !analysis.changes.length"
          class="px-3 py-1.5 text-sm rounded-md bg-signal text-background disabled:opacity-40"
          @click="apply"
        >
          Appliquer {{ nDiffs }} changement(s)
        </button>
      </div>
    </div>
  </div>
</template>

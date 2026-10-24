import { ref } from 'vue'
import { supabase } from '@/lib/supabase'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- colonnes du proto absentes des types générés
export const sb = supabase as any

/** Parc des box (staff Hexa-AI) */
export type FleetStatus = 'stock' | 'delivered' | 'return' | 'scrapped'

export interface FleetDevice {
  id: string
  name: string
  serial_number: string | null
  mac_eth0: string | null
  invoice_number: string | null
  company_id: string
  project_id: string | null
  fleet_status: FleetStatus
  delivered_at: string | null
  warranty_months: number | null
  received_at: string | null
  supplier: string | null
  purchase_ref: string | null
  fleet_note: string | null
  os_version: string | null
  has_battery: boolean
  has_supercap: boolean
  last_connection_at: string | null
}

export const FLEET_COLS =
  'id, name, serial_number, mac_eth0, invoice_number, company_id, project_id, fleet_status, delivered_at, warranty_months, received_at, supplier, purchase_ref, fleet_note, os_version, has_battery, has_supercap, last_connection_at'

export const STATUS_LABEL: Record<FleetStatus, string> = {
  stock: 'En stock',
  delivered: 'Livrée',
  return: 'Retour / RMA',
  scrapped: 'Rebut',
}

/** champs modifiables dans le tableau et par import (jamais entreprise / projet / jeton) */
export const EDITABLE = [
  'name',
  'serial_number',
  'mac_eth0',
  'invoice_number',
  'delivered_at',
  'warranty_months',
  'received_at',
  'supplier',
  'purchase_ref',
  'fleet_note',
] as const
export type EditableField = (typeof EDITABLE)[number]

export const FIELD_LABEL: Record<string, string> = {
  name: 'Nom',
  serial_number: 'N° de série',
  mac_eth0: 'MAC eth0',
  invoice_number: 'Facture',
  delivered_at: 'Livraison',
  warranty_months: 'Garantie (mois)',
  received_at: 'Réception',
  supplier: 'Fournisseur',
  purchase_ref: 'Réf. commande',
  fleet_note: 'Note',
  company_id: 'Entreprise',
  project_id: 'Projet',
  fleet_status: 'Statut',
}

const MAC_RE = /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/

export function normMac(v: string | null | undefined): string | null {
  const s = (v ?? '').trim().toLowerCase().replace(/-/g, ':')
  if (!s) return null
  // 12 chiffres hexa sans séparateur
  if (/^[0-9a-f]{12}$/.test(s)) return s.match(/../g)!.join(':')
  return s
}
export const macValid = (v: string | null) => v === null || MAC_RE.test(v)
export const normSerial = (v: string | null | undefined) => (v ?? '').trim().toUpperCase() || null

/** normalise et valide une valeur saisie ; renvoie [valeur, erreur] */
export function normField(f: EditableField, raw: string): [string | number | null, string | null] {
  const s = raw.trim()
  if (f === 'mac_eth0') {
    const m = normMac(s)
    return [m, macValid(m) ? null : 'MAC invalide (format aa:bb:cc:dd:ee:ff)']
  }
  if (f === 'serial_number') return [normSerial(s), null]
  if (f === 'name') return [s || null, s ? null : 'nom obligatoire']
  if (f === 'warranty_months') {
    if (!s) return [null, null]
    const n = Number(s)
    return [n, Number.isInteger(n) && n >= 0 && n <= 240 ? null : 'durée en mois (0 à 240)']
  }
  if (f === 'delivered_at' || f === 'received_at') {
    if (!s) return [null, null]
    const d = parseDate(s)
    return [d, d ? null : 'date invalide (JJ/MM/AAAA)']
  }
  return [s || null, null]
}

/** JJ/MM/AAAA, AAAA-MM-JJ -> AAAA-MM-JJ */
export function parseDate(s: string): string | null {
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (m) {
    const y = m[3].length === 2 ? '20' + m[3] : m[3]
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  return null
}
export const fmtDay = (d: string | null) => (d ? d.split('-').reverse().join('/') : '')

export interface Warranty {
  end: string | null
  months: number
  /** mois restants (négatif : expirée depuis) */
  left: number | null
  state: 'none' | 'ok' | 'soon' | 'expired'
}

export function warrantyOf(d: FleetDevice, defMonths: number, now = new Date()): Warranty {
  const months = d.warranty_months ?? defMonths
  if (!d.delivered_at || d.fleet_status === 'stock')
    return { end: null, months, left: null, state: 'none' }
  const [y, m, day] = d.delivered_at.split('-').map(Number)
  const end = new Date(Date.UTC(y, m - 1 + months, day))
  const left = (end.getTime() - now.getTime()) / (30.44 * 86400e3)
  return {
    end: end.toISOString().slice(0, 10),
    months,
    left,
    state: left < 0 ? 'expired' : left <= 3 ? 'soon' : 'ok',
  }
}

export function warrantyText(w: Warranty): string {
  if (w.state === 'none' || w.left === null) return ''
  const n = Math.abs(w.left)
  const t = n < 1 ? `${Math.max(1, Math.round(n * 30.44))} j` : `${Math.round(n)} mois`
  return w.state === 'expired' ? `hors garantie (${t})` : `encore ${t}`
}

// --- CSV (export / réimport) ---
export const CSV_COLS = [
  'id',
  'entreprise',
  'statut',
  'name',
  'serial_number',
  'mac_eth0',
  'invoice_number',
  'delivered_at',
  'warranty_months',
  'received_at',
  'supplier',
  'purchase_ref',
  'fleet_note',
] as const
export const CSV_HEAD: Record<string, string> = {
  id: 'id (ne pas modifier)',
  entreprise: 'entreprise (lecture seule)',
  statut: 'statut (lecture seule)',
  name: 'nom',
  serial_number: 'numero_serie',
  mac_eth0: 'mac_eth0',
  invoice_number: 'facture',
  delivered_at: 'date_livraison',
  warranty_months: 'garantie_mois',
  received_at: 'date_reception',
  supplier: 'fournisseur',
  purchase_ref: 'ref_commande',
  fleet_note: 'note',
}

const esc = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v)
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows: FleetDevice[], companyName: (id: string) => string): string {
  const lines = [CSV_COLS.map((c) => CSV_HEAD[c]).join(';')]
  for (const d of rows) {
    lines.push(
      CSV_COLS.map((c) =>
        esc(
          c === 'entreprise'
            ? companyName(d.company_id)
            : c === 'statut'
              ? STATUS_LABEL[d.fleet_status]
              : c === 'delivered_at' || c === 'received_at'
                ? fmtDay(d[c])
                : d[c as keyof FleetDevice],
        ),
      ).join(';'),
    )
  }
  return '\ufeff' + lines.join('\r\n') + '\r\n'
}

/** CSV ; ou , ou tabulation, guillemets gérés */
export function parseCsv(text: string): string[][] {
  text = text.replace(/^\ufeff/, '')
  const first = text.split(/\r?\n/)[0] ?? ''
  const sep = first.includes(';') ? ';' : first.includes('\t') ? '\t' : ','
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cur += '"'
        i++
      } else if (c === '"') q = false
      else cur += c
    } else if (c === '"') q = true
    else if (c === sep) {
      row.push(cur)
      cur = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cur)
      if (row.some((x) => x.trim())) rows.push(row)
      row = []
      cur = ''
    } else cur += c
  }
  row.push(cur)
  if (row.some((x) => x.trim())) rows.push(row)
  return rows
}

export function useFleet() {
  const devices = ref<FleetDevice[]>([])
  const defaultWarranty = ref(24)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function load() {
    loading.value = true
    error.value = null
    const [d, s] = await Promise.all([
      sb.from('devices').select(FLEET_COLS).order('created_at', { ascending: false }),
      sb.from('fleet_settings').select('default_warranty_months').maybeSingle(),
    ])
    loading.value = false
    if (d.error) {
      error.value = d.error.message
      return
    }
    devices.value = (d.data ?? []) as FleetDevice[]
    if (s.data) defaultWarranty.value = s.data.default_warranty_months
  }

  async function setDefaultWarranty(n: number) {
    const { error: e } = await sb
      .from('fleet_settings')
      .update({ default_warranty_months: n, updated_at: new Date().toISOString() })
      .eq('id', true)
    if (e) throw new Error(e.message)
    defaultWarranty.value = n
  }

  async function updateField(id: string, f: EditableField, v: string | number | null) {
    const { data, error: e } = await sb
      .from('devices')
      .update({ [f]: v })
      .eq('id', id)
      .select(FLEET_COLS)
      .single()
    if (e) throw new Error(e.message)
    const i = devices.value.findIndex((x) => x.id === id)
    if (i >= 0) devices.value[i] = data as FleetDevice
  }

  return { devices, defaultWarranty, loading, error, load, setDefaultWarranty, updateField }
}

/** message d'erreur Postgres lisible */
export function pgMsg(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e)
  return m.replace(/^.*?ERROR:\s*/, '')
}

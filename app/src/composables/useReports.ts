// PROTOTYPE (myHexa-test) — modèles de rapports périodiques attachés à un tableau de bord.
import { supabase } from '@/lib/supabase'

// tables du prototype absentes des types générés
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any

export type Frequency = 'daily' | 'weekly' | 'monthly'
export type Compare = 'none' | 'previous' | 'year'

export interface ReportTemplate {
  id?: string
  company_id: string
  dashboard_id: string
  name: string
  frequency: Frequency
  send_hour: number
  weekday: number
  monthday: number
  tz: string
  compare: Compare
  attach_csv: boolean
  recipient_ids: string[]
  enabled: boolean
  next_run_at?: string | null
  last_run_at?: string | null
}

export interface ReportRun {
  id: string
  template_id: string
  period_from: string
  period_to: string
  status: 'sent' | 'not_sent' | 'error'
  trigger: 'cron' | 'manual'
  sent_to: string[]
  html_path: string | null
  csv_path: string | null
  error: string | null
  created_at: string
}

export interface RecipientLite {
  id: string
  name: string | null
  contact_email: string | null
}

export const FREQ_LABEL: Record<Frequency, string> = {
  daily: 'Journalier',
  weekly: 'Hebdomadaire',
  monthly: 'Mensuel',
}
export const COMPARE_LABEL: Record<Compare, string> = {
  none: 'Aucune',
  previous: 'Période précédente',
  year: 'Même période l’an dernier',
}
export const WEEKDAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']

export function newTemplate(companyId: string, dashboardId: string, name: string): ReportTemplate {
  return {
    company_id: companyId,
    dashboard_id: dashboardId,
    name,
    frequency: 'weekly',
    send_hour: 7,
    weekday: 1,
    monthday: 1,
    tz: 'Europe/Paris',
    compare: 'previous',
    attach_csv: true,
    recipient_ids: [],
    enabled: true,
  }
}

/** « chaque lundi à 7 h », « chaque jour à 7 h », « le 1er du mois à 7 h » */
export function scheduleLabel(t: ReportTemplate): string {
  const h = `${t.send_hour} h`
  if (t.frequency === 'daily') return `chaque jour à ${h} (la veille)`
  if (t.frequency === 'weekly')
    return `chaque ${WEEKDAYS[t.weekday - 1]} à ${h} (semaine précédente)`
  return `le ${t.monthday === 1 ? '1er' : t.monthday} du mois à ${h} (mois précédent)`
}

export async function loadReports(dashboardId: string) {
  const { data, error } = await sb
    .from('report_templates')
    .select('*')
    .eq('dashboard_id', dashboardId)
    .order('created_at')
  if (error) throw new Error(error.message)
  return (data ?? []) as ReportTemplate[]
}

export async function loadRuns(templateIds: string[]) {
  if (!templateIds.length) return [] as ReportRun[]
  const { data, error } = await sb
    .from('report_runs')
    .select('*')
    .in('template_id', templateIds)
    .order('created_at', { ascending: false })
    .limit(30)
  if (error) throw new Error(error.message)
  return (data ?? []) as ReportRun[]
}

export async function loadRecipients(companyId: string) {
  const { data, error } = await supabase
    .from('recipients')
    .select('id, name, contact_email')
    .eq('company_id', companyId)
    .order('name')
  if (error) throw new Error(error.message)
  return (data ?? []) as RecipientLite[]
}

export async function saveReport(t: ReportTemplate) {
  const row = { ...t }
  delete row.next_run_at
  delete row.last_run_at
  const q = t.id
    ? sb.from('report_templates').update(row).eq('id', t.id).select().single()
    : sb.from('report_templates').insert(row).select().single()
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data as ReportTemplate
}

export async function deleteReport(id: string) {
  const { error } = await sb.from('report_templates').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('report-run', { body })
  if (error) {
    let msg = error.message
    try {
      msg = (await (error as { context?: Response }).context?.json())?.error?.message ?? msg
    } catch {
      /* corps illisible */
    }
    throw new Error(msg)
  }
  if (!data?.ok) throw new Error(data?.error?.message ?? 'erreur')
  return data.data as T
}

export function previewReport(t: ReportTemplate) {
  return invoke<{
    subject: string
    html: string
    csv: string
    images: number
    ms: number
    mail: boolean
  }>({
    action: 'preview',
    dashboard_id: t.dashboard_id,
    frequency: t.frequency,
    compare: t.compare,
    tz: t.tz,
    name: t.name,
  })
}

export function runReport(id: string) {
  return invoke<{ status: string; error: string | null; sent_to: string[] }>({
    action: 'run',
    template_id: id,
  })
}

export async function archiveUrl(path: string) {
  const { data, error } = await supabase.storage.from('reports').createSignedUrl(path, 600)
  if (error) throw new Error(error.message)
  return data.signedUrl
}

import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import type { Database } from '@/types/supabase'

type RawInsight = Database['public']['Tables']['report_insights']['Row']
export type ReportInsight = RawInsight & {
  report_period_start: string | null
  report_period_end: string | null
}
export type RecipientDeviceView = Database['public']['Tables']['recipient_device_views']['Row']

const STALE_VISIT_DAYS = 3

export function useDeviceInsights(deviceId: () => string | null) {
  const auth = useAuthStore()
  const insights = ref<ReportInsight[]>([])
  const visit = ref<RecipientDeviceView | null>(null)
  const loading = ref(false)
  const shouldShowPopup = ref(false)

  function getRecipientId(): string | null {
    return auth.recipient?.id ?? null
  }

  async function loadVisit(): Promise<RecipientDeviceView | null> {
    const rid = getRecipientId()
    const did = deviceId()
    if (!rid || !did) return null
    const { data, error } = await supabase
      .from('recipient_device_views')
      .select('*')
      .eq('recipient_id', rid)
      .eq('device_id', did)
      .maybeSingle()
    if (error) {
      console.warn('[insights] loadVisit', error.message)
      return null
    }
    return data ?? null
  }

  async function loadInsights(sinceIso: string | null): Promise<ReportInsight[]> {
    const did = deviceId()
    if (!did) return []
    let q = supabase
      .from('report_insights')
      .select('*, reports(period_start, period_end)')
      .eq('device_id', did)
      .gte('severity', 2)
      .order('severity', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(8)
    if (sinceIso) q = q.gt('created_at', sinceIso)
    const { data, error } = await q
    if (error) {
      console.warn('[insights] loadInsights', error.message)
      return []
    }
    return (data ?? []).map((row: RawInsight & { reports?: { period_start: string | null; period_end: string | null } | null }) => ({
      ...row,
      report_period_start: row.reports?.period_start ?? null,
      report_period_end: row.reports?.period_end ?? null,
    }))
  }

  async function upsertVisit() {
    const rid = getRecipientId()
    const did = deviceId()
    if (!rid || !did) return
    const { error } = await supabase
      .from('recipient_device_views')
      .upsert(
        { recipient_id: rid, device_id: did, last_viewed_at: new Date().toISOString() },
        { onConflict: 'recipient_id,device_id', ignoreDuplicates: false },
      )
    if (error) console.warn('[insights] upsertVisit', error.message)
  }

  async function init() {
    loading.value = true
    try {
      const v = await loadVisit()
      visit.value = v
      const lastAck = v?.last_acknowledged_insight_at ?? null
      const ins = await loadInsights(lastAck)
      insights.value = ins
      // Décide si on affiche le popup :
      //  - tous les insights >= 3 → toujours
      //  - sinon, si visite ancienne (> N jours) ET au moins un insight >= 2
      const hasHigh = ins.some((i) => i.severity >= 3)
      const lastViewedMs = v?.last_viewed_at ? new Date(v.last_viewed_at).getTime() : 0
      const daysSince = lastViewedMs === 0 ? Infinity : (Date.now() - lastViewedMs) / 86400_000
      const staleVisitWithSignal = daysSince >= STALE_VISIT_DAYS && ins.length > 0
      shouldShowPopup.value = hasHigh || staleVisitWithSignal
    } finally {
      loading.value = false
    }
    // upsert visit (sans bloquer le popup)
    upsertVisit()
  }

  async function acknowledge() {
    const rid = getRecipientId()
    const did = deviceId()
    if (!rid || !did) return
    const nowIso = new Date().toISOString()
    const { error } = await supabase
      .from('recipient_device_views')
      .upsert(
        { recipient_id: rid, device_id: did, last_viewed_at: nowIso, last_acknowledged_insight_at: nowIso },
        { onConflict: 'recipient_id,device_id', ignoreDuplicates: false },
      )
    if (error) console.warn('[insights] acknowledge', error.message)
    shouldShowPopup.value = false
  }

  function dismiss() {
    shouldShowPopup.value = false
  }

  return { insights, visit, loading, shouldShowPopup, init, acknowledge, dismiss }
}

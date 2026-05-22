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

// Seuil pour ouvrir automatiquement le popup au mount.
// Sous ce seuil, les insights restent consultables (via le bouton "Voir tout"
// par exemple) mais n'interrompent pas l'utilisateur.
const AUTO_OPEN_SEVERITY = 4

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

      // Décide si on ouvre automatiquement le popup :
      //  1. il faut au moins un insight de sévérité ≥ AUTO_OPEN_SEVERITY (4 par défaut)
      //  2. sauf si l'utilisateur a snoozé récemment ET qu'aucun insight n'override
      //     le snooze (sév ≥ SNOOZE_OVERRIDE_SEVERITY apparu APRÈS le snooze)
      // Auto-open dès qu'au moins un insight de sévérité ≥ AUTO_OPEN_SEVERITY
      // existe et n'a pas été acquitté (le filtre last_acknowledged_insight_at
      // est appliqué dans loadInsights). Pas de snooze : si l'utilisateur
      // ferme sans acquitter, le popup réapparaît au prochain mount.
      shouldShowPopup.value = ins.some((i) => i.severity >= AUTO_OPEN_SEVERITY)
    } finally {
      loading.value = false
    }
    // upsert visit (sans bloquer le popup)
    upsertVisit()
  }

  async function acknowledge() {
    // "Compris" : marque tous les insights actuels comme acquittés (ils ne réapparaîtront plus)
    // et reset le snooze (qui n'a plus de raison d'être).
    const rid = getRecipientId()
    const did = deviceId()
    if (!rid || !did) return
    const nowIso = new Date().toISOString()
    const { error } = await supabase
      .from('recipient_device_views')
      .upsert(
        { recipient_id: rid, device_id: did, last_viewed_at: nowIso, last_acknowledged_insight_at: nowIso, popup_snoozed_until: null },
        { onConflict: 'recipient_id,device_id', ignoreDuplicates: false },
      )
    if (error) console.warn('[insights] acknowledge', error.message)
    shouldShowPopup.value = false
  }

  function dismiss() {
    // "Plus tard" / × : simple fermeture en mémoire — pas de persistance.
    // Au prochain mount (reload, navigation), le popup réapparaît si les
    // critères d'auto-open sont toujours remplis. Seul "Compris" acquitte
    // durablement.
    shouldShowPopup.value = false
  }

  return { insights, visit, loading, shouldShowPopup, init, acknowledge, dismiss }
}

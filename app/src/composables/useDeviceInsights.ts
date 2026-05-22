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
// Snooze appliqué quand l'utilisateur clique "Plus tard"
const SNOOZE_HOURS = 24
// Une sévérité ≥ ce seuil bypass le snooze (popup s'ouvre quand même)
const SNOOZE_OVERRIDE_SEVERITY = 5

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
      const hasAuto = ins.some((i) => i.severity >= AUTO_OPEN_SEVERITY)
      if (!hasAuto) {
        shouldShowPopup.value = false
      } else {
        const snoozedUntilMs = v?.popup_snoozed_until ? new Date(v.popup_snoozed_until).getTime() : 0
        const snoozeActive = snoozedUntilMs > Date.now()
        if (!snoozeActive) {
          shouldShowPopup.value = true
        } else {
          // Snooze actif : seul un insight critique APPARU depuis le snooze réveille le popup.
          // On compare created_at à snoozed_at (snoozed_until - SNOOZE_HOURS) approximé : on
          // utilise simplement insights créés après visit.last_viewed_at comme proxy.
          const snoozeRefMs = v?.last_viewed_at ? new Date(v.last_viewed_at).getTime() : 0
          const critOverride = ins.some(
            (i) => i.severity >= SNOOZE_OVERRIDE_SEVERITY &&
              new Date(i.created_at).getTime() > snoozeRefMs,
          )
          shouldShowPopup.value = critOverride
        }
      }
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

  async function dismiss() {
    // "Plus tard" : snooze persistant en base pendant SNOOZE_HOURS
    shouldShowPopup.value = false
    const rid = getRecipientId()
    const did = deviceId()
    if (!rid || !did) return
    const snoozeUntil = new Date(Date.now() + SNOOZE_HOURS * 3600_000).toISOString()
    const { error } = await supabase
      .from('recipient_device_views')
      .upsert(
        { recipient_id: rid, device_id: did, last_viewed_at: new Date().toISOString(), popup_snoozed_until: snoozeUntil },
        { onConflict: 'recipient_id,device_id', ignoreDuplicates: false },
      )
    if (error) console.warn('[insights] dismiss/snooze', error.message)
  }

  return { insights, visit, loading, shouldShowPopup, init, acknowledge, dismiss }
}

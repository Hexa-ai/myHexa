import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import type { PeriodOption, PeriodicPayload } from '@/components/PeriodicReport.vue'

export type PeriodicType = 'daily' | 'weekly'

export interface PeriodicReportResult {
  payload: PeriodicPayload | null
  periodStart: string | null
  periodEnd: string | null
  periods: PeriodOption[]
}

export function usePeriodicReport() {
  const loading = ref(false)
  const error = ref<string | null>(null)
  const result = ref<PeriodicReportResult>({
    payload: null,
    periodStart: null,
    periodEnd: null,
    periods: [],
  })

  async function load(deviceId: string, type: PeriodicType, periodStart?: string | null) {
    loading.value = true
    error.value = null
    try {
      const [periodsRes, reportRes] = await Promise.all([
        // All distinct (period_start, period_end) for this device + type
        supabase
          .from('reports')
          .select('period_start, period_end')
          .eq('device_id', deviceId)
          .eq('type', type)
          .not('period_start', 'is', null)
          .order('period_start', { ascending: false }),
        // The selected period (or latest)
        (() => {
          let q = supabase
            .from('reports')
            .select('payload, received_at, period_start, period_end')
            .eq('device_id', deviceId)
            .eq('type', type)
            .order('period_start', { ascending: false, nullsFirst: false })
            .order('received_at', { ascending: false })
            .limit(1)
          if (periodStart) q = q.eq('period_start', periodStart)
          return q.maybeSingle()
        })(),
      ])

      if (periodsRes.error) throw new Error(periodsRes.error.message)
      if (reportRes.error) throw new Error(reportRes.error.message)

      const uniq = new Map<string, PeriodOption>()
      for (const r of periodsRes.data ?? []) {
        if (r.period_start && !uniq.has(r.period_start)) {
          uniq.set(r.period_start, { period_start: r.period_start, period_end: r.period_end })
        }
      }

      result.value = {
        payload: (reportRes.data?.payload as PeriodicPayload | undefined) ?? null,
        periodStart: reportRes.data?.period_start ?? null,
        periodEnd: reportRes.data?.period_end ?? null,
        periods: Array.from(uniq.values()),
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'unknown error'
    } finally {
      loading.value = false
    }
  }

  return { loading, error, result, load }
}

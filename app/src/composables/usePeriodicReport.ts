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
            .select('payload, derived_payload, received_at, period_start, period_end')
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

      const basePayload = (reportRes.data?.payload as PeriodicPayload | undefined) ?? null
      const derived = (reportRes.data as { derived_payload?: PeriodicPayload | null } | null)
        ?.derived_payload
      const derivedVars = (derived?.variables ?? []) as Array<
        PeriodicPayload['variables'] extends (infer V)[] | undefined ? V : never
      > & Array<{ derived_from?: string }>
      let mergedPayload: PeriodicPayload | null = basePayload
      if (basePayload && derivedVars.length > 0) {
        const derivedBySource = new Map<string, typeof derivedVars>()
        const orphanDerived: typeof derivedVars = []
        for (const dv of derivedVars) {
          const src = dv.derived_from
          if (src) {
            const arr = derivedBySource.get(src) ?? []
            arr.push(dv)
            derivedBySource.set(src, arr)
          } else {
            orphanDerived.push(dv)
          }
        }
        const merged: typeof derivedVars = []
        for (const v of basePayload.variables ?? []) {
          merged.push(v as (typeof derivedVars)[number])
          const vn = v.name
          if (vn) {
            const followers = derivedBySource.get(vn)
            if (followers) {
              merged.push(...followers)
              derivedBySource.delete(vn)
            }
          }
        }
        // Toute dérivée orpheline (source absente) : append à la fin
        for (const remaining of derivedBySource.values()) merged.push(...remaining)
        merged.push(...orphanDerived)
        mergedPayload = { ...basePayload, variables: merged }
      }

      result.value = {
        payload: mergedPayload,
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

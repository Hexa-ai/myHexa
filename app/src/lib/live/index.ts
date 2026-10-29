import type { LiveSource } from '@/lib/live/types'
import { supabaseLiveSource } from '@/lib/live/supabaseSource'
import { createMockSource } from '@/lib/live/mockSource'

/** Mode direct activable par drapeau de build : VITE_REALTIME_DIRECT=false coupe tout (front livré « éteint »). */
export const LIVE_ENABLED = import.meta.env.VITE_REALTIME_DIRECT !== 'false'

/** Durée du direct rapide avant « Continuer le direct ? » (15 min ; réduite par variable de build pour les tests). */
export const FAST_DURATION_MS = Number(import.meta.env.VITE_LIVE_FAST_MS) || 15 * 60_000

export function defaultLiveSource(): LiveSource {
  return import.meta.env.VITE_LIVE_SOURCE === 'mock' ? createMockSource() : supabaseLiveSource
}

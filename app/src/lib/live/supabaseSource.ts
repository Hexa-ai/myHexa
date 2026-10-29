// Transport réel : Supabase Realtime (Broadcast + Presence) sur le canal PRIVÉ de la box, topic « box:<devices.id> ».
// Droits : policies sur realtime.messages (lecture broadcast + presence des box visibles par l'utilisateur ;
// écriture limitée à la présence). Le client supabase-js renouvelle seul le jeton de session sur le socket Realtime
// (aucun écouteur d'authentification ici : piège auth-js, jamais d'await Supabase dans onAuthStateChange).
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type {
  BoxStateMessage,
  LiveChannel,
  LiveHandlers,
  LiveSource,
  ValuesMessage,
  ViewerMeta,
} from '@/lib/live/types'

export const boxTopic = (deviceId: string) => `box:${deviceId}`

/** clé de présence propre à cet onglet (une par canal, stable pendant la vie de la page) */
const TAB_KEY =
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)

type PresenceMeta = { role?: string; caps?: unknown }

/**
 * Contrat §4 : une entrée de présence avec role === 'box' = box en ligne ET compatible direct. Si la liste `caps` est
 * annoncée, elle doit contenir 'valeurs' (les futures capacités s'y ajoutent sans casser ce test).
 */
export function boxPresent(state: Record<string, PresenceMeta[]>): boolean {
  return Object.values(state).some((metas) =>
    metas.some(
      (m) => m?.role === 'box' && (!Array.isArray(m.caps) || m.caps.includes('valeurs')),
    ),
  )
}

/** valide un message « valeurs » reçu (ne jamais faire confiance au réseau) */
export function parseValues(p: unknown): ValuesMessage | null {
  const o = p as { t?: unknown; full?: unknown; d?: unknown } | null
  if (!o || typeof o !== 'object' || !o.d || typeof o.d !== 'object') return null
  const d: ValuesMessage['d'] = {}
  for (const [name, e] of Object.entries(o.d as Record<string, unknown>)) {
    if (!Array.isArray(e) || e.length < 1) continue
    const v = e[0]
    if (v !== null && !['number', 'string', 'boolean'].includes(typeof v)) continue
    const ts = typeof e[1] === 'number' && Number.isFinite(e[1]) ? e[1] : Number(o.t) || Date.now()
    d[name] = [v as ValuesMessage['d'][string][0], ts]
  }
  return { t: typeof o.t === 'number' ? o.t : Date.now(), full: !!o.full, d }
}

export const supabaseLiveSource: LiveSource = {
  open(deviceId: string, h: LiveHandlers): LiveChannel {
    let closed = false
    const ch: RealtimeChannel = supabase.channel(boxTopic(deviceId), {
      config: { private: true, presence: { key: TAB_KEY }, broadcast: { self: false } },
    })
    const syncBox = () => h.onBox(boxPresent(ch.presenceState() as Record<string, PresenceMeta[]>))
    ch.on('presence', { event: 'sync' }, syncBox)
      .on('broadcast', { event: 'valeurs' }, (m) => {
        const v = parseValues((m as { payload?: unknown }).payload)
        if (v) h.onValues(v)
      })
      .on('broadcast', { event: 'etat' }, (m) => {
        const p = (m as { payload?: BoxStateMessage }).payload
        if (p && ['on', 'pause', 'idle'].includes(p.direct)) h.onState(p)
      })
      .subscribe((status) => {
        if (closed) return
        if (status === 'SUBSCRIBED') h.onStatus('joined')
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED')
          h.onStatus('lost')
      })
    return {
      setViewer(meta: ViewerMeta | null) {
        if (closed) return
        // erreurs absorbées : un échec d'annonce ne doit jamais casser la page (retour aux valeurs 30 min)
        if (meta) void ch.track(meta).catch(() => h.onStatus('lost'))
        else void ch.untrack().catch(() => {})
      },
      close() {
        if (closed) return
        closed = true
        void supabase.removeChannel(ch).catch(() => {})
      },
    }
  },
}

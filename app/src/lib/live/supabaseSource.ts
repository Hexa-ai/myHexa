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

const isLiveValue = (v: unknown): v is ValuesMessage['d'][string][0] =>
  v === null || ['number', 'string', 'boolean'].includes(typeof v)

/**
 * Décodeur d'un canal : formats v1 ({ nom: [valeur, ts] }) et v2 compact (économie de data 4G) :
 *   { v: 2, e: époque, s, t, f?: 1, k?: { index: nom }, d: [index, valeur, index, valeur, …] }
 * Les noms ne voyagent qu'une fois (k) ; le dictionnaire vit par canal et par époque (redémarrage du service de la
 * box = nouvelle numérotation : on l'oublie et on attend l'instantané). Un index inconnu est ignoré.
 */
export function createValuesDecoder() {
  let epoch: unknown = undefined
  let names = new Map<number, string>()
  return (p: unknown): ValuesMessage | null => {
    const o = p as { v?: unknown } | null
    if (!o || typeof o !== 'object') return null
    if (o.v !== 2) return parseValues(p)
    const m = p as { e?: unknown; t?: unknown; f?: unknown; k?: unknown; d?: unknown }
    if (!Array.isArray(m.d)) return null
    if (m.e !== epoch) {
      epoch = m.e
      names = new Map()
    }
    if (m.k && typeof m.k === 'object') {
      for (const [i, n] of Object.entries(m.k as Record<string, unknown>)) {
        const idx = Number(i)
        if (Number.isInteger(idx) && typeof n === 'string' && n) names.set(idx, n)
      }
    }
    const t = typeof m.t === 'number' && Number.isFinite(m.t) ? m.t : Date.now()
    const d: ValuesMessage['d'] = {}
    for (let j = 0; j + 1 < m.d.length; j += 2) {
      const name = names.get(m.d[j] as number)
      const v = m.d[j + 1]
      if (name && isLiveValue(v)) d[name] = [v, t]
    }
    return { t, full: m.f === 1 || m.f === true, d }
  }
}

/** valide un message « valeurs » v1 reçu (ne jamais faire confiance au réseau) */
export function parseValues(p: unknown): ValuesMessage | null {
  const o = p as { t?: unknown; full?: unknown; d?: unknown } | null
  if (!o || typeof o !== 'object' || !o.d || typeof o.d !== 'object' || Array.isArray(o.d)) return null
  const d: ValuesMessage['d'] = {}
  for (const [name, e] of Object.entries(o.d as Record<string, unknown>)) {
    if (!Array.isArray(e) || e.length < 1) continue
    const v = e[0]
    if (!isLiveValue(v)) continue
    const ts = typeof e[1] === 'number' && Number.isFinite(e[1]) ? e[1] : Number(o.t) || Date.now()
    d[name] = [v, ts]
  }
  return { t: typeof o.t === 'number' ? o.t : Date.now(), full: !!o.full, d }
}

export const supabaseLiveSource: LiveSource = {
  open(deviceId: string, h: LiveHandlers): LiveChannel {
    let closed = false
    const ch: RealtimeChannel = supabase.channel(boxTopic(deviceId), {
      config: { private: true, presence: { key: TAB_KEY }, broadcast: { self: false } },
    })
    const decode = createValuesDecoder()
    const syncBox = () => h.onBox(boxPresent(ch.presenceState() as Record<string, PresenceMeta[]>))
    ch.on('presence', { event: 'sync' }, syncBox)
      .on('broadcast', { event: 'valeurs' }, (m) => {
        const v = decode((m as { payload?: unknown }).payload)
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

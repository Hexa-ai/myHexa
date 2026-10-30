// Position 4G transmise par la box (clé « location » au premier niveau du statut et du journalier).
// Contrat : {latitude, longitude, accuracy_m, source:"cell", approximate:true, resolved_at} ou null.
// Fonction pure : la base (apply_device_location) revalide les bornes.

export interface BoxLocation {
  latitude: number
  longitude: number
  accuracy_m: number | null
  source: string
  approximate: boolean
  resolved_at: string | null
}

// absent : clé non envoyée (ancienne box) ou null (géoloc désactivée) -> ne rien changer
// invalid : clé présente mais inexploitable -> ignorée
export type ParsedLocation =
  | { kind: 'absent' }
  | { kind: 'invalid'; reason: string }
  | { kind: 'ok'; loc: BoxLocation }

const MAX_ACCURACY_M = 10_000_000

export function parseLocation(payload: unknown, now: number = Date.now()): ParsedLocation {
  if (!payload || typeof payload !== 'object') return { kind: 'absent' }
  const raw = (payload as Record<string, unknown>).location
  if (raw === undefined || raw === null) return { kind: 'absent' }
  if (typeof raw !== 'object' || Array.isArray(raw)) return { kind: 'invalid', reason: 'location : objet attendu' }
  const o = raw as Record<string, unknown>
  const lat = o.latitude
  const lon = o.longitude
  if (typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { kind: 'invalid', reason: 'latitude / longitude non numériques' }
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return { kind: 'invalid', reason: 'coordonnées hors bornes' }
  if (lat === 0 && lon === 0) return { kind: 'invalid', reason: 'position 0,0 écartée' }
  let acc: number | null = null
  if (typeof o.accuracy_m === 'number' && Number.isFinite(o.accuracy_m) && o.accuracy_m >= 0 && o.accuracy_m <= MAX_ACCURACY_M) {
    acc = Math.round(o.accuracy_m)
  }
  let resolved: string | null = null
  if (typeof o.resolved_at === 'string') {
    const t = Date.parse(o.resolved_at)
    // une date dans le futur (horloge de la box fausse) est ramenée à l'instant de réception
    if (Number.isFinite(t)) resolved = new Date(Math.min(t, now)).toISOString()
  }
  return {
    kind: 'ok',
    loc: {
      latitude: lat,
      longitude: lon,
      accuracy_m: acc,
      source: typeof o.source === 'string' && o.source ? o.source.slice(0, 20) : 'cell',
      approximate: o.approximate !== false,
      resolved_at: resolved,
    },
  }
}

// Mode DIRECT — interface entre le store (logique, testable) et le transport (Supabase Realtime ou simulation).
// Le store ne connaît que ces types : changer de transport ne touche ni les tuiles ni les graphiques.

/** cadence demandée par le spectateur dans sa présence (la box s'y adapte) */
export type LiveRate = 'fast' | 'slow'

/** présence annoncée par le spectateur sur le canal de la box */
export interface ViewerMeta {
  role: 'viewer'
  mode: LiveRate
  /** horodatage de l'annonce : un « Continuer » ré-annonce la présence (méta modifiée), la box relance son délai de 15 min */
  since: number
  /** format « valeurs » compris par ce portail (2 = compact) ; la box n'utilise v2 que si TOUS les spectateurs l'annoncent */
  fmt?: number
}

export type LiveValue = number | string | boolean | null

/** message « valeurs » de la box : { nom : [valeur, horodatage ms] } (seules les valeurs modifiées, sauf instantané) */
export interface ValuesMessage {
  t: number
  full: boolean
  d: Record<string, [LiveValue, number]>
}

/** message « etat » de la box */
export interface BoxStateMessage {
  direct: 'on' | 'pause' | 'idle'
  mode?: string
}

export type ChannelStatus = 'joined' | 'lost'

export interface LiveHandlers {
  /** canal rejoint, ou perdu / refusé (le store gère la reprise) */
  onStatus(s: ChannelStatus): void
  /** présence de la box sur le canal = la box est connectée en direct = capacité annoncée */
  onBox(present: boolean): void
  onState(m: BoxStateMessage): void
  onValues(m: ValuesMessage): void
}

export interface LiveChannel {
  /** annonce (ou retire avec null) la présence du spectateur : c'est elle qui réveille la box */
  setViewer(meta: ViewerMeta | null): void
  close(): void
}

export interface LiveSource {
  open(deviceId: string, h: LiveHandlers): LiveChannel
}

export interface ViewportMeasure {
  inner: number
  vv: number
  client: number
  screenH: number
  sat: number
  ios: boolean
}

/**
 * Bug iOS (application installée, barre d'état translucide) : la hauteur annoncée est amputée
 * exactement de la barre d'état (mesuré : inner=793, écran=852, barre=59), et iOS ne PEINT que cette
 * hauteur tant que la vue n'a pas été recalculée. Forcer la hauteur de l'écran ne sert donc à rien :
 * le bas reste invisible (pied de page caché, vérifié sur iPhone le 28/10).
 */
export function hasShortViewport(m: ViewportMeasure) {
  const h = Math.round(Math.max(m.inner, m.vv, m.client))
  return m.ios && m.sat > 0 && Math.abs(m.screenH - h - m.sat) <= 2
}

/** hauteur de l'application = zone réellement peinte (jamais la hauteur de l'écran) */
export function pickAppHeight(m: ViewportMeasure) {
  return Math.round(Math.max(m.inner, m.vv, m.client))
}

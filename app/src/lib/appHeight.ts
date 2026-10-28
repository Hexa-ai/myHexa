/**
 * Hauteur de l'application installée.
 * iPhone, barre d'état translucide : iOS annonce une hauteur amputée exactement de la barre d'état
 * (mesuré sur iPhone : inner=793, écran=852, barre=59) mais peint tout l'écran -> bande vide sous le
 * pied de page. Dans ce cas seulement (écart = barre d'état, à 2 px près), on prend la hauteur de l'écran.
 * Ailleurs (iPad en écran partagé, paysage, Android), on garde la hauteur annoncée.
 */
export function pickAppHeight(m: {
  inner: number
  vv: number
  client: number
  screenH: number
  sat: number
  ios: boolean
}) {
  const h = Math.round(Math.max(m.inner, m.vv, m.client))
  const gap = m.screenH - h
  if (m.ios && m.sat > 0 && Math.abs(gap - m.sat) <= 2) return Math.round(m.screenH)
  return h
}

// Cadrage enregistré d'une tuile synoptique : fonctions pures (aucune dépendance Vue ni DOM), testées dans tests/unit/lib/cadrage.spec.ts.
//
// Un cadrage est un RECTANGLE DU DESSIN exprimé en fractions de l'étendue du dessin (0 = bord gauche/haut, 1 = bord droit/bas).
// Il est donc indépendant de la taille de la tuile : quelle que soit la forme de la tuile, le rectangle y tient en entier
// (« contain », centré) ; seule la marge change de côté quand le rapport largeur/hauteur change.
// Stockage : options.synoptic_cadre du bloc. Absent = ajustement automatique (tout le dessin).

export interface Cadre {
  x: number
  y: number
  w: number
  h: number
}
export interface Dessin {
  w: number
  h: number
}

/** zoom relatif minimal / maximal (1 = tout le dessin) */
export const ZOOM_MIN = 1
export const ZOOM_MAX = 8

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

/** lit un cadrage stocké ; undefined si absent ou invalide (le dessin est alors ajusté automatiquement) */
export function lireCadre(v: unknown): Cadre | undefined {
  if (!v || typeof v !== 'object') return undefined
  const c = v as Record<string, unknown>
  const [x, y, w, h] = [c.x, c.y, c.w, c.h].map(Number)
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0 || w > 4 || h > 4) return undefined
  return { x, y, w, h }
}

/** zone visible (viewBox, unités du dessin) -> cadrage relatif */
export function cadreDepuisVue(vb: Cadre, dessin: Dessin): Cadre {
  return { x: vb.x / dessin.w, y: vb.y / dessin.h, w: vb.w / dessin.w, h: vb.h / dessin.h }
}

/**
 * Zone visible (viewBox) pour un cadrage et une tuile de rapport `aspect` (largeur / hauteur) :
 * le rectangle du cadrage tient en entier dans la tuile, centré. Sans cadrage : tout le dessin.
 */
export function vueDepuisCadre(cadre: Cadre | null | undefined, dessin: Dessin, aspect: number): Cadre {
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : dessin.w / dessin.h
  const c = cadre ?? { x: 0, y: 0, w: 1, h: 1 }
  const cw = c.w * dessin.w
  const ch = c.h * dessin.h
  const w = Math.max(cw, ch * a)
  const h = w / a
  return { x: (c.x + c.w / 2) * dessin.w - w / 2, y: (c.y + c.h / 2) * dessin.h - h / 2, w, h }
}

/** zoom (1 = tout le dessin) d'un cadrage : inverse de la plus grande fraction du dessin affichée */
export function zoomDeCadre(cadre: Cadre | null | undefined): number {
  if (!cadre) return 1
  return clamp(1 / Math.max(cadre.w, cadre.h), ZOOM_MIN, ZOOM_MAX)
}

/** même centre, même forme, mais affichant 1/zoom du dessin ; centre ramené dans le dessin */
export function cadreAvecZoom(cadre: Cadre | null | undefined, zoom: number): Cadre {
  const z = clamp(zoom, ZOOM_MIN, ZOOM_MAX)
  const c = cadre ?? { x: 0, y: 0, w: 1, h: 1 }
  const fraction = 1 / z
  const f = fraction / Math.max(c.w, c.h) // facteur appliqué aux deux côtés (la forme est conservée)
  const w = c.w * f
  const h = c.h * f
  const cx = clamp(c.x + c.w / 2, 0, 1)
  const cy = clamp(c.y + c.h / 2, 0, 1)
  return { x: cx - w / 2, y: cy - h / 2, w, h }
}

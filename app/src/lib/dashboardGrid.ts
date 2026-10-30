// Grille des tableaux de bord : fonctions pures (aucune dépendance Vue), testées dans tests/unit/lib/dashboardGrid.spec.ts.
// Une tuile occupe `w` colonnes sur 12 et `h` rangées. Stockage : options.w / options.h ;
// la colonne historique `width` ('1/4'…'full') reste renseignée pour les anciens lecteurs.

export type LegacyWidth = '1/4' | '1/3' | '1/2' | '2/3' | 'full'

export const GRID_COLS = 12
export const MIN_W = 2
export const MAX_H = 6
/** hauteur d'une rangée (px) à partir de 2 rangées ; h = 1 reste la hauteur automatique d'origine */
export const ROW_PX = 120
export const GAP_PX = 12

/** colonnes (sur 12) de chaque largeur historique */
export const LEGACY_COLS: Record<LegacyWidth, number> = { '1/4': 3, '1/3': 4, '1/2': 6, '2/3': 8, full: 12 }

/** classes d'origine : les tuiles sans options.w s'affichent exactement comme avant */
const LEGACY_SPAN: Record<LegacyWidth, string> = {
  '1/4': 'col-span-12 sm:col-span-6 lg:col-span-3',
  '1/3': 'col-span-12 sm:col-span-6 lg:col-span-4',
  '1/2': 'col-span-12 lg:col-span-6',
  '2/3': 'col-span-12 lg:col-span-8',
  full: 'col-span-12',
}
// classes écrites en entier : Tailwind ne détecte pas les noms fabriqués par concaténation
const LG_SPAN = ['', '', 'lg:col-span-2', 'lg:col-span-3', 'lg:col-span-4', 'lg:col-span-5', 'lg:col-span-6',
  'lg:col-span-7', 'lg:col-span-8', 'lg:col-span-9', 'lg:col-span-10', 'lg:col-span-11', 'lg:col-span-12']
const SM_SPAN = ['', '', '', '', '', '', 'sm:col-span-6', 'sm:col-span-7', 'sm:col-span-8', 'sm:col-span-9',
  'sm:col-span-10', 'sm:col-span-11', 'sm:col-span-12']

export interface GridSize {
  w: number
  h: number
}
/** forme minimale d'une tuile vue par la grille (compatible avec Widget de useDashboards) */
export interface SizedWidget {
  width: string
  options: { w?: number; h?: number }
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

/** largeur historique la plus proche d'un nombre de colonnes (pour la colonne `width`) ; égalité : la plus étroite sauf 10 (pleine) */
export function colsToLegacy(w: number): LegacyWidth {
  let best: LegacyWidth = 'full'
  for (const k of Object.keys(LEGACY_COLS) as LegacyWidth[]) {
    if (Math.abs(LEGACY_COLS[k] - w) < Math.abs(LEGACY_COLS[best] - w)) best = k
  }
  return best
}

/** colonnes d'une tuile : options.w si présent, sinon déduit de l'ancienne largeur */
export function widgetCols(wd: SizedWidget): number {
  if (typeof wd.options.w === 'number') return clamp(Math.round(wd.options.w), MIN_W, GRID_COLS)
  return LEGACY_COLS[wd.width as LegacyWidth] ?? GRID_COLS
}

/** rangées d'une tuile (1 = hauteur automatique) */
export function widgetRows(wd: SizedWidget): number {
  return typeof wd.options.h === 'number' ? clamp(Math.round(wd.options.h), 1, MAX_H) : 1
}

/** classes de largeur : mobile pleine largeur, tablette ≥ 6 colonnes, grand écran w colonnes */
export function spanClasses(wd: SizedWidget): string {
  if (typeof wd.options.w !== 'number') return LEGACY_SPAN[wd.width as LegacyWidth] ?? 'col-span-12'
  const w = widgetCols(wd)
  return ['col-span-12', SM_SPAN[Math.max(w, 6)], LG_SPAN[w]].join(' ')
}

/** hauteur minimale (px) d'une tuile de plusieurs rangées ; undefined = hauteur automatique */
export function minHeightPx(wd: SizedWidget): number | undefined {
  const h = widgetRows(wd)
  return h > 1 ? h * ROW_PX + (h - 1) * GAP_PX : undefined
}

/** applique une taille à une tuile (options.w / options.h + width historique) */
export function setSize(wd: SizedWidget, size: Partial<GridSize>) {
  if (size.w !== undefined) {
    const w = clamp(Math.round(size.w), MIN_W, GRID_COLS)
    wd.options.w = w
    wd.width = colsToLegacy(w)
  }
  if (size.h !== undefined) {
    const h = clamp(Math.round(size.h), 1, MAX_H)
    if (h > 1) wd.options.h = h
    else delete wd.options.h
  }
}

/** nouvelle taille pendant le tirage de la poignée, aimantée aux colonnes et aux rangées */
export function resizeTo(
  start: { widthPx: number; heightPx: number },
  delta: { dx: number; dy: number },
  gridWidthPx: number,
): GridSize {
  const colPx = (gridWidthPx - (GRID_COLS - 1) * GAP_PX) / GRID_COLS
  const w = Math.round((start.widthPx + delta.dx + GAP_PX) / (colPx + GAP_PX))
  const h = Math.round((start.heightPx + delta.dy + GAP_PX) / (ROW_PX + GAP_PX))
  return { w: clamp(w, MIN_W, GRID_COLS), h: clamp(h, 1, MAX_H) }
}

export type DropSide = 'before' | 'after'

/**
 * Côté d'insertion sur une tuile survolée : moitié gauche/droite pour une tuile étroite
 * (barre verticale), moitié haute/basse pour une tuile pleine largeur (barre horizontale).
 */
export function dropSide(
  rect: { left: number; top: number; width: number; height: number },
  pt: { x: number; y: number },
  cols: number,
): DropSide {
  if (cols >= GRID_COLS) return pt.y < rect.top + rect.height / 2 ? 'before' : 'after'
  return pt.x < rect.left + rect.width / 2 ? 'before' : 'after'
}

/** emplacement de dépôt : index d'insertion dans la liste d'origine (0..n) */
export function insertionIndex(target: number, side: DropSide): number {
  return side === 'before' ? target : target + 1
}

/** déplace l'élément `from` pour l'insérer à l'index `at` (de la liste d'origine) ; les autres se décalent */
export function moveItem<T>(list: T[], from: number, at: number): T[] {
  if (from < 0 || from >= list.length) return list
  const out = list.slice()
  const [x] = out.splice(from, 1)
  out.splice(at > from ? at - 1 : at, 0, x)
  return out
}

/** vrai si déposer en `at` ne change rien (juste avant ou juste après la tuile elle-même) */
export function isNoopDrop(from: number, at: number): boolean {
  return at === from || at === from + 1
}

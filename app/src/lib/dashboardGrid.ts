// Grille des tableaux de bord : fonctions pures (aucune dépendance Vue), testées dans tests/unit/lib/dashboardGrid.spec.ts.
//
// Grille 2D réelle (≥ 768 px) : 12 colonnes, rangées de hauteur FIXE (ROW_UNIT px, écart GAP_PX), remplissage « row dense ».
// Une tuile occupe `w` colonnes et `rows` rangées ; une petite tuile vient donc combler le trou à côté d'une grande, et
// plusieurs tuiles s'empilent à côté d'un synoptique haut. L'ordre du tableau reste l'ordre de placement (premier trou libre).
// Sous 768 px : empilement simple en une colonne, hauteurs automatiques (les rangées fixes ne s'appliquent pas).
//
// Stockage dans le jsonb `options` du bloc :
//   - options.w     : colonnes (2-12) ; la colonne historique `width` ('1/4'…'full') reste renseignée pour les anciens lecteurs ;
//   - options.rows  : hauteur en rangées de ROW_UNIT px (absent = hauteur par défaut du type, voir autoRows) ;
//   - options.h     : ANCIEN format, en rangées de 120 px (h = 1 ou absent : hauteur automatique). Lu et converti (×2), jamais réécrit.
//   - ROW_UNIT + GAP_PX = 66 px = la moitié d'une ancienne rangée (120 + 12 = 132 px) : un ancien h donne exactement la même hauteur.

export type LegacyWidth = '1/4' | '1/3' | '1/2' | '2/3' | 'full'

export const GRID_COLS = 12
export const MIN_W = 2
/** hauteur d'une rangée (px) */
export const ROW_UNIT = 54
export const GAP_PX = 12
/** hauteur maximale d'une tuile, en rangées (3950 px) */
export const MAX_ROWS = 60
/** hauteur minimale par défaut, en rangées (108 px) ; un synoptique exige plus (MIN_ROWS_BY_TYPE) */
export const MIN_ROWS = 2
const MIN_ROWS_BY_TYPE: Record<string, number> = { synoptic: 4 }
/** une ancienne rangée (h) valait 2 rangées d'aujourd'hui */
export const LEGACY_ROW_FACTOR = 2
/** largeur d'écran (px) à partir de laquelle la grille 2D s'applique (md de Tailwind) */
export const GRID_2D_MIN_PX = 768

/** colonnes (sur 12) de chaque largeur historique */
export const LEGACY_COLS: Record<LegacyWidth, number> = { '1/4': 3, '1/3': 4, '1/2': 6, '2/3': 8, full: 12 }

/** classes d'origine : les tuiles sans options.w s'affichent comme avant (sauf < 768 px : une seule colonne) */
const LEGACY_SPAN: Record<LegacyWidth, string> = {
  '1/4': 'col-span-12 md:col-span-6 lg:col-span-3',
  '1/3': 'col-span-12 md:col-span-6 lg:col-span-4',
  '1/2': 'col-span-12 lg:col-span-6',
  '2/3': 'col-span-12 lg:col-span-8',
  full: 'col-span-12',
}
// classes écrites en entier : Tailwind ne détecte pas les noms fabriqués par concaténation
const LG_SPAN = ['', '', 'lg:col-span-2', 'lg:col-span-3', 'lg:col-span-4', 'lg:col-span-5', 'lg:col-span-6',
  'lg:col-span-7', 'lg:col-span-8', 'lg:col-span-9', 'lg:col-span-10', 'lg:col-span-11', 'lg:col-span-12']
const MD_SPAN = ['', '', '', '', '', '', 'md:col-span-6', 'md:col-span-7', 'md:col-span-8', 'md:col-span-9',
  'md:col-span-10', 'md:col-span-11', 'md:col-span-12']

export interface GridSize {
  w: number
  /** hauteur en rangées de ROW_UNIT px */
  h: number
}
/** forme minimale d'une tuile vue par la grille (compatible avec Widget de useDashboards) */
export interface SizedWidget {
  width: string
  type?: string
  sources?: { device?: string; var?: string }[]
  op?: string | null
  options: {
    w?: number
    h?: number
    rows?: number
    separate?: boolean
    fields?: string[]
    limit?: number
    text?: string
    gaugeStyle?: string
  }
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

/** hauteur minimale (rangées) d'un type de tuile */
export function minRows(type?: string): number {
  return (type && MIN_ROWS_BY_TYPE[type]) || MIN_ROWS
}

/** hauteur en px de n rangées (écarts compris) */
export function rowsPx(n: number): number {
  return n * ROW_UNIT + (n - 1) * GAP_PX
}

/**
 * Hauteur par défaut (rangées) d'une tuile SANS hauteur enregistrée (anciennes tuiles à h = 1, nouvelles tuiles) :
 * estimée d'après le type et le contenu (nombre de variables, de lignes…), assez généreuse pour que rien ne déborde.
 */
export function autoRows(wd: SizedWidget): number {
  const type = wd.type ?? ''
  const n = (wd.sources ?? []).filter((s) => s.var).length
  const nBox = new Set((wd.sources ?? []).map((s) => s.device)).size
  const cols = widgetCols(wd)
  // px de contenu -> rangées (padding et titre compris dans les estimations)
  const px = (h: number) => Math.ceil((h + GAP_PX) / (ROW_UNIT + GAP_PX))
  const separate = n > 1 && !wd.op && !!wd.options.separate
  switch (type) {
    case 'curve':
    case 'bars':
      if (separate) return px(n * 140 + 90)
      return n > 1 && !wd.op ? 6 : 5
    case 'states':
      return px(Math.max(1, n) * 140 + 70)
    case 'value':
      return n > 1 && !wd.op ? Math.max(3, px(n * 28 + 90)) : 3
    case 'gauge': {
      const style = wd.options.gaugeStyle
      if (n > 1 && !wd.op) {
        const perLine = Math.max(1, Math.floor(cols / 3))
        return px(Math.ceil(n / perLine) * 150 + 70)
      }
      return style === 'tank' || style === 'bar-v' ? 5 : style === 'bar-h' ? 3 : 4
    }
    case 'indicator': {
      if (n > 1) return Math.max(3, px(Math.ceil(n / Math.max(1, Math.floor(cols * 0.8))) * 44 + 70))
      return 3
    }
    case 'status':
      return px(Math.max(1, nBox) * ((wd.options.fields?.length ?? 2) * 28 + (nBox > 1 ? 28 : 0)) + 64)
    case 'map':
      return 6
    case 'image':
      return 5
    case 'table':
      return Math.max(3, px(Math.max(1, n) * 48 + 110))
    case 'text':
      return Math.max(MIN_ROWS, px(Math.ceil((wd.options.text ?? '').length / 60 + 1) * 22 + 40))
    case 'alarm_history':
      return px((wd.options.limit ?? 10) * 30 + 90)
    case 'alarm_stats':
      return 6
    case 'interventions':
      return 8
    case 'document':
      return 6
    case 'weather':
      return 4
    case 'synoptic':
      return 8
    default:
      return 4
  }
}

/** vrai si la tuile n'a pas de hauteur enregistrée (hauteur par défaut du type) */
export function isAutoHeight(wd: SizedWidget): boolean {
  if (typeof wd.options.rows === 'number') return false
  return !(typeof wd.options.h === 'number' && wd.options.h > 1)
}

/** rangées d'une tuile : options.rows, sinon ancien options.h converti, sinon hauteur par défaut du type */
export function widgetRows(wd: SizedWidget): number {
  const lo = minRows(wd.type)
  if (typeof wd.options.rows === 'number') return clamp(Math.round(wd.options.rows), lo, MAX_ROWS)
  if (typeof wd.options.h === 'number' && wd.options.h > 1)
    return clamp(Math.round(wd.options.h) * LEGACY_ROW_FACTOR, lo, MAX_ROWS)
  return clamp(autoRows(wd), lo, MAX_ROWS)
}

/** classes de largeur : < 768 px pleine largeur, tablette ≥ 6 colonnes, grand écran w colonnes */
export function spanClasses(wd: SizedWidget): string {
  if (typeof wd.options.w !== 'number') return LEGACY_SPAN[wd.width as LegacyWidth] ?? 'col-span-12'
  const w = widgetCols(wd)
  return ['col-span-12', MD_SPAN[Math.max(w, 6)], LG_SPAN[w]].join(' ')
}

/** variables CSS de la grille (rangée fixe et écart) : une seule source, ici */
export function gridStyle(): Record<string, string> {
  return { '--row-unit': ROW_UNIT + 'px' }
}
/** variable CSS de la tuile : nombre de rangées occupées (appliqué par .dash-tile à partir de 768 px) */
export function tileStyle(wd: SizedWidget, i: number): Record<string, string | number> {
  return { '--i': i, '--rs': widgetRows(wd) }
}

/** applique une taille à une tuile (options.w / options.rows + width historique) ; l'ancien options.h disparaît */
export function setSize(wd: SizedWidget, size: Partial<GridSize>) {
  if (size.w !== undefined) {
    const w = clamp(Math.round(size.w), MIN_W, GRID_COLS)
    wd.options.w = w
    wd.width = colsToLegacy(w)
  }
  if (size.h !== undefined) {
    wd.options.rows = clamp(Math.round(size.h), minRows(wd.type), MAX_ROWS)
    delete wd.options.h
  }
}

/** retire la hauteur enregistrée : la tuile reprend la hauteur par défaut de son type */
export function resetHeight(wd: SizedWidget) {
  delete wd.options.rows
  delete wd.options.h
}

/** largeur d'une colonne (px) pour une grille de `gridWidthPx` */
export function colWidthPx(gridWidthPx: number): number {
  return (gridWidthPx - (GRID_COLS - 1) * GAP_PX) / GRID_COLS
}

/**
 * Nouvelle taille pendant le tirage d'une poignée, aimantée indépendamment aux colonnes et aux rangées.
 * `axis` : 'x' = largeur seule, 'y' = hauteur seule, 'xy' = les deux (poignée d'angle).
 */
export function resizeTo(
  start: { widthPx: number; heightPx: number },
  delta: { dx: number; dy: number },
  gridWidthPx: number,
  opts: { axis?: 'x' | 'y' | 'xy'; type?: string } = {},
): GridSize {
  const colPx = colWidthPx(gridWidthPx)
  const axis = opts.axis ?? 'xy'
  const w = Math.round((start.widthPx + (axis === 'y' ? 0 : delta.dx) + GAP_PX) / (colPx + GAP_PX))
  const h = Math.round((start.heightPx + (axis === 'x' ? 0 : delta.dy) + GAP_PX) / (ROW_UNIT + GAP_PX))
  return { w: clamp(w, MIN_W, GRID_COLS), h: clamp(h, minRows(opts.type), MAX_ROWS) }
}

/** boîte (px, relative à la grille) de n colonnes × m rangées à partir de la colonne c0 (0-based) et de la position `top` */
export function spanBox(gridWidthPx: number, size: GridSize, left: number, top: number) {
  const colPx = colWidthPx(gridWidthPx)
  const width = size.w * colPx + (size.w - 1) * GAP_PX
  const height = rowsPx(size.h)
  // la boîte ne sort pas à droite de la grille (la tuile passerait à la ligne au relâchement)
  return { left: Math.max(0, Math.min(left, gridWidthPx - width)), top, width, height }
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

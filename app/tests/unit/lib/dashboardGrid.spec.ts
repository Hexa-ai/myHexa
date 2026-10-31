import { describe, expect, it } from 'vitest'
import {
  colsToLegacy,
  dropSide,
  insertionIndex,
  isNoopDrop,
  autoRows,
  colWidthPx,
  gridStyle,
  isAutoHeight,
  GAP_PX,
  MAX_ROWS,
  MIN_ROWS,
  resetHeight,
  ROW_UNIT,
  rowsPx,
  spanBox,
  tileStyle,
  moveItem,
  resizeTo,
  setSize,
  spanClasses,
  widgetCols,
  widgetRows,
} from '@/lib/dashboardGrid'

const tile = (width: string, options: { w?: number; h?: number; rows?: number; text?: string; gaugeStyle?: string; separate?: boolean } = {}) => ({ width, options })

describe('largeur historique <-> colonnes', () => {
  it('lit les anciennes largeurs', () => {
    expect(widgetCols(tile('1/4'))).toBe(3)
    expect(widgetCols(tile('1/3'))).toBe(4)
    expect(widgetCols(tile('1/2'))).toBe(6)
    expect(widgetCols(tile('2/3'))).toBe(8)
    expect(widgetCols(tile('full'))).toBe(12)
  })
  it('options.w prime sur width et est borné', () => {
    expect(widgetCols(tile('full', { w: 5 }))).toBe(5)
    expect(widgetCols(tile('full', { w: 1 }))).toBe(2)
    expect(widgetCols(tile('1/4', { w: 40 }))).toBe(12)
  })
  it('arrondit vers la largeur historique la plus proche', () => {
    expect(colsToLegacy(2)).toBe('1/4')
    expect(colsToLegacy(5)).toBe('1/3')
    expect(colsToLegacy(7)).toBe('1/2')
    expect(colsToLegacy(9)).toBe('2/3')
    expect(colsToLegacy(10)).toBe('full') // égalité 2/3 – pleine : la plus large
    expect(colsToLegacy(11)).toBe('full')
  })
})

describe('classes de grille', () => {
  it('tuile ancienne : classes strictement identiques à avant', () => {
    expect(spanClasses(tile('1/4'))).toBe('col-span-12 md:col-span-6 lg:col-span-3')
    expect(spanClasses(tile('1/2'))).toBe('col-span-12 lg:col-span-6')
    expect(spanClasses(tile('full'))).toBe('col-span-12')
  })
  it('largeur libre : mobile pleine, tablette >= 6, bureau = w', () => {
    expect(spanClasses(tile('1/3', { w: 5 }))).toBe('col-span-12 md:col-span-6 lg:col-span-5')
    expect(spanClasses(tile('2/3', { w: 9 }))).toBe('col-span-12 md:col-span-9 lg:col-span-9')
  })
  it('hauteur : ancien h converti (1 ancienne rangée = 2 rangées), h = 1 = hauteur par défaut du type', () => {
    expect(widgetRows(tile('full', { h: 3 }))).toBe(6)
    expect(widgetRows(tile('full', { h: 4 }))).toBe(8)
    expect(rowsPx(2 * 4)).toBe(4 * 120 + 3 * 12) // ancienne hauteur de 4 rangées : identique en pixels
    expect(widgetRows(tile('full', { h: 1 }))).toBe(autoRows(tile('full')))
    expect(isAutoHeight(tile('full', { h: 1 }))).toBe(true)
    expect(isAutoHeight(tile('full', { h: 3 }))).toBe(false)
  })
  it('options.rows prime sur l\'ancien h et est borné par le minimum du type', () => {
    expect(widgetRows(tile('full', { h: 3, rows: 9 }))).toBe(9)
    expect(widgetRows(tile('full', { rows: 99 }))).toBe(MAX_ROWS)
    expect(widgetRows(tile('full', { rows: 1 }))).toBe(MIN_ROWS)
    expect(widgetRows({ ...tile('full', { rows: 1 }), type: 'synoptic' })).toBe(4)
  })
  it('hauteur par défaut selon le type et le contenu', () => {
    const t = (type: string, extra: Record<string, unknown> = {}, nSrc = 1) => ({
      width: '1/3', type, op: null, sources: Array.from({ length: nSrc }, () => ({ device: 'd', var: 'v' })), options: extra,
    })
    expect(widgetRows(t('synoptic'))).toBe(8)
    expect(widgetRows(t('curve'))).toBe(5)
    expect(widgetRows(t('curve', {}, 2))).toBeGreaterThan(widgetRows(t('curve')))
    expect(widgetRows(t('curve', { separate: true }, 3))).toBeGreaterThan(widgetRows(t('curve', {}, 3)))
    expect(widgetRows(t('value'))).toBeLessThan(widgetRows(t('map')))
    expect(widgetRows(t('gauge', { gaugeStyle: 'tank' }))).toBeGreaterThan(widgetRows(t('gauge', { gaugeStyle: 'bar-h' })))
    expect(widgetRows(t('text', { text: 'x'.repeat(400) }))).toBeGreaterThan(widgetRows(t('text', { text: 'court' })))
    expect(widgetRows(t('inconnu'))).toBe(4)
    for (const ty of ['curve', 'bars', 'states', 'value', 'gauge', 'indicator', 'status', 'map', 'image', 'table', 'text', 'alarm_history', 'alarm_stats', 'interventions', 'document', 'weather', 'synoptic'])
      expect(widgetRows(t(ty))).toBeGreaterThanOrEqual(2)
  })
  it('rangées en classes CSS : variable --rs et grille fixe', () => {
    expect(tileStyle(tile('full', { rows: 7 }), 3)).toEqual({ '--i': 3, '--rs': 7 })
    expect(gridStyle()).toEqual({ '--row-unit': ROW_UNIT + 'px' })
  })
})

describe('setSize', () => {
  it('écrit w, rows et la largeur historique voisine', () => {
    const t = tile('1/4')
    setSize(t, { w: 9, h: 8 })
    expect(t).toEqual({ width: '2/3', options: { w: 9, rows: 8 } })
  })
  it("remplace l'ancien h par rows (même hauteur en pixels)", () => {
    const t = tile('full', { h: 3 })
    setSize(t, { h: widgetRows(t) })
    expect(t.options).toEqual({ rows: 6 })
  })
  it('resetHeight rend la hauteur par défaut du type', () => {
    const t = tile('full', { rows: 9, h: 3 })
    resetHeight(t)
    expect(t.options).toEqual({})
  })
})

describe('redimensionnement', () => {
  const grid = 1200 // colonne = (1200 - 11*12) / 12 = 88,99 px
  it('ne bouge pas sans déplacement', () => {
    expect(resizeTo({ widthPx: 294, heightPx: rowsPx(6) }, { dx: 0, dy: 0 }, grid)).toEqual({ w: 3, h: 6 })
  })
  it('aimante indépendamment à la colonne et à la rangée', () => {
    expect(resizeTo({ widthPx: 294, heightPx: rowsPx(6) }, { dx: 200, dy: 140 }, grid)).toEqual({ w: 5, h: 8 })
    expect(resizeTo({ widthPx: 294, heightPx: rowsPx(6) }, { dx: 10, dy: 140 }, grid)).toEqual({ w: 3, h: 8 })
    expect(resizeTo({ widthPx: 294, heightPx: rowsPx(6) }, { dx: 200, dy: 10 }, grid)).toEqual({ w: 5, h: 6 })
  })
  it('un seul axe pour les poignées de bord', () => {
    const st = { widthPx: 294, heightPx: rowsPx(6) }
    expect(resizeTo(st, { dx: 200, dy: 300 }, grid, { axis: 'x' })).toEqual({ w: 5, h: 6 })
    expect(resizeTo(st, { dx: 200, dy: 140 }, grid, { axis: 'y' })).toEqual({ w: 3, h: 8 })
  })
  it('borne entre 2 et 12 colonnes, minimum du type et MAX_ROWS rangées', () => {
    const st = { widthPx: 294, heightPx: rowsPx(6) }
    expect(resizeTo(st, { dx: -900, dy: -900 }, grid)).toEqual({ w: 2, h: MIN_ROWS })
    expect(resizeTo(st, { dx: -900, dy: -900 }, grid, { type: 'synoptic' })).toEqual({ w: 2, h: 4 })
    expect(resizeTo(st, { dx: 5000, dy: 9000 }, grid)).toEqual({ w: 12, h: MAX_ROWS })
  })
  it('boîte du fantôme : taille exacte de la cible, sans sortir à droite', () => {
    const box = spanBox(1200, { w: 6, h: 4 }, 100, 40)
    expect(box.width).toBeCloseTo(6 * colWidthPx(1200) + 5 * GAP_PX)
    expect(box.height).toBe(rowsPx(4))
    expect(spanBox(1200, { w: 6, h: 4 }, 900, 0).left + box.width).toBeLessThanOrEqual(1200)
  })
})

describe('insertion au glisser-déposer', () => {
  const rect = { left: 100, top: 50, width: 200, height: 100 }
  it('tuile étroite : moitié gauche = avant, droite = après', () => {
    expect(dropSide(rect, { x: 150, y: 90 }, 4)).toBe('before')
    expect(dropSide(rect, { x: 250, y: 90 }, 4)).toBe('after')
  })
  it('tuile pleine largeur : moitié haute = avant, basse = après', () => {
    expect(dropSide(rect, { x: 250, y: 60 }, 12)).toBe('before')
    expect(dropSide(rect, { x: 120, y: 140 }, 12)).toBe('after')
  })
  it("index d'insertion", () => {
    expect(insertionIndex(2, 'before')).toBe(2)
    expect(insertionIndex(2, 'after')).toBe(3)
  })
  it('déplacer sans échange : le reste se décale', () => {
    const l = ['a', 'b', 'c', 'd']
    expect(moveItem(l, 0, 3)).toEqual(['b', 'c', 'a', 'd']) // entre c et d
    expect(moveItem(l, 3, 1)).toEqual(['a', 'd', 'b', 'c']) // entre a et b
    expect(moveItem(l, 1, 4)).toEqual(['a', 'c', 'd', 'b']) // en fin de liste
    expect(moveItem(l, 2, 0)).toEqual(['c', 'a', 'b', 'd']) // en tête
    expect(l).toEqual(['a', 'b', 'c', 'd']) // liste d'origine intacte
  })
  it('dépôt sans effet juste avant/après soi-même', () => {
    expect(isNoopDrop(2, 2)).toBe(true)
    expect(isNoopDrop(2, 3)).toBe(true)
    expect(isNoopDrop(2, 1)).toBe(false)
    expect(isNoopDrop(2, 4)).toBe(false)
  })
})

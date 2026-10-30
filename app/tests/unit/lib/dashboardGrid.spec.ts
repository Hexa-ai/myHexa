import { describe, expect, it } from 'vitest'
import {
  colsToLegacy,
  dropSide,
  insertionIndex,
  isNoopDrop,
  minHeightPx,
  moveItem,
  resizeTo,
  setSize,
  spanClasses,
  widgetCols,
  widgetRows,
} from '@/lib/dashboardGrid'

const tile = (width: string, options: { w?: number; h?: number } = {}) => ({ width, options })

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
    expect(spanClasses(tile('1/4'))).toBe('col-span-12 sm:col-span-6 lg:col-span-3')
    expect(spanClasses(tile('1/2'))).toBe('col-span-12 lg:col-span-6')
    expect(spanClasses(tile('full'))).toBe('col-span-12')
  })
  it('largeur libre : mobile pleine, tablette >= 6, bureau = w', () => {
    expect(spanClasses(tile('1/3', { w: 5 }))).toBe('col-span-12 sm:col-span-6 lg:col-span-5')
    expect(spanClasses(tile('2/3', { w: 9 }))).toBe('col-span-12 sm:col-span-9 lg:col-span-9')
  })
  it('hauteur : 1 rangée = auto, sinon hauteur minimale', () => {
    expect(widgetRows(tile('full'))).toBe(1)
    expect(minHeightPx(tile('full'))).toBeUndefined()
    expect(minHeightPx(tile('full', { h: 3 }))).toBe(3 * 120 + 2 * 12)
    expect(widgetRows(tile('full', { h: 99 }))).toBe(6)
  })
})

describe('setSize', () => {
  it('écrit w, h et la largeur historique voisine', () => {
    const t = tile('1/4')
    setSize(t, { w: 9, h: 4 })
    expect(t).toEqual({ width: '2/3', options: { w: 9, h: 4 } })
  })
  it('h = 1 retire options.h (hauteur automatique)', () => {
    const t = tile('full', { h: 3 })
    setSize(t, { h: 1 })
    expect(t.options.h).toBeUndefined()
  })
})

describe('redimensionnement', () => {
  const grid = 1200 // colonne = (1200 - 11*12) / 12 = 88,99 px
  it('ne bouge pas sans déplacement', () => {
    expect(resizeTo({ widthPx: 294, heightPx: 120 }, { dx: 0, dy: 0 }, grid)).toEqual({ w: 3, h: 1 })
  })
  it('aimante à la colonne et à la rangée', () => {
    expect(resizeTo({ widthPx: 294, heightPx: 120 }, { dx: 200, dy: 140 }, grid)).toEqual({ w: 5, h: 2 })
  })
  it('borne entre 2 et 12 colonnes, 1 et 6 rangées', () => {
    expect(resizeTo({ widthPx: 294, heightPx: 120 }, { dx: -900, dy: -900 }, grid)).toEqual({ w: 2, h: 1 })
    expect(resizeTo({ widthPx: 294, heightPx: 120 }, { dx: 5000, dy: 5000 }, grid)).toEqual({ w: 12, h: 6 })
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

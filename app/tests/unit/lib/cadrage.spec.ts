import { describe, expect, it } from 'vitest'
import {
  cadreAvecZoom,
  cadreDepuisVue,
  lireCadre,
  vueDepuisCadre,
  zoomDeCadre,
  ZOOM_MAX,
} from '@/lib/synoptic/cadrage'

const dessin = { w: 1000, h: 500 }

describe('cadrage relatif du synoptique', () => {
  it('sans cadrage : tout le dessin tient, centré, quelle que soit la tuile', () => {
    // tuile plus large que le dessin (aspect 4) : marges à gauche et à droite
    const large = vueDepuisCadre(null, dessin, 4)
    expect(large.h).toBeCloseTo(500)
    expect(large.w).toBeCloseTo(2000)
    expect(large.x).toBeCloseTo(-500)
    // tuile haute (aspect 1) : marges en haut et en bas
    const haute = vueDepuisCadre(null, dessin, 1)
    expect(haute.w).toBeCloseTo(1000)
    expect(haute.h).toBeCloseTo(1000)
    expect(haute.y).toBeCloseTo(-250)
  })
  it('le rectangle enregistré reste entièrement visible quand la forme de la tuile change', () => {
    const cadre = { x: 0.2, y: 0.1, w: 0.4, h: 0.5 } // 400 × 250 unités du dessin
    for (const aspect of [0.5, 1, 1.6, 3, 8]) {
      const v = vueDepuisCadre(cadre, dessin, aspect)
      expect(v.w / v.h).toBeCloseTo(aspect)
      expect(v.x).toBeLessThanOrEqual(0.2 * 1000 + 1e-6)
      expect(v.x + v.w).toBeGreaterThanOrEqual(0.6 * 1000 - 1e-6)
      expect(v.y).toBeLessThanOrEqual(0.1 * 500 + 1e-6)
      expect(v.y + v.h).toBeGreaterThanOrEqual(0.6 * 500 - 1e-6)
      // centre inchangé
      expect(v.x + v.w / 2).toBeCloseTo(400)
      expect(v.y + v.h / 2).toBeCloseTo(175)
    }
  })
  it('aller-retour vue -> cadrage -> vue pour la même tuile', () => {
    const vb = { x: 100, y: 50, w: 400, h: 200 }
    const cadre = cadreDepuisVue(vb, dessin)
    expect(cadre).toEqual({ x: 0.1, y: 0.1, w: 0.4, h: 0.4 })
    const v = vueDepuisCadre(cadre, dessin, vb.w / vb.h)
    expect(v.x).toBeCloseTo(vb.x)
    expect(v.y).toBeCloseTo(vb.y)
    expect(v.w).toBeCloseTo(vb.w)
    expect(v.h).toBeCloseTo(vb.h)
  })
  it('zoom : 1 = tout le dessin, borné, et appliqué autour du centre sans changer la forme', () => {
    expect(zoomDeCadre(null)).toBe(1)
    expect(zoomDeCadre({ x: 0.25, y: 0.25, w: 0.5, h: 0.5 })).toBeCloseTo(2)
    expect(zoomDeCadre({ x: 0, y: 0, w: 0.001, h: 0.001 })).toBe(ZOOM_MAX)
    const c = cadreAvecZoom({ x: 0.1, y: 0.2, w: 0.4, h: 0.2 }, 4) // centre (0,3 ; 0,3)
    expect(c.w / c.h).toBeCloseTo(2)
    expect(c.x + c.w / 2).toBeCloseTo(0.3)
    expect(c.y + c.h / 2).toBeCloseTo(0.3)
    expect(zoomDeCadre(c)).toBeCloseTo(4)
    expect(zoomDeCadre(cadreAvecZoom(null, 1))).toBe(1)
  })
  it('lecture défensive du cadrage stocké', () => {
    expect(lireCadre(undefined)).toBeUndefined()
    expect(lireCadre('x')).toBeUndefined()
    expect(lireCadre({ x: 0, y: 0, w: 0, h: 1 })).toBeUndefined()
    expect(lireCadre({ x: 'a', y: 0, w: 1, h: 1 })).toBeUndefined()
    expect(lireCadre({ x: 0.1, y: 0.2, w: 0.5, h: 0.5 })).toEqual({ x: 0.1, y: 0.2, w: 0.5, h: 0.5 })
  })
})

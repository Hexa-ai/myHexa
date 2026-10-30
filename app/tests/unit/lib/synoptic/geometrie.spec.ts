import { describe, expect, it } from 'vitest'
import G from '@/lib/synoptic/engine/geom'

describe('géométrie des conduites (fonctions pures)', () => {
  it('coupe : 2 lignes maximum, pas de mot coupé en deux', () => {
    const l = G.coupe('Pompe eau brute de forage principal', 14)
    expect(l.length).toBeLessThanOrEqual(2)
    expect(l.join(' ').replace(/…$/, '')).toContain('Pompe')
  })
  it('simplifier : retire les points alignés', () => {
    const s = G.simplifier([
      [0, 0],
      [10, 0],
      [20, 0],
      [20, 10],
    ])
    expect(s).toEqual([
      [0, 0],
      [20, 0],
      [20, 10],
    ])
  })
  it('router : le tracé est orthogonal et relie les deux points', () => {
    const pts = G.router([0, 0], 'E', [200, 100], 'W', {})
    expect(pts[0]).toEqual([0, 0])
    expect(pts[pts.length - 1]).toEqual([200, 100])
    for (let i = 1; i < pts.length; i++)
      expect(pts[i][0] === pts[i - 1][0] || pts[i][1] === pts[i - 1][1]).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import { hasShortViewport, pickAppHeight } from '@/lib/appHeight'

const iphone = { inner: 793, vv: 793, client: 793, screenH: 852, sat: 59, ios: true }

describe('hauteur application installée', () => {
  it("iPhone : vue amputée de la barre d'état détectée, hauteur = zone peinte (jamais l'écran)", () => {
    expect(hasShortViewport(iphone)).toBe(true)
    expect(pickAppHeight(iphone)).toBe(793)
  })
  it('iPhone recalé (après un toucher) : vue normale', () => {
    const ok = { ...iphone, inner: 852, vv: 852, client: 852 }
    expect(hasShortViewport(ok)).toBe(false)
    expect(pickAppHeight(ok)).toBe(852)
  })
  it('iPad écran partagé : pas de faux positif', () => {
    expect(
      hasShortViewport({ ...iphone, inner: 600, vv: 600, client: 600, screenH: 1180, sat: 24 }),
    ).toBe(false)
  })
  it('Android / PC : jamais', () => {
    expect(hasShortViewport({ ...iphone, ios: false })).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { pickAppHeight } from '@/lib/appHeight'

const iphone = { inner: 793, vv: 793, client: 793, screenH: 852, sat: 59, ios: true }

describe('pickAppHeight', () => {
  it("iPhone installé : hauteur amputée de la barre d'état -> écran entier", () => {
    expect(pickAppHeight(iphone)).toBe(852)
  })
  it('iPhone déjà recalé (après un toucher) : rien ne change', () => {
    expect(pickAppHeight({ ...iphone, inner: 852, vv: 852, client: 852 })).toBe(852)
  })
  it('écart différent de la barre d’état (iPad écran partagé) : hauteur annoncée', () => {
    expect(
      pickAppHeight({ ...iphone, inner: 600, vv: 600, client: 600, screenH: 1180, sat: 24 }),
    ).toBe(600)
  })
  it('Android / PC : jamais la hauteur écran', () => {
    expect(pickAppHeight({ ...iphone, ios: false })).toBe(793)
  })
  it('sans encoche mesurée : hauteur annoncée', () => {
    expect(pickAppHeight({ ...iphone, sat: 0 })).toBe(793)
  })
})

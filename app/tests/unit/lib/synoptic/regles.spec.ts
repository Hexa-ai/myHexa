import { describe, expect, it } from 'vitest'
import { appliquerRegle, estEmplacementEtat } from '@/lib/synoptic/regles'

describe('règles de liaison variable → état', () => {
  it('sans valeur reçue : inconnu, jamais 0 ni 1', () => {
    expect(
      appliquerRegle({ variable: 'X', regle: { op: 'gt', val: 1 } }, 'marche', null),
    ).toBeUndefined()
    expect(appliquerRegle({ variable: 'X' }, 'marche', undefined)).toBeUndefined()
  })
  it('sans règle : valeur brute', () => {
    expect(appliquerRegle({ variable: 'X' }, 'marche', 1)).toBe(1)
    expect(appliquerRegle({ variable: 'X' }, 'valeur', 12.5)).toBe(12.5)
  })
  it("opérateurs sur un emplacement d'état", () => {
    const r = (op: 'eq' | 'ne' | 'gt' | 'ge' | 'lt' | 'le', val: number, x: number) =>
      appliquerRegle({ variable: 'X', regle: { op, val } }, 'marche', x)
    expect(r('eq', 3, 3)).toBe(1)
    expect(r('eq', 3, 2)).toBe(0)
    expect(r('ne', 0, 5)).toBe(1)
    expect(r('gt', 10, 10)).toBe(0)
    expect(r('ge', 10, 10)).toBe(1)
    expect(r('lt', 2, 1)).toBe(1)
    expect(r('le', 2, 3)).toBe(0)
  })
  it('opérateur par défaut eq, valeur par défaut 1', () => {
    expect(appliquerRegle({ variable: 'X', regle: {} }, 'defaut', 1)).toBe(1)
    expect(appliquerRegle({ variable: 'X', regle: {} }, 'defaut', 0)).toBe(0)
  })
  it('la règle ne touche pas les emplacements de mesure (min/max servent au niveau)', () => {
    expect(
      appliquerRegle({ variable: 'X', regle: { op: 'gt', val: 1, min: 0, max: 5 } }, 'niveau', 4),
    ).toBe(4)
  })
  it("états nommés d'un symbole de l'entreprise (s_…)", () => {
    expect(estEmplacementEtat('s_chauffe')).toBe(true)
    expect(estEmplacementEtat('valeur')).toBe(false)
    expect(appliquerRegle({ variable: 'X', regle: { op: 'ge', val: 2 } }, 's_chauffe', 2)).toBe(1)
  })
})

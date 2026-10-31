import { describe, expect, it } from 'vitest'
import { catalogue, dessiner } from '@/lib/synoptic/iso/lib'
import { CONVOYEUR, convoyeurLongueur } from '@/lib/synoptic/iso/lib/process'

// Q4 : vannes en ligne coaxiales, convoyeur extensible, ids obsolètes préservés.

const norme = (v: number[]) => Math.hypot(v[0], v[1], v[2])

describe('vannes et robinetterie en ligne', () => {
  const vannes = catalogue().filter((d) => /^(vanne|robinet|clapet)/.test(d.id) && d.statut !== 'obsolete')

  it('le catalogue contient des vannes', () => {
    expect(vannes.length).toBeGreaterThan(5)
  })

  it('deux ports « en ligne » sont opposés et sur le même axe', () => {
    for (const d of vannes) {
      const r = dessiner(d.id)
      const ent = r.ports.filter((p) => ['a', 'e', 'in', 'entree'].includes(p.id))
      const sor = r.ports.filter((p) => ['b', 's', 'out', 'sortie'].includes(p.id))
      if (ent.length !== 1 || sor.length !== 1) continue
      const [a, b] = [ent[0], sor[0]]
      expect(norme(a.dir), d.id).toBeCloseTo(1, 5)
      expect(a.dir[0] + b.dir[0], d.id).toBeCloseTo(0, 5)
      expect(a.dir[1] + b.dir[1], d.id).toBeCloseTo(0, 5)
      expect(a.dir[2] + b.dir[2], d.id).toBeCloseTo(0, 5)
      // coaxial : le vecteur a→b est colinéaire à la direction
      const v = [b.pos[0] - a.pos[0], b.pos[1] - a.pos[1], b.pos[2] - a.pos[2]]
      const croix = [
        v[1] * a.dir[2] - v[2] * a.dir[1],
        v[2] * a.dir[0] - v[0] * a.dir[2],
        v[0] * a.dir[1] - v[1] * a.dir[0],
      ]
      expect(norme(croix), d.id).toBeLessThan(0.01)
    }
  })
})

describe('convoyeur à bande extensible', () => {
  it('longueur à pas fixe, extrémités inchangées', () => {
    const l1 = convoyeurLongueur({ longueur: 150 })
    const l2 = convoyeurLongueur({ longueur: 150 + 3 * CONVOYEUR.PAS })
    expect(l2.n - l1.n).toBe(3)
    expect(l2.Lb - l1.Lb).toBe(3 * CONVOYEUR.PAS)
    expect(l1.Lb).toBe(CONVOYEUR.TETE + l1.n * CONVOYEUR.PAS)
  })

  it('le rendu s’allonge sans exception', () => {
    const court = dessiner('meca.convoyeur_bande', { longueur: 100 })
    const long = dessiner('meca.convoyeur_bande', { longueur: 400 })
    expect(long.svg.length).toBeGreaterThan(court.svg.length)
    expect(long.bbox.x1 - long.bbox.x0).toBeGreaterThan(court.bbox.x1 - court.bbox.x0)
  })
})

describe('ids conservés', () => {
  it('les anciens ids restent résolvables avec remplacePar', () => {
    const ids = new Map(catalogue().map((d) => [d.id, d]))
    for (const [ancien, nouveau] of [['instr.voyant_klaxon', 'instr.colonne_lumineuse'], ['instr.thermometre', 'instr.cadran'], ['instr.manometre', 'instr.cadran']]) {
      expect(ids.get(ancien)?.statut).toBe('obsolete')
      expect(ids.get(ancien)?.remplacePar).toBe(nouveau)
      expect(ids.has(nouveau)).toBe(true)
    }
  })
})

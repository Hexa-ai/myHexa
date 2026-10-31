// Pose systématique de TOUT le catalogue iso : chaque symbole doit se poser par la vraie fonction d'édition, apparaître dans le document,
// se dessiner (SVG non vide, boîte finie) sans exception, avec les paramètres par défaut. Garde-fou contre « tel symbole ne se pose pas ».
import { describe, expect, it } from 'vitest'
import { catalogue, construire, rendu0 } from '@/lib/synoptic/iso/lib'
import { docLib, isoVide, type IsoSection } from '@/lib/synoptic/iso/format'
import { ajouterAccessoire, poserComposant, relierPorts } from '@/lib/synoptic/iso/edition'
import { estAccessoireIso } from '@/lib/synoptic/iso/familles'

const defs = catalogue()

describe('pose de tout le catalogue iso', () => {
  it('le catalogue est non vide', () => expect(defs.length).toBeGreaterThan(100))

  const echecs: string[] = []
  for (const d of defs) {
    it(`pose libre : ${d.id}`, () => {
      const iso: IsoSection = isoVide()
      const [cx, cy] = rendu0(d.id, {}, 'arret', {}, 0).ancres.centre
      expect(Number.isFinite(cx) && Number.isFinite(cy)).toBe(true)
      const id = poserComposant(iso, d.id, 100, 100, { aimant: 20, centre: [cx, cy] })
      const c = iso.composants.find((q) => q.id === id)
      expect(c, 'composant dans le document').toBeTruthy()
      expect(Number.isFinite(c!.x) && Number.isFinite(c!.y)).toBe(true)
      let svg = ''
      try {
        const r = construire(docLib(iso, {}, { editeur: true }))
        svg = r.scene.toSvg({ css: false, fond: false, marge: 10 })
        expect(r.rendus[id], 'rendu présent').toBeTruthy()
      } catch (e) {
        echecs.push(`${d.id}: ${(e as Error).message}`)
        throw e
      }
      expect(svg.length).toBeGreaterThan(200)
      expect(svg).not.toMatch(/NaN|Infinity/)
    })
  }

  it('les accessoires en ligne se posent aussi sur un tuyau', () => {
    const iso: IsoSection = isoVide()
    const a = poserComposant(iso, 'raccord.bout', 0, 0, { aimant: 20 })
    const b = poserComposant(iso, 'raccord.bout', 300, 0, { aimant: 20 })
    const L = relierPorts(iso, { c: a, port: 'a' }, { c: b, port: 'a' }, { dn: 5 }, { dn: 5 })
    for (const d of defs.filter((q) => estAccessoireIso(q.id))) {
      const acc = ajouterAccessoire(iso, L, d.id, 0.5)
      expect(acc, d.id).toBeTruthy()
      const r = construire(docLib(iso, {}, { editeur: true }))
      expect(r.scene.toSvg({ css: false, fond: false }), d.id).not.toMatch(/NaN/)
      iso.liaisons[0].accessoires = []
    }
  })
})

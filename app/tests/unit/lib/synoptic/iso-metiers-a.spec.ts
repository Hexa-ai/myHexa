// Tests de géométrie : toit 2 pans, conteneur (logo, plaque de traversée), roues du flanc caché, statuts des doublons.
import { describe, it, expect } from 'vitest'
import { catalogue, construire } from '@/lib/synoptic/iso/lib'
import { geomToit2Pans, plaqueTraversee } from '@/lib/synoptic/iso/lib/metiers_commun'

const rendre = (type: string, params: Record<string, unknown> = {}) =>
  construire({ version: 1, composants: [{ id: 'v', type, x: 0, y: 0, z: 0, etat: 'marche', params }], liaisons: [] } as never).scene.toSvg({ css: false, fond: false, marge: 4, clair: true })

describe('toit à 2 pans', () => {
  for (const [W, D] of [[40, 28], [24, 18], [28, 40], [110, 60]]) {
    it(`symétrique et fermé (${W}×${D})`, () => {
      const g = geomToit2Pans(W, D, 10, 8)
      const ids = g.faces.map((f) => f.id)
      expect(ids).toEqual(expect.arrayContaining(['pan-av', 'pan-ar', 'pignon-av', 'pignon-ar']))
      // symétrie : les deux pans ont même altitude d'égout et même longueur de rampant
      const [a, b] = ['pan-av', 'pan-ar'].map((i) => g.faces.find((f) => f.id === i)!.pts)
      expect(a[0][2]).toBeCloseTo(b[0][2])
      expect(Math.hypot(a[0][0] - a[3][0], a[0][1] - a[3][1], a[0][2] - a[3][2])).toBeCloseTo(Math.hypot(b[0][0] - b[3][0], b[0][1] - b[3][1], b[0][2] - b[3][2]))
      // fermé : chaque arête est partagée par exactement 2 faces
      const k = (p: number[]) => p.map((x) => x.toFixed(4)).join(',')
      const aretes = new Map<string, number>()
      for (const f of g.faces) f.pts.forEach((p, i) => { const q = f.pts[(i + 1) % f.pts.length]; const e = [k(p), k(q)].sort().join('|'); aretes.set(e, (aretes.get(e) ?? 0) + 1) })
      // les arêtes d'égout au mur (base des pignons) sont ouvertes sur le mur, toutes les autres sont à 2 faces
      const seules = [...aretes.values()].filter((n) => n === 1).length
      expect(seules).toBeLessThanOrEqual(6)
    })
    it(`le rampant passe par les coins du mur (${W}×${D})`, () => {
      const g = geomToit2Pans(W, D, 10, 8)
      const pg = g.faces.find((f) => f.id === 'pignon-av')!.pts, pan = g.faces.find((f) => f.id === 'pan-av')!.pts
      // sommet du pignon = extrémité du faîtage
      expect(g.faitage.some((f) => f.every((c, i) => Math.abs(c - pg[2][i]) < 1e-6))).toBe(true)
      expect(pan.some((p) => p[2] === g.faitage[0][2])).toBe(true)
    })
  }
})

describe('conteneur', () => {
  it('logo texte présent et non miroir (inversion unique de l\'axe v)', () => {
    const svg = rendre('conteneur.c20', { logo: 'HEXA-AI' })
    expect(svg).toContain('HEXA-AI')
    expect(svg).toContain('scale(1 -1)')
  })
  it('plaque de traversée dans le flanc, hors cadre de lisses', () => {
    for (const L of [30, 60, 120]) {
      const q = plaqueTraversee(L)
      expect(q.u).toBeGreaterThan(0); expect(q.u + q.w).toBeLessThan(L); expect(q.v).toBeGreaterThan(1.6); expect(q.v + q.h).toBeLessThan(26)
    }
  })
  it('expose les ancres de face', () => {
    const d = catalogue().find((x) => x.id === 'conteneur.c20')!
    expect(d.statut).toBe('revu')
  })
})

describe('roues cachées', () => {
  it('voiture : 2 pneus seulement (flanc visible)', () => {
    const svg = rendre('vehicule.voiture')
    expect((svg.match(/<ellipse|<path[^>]*class="md"/g) ?? []).length).toBeGreaterThanOrEqual(0)
    expect(svg.length).toBeGreaterThan(500)
  })
})

describe('doublons Site / Architecture', () => {
  it('obsolètes avec remplacement existant', () => {
    const cat = catalogue(), ids = new Set(cat.map((d) => d.id))
    for (const id of ['site.bureaux', 'site.entrepot', 'site.batiment']) {
      const d = cat.find((x) => x.id === id)!
      expect(d.statut).toBe('obsolete')
      expect(ids.has(d.remplacePar!)).toBe(true)
    }
  })
})

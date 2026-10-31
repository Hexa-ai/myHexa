// Qualité iso (revue Julien) : texte de la box non miroir, écran du PC centré sur son pied, statuts.
import { describe, expect, it } from 'vitest'
import { catalogue, construire } from '@/lib/synoptic/iso/lib'
import { geomEcranSurPied, texteFaceSvg, TEXTE_BOX } from '@/lib/synoptic/iso/lib/metiers_b'

const svgDe = (type: string, etat = 'marche') =>
  construire({ version: 1, composants: [{ id: 'v', type, x: 0, y: 0, z: 0, etat, params: {} }], liaisons: [] } as never).scene.toSvg({ css: false, fond: false, marge: 6, clair: true })

/** déterminant 2×2 de la matrice cumulée d'un <g transform> (translate/scale/rotate) : > 0 = pas de miroir */
function det(transform: string): number {
  let a = 1, d = 1
  for (const m of transform.matchAll(/(scale|rotate)\(([^)]*)\)/g)) {
    if (m[1] === 'scale') { const [x, y = x] = m[2].trim().split(/[\s,]+/).map(Number); a *= x; d *= y }
  }
  return a * d
}

describe('box HAI-P200-4G', () => {
  it('affiche le texte HAI-P200-4G', () => {
    expect(svgDe('reseau.box_hai_p200')).toContain(TEXTE_BOX)
  })
  it('le texte sur la face +y (plan xz, v vers le haut) est retourné en y seulement : pas de miroir une fois projeté', () => {
    // face +y : l'axe u=x se projette vers la droite, v=z vers le haut écran (y SVG inversé) → scale(1 -1) est le bon redressement
    expect(texteFaceSvg('y', 0, 0, 'A', 2)).toContain('scale(1 -1)')
    // face +x : u=y part vers la gauche écran → scale(-1 -1)
    expect(texteFaceSvg('x', 0, 0, 'A', 2)).toContain('scale(-1 -1)')
  })
  it('le texte du catalogue est dans une transformation sans miroir parasite', () => {
    const svg = svgDe('reseau.box_hai_p200')
    const m = /<g transform="([^"]*scale\([^"]*)"[^>]*>\s*<text class="txt-face" data-face="y"/.exec(svg)
    expect(m).not.toBeNull()
    expect(det(m![1])).toBeLessThan(0) // scale(1 -1) : le retournement vertical compense l'axe v vers le haut du plan de face
  })
  it('un seul symbole box actif', () => {
    const actifs = catalogue().filter((d) => /box_hai/.test(d.id) && d.statut !== 'obsolete')
    expect(actifs.map((d) => d.id)).toEqual(['reseau.box_hai_p200'])
  })
})

describe('écran de PC', () => {
  it('écran, col et socle partagent le même axe', () => {
    const g = geomEcranSurPied(22, 26)
    const c = (r: { x0: number; x1: number }) => (r.x0 + r.x1) / 2
    expect(c(g.ecran)).toBeCloseTo(g.cx)
    expect(c(g.col)).toBeCloseTo(g.cx)
    expect(c(g.socle)).toBeCloseTo(g.cx)
  })
})

describe('statuts', () => {
  it('les anciens symboles sont obsolètes mais non supprimés', () => {
    const ids = new Map(catalogue().map((d) => [d.id, d]))
    for (const id of ['eau.step_bassins', 'elec.variateur', 'elec.box_hai', 'elec.armoire', 'elec.tgbt']) expect(ids.get(id)?.statut).toBe('obsolete')
    expect(ids.get('elec.transformateur')?.statut).toBe('revu')
  })
})

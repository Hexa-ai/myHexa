// Statut qualité des symboles : les obsolètes disparaissent des listes proposées (explorateur, Spotlight, palettes)
// mais restent dessinables, donc un document existant qui les utilise s'affiche toujours.
import { describe, expect, it } from 'vitest'
import { catalogue, construire, dessiner, enregistrer, symbole } from '@/lib/synoptic/iso/lib'
import type { SymboleDef } from '@/lib/synoptic/iso/lib'
import { entrees2d, entreesIso } from '@/lib/synoptic/catalogue-symboles'
import { symbolesVisibles } from '@/lib/synoptic/explorateur'
import { chercher } from '@/lib/synoptic/recherche'
import { estPropose, statutDe, symbolesProposes } from '@/lib/synoptic/statut'
import { vignetteIso } from '@/lib/synoptic/vignette'

const def = (id: string, statut?: SymboleDef['statut'], remplacePar?: string): SymboleDef => ({
  id, famille: 'Test qualité', nom: `Zorglub ${id}`, statut, remplacePar, taille: () => [40, 40, 20], dessiner: (b) => { b.box(0, 0, 0, 40, 40, 20) },
})

describe('statut des symboles', () => {
  enregistrer(def('test.q_brouillon'))
  enregistrer(def('test.q_revu', 'revu'))
  enregistrer(def('test.q_valide', 'valide'))
  enregistrer(def('test.q_obsolete', 'obsolete', 'test.q_valide'))
  const ids = (l: { id: string }[]): string[] => l.map((x) => x.id).filter((i) => i.startsWith('test.q_'))
  const opt = { filtre: 'iso' as const, requete: '', favoris: [], recents: [], contexte: 'iso' as const }

  it('un symbole sans statut est un brouillon', () => {
    expect(statutDe(symbole('test.q_brouillon'))).toBe('brouillon')
    expect(statutDe(undefined)).toBe('brouillon')
  })

  it('le catalogue du registre garde les obsolètes (documents existants)', () => {
    expect(ids(catalogue())).toContain('test.q_obsolete')
  })

  it('les obsolètes sont absents de l’explorateur, du Spotlight et des palettes', () => {
    const entrees = [...entreesIso(catalogue()), ...entrees2d()]
    expect(ids(entrees)).toEqual(['test.q_brouillon', 'test.q_revu', 'test.q_valide'])
    expect(ids(symbolesVisibles(entrees, opt))).not.toContain('test.q_obsolete')
    expect(ids(symbolesVisibles(entrees, { ...opt, requete: 'zorglub' }))).not.toContain('test.q_obsolete')
    expect(ids(chercher(entrees, 'zorglub', { contexte: 'iso', portee: 'tout', favoris: [], recents: [], limite: 50 }).map((r) => r.entree))).not.toContain('test.q_obsolete')
    expect(ids(symbolesProposes(catalogue()))).toEqual(['test.q_brouillon', 'test.q_revu', 'test.q_valide'])
  })

  it('les entrées portent leur statut (pastille de l’explorateur)', () => {
    const par = Object.fromEntries(entreesIso(catalogue()).map((e) => [e.id, e.statut]))
    expect(par['test.q_brouillon']).toBe('brouillon')
    expect(par['test.q_revu']).toBe('revu')
    expect(par['test.q_valide']).toBe('valide')
  })

  it('un document existant qui utilise un symbole obsolète s’affiche toujours', () => {
    expect(dessiner('test.q_obsolete').svg).toContain('data-type="test.q_obsolete"')
    const r = construire({ version: 1, composants: [{ id: 'a', type: 'test.q_obsolete', x: 0, y: 0, z: 0 }], liaisons: [] } as never)
    expect(r.scene.toSvg({ css: false })).toContain('data-type="test.q_obsolete"')
    expect(vignetteIso('test.q_obsolete')).toContain('<svg')
  })

  it('option publique : seuls les validés sont proposés (désactivée par défaut)', () => {
    expect(estPropose(symbole('test.q_brouillon'))).toBe(true)
    const pub = { seulementValides: true }
    expect(estPropose(symbole('test.q_brouillon'), pub)).toBe(false)
    expect(estPropose(symbole('test.q_revu'), pub)).toBe(false)
    expect(estPropose(symbole('test.q_valide'), pub)).toBe(true)
    expect(estPropose(symbole('test.q_obsolete'), pub)).toBe(false)
    expect(ids(entreesIso(catalogue(), pub))).toEqual(['test.q_valide'])
  })
})

describe('entrées supplémentaires (préréglages)', () => {
  it('s’ajoutent à la liste sans doublon de clé', async () => {
    const { avecEntreesSupplementaires } = await import('@/lib/synoptic/explorateur')
    const base = entreesIso(catalogue())
    const pre = { ...base[0], cle: 'symbole:iso:preset.x', id: 'preset.x', nom: 'Préréglage', base: base[0].id, params: { dn: 10 } }
    const l = avecEntreesSupplementaires(base, [pre, pre, { ...pre, cle: base[0].cle }])
    expect(l.length).toBe(base.length + 1)
    expect(l[l.length - 1].id).toBe('preset.x')
  })
})

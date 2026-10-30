import { describe, expect, it } from 'vitest'
import { SCHEMA, documentVide, erreurDocument, lireImport } from '@/lib/synoptic/documents'
import { variablesLiees, valeurNumerique, valeursDuStatut } from '@/lib/synoptic/variables'
import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'

describe('documents : format, validation, import / export JSON', () => {
  it('un document vide est valide et porte le schéma', () => {
    const d = documentVide('Essai')
    expect(d.schema).toBe(SCHEMA)
    expect(d.modele.meta?.titre).toBe('Essai')
    expect(erreurDocument(d)).toBeNull()
  })
  it("refuse ce qui n'est pas un synoptique", () => {
    expect(erreurDocument(null)).not.toBeNull()
    expect(erreurDocument({})).not.toBeNull()
    expect(lireImport('pas du json').erreur).toBeTruthy()
    expect(lireImport('{"a":1}').erreur).toBeTruthy()
  })
  it('export → import : aller-retour sans perte', () => {
    const d = documentVide('Aller-retour')
    const r = lireImport(JSON.stringify(d))
    expect(r.erreur).toBeFalsy()
    expect(r.doc).toEqual(d)
  })
  const stemi = homedir() + '/.hermes/cache/scratch/stemi_import.json'
  it.skipIf(!existsSync(stemi))('importe le JSON STEMI du prototype', () => {
    const r = lireImport(readFileSync(stemi, 'utf8'))
    expect(r.erreur).toBeFalsy()
    expect(r.doc!.modele.equipements.length).toBeGreaterThan(20)
    expect(variablesLiees(r.doc!).length).toBeGreaterThan(10)
  })
})

describe('variables liées et valeurs', () => {
  it('liste dédupliquée des variables reliées (emplacements, bandeau)', () => {
    const d = documentVide()
    d.modele.equipements = [
      { id: 'P1', type: 'pompe', slots: { marche: { variable: 'A' }, defaut: { variable: 'B' } } },
      { id: 'P2', type: 'pompe', slots: { marche: { variable: 'A' }, defaut: { variable: null } } },
    ] as never
    expect(variablesLiees(d).sort()).toEqual(['A', 'B'])
  })
  it('valeurNumerique : nombres, booléens, texte numérique, le reste est vide', () => {
    expect(valeurNumerique(3)).toBe(3)
    expect(valeurNumerique(true)).toBe(1)
    expect(valeurNumerique('4.5')).toBe(4.5)
    expect(valeurNumerique('abc')).toBeNull()
    expect(valeurNumerique(null)).toBeNull()
  })
  it('valeursDuStatut : prend les dernières valeurs du statut', () => {
    const v = valeursDuStatut(
      {
        variables: [
          { name: 'A', value: 1 },
          { name: 'B', value: '2' },
          { name: 'C', value: 'x' },
        ],
      },
      ['A', 'B', 'C'],
    )
    expect(v).toEqual({ A: 1, B: 2 })
  })
})

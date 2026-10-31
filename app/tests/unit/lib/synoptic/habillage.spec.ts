// Habillage d'information, liens génériques et symboles « par métier » (iso).
import { describe, expect, it } from 'vitest'
import { docLib, variablesIso, type IsoSection } from '@/lib/synoptic/iso/format'
import { catalogue as catalogueIso, construire } from '@/lib/synoptic/iso/lib'
import { motsClesDe } from '@/lib/synoptic/recherche/mots-cles'

const base = (extra: Record<string, unknown> = {}): IsoSection => ({
  version: 1,
  composants: [{ id: 'c1', type: 'site.chaufferie', x: 0, y: 0, z: 0, slots: { defaut: { variable: 'DEF' } }, ...extra } as never],
  liaisons: [],
})

describe('habillage : rétrocompatibilité', () => {
  it('sans habillage, le document se rend à l’identique (aucune étiquette ajoutée)', () => {
    const d = docLib(base(), { DEF: 0 })
    expect(d.etiquettes ?? []).toEqual([])
    expect(JSON.stringify(docLib(base(), { DEF: 0 }))).toBe(JSON.stringify(d))
  })
  it('« rien » : aucune variable lue', () => {
    expect(variablesIso(base({ habillage: { niveau: 'rien' } }))).toEqual(['DEF'])
    expect(docLib(base({ habillage: { niveau: 'rien' } }), { DEF: 0 }).etiquettes ?? []).toEqual([])
  })
  it('« voyant » : la variable de défaut passe l’état en défaut et pose une pastille', () => {
    const iso = base({ slots: undefined, habillage: { niveau: 'voyant', voyant: { defaut: { variable: 'D2' } } } })
    expect(variablesIso(iso)).toEqual(['D2'])
    const d = docLib(iso, { D2: 1 })
    expect(d.composants[0].etat).toBe('defaut')
    expect(d.etiquettes?.[0].valeur).toBe('! Défaut')
  })
  it('« mesures » : jusqu’à 4 valeurs avec libellé et unité', () => {
    const m = (v: string) => ({ slot: { variable: v }, libelle: v, unite: 'u' })
    const iso = base({ slots: undefined, habillage: { niveau: 'mesures', mesures: ['A', 'B', 'C', 'D', 'E'].map(m) } })
    const d = docLib(iso, { A: 1, B: 2, C: 3, D: 4, E: 5 })
    expect(d.etiquettes?.length).toBe(4)
    expect(d.etiquettes?.[1]).toMatchObject({ nom: 'B', valeur: '2', unite: 'u' })
  })
  it('« carte » : titre, état et mesures', () => {
    const iso = base({ habillage: { niveau: 'carte', carte: { titre: 'Chaufferie', lien: 'x' }, mesures: [{ slot: { variable: 'T' }, libelle: 'T', unite: '°C' }] } })
    const d = docLib(iso, { DEF: 0, T: 70 })
    expect(d.etiquettes?.[0].nom).toBe('Chaufferie')
    expect(d.etiquettes?.[0].unite).toBe('↗')
    expect(d.etiquettes?.[1].valeur).toBe('70')
  })
})

describe('liens génériques', () => {
  const iso = (style: string, etat?: string): IsoSection => ({
    version: 1,
    composants: [
      { id: 'a', type: 'site.batiment', x: 0, y: 0, z: 0 },
      { id: 'b', type: 'site.bureaux', x: 300, y: 0, z: 0 },
    ] as never,
    liaisons: [{ id: 'l1', de: { c: 'a', port: 'x+' }, vers: { c: 'b', port: 'x-' }, lien: { style }, ...(etat ? { etat } : {}) }] as never,
  })
  for (const style of ['reseau', 'cable', 'chaleur', 'radio', 'flux'])
    it(`style ${style} : tracé sans avertissement`, () => {
      const r = construire(docLib(iso(style), {}))
      expect(r.avertissements).toEqual([])
      expect(r.liaisons.l1.ok).toBe(true)
      expect(r.scene.toSvg({ css: false })).toContain('data-lien="l1"')
    })
  it('un lien en défaut est rouge', () => {
    expect(construire(docLib(iso('reseau', 'defaut'), {})).scene.toSvg({ css: false })).toContain('#e5484d')
  })
})

describe('symboles par métier', () => {
  const metiers = catalogueIso().filter((s: { id: string }) => /^(conteneur|vehicule|batiment|reseau|armoire|energie|exterieur|eau)\./.test(s.id))
  it('les nouvelles familles sont enregistrées', () => {
    expect(metiers.length).toBeGreaterThanOrEqual(55)
  })
  it('chacun se dessine dans tous les états sans erreur et porte un mot-clé anglais', () => {
    for (const s of metiers) {
      for (const etat of ['arret', 'marche', 'defaut']) {
        const r = construire({ version: 1, composants: [{ id: 'x', type: s.id, x: 0, y: 0, z: 0, etat }], liaisons: [] } as never)
        expect(r.scene.toSvg({ css: false }).length, s.id).toBeGreaterThan(200)
      }
      expect(motsClesDe(s.id).en.length, `mots-clés anglais : ${s.id}`).toBeGreaterThan(0)
    }
  })
  it('le logo n’accepte que https / data:image (pas de script)', () => {
    const rendu = (logo: string) => construire({ version: 1, composants: [{ id: 'x', type: 'conteneur.c20', x: 0, y: 0, z: 0, params: { logo } }], liaisons: [] } as never).scene.toSvg({ css: false })
    expect(rendu('https://exemple.fr/l.png')).toContain('<image')
    expect(rendu('javascript:alert(1)')).not.toContain('<image')
    expect(rendu('ACME')).toContain('ACME')
  })
})

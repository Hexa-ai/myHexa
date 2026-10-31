// Contrôles qualité automatiques de la bibliothèque de symboles iso (voir docs/flux/synoptique.md, « Qualité des symboles »).
// Le test n'échoue que sur les ERREURS DURES (exception, port incohérent, texte en miroir…) qui ne figurent pas dans la dette connue ;
// tout le reste (cercles non projetés, pièces hors boîte, mots-clés…) n'est qu'un avertissement : voir `pnpm qualite:symboles`.
import { describe, expect, it } from 'vitest'
import { catalogue, enregistrer } from '@/lib/synoptic/iso/lib'
import type { SymboleDef } from '@/lib/synoptic/iso/lib'
import { analyserCatalogue, analyserSymbole, casDe, erreursDures } from '@/lib/synoptic/iso/qualite/analyse'
import { conserveLesCercles, determinant, elementsSvg, matriceDe } from '@/lib/synoptic/iso/qualite/svg-lite'
import dette from './fixtures/qualite-erreurs-connues.json'

// catalogue réel, avant l'ajout des faux symboles défectueux ci-dessous
const REEL: SymboleDef[] = catalogue()
const connue = (e: { id: string; code: string }): boolean => (dette as string[]).includes(`${e.id}|${e.code}`)

describe('qualité des symboles iso : catalogue réel', () => {
  const rapport = analyserCatalogue(REEL)

  it('chaque symbole se rend dans tous ses états et variantes, sans exception ni taille incohérente', () => {
    expect(rapport.total).toBe(REEL.length)
    const casses = erreursDures(rapport).filter((e) => ['exception', 'taille-invalide', 'svg-nan', 'rendu-vide'].includes(e.code))
    expect(casses).toEqual([])
    // la couverture est réelle : au moins arrêt / marche / défaut par symbole
    expect(rapport.symboles.every((s) => s.nbCas >= 3)).toBe(true)
  })

  it('aucune NOUVELLE erreur dure (port incohérent, texte en miroir…) hors dette connue', () => {
    const nouvelles = erreursDures(rapport).filter((e) => !connue(e))
    expect(nouvelles, nouvelles.map((e) => `${e.id} [${e.code}] ${e.message}`).join('\n')).toEqual([])
  })

  it('la dette connue ne grossit pas (les erreurs corrigées doivent en être retirées)', () => {
    const presentes = new Set(erreursDures(rapport).map((e) => `${e.id}|${e.code}`))
    const corrigees = (dette as string[]).filter((k) => !presentes.has(k))
    // information seulement : une correction ne doit jamais bloquer la CI d'un autre chantier
    if (corrigees.length) console.info(`qualité : ${corrigees.length} erreur(s) connue(s) corrigée(s), à retirer de fixtures/qualite-erreurs-connues.json :`, corrigees.join(', '))
    expect((dette as string[]).length).toBeLessThanOrEqual(40)
  })

  it('noms non vides ; mots-clés FR et EN, doublons de nom : signalés en avertissements (pas d’échec)', () => {
    const codes = new Set(rapport.symboles.flatMap((s) => s.constats.map((c) => c.code)))
    for (const c of codes) expect(typeof c).toBe('string')
    expect(rapport.symboles.every((s) => s.nom.trim().length > 0)).toBe(true)
  })
})

describe('qualité des symboles iso : les contrôles détectent bien les défauts', () => {
  const base = { famille: 'Test', nom: 'Faux', taille: () => [40, 40, 20] as [number, number, number] }
  const faux = (id: string, dessiner: SymboleDef['dessiner']): SymboleDef => {
    const d: SymboleDef = { ...base, id, dessiner }
    enregistrer(d)
    return d
  }
  const codes = (d: SymboleDef, gravite?: string): string[] => analyserSymbole(d).constats.filter((c) => !gravite || c.gravite === gravite).map((c) => c.code)

  it('symbole sain : aucun constat de dessin', () => {
    const d = faux('test.sain', (b) => {
      b.box(0, 0, 0, 40, 40, 20)
      b.port('a', [0, 20, 10], [-1, 0, 0])
      b.port('b', [40, 20, 10], [1, 0, 0])
    })
    expect(codes(d).filter((c) => !c.startsWith('mots-cles'))).toEqual([])
  })

  it('exception au rendu → erreur dure', () => {
    const d = faux('test.exception', () => { throw new Error('boum') })
    expect(codes(d, 'erreur')).toContain('exception')
  })

  it('texte en miroir (plan xz non corrigé) → erreur dure ; texte à l’endroit → rien', () => {
    const miroir = faux('test.miroir', (b) => { const p = b.box(0, 0, 0, 40, 40, 20); b.pl('xz', 40, '<text x="2" y="-4">AB</text>', p) })
    const droit = faux('test.droit', (b) => { const p = b.box(0, 0, 0, 40, 40, 20); b.pl('xy', 20, '<text x="2" y="4">AB</text>', p) })
    expect(codes(miroir, 'erreur')).toContain('texte-miroir')
    expect(codes(droit, 'erreur')).not.toContain('texte-miroir')
  })

  it('port hors de la boîte, direction non unitaire, ports opposés décalés → erreurs dures', () => {
    const hors = faux('test.port_hors', (b) => { b.box(0, 0, 0, 40, 40, 20); b.port('a', [-30, 20, 10], [-1, 0, 0]) })
    const dir = faux('test.port_dir', (b) => { b.box(0, 0, 0, 40, 40, 20); b.port('a', [0, 20, 10], [-2, 0, 0]) })
    const decale = faux('test.port_decale', (b) => {
      b.box(0, 0, 0, 40, 40, 20)
      b.port('a', [0, 20, 10], [-1, 0, 0])
      b.port('b', [40, 26, 10], [1, 0, 0])
    })
    expect(codes(hors, 'erreur')).toContain('port-hors-boite')
    expect(codes(dir, 'erreur')).toContain('port-direction')
    expect(codes(decale, 'erreur')).toContain('port-non-coaxial')
  })

  it('grand décalage voulu (entrée haute / sortie basse) → simple avertissement', () => {
    const d = faux('test.cuve', (b) => {
      b.box(0, 0, 0, 40, 40, 80)
      b.port('e', [0, 20, 70], [-1, 0, 0])
      b.port('s', [40, 20, 10], [1, 0, 0])
    })
    expect(codes(d, 'erreur')).not.toContain('port-non-coaxial')
    expect(codes(d, 'avertissement')).toContain('port-decale')
  })

  it('rond tracé en cercle plat → avertissement « cercle-brut » ; rond dans un plan → rien', () => {
    const plat = faux('test.cercle', (b) => { const p = b.box(0, 0, 0, 40, 40, 20); b.scr([20, 20, 20], p, '<circle class="ed" r="6"/>') })
    const plan = faux('test.rond_plan', (b) => { const p = b.box(0, 0, 0, 40, 40, 20); b.pl('xy', 20, '<circle class="ed" cx="20" cy="20" r="6"/>', p) })
    expect(codes(plat, 'avertissement')).toContain('cercle-brut')
    expect(codes(plat, 'erreur')).toEqual([])
    expect(codes(plan)).not.toContain('cercle-brut')
  })

  it('pièce hors de la boîte taille() → avertissement', () => {
    const d = faux('test.hors', (b) => { b.box(0, 0, 0, 40, 40, 20); b.box(40, 0, 0, 30, 10, 10) })
    expect(codes(d, 'avertissement')).toContain('primitive-hors-boite')
  })

  it('les états et variantes déclarés sont tous essayés', () => {
    const d: SymboleDef = { ...base, id: 'test.var', variantes: ['type=a|b|c'], planche: [['marche'], ['ouvert']], dessiner: (b) => { b.box(0, 0, 0, 40, 40, 20) } }
    const etiquettes = casDe(d).map((c) => c.label)
    expect(etiquettes).toEqual(expect.arrayContaining(['marche', 'ouvert', 'arret', 'defaut', 'arret type=a', 'arret type=c']))
  })
})

describe('lecture SVG minimale', () => {
  it('matrice cumulée, miroir et conservation des cercles', () => {
    const els = elementsSvg('<svg><g transform="matrix(0.87 0.5 0 -1 3 4)"><text x="1">Hé</text><g transform="translate(5 5)"><circle r="2"/></g></g><circle r="1"/></svg>')
    expect(els.map((e) => e.tag)).toEqual(['text', 'circle', 'circle'])
    expect(els[0].texte).toBe('Hé')
    expect(determinant(els[0].mat)).toBeLessThan(0)
    expect(conserveLesCercles(els[1].mat)).toBe(false)
    expect(conserveLesCercles(els[2].mat)).toBe(true)
    expect(conserveLesCercles(matriceDe('rotate(30) scale(2)'))).toBe(true)
    expect(conserveLesCercles(matriceDe('scale(2 1)'))).toBe(false)
  })
})

describe('appliquer_revue : édition du statut dans le source', () => {
  it('pose, remplace et refuse proprement', async () => {
    const { poserStatut, lireExport, statutDeDecision } = await import('@/lib/synoptic/iso/qualite/revue-source')
    const src = "enregistrer({ id: 'a.un', famille: 'X', nom: 'Un', taille: () => [1, 1, 1], dessiner(b) { b.box(0, 0, 0, 1, 1, 1) } })\nenregistrer({\n  id: 'a.deux',\n  famille: 'X',\n  statut: 'revu',\n  nom: 'Deux',\n})\n"
    const r1 = poserStatut(src, 'a.un', 'valide')
    expect(r1.ok && r1.source).toContain("id: 'a.un', statut: 'valide', famille")
    const r2 = poserStatut(src, 'a.deux', 'valide')
    expect(r2.ok && r2.source).toContain("statut: 'valide',\n  nom: 'Deux'")
    expect(r2.ok && r2.source).not.toContain("'revu'")
    const r2b = poserStatut(src, 'a.un', 'valide')
    expect(r2b.ok && r2b.source.match(/statut/g)?.length).toBe(2)
    expect(poserStatut(src, 'zz.absent', 'valide').ok).toBe(false)
    expect(statutDeDecision('a_refaire')).toBe('brouillon')
    expect(() => lireExport('{"schema":"x"}')).toThrow()
    expect(lireExport('{"schema":"myhexa-revue-symboles/1","decisions":{}}').decisions).toEqual({})
  })
})

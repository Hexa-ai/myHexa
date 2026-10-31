import { describe, expect, it } from 'vitest'
import { catalogue } from '@/lib/synoptic/iso/lib'
import { entrees2d, entreesBibliotheques, entreesIso } from '@/lib/synoptic/catalogue-symboles'
import { BIBLIOTHEQUE_EXEMPLE, idSymboleBibliotheque, trouverSymbole } from '@/lib/synoptic/bibliotheque'
import { cleEntree } from '@/lib/synoptic/recherche'
import { basculerFavori, EVT_PREFERENCES, noterRecent } from '@/lib/synoptic/recherche/preferences'
import { poserComposition } from '@/lib/synoptic/iso/edition'
import { isoVide } from '@/lib/synoptic/iso/format'
import {
  NOEUD_BIBLIO, NOEUD_FAMILLES, NOEUD_FAVORIS, NOEUD_RECENTS, NOEUD_TOUT, aplatir, construireArbre, etatsDe, motsClesAffiches, noeudBiblio,
  noeudFamille, selonNoeud, symbolesVisibles, variantesDe, type OptionsExplorateur,
} from '@/lib/synoptic/explorateur'

const mem = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
}
const toutes = () => [...entreesIso(catalogue()), ...entrees2d(), ...entreesBibliotheques([BIBLIOTHEQUE_EXEMPLE])]
const opt = (o: Partial<OptionsExplorateur> = {}): OptionsExplorateur => ({ filtre: 'tout', requete: '', favoris: [], recents: [], contexte: 'iso', ...o })

describe('explorateur : filtres et recherche', () => {
  it('le filtre 2D / Iso / Tout sépare bien les symboles', () => {
    const e = toutes()
    const iso = symbolesVisibles(e, opt({ filtre: 'iso' }))
    const d2 = symbolesVisibles(e, opt({ filtre: '2d' }))
    expect(iso.every((x) => x.contexte === 'iso')).toBe(true)
    expect(d2.every((x) => x.contexte === '2d')).toBe(true)
    expect(symbolesVisibles(e, opt()).length).toBe(iso.length + d2.length)
    expect(d2.length).toBe(entrees2d().length)
  })

  it('la recherche réutilise l’index du Spotlight (français, anglais, accents)', () => {
    const e = toutes()
    const r = symbolesVisibles(e, opt({ requete: 'conteneur' }))
    expect(r.length).toBeGreaterThan(3)
    expect(r.slice(0, 6).some((x) => x.id.startsWith('conteneur.'))).toBe(true)
    expect(symbolesVisibles(e, opt({ requete: 'pump' })).some((x) => x.id.startsWith('pompe.'))).toBe(true)
    expect(symbolesVisibles(e, opt({ requete: 'zzzzqqq' }))).toEqual([])
  })

  it('une requête respecte le filtre', () => {
    const r = symbolesVisibles(toutes(), opt({ requete: 'pompe', filtre: '2d' }))
    expect(r.length).toBeGreaterThan(0)
    expect(r.every((x) => x.contexte === '2d')).toBe(true)
  })
})

describe('explorateur : arbre et compteurs', () => {
  const e = toutes()
  const fav = [cleEntree('symbole', 'iso', 'conteneur.c20'), cleEntree('symbole', '2d', 'pompe')]
  const rec = [cleEntree('symbole', 'iso', 'site.batiment')]
  const o = opt({ favoris: fav, recents: rec })

  it('compte les symboles de chaque nœud', () => {
    const vis = symbolesVisibles(e, o)
    const arbre = construireArbre(vis, o, [{ id: 'exemple', nom: 'Exemple' }])
    const par = (id: string) => aplatir(arbre, new Set([NOEUD_FAMILLES, NOEUD_BIBLIO])).find((n) => n.id === id)
    expect(par(NOEUD_TOUT)?.nombre).toBe(vis.length)
    expect(par(NOEUD_FAVORIS)?.nombre).toBe(2)
    expect(par(NOEUD_RECENTS)?.nombre).toBe(1)
    expect(par(noeudFamille('Conteneurs'))?.nombre).toBe(selonNoeud(vis, noeudFamille('Conteneurs'), o).length)
    expect(par(noeudFamille('Conteneurs'))?.nombre).toBeGreaterThanOrEqual(4)
    expect(par(NOEUD_BIBLIO)?.nombre).toBe(BIBLIOTHEQUE_EXEMPLE.symboles.length)
    expect(par(noeudBiblio('exemple'))?.nombre).toBe(BIBLIOTHEQUE_EXEMPLE.symboles.length)
    // les familles + « Ma bibliothèque » couvrent tout
    expect(par(NOEUD_FAMILLES)!.nombre + par(NOEUD_BIBLIO)!.nombre).toBe(vis.length)
  })

  it('les compteurs suivent la recherche', () => {
    const vis = symbolesVisibles(e, opt({ ...o, requete: 'conteneur' }))
    const arbre = construireArbre(vis, o)
    expect(arbre[0].nombre).toBe(vis.length)
    expect(arbre[1].nombre).toBe(1) // seul conteneur.c20 reste parmi les favoris
    expect(arbre[2].nombre).toBe(0)
  })

  it('favoris et récents suivent l’ordre de leur liste ; un nœud replié cache ses enfants', () => {
    const vis = symbolesVisibles(e, o)
    expect(selonNoeud(vis, NOEUD_FAVORIS, o).map((x) => x.id)).toEqual(['conteneur.c20', 'pompe'])
    const arbre = construireArbre(vis, o)
    expect(aplatir(arbre, new Set()).length).toBe(arbre.length)
    expect(aplatir(arbre, new Set([NOEUD_FAMILLES])).length).toBeGreaterThan(arbre.length)
  })

  it('« Ma bibliothèque » ne se mélange pas aux familles du catalogue', () => {
    const vis = symbolesVisibles(e, opt())
    expect(selonNoeud(vis, NOEUD_FAMILLES, o).some((x) => x.id.startsWith('lib:'))).toBe(false)
    expect(selonNoeud(vis, NOEUD_BIBLIO, o).every((x) => x.id.startsWith('lib:'))).toBe(true)
  })
})

describe('explorateur : détail d’un symbole', () => {
  it('états proposés : ceux des planches, sinon « arrêt »', () => {
    const d = catalogue().find((x) => x.id === 'conteneur.c20')!
    expect(etatsDe(d).map((x) => x.etat)).toEqual(['arret', 'defaut'])
    expect(etatsDe(undefined)).toEqual([{ etat: 'arret', valeurs: {} }])
  })

  it('variantes simples seulement', () => {
    const v = variantesDe({ variantes: ['porte=fermee|ouverte', 'couleur=bleu|rouge', 'portes=2|3', 'texte libre', 'x=1'] })
    expect(v.map((x) => x.cle)).toEqual(['porte', 'couleur', 'portes'])
    expect(v[2].valeurs).toEqual([2, 3])
  })

  it('mots-clés sans doublon ni identifiant', () => {
    const e = entreesIso(catalogue()).find((x) => x.id === 'pompe.centrifuge_h')!
    const m = motsClesAffiches(e)
    expect(m.length).toBeGreaterThan(2)
    expect(new Set(m.map((x) => x.toLowerCase())).size).toBe(m.length)
    expect(m).not.toContain(e.id)
  })
})

describe('explorateur : bibliothèque et préférences', () => {
  it('poser un symbole de bibliothèque pose toutes ses parties avec leurs décalages', () => {
    const iso = isoVide()
    const sym = trouverSymbole([BIBLIOTHEQUE_EXEMPLE], idSymboleBibliotheque('exemple', 'chaufferie_complete'))!
    const ids = poserComposition(iso, sym, 100, 60, { aimant: 20 })
    expect(ids).toHaveLength(2)
    const [a, b] = iso.composants
    expect(b.x - a.x).toBe(12)
    expect(b.y - a.y).toBe(12)
    expect(b.z).toBe(2)
    expect(a.x % 20).toBe(0)
  })

  it('un favori ou un récent prévient les palettes', () => {
    const s = mem()
    let n = 0
    const f = () => n++
    window.addEventListener(EVT_PREFERENCES, f)
    basculerFavori('symbole:iso:a', s)
    noterRecent('symbole:iso:a', s)
    window.removeEventListener(EVT_PREFERENCES, f)
    expect(n).toBe(2)
  })
})

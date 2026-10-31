import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { catalogue } from '@/lib/synoptic/iso/lib'
import { chercher, entreeElement, entreeVariable, type Entree } from '@/lib/synoptic/recherche'
import { normaliser, distance } from '@/lib/synoptic/recherche/texte'
import { motsClesDe } from '@/lib/synoptic/recherche/mots-cles'
import { synonymesDe } from '@/lib/synoptic/recherche/synonymes'
import { basculerFavori, lireFavoris, lireRecents, MAX_RECENTS, noterRecent } from '@/lib/synoptic/recherche/preferences'
import { PALETTE_2D, entrees2d, entreesBibliotheques, entreesIso } from '@/lib/synoptic/catalogue-symboles'
import { BIBLIOTHEQUE_EXEMPLE } from '@/lib/synoptic/bibliotheque'

const iso = entreesIso(catalogue())
const d2 = entrees2d()
const tous: Entree[] = [...iso, ...d2]
const ids = (q: string, o: Partial<Parameters<typeof chercher>[2]> = {}) =>
  chercher(tous, q, { contexte: 'iso', portee: 'contexte', ...o }).map((r) => r.entree.id)

class Mem {
  m = new Map<string, string>()
  getItem(k: string) { return this.m.get(k) ?? null }
  setItem(k: string, v: string) { this.m.set(k, v) }
}

describe('normalisation', () => {
  it('ignore casse, accents et ponctuation', () => {
    expect(normaliser('  Chaudière (H/T) – ÉCS ')).toBe('chaudiere h t ecs')
    expect(normaliser('œuf')).toBe('oeuf')
  })
  it('distance bornée', () => {
    expect(distance('pompe', 'pompes', 2)).toBe(1)
    expect(distance('pompe', 'vanne', 2)).toBeGreaterThan(2)
  })
})

describe('mots-clés couvrants', () => {
  it('chaque symbole iso du catalogue a des mots-clés français ET au moins un mot-clé anglais', () => {
    const sans = catalogue().map((d) => d.id).filter((id) => motsClesDe(id).en.length === 0)
    expect(sans).toEqual([])
    const sansFr = catalogue().map((d) => d.id).filter((id) => motsClesDe(id).fr.length === 0)
    expect(sansFr).toEqual([])
  })
  it('chaque symbole 2D de la palette a au moins un mot-clé anglais', () => {
    expect(PALETTE_2D.map((p) => p.cle).filter((c) => motsClesDe(c).en.length === 0)).toEqual([])
  })
  it('la liste 2D suit la palette du moteur (FAMILLES_PALETTE de moteur.ts)', () => {
    const src = readFileSync('src/lib/synoptic/engine/moteur.ts', 'utf8')
    const bloc = src.slice(src.indexOf('const FAMILLES_PALETTE = ['), src.indexOf('const NOM_PAL'))
    const cles = [...bloc.matchAll(/'([a-z_0-9]+)'/g)].map((m) => m[1]).filter((c) => !['proc', 'cvc', 'chauf', 'mach', 'elec', 'gen'].includes(c))
    expect(PALETTE_2D.map((p) => p.cle).sort()).toEqual(cles.sort())
  })
})

describe('recherche Spotlight', () => {
  it('« pump » et « pompe » trouvent les pompes (bilingue)', () => {
    for (const q of ['pump', 'pompe', 'POMPE', 'Pompé']) {
      const r = ids(q).slice(0, 6)
      expect(r.some((i) => i.startsWith('pompe.')), q).toBe(true)
    }
    expect(ids('pump')[0]).toMatch(/^pompe\./)
  })
  it('insensible aux accents : « chaudiere » = « chaudière »', () => {
    expect(ids('chaudiere')).toContain('chaufferie.chaudiere')
    expect(ids('chaudière')).toContain('chaufferie.chaudiere')
    expect(ids('boiler')).toContain('chaufferie.chaudiere')
  })
  it('synonymes métier', () => {
    expect(ids('transfo')).toEqual(expect.arrayContaining(['elec.transformateur', 'site.poste_transfo']))
    expect(ids('transformer')).toContain('elec.transformateur')
    expect(ids('genset')).toEqual(expect.arrayContaining(['elec.groupe_electrogene', 'site.groupe_container']))
    expect(ids('groupe electrogene')[0]).toMatch(/groupe/)
    expect(ids('tgbt')).toEqual(expect.arrayContaining(['elec.tgbt', 'site.local_tgbt']))
    expect(ids('lv switchboard')).toContain('elec.tgbt')
    expect(ids('check valve')).toEqual(expect.arrayContaining(['vanne.clapet']))
    expect(ids('clapet')).toContain('vanne.clapet')
    expect(ids('bac')).toContain('cuve.verticale')
    expect(ids('tank')).toContain('cuve.verticale')
    expect(ids('v3v')).toContain('vanne.3voies')
    expect(ids('vanne 3 voies')).toContain('vanne.3voies')
    expect(ids('3-way valve')).toContain('vanne.3voies')
    expect(ids('circulator')).toContain('pompe.circulateur')
    expect(ids('heat exchanger')).toEqual(expect.arrayContaining(['traitement.echangeur_plaques']))
    expect(ids('echangeur')).toContain('traitement.echangeur_plaques')
    expect(ids('ahu')).toEqual(expect.arrayContaining(['cta_e.module']))
  })
  it('tolère une faute de frappe', () => {
    expect(ids('pompee')).toContain('pompe.centrifuge_h')
    expect(ids('chaudiare')).toContain('chaufferie.chaudiere')
  })
  it('préfixe en cours de frappe', () => {
    expect(ids('pomp')).toContain('pompe.centrifuge_h')
    expect(ids('trans')).toContain('elec.transformateur')
  })
  it('contexte : l’iso ne renvoie que des symboles iso, la 2D que des 2D, « tout » élargit', () => {
    const iso1 = chercher(tous, 'pompe', { contexte: 'iso', portee: 'contexte' })
    expect(iso1.every((r) => r.entree.contexte === 'iso')).toBe(true)
    const d1 = chercher(tous, 'pompe', { contexte: '2d', portee: 'contexte' })
    expect(d1.length).toBeGreaterThan(0)
    expect(d1.every((r) => r.entree.contexte === '2d')).toBe(true)
    const t = chercher(tous, 'pompe', { contexte: '2d', portee: 'tout', limite: 100 })
    expect(new Set(t.map((r) => r.entree.contexte))).toEqual(new Set(['2d', 'iso']))
    expect(t[0].entree.contexte).toBe('2d') // le contexte courant d’abord
  })
  it('les nouveaux symboles du plan de site se trouvent en français comme en anglais', () => {
    expect(ids('chaufferie')).toContain('site.chaufferie')
    expect(ids('boiler room')).toContain('site.chaufferie')
    expect(ids('sous-station')).toContain('site.sous_station')
    expect(ids('warehouse')).toContain('site.entrepot')
    expect(ids('salle gtb')).toContain('site.salle_gtb')
    expect(ids('ev charging')).toContain('site.parking_irve')
    expect(ids('water tower')).toContain('site.chateau_eau')
    expect(ids('step')).toContain('site.step')
    expect(ids('fence')).toContain('site.cloture')
  })
  it('éléments du synoptique et variables sont trouvés par repère ou nom', () => {
    const el = [entreeElement('iso', 'p1', 'Pompe de reprise', 'pompe.centrifuge_h'), entreeVariable('iso', 'CH1_TEMP_DEP', 'Température départ chaudière', '°C')]
    const r = chercher([...tous, ...el], 'reprise', { contexte: 'iso', portee: 'contexte' })
    expect(r[0].entree.genre).toBe('element')
    expect(chercher([...tous, ...el], 'ch1_temp', { contexte: 'iso', portee: 'contexte' })[0].entree.genre).toBe('variable')
    expect(chercher([...tous, ...el], 'temperature depart', { contexte: 'iso', portee: 'contexte' })[0].entree.id).toBe('CH1_TEMP_DEP')
  })
  it('symboles de bibliothèque importée : trouvés par mot-clé', () => {
    const e = entreesBibliotheques([BIBLIOTHEQUE_EXEMPLE])
    expect(chercher(e, 'sump pump', { contexte: 'iso', portee: 'contexte' })[0].entree.id).toBe('lib:exemple/pompe_relevage')
  })
  it('requête vide : récents puis favoris ; favoris et récents remontent', () => {
    const cleP = iso.find((e) => e.id === 'pompe.immergee')!.cle
    const cleV = iso.find((e) => e.id === 'vanne.clapet')!.cle
    const vide = chercher(tous, '', { contexte: 'iso', portee: 'contexte', recents: [cleV], favoris: [cleP] })
    expect(vide.map((r) => r.entree.cle)).toEqual([cleV, cleP])
    const sans = ids('pompe')
    const avec = chercher(tous, 'pompe', { contexte: 'iso', portee: 'contexte', favoris: [iso.find((e) => e.id === 'pompe.doseuse')!.cle] }).map((r) => r.entree.id)
    expect(avec.indexOf('pompe.doseuse')).toBeLessThanOrEqual(sans.indexOf('pompe.doseuse'))
    expect(avec[0]).toBe('pompe.doseuse')
  })
  it('synonymes : liste bilingue symétrique', () => {
    expect(synonymesDe('pump')).toContain('pompe')
    expect(synonymesDe('pompe')).toContain('pump')
    expect(synonymesDe('xyzzy')).toEqual([])
  })
})

describe('favoris et récents (stockage local)', () => {
  it('bascule un favori, borne les récents, sans doublon', () => {
    const s = new Mem()
    expect(basculerFavori('a', s)).toEqual(['a'])
    expect(basculerFavori('b', s)).toEqual(['a', 'b'])
    expect(basculerFavori('a', s)).toEqual(['b'])
    expect(lireFavoris(s)).toEqual(['b'])
    for (let i = 0; i < MAX_RECENTS + 5; i++) noterRecent('k' + i, s)
    noterRecent('k3', s)
    const r = lireRecents(s)
    expect(r.length).toBe(MAX_RECENTS)
    expect(r[0]).toBe('k3')
    expect(new Set(r).size).toBe(r.length)
  })
  it('un stockage corrompu ou absent ne casse rien', () => {
    const s = new Mem()
    s.setItem('myhexa.synoptique.favoris', '{pas du json')
    expect(lireFavoris(s)).toEqual([])
    expect(lireFavoris(null)).toEqual([])
    expect(basculerFavori('x', null)).toEqual(['x'])
  })
})

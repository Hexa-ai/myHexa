import { describe, expect, it } from 'vitest'
import fixture from './fixtures/iso-station.json'
import { catalogue, construire } from '@/lib/synoptic/iso/lib'
import {
  a2d, aIso, avecIso, docLib, equipementsIso, isoVide, normaliserIso, variablesIso, vueInitiale, vuesDisponibles,
  type IsoSection,
} from '@/lib/synoptic/iso/format'
import { ETAT_ISO_VERS_MOTEUR, ETAT_MOTEUR_VERS_ISO, lireEtat } from '@/lib/synoptic/iso/etats'
import { SLOTS_PAR_FAMILLE, familleIso, estAccessoireIso } from '@/lib/synoptic/iso/familles'
import {
  abscisseCurviligne, ajouterAccessoire, poserComposant, relierPorts, supprimerObjet, tourner,
} from '@/lib/synoptic/iso/edition'
import { auSol, projeter } from '@/lib/synoptic/iso/grille'
import { documentVide, lireImport } from '@/lib/synoptic/documents'
import { variablesLiees } from '@/lib/synoptic/variables'
import { FAMILLE_PICTO_PAR_TYPE_ISO } from '@/lib/synoptic/familles-picto'
import { detailResume } from '@/lib/synoptic/resume'
import type { SynopticDocument } from '@/lib/synoptic/engine/types'

const station = (): IsoSection => normaliserIso(fixture as unknown as IsoSection)
const avecVars = (): IsoSection => {
  const iso = station()
  iso.composants.find((c) => c.id === 'p1')!.slots = { marche: { variable: 'P1_RM' }, defaut: { variable: 'P1_DEF' } }
  iso.composants.find((c) => c.id === 'p1')!.libelle = 'Pompe 1'
  iso.composants.find((c) => c.id === 'haute')!.slots = { niveau: { variable: 'NIV' } }
  iso.composants.find((c) => c.id === 'haute')!.libelle = 'Cuve haute'
  iso.composants.find((c) => c.id === 'haute')!.niveau_max = 4
  iso.liaisons.find((l) => l.id === 'vidange')!.accessoires![0].slots = {
    ouvert: { variable: 'VA_O' },
    ferme: { variable: 'VA_F' },
  }
  iso.liaisons.find((l) => l.id === 'vidange')!.accessoires![0].libelle = 'Vanne vidange'
  return iso
}
const docAvec = (iso?: IsoSection): SynopticDocument => ({ ...documentVide('Test'), ...(iso ? { iso } : {}) })

describe('format iso : rétrocompatibilité', () => {
  it('un document sans iso reste identique (import, variables, vues)', () => {
    const d = documentVide('X')
    expect(d.iso).toBeUndefined()
    expect(avecIso(d)).toBe(d)
    expect(vuesDisponibles(d)).toEqual(['2d'])
    expect(vueInitiale(d)).toBe('2d')
    expect(variablesLiees(d)).toEqual([])
    const r = lireImport(JSON.stringify(d))
    expect('doc' in r && r.doc.iso).toBeUndefined()
  })
  it('l\'import conserve la section iso', () => {
    const r = lireImport(JSON.stringify(docAvec(station())))
    expect('doc' in r && r.doc.iso?.composants.length).toBe(8)
  })
  it('vues disponibles : iso seul, 2D seul, les deux', () => {
    expect(vuesDisponibles(docAvec(station()))).toEqual(['iso'])
    const deux = docAvec(station())
    deux.modele.equipements.push({ id: 'E1', libelle: 'E1', type: 'pompe' } as never)
    expect(vuesDisponibles(deux)).toEqual(['2d', 'iso'])
    expect(a2d(deux)).toBe(true)
    deux.iso!.vue = 'iso'
    expect(vueInitiale(deux)).toBe('iso')
    deux.iso!.vue = '2d'
    expect(vueInitiale(deux)).toBe('2d')
    expect(aIso(docAvec(isoVide()))).toBe(false)
  })
  it('les variables de l\'iso sont comptées dans les variables liées', () => {
    const d = docAvec(avecVars())
    expect(variablesIso(d.iso)).toEqual(['P1_RM', 'P1_DEF', 'NIV', 'VA_O', 'VA_F'])
    expect(variablesLiees(d)).toEqual(['NIV', 'P1_DEF', 'P1_RM', 'VA_F', 'VA_O'])
  })
  it('la section survit à un aller-retour JSON', () => {
    const iso = avecVars()
    expect(JSON.parse(JSON.stringify(iso))).toEqual(iso)
  })
})

describe('routage via le moteur de la bibliothèque', () => {
  it('la scène de référence se construit et trace ses 6 tuyaux', () => {
    const r = construire(docLib(station(), {}))
    expect(Object.keys(r.liaisons)).toHaveLength(6)
    for (const l of Object.values(r.liaisons)) expect(l.pts.length).toBeGreaterThanOrEqual(2)
  })
  it('relier deux ports crée une liaison routée ; déplacer l\'appareil recalcule le tracé', () => {
    const iso = isoVide()
    const a = poserComposant(iso, 'pompe.centrifuge_h', 0, 0, { aimant: 20 })
    const b = poserComposant(iso, 'cuve.verticale', 400, 200, { aimant: 20 })
    const r0 = construire(docLib(iso, {}))
    const pa = r0.rendus[a].ports.find((p) => p.id === 'ref')!
    const pb = r0.rendus[b].ports[0]
    const id = relierPorts(iso, { c: a, port: pa.id }, { c: b, port: pb.id }, r0.rendus[a].port('ref'), r0.rendus[b].port(pb.id))
    const r1 = construire(docLib(iso, {}))
    const avant = JSON.stringify(r1.liaisons[id].pts)
    expect(r1.liaisons[id].pts.length).toBeGreaterThanOrEqual(2)
    iso.composants.find((c) => c.id === b)!.x += 200
    const r2 = construire(docLib(iso, {}))
    expect(JSON.stringify(r2.liaisons[id].pts)).not.toBe(avant)
  })
  it('un accessoire posé sur un tuyau est calé dans son axe', () => {
    const iso = station()
    const a = ajouterAccessoire(iso, 'coll_asp', 'vanne.auto', 0.5)!
    expect(a.s).toBe(0.5)
    const r = construire(docLib(iso, {}))
    const info = r.liaisons.coll_asp.accessoires.find((q) => q.id === a.id)
    expect(info).toBeTruthy()
  })
  it('poser aimante au pas ; R fait un quart de tour ; supprimer retire les tuyaux reliés', () => {
    const iso = station()
    const id = poserComposant(iso, 'pompe.centrifuge_h', 133, 87, { aimant: 20 })
    const c = iso.composants.find((q) => q.id === id)!
    expect([c.x, c.y]).toEqual([140, 80])
    tourner(c)
    tourner(c)
    expect(c.rot).toBe(180)
    tourner(c); tourner(c)
    expect(c.rot).toBe(0)
    supprimerObjet(iso, 'c', 'p2')
    expect(iso.liaisons.find((l) => l.id === 'coll_asp')).toBeUndefined()
    expect(iso.liaisons.find((l) => l.id === 'asp1')).toBeUndefined() // piquée sur coll_asp
  })
  it('grille : projection et retour au sol sont inverses', () => {
    const [sx, sy] = projeter(120, 80, 40)
    const [x, y] = auSol(sx, sy, 40)
    expect(x).toBeCloseTo(120)
    expect(y).toBeCloseTo(80)
  })
  it('abscisse curviligne du point le plus proche', () => {
    const s = abscisseCurviligne([[0, 0], [100, 0], [100, 100]], 100, 50)
    expect(s).toBeCloseTo(0.75)
  })
})

describe('états : les 10 états iso sont mappés sur ceux du moteur', () => {
  it('table totale dans les deux sens', () => {
    const iso = Object.keys(ETAT_ISO_VERS_MOTEUR)
    expect(iso.sort()).toEqual(['alarme', 'arret', 'consigne', 'defaut', 'ferme', 'inconnu', 'maintenance', 'marche', 'modulant', 'ouvert'])
    for (const m of Object.values(ETAT_ISO_VERS_MOTEUR)) expect(ETAT_MOTEUR_VERS_ISO).toHaveProperty(m)
  })
  const pompe = { type: 'pompe.centrifuge_h', slots: { marche: { variable: 'M' }, defaut: { variable: 'D' }, vitesse: { variable: 'V' } } }
  it('pompe : marche / arrêt / défaut / modulant / inconnu', () => {
    expect(lireEtat(pompe, { M: 1, D: 0 }).etat).toBe('marche')
    expect(lireEtat(pompe, { M: 0, D: 0 }).etat).toBe('arret')
    expect(lireEtat(pompe, { M: 1, D: 1 }).etat).toBe('defaut')
    expect(lireEtat(pompe, { M: 1, V: 60 })).toMatchObject({ etat: 'modulant', valeurs: { vitesse: 0.6 } })
    expect(lireEtat(pompe, {}).etat).toBe('inconnu')
  })
  it('sans variable : état fixe de l\'éditeur', () => {
    expect(lireEtat({ type: 'pompe.centrifuge_h', etat: 'alarme' }, { M: 1 })).toMatchObject({ etat: 'alarme', lie: false })
  })
  it('vanne : ouvert / fermé / position / règle personnalisée', () => {
    const v = { type: 'vanne.auto', slots: { ouvert: { variable: 'O' }, ferme: { variable: 'F' }, position: { variable: 'P' } } }
    expect(lireEtat(v, { O: 1 }).etat).toBe('ouvert')
    expect(lireEtat(v, { F: 1 }).etat).toBe('ferme')
    expect(lireEtat({ type: 'vanne.auto', slots: { position: { variable: 'P' } } }, { P: 50 }).etat).toBe('modulant')
    expect(lireEtat({ type: 'vanne.auto', slots: { ouvert: { variable: 'O', regle: { op: 'gt', val: 10 } } } }, { O: 12 }).etat).toBe('ouvert')
  })
  it('cuve : niveau en %, mesure : seuils', () => {
    expect(lireEtat({ type: 'cuve.verticale', niveau_max: 4, slots: { niveau: { variable: 'N' } } }, { N: 1 }).valeurs.niveau).toBe(25)
    const m = { type: 'instr.pression', seuils: { haut: 5 }, slots: { valeur: { variable: 'X' } } }
    expect(lireEtat(m, { X: 3 })).toMatchObject({ etat: 'marche', valeurs: { valeur: 3 } })
    expect(lireEtat(m, { X: 7 }).etat).toBe('alarme')
  })
  it('le document de la bibliothèque reçoit l\'état lu et l\'étiquette de valeur', () => {
    const iso = avecVars()
    const dl = docLib(iso, { P1_RM: 1, P1_DEF: 1, NIV: 2 })
    expect(dl.composants.find((c) => c.id === 'p1')!.etat).toBe('defaut')
    expect(dl.composants.find((c) => c.id === 'haute')!.valeurs?.niveau).toBe(50)
    expect(dl.liaisons.find((l) => l.id === 'vidange')!.accessoires![0].etat).toBe('inconnu')
    expect(dl.liaisons.find((l) => l.id === 'vidange')!.accessoires![0]).not.toHaveProperty('slots')
    expect(docLib(iso, { VA_F: 1 }).liaisons.find((l) => l.id === 'vidange')!.accessoires![0].etat).toBe('ferme')
  })
})

describe('familles et catalogue', () => {
  it('chaque symbole du catalogue iso déclare sa famille de pictogrammes', () => {
    const manquants = catalogue().map((d) => d.id).filter((id) => !(id in FAMILLE_PICTO_PAR_TYPE_ISO))
    expect(manquants).toEqual([])
  })
  it('chaque famille a des emplacements ; vannes et capteurs sont posables sur tuyau', () => {
    for (const f of ['pompe', 'vanne', 'cuve', 'mesure', 'autre'] as const) expect(SLOTS_PAR_FAMILLE[f].length).toBeGreaterThan(0)
    expect(familleIso('pompe.centrifuge_h')).toBe('pompe')
    expect(estAccessoireIso('vanne.auto')).toBe(true)
    expect(estAccessoireIso('pompe.centrifuge_h')).toBe(false)
    expect(estAccessoireIso('instr.debitmetre')).toBe(true)
  })
})

describe('résumé mobile alimenté par l\'iso', () => {
  it('les équipements iso reliés apparaissent dans le résumé avec leur état', () => {
    const d = docAvec(avecVars())
    const eq = equipementsIso(d.iso)
    expect(eq.map((e) => e.id)).toEqual(expect.arrayContaining(['p1', 'haute', 'vidange.a0']))
    const r = detailResume(d, { P1_RM: 1, P1_DEF: 0, NIV: 2, VA_O: 1 })
    const noms = JSON.stringify(r)
    expect(noms).toContain('Pompe 1')
    expect(noms).toContain('Cuve haute')
    expect(noms).toContain('Vanne vidange')
  })
  it('un défaut sur une pompe iso remonte en alerte du résumé', () => {
    const d = docAvec(avecVars())
    const r = detailResume(d, { P1_RM: 0, P1_DEF: 1 })
    expect(JSON.stringify(r)).toMatch(/d[ée]faut/i)
  })
  it('sans iso, le résumé est inchangé', () => {
    const d = documentVide('Z')
    expect(detailResume(d, {})).toEqual(detailResume(avecIso(d), {}))
  })
})

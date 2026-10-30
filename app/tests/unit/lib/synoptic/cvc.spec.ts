import { describe, expect, it } from 'vitest'
import * as C from '@/lib/synoptic/engine/cvc-modele'
import G from '@/lib/synoptic/engine/geom'
import { construireResume } from '@/lib/synoptic/resume'
import type { SynopticDocument } from '@/lib/synoptic/engine/types'

const m = (id: string, k: string, extra: Record<string, unknown> = {}) => ({ id, k, ...extra })

const ctaDouble = (): C.ParamsCta => ({
  flux: 'double',
  colonnes: [
    { haut: m('RJ', 'rejet'), bas: m('AN', 'air_neuf') },
    { double: m('RC', 'recup_plaques') },
    { haut: m('VE2', 'ventilateur'), bas: m('BC', 'batterie_chaude') },
    { haut: m('RP', 'reprise'), bas: m('VE1', 'ventilateur') },
    { bas: m('SF', 'soufflage') },
  ],
})

describe('CVC : géométrie du bandeau de CTA', () => {
  it('simple flux : une seule gaine de 160, modules bout à bout', () => {
    const g = C.disposerCta({ flux: 'simple', colonnes: [{ bas: m('A', 'air_neuf') }, { bas: m('B', 'filtre_plan') }, { bas: m('C', 'batterie_chaude') }] })
    expect(g.h).toBe(160)
    expect(g.cellules.map((c) => c.x)).toEqual([0, 60, 120])
    expect(g.w).toBe(180)
  })
  it('double flux : deux étages, module double sur 120 de large', () => {
    const g = C.disposerCta(ctaDouble())
    expect(g.h).toBe(320)
    const rc = g.cellules.find((c) => c.double?.id === 'RC')!
    expect(rc.w).toBe(120)
    // les colonnes se suivent sans trou
    g.cellules.forEach((c, i) => { if (i) expect(c.x).toBe(g.cellules[i - 1].x + g.cellules[i - 1].w) })
    expect(g.w).toBe(g.cellules.reduce((s, c) => s + c.w, 0))
  })
  it('l’air passe de neuf à soufflé après le premier module double, et le haut est repris puis rejeté', () => {
    const g = C.disposerCta(ctaDouble())
    expect(C.airBas(g, g.cellules[0])).toBe('neuf')
    expect(C.airBas(g, g.cellules[2])).toBe('souffle')
    expect(['repris', 'rejete']).toContain(C.airHaut(g, g.cellules[3]))
  })
  it('les ports d’entrée et de sortie sont sur l’axe de la gaine basse', () => {
    const ports = C.portsCvc('cta', ctaDouble())
    expect(ports.in.side).toBe('W')
    expect(ports.out.side).toBe('E')
    expect(ports.in.y).toBe(C.HAUTEUR_ETAGE + C.GAINE.axe)
    expect(ports.p3).toBeTruthy()
  })
  it('le moteur de géométrie reconnaît les types cta et hydro', () => {
    const g = G.mesurer({ id: 'X', type: 'cta', params: ctaDouble(), slots: {} }, {})
    expect(g.cvc).toBe(true)
    expect(g.w).toBe(C.disposerCta(ctaDouble()).w)
  })
})

describe('CVC : hydraulique', () => {
  const hydro = (): C.ParamsHydro => ({
    rangees: [
      { id: 'D1', modules: [m('P1', 'pompe'), m('V1', 'vanne_3v')] },
      { id: 'D2', modules: [m('P2', 'pompe'), m('V2', 'vanne_3v'), m('T', 'sonde_t')] },
    ],
  })
  it('une rangée par départ, pas de 160, marge pour les collecteurs', () => {
    const g = C.disposerHydro(hydro())
    expect(g.h).toBe(320)
    expect(g.marge).toBe(C.MARGE_COLLECTEUR)
    expect(g.rangees.map((r) => r.y)).toEqual([0, 160])
  })
  it('un seul départ : pas de marge', () => {
    expect(C.disposerHydro({ rangees: [{ id: 'D', modules: [m('P', 'pompe')] }] }).marge).toBe(0)
  })
})

describe('CVC : édition des modules', () => {
  it('ajout, déplacement, suppression d’un module de CTA', () => {
    const p: C.ParamsCta = { flux: 'simple', colonnes: [{ bas: m('A', 'air_neuf') }, { bas: m('B', 'filtre_plan') }] }
    const nouveau = C.ajouterModuleCta(p, 'batterie_chaude')
    expect(C.modulesDe('cta', p).map((x) => x.m.id)).toContain(nouveau.id)
    expect(C.deplacerModuleCta(p, nouveau.id, -1)).toBe(true)
    expect(C.modulesDe('cta', p)[1].m.id).toBe(nouveau.id)
    expect(C.supprimerModuleCta(p, nouveau.id)).toBe(true)
    expect(C.modulesDe('cta', p)).toHaveLength(2)
  })
  it('les emplacements suivent les modules (ajout, retrait)', () => {
    const p = ctaDouble()
    const slots: Record<string, Record<string, unknown>> = { 'VE1:marche': { variable: 'X' }, 'ANCIEN:marche': { variable: 'Y' } }
    C.synchroniserSlots('cta', p, slots, () => ({ variable: null }))
    expect(slots['VE1:marche']).toEqual({ variable: 'X' })
    expect(slots['VE1:defaut']).toBeTruthy()
    expect(slots['ANCIEN:marche']).toBeUndefined()
  })
})

describe('CVC : états des modules', () => {
  const lire = (v: Record<string, number>) => (id: string, base: string) => v[`${id}:${base}`]
  it('ventilateur : marche, arrêt, défaut', () => {
    const ve = m('VE1', 'ventilateur')
    expect(C.etatModule(ve, lire({ 'VE1:marche': 1 }))).toBe('marche')
    expect(C.etatModule(ve, lire({ 'VE1:marche': 0 }))).toBe('arret')
    expect(C.etatModule(ve, lire({ 'VE1:marche': 1, 'VE1:defaut': 1 }))).toBe('defaut')
    expect(C.etatModule(ve, lire({}))).toBe('inconnu')
  })
  it('registre : position intermédiaire = modulant', () => {
    expect(C.etatModule(m('R', 'registre'), lire({ 'R:position': 45 }))).toBe('modulant')
  })
  it('étiquette : valeur affichée avec son unité', async () => {
    const { texteValeur } = await import('@/lib/synoptic/engine/cvc-dessin')
    expect(texteValeur('cta', 'temperature', 18.74, (x: number, d: number) => x.toFixed(d))).toContain('°C')
  })
})

describe('CVC : résumé mobile', () => {
  const doc = (): SynopticDocument => {
    const params = ctaDouble()
    const slots: Record<string, { variable: string | null }> = {}
    C.synchroniserSlots('cta', params, slots, () => ({ variable: null }))
    const lie = (nom: string, v: string) => { slots[nom] = { variable: v } }
    lie('VE1:marche', 'V1M'); lie('VE1:frequence', 'V1F'); lie('SF:temperature', 'TS'); lie('VE2:marche', 'V2M'); lie('VE2:defaut', 'V2D')
    lie('BC:sortie_t', 'TBC'); lie('BC:position', 'PBC'); lie('RC:sortie_t', 'TRC')
    return {
      modele: { meta: {}, zones: [{ id: 'Z', titre: 'CTA' }], equipements: [{ id: 'CTA-01', libelle: 'CTA', type: 'cta', zone: 'Z', params, slots }], liaisons: [], bandeau: [] },
      layout: { w: 800, h: 400, noeuds: [{ id: 'CTA-01', x: 10, y: 10, w: 480, h: 320 }] },
    } as unknown as SynopticDocument
  }
  it('cartes Soufflage, Reprise, Récupération, Batteries avec 1 à 3 valeurs', () => {
    const r = construireResume(doc(), { V1M: 1, V1F: 38, TS: 18.5, V2M: 1, V2D: 0, TBC: 30, PBC: 45, TRC: 14 })
    const titres = r.ouvrages.map((o) => o.titre)
    expect(titres).toEqual(expect.arrayContaining(['Soufflage', 'Reprise', 'Récupération', 'Batteries']))
    const souf = r.ouvrages.find((o) => o.titre === 'Soufflage')!
    expect(souf.etat).toBe('marche')
    expect(souf.valeurs.length).toBeGreaterThan(0)
    expect(souf.valeurs.length).toBeLessThanOrEqual(3)
    expect(souf.pictos.some((p) => p.famille === 'ventilateur')).toBe(true)
  })
  it('le ventilateur de reprise est rangé sous « Reprise », pas sous un filtre', () => {
    const r = construireResume(doc(), { V2M: 1 })
    const rep = r.ouvrages.find((o) => o.titre === 'Reprise')!
    expect(rep.pictos.some((p) => p.famille === 'ventilateur')).toBe(true)
  })
  it('les batteries et le récupérateur lisent les températures de leurs ports', () => {
    const r = construireResume(doc(), { TBC: 30, PBC: 45, TRC: 14 })
    expect(r.ouvrages.find((o) => o.titre === 'Batteries')!.valeurs.length).toBeGreaterThan(0)
    expect(r.ouvrages.find((o) => o.titre === 'Récupération')!.valeurs.length).toBeGreaterThan(0)
  })
  it('un défaut de module produit une alarme et marque la carte', () => {
    const r = construireResume(doc(), { V2M: 1, V2D: 1 })
    expect(r.alarmes.length).toBeGreaterThan(0)
    expect(r.ouvrages.find((o) => o.titre === 'Reprise')!.etat).toBe('defaut')
  })
})

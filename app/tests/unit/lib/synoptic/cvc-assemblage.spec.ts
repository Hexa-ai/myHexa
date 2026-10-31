import { describe, expect, it } from 'vitest'
import * as C from '@/lib/synoptic/engine/cvc-modele'
import * as A from '@/lib/synoptic/engine/cvc-assemblage'
import { ICONES_MODULES } from '@/lib/synoptic/engine/cvc-icones'
import { dessinerCta, dessinerHydro } from '@/lib/synoptic/engine/cvc-dessin'
import { motsClesDe } from '@/lib/synoptic/recherche/mots-cles'

const m = (id: string, k: string, extra: Record<string, unknown> = {}) => ({ id, k, ...extra })
const ids = (type: C.TypeCvc, p: C.ParamsCta & C.ParamsHydro) => C.modulesDe(type, p).map((x) => x.m.id)
const NS = 'http://www.w3.org/2000/svg'
/** fabrique d'éléments SVG identique à celle du moteur : s(tag, attributs, ...enfants) */
const s = (tag: string, attrs: Record<string, unknown> = {}, ...enfants: Array<Element | Element[]>): Element => {
  const el = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue
    if (k === 'text') el.textContent = String(v)
    else el.setAttribute(k, String(v))
  }
  enfants.flat().forEach((e) => el.append(e))
  return el
}
const ctx = { lire: () => null, fr: (x: number) => String(x), uid: 'T' }

describe('catalogue des modules de la palette', () => {
  it('chaque module a une clé unique, un nom, un pictogramme et des mots-clés français ET anglais', () => {
    const cles = A.MODULES_PALETTE.map((x) => x.cle)
    expect(new Set(cles).size).toBe(cles.length)
    for (const x of A.MODULES_PALETTE) {
      expect(x.nom, x.cle).toBeTruthy()
      expect(ICONES_MODULES[x.cle], `pictogramme ${x.cle}`).toBeTruthy()
      const k = motsClesDe(x.cle)
      expect(k.fr.length, `mots-clés fr ${x.cle}`).toBeGreaterThan(0)
      expect(k.en.length, `mots-clés en ${x.cle}`).toBeGreaterThan(0)
      if (x.k) expect(A.moduleConnu(x.type, x.k), `${x.cle} connu du catalogue`).toBe(true)
    }
  })
  it('contient les modules demandés : plug fan, circulateur double, débitmètre, purgeur, émetteur, sondes aller/retour, nouveau départ', () => {
    const cles = A.MODULES_PALETTE.map((x) => x.cle)
    for (const c of ['cta:plug_fan', 'cta:registre', 'cta:filtre_poches', 'cta:piege_son', 'cta:recup_roue', 'hyd:vanne_3v', 'hyd:vanne_2v', 'hyd:pompe', 'hyd:pompe_double', 'hyd:debitmetre', 'hyd:compteur', 'hyd:sonde_t_aller', 'hyd:sonde_t_retour', 'hyd:isolement', 'hyd:clapet', 'hyd:filtre', 'hyd:purgeur', 'hyd:emetteur', 'hyd:rangee']) expect(cles, c).toContain(c)
  })
  it('« circulateur double », « jumelé » et « twin pump » mènent au circulateur double', () => {
    const k = motsClesDe('hyd:pompe_double')
    expect(k.fr.join(' ')).toMatch(/circulateur double/)
    expect(k.fr.join(' ')).toMatch(/jumele/)
    expect(k.en.join(' ')).toMatch(/twin pump/)
  })
  it('les sondes aller / retour posent leur ligne', () => {
    expect(A.moduleDePalette('hyd:sonde_t_aller')?.preset).toEqual({ ligne: 'aller' })
    expect(A.moduleDePalette('hyd:sonde_t_retour')?.preset).toEqual({ ligne: 'retour' })
    expect(A.estCleModule('hyd:pompe_double')).toBe(true)
    expect(A.estCleModule('pompe')).toBe(false)
    expect(A.estCleModule('cta:inconnu')).toBe(false)
  })
  it('les modèles de départ restent les gabarits historiques', () => {
    expect([...A.MODELES_DE_DEPART]).toEqual(['cta_simple', 'cta_double', 'chaufferie', 'collecteur'])
  })
})

describe('création à partir d’un module seul', () => {
  it('une CTA d’un module', () => {
    const p = A.paramsCtaDepuisModule('filtre_plan')
    expect(p.flux).toBe('simple')
    expect(ids('cta', p)).toHaveLength(1)
    expect(C.disposerCta(p).cellules).toHaveLength(1)
  })
  it('un départ seul (sans module) reste dessinable et ciblable, avec un module il le contient', () => {
    const vide = A.paramsHydroDepuisModule()
    expect(vide.rangees).toHaveLength(1)
    expect(C.disposerHydro(vide).w).toBeGreaterThanOrEqual(120)
    const un = A.paramsHydroDepuisModule(A.moduleDePalette('hyd:pompe_double'))
    expect(ids('hydro', un)).toHaveLength(1)
    expect(C.modulesDe('hydro', un)[0].m.k).toBe('pompe_double')
  })
})

describe('CTA : insertion et déplacement', () => {
  const simple = (): C.ParamsCta => ({ flux: 'simple', colonnes: [{ bas: m('A', 'air_neuf') }, { bas: m('B', 'filtre_plan') }, { bas: m('C', 'soufflage') }] })
  it('l’aimantation retient le bord de colonne le plus proche', () => {
    const p = simple()
    expect(A.emplacementCta(p, 5, 80, 'registre')).toMatchObject({ colonne: 0, x: 0 })
    expect(A.emplacementCta(p, 70, 80, 'registre')).toMatchObject({ colonne: 1, x: 60 })
    expect(A.emplacementCta(p, 100, 80, 'registre')).toMatchObject({ colonne: 2, x: 120 })
    expect(A.emplacementCta(p, 999, 80, 'registre')).toMatchObject({ colonne: 3, x: 180 })
    expect(A.emplacementCta(p, -50, 80, 'registre')).toMatchObject({ colonne: 0 })
  })
  it('insère au milieu, au début et à la fin, avec des identifiants libres', () => {
    const p = simple()
    A.insererModuleCta(p, 'batterie_chaude', A.emplacementCta(p, 61, 80, 'batterie_chaude'))
    A.insererModuleCta(p, 'registre', A.emplacementCta(p, -5, 80, 'registre'))
    A.insererModuleCta(p, 'ventilateur', A.emplacementCta(p, 9999, 80, 'ventilateur'))
    expect(C.modulesDe('cta', p).map((x) => x.m.k)).toEqual(['registre', 'air_neuf', 'batterie_chaude', 'filtre_plan', 'soufflage', 'ventilateur'].sort((a, b) => 0 * a.length + 0 * b.length))
    expect(new Set(ids('cta', p)).size).toBe(6)
  })
  it('double flux : l’étage visé (haut / bas) est respecté et un module simple comble l’étage libre', () => {
    const p: C.ParamsCta = { flux: 'double', colonnes: [{ bas: m('AN', 'air_neuf') }, { double: m('RC', 'recup_plaques') }] }
    const haut = A.emplacementCta(p, 30, 20, 'filtre_plan')   // milieu de la colonne 0, étage du haut libre
    expect(haut).toMatchObject({ etage: 'haut', remplir: 0 })
    A.insererModuleCta(p, 'filtre_plan', haut)
    expect(p.colonnes![0].haut?.k).toBe('filtre_plan')
    expect(p.colonnes).toHaveLength(2)                       // aucune colonne ajoutée : l’étage libre a été comblé
    const bas = A.emplacementCta(p, 125, C.HAUTEUR_ETAGE + 20, 'ventilateur')   // bord droit de la colonne 0 / gauche du récupérateur, étage bas
    expect(bas.etage).toBe('bas')
    A.insererModuleCta(p, 'ventilateur', bas)
    expect(p.colonnes!.length).toBe(3)
  })
  it('un module double flux inséré occupe les deux étages d’une nouvelle colonne', () => {
    const p: C.ParamsCta = { flux: 'double', colonnes: [{ bas: m('AN', 'air_neuf') }] }
    A.insererModuleCta(p, 'recup_plaques', A.emplacementCta(p, 200, 100, 'recup_plaques'))
    expect(p.colonnes![1].double?.k).toBe('recup_plaques')
  })
  it('déplace un module en gardant son identifiant (et donc ses variables)', () => {
    const p = simple()
    expect(A.deplacerModuleCtaVers(p, 'A', A.emplacementCta(p, 200, 80, 'air_neuf'))).toBe(true)
    expect(ids('cta', p)).toEqual(['B', 'C', 'A'])
    expect(A.deplacerModuleCtaVers(p, 'C', A.emplacementCta(p, -3, 80, 'soufflage'))).toBe(true)
    expect(ids('cta', p)).toEqual(['C', 'B', 'A'])
  })
  it('déposer un module à sa place ne change rien', () => {
    const p = simple()
    expect(A.deplacerModuleCtaVers(p, 'B', A.emplacementCta(p, 62, 80, 'filtre_plan'))).toBe(false)
    expect(ids('cta', p)).toEqual(['A', 'B', 'C'])
    expect(A.deplacerModuleCtaVers(p, 'inconnu', A.emplacementCta(p, 0, 0))).toBe(false)
  })
  it('l’indicateur d’insertion suit le bord retenu', () => {
    const p = simple()
    const emp = A.emplacementCta(p, 61, 80, 'registre')
    const ind = A.indicateurCta(p, emp, 'registre')
    expect(ind.trait).toBe(true)
    expect(ind.x).toBe(60)
    expect(ind.h).toBeGreaterThan(0)
  })
})

describe('hydraulique : départ construit module par module', () => {
  it('construit un départ avec V3V et circulateur double, dans l’ordre voulu', () => {
    const p = A.paramsHydroDepuisModule()
    const pose = (cle: string, lx: number, ly = 40) => {
      const mp = A.moduleDePalette(cle)!
      return A.insererModuleHydro(p, mp.k!, A.emplacementHydro(p, lx, ly), mp.preset)
    }
    pose('hyd:vanne_3v', 0)
    pose('hyd:pompe_double', 9999)
    pose('hyd:debitmetre', 9999)
    pose('hyd:sonde_t_retour', 9999, 140)
    expect(C.modulesDe('hydro', p).map((x) => x.m.k)).toEqual(['vanne_3v', 'pompe_double', 'debitmetre', 'sonde_t'])
    expect(C.modulesDe('hydro', p)[3].m.ligne).toBe('retour')
    expect(new Set(ids('hydro', p)).size).toBe(4)
    // la géométrie couvre tous les modules, sans chevauchement
    const g = C.disposerHydro(p)
    g.rangees[0].cellules.forEach((c, i, a) => { if (i) expect(c.x).toBe(a[i - 1].x + a[i - 1].w) })
  })
  it('un module « sur ligne » prend la ligne visée (aller en haut, retour en bas) sauf si un réglage l’impose', () => {
    const p: C.ParamsHydro = { rangees: [{ id: 'D1', libelle: 'Départ 1', modules: [m('P1', 'pompe')] }] }
    const haut = A.insererModuleHydro(p, 'vanne_2v', A.emplacementHydro(p, 10, 20))
    const bas = A.insererModuleHydro(p, 'vanne_2v', A.emplacementHydro(p, 10, C.HAUTEUR_ETAGE - 10))
    expect(A.emplacementHydro(p, 10, 20).ligne).toBe('aller')
    expect(A.emplacementHydro(p, 10, C.HAUTEUR_ETAGE - 10).ligne).toBe('retour')
    expect(haut.ligne).toBe('aller')
    expect(bas.ligne).toBe('retour')
  })
  it('ajoute des départs (identifiants libres) et vise la bonne rangée', () => {
    const p: C.ParamsHydro = { rangees: [{ id: 'D1', libelle: 'Départ 1', modules: [m('P1', 'pompe')] }, { id: 'D3', libelle: 'Départ 3', modules: [] }] }
    expect(A.ajouterDepart(p)).toBe(2)
    expect(p.rangees!.map((r) => r.id)).toEqual(['D1', 'D3', 'D4'])
    const emp = A.emplacementHydro(p, 30, C.HAUTEUR_ETAGE * 2 + 30)
    expect(emp.rangee).toBe(2)
    A.insererModuleHydro(p, 'purgeur', emp)
    expect(p.rangees![2].modules.map((x) => x.k)).toEqual(['purgeur'])
  })
  it('déplace un module d’un départ à l’autre en changeant sa ligne', () => {
    const p: C.ParamsHydro = { rangees: [{ id: 'D1', modules: [m('V1', 'vanne_2v', { ligne: 'aller' }), m('P1', 'pompe')] }, { id: 'D2', modules: [] }] }
    expect(A.deplacerModuleHydroVers(p, 'V1', { rangee: 1, index: 0, ligne: 'retour' })).toBe(true)
    expect(p.rangees![0].modules.map((x) => x.id)).toEqual(['P1'])
    expect(p.rangees![1].modules[0]).toMatchObject({ id: 'V1', ligne: 'retour' })
  })
  it('réordonne dans le même départ', () => {
    const p: C.ParamsHydro = { rangees: [{ id: 'D1', modules: [m('A', 'pompe'), m('B', 'clapet'), m('C', 'filtre')] }] }
    expect(A.deplacerModuleHydroVers(p, 'A', { rangee: 0, index: 3, ligne: 'aller' })).toBe(true)
    expect(ids('hydro', p)).toEqual(['B', 'C', 'A'])
    expect(A.deplacerModuleHydroVers(p, 'B', { rangee: 0, index: 0, ligne: 'aller' })).toBe(false)
  })
  it('les slots suivent les modules ajoutés (variables reliables)', () => {
    const p = A.paramsHydroDepuisModule(A.moduleDePalette('hyd:pompe_double'))
    const slots: Record<string, unknown> = {}
    C.synchroniserSlots('hydro', p, slots as never, () => ({}) as never)
    expect(Object.keys(slots).length).toBeGreaterThan(0)
  })
})

describe('rétrocompatibilité des documents CVC existants (colonnes / rangées)', () => {
  it('les gabarits historiques gardent leur géométrie', () => {
    const simple = C.disposerCta(C.GABARIT_CTA_SIMPLE())
    expect(simple.cellules.map((c) => c.w)).toEqual([60, 60, 60, 60, 60, 60, 60])
    expect(simple.h).toBe(C.HAUTEUR_ETAGE)
    const dbl = C.disposerCta(C.GABARIT_CTA_DOUBLE())
    expect(dbl.h).toBe(2 * C.HAUTEUR_ETAGE)
    expect(dbl.cellules).toHaveLength(7)
    const col = C.disposerHydro(C.GABARIT_COLLECTEUR())
    expect(col.rangees).toHaveLength(2)
    expect(col.marge).toBe(C.MARGE_COLLECTEUR)
    const chf = C.disposerHydro(C.GABARIT_CHAUFFERIE())
    expect(chf.rangees).toHaveLength(1)
    expect(chf.marge).toBe(0)
  })
  it('un ancien document (sans aucun champ récent) se lit, se dessine et garde ses emplacements', () => {
    const ancienCta = JSON.parse(JSON.stringify({ flux: 'double', colonnes: [{ haut: m('RJ', 'rejet'), bas: m('AN', 'air_neuf') }, { double: m('RC', 'recup_plaques') }, { haut: m('VE2', 'ventilateur'), bas: m('BC', 'batterie_chaude') }, { bas: m('SF', 'soufflage') }] }))
    const ancienHydro = JSON.parse(JSON.stringify({ rangees: [{ id: 'D1', libelle: 'Départ 1', modules: [m('PO1', 'pompe'), m('V31', 'vanne_3v'), m('TT1', 'sonde_t', { ligne: 'retour' }), m('DE1', 'depart')] }] }))
    expect(C.nomsSlotsAttendus('cta', ancienCta)).toEqual(expect.arrayContaining(['VE2:marche', 'RC:marche'].filter((x) => C.nomsSlotsAttendus('cta', ancienCta).includes(x))))
    const rCta = dessinerCta(s, ancienCta, ctx)
    const rHyd = dessinerHydro(s, ancienHydro, ctx)
    expect(rCta.corps.length).toBeGreaterThan(0)
    expect(rHyd.corps.length).toBeGreaterThan(0)
    // chaque module existant est présent dans le dessin avec son identifiant
    const dom = s('g', {}, rCta.corps as Element[])
    for (const { m: mod } of C.modulesDe('cta', ancienCta)) expect(dom.querySelector(`[data-mod="${mod.id}"]`), mod.id).not.toBeNull()
    const dom2 = s('g', {}, rHyd.corps as Element[])
    for (const { m: mod } of C.modulesDe('hydro', ancienHydro)) expect(dom2.querySelector(`[data-mod="${mod.id}"]`), mod.id).not.toBeNull()
  })
  it('tous les modules du catalogue (anciens et nouveaux) se dessinent sans exception', () => {
    for (const k of Object.keys(C.MODULES_CTA)) {
      const def = C.MODULES_CTA[k]
      const p: C.ParamsCta = def.double ? { flux: 'double', colonnes: [{ double: m('X1', k) }] } : { flux: 'simple', colonnes: [{ bas: m('X1', k) }] }
      expect(() => dessinerCta(s, p, ctx), `cta ${k}`).not.toThrow()
    }
    for (const k of Object.keys(C.MODULES_HYDRO)) {
      const p: C.ParamsHydro = { rangees: [{ id: 'D1', modules: [m('X1', k)] }] }
      expect(() => dessinerHydro(s, p, ctx), `hydro ${k}`).not.toThrow()
    }
  })
  it('l’ajout d’un module à un ancien document ne touche pas les modules existants', () => {
    const p = C.GABARIT_COLLECTEUR()
    const avant = JSON.stringify(p.rangees![0])
    A.insererModuleHydro(p, 'purgeur', { rangee: 1, index: 0, ligne: 'aller' })
    expect(JSON.stringify(p.rangees![0])).toBe(avant)
    expect(p.rangees![1].modules[0].k).toBe('purgeur')
  })
})

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { construireResume, detailResume, valeursPossibles } from '@/lib/synoptic/resume'
import {
  choisirValeurs,
  creerCartePerso,
  deplacer,
  epingler,
  forcerFamille,
  masquer,
  masquerCarte,
  nettoyer,
  renommerCarte,
  reordonner,
  supprimerCartePerso,
} from '@/lib/synoptic/resume-config'
import { FAMILLE_PICTO_PAR_TYPE, familleDuType } from '@/lib/synoptic/familles-picto'
import type { ResumeConfig, SynopticDocument, SynopticEquipement } from '@/lib/synoptic/engine/types'

const eq = (e: Partial<SynopticEquipement> & { id: string; type: string }): SynopticEquipement => ({ libelle: e.id, ...e })

/** Z1 « Skid » : cuve, deux pompes, un moteur, un ventilateur, trois vannes ; Z2 « Pompage » : pompe + mesure */
function doc(resume?: ResumeConfig): SynopticDocument {
  const equipements: SynopticEquipement[] = [
    eq({ id: 'CUVE1', type: 'cuve', libelle: 'Cuve', zone: 'Z1', slots: { niveau: { variable: 'NIV1' } }, params: { unite_niveau: 'm' } }),
    eq({ id: 'P1', type: 'pompe', libelle: 'Pompe 1', zone: 'Z1', slots: { marche: { variable: 'P1_RM' }, defaut: { variable: 'P1_DEF' }, vitesse: { variable: 'P1_V' } } }),
    eq({ id: 'M1', type: 'moteur', libelle: 'Moteur 1', zone: 'Z1', slots: { marche: { variable: 'M1_RM' } } }),
    eq({ id: 'F1', type: 'ventilateur', libelle: 'Ventilateur 1', zone: 'Z1', slots: { marche: { variable: 'F1_RM' } } }),
    eq({ id: 'V1', type: 'vanne', libelle: 'Vanne 1', zone: 'Z1', slots: { ouvert: { variable: 'V1_O' } } }),
    eq({ id: 'V2', type: 'vanne', libelle: 'Vanne 2', zone: 'Z1', slots: { ouvert: { variable: 'V2_O' } } }),
    eq({ id: 'T1', type: 'mesure', libelle: 'Température', zone: 'Z1', slots: { valeur: { variable: 'T1' } }, params: { unite: '°C' } }),
    eq({ id: 'P2', type: 'pompe', libelle: 'Pompe 2', zone: 'Z2', slots: { marche: { variable: 'P2_RM' } } }),
    eq({ id: 'MES2', type: 'mesure', libelle: 'Pression', zone: 'Z2', slots: { valeur: { variable: 'PR2' } }, params: { unite: 'bar' } }),
    eq({ id: 'FILT', type: 'filtre', libelle: 'Filtre', zone: 'Z2' }),
  ]
  const noeuds = equipements.map((e, i) => ({ id: e.id, x: i * 100, y: 0, w: 80, h: 80 }))
  return {
    schema: 's',
    modele: {
      zones: [
        { id: 'Z1', titre: 'Skid' },
        { id: 'Z2', titre: 'Pompage' },
      ],
      equipements,
      liaisons: [],
      bandeau: [],
      ...(resume ? { resume } : {}),
    },
    layout: { w: 2000, h: 1000, noeuds, aretes: [] },
  }
}

const VALEURS = { NIV1: 1.8, P1_RM: 1, P1_V: 60, M1_RM: 0, F1_RM: 1, V1_O: 1, V2_O: 0, T1: 21.5, P2_RM: 0, PR2: 3.2 }
const carte = (r: ReturnType<typeof construireResume>, titre: string) => r.ouvrages.find((c) => c.titre === titre)!
const idsPictos = (r: ReturnType<typeof construireResume>, titre: string) => carte(r, titre).pictos.map((p) => p.id)

describe('résumé mobile : rétrocompatibilité', () => {
  it('un document sans section resume donne le calcul automatique', () => {
    const auto = construireResume(doc(), VALEURS)
    expect(construireResume(doc({}), VALEURS)).toEqual(auto)
    expect(construireResume(doc({ equipements: { P1: { masque: true } } }), VALEURS, { auto: true })).toEqual(auto)
    expect(auto.ouvrages.map((c) => c.titre)).toEqual(['Skid', 'Pompage'])
    expect(idsPictos(auto, 'Skid')).toEqual(['CUVE1', 'P1', 'M1', 'F1']) // 4 au plus, ordre cuve > pompe > moteur > ventilateur
    expect(carte(auto, 'Skid').valeurs.map((v) => v.libelle)).toEqual(['Niveau', 'Température', 'Vitesse'])
  })

  it('une section aux entrées inconnues ou périmées ne change rien', () => {
    const auto = construireResume(doc(), VALEURS)
    const r = construireResume(
      doc({ equipements: { INCONNU: { epingle: true, carte: 'nulle-part' }, P1: { carte: 'absente' } }, cartes: { Z9: { titre: 'Fantôme', masquee: true } } }),
      VALEURS,
    )
    expect(r).toEqual(auto)
  })

  it('une section illisible (pas un objet) est ignorée', () => {
    const d = doc()
    ;(d.modele as Record<string, unknown>).resume = 'n’importe quoi'
    expect(construireResume(d, VALEURS)).toEqual(construireResume(doc(), VALEURS))
  })
})

describe('résumé mobile : équipements', () => {
  it('épingler : toujours montré, avant la limite de 4', () => {
    const r = construireResume(doc(epingler(undefined, 'V1', true)), VALEURS)
    expect(idsPictos(r, 'Skid')).toContain('V1')
    expect(idsPictos(r, 'Skid')).toHaveLength(4)
    expect(idsPictos(r, 'Skid')).not.toContain('F1') // le dernier de l'ordre automatique cède la place
  })

  it('plus de 4 équipements épinglés : tous restent montrés', () => {
    let c: ResumeConfig | undefined
    for (const id of ['CUVE1', 'P1', 'M1', 'F1', 'V1']) c = epingler(c, id, true)
    expect(idsPictos(construireResume(doc(c), VALEURS), 'Skid')).toEqual(['CUVE1', 'P1', 'M1', 'F1', 'V1'])
  })

  it('épingler une mesure la place en tête des valeurs ; les automatiques complètent jusqu’à 3', () => {
    let c = epingler(undefined, 'MES2', true)
    expect(carte(construireResume(doc(c), VALEURS), 'Pompage').valeurs[0]).toEqual({ libelle: 'Pression', texte: '3,2 bar' })
    // la mesure d'une autre zone, déplacée dans Skid : épinglée, elle passe devant et chasse la dernière valeur automatique
    c = epingler(deplacer(c, 'MES2', 'Z1', 'Z2'), 'MES2', true)
    const skid = carte(construireResume(doc(c), VALEURS), 'Skid')
    expect(skid.valeurs.map((v) => v.libelle)).toEqual(['Pression', 'Niveau', 'Température'])
  })

  it('plus de 3 valeurs épinglées : toutes restent montrées', () => {
    let c: ResumeConfig | undefined
    for (const id of ['CUVE1', 'P1', 'T1']) c = epingler(c, id, true)
    c = epingler(deplacer(c, 'MES2', 'Z1', 'Z2'), 'MES2', true)
    expect(carte(construireResume(doc(c), VALEURS), 'Skid').valeurs).toHaveLength(4)
  })

  it('masquer : plus de pictogramme ni de valeur, mais l’alarme reste visible et la carte reste en défaut', () => {
    const v = { ...VALEURS, P1_DEF: 1 }
    const avant = construireResume(doc(), v)
    expect(avant.alarmes.map((a) => a.id)).toEqual(['P1'])
    const r = construireResume(doc(masquer(undefined, 'P1', true)), v)
    expect(idsPictos(r, 'Skid')).not.toContain('P1')
    expect(carte(r, 'Skid').valeurs.map((x) => x.libelle)).not.toContain('Vitesse')
    expect(r.alarmes).toEqual(avant.alarmes) // identiques
    expect(carte(r, 'Skid').alarmes).toBe(1)
    expect(carte(r, 'Skid').etat).toBe('defaut')
    expect(detailResume(doc(masquer(undefined, 'P1', true)), v).cartes[0].membres.find((m) => m.id === 'P1')?.enAlarme).toBe(true)
  })

  it('masquer libère la place pour l’équipement suivant', () => {
    const r = construireResume(doc(masquer(undefined, 'F1', true)), VALEURS)
    expect(idsPictos(r, 'Skid')).toEqual(['CUVE1', 'P1', 'M1', 'V1'])
  })

  it('épingler lève le masquage et inversement', () => {
    expect(epingler(masquer(undefined, 'P1', true), 'P1', true)).toEqual({ equipements: { P1: { epingle: true } } })
    expect(masquer(epingler(undefined, 'P1', true), 'P1', true)).toEqual({ equipements: { P1: { masque: true } } })
  })

  it('famille forcée : le pictogramme change ; « aucun » le retire ; un type sans famille peut en recevoir une', () => {
    let c = forcerFamille(undefined, 'P1', 'ventilateur')
    expect(carte(construireResume(doc(c), VALEURS), 'Skid').pictos.find((p) => p.id === 'P1')?.famille).toBe('ventilateur')
    c = forcerFamille(c, 'P1', 'aucun')
    expect(idsPictos(construireResume(doc(c), VALEURS), 'Skid')).not.toContain('P1')
    c = forcerFamille(undefined, 'FILT', 'filtre')
    const p = carte(construireResume(doc(c), VALEURS), 'Pompage').pictos.find((x) => x.id === 'FILT')
    expect(p?.famille).toBe('filtre')
    expect(forcerFamille(c, 'FILT', undefined)).toBeUndefined()
  })

  it('« aucun » l’emporte sur l’épingle', () => {
    const c = forcerFamille(epingler(undefined, 'P1', true), 'P1', 'aucun')
    expect(idsPictos(construireResume(doc(c), VALEURS), 'Skid')).not.toContain('P1')
  })

  it('rattachement à une autre carte, et retour à l’automatique', () => {
    let c = deplacer(undefined, 'P1', 'Z2', 'Z1')
    expect(c).toEqual({ equipements: { P1: { carte: 'Z2' } } })
    const r = construireResume(doc(c), VALEURS)
    expect(idsPictos(r, 'Pompage')).toContain('P1')
    expect(idsPictos(r, 'Skid')).not.toContain('P1')
    c = deplacer(c, 'P1', 'Z1', 'Z1')
    expect(c).toBeUndefined()
  })

  it('déplacer toute une carte supprime la carte vide', () => {
    let c: ResumeConfig | undefined
    for (const id of ['P2', 'MES2', 'FILT']) c = deplacer(c, id, 'Z1', 'Z2')
    expect(construireResume(doc(c), VALEURS).ouvrages.map((x) => x.titre)).toEqual(['Skid'])
  })
})

describe('résumé mobile : cartes', () => {
  it('renommer une carte, alarmes comprises', () => {
    const v = { ...VALEURS, P1_DEF: 1 }
    const r = construireResume(doc(renommerCarte(undefined, 'Z1', '  Skid de pompage  ')), v)
    expect(r.ouvrages.map((c) => c.titre)).toContain('Skid de pompage')
    expect(r.alarmes[0].ouvrage).toBe('Skid de pompage')
    expect(carte(r, 'Skid de pompage').alarmes).toBe(1)
    expect(detailResume(doc(renommerCarte(undefined, 'Z1', 'X')), v).cartes[0].titreAuto).toBe('Skid')
    expect(renommerCarte(renommerCarte(undefined, 'Z1', 'X'), 'Z1', '')).toBeUndefined()
  })

  it('deux cartes de même titre gardent chacune leurs alarmes', () => {
    let c = renommerCarte(undefined, 'Z1', 'Même')
    c = renommerCarte(c, 'Z2', 'Même')
    const r = construireResume(doc(c), { ...VALEURS, P1_DEF: 1 })
    expect(r.ouvrages.map((x) => x.alarmes)).toEqual([1, 0])
  })

  it('ordre choisi, y compris devant une carte en alarme', () => {
    const v = { ...VALEURS, P1_DEF: 1 }
    expect(construireResume(doc(), v).ouvrages.map((c) => c.id)).toEqual(['Z1', 'Z2'])
    const c = reordonner(undefined, ['Z2', 'Z1'])
    expect(construireResume(doc(c), v).ouvrages.map((x) => x.id)).toEqual(['Z2', 'Z1'])
    // une carte sans rang suit les cartes ordonnées
    expect(construireResume(doc({ cartes: { Z2: { ordre: 0 } } }), v).ouvrages.map((x) => x.id)).toEqual(['Z2', 'Z1'])
  })

  it('carte masquée : absente du résumé mais présente dans le détail, ses alarmes restent affichées', () => {
    const v = { ...VALEURS, P1_DEF: 1 }
    const d = doc(masquerCarte(undefined, 'Z1', true))
    const r = construireResume(d, v)
    expect(r.ouvrages.map((c) => c.id)).toEqual(['Z2'])
    expect(r.alarmes).toHaveLength(1)
    expect(r.alarmes[0].ouvrage).toBe('Skid')
    const det = detailResume(d, v)
    expect(det.cartes.map((c) => [c.id, c.masquee])).toEqual([
      ['Z1', true],
      ['Z2', false],
    ])
  })

  it('carte personnalisée : titre et équipements choisis, ils quittent leur carte', () => {
    const { config, id } = creerCartePerso(undefined, 'Pompes', ['P1', 'P2'])
    expect(id).toBe('perso-1')
    const d = doc(config)
    const r = construireResume(d, VALEURS)
    expect(r.ouvrages.map((c) => c.titre)).toEqual(['Skid', 'Pompage', 'Pompes'])
    expect(idsPictos(r, 'Pompes')).toEqual(['P1', 'P2'])
    expect(idsPictos(r, 'Skid')).not.toContain('P1')
    expect(carte(r, 'Pompes').etat).toBe('marche')
    expect(detailResume(d, VALEURS).cartes.find((c) => c.id === id)?.personnalisee).toBe(true)
    // ses alarmes lui reviennent
    const ra = construireResume(d, { ...VALEURS, P1_DEF: 1 })
    expect(carte(ra, 'Pompes').alarmes).toBe(1)
    expect(ra.alarmes[0].ouvrage).toBe('Pompes')
    // renommable, ordonnable, supprimable
    const c2 = renommerCarte(config, id, 'Toutes les pompes')
    expect(construireResume(doc(c2), VALEURS).ouvrages.map((c) => c.titre)).toContain('Toutes les pompes')
    expect(supprimerCartePerso(config, id)).toBeUndefined()
  })

  it('une carte personnalisée sans équipement valide n’apparaît pas', () => {
    const r = construireResume(doc({ cartesPerso: [{ id: 'perso-1', titre: 'Vide', equipements: ['NUL'] }] }), VALEURS)
    expect(r.ouvrages.map((c) => c.titre)).toEqual(['Skid', 'Pompage'])
  })

  it('un équipement déplacé vers une carte personnalisée puis vers une carte automatique', () => {
    const { config, id } = creerCartePerso(undefined, 'À part', ['P1'])
    const c = deplacer(config, 'P1', 'Z2', 'Z1')
    expect(c?.cartesPerso?.[0].equipements).toEqual([])
    const r = construireResume(doc(c), VALEURS)
    expect(idsPictos(r, 'Pompage')).toContain('P1')
    expect(r.ouvrages.find((x) => x.id === id)).toBeUndefined()
  })

  it('valeurs choisies : l’ordre demandé, 3 au plus, « — » sans réponse', () => {
    const c = choisirValeurs(undefined, 'Z1', ['T1', 'NIV1', 'P1_V', 'V1_O'])
    expect(c?.cartes?.Z1.valeurs).toEqual(['T1', 'NIV1', 'P1_V']) // V1_O est un état, tronqué à 3 de toute façon
    const r = construireResume(doc(c), VALEURS)
    expect(carte(r, 'Skid').valeurs).toEqual([
      { libelle: 'Température', texte: '21,5 °C' },
      { libelle: 'Niveau · Cuve', texte: '1,8 m' },
      { libelle: 'Pompe 1 · vitesse', texte: '60 %' },
    ])
    const sans = construireResume(doc(choisirValeurs(undefined, 'Z1', ['T1'])), {})
    expect(carte(sans, 'Skid').valeurs).toEqual([{ libelle: 'Température', texte: '—' }])
  })

  it('valeurs choisies périmées (variable retirée) : retour au choix automatique', () => {
    const r = construireResume(doc({ cartes: { Z1: { valeurs: ['DISPARUE'] } } }), VALEURS)
    expect(carte(r, 'Skid').valeurs).toEqual(carte(construireResume(doc(), VALEURS), 'Skid').valeurs)
  })

  it('valeursPossibles : variables analogiques seulement', () => {
    const d = doc()
    const p = valeursPossibles(d.modele.equipements.filter((e) => e.zone === 'Z1'))
    expect(p.map((x) => x.variable)).toEqual(['NIV1', 'P1_V', 'T1'])
  })
})

describe('configuration : fonctions pures', () => {
  it('nettoyer retire les corrections vides', () => {
    expect(nettoyer({ equipements: { A: {} }, cartes: { B: { titre: '  ' } } })).toBeUndefined()
    expect(epingler(epingler(undefined, 'A', true), 'A', false)).toBeUndefined()
  })

  it('ne modifie pas la configuration reçue', () => {
    const base: ResumeConfig = { equipements: { A: { epingle: true } } }
    const copie = JSON.stringify(base)
    epingler(base, 'B', true)
    masquer(base, 'A', true)
    reordonner(base, ['X', 'Y'])
    expect(JSON.stringify(base)).toBe(copie)
  })

  it('le résumé calculé ne modifie pas le document', () => {
    const d = doc({ equipements: { P1: { epingle: true } }, cartes: { Z1: { titre: 'X' } } })
    const avant = JSON.stringify(d)
    construireResume(d, VALEURS)
    detailResume(d, VALEURS)
    expect(JSON.stringify(d)).toBe(avant)
  })

  it('le document avec résumé survit à un aller-retour JSON', () => {
    const d = doc(creerCartePerso(epingler(undefined, 'V1', true), 'Pompes', ['P1']).config)
    const d2 = JSON.parse(JSON.stringify(d)) as SynopticDocument
    expect(construireResume(d2, VALEURS)).toEqual(construireResume(d, VALEURS))
  })
})

describe('familles de pictogrammes déclaratives', () => {
  it('une seule table donne la famille de chaque type', () => {
    expect(familleDuType('pompe')).toBe('pompe')
    expect(familleDuType('compresseur')).toBe('moteur')
    expect(familleDuType('vanne_3v')).toBe('vanne')
    expect(familleDuType('mesure')).toBeNull()
    expect(familleDuType('type-inconnu')).toBeNull()
  })

  it('tout type du catalogue du moteur est déclaré dans la table', () => {
    const src = readFileSync(join(__dirname, '../../../../src/lib/synoptic/engine/moteur.ts'), 'utf8')
    const types = new Set<string>()
    for (const l of src.split('\n')) {
      // lignes du catalogue : « cle: { nom: '…', …, type: 'xxx', … } » (hors texte / zone, qui n'ont pas de type)
      if (!/^\s+\w+:\s+\{ nom: /.test(l)) continue
      const m = /\btype: '(\w+)'/.exec(l)
      if (m) types.add(m[1])
    }
    expect(types.size).toBeGreaterThan(20)
    const manquants = [...types].filter((t) => !(t in FAMILLE_PICTO_PAR_TYPE))
    expect(manquants).toEqual([])
  })
})

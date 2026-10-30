import { describe, expect, it } from 'vitest'
import { construireResume, etatEquipement, formaterNombre, pictosDe } from '@/lib/synoptic/resume'
import type { SynopticDocument, SynopticEquipement } from '@/lib/synoptic/engine/types'

const eq = (e: Partial<SynopticEquipement> & { id: string; type: string }): SynopticEquipement => ({
  libelle: e.id,
  ...e,
})

/** deux zones : « Skid » (2 cuves + pompe + niveau) et « Pompage » (1 pompe) ; un agitateur et un voyant sans zone */
function doc(): SynopticDocument {
  const equipements: SynopticEquipement[] = [
    eq({
      id: 'CUVE1',
      type: 'cuve',
      libelle: 'Cuve de floculation',
      zone: 'Z1',
      slots: { niveau: { variable: 'NIV1' } },
      params: { agitateur: 'AG1', unite_niveau: 'm' },
    }),
    eq({ id: 'DEC', type: 'parametre', libelle: 'Décanteur', zone: 'Z1' }),
    eq({
      id: 'AG1',
      type: 'moteur',
      libelle: 'Agitateur',
      slots: { marche: { variable: 'AG1_RM' }, defaut: { variable: 'AG1_DEF' } },
    }),
    eq({
      id: 'MES1',
      type: 'mesure',
      libelle: 'Pression refoulement',
      slots: { valeur: { variable: 'P1' } },
      params: { unite: 'bar', seuils: { haut: 5 } },
    }),
    eq({
      id: 'V1',
      type: 'vanne',
      libelle: 'Vanne 1',
      slots: { ouvert: { variable: 'V1_O' } },
    }),
    eq({
      id: 'V2',
      type: 'vanne',
      libelle: 'Vanne 2',
      slots: { ouvert: { variable: 'V2_O' } },
    }),
    eq({
      id: 'P1',
      type: 'pompe',
      libelle: 'Pompe eau traitée',
      zone: 'Z2',
      slots: { marche: { variable: 'P1_RM' }, vitesse: { variable: 'P1_V' } },
    }),
    eq({
      id: 'LSHH',
      type: 'voyant',
      libelle: 'Niveau très haut',
      slots: { etat: { variable: 'LSHH' } },
      params: { alarme_si: 1, libelle_alarme: 'Décanteur en débordement' },
    }),
    eq({ id: 'T1', type: 'raccord', libelle: 'Entrée', zone: 'Z1' }),
  ]
  const noeud = (id: string, x: number, y: number) => ({ id, x, y, w: 100, h: 100 })
  return {
    schema: 's',
    modele: {
      zones: [
        { id: 'Z1', titre: 'Skid' },
        { id: 'Z2', titre: 'Pompage eau traitée' },
      ],
      equipements,
      liaisons: [],
      bandeau: [
        { id: 'AU', variable: 'AU', alarme_si: 1, libelle: 'Arrêt', libelle_alarme: "Arrêt d'urgence" },
      ],
    },
    layout: {
      w: 2000,
      h: 1000,
      noeuds: [
        noeud('CUVE1', 0, 0),
        noeud('DEC', 500, 0),
        noeud('AG1', 20, 120), // à côté de la cuve
        noeud('MES1', 520, 120), // à côté du décanteur
        noeud('V1', 600, 0),
        noeud('V2', 620, 0),
        noeud('P1', 1500, 0),
        noeud('LSHH', 480, 100),
        noeud('T1', -50, 0),
      ],
      aretes: [],
    },
  }
}

describe('résumé du synoptique (mobile)', () => {
  it('formate les nombres à la française', () => {
    expect(formaterNombre(1.8)).toBe('1,8')
    expect(formaterNombre(12.34)).toBe('12,3')
    expect(formaterNombre(250.4)).toBe('250')
  })

  it('une carte par zone, une zone à plusieurs ouvrages est scindée', () => {
    const r = construireResume(doc(), {})
    const titres = r.ouvrages.map((c) => c.titre).sort()
    expect(titres).toEqual(['Cuve de floculation', 'Décanteur', 'Pompage eau traitée'].sort())
  })

  it("sans aucune valeur : pas d'alarme, états inconnus, pas de valeur", () => {
    const r = construireResume(doc(), {})
    expect(r.alarmes).toEqual([])
    expect(r.ouvrages.every((c) => c.etat === 'inconnu' && c.valeurs.length === 0)).toBe(true)
  })

  it('niveau avec unité, agitateur rattaché à sa cuve, état marche', () => {
    const r = construireResume(doc(), { NIV1: 1.8, AG1_RM: 1 })
    const cuve = r.ouvrages.find((c) => c.titre === 'Cuve de floculation')!
    expect(cuve.etat).toBe('marche')
    expect(cuve.valeurs[0]).toEqual({ libelle: 'Niveau', texte: '1,8 m' })
  })

  it("agitateur à l'arrêt : carte à l'arrêt", () => {
    const r = construireResume(doc(), { NIV1: 1, AG1_RM: 0 })
    expect(r.ouvrages.find((c) => c.titre === 'Cuve de floculation')!.etat).toBe('arret')
  })

  it("alarmes : défaut, voyant, seuil de mesure, bandeau — et la carte passe en défaut devant les autres", () => {
    const r = construireResume(doc(), { AG1_DEF: 1, LSHH: 1, P1: 6.2, AU: 1, P1_RM: 1 })
    const textes = r.alarmes.map((a) => a.texte)
    expect(textes).toContain('Défaut agitateur')
    expect(textes).toContain('Décanteur en débordement')
    expect(textes).toContain('Pression refoulement haute')
    expect(textes).toContain("Arrêt d'urgence")
    expect(r.alarmes.find((a) => a.id === 'AU')!.ouvrage).toBeNull()
    const cuve = r.ouvrages.find((c) => c.titre === 'Cuve de floculation')!
    expect(cuve.etat).toBe('defaut')
    expect(cuve.alarmes).toBe(1)
    expect(r.ouvrages[0].alarmes).toBeGreaterThan(0)
    // la pompe, sans alarme, reste en marche
    expect(r.ouvrages.find((c) => c.titre === 'Pompage eau traitée')!.etat).toBe('marche')
  })

  it('valeurs : mesure avec unité, vitesse, vannes ouvertes ; 3 au plus', () => {
    const r = construireResume(doc(), { P1: 3.456, V1_O: 1, V2_O: 0, P1_V: 62, NIV1: 1 })
    const dec = r.ouvrages.find((c) => c.titre === 'Décanteur')!
    expect(dec.valeurs).toEqual([
      { libelle: 'Pression refoulement', texte: '3,46 bar' },
      { libelle: 'Vannes ouvertes', texte: '1 / 2' },
    ])
    const pompe = r.ouvrages.find((c) => c.titre === 'Pompage eau traitée')!
    expect(pompe.valeurs).toEqual([{ libelle: 'Vitesse', texte: '62 %' }])
    expect(r.ouvrages.every((c) => c.valeurs.length <= 3)).toBe(true)
  })

  it("cadre de la carte : boîte englobant ses équipements dans le dessin", () => {
    const r = construireResume(doc(), {})
    const pompe = r.ouvrages.find((c) => c.titre === 'Pompage eau traitée')!
    expect(pompe.cadre).toEqual({ x: 1500, y: 0, w: 100, h: 100 })
    const cuve = r.ouvrages.find((c) => c.titre === 'Cuve de floculation')!
    expect(cuve.cadre).toEqual({ x: 0, y: 0, w: 120, h: 220 })
  })

  it('équipement sans position : rattaché par la variable du niveau, puis par le préfixe du repère', () => {
    const d = doc()
    d.modele.equipements.push(
      // même variable que le niveau de CUVE1, sans nœud dans le dessin
      eq({ id: 'X-PIT-01', type: 'mesure', libelle: 'Niveau capteur', slots: { valeur: { variable: 'NIV1' } }, params: { unite: 'm' } }),
      // préfixe « P1 » = repère de la pompe de Pompage
      eq({ id: 'P1-FIT-01', type: 'mesure', libelle: 'Débit pompe', slots: { valeur: { variable: 'Q1' } }, params: { unite: 'm³/h' } }),
    )
    const r = construireResume(d, { NIV1: 2, Q1: 12 })
    expect(r.ouvrages.find((c) => c.titre === 'Cuve de floculation')!.valeurs).toEqual([
      { libelle: 'Niveau', texte: '2 m' },
    ])
    expect(r.ouvrages.find((c) => c.titre === 'Pompage eau traitée')!.valeurs).toEqual([
      { libelle: 'Débit pompe', texte: '12 m³/h' },
    ])
    // jamais dans la carte de repli quand un rattachement existe
    expect(r.ouvrages.some((c) => c.titre === 'Autres équipements')).toBe(false)
  })

  it('sans zone ni ouvrage : une seule carte « Installation »', () => {
    const d = doc()
    d.modele.zones = []
    d.modele.equipements = d.modele.equipements.filter((e) => ['pompe', 'mesure'].includes(e.type))
    d.modele.equipements.forEach((e) => delete e.zone)
    const r = construireResume(d, { P1_RM: 1 })
    expect(r.ouvrages.map((c) => c.titre)).toEqual(['Installation'])
    expect(r.ouvrages[0].etat).toBe('marche')
  })

  it("état d'un équipement : une valeur absente ne vaut jamais « en marche »", () => {
    const pompe = eq({ id: 'P', type: 'pompe', slots: { marche: { variable: 'M' } } })
    expect(etatEquipement(pompe, {})).toBe('inconnu')
    expect(etatEquipement(pompe, { M: 0 })).toBe('arret')
    expect(etatEquipement(pompe, { M: 1 })).toBe('marche')
  })

  it('pictogrammes : cuve en premier, agitateur qui tourne en marche, niveau relatif', () => {
    const r = construireResume(doc(), { NIV1: 1.5, AG1_RM: 1 })
    const cuve = r.ouvrages.find((c) => c.titre === 'Cuve de floculation')!
    expect(cuve.pictos[0].famille).toBe('cuve')
    const ag = cuve.pictos.find((p) => p.id === 'AG1')
    expect(ag?.etat).toBe('marche')
  })

  it('pictogrammes : défaut, inconnu, vanne ouverte, 4 au plus', () => {
    const membres = [
      eq({ id: 'P', type: 'pompe', slots: { marche: { variable: 'P_RM' }, defaut: { variable: 'P_DEF' } } }),
      eq({ id: 'V', type: 'vanne', slots: { etat: { variable: 'V_O' } } }),
      eq({ id: 'M', type: 'moteur' }),
      eq({ id: 'F', type: 'ventilateur' }),
      eq({ id: 'C', type: 'cuve', params: { niveau_max: 4 }, slots: { niveau: { variable: 'N' } } }),
      eq({ id: 'X', type: 'mesure' }),
    ]
    const p = pictosDe(membres, { P_RM: 1, P_DEF: 1, V_O: 1, N: 2 })
    expect(p.map((x) => x.id)).toEqual(['C', 'P', 'M', 'F'])
    expect(p[0].niveau).toBe(0.5)
    expect(p[1].etat).toBe('defaut')
    expect(p[2].etat).toBe('inconnu')
  })
})

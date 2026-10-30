// Résumé lisible d'un synoptique (vue mobile) : alarmes actives + une carte par zone ou ouvrage principal.
// Fonction pure construite depuis le document et les valeurs courantes, sans DOM ni moteur de dessin.
// Les états suivent la même logique que le moteur (engine/moteur.ts) : sans variable reçue, un état reste « inconnu ».
import type { SynopticDocument, SynopticEquipement } from './engine/types'
import { appliquerRegle } from './regles'
import { cartesCvc, estTypeCvc, modulesDe, etatModule, texteAlarmeModule, UNITES_SLOT, type FamillePictoCvc, type ParamsCta, type ParamsHydro } from './engine/cvc-modele'

export type EtatOuvrage = 'marche' | 'arret' | 'defaut' | 'ok' | 'inconnu'

export interface ValeurResume {
  libelle: string
  /** valeur déjà formatée, unité comprise (ex. « 1,8 m ») */
  texte: string
}

export interface AlarmeResume {
  id: string
  texte: string
  /** titre de la carte concernée (null = alarme générale du bandeau) */
  ouvrage: string | null
}

/** zone du dessin (unités du dessin) sur laquelle cadrer la vue plein écran */
export interface CadreDessin {
  x: number
  y: number
  w: number
  h: number
}

/** famille de pictogramme affichable dans une carte */
export type FamillePicto = 'pompe' | 'moteur' | 'ventilateur' | 'vanne' | 'cuve' | FamillePictoCvc
export type EtatPicto = 'marche' | 'arret' | 'defaut' | 'ouvert' | 'ferme' | 'modulant' | 'inconnu'

export interface PictoResume {
  id: string
  famille: FamillePicto
  etat: EtatPicto
  libelle: string
  /** remplissage 0..1 (cuves avec niveau_max connu), sinon null */
  niveau: number | null
}

export interface CarteResume {
  id: string
  titre: string
  etat: EtatOuvrage
  alarmes: number
  /** pictogrammes des équipements principaux (4 au plus, ouvrage d'abord) */
  pictos: PictoResume[]
  /** 1 à 3 valeurs principales */
  valeurs: ValeurResume[]
  cadre: CadreDessin | null
}

export interface ResumeSynoptique {
  alarmes: AlarmeResume[]
  ouvrages: CarteResume[]
}

type Valeurs = Record<string, number>
type EtatEquipement =
  | 'marche'
  | 'arret'
  | 'defaut'
  | 'ouvert'
  | 'ferme'
  | 'alarme'
  | 'info'
  | 'ok'
  | 'inconnu'

const MAX_VALEURS = 3
/** types d'équipements qui deviennent un ouvrage à part entière quand une zone en contient plusieurs */
const TYPES_OUVRAGE = ['cuve', 'parametre', 'silhouette', 'filtre', 'echangeur']
/** équipements qui tournent ou débitent : leur marche/arrêt donne l'état de la carte */
const TYPES_ACTIONNEUR = [
  'pompe',
  'moteur',
  'compresseur',
  'ventilateur',
  'convoyeur',
  'variateur',
  'verin',
]

/** nombre à la française, 2 décimales au plus sous 10, 1 jusqu'à 100, entier au-delà */
export function formaterNombre(x: number): string {
  const a = Math.abs(x)
  const max = a >= 100 ? 0 : a >= 10 ? 1 : 2
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: max }).format(x)
}

const typeEffectif = (e: SynopticEquipement): string =>
  e.type === 'image' ? String(e.type_origine || 'voyant') : e.type

/** valeur d'un emplacement (règle appliquée), undefined si la variable n'a pas répondu */
function lire(e: SynopticEquipement, nom: string, v: Valeurs): number | undefined {
  const sp = e.slots?.[nom]
  if (!sp?.variable) return undefined
  return appliquerRegle(sp, nom, v[sp.variable])
}

/** état d'affichage d'un équipement (même logique que le moteur de dessin) */
export function etatEquipement(e: SynopticEquipement, v: Valeurs): EtatEquipement {
  let t = typeEffectif(e)
  const comportement = e.comportement as string | undefined
  if (t === 'silhouette' && comportement) {
    if (comportement === 'libre') return etatLibre(e, v)
    if (comportement === 'cuve') return 'ok'
    t = comportement
  }
  const defaut = lire(e, 'defaut', v) === 1
  if (['pompe', 'moteur', 'compresseur', 'ventilateur', 'convoyeur', 'variateur'].includes(t)) {
    if (defaut) return 'defaut'
    const m = lire(e, 'marche', v)
    return m === 1 ? 'marche' : m === 0 ? 'arret' : 'inconnu'
  }
  if (['vanne', 'vanne_reg', 'vanne_man', 'vanne_3v'].includes(t)) {
    if (defaut) return 'defaut'
    if (lire(e, 'ferme', v) === 1) return 'ferme'
    if (lire(e, 'ouvert', v) === 1) return 'ouvert'
    const p = lire(e, 'position', v)
    if (p != null) return p > 2 ? 'ouvert' : 'ferme'
    const o = lire(e, 'ouvert', v)
    return o === 0 ? 'ferme' : t === 'vanne_man' ? 'ok' : 'inconnu'
  }
  if (t === 'verin') {
    if (defaut) return 'defaut'
    if (lire(e, 'sorti', v) === 1) return 'marche'
    return lire(e, 'rentre', v) === 1 ? 'arret' : 'inconnu'
  }
  if (t === 'disjoncteur') {
    if (lire(e, 'declenche', v) === 1) return 'defaut'
    const f = lire(e, 'ferme', v)
    return f === 1 ? 'marche' : f === 0 ? 'arret' : 'inconnu'
  }
  if (t === 'filtre') return defaut ? 'defaut' : lire(e, 'colmatage', v) === 1 ? 'alarme' : 'ok'
  if (t === 'clapet' || t === 'echangeur' || t === 'transformateur') return defaut ? 'defaut' : 'ok'
  if (t === 'voyant') {
    const x = lire(e, 'etat', v)
    const al = (e.params as { alarme_si?: number } | undefined)?.alarme_si
    if (x == null) return 'inconnu'
    return al != null && x === al ? 'alarme' : al == null && x === 1 ? 'info' : 'ok'
  }
  if (t === 'mesure') {
    const x = lire(e, 'valeur', v)
    if (x == null) return 'inconnu'
    const sz = (e.params as { seuils?: { haut?: number; bas?: number } } | undefined)?.seuils
    const hors = sz && ((sz.haut != null && x > sz.haut) || (sz.bas != null && x < sz.bas))
    return hors ? 'alarme' : 'ok'
  }
  return 'ok'
}

/** symbole de l'entreprise à états nommés : défaut > état actif > rien d'actif > inconnu */
function etatLibre(e: SynopticEquipement, v: Valeurs): EtatEquipement {
  const defs = (e.etats as Array<{ cle: string; defaut?: boolean }> | undefined) ?? []
  let relie = 0
  let actif = false
  for (const d of defs) {
    const x = lire(e, d.cle, v)
    if (x == null) continue
    relie++
    if (x === 1) {
      if (d.defaut) return 'defaut'
      actif = true
    }
  }
  return actif ? 'marche' : relie ? 'arret' : 'inconnu'
}

/** texte d'une alarme (mêmes libellés que la liste d'alarmes du moteur) */
function texteAlarme(e: SynopticEquipement, etat: EtatEquipement): string {
  if (etat === 'defaut') return 'Défaut ' + e.libelle.toLowerCase()
  const p = (e.params ?? {}) as { libelle_alarme?: string; seuils?: { haut?: number } }
  if (e.type === 'mesure' && p.seuils?.haut != null) return e.libelle + ' haute'
  return p.libelle_alarme || e.libelle
}

interface Position {
  x: number
  y: number
  w: number
  h: number
}

interface Groupe {
  id: string
  titre: string
  membres: SynopticEquipement[]
}

const centre = (p: Position) => ({ x: p.x + p.w / 2, y: p.y + p.h / 2 })

/** construit le résumé : alarmes actives puis cartes (les cartes en alarme d'abord) */
export function construireResume(doc: SynopticDocument, values: Valeurs): ResumeSynoptique {
  const modele = doc.modele
  const tous = (modele.equipements ?? []).filter((e) => e.type !== 'raccord')
  const equipementsCvc = tous.filter((e) => estTypeCvc(e.type))
  const equipements = tous.filter((e) => !estTypeCvc(e.type))
  const positions = new Map<string, Position>()
  for (const n of doc.layout?.noeuds ?? []) {
    positions.set(n.id, { x: n.x, y: n.y, w: Number(n.w) || 0, h: Number(n.h) || 0 })
  }
  const distance = (a: SynopticEquipement, b: SynopticEquipement): number => {
    const pa = positions.get(a.id)
    const pb = positions.get(b.id)
    if (!pa || !pb) return Number.POSITIVE_INFINITY
    const ca = centre(pa)
    const cb = centre(pb)
    return Math.hypot(ca.x - cb.x, ca.y - cb.y)
  }
  const groupes = formerGroupes(modele.zones ?? [], equipements, distance)

  // alarmes : un équipement en alarme ou en défaut, puis les voyants du bandeau
  const titreDe = new Map<string, string>()
  for (const g of groupes) for (const e of g.membres) titreDe.set(e.id, g.titre)
  const alarmes: AlarmeResume[] = []
  for (const e of equipements) {
    const etat = etatEquipement(e, values)
    if (etat === 'alarme' || etat === 'defaut') {
      alarmes.push({ id: e.id, texte: texteAlarme(e, etat), ouvrage: titreDe.get(e.id) ?? null })
    }
  }
  for (const b of modele.bandeau ?? []) {
    const alarmeSi = (b as { alarme_si?: number | null }).alarme_si
    const x = b.variable ? values[b.variable] : undefined
    if (alarmeSi != null && x === alarmeSi) {
      const libelle = String((b as { libelle_alarme?: string }).libelle_alarme || b.libelle || b.id)
      alarmes.push({ id: String(b.id), texte: libelle, ouvrage: null })
    }
  }

  const cartes = groupes.map((g) => carte(g, values, positions, alarmes))
  for (const e of equipementsCvc) cartes.push(...cartesElementCvc(e, values, positions, alarmes))
  // les cartes en alarme passent devant ; l'ordre du document est conservé sinon
  cartes.sort((a, b) => Number(b.alarmes > 0) - Number(a.alarmes > 0))
  return { alarmes, ouvrages: cartes }
}

/** cartes d'un bandeau CTA ou d'une ligne hydraulique : une carte par fonction (soufflage, reprise, récupération, batteries, départs…) */
function cartesElementCvc(
  e: SynopticEquipement,
  v: Valeurs,
  positions: Map<string, Position>,
  alarmes: AlarmeResume[],
): CarteResume[] {
  const type = e.type as 'cta' | 'hydro'
  const params = e.params as (ParamsCta & ParamsHydro) | undefined
  const lecteur = (idModule: string, base: string) => lire(e, `${idModule}:${base}`, v)
  const p = positions.get(e.id)
  const cadre: CadreDessin | null = p ? { x: p.x, y: p.y, w: p.w, h: p.h } : null
  const cartes = cartesCvc(type, params, lecteur, e.libelle)
  // sans aucune valeur reçue, une carte reste « inconnu » (pas de « marche » inventée)
  return cartes.map((c) => {
    const titreAlarme = c.titre
    for (const m of modulesDe(type, params).filter(({ m: mod }) => c.modules.includes(mod.id))) {
      if (etatModule(m.m, lecteur) === 'defaut') alarmes.push({ id: `${e.id}:${m.m.id}`, texte: texteAlarmeModule(m.m, type, lecteur), ouvrage: titreAlarme })
    }
    return {
      id: c.id,
      titre: c.titre,
      etat: c.etat === 'ok' ? 'ok' : c.etat,
      alarmes: c.defauts.length,
      pictos: c.pictos.map((q) => ({ id: q.id, famille: q.famille, etat: q.etat === 'ok' ? 'inconnu' : (q.etat as EtatPicto), libelle: q.libelle, niveau: null })),
      valeurs: c.valeurs.map((x) => ({ libelle: x.libelle, texte: `${formaterNombre(x.valeur)}${UNITES_SLOT[x.base] ? ' ' + UNITES_SLOT[x.base] : ''}` })),
      cadre,
    }
  })
}

/** regroupe les équipements : une carte par zone ; une zone qui contient plusieurs ouvrages est scindée par ouvrage */
function formerGroupes(
  zones: Array<Record<string, unknown>>,
  equipements: SynopticEquipement[],
  distance: (a: SynopticEquipement, b: SynopticEquipement) => number,
): Groupe[] {
  const estOuvrage = (e: SynopticEquipement) => TYPES_OUVRAGE.includes(e.type)
  const groupes: Groupe[] = []
  const parEquipement = new Map<string, Groupe>()
  const ajouter = (g: Groupe, e: SynopticEquipement) => {
    g.membres.push(e)
    parEquipement.set(e.id, g)
  }

  const idsZones = zones.map((z) => String(z.id))
  for (const e of equipements) if (e.zone && !idsZones.includes(String(e.zone))) idsZones.push(String(e.zone))
  const titreZone = (id: string) => String(zones.find((z) => z.id === id)?.titre ?? id)

  for (const id of idsZones) {
    const dansZone = equipements.filter((e) => e.zone === id)
    if (!dansZone.length) continue
    const ouvrages = dansZone.filter(estOuvrage)
    if (ouvrages.length < 2) {
      const g: Groupe = { id, titre: titreZone(id), membres: [] }
      groupes.push(g)
      dansZone.forEach((e) => ajouter(g, e))
      continue
    }
    const gs = ouvrages.map((o) => ({ id: o.id, titre: o.libelle, membres: [] as SynopticEquipement[] }))
    gs.forEach((g, i) => ajouter(g, ouvrages[i]))
    for (const e of dansZone.filter((q) => !estOuvrage(q))) ajouter(plusProche(e, ouvrages, gs, distance), e)
    groupes.push(...gs)
  }

  // sans aucune zone : un ouvrage = une carte ; sans ouvrage non plus : une carte « Installation »
  if (!groupes.length) {
    for (const o of equipements.filter(estOuvrage)) {
      const g: Groupe = { id: o.id, titre: o.libelle, membres: [] }
      groupes.push(g)
      ajouter(g, o)
    }
    if (!groupes.length) groupes.push({ id: '_installation', titre: 'Installation', membres: [] })
  }

  // équipements sans zone, du plus sûr au moins sûr : l'agitateur d'un ouvrage le suit ; une mesure de la même variable que le
  // niveau d'un ouvrage lui appartient ; sinon le préfixe de repère (« CF-PIT-01 » → « CF-RV-01 ») puis la proximité sur le dessin
  const places = equipements.filter((e) => parEquipement.has(e.id))
  const prefixe = (e: SynopticEquipement) => e.id.split('-')[0]
  const variableNiveau = (e: SynopticEquipement) => e.slots?.niveau?.variable
  let autres: Groupe | null = null
  for (const e of equipements.filter((q) => !parEquipement.has(q.id))) {
    const proprietaire = places.find((o) => (o.params as { agitateur?: string } | undefined)?.agitateur === e.id)
    const memeVariable = places.find((o) => {
      const vn = variableNiveau(o)
      return !!vn && Object.values(e.slots ?? {}).some((sp) => sp?.variable === vn)
    })
    const memePrefixe = places.filter((o) => prefixe(o) === prefixe(e))
    const voisins = memePrefixe.length ? memePrefixe : places
    const ref = proprietaire ?? memeVariable
    let g: Groupe | undefined = ref ? parEquipement.get(ref.id) : undefined
    if (!g && voisins.length) {
      const proche = plusProche(e, voisins, voisins.map((o) => parEquipement.get(o.id)!), distance)
      if (memePrefixe.length || positionConnue(e, distance, voisins)) g = proche
    }
    if (!g) g = places.length ? (autres ??= creerAutres(groupes)) : groupes[0]
    ajouter(g, e)
  }
  return groupes.filter((g) => g.membres.length)
}

/** vrai si la position de l'équipement est connue (distance finie à au moins un voisin) */
const positionConnue = (
  e: SynopticEquipement,
  distance: (a: SynopticEquipement, b: SynopticEquipement) => number,
  voisins: SynopticEquipement[],
) => voisins.some((o) => Number.isFinite(distance(e, o)))

/** carte de repli pour les équipements qu'on ne sait rattacher à rien */
function creerAutres(groupes: Groupe[]): Groupe {
  const g: Groupe = { id: '_autres', titre: 'Autres équipements', membres: [] }
  groupes.push(g)
  return g
}

function plusProche(
  e: SynopticEquipement,
  candidats: SynopticEquipement[],
  groupesDesCandidats: Groupe[],
  distance: (a: SynopticEquipement, b: SynopticEquipement) => number,
  defaut: Groupe = groupesDesCandidats[0],
): Groupe {
  let meilleur = defaut
  let dmin = Number.POSITIVE_INFINITY
  candidats.forEach((c, i) => {
    const d = distance(e, c)
    if (d < dmin) {
      dmin = d
      meilleur = groupesDesCandidats[i]
    }
  })
  return meilleur
}

function carte(
  g: Groupe,
  v: Valeurs,
  positions: Map<string, Position>,
  alarmes: AlarmeResume[],
): CarteResume {
  const nbAlarmes = alarmes.filter((a) => a.ouvrage === g.titre).length
  const etats = g.membres.map((e) => etatEquipement(e, v))
  const actionneurs = g.membres.filter((e) => TYPES_ACTIONNEUR.includes(typeEffectif(e)))
  const etatsActionneurs = actionneurs.map((e) => etatEquipement(e, v))
  const aDesDonnees = g.membres.some((e) =>
    Object.values(e.slots ?? {}).some((sp) => sp?.variable && v[sp.variable] !== undefined),
  )
  let etat: EtatOuvrage = 'inconnu'
  if (nbAlarmes > 0) etat = 'defaut'
  else if (etatsActionneurs.includes('marche')) etat = 'marche'
  else if (etatsActionneurs.includes('arret')) etat = 'arret'
  else if (aDesDonnees && etats.some((s) => s !== 'inconnu')) etat = 'ok'

  const cadres = g.membres.map((e) => positions.get(e.id)).filter((p): p is Position => !!p)
  let cadre: CadreDessin | null = null
  if (cadres.length) {
    const x0 = Math.min(...cadres.map((p) => p.x))
    const y0 = Math.min(...cadres.map((p) => p.y))
    const x1 = Math.max(...cadres.map((p) => p.x + p.w))
    const y1 = Math.max(...cadres.map((p) => p.y + p.h))
    cadre = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
  }
  return {
    id: g.id,
    titre: g.titre,
    etat,
    alarmes: nbAlarmes,
    valeurs: valeursPrincipales(g.membres, v),
    pictos: pictosDe(g.membres, v),
    cadre,
  }
}

const MAX_PICTOS = 4
const FAMILLE: Record<string, FamillePicto> = {
  pompe: 'pompe',
  moteur: 'moteur',
  compresseur: 'moteur',
  convoyeur: 'moteur',
  variateur: 'moteur',
  ventilateur: 'ventilateur',
  vanne: 'vanne',
  vanne_reg: 'vanne',
  vanne_man: 'vanne',
  vanne_3v: 'vanne',
  cuve: 'cuve',
}
/** ordre d'affichage : l'ouvrage, puis ce qui tourne, puis les vannes */
const ORDRE: FamillePicto[] = ['cuve', 'pompe', 'moteur', 'ventilateur', 'vanne']

export function familleDe(e: SynopticEquipement): FamillePicto | null {
  return FAMILLE[typeEffectif(e)] ?? null
}

function etatPicto(e: SynopticEquipement, v: Valeurs): EtatPicto {
  const x = etatEquipement(e, v)
  if (x === 'alarme' || x === 'defaut') return 'defaut'
  if (x === 'marche' || x === 'arret' || x === 'ouvert' || x === 'ferme') return x
  return 'inconnu'
}

function niveauRelatif(e: SynopticEquipement, v: Valeurs): number | null {
  const sp = e.slots?.niveau
  const brut = sp?.variable ? v[sp.variable] : undefined
  const max = Number((e.params as { niveau_max?: number } | undefined)?.niveau_max)
  if (brut === undefined) return null
  const ref = max > 0 ? max : 100
  return Math.max(0, Math.min(1, brut / ref))
}

export function pictosDe(membres: SynopticEquipement[], v: Valeurs): PictoResume[] {
  return membres
    .map((e) => ({ e, famille: familleDe(e) }))
    .filter((x): x is { e: SynopticEquipement; famille: FamillePicto } => !!x.famille)
    .sort((a, b) => ORDRE.indexOf(a.famille) - ORDRE.indexOf(b.famille))
    .slice(0, MAX_PICTOS)
    .map(({ e, famille }) => ({
      id: e.id,
      famille,
      etat: etatPicto(e, v),
      libelle: e.libelle,
      niveau: famille === 'cuve' ? niveauRelatif(e, v) : null,
    }))
}

/** niveau de l'ouvrage, mesures, vitesses, puis nombre de vannes ouvertes : 3 valeurs au plus, sans doublon de variable */
function valeursPrincipales(membres: SynopticEquipement[], v: Valeurs): ValeurResume[] {
  const out: ValeurResume[] = []
  const vues = new Set<string>()
  const ajoute = (libelle: string, texte: string, variable?: string | null) => {
    if (out.length >= MAX_VALEURS || (variable && vues.has(variable))) return
    if (variable) vues.add(variable)
    out.push({ libelle, texte })
  }

  for (const e of membres) {
    const sp = e.slots?.niveau
    const brut = sp?.variable ? v[sp.variable] : undefined
    if (brut === undefined) continue
    const p = (e.params ?? {}) as { unite_niveau?: string }
    ajoute('Niveau', `${formaterNombre(brut)} ${p.unite_niveau || '%'}`, sp?.variable)
  }
  for (const e of membres.filter((q) => q.type === 'mesure')) {
    const sp = e.slots?.valeur
    const brut = sp?.variable ? v[sp.variable] : undefined
    if (brut === undefined) continue
    const unite = (e.params as { unite?: string } | undefined)?.unite
    ajoute(e.libelle, `${formaterNombre(brut)}${unite ? ' ' + unite : ''}`, sp?.variable)
  }
  for (const e of membres) {
    const sp = e.slots?.vitesse
    const brut = sp?.variable ? v[sp.variable] : undefined
    if (brut !== undefined) ajoute('Vitesse', `${formaterNombre(brut)} %`, sp?.variable)
  }
  const vannes = membres.filter((e) => ['vanne', 'vanne_reg', 'vanne_man', 'vanne_3v'].includes(e.type))
  const etatsVannes = vannes.map((e) => etatEquipement(e, v))
  const connues = etatsVannes.filter((s) => s === 'ouvert' || s === 'ferme')
  if (vannes.length > 1 && connues.length) {
    const ouvertes = connues.filter((s) => s === 'ouvert').length
    ajoute('Vannes ouvertes', `${ouvertes} / ${vannes.length}`)
  }
  return out
}

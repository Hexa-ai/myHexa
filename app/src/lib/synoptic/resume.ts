// Résumé lisible d'un synoptique (vue mobile) : alarmes actives + une carte par zone ou ouvrage principal.
// Fonction pure construite depuis le document et les valeurs courantes, sans DOM ni moteur de dessin.
// Les états suivent la même logique que le moteur (engine/moteur.ts) : sans variable reçue, un état reste « inconnu ».
// Les corrections de l'utilisateur (`modele.resume`, voir ResumeConfig) sont appliquées APRÈS le calcul automatique des groupes,
// sans jamais retirer une alarme : un équipement masqué disparaît des pictogrammes et des valeurs, pas de la liste d'alarmes.
import type { ResumeConfig, ResumeEquipement, SynopticDocument, SynopticEquipement } from './engine/types'
import { appliquerRegle } from './regles'
import { cartesCvc, estTypeCvc, modulesDe, etatModule, texteAlarmeModule, UNITES_SLOT, type ParamsCta, type ParamsHydro } from './engine/cvc-modele'
import { familleDuType, type FamillePicto } from './familles-picto'

export type { FamillePicto } from './familles-picto'

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
  /** titre calculé automatiquement (avant renommage) */
  titreAuto?: string
  membres: SynopticEquipement[]
  /** carte créée par l'utilisateur */
  perso?: boolean
}

const centre = (p: Position) => ({ x: p.x + p.w / 2, y: p.y + p.h / 2 })

export interface OptionsResume {
  /** vrai = ignore `modele.resume` : calcul purement automatique (aperçu « avant », bouton « Rétablir l'automatique ») */
  auto?: boolean
}

/** un équipement d'une carte, tel que l'éditeur du résumé le présente */
export interface MembreDetail {
  id: string
  libelle: string
  type: string
  /** famille donnée par le type de symbole (familles-picto.ts), null si aucune */
  familleAuto: FamillePicto | null
  /** famille effective (après correction), null = pas de pictogramme */
  famille: FamillePicto | null
  epingle: boolean
  masque: boolean
  /** vrai si l'équipement est actuellement en alarme ou en défaut */
  enAlarme: boolean
}

export interface ValeurPossible {
  variable: string
  libelle: string
}

/** une carte avec ce que l'éditeur doit savoir (y compris les cartes masquées) */
export interface CarteDetail {
  id: string
  /** titre affiché (après renommage) */
  titre: string
  /** titre calculé automatiquement */
  titreAuto: string
  masquee: boolean
  /** carte créée par l'utilisateur */
  personnalisee: boolean
  /** carte d'un bandeau CVC : seuls titre, ordre et masquage s'appliquent (pas d'équipement ni de valeur à choisir) */
  cvc: boolean
  membres: MembreDetail[]
  /** variables que l'on peut choisir comme valeurs de la carte */
  valeursPossibles: ValeurPossible[]
  /** variables choisies par l'utilisateur (vide = automatique) */
  valeursChoisies: string[]
  carte: CarteResume
}

export interface DetailResume {
  alarmes: AlarmeResume[]
  /** toutes les cartes dans l'ordre d'affichage, masquées comprises */
  cartes: CarteDetail[]
}

/** lit `modele.resume` en tolérant un contenu abîmé (JSON importé à la main) */
export function lireConfigResume(brut: unknown): ResumeConfig | undefined {
  if (!brut || typeof brut !== 'object') return undefined
  return brut as ResumeConfig
}

/** construit le résumé : alarmes actives puis cartes (les cartes en alarme d'abord, sauf ordre choisi) */
export function construireResume(doc: SynopticDocument, values: Valeurs, options: OptionsResume = {}): ResumeSynoptique {
  const d = detailResume(doc, values, options)
  return { alarmes: d.alarmes, ouvrages: d.cartes.filter((c) => !c.masquee).map((c) => c.carte) }
}

/** même calcul que construireResume, avec le détail utile à l'éditeur du résumé (cartes masquées, équipements, valeurs possibles) */
export function detailResume(doc: SynopticDocument, values: Valeurs, options: OptionsResume = {}): DetailResume {
  const modele = doc.modele
  const cfg = options.auto ? undefined : lireConfigResume(modele.resume)
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
  // 1. calcul automatique des groupes, 2. corrections de l'utilisateur (rattachements, titres)
  const groupes = appliquerRattachements(formerGroupes(modele.zones ?? [], equipements, distance), equipements, cfg)
  for (const g of groupes) {
    g.titreAuto = g.titre
    g.titre = cfg?.cartes?.[g.id]?.titre?.trim() || g.titre
  }

  // alarmes : un équipement en alarme ou en défaut, puis les voyants du bandeau. Les alarmes ne dépendent JAMAIS des corrections
  // (un équipement masqué ou une carte masquée garde ses alarmes dans la liste).
  const groupeDe = new Map<string, Groupe>()
  for (const g of groupes) for (const e of g.membres) groupeDe.set(e.id, g)
  const alarmes: AlarmeResume[] = []
  const nbParCarte = new Map<string, number>()
  const compte = (carteId: string) => nbParCarte.set(carteId, (nbParCarte.get(carteId) ?? 0) + 1)
  for (const e of equipements) {
    const etat = etatEquipement(e, values)
    if (etat === 'alarme' || etat === 'defaut') {
      const g = groupeDe.get(e.id)
      alarmes.push({ id: e.id, texte: texteAlarme(e, etat), ouvrage: g?.titre ?? null })
      if (g) compte(g.id)
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

  const liste: CarteDetail[] = groupes.map((g) => detailGroupe(g, values, positions, nbParCarte.get(g.id) ?? 0, cfg))
  for (const e of equipementsCvc) {
    for (const c of cartesElementCvc(e, values, positions, alarmes, (id, titre) => cfg?.cartes?.[id]?.titre?.trim() || titre)) {
      liste.push({
        id: c.id,
        titre: c.titre,
        titreAuto: c.titreAuto,
        masquee: false,
        personnalisee: false,
        cvc: true,
        membres: [],
        valeursPossibles: [],
        valeursChoisies: [],
        carte: c.carte,
      })
    }
  }
  for (const c of liste) c.masquee = !!cfg?.cartes?.[c.id]?.masquee

  // ordre : les cartes avec un rang choisi d'abord (par rang), puis les autres, les cartes en alarme devant (ordre du document sinon)
  const rang = (c: CarteDetail) => cfg?.cartes?.[c.id]?.ordre
  const avecRang = liste.filter((c) => Number.isFinite(rang(c)))
  const sansRang = liste.filter((c) => !Number.isFinite(rang(c)))
  avecRang.sort((a, b) => (rang(a) as number) - (rang(b) as number))
  sansRang.sort((a, b) => Number(b.carte.alarmes > 0) - Number(a.carte.alarmes > 0))
  return { alarmes, cartes: [...avecRang, ...sansRang] }
}

/** déplace les équipements vers les cartes demandées et ajoute les cartes personnalisées (les autres groupes ne changent pas) */
function appliquerRattachements(groupes: Groupe[], equipements: SynopticEquipement[], cfg: ResumeConfig | undefined): Groupe[] {
  if (!cfg) return groupes
  const cible = new Map<string, string>()
  for (const c of cfg.cartesPerso ?? []) for (const id of c.equipements ?? []) if (!cible.has(id)) cible.set(id, c.id)
  for (const [id, o] of Object.entries(cfg.equipements ?? {})) if (o?.carte) cible.set(id, o.carte)
  if (!cible.size && !cfg.cartesPerso?.length) return groupes

  const idsAuto = new Set(groupes.map((g) => g.id))
  const persos: Groupe[] = (cfg.cartesPerso ?? [])
    .filter((c) => c?.id && !idsAuto.has(c.id))
    .map((c) => ({ id: c.id, titre: String(c.titre || 'Carte'), membres: [], perso: true }))
  const tous = [...groupes, ...persos]
  const parId = new Map(tous.map((g) => [g.id, g]))
  const equipement = new Map(equipements.map((e) => [e.id, e]))
  const touches = new Set<Groupe>()
  for (const [eid, cid] of cible) {
    const e = equipement.get(eid)
    const vers = parId.get(cid)
    if (!e || !vers) continue
    const depuis = tous.find((g) => g.membres.includes(e))
    if (depuis === vers) continue
    if (depuis) depuis.membres.splice(depuis.membres.indexOf(e), 1)
    vers.membres.push(e)
    touches.add(vers)
  }
  // une carte qui a reçu des équipements reprend l'ordre du document, quel que soit l'ordre des déplacements
  const rangDoc = new Map(equipements.map((e, i) => [e.id, i]))
  for (const g of touches) g.membres.sort((a, b) => (rangDoc.get(a.id) ?? 0) - (rangDoc.get(b.id) ?? 0))
  return tous.filter((g) => g.membres.length)
}

/** cartes d'un bandeau CTA ou d'une ligne hydraulique : une carte par fonction (soufflage, reprise, récupération, batteries, départs…) */
function cartesElementCvc(
  e: SynopticEquipement,
  v: Valeurs,
  positions: Map<string, Position>,
  alarmes: AlarmeResume[],
  titreChoisi: (idCarte: string, titreAuto: string) => string,
): Array<{ id: string; titre: string; titreAuto: string; carte: CarteResume }> {
  const type = e.type as 'cta' | 'hydro'
  const params = e.params as (ParamsCta & ParamsHydro) | undefined
  const lecteur = (idModule: string, base: string) => lire(e, `${idModule}:${base}`, v)
  const p = positions.get(e.id)
  const cadre: CadreDessin | null = p ? { x: p.x, y: p.y, w: p.w, h: p.h } : null
  const cartes = cartesCvc(type, params, lecteur, e.libelle)
  // sans aucune valeur reçue, une carte reste « inconnu » (pas de « marche » inventée)
  return cartes.map((c) => {
    const titreAlarme = titreChoisi(c.id, c.titre)
    for (const m of modulesDe(type, params).filter(({ m: mod }) => c.modules.includes(mod.id))) {
      if (etatModule(m.m, lecteur) === 'defaut') alarmes.push({ id: `${e.id}:${m.m.id}`, texte: texteAlarmeModule(m.m, type, lecteur), ouvrage: titreAlarme })
    }
    const carte: CarteResume = {
      id: c.id,
      titre: titreAlarme,
      etat: c.etat === 'ok' ? 'ok' : c.etat,
      alarmes: c.defauts.length,
      pictos: c.pictos.map((q) => ({ id: q.id, famille: q.famille, etat: q.etat === 'ok' ? 'inconnu' : (q.etat as EtatPicto), libelle: q.libelle, niveau: null })),
      valeurs: c.valeurs.map((x) => ({ libelle: x.libelle, texte: `${formaterNombre(x.valeur)}${UNITES_SLOT[x.base] ? ' ' + UNITES_SLOT[x.base] : ''}` })),
      cadre,
    }
    return { id: c.id, titre: titreAlarme, titreAuto: c.titre, carte }
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

function detailGroupe(
  g: Groupe,
  v: Valeurs,
  positions: Map<string, Position>,
  nbAlarmes: number,
  cfg: ResumeConfig | undefined,
): CarteDetail {
  const etats = g.membres.map((e) => etatEquipement(e, v))
  const actionneurs = g.membres.filter((e) => TYPES_ACTIONNEUR.includes(typeEffectif(e)))
  const etatsActionneurs = actionneurs.map((e) => etatEquipement(e, v))
  const aDesDonnees = g.membres.some((e) =>
    Object.values(e.slots ?? {}).some((sp) => sp?.variable && v[sp.variable] !== undefined),
  )
  // l'état de la carte tient compte de tous ses équipements, masqués compris
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
  const corr = (e: SynopticEquipement): ResumeEquipement => cfg?.equipements?.[e.id] ?? {}
  const options: OptionsPictos = {
    epingles: new Set(g.membres.filter((e) => corr(e).epingle).map((e) => e.id)),
    masques: new Set(g.membres.filter((e) => corr(e).masque).map((e) => e.id)),
    familles: new Map(g.membres.filter((e) => corr(e).famille).map((e) => [e.id, corr(e).famille as FamillePicto | 'aucun'])),
  }
  const possibles = valeursPossibles(g.membres)
  const choisies = (cfg?.cartes?.[g.id]?.valeurs ?? []).filter((x) => possibles.some((p) => p.variable === x)).slice(0, MAX_VALEURS)
  const valeurs = choisies.length ? valeursChoisies(choisies, possibles, v) : valeursPrincipales(g.membres, v, options)
  return {
    id: g.id,
    titre: g.titre,
    titreAuto: g.titreAuto ?? g.titre,
    masquee: false,
    personnalisee: !!g.perso,
    cvc: false,
    membres: g.membres.map((e) => ({
      id: e.id,
      libelle: e.libelle,
      type: typeEffectif(e),
      familleAuto: familleDe(e),
      famille: familleEffective(e, options),
      epingle: options.epingles?.has(e.id) ?? false,
      masque: options.masques?.has(e.id) ?? false,
      enAlarme: ['alarme', 'defaut'].includes(etatEquipement(e, v)),
    })),
    valeursPossibles: possibles.map(({ variable, libelle }) => ({ variable, libelle })),
    valeursChoisies: choisies,
    carte: {
      id: g.id,
      titre: g.titre,
      etat,
      alarmes: nbAlarmes,
      valeurs,
      pictos: pictosDe(g.membres, v, options),
      cadre,
    },
  }
}

const MAX_PICTOS = 4
/** ordre d'affichage : l'ouvrage, puis ce qui tourne, puis les vannes */
const ORDRE: FamillePicto[] = ['cuve', 'pompe', 'moteur', 'ventilateur', 'vanne']

/** famille donnée par le type de symbole (table unique : familles-picto.ts) */
export function familleDe(e: SynopticEquipement): FamillePicto | null {
  return familleDuType(typeEffectif(e))
}

/** corrections de pictogrammes d'une carte (tout est facultatif : sans options, le calcul est automatique) */
export interface OptionsPictos {
  epingles?: Set<string>
  masques?: Set<string>
  familles?: Map<string, FamillePicto | 'aucun'>
}

/** famille affichée : celle choisie par l'utilisateur (« aucun » = pas de pictogramme), sinon celle du type */
function familleEffective(e: SynopticEquipement, o: OptionsPictos = {}): FamillePicto | null {
  const f = o.familles?.get(e.id)
  if (f === 'aucun') return null
  return f ?? familleDe(e)
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

/**
 * pictogrammes d'une carte : 4 au plus, dans l'ordre cuve > pompe > moteur > ventilateur > vanne.
 * Les équipements épinglés passent d'abord et ne comptent pas dans la limite ; les masqués (ou dont la famille est « aucun »)
 * ne sont jamais montrés.
 */
export function pictosDe(membres: SynopticEquipement[], v: Valeurs, options: OptionsPictos = {}): PictoResume[] {
  const candidats = membres
    .filter((e) => !options.masques?.has(e.id))
    .map((e) => ({ e, famille: familleEffective(e, options), epingle: !!options.epingles?.has(e.id) }))
    .filter((x): x is { e: SynopticEquipement; famille: FamillePicto; epingle: boolean } => !!x.famille)
  const parOrdre = (a: { famille: FamillePicto }, b: { famille: FamillePicto }) => ORDRE.indexOf(a.famille) - ORDRE.indexOf(b.famille)
  const epingles = candidats.filter((x) => x.epingle).sort(parOrdre)
  const autres = candidats.filter((x) => !x.epingle).sort(parOrdre)
  const retenus = [...epingles, ...autres.slice(0, Math.max(0, MAX_PICTOS - epingles.length))].sort(parOrdre)
  return retenus.map(({ e, famille }) => ({
    id: e.id,
    famille,
    etat: etatPicto(e, v),
    libelle: e.libelle,
    niveau: famille === 'cuve' ? niveauRelatif(e, v) : null,
  }))
}

interface ValeurBrute extends ValeurResume {
  variable: string
}

/** les trois valeurs « principales » d'un équipement : niveau, mesure, vitesse (undefined si la variable n'a pas répondu) */
function valNiveau(e: SynopticEquipement, v: Valeurs): ValeurBrute | null {
  const sp = e.slots?.niveau
  const brut = sp?.variable ? v[sp.variable] : undefined
  if (!sp?.variable || brut === undefined) return null
  const p = (e.params ?? {}) as { unite_niveau?: string }
  return { variable: sp.variable, libelle: 'Niveau', texte: `${formaterNombre(brut)} ${p.unite_niveau || '%'}` }
}
function valMesure(e: SynopticEquipement, v: Valeurs): ValeurBrute | null {
  if (e.type !== 'mesure') return null
  const sp = e.slots?.valeur
  const brut = sp?.variable ? v[sp.variable] : undefined
  if (!sp?.variable || brut === undefined) return null
  const unite = (e.params as { unite?: string } | undefined)?.unite
  return { variable: sp.variable, libelle: e.libelle, texte: `${formaterNombre(brut)}${unite ? ' ' + unite : ''}` }
}
function valVitesse(e: SynopticEquipement, v: Valeurs): ValeurBrute | null {
  const sp = e.slots?.vitesse
  const brut = sp?.variable ? v[sp.variable] : undefined
  if (!sp?.variable || brut === undefined) return null
  return { variable: sp.variable, libelle: 'Vitesse', texte: `${formaterNombre(brut)} %` }
}

/** niveau de l'ouvrage, mesures, vitesses, puis nombre de vannes ouvertes : 3 valeurs au plus, sans doublon de variable ;
 *  les équipements épinglés donnent leurs valeurs en premier, hors limite ; les masqués n'en donnent aucune */
function valeursPrincipales(membres: SynopticEquipement[], v: Valeurs, options: OptionsPictos = {}): ValeurResume[] {
  const out: ValeurResume[] = []
  const vues = new Set<string>()
  const ajoute = (libelle: string, texte: string, variable?: string | null, force = false) => {
    if ((!force && out.length >= MAX_VALEURS) || (variable && vues.has(variable))) return
    if (variable) vues.add(variable)
    out.push({ libelle, texte })
  }
  const visibles = membres.filter((e) => !options.masques?.has(e.id))

  for (const e of visibles.filter((q) => options.epingles?.has(q.id))) {
    for (const x of [valNiveau(e, v), valMesure(e, v), valVitesse(e, v)]) if (x) ajoute(x.libelle, x.texte, x.variable, true)
  }
  for (const e of visibles) {
    const x = valNiveau(e, v)
    if (x) ajoute(x.libelle, x.texte, x.variable)
  }
  for (const e of visibles) {
    const x = valMesure(e, v)
    if (x) ajoute(x.libelle, x.texte, x.variable)
  }
  for (const e of visibles) {
    const x = valVitesse(e, v)
    if (x) ajoute(x.libelle, x.texte, x.variable)
  }
  const vannes = visibles.filter((e) => ['vanne', 'vanne_reg', 'vanne_man', 'vanne_3v'].includes(e.type))
  const etatsVannes = vannes.map((e) => etatEquipement(e, v))
  const connues = etatsVannes.filter((s) => s === 'ouvert' || s === 'ferme')
  if (vannes.length > 1 && connues.length) {
    const ouvertes = connues.filter((s) => s === 'ouvert').length
    ajoute('Vannes ouvertes', `${ouvertes} / ${vannes.length}`)
  }
  return out
}

/** emplacements à valeur analogique (hors états marche / défaut / ouvert…) */
const SLOTS_ETAT = ['marche', 'defaut', 'ouvert', 'ferme', 'sorti', 'rentre', 'declenche', 'colmatage', 'etat']

interface PossibleBrute extends ValeurPossible {
  unite: string
}

/** variables analogiques des équipements d'une carte, proposées au choix des valeurs affichées */
export function valeursPossibles(membres: SynopticEquipement[]): PossibleBrute[] {
  const out: PossibleBrute[] = []
  const vues = new Set<string>()
  for (const e of membres) {
    const p = (e.params ?? {}) as { unite?: string; unite_niveau?: string }
    for (const [nom, sp] of Object.entries(e.slots ?? {})) {
      if (!sp?.variable || vues.has(sp.variable) || SLOTS_ETAT.includes(nom)) continue
      vues.add(sp.variable)
      const unite = nom === 'niveau' ? p.unite_niveau || '%' : nom === 'vitesse' ? '%' : nom === 'valeur' ? p.unite || '' : UNITES_SLOT[nom] || ''
      const libelle = nom === 'niveau' ? `Niveau · ${e.libelle}` : nom === 'valeur' ? e.libelle : `${e.libelle} · ${nom}`
      out.push({ variable: sp.variable, libelle, unite })
    }
  }
  return out
}

/** valeurs choisies par l'utilisateur : une ligne par variable, « — » tant que la variable n'a pas répondu */
function valeursChoisies(variables: string[], possibles: PossibleBrute[], v: Valeurs): ValeurResume[] {
  return variables.map((nom) => {
    const p = possibles.find((x) => x.variable === nom) as PossibleBrute
    const brut = v[nom]
    return { libelle: p.libelle, texte: brut === undefined ? '—' : `${formaterNombre(brut)}${p.unite ? ' ' + p.unite : ''}` }
  })
}

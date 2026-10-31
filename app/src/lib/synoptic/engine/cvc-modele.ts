// Famille CVC du designer : bandeau de CTA modulaire (type « cta ») et lignes hydrauliques / chaufferie (type « hydro »).
// Ce fichier ne contient que des fonctions pures (catalogue des modules, géométrie, états, résumé) : aucun DOM.
// Le dessin SVG vit dans cvc-dessin.ts ; le moteur (moteur.ts) relie les deux aux emplacements de variables.

export type TypeCvc = 'cta' | 'hydro'
export type TypeAir = 'neuf' | 'souffle' | 'repris' | 'rejete'
export type LigneEau = 'aller' | 'retour'
export type EtatModule = 'marche' | 'arret' | 'defaut' | 'modulant' | 'ouvert' | 'ferme' | 'ok' | 'inconnu'

/** module posé dans un bandeau : `k` = clé du catalogue ; `id` sert de préfixe aux emplacements (« F1:colmatage ») */
export interface ModuleCvc {
  id: string
  k: string
  libelle?: string
  air?: TypeAir
  ligne?: LigneEau
  w?: 60 | 120
}

/** une colonne de la CTA : un module par étage (haut = extraction, bas = soufflage) ou un module double qui relie les deux */
export interface ColonneCta {
  id?: string
  haut?: ModuleCvc | null
  bas?: ModuleCvc | null
  double?: ModuleCvc | null
}

export interface RangeeHydro {
  id?: string
  libelle?: string
  modules: ModuleCvc[]
}

export interface ParamsCta {
  flux?: 'simple' | 'double'
  titre?: string
  colonnes?: ColonneCta[]
}

export interface ParamsHydro {
  titre?: string
  rangees?: RangeeHydro[]
}

export interface DefModule {
  nom: string
  court: string
  w: 60 | 120
  /** vrai : module double 120×320 qui relie les deux étages d'une CTA double flux */
  double?: boolean
  /** emplacements de variables du module (noms de base, préfixés par « <id>: » dans le document) */
  slots: string[]
  /** emplacements affichés en étiquette (au plus 2, dans cet ordre) */
  mesures: string[]
  /** pictogramme du résumé mobile */
  picto?: 'ventilateur' | 'registre' | 'batterie' | 'roue' | 'flamme' | 'pompe' | 'vanne' | 'filtre'
  /** hydraulique : le module se pose sur la ligne aller ou retour au choix */
  ligne?: boolean
  /** largeur modifiable (60 ou 120) */
  largeurLibre?: boolean
  pref: string
}

/** CTA : étage bas (soufflage) ou haut (extraction) */
export const MODULES_CTA: Record<string, DefModule> = {
  air_neuf: { nom: 'Air neuf', court: 'Air neuf', w: 60, slots: ['temperature', 'humidite', 'debit'], mesures: ['temperature', 'humidite', 'debit'], pref: 'AN' },
  reprise: { nom: 'Reprise', court: 'Reprise', w: 60, slots: ['temperature', 'co2', 'debit'], mesures: ['temperature', 'co2', 'debit'], pref: 'RP' },
  soufflage: { nom: 'Soufflage', court: 'Soufflage', w: 60, slots: ['temperature', 'humidite', 'pression', 'debit'], mesures: ['temperature', 'humidite', 'pression', 'debit'], pref: 'SF' },
  rejet: { nom: 'Rejet', court: 'Rejet', w: 60, slots: ['temperature', 'debit'], mesures: ['temperature', 'debit'], pref: 'RJ' },
  registre: { nom: 'Registre', court: 'Registre', w: 60, slots: ['ouvert', 'ferme', 'position', 'defaut'], mesures: ['position'], picto: 'registre', pref: 'TA' },
  filtre_plan: { nom: 'Filtre plan', court: 'Filtre', w: 60, slots: ['colmatage', 'defaut', 'dp'], mesures: ['dp'], picto: 'filtre', pref: 'FS' },
  filtre_poches: { nom: 'Filtre à poches', court: 'Filtre poches', w: 120, slots: ['colmatage', 'defaut', 'dp'], mesures: ['dp'], picto: 'filtre', pref: 'FP' },
  batterie_chaude: { nom: 'Batterie chaude', court: 'Bat. chaude', w: 60, slots: ['position', 'entree_t', 'sortie_t', 'debit_eau', 'defaut', 'antigel'], mesures: ['sortie_t', 'position'], picto: 'batterie', pref: 'BC' },
  batterie_froide: { nom: 'Batterie froide', court: 'Bat. froide', w: 60, slots: ['position', 'entree_t', 'sortie_t', 'debit_eau', 'defaut'], mesures: ['sortie_t', 'position'], picto: 'batterie', pref: 'BF' },
  batterie_elec: { nom: 'Batterie électrique', court: 'Bat. élec.', w: 60, slots: ['marche', 'position', 'sortie_t', 'defaut'], mesures: ['sortie_t', 'position'], picto: 'batterie', pref: 'BE' },
  humidificateur: { nom: 'Humidificateur', court: 'Humidif.', w: 60, slots: ['marche', 'position', 'humidite', 'defaut'], mesures: ['humidite', 'position'], pref: 'HU' },
  piege_son: { nom: 'Piège à son', court: 'Piège à son', w: 120, slots: [], mesures: [], pref: 'PS' },
  recup_plaques: { nom: 'Récupérateur à plaques', court: 'Récup. plaques', w: 120, double: true, slots: ['position', 'entree_t', 'sortie_t', 'dp', 'defaut'], mesures: ['sortie_t', 'position'], picto: 'roue', pref: 'RC' },
  recup_roue: { nom: 'Roue de récupération', court: 'Roue récup.', w: 120, double: true, slots: ['marche', 'vitesse', 'entree_t', 'sortie_t', 'defaut'], mesures: ['sortie_t', 'vitesse'], picto: 'roue', pref: 'RR' },
  caisson_melange: { nom: 'Caisson de mélange', court: 'Mélange', w: 120, double: true, slots: ['position', 'temperature', 'defaut'], mesures: ['temperature', 'position'], picto: 'registre', pref: 'CM' },
  ventilateur: { nom: 'Ventilateur', court: 'Ventilateur', w: 60, slots: ['marche', 'defaut', 'vitesse', 'frequence', 'debit'], mesures: ['frequence', 'vitesse'], picto: 'ventilateur', pref: 'VE' },
  plug_fan: { nom: 'Ventilateur plug fan', court: 'Plug fan', w: 120, slots: ['marche', 'defaut', 'vitesse', 'frequence', 'debit'], mesures: ['frequence', 'vitesse'], picto: 'ventilateur', pref: 'PF' },
  sonde: { nom: 'Sonde de gaine', court: 'Sonde', w: 60, slots: ['temperature', 'humidite', 'co2', 'pression', 'debit'], mesures: ['temperature', 'humidite'], pref: 'ST' },
  gaine: { nom: 'Gaine', court: '', w: 60, slots: [], mesures: [], largeurLibre: true, pref: 'GA' },
}

/** hydraulique : deux lignes horizontales, aller (haut) et retour (bas) */
export const MODULES_HYDRO: Record<string, DefModule> = {
  chaudiere: { nom: 'Chaudière', court: 'Chaudière', w: 120, slots: ['marche', 'defaut', 'vitesse', 'temperature'], mesures: ['temperature', 'vitesse'], picto: 'flamme', pref: 'CH' },
  pac: { nom: 'Pompe à chaleur', court: 'PAC', w: 120, slots: ['marche', 'defaut', 'temperature', 'puissance'], mesures: ['temperature', 'puissance'], picto: 'flamme', pref: 'PAC' },
  pompe: { nom: 'Pompe', court: 'Pompe', w: 60, slots: ['marche', 'defaut', 'vitesse'], mesures: ['vitesse'], picto: 'pompe', ligne: true, pref: 'PO' },
  pompe_double: { nom: 'Circulateur double', court: 'Circ. double', w: 120, slots: ['marche', 'defaut', 'vitesse'], mesures: ['vitesse'], picto: 'pompe', ligne: true, pref: 'PD' },
  debitmetre: { nom: 'Débitmètre', court: 'Débitmètre', w: 60, slots: ['debit'], mesures: ['debit'], ligne: true, pref: 'FT' },
  purgeur: { nom: 'Purgeur d’air', court: 'Purgeur', w: 60, slots: [], mesures: [], ligne: true, pref: 'PU' },
  emetteur: { nom: 'Émetteur', court: 'Émetteur', w: 60, slots: ['temperature', 'position'], mesures: ['temperature', 'position'], pref: 'EM' },
  vanne_2v: { nom: 'Vanne 2 voies', court: 'Vanne 2V', w: 60, slots: ['ouvert', 'ferme', 'position', 'defaut'], mesures: ['position'], picto: 'vanne', ligne: true, pref: 'V2' },
  vanne_3v: { nom: 'Vanne 3 voies', court: 'Vanne 3V', w: 60, slots: ['position', 'defaut'], mesures: ['position'], picto: 'vanne', pref: 'V3' },
  echangeur: { nom: 'Échangeur', court: 'Échangeur', w: 120, slots: ['entree_t', 'sortie_t', 'defaut'], mesures: ['entree_t', 'sortie_t'], pref: 'EC' },
  bouteille: { nom: 'Bouteille de découplage', court: 'Bouteille', w: 60, slots: ['temperature', 'defaut'], mesures: ['temperature'], pref: 'BD' },
  ballon_ecs: { nom: 'Ballon ECS', court: 'Ballon ECS', w: 120, slots: ['temperature', 'defaut'], mesures: ['temperature'], pref: 'BE' },
  vase: { nom: 'Vase d’expansion', court: 'Vase', w: 60, slots: ['pression'], mesures: ['pression'], pref: 'VX' },
  pot_boue: { nom: 'Pot à boue', court: 'Pot à boue', w: 60, slots: [], mesures: [], ligne: true, pref: 'PB' },
  filtre: { nom: 'Filtre', court: 'Filtre', w: 60, slots: ['colmatage', 'defaut', 'dp'], mesures: ['dp'], picto: 'filtre', ligne: true, pref: 'FI' },
  compteur: { nom: 'Compteur d’énergie', court: 'kWh', w: 60, slots: ['energie', 'puissance'], mesures: ['energie', 'puissance'], ligne: true, pref: 'CE' },
  clapet: { nom: 'Clapet anti-retour', court: 'Clapet', w: 60, slots: [], mesures: [], ligne: true, pref: 'CL' },
  isolement: { nom: 'Vannes d’isolement', court: 'Isolement', w: 60, slots: ['ouvert', 'ferme'], mesures: [], pref: 'VI' },
  depart: { nom: 'Départ réseau', court: 'Départ', w: 60, slots: ['temperature', 'debit'], mesures: ['temperature', 'debit'], pref: 'DE' },
  arrivee: { nom: 'Arrivée', court: 'Arrivée', w: 60, slots: ['temperature', 'debit'], mesures: ['temperature', 'debit'], pref: 'AR' },
  sonde_t: { nom: 'Sonde de température', court: 'Sonde', w: 60, slots: ['temperature'], mesures: ['temperature'], ligne: true, pref: 'TT' },
  tuyau: { nom: 'Tuyauterie', court: '', w: 60, slots: [], mesures: [], largeurLibre: true, pref: 'TU' },
}

export const UNITES_SLOT: Record<string, string> = {
  temperature: '°C', entree_t: '°C', sortie_t: '°C', humidite: '%', co2: 'ppm', pression: 'Pa', debit: 'm³/h', dp: 'Pa',
  position: '%', vitesse: '%', debit_eau: 'm³/h', frequence: 'Hz', puissance: 'kW', energie: 'kWh',
}

/** libellés des emplacements propres à la famille CVC (les autres sont dans SLOT_FR du moteur) */
export const SLOT_CVC_FR: Record<string, string> = {
  humidite: 'Humidité', co2: 'CO₂', pression: 'Pression', debit: 'Débit', debit_eau: 'Débit d’eau', puissance: 'Puissance', energie: 'Énergie',
  antigel: 'Antigel', dp: 'Pression différentielle', position: 'Position', entree_t: 'T entrée', sortie_t: 'T sortie',
  temperature: 'Température', frequence: 'Fréquence', vitesse: 'Vitesse', marche: 'Marche', defaut: 'Défaut',
  ouvert: 'Ouvert', ferme: 'Fermé', colmatage: 'Colmatage',
}

/** modules qui tournent : ils décident de l'état « en marche » du bandeau */
export const MOTEURS_CVC: readonly string[] = ['ventilateur', 'plug_fan', 'recup_roue', 'pompe', 'pompe_double', 'chaudiere', 'pac']

export const estTypeCvc = (t: unknown): t is TypeCvc => t === 'cta' || t === 'hydro'
export const defsDe = (type: TypeCvc): Record<string, DefModule> => (type === 'cta' ? MODULES_CTA : MODULES_HYDRO)

/** nom complet d'un emplacement de module : « F1:dp » */
export const nomSlot = (idModule: string, base: string): string => `${idModule}:${base}`
export const baseSlot = (nom: string): string => (String(nom).includes(':') ? String(nom).slice(String(nom).indexOf(':') + 1) : String(nom))
export const moduleDeSlot = (nom: string): string | null => (String(nom).includes(':') ? String(nom).slice(0, String(nom).indexOf(':')) : null)

/** largeur d'un module (60 ou 120) */
export function largeurModule(m: ModuleCvc, type: TypeCvc): 60 | 120 {
  const d = defsDe(type)[m.k]
  if (!d) return 60
  if (d.largeurLibre) return m.w === 120 ? 120 : 60
  return d.w
}

export const HAUTEUR_ETAGE = 160
export const GAINE = { haut: 30, bas: 130, axe: 80 }
export const HYDRO = { aller: 50, retour: 110 }
/** marge de gauche réservée aux deux collecteurs verticaux d'un bloc hydraulique à plusieurs départs */
export const MARGE_COLLECTEUR = 48

export interface CelluleCta {
  index: number
  x: number
  w: number
  haut: ModuleCvc | null
  bas: ModuleCvc | null
  double: ModuleCvc | null
}
export interface GeomCta {
  w: number
  h: number
  double: boolean
  /** décalage vertical de l'étage bas (0 en simple flux, 160 en double flux) */
  yBas: number
  yHaut: number | null
  cellules: CelluleCta[]
}

/** mise en page d'une CTA : les colonnes s'enchaînent bout à bout (le module le plus large fixe la largeur de la colonne) */
export function disposerCta(p: ParamsCta | undefined): GeomCta {
  const double = (p?.flux ?? 'simple') === 'double'
  const cellules: CelluleCta[] = []
  let x = 0
  ;(p?.colonnes ?? []).forEach((c, index) => {
    const dbl = double && c.double ? c.double : null
    const haut = double && !dbl ? (c.haut ?? null) : null
    const bas = dbl ? null : (c.bas ?? null)
    const ms = [dbl, haut, bas].filter((m): m is ModuleCvc => !!m)
    const w = ms.length ? Math.max(...ms.map((m) => largeurModule(m, 'cta'))) : 60
    cellules.push({ index, x, w, haut, bas, double: dbl })
    x += w
  })
  return { w: x, h: double ? 2 * HAUTEUR_ETAGE : HAUTEUR_ETAGE, double, yBas: double ? HAUTEUR_ETAGE : 0, yHaut: double ? 0 : null, cellules }
}

export interface CelluleHydro {
  x: number
  w: number
  module: ModuleCvc
}
export interface GeomHydro {
  w: number
  h: number
  marge: number
  rangees: Array<{ y: number; wRangee: number; cellules: CelluleHydro[] }>
}

/** mise en page d'un bloc hydraulique : une rangée (= un départ) tous les 160, modules bout à bout après la marge des collecteurs */
export function disposerHydro(p: ParamsHydro | undefined): GeomHydro {
  const rangees = p?.rangees ?? []
  const marge = rangees.length > 1 ? MARGE_COLLECTEUR : 0
  let wMax = 0
  const out = rangees.map((r, i) => {
    let x = marge
    const cellules = r.modules.map((m) => {
      const w = largeurModule(m, 'hydro')
      const c = { x, w, module: m }
      x += w
      return c
    })
    wMax = Math.max(wMax, x)
    return { y: i * HAUTEUR_ETAGE, wRangee: x, cellules }
  })
  // un bloc dont les départs sont encore vides reste visible et ciblable (largeur minimale ; sans effet dès qu'un module est posé)
  const largeurVide = rangees.every((r) => !r.modules.length) ? 120 : 0
  return { w: Math.max(wMax, largeurVide), h: Math.max(1, rangees.length) * HAUTEUR_ETAGE, marge, rangees: out }
}

/** modules de l'élément, à plat, avec leur étage / rangée (utile pour les emplacements, le résumé, les contrôles) */
export interface ModulePlace {
  m: ModuleCvc
  etage: 'haut' | 'bas' | 'double' | 'rangee'
  rangee?: number
  libelleRangee?: string
}
export function modulesDe(type: TypeCvc, params: ParamsCta & ParamsHydro | undefined): ModulePlace[] {
  const out: ModulePlace[] = []
  if (type === 'cta') {
    const dbl = (params?.flux ?? 'simple') === 'double'
    for (const c of params?.colonnes ?? []) {
      if (dbl && c.double) out.push({ m: c.double, etage: 'double' })
      else {
        if (dbl && c.haut) out.push({ m: c.haut, etage: 'haut' })
        if (c.bas) out.push({ m: c.bas, etage: 'bas' })
      }
    }
  } else {
    ;(params?.rangees ?? []).forEach((r, i) => r.modules.forEach((m) => out.push({ m, etage: 'rangee', rangee: i, libelleRangee: r.libelle || r.id || `Départ ${i + 1}` })))
  }
  return out
}

/** emplacements attendus d'un élément CVC : { « F1:dp » → true } */
export function nomsSlotsAttendus(type: TypeCvc, params: ParamsCta & ParamsHydro | undefined): string[] {
  const defs = defsDe(type)
  return modulesDe(type, params).flatMap(({ m }) => (defs[m.k]?.slots ?? []).map((b) => nomSlot(m.id, b)))
}

/** identifiant libre pour un nouveau module (« F1 », « F2 »…) */
export function idModuleLibre(type: TypeCvc, params: ParamsCta & ParamsHydro | undefined, k: string): string {
  const pref = defsDe(type)[k]?.pref ?? 'M'
  const pris = new Set(modulesDe(type, params).map(({ m }) => m.id))
  for (let i = 1; ; i++) {
    const id = `${pref}${i}`
    if (!pris.has(id)) return id
  }
}

/** type d'air de l'étage bas : neuf puis soufflé (la bascule est le premier module double) */
export function airBas(g: GeomCta, cellule: CelluleCta): TypeAir {
  if (cellule.bas?.air) return cellule.bas.air
  const iDouble = g.cellules.findIndex((c) => c.double)
  if (iDouble >= 0) return cellule.index < iDouble ? 'neuf' : 'souffle'
  // sans module double : l'air est neuf jusqu'à la première batterie / humidificateur / ventilateur
  const iTraitement = g.cellules.findIndex((c) => c.bas && ['batterie_chaude', 'batterie_froide', 'batterie_elec', 'humidificateur', 'ventilateur', 'plug_fan'].includes(c.bas.k))
  return iTraitement >= 0 && cellule.index >= iTraitement ? 'souffle' : 'neuf'
}

/** étage haut : repris avant le module double (côté droit, d'où vient l'air), rejeté après (côté gauche) */
export function airHaut(g: GeomCta, cellule: CelluleCta): TypeAir {
  if (cellule.haut?.air) return cellule.haut.air
  const iDouble = g.cellules.findIndex((c) => c.double)
  return iDouble >= 0 && cellule.index < iDouble ? 'rejete' : 'repris'
}

type Lecteur = (idModule: string, base: string) => number | undefined

const intermediaire = (p: number): boolean => p > 2 && p < 98

/** position 0..100 d'un module (registre, vanne) : emplacement « position », sinon ouvert / fermé */
export function positionModule(id: string, lire: Lecteur): number | undefined {
  if (lire(id, 'ferme') === 1) return 0
  if (lire(id, 'ouvert') === 1) return 100
  const p = lire(id, 'position')
  if (p != null) return Math.max(0, Math.min(100, p))
  const o = lire(id, 'ouvert'), f = lire(id, 'ferme')
  if (o === 0 && f === 0) return 50   // en course : ni ouvert ni fermé
  return o === 0 ? 0 : undefined
}

/** état d'un module : défaut > marche / arrêt > position (modulant, ouvert, fermé) > normal / inconnu */
export function etatModule(m: ModuleCvc, lire: Lecteur): EtatModule {
  const id = m.id
  if (lire(id, 'defaut') === 1 || lire(id, 'antigel') === 1) return 'defaut'
  switch (m.k) {
    case 'ventilateur':
    case 'plug_fan':
    case 'pompe_double':
    case 'recup_roue':
    case 'chaudiere':
    case 'pac':
    case 'pompe':
    case 'humidificateur':
    case 'batterie_elec': {
      const mar = lire(id, 'marche')
      if (mar === 1) {
        const p = m.k === 'batterie_elec' || m.k === 'humidificateur' ? lire(id, 'position') : undefined
        return p != null && intermediaire(p) ? 'modulant' : 'marche'
      }
      if (mar === 0) return 'arret'
      return 'inconnu'
    }
    case 'registre':
    case 'vanne_2v':
    case 'vanne_3v':
    case 'recup_plaques':
    case 'caisson_melange':
    case 'batterie_chaude':
    case 'batterie_froide':
    case 'isolement': {
      const p = positionModule(id, lire)
      if (p == null) return m.k === 'batterie_chaude' || m.k === 'batterie_froide' ? 'inconnu' : 'inconnu'
      return intermediaire(p) ? 'modulant' : p >= 98 ? 'ouvert' : 'ferme'
    }
    case 'filtre_plan':
    case 'filtre_poches':
    case 'filtre':
      return lire(id, 'colmatage') === 1 ? 'defaut' : 'ok'
    default:
      return 'ok'
  }
}

/** l'élément tourne : au moins un ventilateur / roue / pompe / générateur en marche */
export function enMarche(places: ModulePlace[], lire: Lecteur, rangee?: number): boolean {
  return places.some(({ m, rangee: r }) => (rangee == null || r === rangee) && MOTEURS_CVC.includes(m.k) && lire(m.id, 'marche') === 1)
}

/** état global d'un bandeau (affichage de l'élément et des alarmes) */
export function etatGlobal(type: TypeCvc, params: (ParamsCta & ParamsHydro) | undefined, lire: Lecteur): 'defaut' | 'marche' | 'arret' | 'ok' | 'inconnu' {
  const places = modulesDe(type, params)
  const etats = places.map(({ m }) => etatModule(m, lire))
  if (etats.includes('defaut')) return 'defaut'
  const moteurs = places.filter(({ m }) => MOTEURS_CVC.includes(m.k)).map(({ m }) => etatModule(m, lire))
  if (moteurs.includes('marche') || moteurs.includes('modulant')) return 'marche'
  if (moteurs.includes('arret')) return 'arret'
  return etats.some((e) => e !== 'inconnu' && e !== 'ok') ? 'ok' : 'inconnu'
}

export function libelleModule(m: ModuleCvc, type: TypeCvc): string {
  if (m.libelle) return m.libelle
  const d = defsDe(type)[m.k]
  return d && d.court === '' ? '' : d?.court || m.id
}

/* ------------------------------------------------------------------ résumé mobile */

export type FamillePictoCvc = 'ventilateur' | 'registre' | 'batterie' | 'roue' | 'flamme' | 'pompe' | 'vanne' | 'filtre'
export interface CarteCvc {
  /** identifiant stable de la carte */
  id: string
  titre: string
  etat: 'marche' | 'arret' | 'defaut' | 'ok' | 'inconnu'
  /** modules en défaut (id → libellé) */
  defauts: string[]
  pictos: Array<{ id: string; famille: FamillePictoCvc; etat: EtatModule; libelle: string }>
  valeurs: Array<{ libelle: string; base: string; idModule: string; valeur: number }>
  modules: string[]
}

const GROUPES_CTA: Array<{ id: string; titre: string; ks: string[] }> = [
  { id: 'filtres', titre: 'Filtres et registres', ks: ['registre', 'filtre_plan', 'filtre_poches'] },
  { id: 'recuperation', titre: 'Récupération', ks: ['recup_plaques', 'recup_roue', 'caisson_melange'] },
  { id: 'batteries', titre: 'Batteries', ks: ['batterie_chaude', 'batterie_froide', 'batterie_elec', 'humidificateur'] },
]

const LIB_VALEUR: Record<string, string> = { temperature: 'Température', entree_t: 'T entrée', sortie_t: 'T sortie', frequence: 'Fréquence', vitesse: 'Vitesse', position: 'Position', dp: 'Pression diff.', humidite: 'Humidité', co2: 'CO₂', puissance: 'Puissance', energie: 'Énergie', debit: 'Débit', pression: 'Pression' }

/**
 * Cartes du résumé mobile pour un élément CVC. CTA : Soufflage (ventilateur du bas + module de soufflage), Reprise (ventilateur du haut),
 * Récupération, Batteries, Filtres et registres. Hydraulique : une carte par départ (rangée), plus la production.
 */
export function cartesCvc(type: TypeCvc, params: (ParamsCta & ParamsHydro) | undefined, lire: Lecteur, nomElement: string): CarteCvc[] {
  const defs = defsDe(type)
  const places = modulesDe(type, params)
  const cartes: CarteCvc[] = []
  const construire = (id: string, titre: string, ps: ModulePlace[], valeursVoulues?: (p: ModulePlace) => string[]): void => {
    if (!ps.length) return
    const pictos: CarteCvc['pictos'] = []
    const valeurs: CarteCvc['valeurs'] = []
    const defauts: string[] = []
    const etats = ps.map(({ m }) => etatModule(m, lire))
    ps.forEach((p, i) => {
      const d = defs[p.m.k]
      if (etats[i] === 'defaut') defauts.push(libelleModule(p.m, type))
      if (d?.picto && pictos.length < 4) pictos.push({ id: `${nomElement}:${p.m.id}`, famille: d.picto, etat: etats[i], libelle: libelleModule(p.m, type) })
      const voulues = valeursVoulues ? valeursVoulues(p) : d?.mesures ?? []
      for (const b of voulues) {
        const x = lire(p.m.id, b)
        // vitesse (%) et fréquence (Hz) disent la même chose : la fréquence est préférée
        if (b === 'vitesse' && lire(p.m.id, 'frequence') != null) continue
        if (x != null && valeurs.length < 3 && !valeurs.some((v) => v.idModule === p.m.id && v.base === b)) {
          const qualif = ps.filter((q) => q.m.k === p.m.k).length < ps.length && ps.length > 1 && !['ventilateur'].includes(p.m.k) ? `${libelleModule(p.m, type)} · ` : ''
          valeurs.push({ libelle: qualif + (LIB_VALEUR[b] ?? b), base: b, idModule: p.m.id, valeur: x })
        }
      }
    })
    const moteurs = ps.filter(({ m }) => MOTEURS_CVC.includes(m.k)).map(({ m }) => etatModule(m, lire))
    let etat: CarteCvc['etat'] = 'inconnu'
    if (defauts.length) etat = 'defaut'
    else if (moteurs.includes('marche') || moteurs.includes('modulant')) etat = 'marche'
    else if (moteurs.includes('arret')) etat = 'arret'
    else if (etats.some((e) => e !== 'inconnu') || valeurs.length) etat = 'ok'
    cartes.push({ id: `${nomElement}:${id}`, titre, etat, defauts, pictos, valeurs, modules: ps.map(({ m }) => m.id) })
  }

  if (type === 'cta') {
    const dbl = (params?.flux ?? 'simple') === 'double'
    const ventilos = places.filter(({ m }) => m.k === 'ventilateur' || m.k === 'plug_fan')
    const ventBas = ventilos.filter((p) => p.etage === 'bas')
    const ventHaut = ventilos.filter((p) => p.etage === 'haut')
    const modBas = (k: string) => places.filter((p) => p.m.k === k && p.etage === 'bas')
    const modHaut = (k: string) => places.filter((p) => p.m.k === k && p.etage === 'haut')
    // soufflage : ventilateur(s) du bas, modules de soufflage et sondes de l'étage bas (T, humidité, Hz)
    construire('soufflage', 'Soufflage', [...ventBas, ...modBas('soufflage')], (p) => (p.m.k === 'ventilateur' || p.m.k === 'plug_fan' ? ['frequence', 'vitesse'] : ['temperature', 'humidite']))
    // reprise : seulement si une reprise ou un ventilateur existe côté extraction
    const repr = [...ventHaut, ...modHaut('reprise')]
    construire('reprise', 'Reprise', dbl ? repr : [...modBas('reprise')], (p) => (p.m.k === 'ventilateur' || p.m.k === 'plug_fan' ? ['frequence', 'vitesse'] : ['temperature', 'co2']))
    for (const g of GROUPES_CTA) {
      construire(g.id, g.titre, places.filter((p) => g.ks.includes(p.m.k)), (p) => {
        if (['batterie_chaude', 'batterie_froide', 'batterie_elec'].includes(p.m.k)) return ['sortie_t', 'position']
        if (p.m.k === 'registre') return []
        return defs[p.m.k]?.mesures ?? []
      })
    }
    // modules sans carte (air neuf, rejet, sondes isolées…) : tombent dans « Autres mesures » seulement s'ils portent des valeurs
    const dejaVus = new Set(cartes.flatMap((c) => c.modules))
    const reste = places.filter((p) => !dejaVus.has(p.m.id) && ['air_neuf', 'rejet', 'sonde'].includes(p.m.k))
    construire('air', 'Air neuf et rejet', reste.filter((p) => p.m.k !== 'sonde'))
  } else {
    const rangees = params?.rangees ?? []
    rangees.forEach((r, i) => {
      const ps = places.filter((p) => p.rangee === i)
      const titre = r.libelle || r.id || `Départ ${i + 1}`
      construire(`r${i + 1}`, titre, ps, (p) => (['sonde_t', 'compteur', 'chaudiere', 'pac', 'bouteille', 'ballon_ecs', 'depart', 'arrivee', 'echangeur', 'debitmetre', 'emetteur', 'pompe_double'].includes(p.m.k) || p.m.k === 'vanne_3v' || p.m.k === 'pompe' ? defs[p.m.k]?.mesures ?? [] : []))
    })
  }
  return cartes
}

/* ------------------------------------------------------------------ ports, alarmes, édition */

export interface PortCvc {
  x: number
  y: number
  side: 'N' | 'S' | 'E' | 'W'
}

/** ports de raccordement d'un bandeau (sur l'axe de l'étage bas, ou sur la ligne aller / retour) */
export function portsCvc(type: TypeCvc, params: (ParamsCta & ParamsHydro) | undefined): Record<string, PortCvc> {
  if (type === 'cta') {
    const g = disposerCta(params)
    return {
      in: { x: 0, y: g.yBas + GAINE.axe, side: 'W' },
      out: { x: g.w, y: g.yBas + GAINE.axe, side: 'E' },
      ...(g.double ? { p3: { x: g.w, y: GAINE.axe, side: 'E' as const }, p4: { x: 0, y: GAINE.axe, side: 'W' as const } } : {}),
    }
  }
  const g = disposerHydro(params)
  return {
    in: { x: 0, y: HYDRO.aller, side: 'W' },
    out: { x: g.w, y: HYDRO.aller, side: 'E' },
    p3: { x: g.w, y: HYDRO.retour, side: 'E' },
    p4: { x: 0, y: HYDRO.retour, side: 'W' },
  }
}

/** texte d'alarme d'un module en défaut (liste d'alarmes, résumé mobile) */
export function texteAlarmeModule(m: ModuleCvc, type: TypeCvc, lire: Lecteur): string {
  const nom = libelleModule(m, type)
  if (lire(m.id, 'antigel') === 1) return `Antigel ${nom.toLowerCase()}`
  if (lire(m.id, 'colmatage') === 1) return `${nom} colmaté`
  return `Défaut ${nom.toLowerCase()}`
}

/** copie profonde (les paramètres sont du JSON) */
const copie = <T,>(o: T): T => JSON.parse(JSON.stringify(o))

/** ajoute un module à une CTA ; retourne le nouvel identifiant. En double flux, `etage` choisit l'étage ; un module double crée sa colonne. */
export function ajouterModuleCta(p: ParamsCta, k: string, etage: 'haut' | 'bas' = 'bas', apresColonne?: number): ModuleCvc {
  const def = MODULES_CTA[k]
  p.colonnes = p.colonnes ?? []
  const m: ModuleCvc = { id: idModuleLibre('cta', p as ParamsCta & ParamsHydro, k), k }
  const double = (p.flux ?? 'simple') === 'double'
  const col: ColonneCta = {}
  if (def?.double && double) col.double = m
  else if (double && etage === 'haut') col.haut = m
  else col.bas = m
  const i = apresColonne == null ? p.colonnes.length : Math.max(0, Math.min(p.colonnes.length, apresColonne + 1))
  // en double flux, un module simple prend l'étage libre de la dernière colonne plutôt que d'en créer une
  const dernier = p.colonnes[p.colonnes.length - 1]
  if (apresColonne == null && double && !def?.double && dernier && !dernier.double && !dernier[etage]) dernier[etage] = m
  else p.colonnes.splice(i, 0, col)
  return m
}

/** supprime un module (la colonne disparaît quand elle est vide) */
export function supprimerModuleCta(p: ParamsCta, idModule: string): boolean {
  const cols = p.colonnes ?? []
  for (const c of cols) {
    for (const e of ['haut', 'bas', 'double'] as const) {
      if (c[e]?.id === idModule) {
        c[e] = null
        if (!c.haut && !c.bas && !c.double) cols.splice(cols.indexOf(c), 1)
        return true
      }
    }
  }
  return false
}

/** déplace la colonne qui porte le module d'un cran (-1 = vers la gauche, +1 = vers la droite) */
export function deplacerModuleCta(p: ParamsCta, idModule: string, dir: -1 | 1): boolean {
  const cols = p.colonnes ?? []
  const i = cols.findIndex((c) => c.haut?.id === idModule || c.bas?.id === idModule || c.double?.id === idModule)
  const j = i + dir
  if (i < 0 || j < 0 || j >= cols.length) return false
  ;[cols[i], cols[j]] = [cols[j], cols[i]]
  return true
}

/** passage simple ↔ double flux : en simple flux l'étage haut et les modules doubles sont conservés dans le document mais non affichés */
export function ajouterModuleHydro(p: ParamsHydro, k: string, rangee = 0): ModuleCvc {
  p.rangees = p.rangees ?? [{ modules: [] }]
  const r = p.rangees[Math.max(0, Math.min(rangee, p.rangees.length - 1))]
  const m: ModuleCvc = { id: idModuleLibre('hydro', p as ParamsCta & ParamsHydro, k), k }
  r.modules.push(m)
  return m
}
export function supprimerModuleHydro(p: ParamsHydro, idModule: string): boolean {
  for (const r of p.rangees ?? []) {
    const i = r.modules.findIndex((m) => m.id === idModule)
    if (i >= 0) {
      r.modules.splice(i, 1)
      return true
    }
  }
  return false
}
export function deplacerModuleHydro(p: ParamsHydro, idModule: string, dir: -1 | 1): boolean {
  for (const r of p.rangees ?? []) {
    const i = r.modules.findIndex((m) => m.id === idModule)
    if (i < 0) continue
    const j = i + dir
    if (j < 0 || j >= r.modules.length) return false
    ;[r.modules[i], r.modules[j]] = [r.modules[j], r.modules[i]]
    return true
  }
  return false
}
export function ajouterRangeeHydro(p: ParamsHydro): RangeeHydro {
  p.rangees = p.rangees ?? []
  const r: RangeeHydro = { id: `D${p.rangees.length + 1}`, libelle: `Départ ${p.rangees.length + 1}`, modules: [] }
  p.rangees.push(r)
  return r
}
export function supprimerRangeeHydro(p: ParamsHydro, i: number): boolean {
  if (!p.rangees || i < 0 || i >= p.rangees.length || p.rangees.length < 2) return false
  p.rangees.splice(i, 1)
  return true
}

/** cherche un module par identifiant (pour modifier son libellé, sa ligne…) */
export function trouverModule(type: TypeCvc, p: ParamsCta & ParamsHydro | undefined, id: string): ModuleCvc | null {
  return modulesDe(type, p).find(({ m }) => m.id === id)?.m ?? null
}

/** aligne les emplacements d'un équipement sur ses modules : ajoute les manquants, retire ceux des modules supprimés */
export function synchroniserSlots(type: TypeCvc, params: (ParamsCta & ParamsHydro) | undefined, slots: Record<string, Record<string, unknown>>, vide: () => Record<string, unknown>): void {
  const attendus = nomsSlotsAttendus(type, params)
  const set = new Set(attendus)
  for (const nom of Object.keys(slots)) if (!set.has(nom)) delete slots[nom]
  // l'ordre suit celui des modules (le panneau liste les emplacements dans cet ordre)
  const ordonne: Record<string, Record<string, unknown>> = {}
  for (const nom of attendus) ordonne[nom] = slots[nom] ?? vide()
  for (const nom of Object.keys(slots)) delete slots[nom]
  Object.assign(slots, ordonne)
}

/* ------------------------------------------------------------------ gabarits de la palette */

const mod = (id: string, k: string, extra: Partial<ModuleCvc> = {}): ModuleCvc => ({ id, k, ...extra })
const col = (c: ColonneCta): ColonneCta => c

/** CTA simple flux prête à l'emploi : prise d'air, registre, filtre, batterie chaude, batterie froide, ventilateur, soufflage */
export const GABARIT_CTA_SIMPLE = (): ParamsCta => ({
  flux: 'simple',
  colonnes: [
    col({ bas: mod('AN1', 'air_neuf') }), col({ bas: mod('TA1', 'registre') }), col({ bas: mod('FS1', 'filtre_plan') }),
    col({ bas: mod('BC1', 'batterie_chaude') }), col({ bas: mod('BF1', 'batterie_froide') }), col({ bas: mod('VE1', 'ventilateur') }), col({ bas: mod('SF1', 'soufflage') }),
  ],
})

/** CTA double flux : étage bas = soufflage (air neuf → récupérateur → batteries → ventilateur), étage haut = extraction (reprise → ventilateur → récupérateur → rejet) */
export const GABARIT_CTA_DOUBLE = (): ParamsCta => ({
  flux: 'double',
  colonnes: [
    col({ haut: mod('RJ1', 'rejet'), bas: mod('AN1', 'air_neuf') }),
    col({ haut: mod('TA2', 'registre'), bas: mod('TA1', 'registre') }),
    col({ double: mod('RC1', 'recup_plaques') }),
    col({ haut: mod('VE2', 'ventilateur'), bas: mod('BC1', 'batterie_chaude') }),
    col({ haut: mod('FR1', 'filtre_plan'), bas: mod('BF1', 'batterie_froide') }),
    col({ haut: mod('RP1', 'reprise'), bas: mod('VE1', 'ventilateur') }),
    col({ bas: mod('SF1', 'soufflage') }),
  ],
})

/** bloc chaufferie : une chaudière, sa pompe, un départ réseau */
export const GABARIT_CHAUFFERIE = (): ParamsHydro => ({
  rangees: [{ id: 'D1', libelle: 'Départ 1', modules: [mod('CH1', 'chaudiere'), mod('PO1', 'pompe'), mod('VI1', 'isolement'), mod('DE1', 'depart')] }],
})

/** collecteur à deux départs : pompe + vanne 3 voies sur chacun */
export const GABARIT_COLLECTEUR = (): ParamsHydro => ({
  rangees: [
    { id: 'D1', libelle: 'Départ 1', modules: [mod('PO1', 'pompe'), mod('V31', 'vanne_3v'), mod('TT1', 'sonde_t'), mod('DE1', 'depart')] },
    { id: 'D2', libelle: 'Départ 2', modules: [mod('PO2', 'pompe'), mod('V32', 'vanne_3v'), mod('TT2', 'sonde_t'), mod('DE2', 'depart')] },
  ],
})

export const clonerParams = copie

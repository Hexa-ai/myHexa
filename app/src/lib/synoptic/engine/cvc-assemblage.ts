// Assemblage module par module des CTA et des départs hydrauliques (famille CVC 2D).
// Fonctions pures, sans DOM : calcul de l'emplacement d'insertion sous le pointeur, insertion, déplacement, catalogue des modules
// proposés par la palette. Le moteur (moteur.ts) ne fait que brancher la souris sur ces fonctions.
// Les coordonnées sont locales à l'élément (origine = coin haut-gauche du bandeau).
import {
  GAINE, HAUTEUR_ETAGE, HYDRO, MODULES_CTA, MODULES_HYDRO, defsDe, disposerCta, disposerHydro, idModuleLibre, modulesDe,
  type ColonneCta, type LigneEau, type ModuleCvc, type ParamsCta, type ParamsHydro, type TypeCvc,
} from './cvc-modele'

type Params = ParamsCta & ParamsHydro

/* ------------------------------------------------------------------ catalogue de la palette */

/** un module proposé par la palette : `cle` = clé de palette (« cta:registre », « hyd:vanne_3v ») */
export interface ModulePalette {
  cle: string
  type: TypeCvc
  /** clé du catalogue de modules (MODULES_CTA / MODULES_HYDRO) ; absente pour « Départ » */
  k?: string
  nom: string
  famille: string
  /** réglages posés avec le module (ex. la sonde « retour » est posée sur la ligne retour) */
  preset?: Partial<ModuleCvc>
  /** vrai : ajoute un départ (rangée) au lieu d'un module */
  rangee?: boolean
}

export const FAMILLE_MODULES_CTA = 'CVC · modules de CTA'
export const FAMILLE_MODULES_HYDRO = 'Hydraulique · modules de départ'

const NOMS_CTA: Record<string, string> = {
  air_neuf: 'Prise d’air neuf', reprise: 'Reprise', soufflage: 'Soufflage', rejet: 'Rejet d’air', registre: 'Registre motorisé',
  filtre_plan: 'Filtre plan', filtre_poches: 'Filtre à poches', batterie_chaude: 'Batterie chaude', batterie_froide: 'Batterie froide',
  batterie_elec: 'Batterie électrique', humidificateur: 'Humidificateur', piege_son: 'Piège à son', recup_plaques: 'Récupérateur à plaques',
  recup_roue: 'Roue de récupération', caisson_melange: 'Caisson de mélange', ventilateur: 'Ventilateur', plug_fan: 'Plug fan', sonde: 'Sonde de gaine', gaine: 'Gaine',
}
const ORDRE_CTA = ['air_neuf', 'registre', 'filtre_plan', 'filtre_poches', 'recup_plaques', 'recup_roue', 'caisson_melange', 'batterie_chaude', 'batterie_froide', 'batterie_elec', 'humidificateur', 'ventilateur', 'plug_fan', 'piege_son', 'sonde', 'gaine', 'soufflage', 'reprise', 'rejet']

const NOMS_HYDRO: Record<string, string> = {
  pompe: 'Circulateur simple', pompe_double: 'Circulateur double', vanne_2v: 'Vanne 2 voies', vanne_3v: 'Vanne 3 voies', debitmetre: 'Débitmètre',
  compteur: 'Compteur d’énergie', isolement: 'Vannes d’isolement', clapet: 'Clapet anti-retour', filtre: 'Filtre', purgeur: 'Purgeur d’air',
  emetteur: 'Émetteur', chaudiere: 'Chaudière', pac: 'Pompe à chaleur', echangeur: 'Échangeur', bouteille: 'Bouteille de découplage', ballon_ecs: 'Ballon ECS',
  vase: 'Vase d’expansion', pot_boue: 'Pot à boue', depart: 'Départ réseau', arrivee: 'Arrivée', tuyau: 'Tuyauterie',
}
const ORDRE_HYDRO = ['vanne_3v', 'vanne_2v', 'pompe', 'pompe_double', 'debitmetre', 'compteur', 'sonde_t_aller', 'sonde_t_retour', 'isolement', 'clapet', 'filtre', 'purgeur', 'emetteur', 'pot_boue', 'vase', 'bouteille', 'echangeur', 'ballon_ecs', 'chaudiere', 'pac', 'depart', 'arrivee', 'tuyau']

/** tous les modules de la palette, dans l'ordre d'affichage : CTA, puis hydraulique (départ en tête) */
export const MODULES_PALETTE: ModulePalette[] = [
  ...ORDRE_CTA.map((k): ModulePalette => ({ cle: `cta:${k}`, type: 'cta', k, nom: NOMS_CTA[k] ?? MODULES_CTA[k].nom, famille: FAMILLE_MODULES_CTA })),
  { cle: 'hyd:rangee', type: 'hydro', nom: 'Nouveau départ', famille: FAMILLE_MODULES_HYDRO, rangee: true },
  ...ORDRE_HYDRO.map((id): ModulePalette => {
    const aller = id === 'sonde_t_aller', retour = id === 'sonde_t_retour'
    const k = aller || retour ? 'sonde_t' : id
    return {
      cle: `hyd:${id}`, type: 'hydro', k,
      nom: aller ? 'Sonde T aller' : retour ? 'Sonde T retour' : (NOMS_HYDRO[id] ?? MODULES_HYDRO[id].nom),
      famille: FAMILLE_MODULES_HYDRO,
      ...(aller ? { preset: { ligne: 'aller' as LigneEau } } : retour ? { preset: { ligne: 'retour' as LigneEau } } : {}),
    }
  }),
]

export const moduleDePalette = (cle: string): ModulePalette | undefined => MODULES_PALETTE.find((m) => m.cle === cle)
export const estCleModule = (cle: unknown): boolean => typeof cle === 'string' && /^(cta|hyd):/.test(cle) && !!moduleDePalette(cle)

/** gabarits « modèles de départ » : section à part de la palette (les clés historiques cta_simple, cta_double, chaufferie, collecteur) */
export const MODELES_DE_DEPART = ['cta_simple', 'cta_double', 'chaufferie', 'collecteur'] as const

/* ------------------------------------------------------------------ création d'un élément à partir d'un module */

/** paramètres d'une CTA d'un seul module (simple flux, sauf module qui n'a de sens qu'en double flux) */
export function paramsCtaDepuisModule(k: string): ParamsCta {
  const p: ParamsCta = { flux: 'simple', colonnes: [] }
  const m: ModuleCvc = { id: idModuleLibre('cta', p as Params, k), k }
  p.colonnes!.push({ bas: m })
  return p
}

/** paramètres d'un bloc hydraulique d'un départ : vide (module `undefined`) ou avec le module posé */
export function paramsHydroDepuisModule(entree?: ModulePalette): ParamsHydro {
  const p: ParamsHydro = { rangees: [{ id: 'D1', libelle: 'Départ 1', modules: [] }] }
  if (entree?.k) insererModuleHydro(p, entree.k, { rangee: 0, index: 0, ligne: entree.preset?.ligne ?? 'aller' }, entree.preset)
  return p
}

/* ------------------------------------------------------------------ CTA */

/** emplacement d'insertion dans une CTA : entre deux colonnes (`colonne` = index d'insertion), ou dans l'étage libre d'une colonne (`remplir`) */
export interface EmplacementCta {
  colonne: number
  etage: 'haut' | 'bas'
  /** index de la colonne dont l'étage libre est comblé (double flux) */
  remplir?: number
  /** abscisse du repère d'insertion (locale) */
  x: number
}

/** emplacement sous le point local (lx, ly) pour un module `k` ; l'aimantation se fait au bord de colonne le plus proche */
export function emplacementCta(p: ParamsCta | undefined, lx: number, ly: number, k?: string): EmplacementCta {
  const g = disposerCta(p)
  const etage: 'haut' | 'bas' = g.double && ly < HAUTEUR_ETAGE ? 'haut' : 'bas'
  const def = k ? MODULES_CTA[k] : undefined
  const cell = g.cellules.find((c) => lx >= c.x && lx < c.x + c.w)
  // étage libre d'une colonne de double flux : un module simple s'y loge quand on vise le milieu de la colonne
  if (cell && g.double && !cell.double && !def?.double && !cell[etage] && lx > cell.x + cell.w * 0.25 && lx < cell.x + cell.w * 0.75) {
    return { colonne: cell.index, etage, remplir: cell.index, x: cell.x + cell.w / 2 }
  }
  const bords = [0, ...g.cellules.map((c) => c.x + c.w)]
  let mieux = 0
  bords.forEach((b, i) => { if (Math.abs(b - lx) < Math.abs(bords[mieux] - lx)) mieux = i })
  return { colonne: mieux, etage, x: bords[mieux] }
}

/** insère un module (clé du catalogue) à l'emplacement donné ; retourne le module créé */
export function insererModuleCta(p: ParamsCta, k: string, emp: EmplacementCta, preset?: Partial<ModuleCvc>): ModuleCvc {
  p.colonnes = p.colonnes ?? []
  const double = (p.flux ?? 'simple') === 'double'
  const m: ModuleCvc = { id: idModuleLibre('cta', p as Params, k), k, ...preset }
  placerModuleCta(p, m, emp, double)
  return m
}

function placerModuleCta(p: ParamsCta, m: ModuleCvc, emp: EmplacementCta, double: boolean): void {
  const cols = p.colonnes!
  const def = MODULES_CTA[m.k]
  if (emp.remplir != null && cols[emp.remplir] && double && !def?.double && !cols[emp.remplir].double && !cols[emp.remplir][emp.etage]) {
    cols[emp.remplir][emp.etage] = m
    return
  }
  const col: ColonneCta = {}
  if (def?.double && double) col.double = m
  else if (double && emp.etage === 'haut') col.haut = m
  else col.bas = m
  cols.splice(Math.max(0, Math.min(cols.length, emp.colonne)), 0, col)
}

/** retrouve la colonne et l'étage d'un module */
function ouEstCta(p: ParamsCta, id: string): { col: ColonneCta; etage: 'haut' | 'bas' | 'double' } | null {
  for (const col of p.colonnes ?? []) for (const e of ['haut', 'bas', 'double'] as const) if (col[e]?.id === id) return { col, etage: e }
  return null
}

/** déplace un module existant (son identifiant, donc ses variables, est conservé) ; retourne faux si rien ne change */
export function deplacerModuleCtaVers(p: ParamsCta, idModule: string, emp: EmplacementCta): boolean {
  const cols = p.colonnes ?? []
  const src = ouEstCta(p, idModule)
  if (!src) return false
  const m = src.col[src.etage]!
  const double = (p.flux ?? 'simple') === 'double'
  const colRef = emp.remplir != null ? cols[emp.remplir] : cols[emp.colonne]   // colonne visée (undefined = fin de bandeau)
  const iSource = cols.indexOf(src.col)
  if (emp.remplir != null && colRef === src.col) return false
  // déposé juste avant ou juste après sa propre colonne (seule occupante) : rien ne change
  const seul = [src.col.haut, src.col.bas, src.col.double].filter(Boolean).length === 1
  if (emp.remplir == null && seul && (emp.colonne === iSource || emp.colonne === iSource + 1)) return false
  // retrait
  src.col[src.etage] = null
  const vide = !src.col.haut && !src.col.bas && !src.col.double
  if (vide) cols.splice(iSource, 1)
  // nouvel index d'insertion, recalculé sur la colonne de référence (les indices ont pu glisser)
  let index: number
  if (!colRef) index = cols.length
  else if (cols.includes(colRef)) index = cols.indexOf(colRef)
  else index = iSource   // la colonne de référence était celle d'origine, supprimée parce que vide
  placerModuleCta(p, m, { ...emp, colonne: index, remplir: emp.remplir != null && colRef ? cols.indexOf(colRef) : undefined }, double)
  return true
}

/** rectangle (local) de l'indicateur d'insertion d'une CTA : trait vertical au bord, ou cadre de l'étage libre */
export function indicateurCta(p: ParamsCta | undefined, emp: EmplacementCta, k?: string): { x: number; y: number; w: number; h: number; trait: boolean } {
  const g = disposerCta(p)
  const ym = emp.etage === 'haut' ? 0 : g.yBas
  if (emp.remplir != null) {
    const c = g.cellules[emp.remplir]
    return { x: c.x, y: ym + GAINE.haut, w: c.w, h: GAINE.bas - GAINE.haut, trait: false }
  }
  const dbl = !!(k && MODULES_CTA[k]?.double && g.double)
  return dbl ? { x: emp.x, y: 0, w: 0, h: g.h, trait: true } : { x: emp.x, y: ym + GAINE.haut - 6, w: 0, h: GAINE.bas - GAINE.haut + 12, trait: true }
}

/* ------------------------------------------------------------------ hydraulique */

export interface EmplacementHydro {
  rangee: number
  /** position dans la rangée (0 = avant le premier module) */
  index: number
  ligne: LigneEau
  x?: number
}

/** emplacement sous le point local (lx, ly) : rangée visée, bord de module le plus proche, ligne (aller en haut, retour en bas) */
export function emplacementHydro(p: ParamsHydro | undefined, lx: number, ly: number): EmplacementHydro {
  const g = disposerHydro(p)
  const n = Math.max(1, g.rangees.length)
  const rangee = Math.max(0, Math.min(n - 1, Math.floor(ly / HAUTEUR_ETAGE)))
  const r = g.rangees[rangee]
  const ligne: LigneEau = ly - rangee * HAUTEUR_ETAGE > (HYDRO.aller + HYDRO.retour) / 2 ? 'retour' : 'aller'
  if (!r) return { rangee: 0, index: 0, ligne, x: g.marge }
  const bords = [r.cellules.length ? r.cellules[0].x : g.marge, ...r.cellules.map((c) => c.x + c.w)]
  let mieux = 0
  bords.forEach((b, i) => { if (Math.abs(b - lx) < Math.abs(bords[mieux] - lx)) mieux = i })
  return { rangee, index: mieux, ligne, x: bords[mieux] }
}

/** insère un module sur une rangée ; les modules « sur ligne » prennent la ligne visée (aller / retour) sauf réglage imposé par `preset` */
export function insererModuleHydro(p: ParamsHydro, k: string, emp: EmplacementHydro, preset?: Partial<ModuleCvc>): ModuleCvc {
  p.rangees = p.rangees?.length ? p.rangees : [{ id: 'D1', libelle: 'Départ 1', modules: [] }]
  const r = p.rangees[Math.max(0, Math.min(emp.rangee, p.rangees.length - 1))]
  const m: ModuleCvc = { id: idModuleLibre('hydro', p as Params, k), k, ...preset }
  const def = MODULES_HYDRO[k]
  if (def?.ligne && !preset?.ligne) m.ligne = emp.ligne
  r.modules.splice(Math.max(0, Math.min(r.modules.length, emp.index)), 0, m)
  return m
}

/** déplace un module d'un départ vers un autre (ou dans le même) ; sa ligne suit la position visée */
export function deplacerModuleHydroVers(p: ParamsHydro, idModule: string, emp: EmplacementHydro): boolean {
  const rangees = p.rangees ?? []
  const ri = rangees.findIndex((r) => r.modules.some((m) => m.id === idModule))
  if (ri < 0) return false
  const src = rangees[ri]
  const mi = src.modules.findIndex((m) => m.id === idModule)
  const m = src.modules[mi]
  const cible = rangees[Math.max(0, Math.min(emp.rangee, rangees.length - 1))]
  let index = emp.index
  if (cible === src && mi < index) index--
  const memeLigne = !MODULES_HYDRO[m.k]?.ligne || (m.ligne ?? 'aller') === emp.ligne
  if (cible === src && index === mi && memeLigne) return false
  src.modules.splice(mi, 1)
  if (MODULES_HYDRO[m.k]?.ligne) m.ligne = emp.ligne
  cible.modules.splice(Math.max(0, Math.min(cible.modules.length, index)), 0, m)
  return true
}

/** rectangle (local) de l'indicateur d'insertion d'un bloc hydraulique : trait vertical sur la rangée, sur la ligne visée */
export function indicateurHydro(emp: EmplacementHydro): { x: number; y: number; w: number; h: number } {
  const y0 = emp.rangee * HAUTEUR_ETAGE
  const yl = y0 + (emp.ligne === 'retour' ? HYDRO.retour : HYDRO.aller)
  return { x: emp.x ?? 0, y: yl - 26, w: 0, h: 52 }
}

/* ------------------------------------------------------------------ utilitaires communs */

/** nombre de modules d'un élément CVC (0 : l'élément n'a plus de raison d'être) */
export const nombreModules = (type: TypeCvc, p: Params | undefined): number => modulesDe(type, p).length

/** le module existe-t-il dans le catalogue du type ? */
export const moduleConnu = (type: TypeCvc, k: string): boolean => !!defsDe(type)[k]

/** ajoute un départ à un bloc hydraulique (un départ seul reste possible : on n'en retire jamais le premier) */
export function ajouterDepart(p: ParamsHydro): number {
  p.rangees = p.rangees ?? []
  const n = p.rangees.length + 1
  let i = n
  const pris = new Set(p.rangees.map((r) => r.id))
  while (pris.has(`D${i}`)) i++
  p.rangees.push({ id: `D${i}`, libelle: `Départ ${n}`, modules: [] })
  return p.rangees.length - 1
}

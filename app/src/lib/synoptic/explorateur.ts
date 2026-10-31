// Explorateur de bibliothèque de symboles : logique pure (arbre des familles, filtres, compteurs, détail d'un symbole).
// Le composant (SynopticExplorateur.vue) ne fait que l'affichage ; tout ce qui se teste est ici, sans DOM.
import { chercher, type Contexte, type Entree } from './recherche'
import { FAMILLE_MA_BIBLIOTHEQUE } from './bibliotheque'
import type { EtatNom, SymboleDef } from './iso/lib/types'

/** évènement de fenêtre qui demande l'ouverture de l'explorateur (émis par la palette 2D, qui vit hors de Vue) */
export const EVT_EXPLORATEUR = 'myhexa:explorateur'

export type Filtre = 'tout' | '2d' | 'iso'

/** nœuds de l'arbre : « tout », « favoris », « recents », « fam:<famille> », « lib » (ma bibliothèque) ou « lib:<id> » (une bibliothèque importée) */
export type NoeudId = string
export const NOEUD_TOUT: NoeudId = 'tout'
export const NOEUD_FAVORIS: NoeudId = 'favoris'
export const NOEUD_RECENTS: NoeudId = 'recents'
export const NOEUD_BIBLIO: NoeudId = 'lib'
/** tous les symboles du catalogue (hors bibliothèques importées) */
export const NOEUD_FAMILLES: NoeudId = 'familles'
export const noeudFamille = (nom: string): NoeudId => `fam:${nom}`
export const noeudBiblio = (id: string): NoeudId => `lib:${id}`

export interface Noeud {
  id: NoeudId
  libelle: string
  nombre: number
  /** enfants repliables (familles, bibliothèques importées) */
  enfants?: Noeud[]
}

export interface OptionsExplorateur {
  filtre: Filtre
  requete: string
  favoris: readonly string[]
  recents: readonly string[]
  contexte: Contexte
}

const estBiblio = (e: Entree): boolean => e.famille === FAMILLE_MA_BIBLIOTHEQUE
/** identifiant de la bibliothèque importée d'une entrée (« lib:<biblio>/<symbole> ») */
export const biblioDe = (e: Entree): string => /^lib:([^/]+)\//.exec(e.id)?.[1] ?? ''

const passeFiltre = (e: Entree, f: Filtre): boolean => f === 'tout' || e.contexte === f

/** symboles visibles avant le choix d'un nœud : filtre 2D / Iso / Tout, puis recherche (index du Spotlight) */
export function symbolesVisibles(entrees: readonly Entree[], o: OptionsExplorateur): Entree[] {
  const syms = entrees.filter((e) => e.genre === 'symbole' && passeFiltre(e, o.filtre))
  if (!o.requete.trim()) {
    // sans requête : ordre du catalogue, stable ; les familles restent groupées dans l'ordre d'apparition
    return syms
  }
  return chercher(syms, o.requete, { contexte: o.contexte, portee: 'tout', favoris: o.favoris, recents: o.recents, limite: 2000 }).map((r) => r.entree)
}

/** applique le nœud choisi (favoris et récents suivent l'ordre de leur liste) */
export function selonNoeud(visibles: readonly Entree[], noeud: NoeudId, o: Pick<OptionsExplorateur, 'favoris' | 'recents'>, trier = false): Entree[] {
  if (noeud === NOEUD_TOUT) return [...visibles]
  if (noeud === NOEUD_FAVORIS || noeud === NOEUD_RECENTS) {
    const liste = noeud === NOEUD_FAVORIS ? o.favoris : o.recents
    const par = new Map(visibles.map((e) => [e.cle, e]))
    if (trier) return visibles.filter((e) => liste.includes(e.cle))
    return liste.flatMap((c) => (par.has(c) ? [par.get(c)!] : []))
  }
  if (noeud === NOEUD_FAMILLES) return visibles.filter((e) => !estBiblio(e))
  if (noeud === NOEUD_BIBLIO) return visibles.filter(estBiblio)
  if (noeud.startsWith('lib:')) return visibles.filter((e) => estBiblio(e) && biblioDe(e) === noeud.slice(4))
  if (noeud.startsWith('fam:')) return visibles.filter((e) => !estBiblio(e) && e.famille === noeud.slice(4))
  return []
}

/** arbre complet avec compteurs (calculés sur les symboles visibles : ils suivent la recherche et le filtre) */
export function construireArbre(visibles: readonly Entree[], o: Pick<OptionsExplorateur, 'favoris' | 'recents'>, bibliotheques: readonly { id: string; nom: string }[] = []): Noeud[] {
  const fams = new Map<string, number>()
  for (const e of visibles) if (!estBiblio(e)) fams.set(e.famille, (fams.get(e.famille) ?? 0) + 1)
  const nb = (n: NoeudId): number => selonNoeud(visibles, n, o).length
  const familles: Noeud[] = [...fams.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr')).map(([nom, nombre]) => ({ id: noeudFamille(nom), libelle: nom, nombre }))
  return [
    { id: NOEUD_TOUT, libelle: 'Tout', nombre: visibles.length },
    { id: NOEUD_FAVORIS, libelle: 'Favoris', nombre: nb(NOEUD_FAVORIS) },
    { id: NOEUD_RECENTS, libelle: 'Récents', nombre: nb(NOEUD_RECENTS) },
    { id: NOEUD_FAMILLES, libelle: 'Familles', nombre: familles.reduce((s, f) => s + f.nombre, 0), enfants: familles },
    {
      id: NOEUD_BIBLIO,
      libelle: FAMILLE_MA_BIBLIOTHEQUE,
      nombre: nb(NOEUD_BIBLIO),
      enfants: bibliotheques.map((b) => ({ id: noeudBiblio(b.id), libelle: b.nom, nombre: nb(noeudBiblio(b.id)) })),
    },
  ]
}

/** aplatit l'arbre dans l'ordre d'affichage (pour la navigation au clavier) ; les nœuds repliés cachent leurs enfants */
export function aplatir(arbre: readonly Noeud[], ouverts: ReadonlySet<string>): Noeud[] {
  return arbre.flatMap((n) => [n, ...(n.enfants && ouverts.has(n.id) ? aplatir(n.enfants, ouverts) : [])])
}

// ───────────── détail d'un symbole iso : états et variantes

export const LIBELLE_ETAT: Readonly<Record<string, string>> = {
  arret: 'Arrêt', marche: 'Marche', defaut: 'Défaut', alarme: 'Alarme', modulant: 'Modulant', ouvert: 'Ouvert',
  ferme: 'Fermé', inconnu: 'Inconnu', consigne: 'Consigne', maintenance: 'Maintenance',
}

export interface EtatPropose { etat: EtatNom; valeurs: Record<string, number> }
export interface VarianteProposee { cle: string; valeurs: (string | number)[] }

/** états à proposer dans le panneau de détail : ceux des planches du symbole (avec leurs valeurs d'exemple), sinon « arrêt » seul */
export function etatsDe(def: Pick<SymboleDef, 'planche' | 'etats'> | undefined): EtatPropose[] {
  const vus = new Set<string>()
  const out: EtatPropose[] = []
  for (const c of def?.planche ?? []) {
    if (vus.has(c[0])) continue
    vus.add(c[0])
    out.push({ etat: c[0], valeurs: (c[1] as Record<string, number> | undefined) ?? {} })
  }
  for (const e of def?.etats ?? []) if (!vus.has(e)) { vus.add(e); out.push({ etat: e, valeurs: {} }) }
  return out.length ? out : [{ etat: 'arret', valeurs: {} }]
}

const NOMBRE = /^-?\d+(\.\d+)?$/
/** variantes déclarées (« clé=a|b|c ») : seules les formes simples sont proposées */
export function variantesDe(def: Pick<SymboleDef, 'variantes'> | undefined): VarianteProposee[] {
  const out: VarianteProposee[] = []
  for (const v of def?.variantes ?? []) {
    const m = /^(\w+)=([^=]+)$/.exec(v)
    if (!m || !m[2].includes('|')) continue
    out.push({ cle: m[1], valeurs: m[2].split('|').map((x) => (NOMBRE.test(x) ? Number(x) : x)) })
  }
  return out
}

/** mots-clés à afficher : sans doublon, sans l'identifiant technique, bornés */
export function motsClesAffiches(e: Entree, max = 18): string[] {
  const vus = new Set<string>()
  const out: string[] = []
  for (const m of e.motsCles ?? []) {
    const t = m.trim()
    const k = t.toLowerCase()
    if (!t || vus.has(k) || k === e.id.toLowerCase() || k === e.nom.toLowerCase()) continue
    vus.add(k)
    out.push(t)
    if (out.length >= max) break
  }
  return out
}

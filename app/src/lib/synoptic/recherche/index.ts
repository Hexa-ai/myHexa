// Recherche « Spotlight » : floue, insensible aux accents et à la casse, bilingue (synonymes métier), pure (sans DOM).
// Trois sortes de résultats : symboles de la bibliothèque (2D ou iso), éléments du synoptique courant, variables de la box.
import { distance, mots, normaliser } from './texte'
import { synonymesDe } from './synonymes'
import { motsClesDe, motsIndexables } from './mots-cles'

export type Contexte = '2d' | 'iso'
export type Genre = 'symbole' | 'element' | 'variable'
export type Portee = 'contexte' | 'tout'

export interface Entree {
  /** clé unique : « genre:contexte:id » */
  cle: string
  genre: Genre
  contexte: Contexte
  /** identifiant du symbole (clé de palette ou « famille.nom »), de l'élément ou nom de la variable */
  id: string
  nom: string
  famille: string
  /** mots à indexer en plus du nom (déjà tout compris : fr + en) */
  motsCles?: string[]
  /** ligne secondaire (type d'un élément, description d'une variable…) */
  detail?: string
  unite?: string
  /** statut qualité d'un symbole iso (brouillon, revu, valide) : pastille de l'explorateur */
  statut?: 'brouillon' | 'revu' | 'valide'
}

export interface Resultat {
  entree: Entree
  score: number
  favori: boolean
  recent: boolean
}

interface Indexee {
  nom: string[]
  cles: string[]
  fam: string[]
  idm: string[]
}
const idx = new WeakMap<Entree, Indexee>()
function indexer(e: Entree): Indexee {
  let i = idx.get(e)
  if (!i) {
    i = {
      nom: mots(e.nom),
      cles: [...(e.motsCles ?? []).flatMap(mots), ...(e.genre === 'symbole' ? motsIndexables(e.id) : [])],
      fam: mots(e.famille + ' ' + (e.detail ?? '')),
      idm: mots(e.id),
    }
    idx.set(e, i)
  }
  return i
}

/** score d'un mot de la requête face à une liste de mots (0 = rien) */
function scoreMot(t: string, liste: string[]): number {
  let best = 0
  for (const w of liste) {
    let s = 0
    if (w === t) s = 10
    else if (w.startsWith(t)) s = t.length >= 2 ? 7 : 3
    else if (t.length >= 3 && w.includes(t)) s = 4
    else if (t.length >= 4) {
      const tol = t.length >= 7 ? 2 : 1
      const d = distance(t, w.length > t.length ? w.slice(0, t.length + 1) : w, tol)
      if (d <= tol) s = 3 - d * 0.5
    }
    if (s > best) best = s
  }
  return best
}

/** score d'une expression (tous ses mots doivent correspondre) */
function scoreExpression(tokens: string[], i: Indexee): number {
  let total = 0
  for (const t of tokens) {
    const s = Math.max(scoreMot(t, i.nom) * 1.2, scoreMot(t, i.cles), scoreMot(t, i.idm) * 0.8, scoreMot(t, i.fam) * 0.5)
    if (s <= 0) return 0
    total += s
  }
  return total / tokens.length
}

export interface OptionsRecherche {
  contexte: Contexte
  portee: Portee
  /** clés d'entrée favorites / récentes (la plus récente en premier) */
  favoris?: ReadonlySet<string> | readonly string[]
  recents?: readonly string[]
  limite?: number
}

const enSet = (x: ReadonlySet<string> | readonly string[] | undefined): Set<string> => new Set(x ? [...x] : [])

/**
 * Recherche. Requête vide : récents puis favoris.
 * Les entrées du contexte courant passent devant celles de l'autre contexte (portée « tout »).
 */
export function chercher(entrees: readonly Entree[], requete: string, o: OptionsRecherche): Resultat[] {
  const fav = enSet(o.favoris)
  const rec = o.recents ?? []
  const limite = o.limite ?? 40
  const visibles = entrees.filter((e) => o.portee === 'tout' || e.genre !== 'symbole' || e.contexte === o.contexte)
  const q = normaliser(requete)
  const mk = (e: Entree, score: number): Resultat => ({ entree: e, score, favori: fav.has(e.cle), recent: rec.includes(e.cle) })
  if (!q) {
    const par = new Map(visibles.map((e) => [e.cle, e]))
    const out: Resultat[] = []
    const vus = new Set<string>()
    for (const c of [...rec, ...fav]) {
      const e = par.get(c)
      if (e && !vus.has(c)) {
        vus.add(c)
        out.push(mk(e, 0))
      }
    }
    return out.slice(0, limite)
  }
  const exprs = [q, ...synonymesDe(q)].map((x) => x.split(' ').filter(Boolean))
  const res: Resultat[] = []
  for (const e of visibles) {
    const i = indexer(e)
    let s = 0
    exprs.forEach((tokens, k) => {
      const v = scoreExpression(tokens, i)
      // la requête telle que tapée pèse plus qu'un synonyme ; plusieurs mots tapés qui correspondent tous valent plus qu'un synonyme à un mot
      s = Math.max(s, k === 0 ? v * (1 + 0.15 * (tokens.length - 1)) : v * 0.85)
    })
    if (s <= 0) continue
    if (e.contexte !== o.contexte) s *= 0.8
    if (e.genre === 'element') s *= 1.1
    const r = mk(e, s)
    if (r.favori) r.score += 2
    const rang = rec.indexOf(e.cle)
    if (rang >= 0) r.score += 3 - Math.min(2.5, rang * 0.3)
    res.push(r)
  }
  res.sort((a, b) => b.score - a.score || a.entree.nom.localeCompare(b.entree.nom, 'fr'))
  return res.slice(0, limite)
}

// ───────────── construction des entrées

export const cleEntree = (genre: Genre, contexte: Contexte, id: string): string => `${genre}:${contexte}:${id}`

/** symbole du catalogue (iso : « famille.nom », 2D : clé de palette) */
export function entreeSymbole(contexte: Contexte, id: string, nom: string, famille: string, extra: string[] = []): Entree {
  const k = motsClesDe(id)
  return { cle: cleEntree('symbole', contexte, id), genre: 'symbole', contexte, id, nom, famille, motsCles: [...k.fr, ...k.en, ...extra] }
}

export const entreeElement = (contexte: Contexte, id: string, nom: string, type: string): Entree => ({
  cle: cleEntree('element', contexte, id), genre: 'element', contexte, id, nom: nom || id, famille: 'Dans ce synoptique', detail: type, motsCles: [id, type],
})

export const entreeVariable = (contexte: Contexte, nom: string, description = '', unite = ''): Entree => ({
  cle: cleEntree('variable', contexte, nom), genre: 'variable', contexte, id: nom, nom, famille: 'Variables de la box', detail: description, unite, motsCles: description ? [description] : [],
})

export { normaliser } from './texte'
export { motsClesDe } from './mots-cles'

// Format d'une « bibliothèque » de symboles (JSON), import / export et pose.
//
// Décision de produit : l'utilisateur n'importe PAS de SVG libre. Un symbole de bibliothèque est une COMPOSITION de symboles
// existants (iso) et de paramètres, par exemple « pompe de relevage » = pompe.immergee + paramètres + mots-clés. Ce format
// est aussi la cible prévue d'un DSL paramétrique produit côté serveur par une IA (plus tard) : aucun champ ne porte de dessin.
//
// {
//   "schema": "myhexa-bibliotheque/1",
//   "id": "ma-bibliotheque", "nom": "Ma bibliothèque", "version": "1.0.0", "auteur": "…",
//   "symboles": [
//     { "id": "pompe_relevage", "nom": "Pompe de relevage", "motsCles": ["relevage", "sump pump"],
//       "parties": [ { "base": "pompe.immergee", "params": { "variante": "…" }, "dx": 0, "dy": 0, "dz": 0, "rot": 0 } ] }
//   ]
// }
//
// Stockage : local au navigateur pour l'instant (CLE_BIBLIOTHEQUES). Emplacement prévu côté serveur : table dédiée
// « bibliothèques de l'entreprise » (voir docs/flux/synoptique.md) — non créée à ce stade.

export const SCHEMA_BIBLIOTHEQUE = 'myhexa-bibliotheque/1'
export const FAMILLE_MA_BIBLIOTHEQUE = 'Ma bibliothèque'
export const CLE_BIBLIOTHEQUES = 'myhexa.synoptique.bibliotheques'
export const MAX_PARTIES = 24
export const MAX_SYMBOLES = 200

export interface PartieBibliotheque {
  /** symbole iso existant (« famille.nom ») */
  base: string
  params?: Record<string, string | number | boolean>
  /** décalage par rapport au point de pose (unités de la scène) */
  dx?: number
  dy?: number
  dz?: number
  rot?: 0 | 90 | 180 | 270
  libelle?: string
}

export interface SymboleBibliotheque {
  id: string
  nom: string
  motsCles?: string[]
  parties: PartieBibliotheque[]
}

export interface Bibliotheque {
  schema: typeof SCHEMA_BIBLIOTHEQUE
  id: string
  nom: string
  version: string
  auteur: string
  symboles: SymboleBibliotheque[]
}

export interface ResultatValidation {
  ok: boolean
  erreurs: string[]
  bibliotheque?: Bibliotheque
}

const ID = /^[a-z0-9][a-z0-9_-]{0,63}$/
const PARTIE_CLES = new Set(['base', 'params', 'dx', 'dy', 'dz', 'rot', 'libelle'])
const SYMBOLE_CLES = new Set(['id', 'nom', 'motsCles', 'parties'])
const BIB_CLES = new Set(['schema', 'id', 'nom', 'version', 'auteur', 'symboles'])
const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)

/**
 * Valide un JSON de bibliothèque. `typeConnu` dit si un symbole de base existe (le catalogue iso) ;
 * tout champ inconnu est refusé (pas de SVG, pas de script : seulement des compositions).
 */
export function validerBibliotheque(brut: unknown, typeConnu: (base: string) => boolean): ResultatValidation {
  const err: string[] = []
  const o = brut as Record<string, unknown> | null
  if (!o || typeof o !== 'object' || Array.isArray(o)) return { ok: false, erreurs: ['le fichier n’est pas un objet JSON'] }
  for (const k of Object.keys(o)) if (!BIB_CLES.has(k)) err.push(`champ inconnu « ${k} »`)
  if (o.schema !== SCHEMA_BIBLIOTHEQUE) err.push(`schéma attendu « ${SCHEMA_BIBLIOTHEQUE} »`)
  if (typeof o.id !== 'string' || !ID.test(o.id)) err.push('id invalide (minuscules, chiffres, - et _)')
  if (typeof o.nom !== 'string' || !o.nom.trim()) err.push('nom manquant')
  if (typeof o.version !== 'string' || !o.version.trim()) err.push('version manquante')
  if (typeof o.auteur !== 'string') err.push('auteur manquant')
  if (!Array.isArray(o.symboles)) err.push('« symboles » doit être une liste')
  const syms: SymboleBibliotheque[] = []
  if (Array.isArray(o.symboles)) {
    if (o.symboles.length > MAX_SYMBOLES) err.push(`trop de symboles (${MAX_SYMBOLES} au plus)`)
    const ids = new Set<string>()
    o.symboles.forEach((s: unknown, i: number) => {
      const p = `symboles[${i}]`
      const so = s as Record<string, unknown> | null
      if (!so || typeof so !== 'object') return void err.push(`${p} : objet attendu`)
      for (const k of Object.keys(so)) if (!SYMBOLE_CLES.has(k)) err.push(`${p} : champ inconnu « ${k} »`)
      if (typeof so.id !== 'string' || !ID.test(so.id)) err.push(`${p} : id invalide`)
      else if (ids.has(so.id)) err.push(`${p} : id « ${so.id} » en double`)
      else ids.add(so.id)
      if (typeof so.nom !== 'string' || !so.nom.trim()) err.push(`${p} : nom manquant`)
      if (so.motsCles != null && (!Array.isArray(so.motsCles) || so.motsCles.some((m) => typeof m !== 'string'))) err.push(`${p} : motsCles doit être une liste de textes`)
      if (!Array.isArray(so.parties) || !so.parties.length) return void err.push(`${p} : au moins une partie`)
      if (so.parties.length > MAX_PARTIES) err.push(`${p} : trop de parties (${MAX_PARTIES} au plus)`)
      so.parties.forEach((pa: unknown, j: number) => {
        const q = `${p}.parties[${j}]`
        const po = pa as Record<string, unknown> | null
        if (!po || typeof po !== 'object') return void err.push(`${q} : objet attendu`)
        for (const k of Object.keys(po)) if (!PARTIE_CLES.has(k)) err.push(`${q} : champ inconnu « ${k} »`)
        if (typeof po.base !== 'string' || !typeConnu(po.base)) err.push(`${q} : symbole de base inconnu « ${String(po.base)} »`)
        for (const k of ['dx', 'dy', 'dz'] as const) if (po[k] != null && !num(po[k])) err.push(`${q} : ${k} doit être un nombre`)
        if (po.rot != null && ![0, 90, 180, 270].includes(po.rot as number)) err.push(`${q} : rot ∈ 0, 90, 180, 270`)
        if (po.params != null) {
          const pr = po.params as Record<string, unknown>
          if (typeof pr !== 'object' || Array.isArray(pr) || Object.values(pr).some((v) => !['string', 'number', 'boolean'].includes(typeof v))) err.push(`${q} : params = nombres, textes ou booléens`)
        }
      })
      syms.push(so as unknown as SymboleBibliotheque)
    })
  }
  if (err.length) return { ok: false, erreurs: err }
  return { ok: true, erreurs: [], bibliotheque: { ...(o as unknown as Bibliotheque), symboles: syms } }
}

export const exporterBibliotheque = (b: Bibliotheque): string => JSON.stringify(b, null, 2)

/** lit un texte JSON de bibliothèque ; ne lève jamais */
export function importerBibliotheque(texte: string, typeConnu: (base: string) => boolean): ResultatValidation {
  let brut: unknown
  try {
    brut = JSON.parse(texte)
  } catch {
    return { ok: false, erreurs: ['JSON illisible'] }
  }
  return validerBibliotheque(brut, typeConnu)
}

// ───────────── stockage local

interface Stockage {
  getItem(k: string): string | null
  setItem(k: string, v: string): void
}
const stockageDefaut = (): Stockage | null => (typeof localStorage === 'undefined' ? null : localStorage)

export function lireBibliotheques(typeConnu: (base: string) => boolean, s: Stockage | null = stockageDefaut()): Bibliotheque[] {
  try {
    const l = JSON.parse(s?.getItem(CLE_BIBLIOTHEQUES) ?? '[]') as unknown[]
    return l.map((b) => validerBibliotheque(b, typeConnu)).flatMap((r) => (r.bibliotheque ? [r.bibliotheque] : []))
  } catch {
    return []
  }
}

/** ajoute ou remplace (même id) une bibliothèque ; renvoie la liste à jour */
export function enregistrerBibliotheque(b: Bibliotheque, typeConnu: (base: string) => boolean, s: Stockage | null = stockageDefaut()): Bibliotheque[] {
  const l = [...lireBibliotheques(typeConnu, s).filter((x) => x.id !== b.id), b]
  try { s?.setItem(CLE_BIBLIOTHEQUES, JSON.stringify(l)) } catch { /* ignoré */ }
  return l
}

export function retirerBibliotheque(id: string, typeConnu: (base: string) => boolean, s: Stockage | null = stockageDefaut()): Bibliotheque[] {
  const l = lireBibliotheques(typeConnu, s).filter((x) => x.id !== id)
  try { s?.setItem(CLE_BIBLIOTHEQUES, JSON.stringify(l)) } catch { /* ignoré */ }
  return l
}

/** identifiant d'entrée de recherche d'un symbole de bibliothèque */
export const idSymboleBibliotheque = (bib: string, sym: string): string => `lib:${bib}/${sym}`
export const estSymboleBibliotheque = (id: string): boolean => id.startsWith('lib:')

/** retrouve un symbole de bibliothèque à partir de son identifiant d'entrée */
export function trouverSymbole(bibs: Bibliotheque[], id: string): SymboleBibliotheque | null {
  const m = /^lib:([^/]+)\/(.+)$/.exec(id)
  if (!m) return null
  return bibs.find((b) => b.id === m[1])?.symboles.find((s) => s.id === m[2]) ?? null
}

/** bibliothèque d'exemple (également utilisée par les tests et la documentation) */
export const BIBLIOTHEQUE_EXEMPLE: Bibliotheque = {
  schema: SCHEMA_BIBLIOTHEQUE,
  id: 'exemple',
  nom: 'Exemple',
  version: '1.0.0',
  auteur: 'Hexa-AI',
  symboles: [
    { id: 'pompe_relevage', nom: 'Pompe de relevage', motsCles: ['relevage', 'sump pump', 'lift pump'], parties: [{ base: 'pompe.immergee' }] },
    { id: 'chaufferie_complete', nom: 'Chaufferie (local + chaudière)', motsCles: ['boiler plant', 'plant room'], parties: [{ base: 'site.chaufferie' }, { base: 'chaufferie.chaudiere', dx: 12, dy: 12, dz: 2 }] },
  ],
}

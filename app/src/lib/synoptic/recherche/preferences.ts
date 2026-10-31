// Favoris et récents de la bibliothèque de symboles : stockage local (localStorage), par navigateur.
// Les clés sont celles des entrées de recherche (« symbole:iso:pompe.centrifuge_h »). Fonctions pures + une fine couche de stockage.

export const CLE_FAVORIS = 'myhexa.synoptique.favoris'
export const CLE_RECENTS = 'myhexa.synoptique.recents'
export const MAX_RECENTS = 12

export interface Stockage {
  getItem(k: string): string | null
  setItem(k: string, v: string): void
}

function lireListe(s: Stockage | null, cle: string): string[] {
  try {
    const v = JSON.parse(s?.getItem(cle) ?? '[]') as unknown
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}
function ecrire(s: Stockage | null, cle: string, v: string[]): void {
  try { s?.setItem(cle, JSON.stringify(v)) } catch { /* stockage plein ou interdit : on continue sans */ }
}

const defaut = (): Stockage | null => (typeof localStorage === 'undefined' ? null : localStorage)

export const lireFavoris = (s: Stockage | null = defaut()): string[] => lireListe(s, CLE_FAVORIS)
export const lireRecents = (s: Stockage | null = defaut()): string[] => lireListe(s, CLE_RECENTS)

/** ajoute ou retire un favori ; renvoie la liste à jour */
export function basculerFavori(cle: string, s: Stockage | null = defaut()): string[] {
  const l = lireFavoris(s)
  const n = l.includes(cle) ? l.filter((x) => x !== cle) : [...l, cle]
  ecrire(s, CLE_FAVORIS, n)
  return n
}

/** note un usage : la clé passe en tête des récents (sans doublon, borné) */
export function noterRecent(cle: string, s: Stockage | null = defaut()): string[] {
  const n = [cle, ...lireRecents(s).filter((x) => x !== cle)].slice(0, MAX_RECENTS)
  ecrire(s, CLE_RECENTS, n)
  return n
}

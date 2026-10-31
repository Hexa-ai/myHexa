// Dupliquer / copier-coller en iso : un composant (ou une sélection) est copié avec ses paramètres, son orientation (rot / tilt),
// ses piquages et son habillage. Les variables reliées ne sont PAS copiées par défaut (option « avec variables »).
// Les tuyaux dont les deux extrémités sont dans la sélection sont dupliqués avec leurs accessoires ; les autres sont laissés.
import type { IsoAccessoire, IsoComposant, IsoLiaison, IsoSection } from './format'
import { idLibre } from './edition'

/** contenu du presse-papiers (localStorage, lisible d'un synoptique à l'autre) */
export interface PressePapiersIso {
  genre: 'myhexa-iso'
  version: 1
  composants: IsoComposant[]
  liaisons: IsoLiaison[]
}
export const CLE_PRESSE_PAPIERS = 'myhexa.iso.presse-papiers'

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T

/** « P-101 » → « P-102 », « Q1 » → « Q2 », « Pompe 3 » → « Pompe 4 » ; sans nombre final, renvoie le texte tel quel */
export function incrementerRepere(s: string): string {
  const m = /^(.*?)(\d+)(\D*)$/.exec(s)
  if (!m) return s
  const n = String(Number(m[2]) + 1).padStart(m[2].length, '0')
  return m[1] + n + m[3]
}

/** préfixe d'un identifiant « pompe3 » → « pompe » */
const prefixeId = (id: string): string => id.replace(/[\d_]+$/, '') || 'obj'

/** copie la sélection (composants + tuyaux internes) dans un presse-papiers autonome */
export function copier(iso: IsoSection, ids: readonly string[], avecVariables = false): PressePapiersIso {
  const set = new Set(ids)
  const composants = iso.composants.filter((c) => set.has(c.id)).map((c) => clone(c))
  const dedans = new Set(composants.map((c) => c.id))
  const liaisons = iso.liaisons
    .filter((l) => [l.de, l.vers].every((e) => 'c' in e && dedans.has(e.c)))
    .map((l) => clone(l))
  const presse: PressePapiersIso = { genre: 'myhexa-iso', version: 1, composants, liaisons }
  if (!avecVariables) retirerVariables(presse)
  return presse
}

function retirerVariables(p: PressePapiersIso): void {
  const nettoyer = (o: IsoComposant | IsoLiaison | IsoAccessoire): void => {
    delete o.slots
    const h = (o as IsoComposant).habillage
    if (h) {
      delete h.voyant
      if (h.mesures) h.mesures = h.mesures.map((m) => ({ ...m, slot: {} }))
    }
  }
  for (const c of p.composants) nettoyer(c)
  for (const l of p.liaisons) {
    nettoyer(l)
    for (const a of l.accessoires ?? []) nettoyer(a)
  }
}

/**
 * colle un presse-papiers : nouveaux identifiants, repères incrémentés, décalage (dx, dy) en monde.
 * Renvoie les identifiants des composants créés.
 */
export function coller(iso: IsoSection, p: PressePapiersIso, dx: number, dy: number): string[] {
  const carte = new Map<string, string>()
  const crees: string[] = []
  for (const src of p.composants) {
    const c = clone(src)
    const nid = idLibre(iso, prefixeId(src.id))
    carte.set(src.id, nid)
    c.id = nid
    c.x = src.x + dx
    c.y = src.y + dy
    if (src.tag) c.tag = incrementerRepere(src.tag)
    if (src.libelle) c.libelle = incrementerRepere(src.libelle)
    delete c.monte // un capteur monté sur un autre composant n'est pas recopié « monté » : il reste posé à sa place
    iso.composants.push(c)
    crees.push(nid)
  }
  for (const src of p.liaisons) {
    const l = clone(src)
    const de = src.de as { c: string; port: string }
    const vers = src.vers as { c: string; port: string }
    if (!carte.has(de.c) || !carte.has(vers.c)) continue
    l.id = idLibre(iso, 'tuyau')
    l.de = { ...de, c: carte.get(de.c)! }
    l.vers = { ...vers, c: carte.get(vers.c)! }
    if (l.via) l.via = l.via.map((v) => [v[0] + dx, v[1] + dy, v[2]] as [number, number, number])
    l.accessoires = (l.accessoires ?? []).map((a, i) => ({ ...a, id: `${l.id}.a${i}` }))
    iso.liaisons.push(l)
  }
  return crees
}

/** boîte (x, y) des composants copiés : sert à caler le collage sous le curseur */
export function coinPresse(p: PressePapiersIso): [number, number] {
  if (!p.composants.length) return [0, 0]
  return [Math.min(...p.composants.map((c) => c.x)), Math.min(...p.composants.map((c) => c.y))]
}

/** duplique la sélection avec un décalage d'un pas ; renvoie les nouveaux identifiants */
export function dupliquer(iso: IsoSection, ids: readonly string[], pas: number, avecVariables = false): string[] {
  return coller(iso, copier(iso, ids, avecVariables), pas, pas)
}

export function ecrirePresse(p: PressePapiersIso, stockage: Pick<Storage, 'setItem'> = localStorage): void {
  stockage.setItem(CLE_PRESSE_PAPIERS, JSON.stringify(p))
}
export function lirePresse(stockage: Pick<Storage, 'getItem'> = localStorage): PressePapiersIso | null {
  try {
    const p = JSON.parse(stockage.getItem(CLE_PRESSE_PAPIERS) ?? 'null') as PressePapiersIso | null
    return p && p.genre === 'myhexa-iso' && Array.isArray(p.composants) && p.composants.length ? p : null
  } catch {
    return null
  }
}

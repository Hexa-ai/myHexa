// Modifications de `modele.resume` (corrections du résumé mobile) : fonctions pures, sans état.
// Chaque fonction renvoie une NOUVELLE configuration, nettoyée : une correction qui revient à la valeur automatique disparaît,
// et une configuration vide devient `undefined` (le document redevient identique à un document sans section « resume »).
import type { ResumeCarte, ResumeConfig, ResumeEquipement } from './engine/types'
import type { FamillePicto } from './familles-picto'

export const MAX_VALEURS_CARTE = 3

const copie = (c: ResumeConfig | undefined): ResumeConfig => JSON.parse(JSON.stringify(c ?? {}))

/** retire les corrections vides ; undefined si plus rien ne reste */
export function nettoyer(c: ResumeConfig | undefined): ResumeConfig | undefined {
  if (!c) return undefined
  const out: ResumeConfig = {}
  const eq: Record<string, ResumeEquipement> = {}
  for (const [id, o] of Object.entries(c.equipements ?? {})) {
    const n: ResumeEquipement = {}
    if (o.epingle) n.epingle = true
    if (o.masque && !o.epingle) n.masque = true
    if (o.carte) n.carte = o.carte
    if (o.famille) n.famille = o.famille
    if (Object.keys(n).length) eq[id] = n
  }
  const ca: Record<string, ResumeCarte> = {}
  for (const [id, o] of Object.entries(c.cartes ?? {})) {
    const n: ResumeCarte = {}
    if (o.titre?.trim()) n.titre = o.titre.trim()
    if (typeof o.ordre === 'number' && Number.isFinite(o.ordre)) n.ordre = o.ordre
    if (o.masquee) n.masquee = true
    if (o.valeurs?.length) n.valeurs = o.valeurs.slice(0, MAX_VALEURS_CARTE)
    if (Object.keys(n).length) ca[id] = n
  }
  if (Object.keys(eq).length) out.equipements = eq
  if (Object.keys(ca).length) out.cartes = ca
  if (c.cartesPerso?.length) out.cartesPerso = c.cartesPerso
  return Object.keys(out).length ? out : undefined
}

function modifierEquipement(c: ResumeConfig | undefined, id: string, f: (o: ResumeEquipement) => void): ResumeConfig | undefined {
  const n = copie(c)
  n.equipements ??= {}
  n.equipements[id] ??= {}
  f(n.equipements[id])
  return nettoyer(n)
}

function modifierCarte(c: ResumeConfig | undefined, id: string, f: (o: ResumeCarte) => void): ResumeConfig | undefined {
  const n = copie(c)
  n.cartes ??= {}
  n.cartes[id] ??= {}
  f(n.cartes[id])
  return nettoyer(n)
}

/** épingler un équipement (lève son masquage) ou retirer l'épingle */
export const epingler = (c: ResumeConfig | undefined, id: string, oui: boolean) =>
  modifierEquipement(c, id, (o) => {
    o.epingle = oui
    if (oui) delete o.masque
  })

/** masquer un équipement du résumé (lève son épingle) : ses alarmes restent visibles */
export const masquer = (c: ResumeConfig | undefined, id: string, oui: boolean) =>
  modifierEquipement(c, id, (o) => {
    o.masque = oui
    if (oui) delete o.epingle
  })

/** forcer la famille de pictogramme ; undefined = automatique */
export const forcerFamille = (c: ResumeConfig | undefined, id: string, famille: FamillePicto | 'aucun' | undefined) =>
  modifierEquipement(c, id, (o) => {
    if (famille) o.famille = famille
    else delete o.famille
  })

/**
 * Déplace un équipement vers une carte. `carteAuto` = carte que le calcul automatique lui donne : y revenir supprime la correction.
 * Vers une carte personnalisée, l'équipement est inscrit dans sa liste ; ailleurs, `equipements[id].carte` est posé.
 */
export function deplacer(c: ResumeConfig | undefined, id: string, cible: string, carteAuto: string | null): ResumeConfig | undefined {
  const n = copie(c)
  for (const p of n.cartesPerso ?? []) p.equipements = p.equipements.filter((x) => x !== id)
  n.equipements ??= {}
  n.equipements[id] ??= {}
  delete n.equipements[id].carte
  const perso = n.cartesPerso?.find((p) => p.id === cible)
  if (perso) perso.equipements.push(id)
  else if (cible !== carteAuto) n.equipements[id].carte = cible
  return nettoyer(n)
}

export const renommerCarte = (c: ResumeConfig | undefined, id: string, titre: string | undefined) =>
  modifierCarte(c, id, (o) => {
    if (titre?.trim()) o.titre = titre.trim()
    else delete o.titre
  })

export const masquerCarte = (c: ResumeConfig | undefined, id: string, oui: boolean) =>
  modifierCarte(c, id, (o) => {
    o.masquee = oui
  })

/** choisit les valeurs d'une carte (3 au plus) ; liste vide = automatique */
export const choisirValeurs = (c: ResumeConfig | undefined, id: string, variables: string[]) =>
  modifierCarte(c, id, (o) => {
    if (variables.length) o.valeurs = variables.slice(0, MAX_VALEURS_CARTE)
    else delete o.valeurs
  })

/** fixe l'ordre d'affichage : le rang de chaque carte est sa position dans la liste */
export function reordonner(c: ResumeConfig | undefined, idsDansLOrdre: string[]): ResumeConfig | undefined {
  const n = copie(c)
  n.cartes ??= {}
  idsDansLOrdre.forEach((id, i) => {
    n.cartes![id] ??= {}
    n.cartes![id].ordre = i
  })
  return nettoyer(n)
}

/** déplace une carte d'un cran dans la liste ordonnée donnée (haut/bas), renvoie la nouvelle liste d'ids */
export function deplacerDans(ids: string[], de: number, vers: number): string[] {
  const out = ids.slice()
  if (de < 0 || de >= out.length) return out
  const [x] = out.splice(de, 1)
  out.splice(Math.max(0, Math.min(out.length, vers)), 0, x)
  return out
}

/** crée une carte personnalisée avec les équipements choisis (qui quittent leur carte automatique) */
export function creerCartePerso(
  c: ResumeConfig | undefined,
  titre: string,
  equipements: string[],
): { config: ResumeConfig | undefined; id: string } {
  const n = copie(c)
  n.cartesPerso ??= []
  let i = n.cartesPerso.length + 1
  while (n.cartesPerso.some((p) => p.id === `perso-${i}`)) i++
  const id = `perso-${i}`
  for (const p of n.cartesPerso) p.equipements = p.equipements.filter((x) => !equipements.includes(x))
  for (const e of equipements) if (n.equipements?.[e]) delete n.equipements[e].carte
  n.cartesPerso.push({ id, titre: titre.trim() || 'Nouvelle carte', equipements: equipements.slice() })
  return { config: nettoyer(n), id }
}

/** supprime une carte personnalisée : ses équipements retrouvent leur carte automatique */
export function supprimerCartePerso(c: ResumeConfig | undefined, id: string): ResumeConfig | undefined {
  const n = copie(c)
  n.cartesPerso = (n.cartesPerso ?? []).filter((p) => p.id !== id)
  if (!n.cartesPerso.length) delete n.cartesPerso
  if (n.cartes) delete n.cartes[id]
  for (const o of Object.values(n.equipements ?? {})) if (o.carte === id) delete o.carte
  return nettoyer(n)
}

/** rattachement d'un équipement à une carte personnalisée (null = aucune) */
export const cartePersoDe = (c: ResumeConfig | undefined, id: string): string | null =>
  c?.cartesPerso?.find((p) => p.equipements.includes(id))?.id ?? null

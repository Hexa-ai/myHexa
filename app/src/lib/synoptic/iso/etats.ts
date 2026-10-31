// États en direct d'un objet iso, à partir des variables reliées (mêmes règles que les symboles 2D : slots + règle { op, val }).
// Correspondance entre les 10 états de la bibliothèque iso et les états du moteur / du résumé mobile.
import { appliquerRegle, type EmplacementLie } from '../regles'
import type { EtatNom, Valeurs } from './lib/types'
import { familleIso, type FamilleIso } from './familles'

/** états du moteur 2D / du résumé mobile (voir resume.ts : EtatEquipement et EtatPicto) */
export type EtatMoteur = 'marche' | 'arret' | 'defaut' | 'alarme' | 'ouvert' | 'ferme' | 'modulant' | 'inconnu' | 'ok' | 'info'

/** les 10 états iso → état moteur le plus proche (table totale : un test vérifie qu'aucun état n'est oublié) */
export const ETAT_ISO_VERS_MOTEUR: Readonly<Record<EtatNom, EtatMoteur>> = {
  arret: 'arret',
  marche: 'marche',
  defaut: 'defaut',
  alarme: 'alarme',
  modulant: 'modulant',
  ouvert: 'ouvert',
  ferme: 'ferme',
  inconnu: 'inconnu',
  consigne: 'info', // consigne / commande locale : information, pas une alarme
  maintenance: 'info', // à l'arrêt pour intervention : information
}

/** états du moteur → état iso à dessiner */
export const ETAT_MOTEUR_VERS_ISO: Readonly<Record<EtatMoteur, EtatNom>> = {
  marche: 'marche',
  arret: 'arret',
  defaut: 'defaut',
  alarme: 'alarme',
  ouvert: 'ouvert',
  ferme: 'ferme',
  modulant: 'modulant',
  inconnu: 'inconnu',
  ok: 'marche',
  info: 'consigne',
}

export const LIBELLES_ETAT: Readonly<Record<EtatNom, string>> = {
  arret: 'Arrêt',
  marche: 'Marche',
  defaut: 'Défaut',
  alarme: 'Alarme',
  modulant: 'Modulant',
  ouvert: 'Ouvert',
  ferme: 'Fermé',
  inconnu: 'Inconnu',
  consigne: 'Consigne',
  maintenance: 'Maintenance',
}

export interface ObjetIsoLie {
  type: string
  etat?: EtatNom
  valeurs?: Valeurs
  slots?: Record<string, EmplacementLie>
  /** niveau plein (unité de la variable de niveau) ; 100 par défaut */
  niveau_max?: number
  /** seuils d'alarme d'une mesure */
  seuils?: { haut?: number; bas?: number }
}

export interface EtatLu {
  etat: EtatNom
  valeurs: Valeurs
  /** vrai si au moins une variable est reliée (l'état vient alors des mesures, sinon du réglage fixe de l'éditeur) */
  lie: boolean
}

const lu = (o: ObjetIsoLie, nom: string, v: Record<string, number>): number | undefined => {
  const sp = o.slots?.[nom]
  return sp?.variable ? appliquerRegle(sp, nom, v[sp.variable]) : undefined
}

/** variable reliée à un emplacement ? */
export const estLie = (o: { slots?: Record<string, EmplacementLie> }): boolean =>
  Object.values(o.slots ?? {}).some((s) => !!s?.variable)

/**
 * État et valeurs d'un objet iso pour des valeurs données.
 * - aucune variable reliée : l'état fixe choisi dans l'éditeur (`etat`) ;
 * - sinon : même logique que le résumé mobile (défaut > marche/arrêt, ouvert/fermé/position…), « inconnu » tant que la variable n'a pas répondu.
 */
export function lireEtat(o: ObjetIsoLie, v: Record<string, number>): EtatLu {
  const fixe: EtatLu = { etat: o.etat ?? 'arret', valeurs: { ...(o.valeurs ?? {}) }, lie: false }
  if (!estLie(o)) return fixe
  const fam: FamilleIso = familleIso(o.type)
  const valeurs: Valeurs = { ...(o.valeurs ?? {}) }
  const defaut = lu(o, 'defaut', v) === 1
  if (fam !== 'mesure' && fam !== 'cuve') {
    const aff = lu(o, 'valeur', v)
    if (aff != null) valeurs.valeur = aff
  }
  const sorti = (etat: EtatNom): EtatLu => ({ etat, valeurs, lie: true })

  if (fam === 'pompe' || fam === 'moteur' || fam === 'ventilateur') {
    const vit = lu(o, 'vitesse', v)
    if (vit != null) valeurs.vitesse = Math.max(0, Math.min(1, vit / 100))
    if (defaut) return sorti('defaut')
    const m = lu(o, 'marche', v)
    if (m === 1) return sorti(vit != null && vit > 0 && vit < 100 ? 'modulant' : 'marche')
    return sorti(m === 0 ? 'arret' : vit != null ? (vit > 0 ? 'marche' : 'arret') : 'inconnu')
  }
  if (fam === 'vanne') {
    const pos = lu(o, 'position', v)
    if (pos != null) valeurs.position = Math.max(0, Math.min(100, pos))
    if (defaut) return sorti('defaut')
    if (lu(o, 'ferme', v) === 1) return sorti('ferme')
    if (lu(o, 'ouvert', v) === 1) return sorti('ouvert')
    if (pos != null) return sorti(pos <= 2 ? 'ferme' : pos >= 98 ? 'ouvert' : 'modulant')
    return sorti(lu(o, 'ouvert', v) === 0 ? 'ferme' : 'inconnu')
  }
  if (fam === 'cuve') {
    const n = lu(o, 'niveau', v)
    const max = o.niveau_max && o.niveau_max > 0 ? o.niveau_max : 100
    if (n != null) valeurs.niveau = Math.max(0, Math.min(100, (n / max) * 100))
    if (defaut) return sorti('defaut')
    return sorti(n == null ? 'inconnu' : 'marche')
  }
  if (fam === 'mesure') {
    const x = lu(o, 'valeur', v)
    if (x != null) valeurs.valeur = x
    if (defaut) return sorti('defaut')
    if (x == null) return sorti('inconnu')
    const s = o.seuils
    const hors = s && ((s.haut != null && x > s.haut) || (s.bas != null && x < s.bas))
    return sorti(hors ? 'alarme' : 'marche')
  }
  // autres appareils : marche / défaut ; la valeur éventuelle est montrée en étiquette (voir format.ts)
  const x = lu(o, 'valeur', v)
  if (x != null) valeurs.valeur = x
  if (defaut) return sorti('defaut')
  const m = lu(o, 'marche', v)
  return sorti(m === 1 ? 'marche' : m === 0 ? 'arret' : x != null ? 'marche' : 'inconnu')
}

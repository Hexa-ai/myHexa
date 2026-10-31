// Familles « métier » des symboles isométriques : décident des emplacements (slots) proposés dans le panneau de propriétés,
// de la manière de lire l'état en direct (etats.ts) et du type d'équipement équivalent pour le résumé mobile.
// Fonctions pures, sans DOM ni dessin.

/** famille métier d'un symbole iso */
export type FamilleIso = 'pompe' | 'moteur' | 'ventilateur' | 'vanne' | 'cuve' | 'mesure' | 'autre'

const MOTEURS = /^(meca\.(moteur|motoreducteur|agitateur|convoyeur|compresseur|surpresseur_air)|chaufferie\.(pac|groupe_froid))/
const VENTILATEURS = /^(meca\.ventilateur|cta\.ventilateur|cta_e\.ventilateur)/
const CUVES = /^(cuve\.|bassin\.|silo\.|bache$|ballon\.|vase_expansion$|bouteille_decouplage$|decanteur\.)/

export function familleIso(type: string): FamilleIso {
  if (type.startsWith('pompe.')) return 'pompe'
  if (type.startsWith('vanne.')) return 'vanne'
  if (CUVES.test(type)) return 'cuve'
  if (VENTILATEURS.test(type)) return 'ventilateur'
  if (MOTEURS.test(type)) return 'moteur'
  if (type.startsWith('instr.') && type !== 'instr.repere' && type !== 'instr.voyant_klaxon') return 'mesure'
  return 'autre'
}

/** type d'équipement du moteur 2D équivalent (c'est lui que lit le résumé mobile) */
export function typeMoteurIso(type: string): string {
  switch (familleIso(type)) {
    case 'pompe': return 'pompe'
    case 'moteur': return 'moteur'
    case 'ventilateur': return 'ventilateur'
    case 'vanne': return 'vanne'
    case 'cuve': return 'cuve'
    case 'mesure': return 'mesure'
    default: return 'echangeur' // état « ok » / défaut, sans pictogramme propre
  }
}

export interface SlotDef {
  nom: string
  libelle: string
  /** vrai = tout ou rien (règle { op, val } proposée) */
  etat: boolean
}

const MARCHE: SlotDef = { nom: 'marche', libelle: 'Marche (retour de marche)', etat: true }
const AFFICHEE: SlotDef = { nom: 'valeur', libelle: 'Valeur affichée', etat: false }
const DEFAUT: SlotDef = { nom: 'defaut', libelle: 'Défaut', etat: true }

/** emplacements de variables proposés pour chaque famille (mêmes noms que les symboles 2D) */
export const SLOTS_PAR_FAMILLE: Readonly<Record<FamilleIso, readonly SlotDef[]>> = {
  pompe: [MARCHE, DEFAUT, { nom: 'vitesse', libelle: 'Vitesse (0–100 %)', etat: false }, AFFICHEE],
  moteur: [MARCHE, DEFAUT, { nom: 'vitesse', libelle: 'Vitesse (0–100 %)', etat: false }, AFFICHEE],
  ventilateur: [MARCHE, DEFAUT, { nom: 'vitesse', libelle: 'Vitesse (0–100 %)', etat: false }, AFFICHEE],
  vanne: [
    { nom: 'ouvert', libelle: 'Ouverte', etat: true },
    { nom: 'ferme', libelle: 'Fermée', etat: true },
    DEFAUT,
    { nom: 'position', libelle: 'Position (0–100 %)', etat: false },
    AFFICHEE,
  ],
  cuve: [{ nom: 'niveau', libelle: 'Niveau', etat: false }, DEFAUT],
  mesure: [{ nom: 'valeur', libelle: 'Valeur mesurée', etat: false }, DEFAUT],
  autre: [MARCHE, DEFAUT, AFFICHEE],
}

/** emplacements d'un tuyau : l'écoulement animé suit la marche */
export const SLOTS_LIAISON: readonly SlotDef[] = [
  { nom: 'marche', libelle: 'Écoulement (animation)', etat: true },
  DEFAUT,
]

/** accessoires que l'on peut poser SUR un tuyau (le reste du catalogue se pose sur la grille) */
const ACCESSOIRES_EXPLICITES = new Set([
  'instr.debitmetre', 'instr.pression', 'instr.pression_manifold', 'instr.pression_m', 'instr.temperature', 'instr.pressostat',
  'instr.manometre', 'instr.cadran', 'instr.thermometre', 'instr.repere', 'pompe.circulateur', 'chaufferie.compteur_energie',
])
export const estAccessoireIso = (type: string): boolean =>
  (type.startsWith('vanne.') && type !== 'vanne.3voies') || ACCESSOIRES_EXPLICITES.has(type)

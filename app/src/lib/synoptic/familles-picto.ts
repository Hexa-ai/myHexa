// Familles de pictogrammes du résumé mobile : UN SEUL endroit où chaque type de symbole déclare sa famille.
//
// Ajouter un symbole au catalogue (palette du moteur) = ajouter une ligne à FAMILLE_PICTO_PAR_TYPE :
//   - une famille (« pompe », « vanne »…) : le symbole apparaît en pictogramme dans la carte de son ouvrage ;
//   - null : le symbole n'a pas de pictogramme (il reste visible par ses valeurs et ses alarmes).
// Un test (familles-picto.spec.ts) échoue si un type du catalogue du moteur n'est pas déclaré ici.
// Les modules des bandeaux CVC (cta, hydro) déclarent leur pictogramme dans engine/cvc-modele.ts (champ `picto` de chaque
// module), car leurs cartes sont construites par module et non par symbole.
import type { FamillePictoCvc } from './engine/cvc-modele'

/** famille de pictogramme affichable dans une carte (le dessin de chacune est dans SynopticPicto.vue) */
export type FamillePicto = 'pompe' | 'moteur' | 'ventilateur' | 'vanne' | 'cuve' | FamillePictoCvc

/** familles proposées à l'utilisateur dans l'éditeur du résumé, avec leur libellé */
export const FAMILLES_PICTO: ReadonlyArray<{ id: FamillePicto; libelle: string }> = [
  { id: 'cuve', libelle: 'Cuve' },
  { id: 'pompe', libelle: 'Pompe' },
  { id: 'moteur', libelle: 'Moteur' },
  { id: 'ventilateur', libelle: 'Ventilateur' },
  { id: 'vanne', libelle: 'Vanne' },
  { id: 'registre', libelle: 'Registre' },
  { id: 'batterie', libelle: 'Batterie' },
  { id: 'roue', libelle: 'Roue' },
  { id: 'flamme', libelle: 'Flamme' },
  { id: 'filtre', libelle: 'Filtre' },
]

/**
 * Famille de pictogramme de chaque type de symbole (clé = `type` de l'équipement dans `modele.equipements`).
 * Un symbole du catalogue doit figurer ici, avec `null` s'il n'a pas de pictogramme.
 */
export const FAMILLE_PICTO_PAR_TYPE: Readonly<Record<string, FamillePicto | null>> = {
  // procédé
  cuve: 'cuve',
  pompe: 'pompe',
  vanne: 'vanne',
  vanne_reg: 'vanne',
  vanne_man: 'vanne',
  vanne_3v: 'vanne',
  ventilateur: 'ventilateur',
  compresseur: 'moteur',
  clapet: null,
  filtre: null,
  echangeur: null,
  parametre: null, // décanteur paramétré : c'est un ouvrage (carte), pas un pictogramme
  // machines
  moteur: 'moteur',
  convoyeur: 'moteur',
  verin: null,
  // électricité
  variateur: 'moteur',
  disjoncteur: null,
  transformateur: null,
  // instrumentation
  mesure: null,
  voyant: null,
  // autres types du document
  silhouette: null,
  image: null,
  raccord: null,
  // CVC : pictogrammes par module (voir engine/cvc-modele.ts)
  cta: null,
  hydro: null,
}

/** famille déclarée pour un type de symbole, null si aucune */
export const familleDuType = (type: string): FamillePicto | null => FAMILLE_PICTO_PAR_TYPE[type] ?? null

/**
 * Familles de pictogrammes des symboles de la vue isométrique (clé = identifiant du catalogue iso, iso/lib/registre).
 * Même règle que ci-dessus : un symbole iso du catalogue doit figurer ici (null = pas de pictogramme).
 * Un test (iso-format.spec.ts) échoue si un symbole du catalogue iso n'est pas déclaré.
 */
export const FAMILLE_PICTO_PAR_TYPE_ISO: Readonly<Record<string, FamillePicto | null>> = {
  // raccord
  'raccord.bout': null,
  // vanne
  'vanne.quart_tour': 'vanne',
  'vanne.papillon_reducteur': 'vanne',
  'vanne.opercule': 'vanne',
  'vanne.manchon': 'vanne',
  'vanne.siege_agro': 'vanne',
  'vanne.double_siege': 'vanne',
  'vanne.clapet_battant': null,
  'vanne.clapet_boule': null,
  'vanne.auto': 'vanne',
  // instr
  'instr.pression_manifold': null,
  'instr.niveau_flotteur': null,
  // pompe
  'pompe.centrifuge_gros': 'pompe',
  'pompe.axe_vertical': 'pompe',
  'pompe.centrifuge_h': 'pompe',
  'pompe.centrifuge_v': 'pompe',
  'pompe.multicellulaire_v': 'pompe',
  'pompe.immergee': 'pompe',
  'pompe.doseuse': 'pompe',
  'pompe.volumetrique': 'pompe',
  'pompe.circulateur': 'pompe',
  'pompe.surpresseur': 'pompe',
  // vanne
  'vanne.boisseau_pneu': 'vanne',
  'vanne.papillon_motor': 'vanne',
  'vanne.regulation': 'vanne',
  'vanne.3voies': 'vanne',
  'vanne.manuelle': 'vanne',
  'vanne.electrovanne': 'vanne',
  'vanne.clapet': null,
  'vanne.soupape': null,
  'vanne.filtre_y': 'filtre',
  'vanne.pot_boue': null,
  // cuve
  'cuve.verticale': 'cuve',
  'cuve.horizontale': 'cuve',
  // bassin
  'bassin.beton': 'cuve',
  // decanteur
  'decanteur.lamellaire': 'cuve',
  // silo
  'silo.tremie': 'cuve',
  // bache
  'bache': 'cuve',
  // ballon
  'ballon.ecs': 'cuve',
  // vase_expansion
  'vase_expansion': 'cuve',
  // bouteille_decouplage
  'bouteille_decouplage': 'cuve',
  // cuve
  'cuve.double_paroi': 'cuve',
  // cta
  'cta.prise_air': null,
  'cta.rejet_air': null,
  'cta.registre': 'registre',
  'cta.melange': null,
  'cta.filtre_plan': 'filtre',
  'cta.filtre_poches': 'filtre',
  'cta.batterie': 'batterie',
  'cta.humidificateur': null,
  'cta.recup_plaques': null,
  'cta.recup_roue': 'roue',
  'cta.piege_son': null,
  'cta.ventilateur': 'ventilateur',
  'cta.section_vide': null,
  'cta.diffuseur': null,
  'cta.bouche_murale': null,
  // chaufferie
  'chaufferie.chaudiere': 'flamme',
  'chaufferie.bruleur': 'flamme',
  'chaufferie.cheminee': null,
  'chaufferie.pac': 'moteur',
  'chaufferie.groupe_froid': 'moteur',
  'chaufferie.tour_aero': 'ventilateur',
  'chaufferie.collecteur': null,
  'chaufferie.compteur_energie': null,
  // raccord
  'raccord.bouchon': null,
  // chaufferie
  'chaufferie.purgeur': null,
  'chaufferie.console': null,
  // instr
  'instr.pression': null,
  'instr.temperature': null,
  'instr.debitmetre': null,
  'instr.niveau_radar': null,
  'instr.poire_niveau': null,
  'instr.pressostat': null,
  'instr.sonde_ambiance': null,
  'instr.analyseur': null,
  'instr.voyant_klaxon': null,
  'instr.thermometre': null,
  'instr.manometre': null,
  'instr.repere': null,
  // traitement
  'traitement.filtre_sable': 'filtre',
  'traitement.filtre_cartouche': 'filtre',
  'traitement.echangeur_plaques': null,
  'traitement.echangeur_tubulaire': null,
  'traitement.separateur': null,
  'traitement.centrifugeuse': null,
  'traitement.uv': null,
  // meca
  'meca.moteur': 'moteur',
  'meca.motoreducteur': 'moteur',
  'meca.agitateur': 'moteur',
  'meca.convoyeur_bande': 'moteur',
  'meca.convoyeur_vis': 'moteur',
  'meca.compresseur_vis': 'moteur',
  'meca.compresseur_piston': 'moteur',
  'meca.surpresseur_air': 'moteur',
  'meca.ventilateur_centrifuge': 'ventilateur',
  'meca.ventilateur_helicoide': 'ventilateur',
  // elec
  'elec.armoire': null,
  'elec.tgbt': null,
  'elec.variateur': 'moteur',
  'elec.transformateur': null,
  'elec.disjoncteur': null,
  'elec.groupe_electrogene': null,
  'elec.panneau_pv': null,
  'elec.borne_irve': null,
  'elec.box_hai': null,
  // scene
  'scene.dalle': null,
  'scene.mur': null,
  'scene.passerelle': null,
  // cta_e
  'cta_e.module': null,
  'cta_e.registre': 'registre',
  'cta_e.filtre_plan': 'filtre',
  'cta_e.filtre_poches': 'filtre',
  'cta_e.batterie_chaude': 'batterie',
  'cta_e.batterie_froide': 'batterie',
  'cta_e.humidificateur': null,
  'cta_e.roue': 'roue',
  'cta_e.ventilateur': 'ventilateur',
  'cta_e.piege_son': null,
  'cta_e.vide': null,
  'cta_e.echangeur_croise': null,
  'cta_e.echangeur_contre': null,
  'cta_e.melange_x': null,
  'cta_e.gaine': null,
}

/** famille déclarée pour un symbole iso, null si aucune */
export const familleDuTypeIso = (type: string): FamillePicto | null => FAMILLE_PICTO_PAR_TYPE_ISO[type] ?? null

// Préréglages du catalogue iso : un symbole de base + des paramètres figés + un nom + des mots-clés, déclarés ICI (hors des fichiers de dessin).
// Chaque préréglage apparaît comme un symbole à part dans la palette, l'explorateur et Ctrl+K (identifiant « preset:xxx »).
// À la pose, le composant reçoit le type de base ; params, orientation (rot / tilt), état et libellé viennent du préréglage.
// Pour en ajouter un : une entrée ci-dessous (le test iso-presets.spec.ts vérifie que la base existe, que le dessin ne plante pas et que les mots-clés sont bilingues).

import { cleEntree, type Entree } from '../recherche'

export const PREFIXE_PRESET = 'preset:'
export const FAMILLE_PRESETS = 'Préréglages'

export type TiltIso = 'x' | 'xn' | 'y' | 'yn'
export interface Preset {
  /** identifiant court (sans préfixe) */
  id: string
  nom: string
  /** type du catalogue */
  base: string
  params?: Record<string, unknown>
  rot?: 0 | 90 | 180 | 270
  tilt?: TiltIso
  etat?: string
  libelle?: string
  /** « termes français, … | termes anglais, … » (même format que recherche/mots-cles.ts) */
  motsCles: string
}

export const PRESETS: readonly Preset[] = [
  // ── circulateurs
  { id: 'circulateur_double', nom: 'Circulateur double (jumelé)', base: 'pompe.circulateur', params: { variante: 'jumele' },
    motsCles: 'circulateur double, circulateur jumele, pompe double, deux tetes, chauffage, secours | twin pump, double circulator, dual head circulator, twin circulating pump' },
  { id: 'circulateur_double_secours', nom: 'Circulateur double — une tête en secours', base: 'pompe.circulateur', params: { variante: 'jumele', tetes: ['marche', 'secours'] }, etat: 'marche',
    motsCles: 'circulateur double secours, pompe jumelee en secours, tete de secours, redondance | twin pump standby, duty standby circulator, redundant circulator' },
  { id: 'circulateur_vertical', nom: 'Circulateur vertical', base: 'pompe.circulateur', tilt: 'x',
    motsCles: 'circulateur vertical, depart vertical, colonne montante, circulateur sur colonne | vertical circulator, vertical riser pump, inline circulator on riser' },
  { id: 'circulateur_double_vertical', nom: 'Circulateur double vertical', base: 'pompe.circulateur', params: { variante: 'jumele' }, tilt: 'x',
    motsCles: 'circulateur double vertical, jumele vertical, colonne montante | vertical twin pump, vertical double circulator' },
  // ── vannes
  { id: 'v3v_verticale', nom: 'Vanne 3 voies verticale', base: 'vanne.3voies', tilt: 'x',
    motsCles: 'v3v verticale, vanne trois voies verticale, depart chaufferie, melangeuse verticale | vertical 3-way valve, vertical mixing valve, boiler flow valve' },
  { id: 'v3v_repartitrice', nom: 'Vanne 3 voies répartitrice', base: 'vanne.3voies', params: { variante: 'repartitrice' },
    motsCles: 'v3v repartitrice, vanne trois voies repartitrice, derivation | diverting valve, 3-way diverting valve' },
  { id: 'v3v_repartitrice_verticale', nom: 'Vanne 3 voies répartitrice verticale', base: 'vanne.3voies', params: { variante: 'repartitrice' }, tilt: 'x',
    motsCles: 'v3v repartitrice verticale, derivation verticale | vertical diverting valve' },
  { id: 'vanne_papillon_electrique', nom: 'Vanne papillon motorisée', base: 'vanne.papillon_reducteur', params: { variante: 'electrique' },
    motsCles: 'vanne papillon motorisee, papillon electrique, servomoteur, actionneur | motorized butterfly valve, electric actuator butterfly valve' },
  { id: 'vanne_papillon_levier', nom: 'Vanne papillon à levier', base: 'vanne.papillon_reducteur', params: { variante: 'levier' },
    motsCles: 'vanne papillon levier, papillon manuel | lever butterfly valve, manual butterfly valve' },
  { id: 'vanne_manuelle_volant', nom: 'Vanne manuelle à volant', base: 'vanne.manuelle', params: { variante: 'volant' },
    motsCles: 'vanne manuelle volant, robinet volant | handwheel valve, manual gate valve' },
  { id: 'vanne_verticale', nom: 'Vanne manuelle verticale', base: 'vanne.manuelle', tilt: 'x',
    motsCles: 'vanne verticale, vanne sur colonne montante | vertical valve, valve on riser' },
  { id: 'clapet_vertical', nom: 'Clapet anti-retour vertical', base: 'vanne.clapet_battant', tilt: 'x',
    motsCles: 'clapet vertical, non retour vertical, colonne montante | vertical check valve, riser check valve' },
  // ── pompes
  { id: 'pompe_secours', nom: 'Pompe de secours (à l’arrêt)', base: 'pompe.centrifuge_h', libelle: 'Pompe de secours', etat: 'arret',
    motsCles: 'pompe de secours, pompe en secours, secours, redondance, stand-by, pompe de reserve | standby pump, backup pump, spare pump, redundant pump' },
  { id: 'pompe_verticale_secours', nom: 'Pompe verticale de secours', base: 'pompe.centrifuge_v', libelle: 'Pompe de secours', etat: 'arret',
    motsCles: 'pompe verticale secours, pompe de reserve verticale | vertical standby pump, vertical backup pump' },
  { id: 'surpresseur_3', nom: 'Surpresseur 3 pompes', base: 'pompe.surpresseur', params: { nb: 3 },
    motsCles: 'surpresseur trois pompes, groupe de surpression 3 pompes | triple pump booster set, 3 pump booster' },
  // ── cuves
  { id: 'cuve_agitee', nom: 'Cuve agitée', base: 'cuve.verticale', params: { agitateur: true },
    motsCles: 'cuve agitee, cuve avec agitateur, reacteur, melange, brassage | agitated tank, stirred tank, mixing tank, tank with agitator' },
  { id: 'cuve_verre', nom: 'Cuve transparente (niveau visible)', base: 'cuve.verticale', params: { vue: 'verre' },
    motsCles: 'cuve transparente, cuve verre, niveau visible | transparent tank, glass tank, visible level' },
  { id: 'cuve_conique', nom: 'Cuve à fond conique', base: 'cuve.verticale', params: { fond: 'conique' },
    motsCles: 'cuve fond conique, cuve conique, vidange totale | conical bottom tank, cone tank' },
  { id: 'cuve_agitee_conique', nom: 'Cuve agitée à fond conique', base: 'cuve.verticale', params: { agitateur: true, fond: 'conique' },
    motsCles: 'cuve agitee conique, fermenteur, reacteur conique | agitated conical tank, fermenter' },
  // ── CVC, capteurs, site
  { id: 'batterie_froide', nom: 'Batterie froide (CTA)', base: 'cta.batterie', params: { variante: 'froide' },
    motsCles: 'batterie froide, refroidissement, eau glacee, cta | cooling coil, chilled water coil, air handling unit coil' },
  { id: 'batterie_electrique', nom: 'Batterie électrique (CTA)', base: 'cta.batterie', params: { variante: 'electrique' },
    motsCles: 'batterie electrique, resistance, appoint electrique, cta | electric heating coil, electric heater coil' },
  { id: 'analyseur_chlore', nom: 'Analyseur de chlore', base: 'instr.analyseur', params: { variante: 'chlore' },
    motsCles: 'analyseur chlore, chlore libre, piscine, eau potable | chlorine analyzer, free chlorine analyser' },
  { id: 'sonde_co2', nom: 'Sonde d’ambiance CO₂', base: 'instr.sonde_ambiance', params: { variante: 'co2' },
    motsCles: 'sonde co2, qualite de l air, ambiance | co2 sensor, air quality sensor, room sensor' },
  { id: 'conteneur_20_ouvert', nom: 'Conteneur 20 pieds, porte ouverte', base: 'conteneur.c20', params: { porte: 'ouverte' },
    motsCles: 'conteneur 20 pieds ouvert, container porte ouverte | open 20ft container, shipping container open door' },
  { id: 'armoire_ouverte', nom: 'Armoire électrique ouverte', base: 'armoire.a2p', params: { porte: 'ouverte' },
    motsCles: 'armoire ouverte, armoire electrique porte ouverte, coffret ouvert | open electrical cabinet, open switchgear cabinet' },
  { id: 'batiment_deux_pans', nom: 'Bâtiment à toit deux pans', base: 'site.batiment', params: { toit: '2pans' },
    motsCles: 'batiment toit deux pans, toit a pignon | gable roof building, pitched roof building' },
]

export const estPreset = (id: string): boolean => id.startsWith(PREFIXE_PRESET)
export const idPreset = (p: Preset): string => PREFIXE_PRESET + p.id
const PAR_ID = new Map(PRESETS.map((p) => [PREFIXE_PRESET + p.id, p]))
export const trouverPreset = (id: string): Preset | null => PAR_ID.get(id) ?? null

export interface PoseResolue {
  type: string
  params: Record<string, unknown>
  rot?: 0 | 90 | 180 | 270
  tilt?: TiltIso
  etat?: string
  libelle?: string
}
/** résolution d'un identifiant de palette : type du catalogue + réglages (identité pour un symbole ordinaire) */
export function resoudre(id: string): PoseResolue {
  const p = trouverPreset(id)
  if (!p) return { type: id, params: {} }
  return { type: p.base, params: JSON.parse(JSON.stringify(p.params ?? {})) as Record<string, unknown>, rot: p.rot, tilt: p.tilt, etat: p.etat, libelle: p.libelle }
}

/** entrées de recherche (Spotlight, palette, explorateur) : un préréglage est un symbole iso à part entière */
export function entreesPresets(): Entree[] {
  return PRESETS.map((p) => {
    const [fr, en] = p.motsCles.split('|').map((x) => x.split(',').map((m) => m.trim()).filter(Boolean))
    return {
      cle: cleEntree('symbole', 'iso', PREFIXE_PRESET + p.id), genre: 'symbole' as const, contexte: 'iso' as const, id: PREFIXE_PRESET + p.id,
      nom: p.nom, famille: FAMILLE_PRESETS, motsCles: [...(fr ?? []), ...(en ?? []), p.base, p.nom], detail: 'Préréglage',
    }
  })
}

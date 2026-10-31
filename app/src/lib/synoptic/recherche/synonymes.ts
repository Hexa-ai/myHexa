// Synonymes métier français / anglais. Chaque groupe = des termes équivalents (déjà sans accent, en minuscules).
// Une requête qui correspond à un terme d'un groupe cherche aussi tous les autres termes du groupe.
// Pour ajouter un synonyme : ajouter le terme au bon groupe (ou créer un groupe), rien d'autre.
import { normaliser } from './texte'

const GROUPES_BRUTS: string[][] = [
  ['pompe', 'pump'],
  ['circulateur', 'circulator', 'circulating pump', 'pompe de circulation'],
  ['pompe de relevage', 'relevage', 'immergee', 'submersible', 'sump pump', 'lift station'],
  ['surpresseur', 'booster', 'pressure booster', 'groupe de surpression'],
  ['vanne', 'valve', 'robinet', 'robinetterie'],
  ['clapet', 'check valve', 'non retour', 'anti retour', 'nrv', 'non return valve'],
  ['v3v', 'vanne 3 voies', 'vanne trois voies', '3 way', '3 way valve', 'three way', 'melangeuse', 'repartitrice', 'mixing valve', 'diverting valve'],
  ['vanne de regulation', 'control valve', 'regulation', 'modulante', 'modulating valve'],
  ['electrovanne', 'solenoid valve', 'solenoid'],
  ['soupape', 'safety valve', 'relief valve', 'psv'],
  ['cuve', 'bac', 'tank', 'reservoir', 'bache', 'vessel', 'stockage', 'storage'],
  ['silo', 'hopper', 'tremie'],
  ['bassin', 'basin', 'pond', 'lagoon', 'bassin beton'],
  ['decanteur', 'settler', 'clarifier', 'lamellaire', 'lamella'],
  ['cta', 'ahu', 'centrale de traitement d air', 'air handling unit', 'centrale d air', 'traitement d air'],
  ['vmc', 'cmv', 'ventilation', 'extracteur', 'extractor'],
  ['ventilateur', 'fan', 'blower', 'soufflante', 'extracteur d air'],
  ['echangeur', 'heat exchanger', 'exchanger', 'echangeur a plaques', 'plate heat exchanger', 'phe'],
  ['chaudiere', 'boiler', 'chaufferie', 'boiler room', 'generateur de chaleur'],
  ['bruleur', 'burner'],
  ['cheminee', 'chimney', 'stack', 'conduit de fumees', 'flue'],
  ['pac', 'pompe a chaleur', 'heat pump', 'hp'],
  ['groupe froid', 'chiller', 'refroidisseur', 'cooling unit', 'gef', 'production d eau glacee'],
  ['tour aeroreFrigerante', 'cooling tower', 'tar', 'tour de refroidissement'],
  ['groupe electrogene', 'genset', 'generator', 'diesel generator', 'ge', 'secours', 'backup power', 'emergency generator'],
  ['transformateur', 'transfo', 'transformer', 'poste de transformation', 'substation', 'cabine ht', 'htabt', 'mt bt'],
  ['tgbt', 'lv switchboard', 'low voltage switchboard', 'tableau general basse tension', 'tableau general', 'main switchboard', 'distribution electrique'],
  ['armoire', 'cabinet', 'enclosure', 'coffret', 'panel', 'cubicle'],
  ['variateur', 'vfd', 'vsd', 'inverter', 'drive', 'variateur de frequence', 'frequency drive'],
  ['disjoncteur', 'circuit breaker', 'breaker', 'cb'],
  ['moteur', 'motor', 'electric motor'],
  ['motoreducteur', 'gearmotor', 'geared motor', 'reducteur', 'gearbox'],
  ['agitateur', 'agitator', 'mixer', 'stirrer', 'malaxeur', 'melangeur'],
  ['convoyeur', 'conveyor', 'tapis', 'belt', 'vis sans fin', 'screw conveyor'],
  ['compresseur', 'compressor', 'air comprime', 'compressed air'],
  ['filtre', 'filter', 'filtration', 'strainer'],
  ['filtre a sable', 'sand filter', 'sable'],
  ['debitmetre', 'flow meter', 'flowmeter', 'debit', 'flow'],
  ['sonde de temperature', 'temperature sensor', 'temperature', 'thermometre', 'thermometer', 'pt100', 'thermocouple'],
  ['pression', 'pressure', 'manometre', 'pressure gauge', 'transmetteur de pression', 'pressure transmitter', 'pressostat', 'pressure switch'],
  ['niveau', 'level', 'sonde de niveau', 'level sensor', 'level transmitter', 'flotteur', 'float', 'radar'],
  ['voyant', 'indicator', 'indicator light', 'lamp', 'led', 'pilot light', 'signalisation'],
  ['mesure', 'measure', 'measurement', 'sensor', 'capteur', 'transmetteur', 'transmitter'],
  ['ballon', 'ecs', 'domestic hot water', 'hot water tank', 'preparateur', 'calorifuge'],
  ['vase d expansion', 'expansion vessel', 'expansion tank', 'vase'],
  ['bouteille de decouplage', 'hydraulic separator', 'low loss header', 'decoupling bottle', 'bouteille casse pression'],
  ['collecteur', 'manifold', 'header', 'nourrice', 'distributeur'],
  ['batterie', 'coil', 'heating coil', 'cooling coil', 'battery'],
  ['humidificateur', 'humidifier'],
  ['recuperateur', 'heat recovery', 'heat recovery unit', 'roue', 'rotary wheel', 'recuperation de chaleur'],
  ['diffuseur', 'diffuser', 'bouche', 'grille', 'grille de soufflage', 'vent'],
  ['panneau photovoltaique', 'photovoltaic', 'pv', 'solar panel', 'solaire', 'panneau solaire', 'toiture pv'],
  ['irve', 'ev charger', 'borne de recharge', 'charging station', 'electric vehicle charger', 'recharge vehicule electrique'],
  ['box', 'passerelle', 'gateway', 'hai', 'modem', 'routeur', 'router', 'automate'],
  ['batiment', 'building', 'immeuble', 'bureaux', 'offices', 'locaux'],
  ['entrepot', 'warehouse', 'hall', 'hangar', 'industrial building', 'logistique'],
  ['sous station', 'substation heat', 'district heating substation', 'sst', 'reseau de chaleur', 'district heating', 'chauffage urbain'],
  ['salle gtb', 'gtb', 'bms', 'building management', 'salle serveurs', 'server room', 'data room', 'local technique', 'supervision'],
  ['parking', 'car park', 'stationnement', 'parc de stationnement'],
  ['station de pompage', 'pumping station', 'poste de relevage', 'lift station', 'relevage'],
  ['chateau d eau', 'water tower', 'reservoir sureleve', 'elevated tank'],
  ['step', 'wwtp', 'wastewater treatment', 'sewage treatment plant', 'station d epuration', 'epuration', 'assainissement'],
  ['arbre', 'tree', 'vegetation', 'espaces verts', 'bosquet'],
  ['cloture', 'fence', 'grillage', 'perimetre'],
  ['voirie', 'road', 'route', 'allee', 'chemin', 'path', 'driveway'],
  ['compteur gaz', 'gas meter', 'poste de livraison', 'delivery point', 'gaz', 'gas', 'detente gaz'],
  ['uv', 'ultraviolet', 'desinfection', 'disinfection', 'reacteur uv'],
  ['dalle', 'slab', 'socle', 'plinth', 'beton', 'concrete'],
  ['mur', 'wall', 'cloison', 'partition'],
  ['passerelle metallique', 'walkway', 'catwalk', 'garde corps', 'caillebotis'],
  ['analyseur', 'analyzer', 'analyser', 'ph', 'chlore', 'chlorine', 'turbidite', 'turbidity'],
  ['klaxon', 'horn', 'sirene', 'siren', 'beacon', 'gyrophare', 'colonne lumineuse', 'signal tower'],
  ['purgeur', 'air vent', 'vent valve', 'degazeur', 'deaerator'],
  ['compteur d energie', 'energy meter', 'calorimetre', 'heat meter', 'btu meter', 'comptage'],
  ['texte', 'text', 'label', 'etiquette', 'annotation'],
  ['zone', 'area', 'region', 'cadre', 'frame', 'groupe'],
  ['image', 'picture', 'photo', 'logo'],
  ['carte', 'card', 'tile', 'carte auxiliaire', 'auxiliary card'],
  ['verin', 'cylinder', 'actuator', 'actionneur', 'ram'],
  ['tuyau', 'pipe', 'conduite', 'piping', 'canalisation', 'tube'],
  ['gaine', 'duct', 'ductwork', 'conduit', 'air duct'],
  ['bride', 'flange', 'raccord', 'fitting', 'connection'],
]

export const GROUPES: string[][] = GROUPES_BRUTS.map((g) => [...new Set(g.map(normaliser))])

/** termes équivalents d'une requête normalisée (hors la requête elle-même) */
export function synonymesDe(q: string): string[] {
  const n = normaliser(q)
  if (!n) return []
  const out = new Set<string>()
  for (const g of GROUPES) {
    const touche = g.some((t) => {
      if (t === n) return true
      // le terme du groupe commence par ce qui est tapé (« pomp » → « pompe »), à partir de 3 lettres
      if (n.length >= 3 && t.startsWith(n)) return true
      // la requête contient le terme complet (« vanne 3 voies » contient « vanne »)
      return n.length > t.length && t.length >= 3 && (' ' + n + ' ').includes(' ' + t + ' ')
    })
    if (touche) g.forEach((t) => t !== n && out.add(t))
  }
  return [...out]
}

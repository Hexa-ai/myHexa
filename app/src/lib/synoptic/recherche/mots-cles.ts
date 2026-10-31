// Mots-clés déclarés par symbole, pour la recherche (Spotlight, palette, explorateur).
// Format d'une entrée : « termes français, … | termes anglais, … ». Les deux côtés sont obligatoires pour un symbole du catalogue :
// un test (recherche.spec.ts) échoue si un symbole iso ou 2D n'a pas au moins un mot-clé anglais.
// Pour ajouter un symbole : ajouter une ligne ici (clé = identifiant iso « famille.nom » ou clé de la palette 2D).
import { mots } from './texte'
import { T_METIERS } from './mots-cles-metiers'

const T: Record<string, string> = {
  // ── pompes
  'pompe.centrifuge_gros': 'pompe, centrifuge, gros debit, socle beton | pump, centrifugal pump, large pump, base-mounted',
  'pompe.axe_vertical': 'pompe, axe vertical, forage, puits | pump, vertical shaft pump, borehole pump, turbine pump',
  'pompe.centrifuge_h': 'pompe, centrifuge, horizontale, monobloc | pump, centrifugal pump, horizontal, close-coupled',
  'pompe.centrifuge_v': 'pompe, centrifuge, verticale, in-line | pump, centrifugal pump, vertical, inline pump',
  'pompe.multicellulaire_v': 'pompe, multicellulaire, haute pression | pump, multistage pump, high pressure',
  'pompe.immergee': 'pompe de relevage, immergee, eaux usees, puisard | pump, submersible pump, sump pump, sewage pump',
  'pompe.doseuse': 'pompe doseuse, dosage, membrane, reactif | dosing pump, metering pump, diaphragm pump, chemical feed',
  'pompe.volumetrique': 'pompe volumetrique, vis excentree, boues | positive displacement pump, progressive cavity pump, screw pump',
  'pompe.circulateur': 'circulateur, pompe de chauffage, jumele | circulator, circulating pump, heating pump, twin pump',
  'pompe.surpresseur': 'surpresseur, groupe de pompes, skid | booster set, pressure booster, pump skid',
  // ── vannes
  'vanne.quart_tour': 'vanne, quart de tour, boisseau, levier | valve, ball valve, quarter-turn valve, lever',
  'vanne.papillon_reducteur': 'vanne papillon, reducteur, volant | butterfly valve, gear operated, handwheel',
  'vanne.opercule': 'robinet-vanne, opercule, volant, tige montante | gate valve, wedge, rising stem, handwheel',
  'vanne.manchon': 'vanne a manchon, pinch valve, pneumatique | pinch valve, sleeve valve, pneumatic',
  'vanne.siege_agro': 'vanne a clapet, siege inox, agroalimentaire, clamp | seat valve, sanitary valve, hygienic valve, clamp',
  'vanne.double_siege': 'vanne double siege, mixproof, fuite | double seat valve, mixproof valve, leakage chamber',
  'vanne.clapet_battant': 'clapet de non-retour, battant, anti-retour | swing check valve, non-return valve, check valve',
  'vanne.clapet_boule': 'clapet a boule, eaux usees, non-retour | ball check valve, wastewater check valve, non-return valve',
  'vanne.auto': 'vanne automatique, adaptee au dn | valve, auto size valve, generic valve',
  'vanne.boisseau_pneu': 'vanne tor, boisseau, actionneur pneumatique | on-off valve, pneumatic ball valve, actuated ball valve',
  'vanne.papillon_motor': 'vanne papillon motorisee, actionneur electrique | motorized butterfly valve, electric actuator, actuated valve',
  'vanne.regulation': 'vanne de regulation, soupape, positionneur, modulante | control valve, globe valve, positioner, modulating valve',
  'vanne.3voies': 'v3v, vanne 3 voies, vanne trois voies, melangeuse, repartitrice | three-way valve, 3-way valve, mixing valve, diverting valve',
  'vanne.manuelle': 'vanne manuelle, volant, levier | manual valve, hand valve, handwheel',
  'vanne.electrovanne': 'electrovanne, solenoide | solenoid valve, solenoid',
  'vanne.clapet': 'clapet anti-retour, non-retour | check valve, non-return valve, one-way valve',
  'vanne.soupape': 'soupape de securite, surpression, decharge | safety valve, relief valve, pressure relief',
  'vanne.filtre_y': 'filtre en y, tamis, crepine | y-strainer, strainer, wye filter',
  'vanne.pot_boue': 'pot a boues, magnetique, desemboueur | dirt separator, magnetic filter, sludge pot',
  // ── stockage
  'cuve.verticale': 'cuve, bac, reservoir vertical, fond plat | tank, vertical tank, storage tank, vessel',
  'cuve.horizontale': 'cuve horizontale, selles, citerne | horizontal tank, saddle tank, cistern',
  'cuve.double_paroi': 'cuve double paroi, retention, fioul | double wall tank, bunded tank, fuel tank, containment',
  'bassin.beton': 'bassin beton, ouvert, ouvrage | concrete basin, open tank, pond',
  'decanteur.lamellaire': 'decanteur lamellaire, tremies, clarificateur | lamella settler, clarifier, settling tank',
  'silo.tremie': 'silo, tremie, stockage vrac | silo, hopper, bulk storage',
  'ballon.ecs': 'ballon ecs, eau chaude sanitaire, calorifuge | hot water tank, domestic hot water cylinder, dhw tank, calorifier',
  bache: 'bache, reservoir d eau, bac tampon | buffer tank, water tank, break tank',
  vase_expansion: 'vase d expansion, pression, vessie | expansion vessel, expansion tank, diaphragm tank',
  bouteille_decouplage: 'bouteille de decouplage, casse-pression, separateur hydraulique | hydraulic separator, low loss header, decoupling bottle',
  // ── traitement
  'traitement.filtre_sable': 'filtre a sable, vanne multivoie, piscine | sand filter, multiport valve, media filter',
  'traitement.filtre_cartouche': 'filtre a cartouche, carter, filtration | cartridge filter, filter housing, filtration',
  'traitement.echangeur_plaques': 'echangeur a plaques, tirants, chauffage | plate heat exchanger, phe, heat exchanger',
  'traitement.echangeur_tubulaire': 'echangeur tubulaire, calandre | shell and tube heat exchanger, tubular exchanger, heat exchanger',
  'traitement.separateur': 'separateur, hydrocyclone, degazeur | separator, hydrocyclone, deaerator, degasser',
  'traitement.centrifugeuse': 'centrifugeuse, decanteur centrifuge, boues | centrifuge, decanter centrifuge, sludge dewatering',
  'traitement.uv': 'reacteur uv, desinfection, ultraviolet | uv reactor, disinfection, ultraviolet sterilizer',
  // ── mécanique
  'meca.moteur': 'moteur electrique, carcasse | electric motor, motor, induction motor',
  'meca.motoreducteur': 'motoreducteur, reducteur | gear motor, geared motor, gearbox',
  'meca.agitateur': 'agitateur, helice, melangeur | agitator, mixer, propeller mixer, stirrer',
  'meca.convoyeur_bande': 'convoyeur a bande, tapis roulant | belt conveyor, conveyor belt',
  'meca.convoyeur_vis': 'convoyeur a vis, vis sans fin, tremie | screw conveyor, auger, hopper conveyor',
  'meca.compresseur_vis': 'compresseur a vis, air comprime, secheur | screw compressor, compressed air, air dryer',
  'meca.compresseur_piston': 'compresseur a piston, reservoir | piston compressor, reciprocating compressor, air receiver',
  'meca.ventilateur_centrifuge': 'ventilateur centrifuge, volute | centrifugal fan, blower, scroll fan',
  'meca.ventilateur_helicoide': 'ventilateur helicoide, mural, toiture | axial fan, propeller fan, wall fan, roof fan',
  'meca.surpresseur_air': 'surpresseur d air, suppresseur, lobes | air blower, roots blower, aeration blower',
  // ── chaufferie
  'chaufferie.chaudiere': 'chaudiere, brûleur, cheminee, generateur | boiler, burner, heat generator',
  'chaufferie.bruleur': 'bruleur gaz, fioul, souffle | gas burner, oil burner, forced draught burner',
  'chaufferie.cheminee': 'cheminee, conduit de fumees, evacuation | chimney, flue, stack',
  'chaufferie.pac': 'pac, pompe a chaleur, air eau | heat pump, air to water heat pump, hp',
  'chaufferie.groupe_froid': 'groupe froid, refroidisseur, eau glacee | chiller, water chiller, cooling unit',
  'chaufferie.tour_aero': 'tour aeroreFrigerante, refroidissement | cooling tower, evaporative cooler',
  'chaufferie.collecteur': 'collecteur, nourrice, aller retour, departs | manifold, header, distribution header',
  'chaufferie.console': 'console, support de collecteurs | manifold support, bracket, frame',
  'chaufferie.compteur_energie': 'compteur d energie, calorimetre, comptage | energy meter, heat meter, btu meter',
  'chaufferie.purgeur': 'purgeur, degazeur, event | air vent, deaerator, vent valve',
  'raccord.bouchon': 'bouchon, fond de collecteur, bride pleine, purge | end cap, blind flange, manifold end',
  'raccord.bout': 'bout de tuyau, bride, ancre, raccord | pipe stub, flanged end, anchor, fitting',
  // ── CTA
  'cta.prise_air': 'prise d air neuf, grille pare-pluie, entree d air | fresh air intake, outdoor air louvre, air inlet',
  'cta.rejet_air': 'rejet d air, grille pare-pluie, evacuation | exhaust air, discharge louvre, air outlet',
  'cta.registre': 'registre motorise, volet, servomoteur | motorized damper, damper, actuator, louvre',
  'cta.melange': 'caisson de melange, recyclage, air neuf | mixing box, recirculation, mixing section',
  'cta.filtre_plan': 'filtre plan, cellules, pressostat differentiel | panel filter, flat filter, differential pressure switch',
  'cta.filtre_poches': 'filtre a poches, pressostat differentiel | bag filter, pocket filter, differential pressure switch',
  'cta.batterie': 'batterie chaude, batterie froide, glycolee, electrique | heating coil, cooling coil, air coil, electric heater',
  'cta.humidificateur': 'humidificateur, vapeur, adiabatique | humidifier, steam humidifier, adiabatic',
  'cta.recup_plaques': 'recuperateur a plaques, flux croises | plate heat recovery, cross flow heat exchanger, heat recovery',
  'cta.recup_roue': 'roue de recuperation, rotative | rotary heat wheel, heat recovery wheel, enthalpy wheel',
  'cta.piege_son': 'piege a son, baffles, silencieux | sound attenuator, silencer, acoustic baffle',
  'cta.ventilateur': 'ventilateur plug-fan, roue libre | plug fan, supply fan, ahu fan',
  'cta.section_vide': 'section vide, porte de visite, eclairage | empty section, access section, inspection section',
  'cta.diffuseur': 'diffuseur plafonnier, plenum, soufflage, reprise | ceiling diffuser, plenum, supply air, return air',
  'cta.bouche_murale': 'bouche murale, grille, reprise | wall grille, air terminal, return grille',
  'cta_e.module': 'module cta, centrale de traitement d air, ecorche | ahu module, air handling unit, cutaway',
  'cta_e.gaine': 'gaine, manchette souple | duct, flexible connection, ductwork',
  'cta_e.registre': 'registre ecorche, volet | cutaway damper, damper, ahu section',
  'cta_e.filtre_plan': 'filtre plan ecorche | cutaway panel filter, ahu filter, flat filter',
  'cta_e.filtre_poches': 'filtre a poches ecorche | cutaway bag filter, ahu filter, pocket filter',
  'cta_e.batterie_chaude': 'batterie chaude ecorchee | cutaway heating coil, hot water coil, ahu coil',
  'cta_e.batterie_froide': 'batterie froide, bac a condensats ecorche | cutaway cooling coil, chilled water coil, drain pan',
  'cta_e.humidificateur': 'humidificateur ecorche | cutaway humidifier, ahu humidifier, steam',
  'cta_e.roue': 'roue de recuperation ecorchee | cutaway heat wheel, rotary wheel, heat recovery',
  'cta_e.ventilateur': 'plug-fan ecorche, ventilateur | cutaway plug fan, ahu fan, supply fan',
  'cta_e.piege_son': 'piege a son ecorche | cutaway sound attenuator, silencer, baffles',
  'cta_e.vide': 'section vide ecorchee | cutaway empty section, access section, spacer',
  'cta_e.echangeur_croise': 'echangeur a plaques flux croises ecorche | cutaway cross flow heat exchanger, plate exchanger, heat recovery',
  'cta_e.echangeur_contre': 'echangeur a plaques contre-courant ecorche | cutaway counter flow heat exchanger, plate exchanger, heat recovery',
  'cta_e.melange_x': 'caisson de melange en x, recyclage | cutaway mixing box, x mixing, recirculation',
  // ── électrique
  'elec.armoire': 'armoire electrique, coffret, porte | electrical cabinet, switchgear cabinet, enclosure, panel',
  'elec.tgbt': 'tgbt, tableau general basse tension, colonnes | lv switchboard, main switchboard, low voltage panel',
  'elec.variateur': 'variateur de frequence, variateur de vitesse | variable frequency drive, vfd, vsd, inverter',
  'elec.transformateur': 'transformateur, transfo, ailettes | transformer, power transformer, distribution transformer',
  'elec.disjoncteur': 'disjoncteur, protection, modulaire | circuit breaker, breaker, mcb, mccb',
  'elec.groupe_electrogene': 'groupe electrogene, secours, capot | generator set, genset, diesel generator, standby generator',
  'elec.panneau_pv': 'panneau photovoltaique, solaire, cellules | solar panel, photovoltaic panel, pv module',
  'elec.borne_irve': 'borne irve, recharge vehicule electrique | ev charger, charging point, electric vehicle charger',
  'elec.box_hai': 'box hai, passerelle, 4g, rail din | hai box, gateway, 4g router, din rail',
  // ── scène
  'scene.dalle': 'dalle, socle beton, plot | slab, concrete base, plinth',
  'scene.mur': 'mur, limite de zone, porte, cloison | wall, partition, zone limit, door',
  'scene.passerelle': 'passerelle, caillebotis, garde-corps | walkway, catwalk, grating, handrail',
  // ── instrumentation
  'instr.pression': 'transmetteur de pression, capteur de pression | pressure transmitter, pressure sensor',
  'instr.pression_manifold': 'transmetteur de pression, manifold 3 voies | pressure transmitter, three-valve manifold',
  'instr.temperature': 'sonde de temperature, doigt de gant, tete | temperature sensor, rtd, pt100, thermowell',
  'instr.debitmetre': 'debitmetre electromagnetique, debit | electromagnetic flow meter, flowmeter, magmeter',
  'instr.niveau_radar': 'niveau radar, ultrason, transmetteur de niveau | radar level transmitter, ultrasonic level, level sensor',
  'instr.niveau_flotteur': 'niveau a flotteur, chambre by-pass, indicateur | float level, bypass chamber level gauge, level indicator',
  'instr.poire_niveau': 'poire de niveau, flotteur | level float switch, float switch, pear switch',
  'instr.pressostat': 'pressostat, thermostat, contact | pressure switch, thermostat, switch',
  'instr.analyseur': 'analyseur, ph, chlore, co2, turbidite | analyzer, ph, chlorine, turbidity sensor',
  'instr.voyant_klaxon': 'colonne lumineuse, klaxon, voyant | signal tower, beacon, horn, stack light',
  'instr.thermometre': 'thermometre a cadran, doigt de gant | dial thermometer, thermometer, thermowell',
  'instr.manometre': 'manometre a cadran, pression | pressure gauge, dial gauge, manometer',
  'instr.repere': 'repere de mesure, pastille, piquage | measurement tag, instrument tag, tapping point',
  'instr.sonde_ambiance': 'sonde d ambiance, temperature ambiante, hygrometrie | room sensor, ambient temperature sensor, humidity sensor',
  // ── site / architecture
  'site.batiment': 'batiment principal, immeuble, etages, toit | main building, building, office block, floors, roof',
  'site.bureaux': 'bureaux, locaux, tertiaire, vitres | offices, office building, administration, glazing',
  'site.entrepot': 'entrepot, hall industriel, hangar, logistique, portes | warehouse, industrial hall, hangar, logistics, loading doors',
  'site.chaufferie': 'local chaufferie, chaufferie, cheminee, chaudiere | boiler room, plant room, energy centre, chimney',
  'site.sous_station': 'sous-station, reseau de chaleur, echangeur, chauffage urbain | heat substation, district heating substation, heat interface unit',
  'site.salle_gtb': 'salle gtb, salle serveurs, supervision, local technique | bms room, server room, control room, building management',
  'site.poste_transfo': 'poste de transformation, cabine, haute tension, htabt | transformer substation, electrical substation, switchyard cabin, mv lv substation',
  'site.transfo_exterieur': 'transformateur exterieur, transfo, grillage, socle | outdoor transformer, pad-mounted transformer, transformer yard',
  'site.groupe_container': 'groupe electrogene container, secours, genset | containerized generator, genset, standby power, generator container',
  'site.local_tgbt': 'local tgbt, tableau general, basse tension | lv switchboard room, main distribution room, electrical room',
  'site.parking_irve': 'parking irve, bornes de recharge, vehicules electriques | ev parking, charging station, ev charging bay',
  'site.parking': 'parking, stationnement, places | car park, parking lot, parking spaces',
  'site.toiture_pv': 'toiture photovoltaique, panneaux solaires, centrale pv | rooftop pv, solar array, photovoltaic roof',
  'site.station_pompage': 'station de pompage, station de relevage, poste de refoulement | pumping station, lift station, sewage pumping station',
  'site.chateau_eau': 'chateau d eau, reservoir sureleve, tour | water tower, elevated tank, standpipe',
  'site.step': 'step, station d epuration, bassins, assainissement | wastewater treatment plant, wwtp, sewage works, treatment ponds',
  'site.arbres': 'arbres, vegetation, espaces verts, bosquet | trees, vegetation, landscaping, greenery',
  'site.cloture': 'cloture, grillage, poteaux, perimetre | fence, fencing, perimeter fence, posts',
  'site.voirie': 'voirie, route, allee, chemin, acces | road, driveway, path, access road, street',
  'site.poste_gaz': 'poste de livraison gaz, compteur gaz, detente | gas delivery station, gas meter, regulator station, metering skid',
  // ── palette 2D (clés du moteur)
  cuve: 'cuve, bac, reservoir, niveau | tank, vessel, storage tank, level',
  decanteur: 'decanteur, clarificateur, tremies, lamelles | settler, clarifier, settling tank, lamella',
  silo: 'silo, tremie, stockage | silo, hopper, bulk storage',
  bassin: 'bassin, ouvert | basin, open tank, pond',
  pompe: 'pompe, pompage | pump, pumping',
  compresseur: 'compresseur, air comprime | compressor, compressed air',
  ventilateur: 'ventilateur, soufflante, extracteur | fan, blower, extractor',
  vanne: 'vanne, robinet, tor | valve, on-off valve, gate valve',
  vanne_reg: 'vanne de regulation, modulante, position | control valve, modulating valve, position',
  vanne_man: 'vanne manuelle, robinet manuel | manual valve, hand valve',
  vanne_3v: 'v3v, vanne 3 voies, melangeuse, repartitrice | three-way valve, 3-way valve, mixing valve',
  clapet: 'clapet anti-retour, non-retour | check valve, non-return valve',
  filtre: 'filtre, colmatage, perte de charge | filter, strainer, clogging, pressure drop',
  echangeur: 'echangeur, echangeur a plaques, temperature | heat exchanger, plate exchanger, temperature',
  cta_simple: 'cta, centrale de traitement d air, simple flux | ahu, air handling unit, single flow',
  cta_double: 'cta double flux, recuperateur | ahu, air handling unit, balanced ventilation, heat recovery',
  chaufferie: 'chaufferie, chaudiere, bruleur, production de chaleur | boiler room, boiler, burner, heat plant',
  collecteur: 'collecteur, nourrice, departs | manifold, header, distribution',
  moteur: 'moteur, marche, defaut | motor, electric motor, running',
  agitateur: 'agitateur, melangeur | agitator, mixer, stirrer',
  convoyeur: 'convoyeur, tapis, bande | conveyor, belt, conveyor belt',
  verin: 'verin, actionneur, sorti, rentre | cylinder, actuator, extended, retracted',
  disjoncteur: 'disjoncteur, protection, declenche | circuit breaker, breaker, tripped',
  transformateur: 'transformateur, transfo, temperature | transformer, transfo, temperature',
  variateur: 'variateur, variateur de frequence, vitesse | variable frequency drive, vfd, inverter, speed',
  mesure: 'mesure, capteur, valeur, grandeur | measurement, sensor, value, transmitter',
  voyant: 'voyant, etat, signalisation, alarme | indicator light, status lamp, pilot light, alarm',
  carte: 'carte auxiliaire, carte, pompe doseuse | auxiliary card, card, dosing pump',
  texte: 'texte, etiquette, annotation | text, label, annotation',
  zone: 'zone, cadre, groupe, ouvrage | zone, area, frame, group',
  image: 'image, photo, logo | image, picture, photo, logo',
}

export interface MotsCles {
  fr: string[]
  en: string[]
}

/** mots-clés déclarés pour un identifiant de symbole (iso « famille.nom » ou clé 2D) ; vide si non déclaré */
export function motsClesDe(id: string): MotsCles {
  const brut = T[id] ?? T_METIERS[id]
  if (!brut) return { fr: [], en: [] }
  const [fr, en] = brut.split('|').map((x) => x.split(',').map((m) => m.trim()).filter(Boolean))
  return { fr: fr ?? [], en: en ?? [] }
}

/** tous les mots (normalisés) à indexer pour un symbole */
export function motsIndexables(id: string): string[] {
  const k = motsClesDe(id)
  return [...k.fr, ...k.en].flatMap(mots)
}

/** identifiants ayant des mots-clés déclarés (utile aux tests) */
export const idsAvecMotsCles = (): string[] => [...Object.keys(T), ...Object.keys(T_METIERS)]

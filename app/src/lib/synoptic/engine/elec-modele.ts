// Famille « Schéma électrique » (NF C 15-100 / CEI 60617) du synoptique 2D : catalogue, géométrie, états et propagation de la tension.
// Un seul type d'équipement `elec`, le symbole est dans `params.sym`. Le dessin vit dans elec-dessin.ts, ce fichier est sans DOM.
//
// Règles d'état (même principe que le reste du moteur : un emplacement sans variable est INCONNU, jamais déduit) :
//   - appareil de coupure : `declenche` ou `defaut` = 1 → défaut (déclenché, ouvert, rouge) ; `ferme` = 1 / 0 (ou `ouvert` inversé) → fermé / ouvert ;
//   - contact NO / NF sans variable : repos dessiné en pointillé, tension en aval « inconnue » ;
//   - arrivée réseau sans variable `present` : réputée présente (c'est la source du schéma) ; `present` = 0 → hors tension partout.

export type PolesElec = '1P' | '1PN' | '2P' | '3P' | '4P'
export type ModeElec = 'multi' | 'uni'
export type EtatElec = 'marche' | 'arret' | 'defaut' | 'inconnu' | 'ok'
export type FamilleElec = 'protection' | 'commande' | 'puissance' | 'distribution'

export interface ParamsElec {
  sym: string
  /** pôles de l'appareil (symboles qui en ont) */
  poles?: PolesElec
  /** multifilaire (un trait par pôle) ou unifilaire (un trait + barres obliques) */
  mode?: ModeElec
  /** repère d'appareil affiché (Q1, KM1…) */
  repere?: string
  /** jeu de barres : longueur et nombre de départs (≤ 4) */
  longueur?: number
  sorties?: number
  /** bornier : nombre de voies ; moteur : 1 ou 3 phases ; arrivée : texte de tension */
  voies?: number
  phases?: 1 | 3
  texte?: string
  /** contact : repos (NO = ouvert au repos) */
  repos?: 'NO' | 'NF'
}

export interface DefElec {
  cle: string
  sym: string
  famille: FamilleElec
  nom: string
  /** préfixe du repère d'appareil (norme CEI 81346 / NF C 03-xxx) */
  repere: string
  /** emplacements créés avec le symbole */
  slots: string[]
  /** a des pôles configurables */
  poles?: boolean
  /** mots-clés « fr | en » pour le Spotlight (sans accents) */
  mots: string
  params?: Partial<ParamsElec>
}

const P = ['courant', 'tension', 'puissance']
const COUPURE = ['ferme', 'declenche', ...P]

const D = (famille: FamilleElec, sym: string, nom: string, repere: string, slots: string[], mots: string, extra: Partial<DefElec> = {}): DefElec => ({
  cle: 'e_' + sym, sym, famille, nom, repere, slots, mots, ...extra,
})

export const DEFS_ELEC: DefElec[] = [
  // protection
  D('protection', 'disjoncteur', 'Disjoncteur', 'Q', COUPURE, 'disjoncteur, protection, coupure, declenche, ouvert, ferme | circuit breaker, breaker, protection, tripped, open, closed', { poles: true, params: { poles: '3P', mode: 'uni' } }),
  D('protection', 'disj_mt', 'Disjoncteur magnétothermique', 'Q', COUPURE, 'disjoncteur magnetothermique, magneto-thermique, disjoncteur modulaire, surintensite | thermal magnetic circuit breaker, mcb, miniature circuit breaker, overcurrent', { poles: true, params: { poles: '3P', mode: 'uni' } }),
  D('protection', 'disj_diff', 'Disjoncteur différentiel', 'Q', [...COUPURE, 'defaut_diff'], 'disjoncteur differentiel, differentiel, fuite a la terre, protection des personnes | residual current circuit breaker, rcbo, earth leakage breaker, rcd', { poles: true, params: { poles: '1PN', mode: 'uni' } }),
  D('protection', 'inter_diff', 'Interrupteur différentiel', 'Q', [...COUPURE, 'defaut_diff'], 'interrupteur differentiel, id, differentiel 30 ma, fuite | residual current device, rcd, rccb, earth leakage switch', { poles: true, params: { poles: '2P', mode: 'uni' } }),
  D('protection', 'fusible', 'Fusible', 'F', ['defaut', ...P], 'fusible, cartouche, protection, fondu, gg, am | fuse, cartridge fuse, blown, protection', { poles: true, params: { poles: '1P', mode: 'uni' } }),
  D('protection', 'sectionneur', 'Sectionneur', 'Q', ['ferme', ...P], 'sectionneur, isolement, consignation, coupure visible | disconnector, isolator, isolation switch, lockout', { poles: true, params: { poles: '3P', mode: 'uni' } }),
  D('protection', 'inter_sect', 'Interrupteur-sectionneur', 'Q', ['ferme', 'declenche', ...P], 'interrupteur-sectionneur, interrupteur sectionneur, interrupteur general, coupure en charge | switch disconnector, load break switch, main switch, isolator switch', { poles: true, params: { poles: '3P', mode: 'uni' } }),
  D('protection', 'sect_fusible', 'Sectionneur-fusible', 'Q', ['ferme', 'defaut', ...P], 'sectionneur fusible, porte-fusible, coupe-circuit, interrupteur fusible | fuse switch disconnector, fused disconnector, fuse holder', { poles: true, params: { poles: '3P', mode: 'uni' } }),
  D('protection', 'parafoudre', 'Parafoudre', 'F', ['defaut'], 'parafoudre, surtension, foudre, protection contre la foudre | surge arrester, surge protector, spd, lightning protection, overvoltage', { params: { poles: '1P' } }),
  // commande
  D('commande', 'contacteur', 'Contacteur', 'KM', ['ferme', 'bobine', 'defaut', ...P], 'contacteur, bobine, contacts de puissance, commande moteur | contactor, coil, power contacts, motor starter', { poles: true, params: { poles: '3P', mode: 'uni' } }),
  D('commande', 'relais', 'Relais', 'KA', ['ferme', 'bobine'], 'relais, relais auxiliaire, bobine, contact auxiliaire | relay, auxiliary relay, coil, auxiliary contact'),
  D('commande', 'contact_no', 'Contact NO', 'S', ['ferme'], 'contact no, contact normalement ouvert, contact a fermeture, travail | normally open contact, no contact, make contact'),
  D('commande', 'contact_nf', 'Contact NF', 'S', ['ferme'], 'contact nf, contact normalement ferme, contact a ouverture, repos | normally closed contact, nc contact, break contact', { params: { repos: 'NF' } }),
  D('commande', 'bouton', 'Bouton-poussoir', 'S', ['ferme'], 'bouton-poussoir, bouton poussoir, bp, poussoir, marche, arret | push button, pushbutton, start button, stop button'),
  D('commande', 'voyant', 'Voyant', 'H', ['etat'], 'voyant, signalisation, lampe de signalisation, temoin | pilot light, indicator lamp, signal lamp, status light'),
  D('commande', 'telerupteur', 'Télérupteur', 'KA', ['ferme', 'bobine'], 'telerupteur, pas a pas, commande impulsionnelle, va-et-vient | impulse relay, latching relay, bistable relay, remote switch'),
  D('commande', 'minuterie', 'Minuterie', 'KT', ['ferme', 'bobine'], 'minuterie, temporisation, relais temporise, escalier | timer, time delay relay, staircase timer, delay'),
  D('commande', 'relais_th', 'Relais thermique', 'F', ['declenche', 'courant'], 'relais thermique, protection moteur, surcharge, bilame | thermal overload relay, motor protection, overload, bimetal', { poles: true, params: { poles: '3P', mode: 'uni' } }),
  // puissance
  D('puissance', 'transfo', 'Transformateur', 'T', ['defaut', 'temperature', ...P], 'transformateur, transfo, tranformateur de puissance, primaire, secondaire | transformer, power transformer, primary, secondary'),
  D('puissance', 'moteur', 'Moteur', 'M', ['marche', 'defaut', ...P], 'moteur, moteur asynchrone, moteur triphase, m 3~ | motor, induction motor, three phase motor, ac motor', { params: { phases: 3 } }),
  D('puissance', 'variateur', 'Variateur de vitesse', 'U', ['marche', 'defaut', 'frequence', ...P], 'variateur, variateur de vitesse, variateur de frequence, convertisseur | variable speed drive, vsd, vfd, frequency converter, inverter'),
  D('puissance', 'demarreur', 'Démarreur progressif', 'U', ['marche', 'defaut', ...P], 'demarreur progressif, soft starter, demarrage doux | soft starter, soft start, motor soft starter'),
  D('puissance', 'prise', 'Prise de courant', 'XS', ['etat', ...P], 'prise, prise de courant, socle, 2p+t, prise 230 v | socket outlet, power socket, outlet, receptacle'),
  D('puissance', 'eclairage', 'Éclairage', 'E', ['etat', 'puissance'], 'eclairage, luminaire, lampe, point lumineux | lighting, luminaire, lamp, light fitting'),
  D('puissance', 'resistance', 'Résistance', 'R', ['etat', ...P], 'resistance, resistance chauffante, chauffage electrique, charge resistive | resistor, heating element, resistive load, heater'),
  D('puissance', 'compteur', "Compteur d'énergie", 'PQ', ['energie', 'puissance'], 'compteur, compteur d energie, kwh, comptage, sous-comptage | energy meter, kwh meter, electricity meter, submeter'),
  D('puissance', 'tc', 'Transformateur de courant', 'TA', ['courant'], 'transformateur de courant, tc, ta, tore, mesure de courant | current transformer, ct, current sensor, toroid'),
  // distribution
  D('distribution', 'barres', 'Jeu de barres', 'XB', ['tension', 'courant'], 'jeu de barres, barres, repartiteur, tableau, distribution | busbar, bus bar, busway, distribution board', { params: { longueur: 240, sorties: 4, mode: 'uni', poles: '3P' } }),
  D('distribution', 'arrivee', 'Arrivée réseau', 'ARR', ['present', ...P], 'arrivee reseau, arrivee, source, reseau, alimentation, enedis, point de livraison | incoming supply, mains, grid supply, source, utility feed', { params: { texte: '400 V 3N~ 50 Hz' } }),
  D('distribution', 'depart', 'Départ', 'DEP', ['courant', 'puissance'], 'depart, depart moteur, depart ligne, sortie, feeder | outgoing feeder, feeder, outgoing line, load feeder', { params: { texte: '' } }),
  D('distribution', 'borne', 'Borne', 'X', [], 'borne, point de raccordement, connexion | terminal, connection point, terminal point'),
  D('distribution', 'bornier', 'Bornier', 'X', [], 'bornier, borniers, barrette de bornes, raccordement | terminal block, terminal strip, terminal row', { params: { voies: 4 } }),
  D('distribution', 'terre', 'Terre (PE)', 'PE', [], 'terre, mise a la terre, pe, conducteur de protection, liaison equipotentielle | earth, ground, pe, protective earth, earthing'),
  D('distribution', 'neutre', 'Neutre (N)', 'N', [], 'neutre, barrette de neutre, conducteur neutre, n | neutral, neutral bar, neutral link, n conductor'),
]

export const DEF_PAR_CLE: Readonly<Record<string, DefElec>> = Object.fromEntries(DEFS_ELEC.map((d) => [d.cle, d]))
export const DEF_PAR_SYM: Readonly<Record<string, DefElec>> = Object.fromEntries(DEFS_ELEC.map((d) => [d.sym, d]))
export const FAMILLE_PALETTE_ELEC = { id: 'sch', titre: 'Schéma électrique (NF / CEI 60617)', nomCatalogue: 'Schéma électrique' }

export const estTypeElec = (t: unknown): boolean => t === 'elec'
export const defDe = (params?: { sym?: string } | null): DefElec | null => (params?.sym ? DEF_PAR_SYM[params.sym] ?? null : null)

/** libellés des emplacements de la famille (panneau de liaison des variables) */
export const SLOT_ELEC_FR: Record<string, string> = {
  ferme: 'Fermé (position des contacts)', declenche: 'Déclenché', bobine: 'Bobine excitée', present: 'Tension présente', defaut_diff: 'Défaut différentiel',
  courant: 'Courant I (A)', tension: 'Tension U (V)', puissance: 'Puissance P (kW)', energie: 'Énergie (kWh)',
}
export const UNITE_ELEC: Record<string, { u: string; d: number; lettre: string }> = {
  courant: { u: 'A', d: 1, lettre: 'I' }, tension: { u: 'V', d: 0, lettre: 'U' }, puissance: { u: 'kW', d: 1, lettre: 'P' }, energie: { u: 'kWh', d: 0, lettre: 'E' },
  frequence: { u: 'Hz', d: 0, lettre: 'f' }, temperature: { u: '°C', d: 0, lettre: 'θ' },
}

export const POLES: Record<PolesElec, { n: number; nom: string; slashes: number }> = {
  '1P': { n: 1, nom: '1P (monophasé phase)', slashes: 1 },
  '1PN': { n: 2, nom: '1P+N', slashes: 2 },
  '2P': { n: 2, nom: '2P', slashes: 2 },
  '3P': { n: 3, nom: '3P', slashes: 3 },
  '4P': { n: 4, nom: '3P+N (4P)', slashes: 4 },
}
export const nbPoles = (p?: string): number => POLES[(p as PolesElec) ?? '1P']?.n ?? 1
export const nbBarres = (p?: string): number => POLES[(p as PolesElec) ?? '1P']?.slashes ?? 1

/** paramètres par défaut d'un symbole (copie) */
export function paramsDefaut(cle: string): ParamsElec {
  const d = DEF_PAR_CLE[cle]
  return { sym: d.sym, ...(d.params ?? {}) }
}

/* ------------------------------------------------------------------ géométrie (repère local du nœud, unités du synoptique) */

export const PAS_POLE = 20
export const HAUTEUR = 80
export const LARGEUR_REPERE = 74

export interface PortElec { x: number; y: number; side: 'N' | 'S' | 'E' | 'W' }
export interface GeoElec {
  /** largeur du symbole seul (sans la colonne des repères) et hauteur */
  w: number
  h: number
  /** axe vertical du symbole (là où arrivent les conducteurs) */
  cx: number
  /** abscisses des pôles dessinés */
  poles: number[]
  ports: Record<string, PortElec>
  /** marge à gauche réservée aux accessoires (bobine, déclencheurs, organe de commande) */
  gauche: number
}

const GAUCHE: Record<string, number> = {
  disj_mt: 30, disj_diff: 30, inter_diff: 30, contacteur: 50, relais: 50, telerupteur: 50, minuterie: 50, bouton: 30, relais_th: 0, tc: 0,
}
/** symboles terminaux : une seule borne (l'arrivée n'a qu'une sortie, les charges et les départs qu'une entrée) */
const SANS_ENTREE = new Set(['arrivee'])
const SANS_SORTIE = new Set(['depart', 'moteur', 'prise', 'eclairage', 'terre', 'parafoudre'])

/** nombre de pôles réellement dessinés côte à côte */
export function polesDessines(params: ParamsElec): number {
  const def = DEF_PAR_SYM[params.sym]
  if (!def?.poles || (params.mode ?? 'multi') === 'uni') return 1
  return nbPoles(params.poles)
}

export function geometrieElec(params: ParamsElec): GeoElec {
  const sym = params.sym
  const H = HAUTEUR
  const gauche = GAUCHE[sym] ?? 0
  if (sym === 'barres') {
    const L = Math.max(120, Math.round((params.longueur ?? 240) / 20) * 20), n = Math.min(4, Math.max(1, params.sorties ?? 4))
    const ports: Record<string, PortElec> = { in: { x: 20, y: 0, side: 'N' }, out: { x: L, y: 12, side: 'E' } }
    for (let i = 0; i < n; i++) ports['p' + (3 + i)] = { x: n === 1 ? L / 2 : 20 + Math.round(((L - 60) / (n - 1)) / 10) * 10 * i + 20, y: 24, side: 'S' }
    return { w: L, h: 24, cx: 20, poles: [20], ports, gauche: 0 }
  }
  if (sym === 'bornier') {
    const n = Math.max(1, Math.min(8, params.voies ?? 4)), w = Math.max(40, (n - 1) * PAS_POLE + 40), cx = w / 2
    return { w, h: 60, cx, poles: Array.from({ length: n }, (_, i) => cx + (i - (n - 1) / 2) * PAS_POLE), ports: { in: { x: cx, y: 0, side: 'N' }, out: { x: cx, y: 60, side: 'S' } }, gauche: 0 }
  }
  const n = polesDessines(params)
  const base = Math.max(40, (n - 1) * PAS_POLE + 40)
  const cx = gauche + base / 2
  const poles = Array.from({ length: n }, (_, i) => cx + (i - (n - 1) / 2) * PAS_POLE)
  let h = H
  if (['moteur', 'transfo', 'variateur', 'demarreur', 'compteur'].includes(sym)) h = 100
  if (['prise', 'eclairage', 'resistance', 'voyant', 'tc'].includes(sym)) h = 80
  if (['borne', 'neutre'].includes(sym)) h = 40
  if (sym === 'terre') h = 40
  if (sym === 'arrivee' || sym === 'depart') h = 60
  if (sym === 'parafoudre') h = 100
  const ports: Record<string, PortElec> = {}
  if (!SANS_ENTREE.has(sym)) ports.in = { x: cx, y: 0, side: 'N' }
  if (!SANS_SORTIE.has(sym)) ports.out = { x: cx, y: h, side: 'S' }
  if (['contacteur', 'relais', 'telerupteur', 'minuterie'].includes(sym)) {
    ports.p3 = { x: 20, y: 0, side: 'N' }
    ports.p4 = { x: 20, y: h, side: 'S' }
  }
  if (sym === 'relais_th') {
    ports.p3 = { x: cx + base / 2 + 0, y: 0, side: 'N' }
    ports.p4 = { x: cx + base / 2 + 0, y: h, side: 'S' }
  }
  if (sym === 'tc') {
    ports.p3 = { x: cx + 30, y: 34, side: 'E' }
    ports.p4 = { x: cx + 30, y: 46, side: 'E' }
  }
  const w = sym === 'relais_th' ? gauche + base + 30 : sym === 'tc' ? base + 30 : gauche + base
  if (sym === 'relais_th') { ports.p3.x = cx + (n - 1) * PAS_POLE / 2 + 50; ports.p4.x = ports.p3.x }
  return { w, h, cx, poles, ports, gauche }
}

/* ------------------------------------------------------------------ états */

type Lire = (nom: string) => number | undefined
const COUPURES = new Set(['disjoncteur', 'disj_mt', 'disj_diff', 'inter_diff', 'sectionneur', 'inter_sect', 'sect_fusible', 'contacteur', 'relais', 'telerupteur', 'minuterie', 'contact_no', 'contact_nf', 'bouton'])
export const estCoupure = (sym: string): boolean => COUPURES.has(sym)
export const aBobine = (sym: string): boolean => ['contacteur', 'relais', 'telerupteur', 'minuterie'].includes(sym)

/** repos d'un contact quand sa position n'est pas connue : NO ouvert, NF fermé */
export const reposFerme = (params: ParamsElec): boolean => params.sym === 'contact_nf' || params.repos === 'NF'

export function etatElec(params: ParamsElec, lire: Lire): EtatElec {
  const sym = params.sym
  const defaut = lire('defaut') === 1
  if (COUPURES.has(sym)) {
    if (lire('declenche') === 1 || defaut || lire('defaut_diff') === 1) return 'defaut'
    const f = lire('ferme'), o = lire('ouvert')
    if (f != null) return f === 1 ? 'marche' : 'arret'
    if (o != null) return o === 1 ? 'arret' : 'marche'
    return 'inconnu'
  }
  if (sym === 'fusible' || sym === 'parafoudre') return defaut ? 'defaut' : 'ok'
  if (sym === 'relais_th') return lire('declenche') === 1 || defaut ? 'defaut' : 'ok'
  if (['moteur', 'variateur', 'demarreur'].includes(sym)) {
    if (defaut) return 'defaut'
    const m = lire('marche')
    return m === 1 ? 'marche' : m === 0 ? 'arret' : 'inconnu'
  }
  if (['voyant', 'eclairage', 'prise', 'resistance'].includes(sym)) {
    if (defaut) return 'defaut'
    const e = lire('etat')
    return e === 1 ? 'marche' : e === 0 ? 'arret' : sym === 'voyant' || sym === 'eclairage' ? 'inconnu' : 'ok'
  }
  if (sym === 'arrivee') { const p = lire('present'); return p === 0 ? 'arret' : p === 1 ? 'marche' : 'ok' }
  if (sym === 'transfo') return defaut ? 'defaut' : 'ok'
  return 'ok'
}

/** position physique des contacts : fermés (true), ouverts (false), inconnue (null) — un déclenché est ouvert */
export function contactsFermes(st: EtatElec): boolean | null {
  if (st === 'defaut') return false
  if (st === 'marche') return true
  if (st === 'arret') return false
  return null
}

/** bobine excitée ? */
export const bobineExcitee = (lire: Lire): boolean | null => { const b = lire('bobine'); return b == null ? null : b === 1 }

/* ------------------------------------------------------------------ propagation de la tension */

export interface NoeudTension { id: string; params: ParamsElec; etat: EtatElec }
export interface AreteTension { id: string; de: string; a: string; ports?: { de?: string; a?: string } }
export type Tension = boolean | null

interface Groupe { ports: string[]; passe: Tension }

/** groupes de ports qui communiquent électriquement dans un nœud, avec la valeur de passage (true / false / null = inconnu) */
export function groupesElec(params: ParamsElec, st: EtatElec): Groupe[] {
  const sym = params.sym
  if (sym === 'barres') { const g = geometrieElec(params); return [{ ports: Object.keys(g.ports), passe: true }] }
  if (sym === 'arrivee') return []
  if (aBobine(sym)) return [{ ports: ['in', 'out'], passe: contactsFermes(st) }, { ports: ['p3', 'p4'], passe: true }]
  if (sym === 'relais_th') return [{ ports: ['in', 'out'], passe: true }, { ports: ['p3', 'p4'], passe: st === 'defaut' ? false : true }]
  if (sym === 'tc') return [{ ports: ['in', 'out'], passe: true }]
  if (COUPURES.has(sym)) {
    const f = contactsFermes(st)
    if (f === null && (sym === 'contact_no' || sym === 'contact_nf')) return [{ ports: ['in', 'out'], passe: null }]
    return [{ ports: ['in', 'out'], passe: f }]
  }
  if (sym === 'fusible') return [{ ports: ['in', 'out'], passe: st !== 'defaut' }]
  if (['variateur', 'demarreur'].includes(sym)) return [{ ports: ['in', 'out'], passe: st === 'marche' ? true : st === 'arret' ? false : null }]
  return [{ ports: ['in', 'out'], passe: true }]
}

/**
 * Tension de chaque liaison : true = sous tension, false = hors tension, null = inconnue ou sans source.
 * Propagation depuis les arrivées présentes, à travers les organes passants ; un organe ouvert ou déclenché coupe, un organe d'état inconnu rend l'aval inconnu.
 * Limite : le sens du courant n'est pas modélisé (un organe fermé relie tous ses ports, y compris à l'envers), et la tension n'est pas propagée à travers
 * les bobines vers un second réseau (une bobine relie A1 et A2 sans tension distincte).
 */
export function propagerTension(noeuds: NoeudTension[], aretes: AreteTension[]): Record<string, Tension> {
  const nd = new Map(noeuds.map((n) => [n.id, n]))
  const adj = new Map<string, Array<{ id: string; port: string; autre: string; portAutre: string }>>()   // clé « noeud|port »
  const ajout = (k: string, v: { id: string; port: string; autre: string; portAutre: string }) => { const l = adj.get(k) ?? []; l.push(v); adj.set(k, l) }
  for (const a of aretes) {
    const pd = a.ports?.de ?? 'out', pa = a.ports?.a ?? 'in'
    ajout(`${a.de}|${pd}`, { id: a.id, port: pd, autre: a.a, portAutre: pa })
    ajout(`${a.a}|${pa}`, { id: a.id, port: pa, autre: a.de, portAutre: pd })
  }
  const groupes = new Map<string, Groupe[]>()
  for (const n of noeuds) groupes.set(n.id, groupesElec(n.params, n.etat))
  const parcourir = (accepte: (g: Groupe) => boolean, departs: string[]): Set<string> => {
    const vusP = new Set<string>(), arVues = new Set<string>(), file = [...departs]
    while (file.length) {
      const k = file.pop() as string
      if (vusP.has(k)) continue
      vusP.add(k)
      for (const v of adj.get(k) ?? []) {
        arVues.add(v.id)
        const kAutre = `${v.autre}|${v.portAutre}`
        if (!vusP.has(kAutre)) file.push(kAutre)
      }
      const [id, port] = k.split('|')
      const g = (groupes.get(id) ?? []).find((x) => x.ports.includes(port))
      if (g && accepte(g)) for (const p of g.ports) if (!vusP.has(`${id}|${p}`)) file.push(`${id}|${p}`)
    }
    return arVues
  }
  // sources : arrivées dont la présence n'est pas à 0
  const sources = noeuds.filter((n) => n.params.sym === 'arrivee')
  const dep = (n: NoeudTension): string[] => Object.keys(geometrieElec(n.params).ports).map((p) => `${n.id}|${p}`)
  const sousTension = parcourir((g) => g.passe === true, sources.filter((n) => n.etat !== 'arret').flatMap(dep))
  const peutEtre = parcourir((g) => g.passe !== false, sources.filter((n) => n.etat !== 'arret').flatMap(dep))
  // composantes connexes (pour savoir si un réseau a une source)
  const comp = new Map<string, number>()
  let nc = 0
  const adjN = new Map<string, string[]>()
  for (const a of aretes) { (adjN.get(a.de) ?? adjN.set(a.de, []).get(a.de))!.push(a.a); (adjN.get(a.a) ?? adjN.set(a.a, []).get(a.a))!.push(a.de) }
  for (const a of aretes) for (const id of [a.de, a.a]) {
    if (comp.has(id)) continue
    const pile = [id]; comp.set(id, nc)
    while (pile.length) { const x = pile.pop() as string; for (const y of adjN.get(x) ?? []) if (!comp.has(y)) { comp.set(y, nc); pile.push(y) } }
    nc++
  }
  const compAvecSource = new Set(sources.map((n) => comp.get(n.id)).filter((c) => c != null))
  const out: Record<string, Tension> = {}
  for (const a of aretes) {
    const c = comp.get(a.de)
    if (!compAvecSource.has(c) || !nd.has(a.de) && !nd.has(a.a)) out[a.id] = null
    else if (sousTension.has(a.id)) out[a.id] = true
    else if (peutEtre.has(a.id)) out[a.id] = null
    else out[a.id] = false
  }
  return out
}

/** décale une polyligne orthogonale (jonction en onglet) : sert aux liaisons multifilaires */
export function decalerChemin(pts: Array<[number, number]>, d: number): Array<[number, number]> {
  const n = pts.length
  if (n < 2 || d === 0) return pts.map((p) => [p[0], p[1]] as [number, number])
  const normale = (a: [number, number], b: [number, number]): [number, number] => {
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1
    return [-dy / l, dx / l]
  }
  const r: Array<[number, number]> = []
  for (let i = 0; i < n; i++) {
    const n1 = i > 0 ? normale(pts[i - 1], pts[i]) : normale(pts[i], pts[i + 1])
    const n2 = i < n - 1 ? normale(pts[i], pts[i + 1]) : n1
    const dot = n1[0] * n2[0] + n1[1] * n2[1]
    const k = 1 / Math.max(0.2, 1 + dot)
    r.push([+(pts[i][0] + (n1[0] + n2[0]) * k * d).toFixed(2), +(pts[i][1] + (n1[1] + n2[1]) * k * d).toFixed(2)])
  }
  return r
}

/** positions de décalage des conducteurs d'une liaison multifilaire à n conducteurs */
export const decalagesConducteurs = (n: number): number[] => Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * PAS_POLE)

/** nombre de conducteurs et texte de repère d'une liaison : « L1 L2 L3 N » */
export function conducteursLiaison(phases?: string): { n: number; reperes: string[] } {
  switch (phases) {
    case '1P': return { n: 1, reperes: ['L1'] }
    case '1PN': return { n: 2, reperes: ['L1', 'N'] }
    case '2P': return { n: 2, reperes: ['L1', 'L2'] }
    case '3P': return { n: 3, reperes: ['L1', 'L2', 'L3'] }
    case '4P': return { n: 4, reperes: ['L1', 'L2', 'L3', 'N'] }
    case 'PE': return { n: 1, reperes: ['PE'] }
    case 'N': return { n: 1, reperes: ['N'] }
    default: return { n: 1, reperes: [] }
  }
}

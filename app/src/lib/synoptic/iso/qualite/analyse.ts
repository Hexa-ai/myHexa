// Contrôles qualité automatiques des symboles iso : un rapport par symbole (erreurs dures + avertissements), pour chaque état et chaque variante.
// Utilisé par le test vitest (qualite-symboles.spec.ts, n'échoue que sur les erreurs dures) et par les scripts de rapport / planche de revue.
// Voir docs/flux/synoptique.md, « Qualité des symboles ».
import { catalogue } from '../lib'
import { dessinerDetail } from '../lib/registre'
import type { EtatNom, Params, SymboleDef, Valeurs } from '../lib/types'
import { motsClesDe } from '../../recherche/mots-cles'
import { nomCourt } from '../../catalogue-symboles'
import { statutDe, type StatutSymbole } from '../../statut'
import { conserveLesCercles, determinant, elementsSvg } from './svg-lite'

export type Gravite = 'erreur' | 'avertissement'

/** un défaut constaté ; `cas` liste les rendus concernés (état / variante / rotation), tronquée */
export interface Constat {
  gravite: Gravite
  code: string
  message: string
  cas: string[]
}

export interface RapportSymbole {
  id: string
  nom: string
  famille: string
  statut: StatutSymbole
  /** nombre de rendus essayés (états × variantes × rotations) */
  nbCas: number
  constats: Constat[]
  erreurs: number
  avertissements: number
  /** note de gravité pour classer les symboles (plus haut = plus problématique) */
  score: number
}

/** Seuils : tout est en unités écran (1 unité = 1 px à zoom 1). */
export const TOLERANCES = {
  /** marge de la boîte `taille()` pour une primitive ou un port : absolue + part de la plus grande dimension */
  boiteAbs: 3,
  boitePart: 0.02,
  /** écart d'axe toléré entre deux ports opposés */
  coaxial: 0.75,
  /** au-delà de ce décalage, deux ports opposés ne sont plus un défaut d'alignement mais un choix de dessin (entrée haute / sortie basse d'une cuve) */
  decalageVoulu: 15,
  /** écart toléré sur la norme d'une direction de port */
  unitaire: 1e-3,
} as const

/** poids des avertissements dans le classement (les erreurs dures valent 25) */
const POIDS: Record<string, number> = {
  'cercle-brut': 6, 'ellipse-circulaire': 6, 'primitive-hors-boite': 4, 'port-decale': 1, 'corps-sous-dimensionne': 3,
  'mots-cles-fr': 2, 'mots-cles-en': 2, 'nom-doublon': 2, 'port-direction-oblique': 1, 'port-doublon': 2, 'obsolete-sans-remplacant': 1, 'remplacant-inconnu': 2,
  'nom-vide': 2, 'aucun-port': 0,
}

interface Cas {
  etat: EtatNom
  params: Params
  valeurs: Valeurs
  /** rendu « léger » : seulement exception et ports (rotations) */
  leger: boolean
  label: string
}

const ETATS_TOUJOURS: EtatNom[] = ['arret', 'marche', 'defaut']

/** variantes « clé=a|b|c » (formes simples) */
export function variantesSimples(def: Pick<SymboleDef, 'variantes'>): { cle: string; valeurs: (string | number)[] }[] {
  const out: { cle: string; valeurs: (string | number)[] }[] = []
  for (const v of def.variantes ?? []) {
    const m = /^(\w+)=([^=]+)$/.exec(v)
    if (!m || !m[2].includes('|')) continue
    out.push({ cle: m[1], valeurs: m[2].split('|').map((x) => (/^-?\d+(\.\d+)?$/.test(x) ? Number(x) : x)) })
  }
  return out
}

/** états à essayer : ceux de la planche, ceux déclarés, plus arrêt / marche / défaut (la planche de revue les montre toujours) */
export function etatsAEssayer(def: SymboleDef): { etat: EtatNom; valeurs: Valeurs; rot?: number }[] {
  const vus = new Set<EtatNom>()
  const out: { etat: EtatNom; valeurs: Valeurs; rot?: number }[] = []
  for (const c of def.planche ?? []) if (!vus.has(c[0])) { vus.add(c[0]); out.push({ etat: c[0], valeurs: c[1] ?? def.exemple ?? {}, rot: c[2] }) }
  for (const e of [...(def.etats ?? []), ...ETATS_TOUJOURS]) if (!vus.has(e)) { vus.add(e); out.push({ etat: e, valeurs: def.exemple ?? {} }) }
  return out
}

export function casDe(def: SymboleDef): Cas[] {
  const base: Params = { ...def.exemplePlanche, x: 0, y: 0, z: 0 }
  const etats = etatsAEssayer(def)
  const cas: Cas[] = etats.map((e) => ({
    etat: e.etat, params: { ...base, ...(e.rot != null ? { rot: e.rot as Params['rot'] } : {}) }, valeurs: e.valeurs, leger: false, label: e.etat + (e.rot ? ` rot ${e.rot}` : ''),
  }))
  const premier = etats[0]
  for (const v of variantesSimples(def)) {
    for (const x of v.valeurs) for (const e of etats.filter((s) => s.etat === 'arret' || s.etat === 'marche')) {
      cas.push({ etat: e.etat, params: { ...base, [v.cle]: x }, valeurs: e.valeurs, leger: false, label: `${e.etat} ${v.cle}=${x}` })
    }
  }
  for (const rot of [90, 180, 270] as const) cas.push({ etat: premier.etat, params: { ...base, rot }, valeurs: premier.valeurs, leger: true, label: `${premier.etat} rot ${rot}` })
  return cas
}

const fmt = (n: number): string => String(Math.round(n * 10) / 10)

class Collecteur {
  private readonly par = new Map<string, Constat>()
  ajouter(gravite: Gravite, code: string, message: string, cas: string, cle = code): void {
    const k = cle
    const c = this.par.get(k)
    if (!c) this.par.set(k, { gravite, code, message, cas: [cas] })
    else if (!c.cas.includes(cas)) c.cas.push(cas)
  }
  liste(): Constat[] {
    return [...this.par.values()].map((c) => ({ ...c, cas: c.cas.length > 4 ? [...c.cas.slice(0, 4), `… +${c.cas.length - 4}`] : c.cas }))
  }
}

function controlerCas(def: SymboleDef, c: Cas, col: Collecteur): void {
  let det
  try {
    det = dessinerDetail(def.id, c.params, c.etat, c.valeurs)
  } catch (e) {
    col.ajouter('erreur', 'exception', `exception au rendu : ${(e as Error).message}`, c.label, `exception:${(e as Error).message}`)
    return
  }
  const { rendu, builder, taille } = det
  const [W, D, H] = taille
  if (![W, D, H].every((n) => Number.isFinite(n) && n > 0)) {
    col.ajouter('erreur', 'taille-invalide', `taille() incohérente : [${taille.map(fmt).join(', ')}]`, c.label)
    return
  }
  if (/NaN|Infinity|undefined/.test(rendu.svg)) col.ajouter('erreur', 'svg-nan', 'le SVG contient NaN / Infinity / undefined', c.label)
  if (!builder.parts.length) col.ajouter('erreur', 'rendu-vide', 'aucune pièce dessinée', c.label)

  // boîte monde de l'empreinte (x = y = z = 0), après rotation
  const Wr = builder.Wr, Dr = builder.Dr
  const tol = TOLERANCES.boiteAbs + TOLERANCES.boitePart * Math.max(Wr, Dr, H)
  const lo = [0 - tol, 0 - tol, 0 - tol], hi = [Wr + tol, Dr + tol, H + tol]

  // ── ports
  const ports = rendu.ports
  const ids = new Set<string>()
  for (const p of ports) {
    if (ids.has(p.id)) col.ajouter('avertissement', 'port-doublon', `identifiant de port en double : ${p.id}`, c.label, `port-doublon:${p.id}`)
    ids.add(p.id)
    const dedans = p.pos.every((v, i) => Number.isFinite(v) && v >= lo[i] && v <= hi[i])
    if (!dedans) col.ajouter('erreur', 'port-hors-boite', `port « ${p.id} » hors de la boîte (${p.pos.map(fmt).join(', ')} ; boîte ${fmt(Wr)}×${fmt(Dr)}×${fmt(H)})`, c.label, `port-hors-boite:${p.id}`)
    const n = Math.hypot(...p.dir)
    if (!Number.isFinite(n) || Math.abs(n - 1) > TOLERANCES.unitaire) col.ajouter('erreur', 'port-direction', `port « ${p.id} » : direction non unitaire (norme ${fmt(n)})`, c.label, `port-direction:${p.id}`)
    else if (p.dir.filter((v) => Math.abs(v) > 1e-6).length > 1) col.ajouter('avertissement', 'port-direction-oblique', `port « ${p.id} » : direction non alignée sur un axe`, c.label, `port-oblique:${p.id}`)
  }
  for (const p of ports) {
    const opposes = ports.filter((q) => q !== p && q.type === p.type && p.dir[0] * q.dir[0] + p.dir[1] * q.dir[1] + p.dir[2] * q.dir[2] < -0.99)
    if (!opposes.length) continue
    const ecart = (q: typeof p): number => {
      const v = [q.pos[0] - p.pos[0], q.pos[1] - p.pos[1], q.pos[2] - p.pos[2]]
      const s = v[0] * p.dir[0] + v[1] * p.dir[1] + v[2] * p.dir[2]
      return Math.hypot(v[0] - s * p.dir[0], v[1] - s * p.dir[1], v[2] - s * p.dir[2])
    }
    const mini = Math.min(...opposes.map(ecart))
    if (mini <= TOLERANCES.coaxial) continue
    // composant « en ligne » : deux ports seulement, face à face, presque alignés → le léger décalage est un défaut d'alignement (erreur dure)
    const enLigne = ports.filter((q) => q.type === p.type).length === 2 && mini <= TOLERANCES.decalageVoulu
    const paire = [p.id, opposes[0].id].sort().join('/')
    col.ajouter(enLigne ? 'erreur' : 'avertissement', enLigne ? 'port-non-coaxial' : 'port-decale', `ports « ${p.id} » et « ${opposes.map((q) => q.id).join(' / ')} » opposés mais décalés de ${fmt(mini)} (axes non confondus)${enLigne ? '' : ' : voulu ?'}`, c.label, `coax:${paire}`)
  }

  if (c.leger) return

  // ── taille : l'ensemble des pièces doit rester dans la boîte annoncée par taille(), et la remplir à peu près
  let pire = 0, axePire = '', nbHors = 0
  for (const part of builder.parts) {
    const b = part.bb
    const sorties: [number, string][] = [
      [lo[0] - b.x0 + 0, 'x−'], [b.x1 - hi[0], 'x+'], [lo[1] - b.y0, 'y−'], [b.y1 - hi[1], 'y+'], [lo[2] - b.z0, 'z−'], [b.z1 - hi[2], 'z+'],
    ]
    const max = sorties.reduce((a, x) => (x[0] > a[0] ? x : a), [0, ''] as [number, string])
    if (max[0] > 0) { nbHors++; if (max[0] > pire) { pire = max[0]; axePire = max[1] } }
  }
  if (nbHors) col.ajouter('avertissement', 'primitive-hors-boite', `${nbHors} pièce(s) hors de la boîte taille() : dépassement max ${fmt(pire + tol)} sur ${axePire}`, c.label)
  const corps = rendu.corps
  if (corps) {
    const dims = [corps.x1 - corps.x0, corps.y1 - corps.y0, corps.z1 - corps.z0]
    const maxCorps = Math.max(...dims), maxBoite = Math.max(Wr, Dr, H)
    if (!Number.isFinite(maxCorps)) col.ajouter('erreur', 'svg-nan', 'boîte du rendu non finie', c.label)
    else if (maxCorps < 0.45 * maxBoite) col.ajouter('avertissement', 'corps-sous-dimensionne', `le dessin (${fmt(maxCorps)}) occupe moins de la moitié de la boîte annoncée (${fmt(maxBoite)})`, c.label)
  }

  // ── SVG : textes en miroir, cercles non projetés
  const cercles: string[] = []
  for (const el of elementsSvg(rendu.svg)) {
    if (el.tag === 'text' && determinant(el.mat) < 0) {
      col.ajouter('erreur', 'texte-miroir', `texte « ${(el.texte ?? '').trim().slice(0, 12)} » rendu en miroir (déterminant ${fmt(determinant(el.mat))})`, c.label)
    }
    if (el.classesAncetres.some((k) => k === 'bdg' || k === 'bdgs') || el.classes.includes('led') || el.classes.includes('bdg')) continue
    if (el.tag === 'circle' && conserveLesCercles(el.mat)) cercles.push(`r=${el.attrs.r ?? '?'}`)
    if (el.tag === 'ellipse' && conserveLesCercles(el.mat) && Math.abs(Number(el.attrs.rx) - Number(el.attrs.ry)) < 0.01) cercles.push(`ellipse isotrope r=${el.attrs.rx}`)
  }
  if (cercles.length) {
    const ellipses = cercles.filter((x) => x.startsWith('ellipse')).length
    col.ajouter('avertissement', ellipses === cercles.length ? 'ellipse-circulaire' : 'cercle-brut', `${cercles.length} rond(s) dessiné(s) en cercle plat, non projeté(s) en ellipse (${[...new Set(cercles)].slice(0, 4).join(', ')})`, c.label)
  }
}

export function analyserSymbole(def: SymboleDef): RapportSymbole {
  const col = new Collecteur()
  const cas = casDe(def)
  for (const c of cas) controlerCas(def, c, col)

  const k = motsClesDe(def.id)
  if (!k.fr.length) col.ajouter('avertissement', 'mots-cles-fr', 'aucun mot-clé français (recherche/mots-cles*.ts)', 'catalogue')
  if (!k.en.length) col.ajouter('avertissement', 'mots-cles-en', 'aucun mot-clé anglais (recherche/mots-cles*.ts)', 'catalogue')
  if (!def.nom || !def.nom.trim()) col.ajouter('avertissement', 'nom-vide', 'nom vide', 'catalogue')
  if (def.statut === 'obsolete') {
    if (!def.remplacePar) col.ajouter('avertissement', 'obsolete-sans-remplacant', 'obsolète sans `remplacePar`', 'catalogue')
    else if (!catalogue().some((d) => d.id === def.remplacePar)) col.ajouter('avertissement', 'remplacant-inconnu', `remplaçant inconnu : ${def.remplacePar}`, 'catalogue')
  }
  return rapportDe(def, cas.length, col.liste())
}

function rapportDe(def: SymboleDef, nbCas: number, constats: Constat[]): RapportSymbole {
  const erreurs = constats.filter((c) => c.gravite === 'erreur').length
  const avertissements = constats.length - erreurs
  const score = erreurs * 25 + constats.filter((c) => c.gravite === 'avertissement').reduce((s, c) => s + (POIDS[c.code] ?? 1), 0)
  return { id: def.id, nom: def.nom, famille: def.famille, statut: statutDe(def), nbCas, constats, erreurs, avertissements, score }
}

export interface RapportCatalogue {
  total: number
  parStatut: Record<StatutSymbole, number>
  symboles: RapportSymbole[]
  /** décompte des constats par code */
  parCode: Record<string, { gravite: Gravite; symboles: number }>
  erreurs: number
  avertissements: number
}

/** analyse tout le catalogue ; ajoute les doublons de nom (entre symboles) */
export function analyserCatalogue(defs: readonly SymboleDef[] = catalogue()): RapportCatalogue {
  const symboles = defs.map(analyserSymbole)
  const noms = new Map<string, string[]>()
  for (const d of defs) {
    if (d.statut === 'obsolete') continue
    const k = nomCourt(d.nom).toLowerCase()
    noms.set(k, [...(noms.get(k) ?? []), d.id])
  }
  for (const ids of noms.values()) {
    if (ids.length < 2) continue
    for (const id of ids) {
      const r = symboles.find((s) => s.id === id)!
      r.constats.push({ gravite: 'avertissement', code: 'nom-doublon', message: `même nom court que ${ids.filter((x) => x !== id).join(', ')}`, cas: ['catalogue'] })
      r.avertissements++
      r.score += POIDS['nom-doublon']
    }
  }
  const parStatut: Record<StatutSymbole, number> = { brouillon: 0, revu: 0, valide: 0, obsolete: 0 }
  const parCode: RapportCatalogue['parCode'] = {}
  for (const s of symboles) {
    parStatut[s.statut]++
    for (const code of new Set(s.constats.map((c) => c.code))) (parCode[code] ??= { gravite: s.constats.find((c) => c.code === code)!.gravite, symboles: 0 }).symboles++
  }
  return {
    total: symboles.length, parStatut, symboles, parCode,
    erreurs: symboles.reduce((s, r) => s + r.erreurs, 0), avertissements: symboles.reduce((s, r) => s + r.avertissements, 0),
  }
}

/** erreurs dures de tout le catalogue, à plat (pour le test) */
export const erreursDures = (r: RapportCatalogue): { id: string; code: string; message: string }[] =>
  r.symboles.flatMap((s) => s.constats.filter((c) => c.gravite === 'erreur').map((c) => ({ id: s.id, code: c.code, message: c.message })))

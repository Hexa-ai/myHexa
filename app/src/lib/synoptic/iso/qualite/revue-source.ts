// Édition du fichier source d'un symbole pour y poser son `statut` (recherche de `id: '<id>'`). Logique pure (chaînes), testée ; le script
// `appliquer_revue` s'occupe des fichiers.
import type { StatutSymbole } from '../../statut'
import type { Decision, ExportRevue } from './revue-html'

/** statut posé par une décision de revue : validé → « valide » ; à refaire → retour à « brouillon » */
export const statutDeDecision = (d: Decision['decision']): StatutSymbole => (d === 'valide' ? 'valide' : 'brouillon')

export type ResultatEdition = { ok: true; source: string; avant?: string } | { ok: false; raison: string }

/** position de la `{` qui ouvre l'objet contenant `pos`, et de sa `}` fermante (chaînes, gabarits et commentaires ignorés) */
function objetAutour(src: string, pos: number): [number, number] | null {
  const parcourir = (de: number, sens: 1 | -1, ouvre: string, ferme: string): number => {
    let prof = 0
    for (let i = de; i >= 0 && i < src.length; i += sens) {
      const c = src[i]
      if (c === ouvre) prof++
      else if (c === ferme) { if (prof === 0) return i; prof-- }
    }
    return -1
  }
  // remonter : accolades fermantes rencontrées = objets frères déjà clos
  const debut = parcourir(pos, -1, '}', '{')
  if (debut < 0) return null
  let prof = 0, quote = ''
  for (let i = debut; i < src.length; i++) {
    const c = src[i]
    if (quote) {
      if (c === '\\') i++
      else if (c === quote) quote = ''
      continue
    }
    if (c === "'" || c === '"' || c === '`') quote = c
    else if (c === '/' && src[i + 1] === '/') i = src.indexOf('\n', i) < 0 ? src.length : src.indexOf('\n', i)
    else if (c === '{') prof++
    else if (c === '}' && --prof === 0) return [debut, i]
  }
  return null
}

/** pose (ou remplace) `statut: '<statut>'` dans la définition dont l'identifiant est `id` */
export function poserStatut(source: string, id: string, statut: StatutSymbole): ResultatEdition {
  const echap = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`\\bid:\\s*(['"])${echap}\\1\\s*,?`, 'g')
  const trouves = [...source.matchAll(re)]
  if (!trouves.length) return { ok: false, raison: 'identifiant introuvable dans ce fichier (défini par une fabrique ?)' }
  if (trouves.length > 1) return { ok: false, raison: `identifiant présent ${trouves.length} fois : édition ambiguë` }
  const m = trouves[0]
  const obj = objetAutour(source, m.index!)
  if (!obj || !/\bfamille\s*:/.test(source.slice(obj[0], obj[1]))) return { ok: false, raison: 'objet de définition non reconnu (pas de champ « famille »)' }
  const corps = source.slice(obj[0], obj[1] + 1)
  const existant = /(^|[\s,{])statut:\s*(['"])(\w+)\2/.exec(corps)
  if (existant) {
    if (existant[3] === statut) return { ok: true, source, avant: existant[3] }
    const debutStatut = obj[0] + existant.index + existant[1].length
    const fin = debutStatut + existant[0].length - existant[1].length
    return { ok: true, source: source.slice(0, debutStatut) + `statut: '${statut}'` + source.slice(fin), avant: existant[3] }
  }
  const fin = m.index! + m[0].trimEnd().length
  const ajout = m[0].trimEnd().endsWith(',') ? ` statut: '${statut}',` : `, statut: '${statut}'`
  return { ok: true, source: source.slice(0, fin) + ajout + source.slice(fin) }
}

/** lit et valide un export de la planche de revue */
export function lireExport(texte: string): ExportRevue {
  const j = JSON.parse(texte) as Partial<ExportRevue>
  if (j.schema !== 'myhexa-revue-symboles/1' || typeof j.decisions !== 'object' || !j.decisions) throw new Error('fichier de revue invalide (schéma attendu : myhexa-revue-symboles/1)')
  return j as ExportRevue
}

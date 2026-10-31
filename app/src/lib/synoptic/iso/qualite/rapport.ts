// Mise en forme du rapport qualité (Markdown) : résumé, classement des symboles les plus problématiques, détail par famille.
import type { RapportCatalogue, RapportSymbole } from './analyse'

export const LIBELLE_CODE: Readonly<Record<string, string>> = {
  exception: 'exception au rendu', 'taille-invalide': 'taille() incohérente', 'svg-nan': 'NaN dans le SVG', 'rendu-vide': 'rendu vide',
  'port-hors-boite': 'port hors de la boîte', 'port-direction': 'direction de port non unitaire', 'port-non-coaxial': 'ports en ligne non coaxiaux', 'texte-miroir': 'texte en miroir',
  'cercle-brut': 'cercle plat (non projeté)', 'ellipse-circulaire': 'ellipse isotrope (non projetée)', 'primitive-hors-boite': 'pièce hors de la boîte', 'port-decale': 'ports opposés décalés (voulu ?)',
  'port-direction-oblique': 'direction de port oblique', 'port-doublon': 'identifiant de port en double', 'corps-sous-dimensionne': 'dessin bien plus petit que la boîte',
  'mots-cles-fr': 'mots-clés FR absents', 'mots-cles-en': 'mots-clés EN absents', 'nom-vide': 'nom vide', 'nom-doublon': 'nom en doublon',
  'obsolete-sans-remplacant': 'obsolète sans remplaçant', 'remplacant-inconnu': 'remplaçant inconnu',
}

/** constats regroupés par type : « ❌ port hors de la boîte ×3 » */
export function resumeConstats(s: RapportSymbole, sep = ' ; '): string {
  const n = new Map<string, { gravite: string; nb: number }>()
  for (const c of s.constats) n.set(c.code, { gravite: c.gravite, nb: (n.get(c.code)?.nb ?? 0) + 1 })
  return [...n.entries()].map(([code, v]) => `${v.gravite === 'erreur' ? '❌' : '⚠'} ${LIBELLE_CODE[code] ?? code}${v.nb > 1 ? ` ×${v.nb}` : ''}`).join(sep)
}
const ligne = (s: RapportSymbole): string => `${s.id} (${s.statut}) — ${resumeConstats(s, ', ') || 'rien à signaler'}`

export function versMarkdown(r: RapportCatalogue, o: { date?: string; top?: number } = {}): string {
  const top = o.top ?? 25
  const L: string[] = []
  L.push('# Qualité des symboles iso', '')
  if (o.date) L.push(`Généré le ${o.date}.`, '')
  L.push(
    `- ${r.total} symboles analysés — brouillon : ${r.parStatut.brouillon}, revu : ${r.parStatut.revu}, validé : ${r.parStatut.valide}, obsolète : ${r.parStatut.obsolete}`,
    `- ${r.erreurs} erreur(s) dure(s) (le test échoue sur les nouvelles), ${r.avertissements} avertissement(s)`,
    `- symboles sans aucun constat : ${r.symboles.filter((s) => !s.constats.length).length}`,
    '',
    '## Constats par type',
    '',
    '| Gravité | Constat | Symboles |',
    '|---|---|---:|',
  )
  for (const [code, v] of Object.entries(r.parCode).sort((a, b) => b[1].symboles - a[1].symboles)) L.push(`| ${v.gravite === 'erreur' ? 'erreur' : 'avertissement'} | ${LIBELLE_CODE[code] ?? code} (\`${code}\`) | ${v.symboles} |`)
  L.push('', `## Les ${top} symboles les plus problématiques`, '', '| # | Symbole | Famille | Statut | Score | Constats |', '|--:|---|---|---|--:|---|')
  const classes = [...r.symboles].filter((s) => s.constats.length).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
  classes.slice(0, top).forEach((s, i) => {
    L.push(`| ${i + 1} | \`${s.id}\` | ${s.famille} | ${s.statut} | ${s.score} | ${resumeConstats(s)} |`)
  })
  L.push('', '## Détail par famille', '')
  const familles = new Map<string, RapportSymbole[]>()
  for (const s of r.symboles) familles.set(s.famille, [...(familles.get(s.famille) ?? []), s])
  for (const [fam, liste] of [...familles.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr'))) {
    L.push(`### ${fam} (${liste.length})`, '')
    for (const s of liste.sort((a, b) => b.score - a.score)) {
      L.push(`- ${ligne(s)}`)
      for (const c of s.constats) L.push(`  - ${c.gravite === 'erreur' ? '**erreur**' : 'avert.'} \`${c.code}\` : ${c.message} _(${c.cas.join(' ; ')})_`)
    }
    L.push('')
  }
  return L.join('\n')
}

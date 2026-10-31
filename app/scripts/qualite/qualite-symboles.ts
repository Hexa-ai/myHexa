// Contrôles qualité des symboles iso → rapport JSON + Markdown.
// Usage : pnpm qualite:symboles [--sortie <dossier>] [--maj-dette]
//   --sortie    dossier de sortie (défaut : ~/.hermes/cache/scratch/qualite, ou $QUALITE_SORTIE)
//   --maj-dette réécrit tests/unit/lib/synoptic/fixtures/qualite-erreurs-connues.json avec les erreurs dures actuelles
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { analyserCatalogue, erreursDures } from '../../src/lib/synoptic/iso/qualite/analyse'
import { versMarkdown } from '../../src/lib/synoptic/iso/qualite/rapport'

export const dossierSortie = (args: string[]): string => {
  const i = args.indexOf('--sortie')
  return path.resolve(i >= 0 ? args[i + 1] : (process.env.QUALITE_SORTIE ?? path.join(os.homedir(), '.hermes/cache/scratch/qualite')))
}

export async function main(args: string[] = []): Promise<number> {
  const sortie = dossierSortie(args)
  fs.mkdirSync(sortie, { recursive: true })
  const t0 = Date.now()
  const r = analyserCatalogue()
  const date = new Date().toISOString().slice(0, 16).replace('T', ' ')
  fs.writeFileSync(path.join(sortie, 'rapport.json'), JSON.stringify({ date, ...r }, null, 1))
  fs.writeFileSync(path.join(sortie, 'rapport.md'), versMarkdown(r, { date }))
  if (args.includes('--maj-dette')) {
    const f = path.resolve(import.meta.dirname, '../../tests/unit/lib/synoptic/fixtures/qualite-erreurs-connues.json')
    const cles = [...new Set(erreursDures(r).map((e) => `${e.id}|${e.code}`))].sort()
    fs.writeFileSync(f, JSON.stringify(cles, null, 2) + '\n')
    console.log(`dette connue : ${cles.length} erreur(s) → ${f}`)
  }
  console.log(`${r.total} symboles, ${r.erreurs} erreur(s) dure(s), ${r.avertissements} avertissement(s) en ${Date.now() - t0} ms → ${sortie}`)
  return 0
}

// Applique les décisions exportées par la planche de revue au champ `statut` des définitions (édition des fichiers source iso/lib/*.ts).
// Usage : pnpm qualite:appliquer <revue-symboles-….json> [--dry] [--lib <dossier>]
//   validé → statut 'valide' ; à refaire → 'brouillon' (le commentaire est repris dans le compte rendu).
// Un symbole dont l'id n'est pas écrit en clair dans un fichier (fabrique) est signalé : à éditer à la main.
import fs from 'node:fs'
import path from 'node:path'
import { lireExport, poserStatut, statutDeDecision } from '../../src/lib/synoptic/iso/qualite/revue-source'

export async function main(args: string[] = []): Promise<number> {
  const entree = args.find((a) => !a.startsWith('--') && a !== args[args.indexOf('--lib') + 1])
  if (!entree) { console.error('usage : pnpm qualite:appliquer <revue-symboles.json> [--dry] [--lib <dossier>]'); return 2 }
  const dry = args.includes('--dry')
  const li = args.indexOf('--lib')
  const lib = path.resolve(li >= 0 ? args[li + 1] : path.join(import.meta.dirname, '../../src/lib/synoptic/iso/lib'))
  const revue = lireExport(fs.readFileSync(entree, 'utf8'))
  const fichiers = fs.readdirSync(lib).filter((f) => f.endsWith('.ts')).map((f) => path.join(lib, f))
  const sources = new Map(fichiers.map((f) => [f, fs.readFileSync(f, 'utf8')]))
  let faits = 0, inchanges = 0, echecs = 0
  for (const [id, d] of Object.entries(revue.decisions)) {
    if (!d.decision) continue
    const statut = statutDeDecision(d.decision)
    const candidats = [...sources].filter(([, s]) => new RegExp(`\\bid:\\s*['"]${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`).test(s))
    if (candidats.length !== 1) {
      console.log(`✗ ${id} : ${candidats.length ? 'défini dans plusieurs fichiers' : 'introuvable en clair (fabrique ?)'} → à éditer à la main (${statut})`)
      echecs++
      continue
    }
    const [f, src] = candidats[0]
    const r = poserStatut(src, id, statut)
    if (!r.ok) { console.log(`✗ ${id} (${path.basename(f)}) : ${r.raison}`); echecs++; continue }
    if (r.source === src) { inchanges++; continue }
    sources.set(f, r.source)
    console.log(`✓ ${id} : ${r.avant ?? 'brouillon'} → ${statut} (${path.basename(f)})${d.commentaire ? ` — « ${d.commentaire} »` : ''}`)
    faits++
  }
  if (!dry) for (const [f, s] of sources) if (s !== fs.readFileSync(f, 'utf8')) fs.writeFileSync(f, s)
  console.log(`${faits} statut(s) ${dry ? 'à modifier (simulation)' : 'modifié(s)'}, ${inchanges} déjà à jour, ${echecs} à traiter à la main`)
  return echecs ? 1 : 0
}

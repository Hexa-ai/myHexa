// Planche de revue des symboles iso : ~/.hermes/cache/scratch/qualite/revue.html + une capture par famille (revue_<famille>.png).
// Usage : pnpm qualite:revue [--sortie <dossier>] [--sans-captures] [--famille <nom>]
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { catalogue } from '../../src/lib/synoptic/iso/lib'
import { analyserCatalogue } from '../../src/lib/synoptic/iso/qualite/analyse'
import { fichesDe, pageRevue, slug } from '../../src/lib/synoptic/iso/qualite/revue-html'
import { dossierSortie } from './qualite-symboles'

const HAUTEUR_MAX = 14000

/** une capture par famille (plusieurs fichiers _2, _3… si la famille dépasse HAUTEUR_MAX pixels) */
async function capturer(html: string, sortie: string, familles: string[]): Promise<string[]> {
  const exigerPlaywright = createRequire(path.join(os.homedir(), 'depots/myHexa-tools/e2e/'))
  const { chromium } = exigerPlaywright('playwright-core') as typeof import('playwright-core')
  const home = os.homedir()
  const navigateur = await chromium.launch({
    executablePath: process.env.CHROME ?? path.join(home, '.hermes/tools/chromium-1208/chrome-linux64/chrome'),
    args: ['--no-sandbox', '--disable-gpu'],
    env: { ...process.env, LD_LIBRARY_PATH: path.join(home, 'suivi/agents/libs_chrome/x/usr/lib/x86_64-linux-gnu') },
  })
  const fichiers: string[] = []
  try {
    const page = await navigateur.newPage({ viewport: { width: 1460, height: 900 } })
    for (const fam of familles) {
      await page.goto(`file://${html}#capture&fam=${encodeURIComponent(fam)}`)
      await page.reload()
      await page.waitForSelector('.carte:not(.cache)')
      // l'en-tête fixe n'a pas sa place dans une capture pleine page ; on garde la barre (statistiques) en haut
      const haut: number = await page.evaluate(() => document.documentElement.scrollHeight)
      const n = Math.ceil(haut / HAUTEUR_MAX)
      for (let i = 0; i < n; i++) {
        const f = path.join(sortie, `revue_${slug(fam)}${i ? '_' + (i + 1) : ''}.png`)
        await page.screenshot({ path: f, fullPage: true, clip: { x: 0, y: i * HAUTEUR_MAX, width: 1460, height: Math.min(HAUTEUR_MAX, haut - i * HAUTEUR_MAX) } })
        fichiers.push(f)
      }
    }
  } finally {
    await navigateur.close()
  }
  return fichiers
}

export async function main(args: string[] = []): Promise<number> {
  const sortie = dossierSortie(args)
  fs.mkdirSync(sortie, { recursive: true })
  const rapport = analyserCatalogue()
  const defs = catalogue()
  const fiches = fichesDe(defs, rapport.symboles)
  const date = new Date().toISOString().slice(0, 16).replace('T', ' ')
  const html = path.join(sortie, 'revue.html')
  fs.writeFileSync(html, pageRevue(fiches, { date, resume: `${rapport.total} symboles, ${rapport.erreurs} erreur(s) dure(s), ${rapport.avertissements} avertissement(s)` }))
  console.log(`${html} (${Math.round(fs.statSync(html).size / 1024)} Ko, ${fiches.length} symboles)`)
  if (args.includes('--sans-captures')) return 0
  const i = args.indexOf('--famille')
  const familles = i >= 0 ? [args[i + 1]] : [...new Set(fiches.map((f) => f.famille))].sort((a, b) => a.localeCompare(b, 'fr'))
  const png = await capturer(html, sortie, familles)
  console.log(`${png.length} capture(s) : ${png.map((p) => path.basename(p)).join(', ')}`)
  return 0
}

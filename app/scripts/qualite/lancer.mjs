// Lanceur des scripts qualité : charge un module TypeScript du dépôt via Vite (alias « @ », sans DOM), puis appelle son export `main(args)`.
// Usage : node scripts/qualite/lancer.mjs <module.ts> [arguments…]
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const [module, ...args] = process.argv.slice(2)
if (!module) {
  console.error('usage : node scripts/qualite/lancer.mjs <module.ts> [arguments…]')
  process.exit(2)
}
const serveur = await createServer({
  root: racine,
  configFile: false,
  logLevel: 'error',
  resolve: { alias: { '@': path.join(racine, 'src') } },
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true, include: [] },
})
let code = 0
try {
  const m = await serveur.ssrLoadModule(path.resolve(racine, module))
  code = (await m.main(args)) ?? 0
} catch (e) {
  console.error(e)
  code = 1
} finally {
  await serveur.close()
}
process.exit(code)

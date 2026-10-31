// Vignettes SVG des symboles isométriques (recherche, explorateur, planches) : un seul dessin par symbole, mis en cache.
import { construire, cssIso } from '@/lib/synoptic/iso/lib'
import type { EtatNom } from '@/lib/synoptic/iso/lib/types'

const CACHE = new Map<string, string>()

/** les vignettes utilisent la feuille de style des symboles : une seule fois dans la page (partagée avec la vue iso) */
function feuille() {
  if (typeof document === 'undefined' || document.getElementById('iso-css')) return
  const st = document.createElement('style')
  st.id = 'iso-css'
  st.textContent = cssIso()
  document.head.appendChild(st)
}

/**
 * SVG d'un symbole posé seul, cadré serré. `etat` permet d'afficher les différents états (survol dans l'explorateur).
 * Renvoie une chaîne vide si le symbole ne se dessine pas (jamais d'exception : une vignette ne doit pas casser l'écran).
 */
export function vignetteIso(type: string, etat: EtatNom = 'arret', params: Record<string, unknown> = {}, valeurs: Record<string, number> = {}): string {
  return dessinerVignette(type + '|' + etat + '|' + JSON.stringify(params) + '|' + JSON.stringify(valeurs), [{ id: 'v', type, x: 0, y: 0, z: 0, etat, params, valeurs }])
}

/** vignette d'un symbole de bibliothèque importée : ses parties posées ensemble, cadrées serré */
export function vignetteComposition(cleCache: string, parties: readonly { base: string; params?: Record<string, unknown>; dx?: number; dy?: number; dz?: number; rot?: number }[]): string {
  return dessinerVignette(
    'lib|' + cleCache + '|' + JSON.stringify(parties),
    parties.map((p, i) => ({ id: 'p' + i, type: p.base, x: p.dx ?? 0, y: p.dy ?? 0, z: p.dz ?? 0, rot: p.rot ?? 0, etat: 'arret', params: p.params ?? {} })),
  )
}

function dessinerVignette(cle: string, composants: unknown[]): string {
  const connu = CACHE.get(cle)
  if (connu != null) return connu
  let svg = ''
  feuille()
  try {
    const r = construire({ version: 1, composants, liaisons: [] } as never)
    svg = r.scene.toSvg({ css: false, fond: false, marge: 4 }).replace(/ width="[-\d.]+" height="[-\d.]+"/, ' width="100%" height="100%"')
  } catch {
    svg = ''
  }
  CACHE.set(cle, svg)
  return svg
}

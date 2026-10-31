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
export function vignetteIso(type: string, etat: EtatNom = 'arret', params: Record<string, unknown> = {}): string {
  const cle = type + '|' + etat + '|' + JSON.stringify(params)
  const connu = CACHE.get(cle)
  if (connu != null) return connu
  let svg = ''
  feuille()
  try {
    const r = construire({ version: 1, composants: [{ id: 'v', type, x: 0, y: 0, z: 0, etat, params }], liaisons: [] } as never)
    svg = r.scene.toSvg({ css: false, fond: false, marge: 4 }).replace(/ width="[-\d.]+" height="[-\d.]+"/, ' width="100%" height="100%"')
  } catch {
    svg = ''
  }
  CACHE.set(cle, svg)
  return svg
}

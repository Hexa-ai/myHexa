// Registre des symboles + fonction publique dessiner().
import { Builder } from './iso'
import type { EtatNom, Params, Rendu, SymboleDef, Valeurs } from './types'

const REG = new Map<string, SymboleDef>()
export function enregistrer(d: SymboleDef): void { REG.set(d.id, d) }
export const catalogue = (): SymboleDef[] => [...REG.values()]
export const symbole = (id: string): SymboleDef => { const d = REG.get(id); if (!d) throw new Error(`symbole inconnu: ${id}`); return d }

/** Dessine un symbole.
 *  @param type    identifiant du catalogue (ex. 'pompe.centrifuge_h')
 *  @param params  x,y,z (monde), rot (0/90/180/270), variante, dn, dimensions…
 *  @param etat    arret | marche | defaut | alarme | modulant | ouvert | ferme | inconnu | consigne | maintenance
 *  @param valeurs position %, niveau %, manuel, seuils, vitesse… */
export function dessiner(type: string, params: Params = {}, etat: EtatNom = 'arret', valeurs: Valeurs = {}): Rendu {
  const d = symbole(type)
  const p: Params = { ...d.defauts, ...params }
  let [W, D, H] = d.taille(p)
  const tilt: string | undefined = p.tilt
  if (tilt === 'x' || tilt === 'xn') [W, H] = [H, W]
  else if (tilt === 'y' || tilt === 'yn') [D, H] = [H, D]
  const b = new Builder({ tilt, x: p.x ?? 0, y: p.y ?? 0, z: p.z ?? 0, rot: p.rot ?? 0, W, D, H, etat, val: valeurs, type, p })
  d.dessiner(b, p)
  return b.finish()
}

/** Dessine un symbole en alignant un de ses ports sur une cible (port ou point) — utile pour poser une vanne sur un tube. */
export function placer(type: string, params: Params, portId: string, cible: import('./geom').V3 | import('./types').Port, etat: EtatNom = 'arret', valeurs: Valeurs = {}): Rendu {
  const t = Array.isArray(cible) ? cible : cible.pos
  const r0 = dessiner(type, { ...params, x: 0, y: 0, z: 0 }, etat, valeurs)
  const po = r0.port(portId).pos
  return dessiner(type, { ...params, x: t[0] - po[0], y: t[1] - po[1], z: t[2] - po[2] }, etat, valeurs)
}

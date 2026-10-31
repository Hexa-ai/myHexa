/* eslint-disable */
// @ts-nocheck — catalogue de dessin (voir iso/README.md)
// Briques communes des familles « par métier » (conteneurs, véhicules, bâtiments, informatique, armoires, énergie, industrie, eau).
// RÈGLE DE SOBRIÉTÉ : silhouette juste, 3 tons, 2 ou 3 détails signifiants au plus. Ni supports, ni boulonnerie, ni berceaux, ni soudures.
import { Builder, r2, l2, p2, c2 } from './iso'
import type { Params, EtatNom, Valeurs } from './types'

/** états montrés dans les planches */
export const PL5: [EtatNom, Valeurs?, number?][] = [['arret'], ['marche'], ['defaut'], ['alarme'], ['inconnu']]
export const PL2: [EtatNom, Valeurs?, number?][] = [['arret'], ['defaut']]

/** teintes sobres d'un objet colorable (conteneur, véhicule…) : classes de matière du thème */
export const COULEURS: Record<string, string> = { bleu: 'ma', rouge: 'mr', vert: 'mg', orange: 'mw', gris: 'mm', blanc: 'mc', noir: 'md' }
export const VAR_COULEUR = 'couleur=bleu|rouge|vert|orange|gris|blanc|noir'
export const teinte = (p: Params, def = 'bleu'): string => COULEURS[p.couleur ?? def] ?? 'ma'

/** 4 ancres de connexion « signal » sur les faces (+x, −x, +y, −y), pour les liens génériques (réseau, câble, 4G…) */
export function ancres(b: Builder, W: number, D: number, z = 4, x0 = 0, y0 = 0) {
  b.port('x+', [x0 + W, y0 + D / 2, z], [1, 0, 0], { type: 'signal' })
  b.port('x-', [x0, y0 + D / 2, z], [-1, 0, 0], { type: 'signal' })
  b.port('y+', [x0 + W / 2, y0 + D, z], [0, 1, 0], { type: 'signal' })
  b.port('y-', [x0 + W / 2, y0, z], [0, -1, 0], { type: 'signal' })
}

const esc = (s: string): string => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
/** une URL d'image n'est acceptée que si elle est https ou data:image (jamais de script ni d'URL locale) */
export const urlImageSure = (s: string): boolean => /^(https:\/\/|data:image\/(png|jpe?g|gif|webp|svg\+xml)[;,])/i.test(s.trim())

/**
 * Logo d'un flanc (plan xz) : image (URL https ou data:image) ou texte court.
 * Le plan iso est un miroir vertical : on retourne le contenu pour qu'il se lise à l'endroit. Zone en coordonnées (u, v haut).
 */
export function logoSvg(logo: string, u0: number, v0: number, w: number, h: number): string {
  const l = String(logo ?? '').trim()
  if (!l) return ''
  const y = (v: number) => v0 * 2 + h - v // retournement vertical dans la zone
  if (urlImageSure(l))
    return `<g transform="translate(0 ${v0 * 2 + h}) scale(1 -1)"><image href="${esc(l)}" x="${u0}" y="${v0}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/></g>`
  const t = l.length > 16 ? l.slice(0, 16) : l
  const fs = Math.max(4, Math.min(h * 0.55, (w / Math.max(4, t.length)) * 1.7))
  return `<g transform="translate(0 ${v0 * 2 + h}) scale(1 -1)"><text x="${u0 + w / 2}" y="${v0 + h / 2 + fs * 0.35}" text-anchor="middle" style="fill:var(--i-white);font:700 ${fs.toFixed(1)}px sans-serif;letter-spacing:.03em">${esc(t)}</text></g>`
}

/**
 * Conteneur maritime en coordonnées absolues (x0,y0,z0) : long côté sur x, portes en bout (+x), logo sur le flanc visible (y = W).
 * `porte` : 'fermee' (deux vantaux) ou 'ouverte' (intérieur sombre, vantaux rabattus le long des flancs).
 */
export function conteneur(b: Builder, x0: number, y0: number, z0: number, L: number, hc: boolean, m: string, porte: string, logo: string) {
  const W = 24, H = hc ? 29 : 26
  const corps = b.box(x0, y0, z0, L, W, H, m)
  const lg = logoSvg(logo, L * 0.16, H * 0.2, L * 0.68, H * 0.6)
  if (lg) b.pl('xz', y0 + W + 0.05, `<g transform="translate(${x0} ${z0})">${lg}</g>`, corps)
  if (porte === 'ouverte') {
    b.pl('yz', x0 + L + 0.05, `<g transform="translate(${y0} ${z0})">${r2(1.2, 1.2, W - 2.4, H - 2.4, 'fk', 0.4)}</g>`, corps)
    b.poly([[x0 + L, y0 + W, z0 + 1], [x0 + L + W / 2 - 1, y0 + W, z0 + 1], [x0 + L + W / 2 - 1, y0 + W, z0 + H - 1], [x0 + L, y0 + W, z0 + H - 1]], 'l', 'mm')
    b.poly([[x0 + L, y0, z0 + 1], [x0 + L + W / 2 - 1, y0, z0 + 1], [x0 + L + W / 2 - 1, y0, z0 + H - 1], [x0 + L, y0, z0 + H - 1]], 'l', 'mm')
  } else {
    const vant = (u: number) => r2(u, 1.2, W / 2 - 1.8, H - 2.4, 'fm', 0.4) + l2(u + 3, 4, u + 3, H - 4, 'ed2') + l2(u + W / 2 - 4.8, 4, u + W / 2 - 4.8, H - 4, 'ed2')
    b.pl('yz', x0 + L + 0.05, `<g transform="translate(${y0} ${z0})">${vant(1.2)}${vant(W / 2 + 0.6)}</g>`, corps)
  }
  return { corps, W, H }
}

/** voiture simplifiée (carrosserie + habitacle vitré + 4 roues) ; sens +x */
export function voiture(b: Builder, x0: number, y0: number, z0: number, m: string, L = 44, W = 18) {
  const bas = b.box(x0, y0, z0 + 3, L, W, 7, m)
  const hab = b.box(x0 + L * 0.24, y0 + 1.2, z0 + 10, L * 0.5, W - 2.4, 7, 'mc')
  b.pl('xz', y0 + W - 1.2 + 0.05, `<g transform="translate(${x0} ${z0})">${r2(L * 0.27, 11.2, L * 0.44, 4.6, 'fg', 0.6)}</g>`, hab)
  for (const dx of [L * 0.2, L * 0.8]) for (const dy of [-0.6, W - 1.4]) b.cylY(x0 + dx, y0 + dy, z0 + 3.6, 3.6, 2, 'md')
  return bas
}

export { r2, l2, p2, c2 }

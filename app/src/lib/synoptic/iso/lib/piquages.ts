// Piquages libres : un port reliable ajouté sur n'importe quelle face d'un composant (conteneur, bâtiment, armoire…), hors catalogue.
// Un piquage = face + position sur la face (u, v dans 0..1) + DN + fluide. Il devient le port `pq_<id>` du composant : on le relie (L) et
// le routeur trace le tuyau. Dessin sobre : manchette courte + bride (tuyau), ou petit presse-étoupe / prise (câble, réseau).
import type { V3, BBox } from './geom'
import { add, mul } from './geom'
import { flangeSvg, rayonDN, tuyauSvg } from './reseau'
import type { Fluide, Port, Rendu } from './types'

/** faces, dans le repère monde du composant déjà tourné : avant = +y, arrière = −y, droite = +x, gauche = −x (dessus, avant et droite sont visibles en iso) */
export type FacePiquage = 'dessus' | 'dessous' | 'avant' | 'arriere' | 'gauche' | 'droite'
export const FACES_PIQUAGE: readonly FacePiquage[] = ['dessus', 'avant', 'droite', 'arriere', 'gauche', 'dessous']
export const LIBELLE_FACE: Readonly<Record<FacePiquage, string>> = { dessus: 'Dessus', dessous: 'Dessous', avant: 'Avant', arriere: 'Arrière', gauche: 'Gauche', droite: 'Droite' }
export type GenrePiquage = 'tuyau' | 'elec' | 'reseau'

export interface Piquage {
  id: string
  face: FacePiquage
  /** position sur la face, 0..1 (u : le long de x, ou de y sur les faces gauche / droite ; v : hauteur, ou y sur dessus / dessous) */
  u: number
  v: number
  /** DN nominal (tuyau) */
  dn?: number
  fluide?: Fluide
  /** nature : tuyau (défaut), prise électrique (câble) ou réseau (Ethernet / fibre) */
  genre?: GenrePiquage
  libelle?: string
}

/** longueur de la manchette hors du volume */
export const LONGUEUR_MANCHETTE = 12

const NORMALE: Record<FacePiquage, V3> = { dessus: [0, 0, 1], dessous: [0, 0, -1], avant: [0, 1, 0], arriere: [0, -1, 0], droite: [1, 0, 0], gauche: [-1, 0, 0] }
const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.5)

export const idPortPiquage = (id: string): string => 'pq_' + id

/** point de la face (sur la surface) pour (u, v) */
export function pointSurFace(b: BBox, face: FacePiquage, u: number, v: number): V3 {
  u = clamp01(u); v = clamp01(v)
  const X = b.x0 + u * (b.x1 - b.x0), Y = b.y0 + u * (b.y1 - b.y0)
  switch (face) {
    case 'dessus': return [X, b.y0 + v * (b.y1 - b.y0), b.z1]
    case 'dessous': return [X, b.y0 + v * (b.y1 - b.y0), b.z0]
    case 'avant': return [X, b.y1, b.z0 + v * (b.z1 - b.z0)]
    case 'arriere': return [X, b.y0, b.z0 + v * (b.z1 - b.z0)]
    case 'droite': return [b.x1, Y, b.z0 + v * (b.z1 - b.z0)]
    case 'gauche': return [b.x0, Y, b.z0 + v * (b.z1 - b.z0)]
  }
}

/** face visible depuis la caméra isométrique (la manchette se dessine alors devant le volume) */
export const faceVisible = (f: FacePiquage): boolean => f === 'dessus' || f === 'avant' || f === 'droite'

/**
 * (u, v) du point visé sur une face, à partir d'un point monde situé sur son plan ; renvoie null s'il est hors de la face.
 * Sert au clic direct sur la face dans l'éditeur.
 */
export function uvDepuisPoint(b: BBox, face: FacePiquage, p: V3): { u: number; v: number } | null {
  const div = (a: number, lo: number, hi: number): number => (hi - lo < 1e-6 ? 0.5 : (a - lo) / (hi - lo))
  let u: number, v: number
  if (face === 'dessus' || face === 'dessous') { u = div(p[0], b.x0, b.x1); v = div(p[1], b.y0, b.y1) }
  else if (face === 'avant' || face === 'arriere') { u = div(p[0], b.x0, b.x1); v = div(p[2], b.z0, b.z1) }
  else { u = div(p[1], b.y0, b.y1); v = div(p[2], b.z0, b.z1) }
  if (u < -0.001 || u > 1.001 || v < -0.001 || v > 1.001) return null
  return { u: clamp01(u), v: clamp01(v) }
}

/** plan d'une face (coordonnée fixe) : pour retrouver le point monde sous un clic */
export function planDeFace(b: BBox, face: FacePiquage): { axe: 0 | 1 | 2; val: number } {
  switch (face) {
    case 'dessus': return { axe: 2, val: b.z1 }
    case 'dessous': return { axe: 2, val: b.z0 }
    case 'avant': return { axe: 1, val: b.y1 }
    case 'arriere': return { axe: 1, val: b.y0 }
    case 'droite': return { axe: 0, val: b.x1 }
    case 'gauche': return { axe: 0, val: b.x0 }
  }
}

/** ports et dessin des piquages d'un composant déjà rendu (position monde) ; renvoie un nouveau rendu (jamais de mutation du cache) */
export function appliquerPiquages(r: Rendu, piquages: readonly Piquage[] | undefined): Rendu {
  if (!piquages?.length) return r
  const vol: BBox = r.corps ?? r.bbox
  const ports: Port[] = [...r.ports]
  let avant = '', apres = ''
  let bb: BBox = { ...r.bbox }
  const etire = (q: BBox) => {
    bb = { x0: Math.min(bb.x0, q.x0), y0: Math.min(bb.y0, q.y0), z0: Math.min(bb.z0, q.z0), x1: Math.max(bb.x1, q.x1), y1: Math.max(bb.y1, q.y1), z1: Math.max(bb.z1, q.z1) }
  }
  for (const pq of piquages) {
    const n = NORMALE[pq.face]
    if (!n) continue
    const genre = pq.genre ?? 'tuyau'
    const s0 = pointSurFace(vol, pq.face, pq.u, pq.v)
    const L = genre === 'tuyau' ? LONGUEUR_MANCHETTE : 7
    const rayon = genre === 'tuyau' ? rayonDN(pq.dn ?? 50) : 2.2
    const fin = add(s0, mul(n, L))
    let svg = ''
    if (genre === 'tuyau') {
      // manchette (sous la bride) puis bride d'extrémité : le tuyau relié s'y accole bride contre bride
      const manch = tuyauSvg(s0, add(s0, mul(n, L - 3)), rayon * 1.05)
      const bride = flangeSvg(add(s0, mul(n, L - 3)), n, rayon, 3)
      svg = `<g class="piq" data-piq="${pq.id}">${manch.svg}${bride.svg}</g>`
      etire(manch.bb); etire(bride.bb)
    } else {
      // prise : petit boîtier carré plein ; la couleur distingue câble et réseau
      const a = s0, b = fin
      const m = genre === 'elec' ? 'mk' : 'mb'
      const p = tuyauSvg(a, b, 3.4)
      svg = `<g class="piq ${m}" data-piq="${pq.id}">${p.svg}</g>`
      etire(p.bb)
    }
    if (faceVisible(pq.face)) apres += svg
    else avant += svg
    ports.push({ id: idPortPiquage(pq.id), pos: fin, dir: n, type: genre === 'tuyau' ? 'tube' : genre === 'elec' ? 'elec' : 'signal', ...(genre === 'tuyau' ? { fluide: pq.fluide ?? 'eau', dn: rayon } : { dn: 2 }) })
  }
  return {
    ...r,
    svg: avant + r.svg + apres,
    bbox: bb,
    ports,
    port: (id: string) => {
      const p = ports.find((q) => q.id === id)
      if (!p) throw new Error(`port inconnu: ${r.type}.${id}`)
      return p
    },
  }
}

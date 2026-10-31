// Lecture minimale d'un SVG généré par la bibliothèque iso (sans DOM) : éléments, classes des ancêtres et matrice cumulée.
// Les symboles produisent un balisage régulier (balises bien formées, attributs entre guillemets) : une analyse par jetons suffit,
// et les contrôles qualité tournent ainsi aussi bien dans vitest que dans un script Node.

/** matrice SVG [a b c d e f] */
export type Mat = [number, number, number, number, number, number]
export const IDENTITE: Mat = [1, 0, 0, 1, 0, 0]

export interface ElementSvg {
  tag: string
  attrs: Record<string, string>
  /** classes de l'élément lui-même */
  classes: string[]
  /** classes de tous ses ancêtres */
  classesAncetres: string[]
  /** matrice cumulée (ancêtres puis élément) */
  mat: Mat
  /** texte contenu (balise <text> uniquement) */
  texte?: string
}

/** produit de matrices : appliquer `b` d'abord, puis `a` */
export function multiplier(a: Mat, b: Mat): Mat {
  return [
    a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
  ]
}

const nombres = (s: string): number[] => (s.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number)

/** attribut `transform` → matrice (matrix, translate, scale, rotate, skewX, skewY, dans l'ordre d'écriture) */
export function matriceDe(transform: string | undefined): Mat {
  let m: Mat = IDENTITE
  if (!transform) return m
  for (const t of transform.matchAll(/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g)) {
    const n = nombres(t[2])
    let c: Mat = IDENTITE
    if (t[1] === 'matrix' && n.length >= 6) c = [n[0], n[1], n[2], n[3], n[4], n[5]]
    else if (t[1] === 'translate') c = [1, 0, 0, 1, n[0] ?? 0, n[1] ?? 0]
    else if (t[1] === 'scale') c = [n[0] ?? 1, 0, 0, n[1] ?? n[0] ?? 1, 0, 0]
    else if (t[1] === 'rotate') {
      const a = ((n[0] ?? 0) * Math.PI) / 180, co = Math.cos(a), si = Math.sin(a)
      c = [co, si, -si, co, 0, 0]
      if (n.length >= 3) c = multiplier(multiplier([1, 0, 0, 1, n[1], n[2]], c), [1, 0, 0, 1, -n[1], -n[2]])
    } else if (t[1] === 'skewX') c = [1, 0, Math.tan(((n[0] ?? 0) * Math.PI) / 180), 1, 0, 0]
    else if (t[1] === 'skewY') c = [1, Math.tan(((n[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0]
    m = multiplier(m, c)
  }
  return m
}

/** déterminant de la partie linéaire : négatif = image en miroir */
export const determinant = (m: Mat): number => m[0] * m[3] - m[1] * m[2]

/** la matrice conserve-t-elle les cercles (rotation, translation, zoom uniforme) ? Une projection iso (plan xy, xz, yz) ne les conserve pas. */
export function conserveLesCercles(m: Mat, eps = 1e-3): boolean {
  const l1 = Math.hypot(m[0], m[1]), l2 = Math.hypot(m[2], m[3])
  if (l1 < 1e-9 || l2 < 1e-9) return false
  return Math.abs(l1 - l2) / Math.max(l1, l2) < eps && Math.abs(m[0] * m[2] + m[1] * m[3]) / (l1 * l2) < eps
}

const BALISE = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g
const ATTR = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
/** éléments sans intérêt pour le rendu (définitions, détourages) : leur contenu n'est pas dessiné tel quel */
const IGNORES = new Set(['defs', 'clipPath', 'mask', 'style', 'title', 'desc', 'marker', 'pattern'])

/** liste à plat de tous les éléments dessinés, dans l'ordre du document */
export function elementsSvg(svg: string): ElementSvg[] {
  const out: ElementSvg[] = []
  const pile: { tag: string; classes: string[]; mat: Mat; ignore: boolean }[] = []
  let dernierTexte: ElementSvg | null = null
  let pos = 0
  for (const m of svg.matchAll(BALISE)) {
    if (dernierTexte && m.index! > pos) dernierTexte.texte = (dernierTexte.texte ?? '') + svg.slice(pos, m.index!)
    pos = m.index! + m[0].length
    const [, ferme, tag, brut, auto] = m
    if (ferme) {
      if (tag === 'text') dernierTexte = null
      for (let i = pile.length - 1; i >= 0; i--) if (pile[i].tag === tag) { pile.length = i; break }
      continue
    }
    const attrs: Record<string, string> = {}
    for (const a of brut.matchAll(ATTR)) attrs[a[1]] = a[2] ?? a[3] ?? ''
    const classes = (attrs.class ?? '').split(/\s+/).filter(Boolean)
    const parent = pile[pile.length - 1]
    const mat = multiplier(parent?.mat ?? IDENTITE, matriceDe(attrs.transform))
    const ignore = !!parent?.ignore || IGNORES.has(tag)
    if (!ignore && tag !== 'svg' && tag !== 'g') {
      const el: ElementSvg = { tag, attrs, classes, classesAncetres: pile.flatMap((p) => p.classes), mat }
      out.push(el)
      if (tag === 'text' && !auto) dernierTexte = el
    }
    if (!auto) pile.push({ tag, classes, mat, ignore })
  }
  return out
}

// Normalisation de texte pour la recherche : insensible à la casse et aux accents, ponctuation = séparateur.

/** « Chaudière (H/T) » → « chaudiere h t » */
export function normaliser(s: string): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[œŒ]/g, 'oe')
    .replace(/[æÆ]/g, 'ae')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export const mots = (s: string): string[] => normaliser(s).split(' ').filter(Boolean)

/** distance de Levenshtein bornée (renvoie max+1 dès que la borne est dépassée) */
export function distance(a: string, b: string, max = 2): number {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let mini = i
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      if (cur[j] < mini) mini = cur[j]
    }
    if (mini > max) return max + 1
    prev = cur
  }
  return prev[b.length]
}

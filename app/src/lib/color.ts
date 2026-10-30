// Couleur principale d'un client : adaptée à chaque thème pour rester lisible (WCAG AA, 4,5:1) sans toucher à la charte.
export type Rgb = [number, number, number]

export function hexToRgb(hex: string): Rgb | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
export const rgbToHex = (c: Rgb) =>
  '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')

export function luminance([r, g, b]: Rgb): number {
  const f = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
export function contrast(a: Rgb, b: Rgb): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
]

/** teinte (0-360), saturation et valeur (0-1) */
export function hsv([r, g, b]: Rgb) {
  const R = r / 255, G = g / 255, B = b / 255
  const max = Math.max(R, G, B), min = Math.min(R, G, B), d = max - min
  let h = 0
  if (d) {
    if (max === R) h = ((G - B) / d) % 6
    else if (max === G) h = (B - R) / d + 2
    else h = (R - G) / d + 4
    h = (h * 60 + 360) % 360
  }
  return { h, s: max ? d / max : 0, v: max }
}

/** le rouge est réservé aux alarmes : une couleur rouge vif n'est pas appliquée à l'interface */
export function isAlarmRed(hex: string): boolean {
  const c = hexToRgb(hex)
  if (!c) return false
  const { h, s, v } = hsv(c)
  return (h <= 18 || h >= 342) && s >= 0.35 && v >= 0.35
}

const DARK_BG: Rgb = [17, 24, 31] // #11181f (cartes en sombre)
const LIGHT_BG: Rgb = [255, 255, 255]
const INK: Rgb = [10, 15, 20]

export interface BrandVars {
  accent: string
  bright: string
  deep: string
  foreground: string
  soft: string
  glow: string
}

/** variables d'accent pour un thème ; null si la couleur est invalide ou réservée aux alarmes */
export function brandVars(hex: string | null | undefined, theme: 'light' | 'dark'): BrandVars | null {
  const base = hex ? hexToRgb(hex) : null
  if (!base || !hex || isAlarmRed(hex)) return null
  const bg = theme === 'dark' ? DARK_BG : LIGHT_BG
  const toward: Rgb = theme === 'dark' ? [255, 255, 255] : [0, 0, 0]
  let c = base
  for (let t = 0; contrast(c, bg) < 4.5 && t < 1; t += 0.04) c = mix(base, toward, t)
  const bright = mix(c, [255, 255, 255], 0.18)
  const deep = mix(c, [0, 0, 0], 0.22)
  const fg = contrast(c, INK) >= contrast(c, [255, 255, 255]) ? INK : ([255, 255, 255] as Rgb)
  const rgb = c.map(Math.round).join(' ')
  return {
    accent: rgbToHex(c),
    bright: rgbToHex(bright),
    deep: rgbToHex(deep),
    foreground: rgbToHex(fg),
    soft: `rgb(${rgb} / 0.14)`,
    glow: `rgb(${rgb} / 0.28)`,
  }
}

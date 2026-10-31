// Co-branding : logo, site web et couleur de l'entreprise de l'utilisateur, affichés À CÔTÉ de Hexa-AI (jamais à sa place).
// Source : companies (utilisateur connecté, RLS) ou RPC publique company_branding_by_slug (page de connexion /<slug>).
import { computed, ref, watchEffect } from 'vue'
import { supabase } from '@/lib/supabase'
import { publicUrl } from '@/composables/useBranding'
import { brandVars } from '@/lib/color'
import { useTheme } from '@/composables/useTheme'

export interface Brand {
  name: string
  logoUrl: string | null
  logoDarkUrl: string | null
  website: string | null
  color: string | null
}
interface Row {
  name: string | null
  logo_path: string | null
  logo_dark_path: string | null
  website: string | null
  brand_color: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any
const brand = ref<Brand | null>(null)

function fromRow(r: Row | null | undefined): Brand | null {
  if (!r) return null
  const b: Brand = {
    name: r.name ?? '',
    logoUrl: r.logo_path ? publicUrl(r.logo_path) : null,
    logoDarkUrl: r.logo_dark_path ? publicUrl(r.logo_dark_path) : null,
    website: r.website,
    color: r.brand_color,
  }
  // sans logo ni couleur, pas de co-branding (ex. entreprise interne Hexa-AI)
  return b.logoUrl || b.color ? b : null
}

let seq = 0
export async function loadBrandForCompany(companyId: string | null) {
  const n = ++seq
  if (!companyId) {
    brand.value = null
    return
  }
  const { data } = await sb
    .from('companies')
    .select('name, logo_path, logo_dark_path, website, brand_color')
    .eq('id', companyId)
    .maybeSingle()
  if (n === seq) brand.value = fromRow(data)
}
export async function loadBrandBySlug(slug: string) {
  const n = ++seq
  const { data } = await sb.rpc('company_branding_by_slug', { p_slug: slug })
  if (n === seq) brand.value = fromRow(Array.isArray(data) ? data[0] : data)
}
export function clearBrand() {
  seq++
  brand.value = null
}

// ---- logo recadré : les logos ont souvent de grandes marges transparentes/blanches ----
const trimmed = new Map<string, Promise<string>>()
function loadImg(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image()
    i.crossOrigin = 'anonymous'
    i.onload = () => res(i)
    i.onerror = () => rej(new Error('logo illisible'))
    i.src = url
  })
}
/** adresse (data:) du logo recadré sur son contenu ; l'adresse d'origine si le navigateur refuse la lecture */
export function trimmedLogo(url: string): Promise<string> {
  let p = trimmed.get(url)
  if (!p) {
    p = (async () => {
      try {
        const img = await loadImg(url)
        const w = img.naturalWidth, h = img.naturalHeight
        const k = Math.min(1, 1200 / Math.max(w, h))
        const c = document.createElement('canvas')
        c.width = Math.round(w * k); c.height = Math.round(h * k)
        const g = c.getContext('2d')!
        g.drawImage(img, 0, 0, c.width, c.height)
        const d = g.getImageData(0, 0, c.width, c.height).data
        let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1
        for (let y = 0; y < c.height; y++)
          for (let x = 0; x < c.width; x++) {
            const i = (y * c.width + x) * 4
            const empty = d[i + 3] < 12 || (d[i] > 247 && d[i + 1] > 247 && d[i + 2] > 247)
            if (!empty) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
          }
        if (x1 < 0) return url
        const o = document.createElement('canvas')
        o.width = x1 - x0 + 1; o.height = y1 - y0 + 1
        o.getContext('2d')!.drawImage(c, x0, y0, o.width, o.height, 0, 0, o.width, o.height)
        return o.toDataURL('image/png')
      } catch {
        return url
      }
    })()
    trimmed.set(url, p)
  }
  return p
}

/** icône carrée (apple-touch-icon / favicon) : logo recadré, centré sur fond blanc arrondi */
const icons = new Map<string, Promise<string>>()
async function squareIcon(url: string): Promise<string> {
  let p = icons.get(url)
  if (!p) {
    p = (async () => {
      try {
        const img = await loadImg(await trimmedLogo(url))
        const S = 180, pad = 22
        const c = document.createElement('canvas')
        c.width = c.height = S
        const g = c.getContext('2d')!
        g.fillStyle = '#ffffff'
        g.beginPath()
        g.roundRect(0, 0, S, S, 36)
        g.fill()
        const k = Math.min((S - 2 * pad) / img.naturalWidth, (S - 2 * pad) / img.naturalHeight)
        const w = img.naturalWidth * k, h = img.naturalHeight * k
        g.drawImage(img, (S - w) / 2, (S - h) / 2, w, h)
        return c.toDataURL('image/png')
      } catch {
        return url
      }
    })()
    icons.set(url, p)
  }
  return p
}

const BASE_TITLE = typeof document !== 'undefined' ? document.title || 'myHexa' : 'myHexa'
function setIcons(href: string | null) {
  document.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="apple-touch-icon"]').forEach((l) => {
    if (l.dataset.origHref === undefined) l.dataset.origHref = l.getAttribute('href') ?? ''
    if (href) {
      l.setAttribute('href', href)
      if (l.rel === 'icon') l.removeAttribute('sizes')
    } else {
      l.setAttribute('href', l.dataset.origHref)
    }
  })
}

const VARS = ['--primary', '--ring', '--accent', '--signal', '--signal-bright', '--signal-deep', '--signal-soft', '--signal-glow', '--primary-foreground', '--accent-foreground', '--brand-action', '--brand-action-fg', '--brand-action-hover']
if (typeof document !== 'undefined') {
  const { theme } = useTheme()
  // couleurs (en ligne sur <html> : plus prioritaires que les feuilles de style des thèmes)
  watchEffect(() => {
    const root = document.documentElement
    const v = brandVars(brand.value?.color, theme.value)
    if (!v) {
      VARS.forEach((n) => root.style.removeProperty(n))
      return
    }
    const set: Record<string, string> = {
      '--primary': v.accent, '--ring': v.accent, '--accent': v.accent, '--signal': v.accent,
      '--signal-bright': v.bright, '--signal-deep': v.deep, '--signal-soft': v.soft, '--signal-glow': v.glow,
      '--primary-foreground': v.foreground, '--accent-foreground': v.foreground,
      '--brand-action': v.accent, '--brand-action-fg': v.foreground, '--brand-action-hover': v.bright,
    }
    for (const [k, val] of Object.entries(set)) root.style.setProperty(k, val)
  })
  // onglet : titre + favicon
  let iconSeq = 0
  watchEffect(() => {
    const b = brand.value
    document.title = b?.name ? `${b.name} · myHexa` : BASE_TITLE
    const n = ++iconSeq
    if (b?.logoUrl) void squareIcon(b.logoUrl).then((h) => n === iconSeq && setIcons(h))
    else setIcons(null)
  })
}

export function useBrand() {
  const { theme } = useTheme()
  /** variante sombre du logo si elle existe ; sinon le logo normal (posé sur fond clair en thème sombre par CompanyLogo) */
  const logo = computed(() =>
    brand.value ? (theme.value === 'dark' && brand.value.logoDarkUrl) || brand.value.logoUrl : null,
  )
  const needsPlate = computed(() => theme.value === 'dark' && !brand.value?.logoDarkUrl)
  return { brand, logo, needsPlate }
}

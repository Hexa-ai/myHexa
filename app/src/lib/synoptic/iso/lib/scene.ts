// Scène : assemble symboles, tubes, gaines, sol, étiquettes ; tri de profondeur global ; export SVG.
import type { V3 } from './geom'
import { proj, f, bboxCoins, trier } from './geom'
import { cssIso } from './theme'
import { parseSvg } from './iso'
import type { Item, TubeOpts, GaineOpts } from './tubes'
import { tube, gaine, supports } from './tubes'
import type { Port, Rendu, EtatNom } from './types'
import type { Demande, Placee, Pt, Rect, OptsPlacement } from './etiquettes'
import { rect, polyDeBBox, placerEtiquettes } from './etiquettes'

export interface Etiquette {
  /** point 3D visé (ou un Rendu : ancre "haut") */
  ancre: V3 | Rendu
  nom?: string
  valeur?: string | number
  unite?: string
  /** décalage écran de la carte (px) */
  dx?: number; dy?: number
  etat?: EtatNom
  /** repère court (pastille noire) au lieu d'une carte */
  repere?: string
  /** puce d'une ligne « nom valeur unité » (instrumentation en mode indicateur) */
  compact?: boolean
  /** direction préférée (0..7 : E SE S SW W NW N NE) pour le placement automatique */
  pref?: number
}

/** carte mesurée (avant placement) */
interface Mesure { e: Etiquette; ax: number; ay: number; w: number; h: number }

export class Scene {
  items: Item[] = []
  etiquettes: Etiquette[] = []
  /** options du placement automatique des cartes */
  placement: OptsPlacement = {}
  sols: { x0: number; y0: number; x1: number; y1: number; pas: number }[] = []
  titre = ''
  sousTitre = ''
  legende: { couleur: string; texte: string }[] = []
  constructor(o: { titre?: string; sousTitre?: string } = {}) { this.titre = o.titre ?? ''; this.sousTitre = o.sousTitre ?? '' }

  add(...r: (Rendu | Rendu[])[]): this {
    for (const x of r.flat()) this.items.push({ bb: x.bbox, svg: x.svg })
    return this
  }
  tube(path: (Port | V3)[], o: TubeOpts = {}): this { this.items.push(...tube(path, o)); return this }
  gaine(path: (Port | V3)[], o: GaineOpts = {}): this { this.items.push(...gaine(path, o)); return this }
  /** supports de tuyauterie espacés sous un chemin horizontal */
  supports(path: (Port | V3)[], o: { pas?: number; r?: number; ordre?: string } = {}): this { this.items.push(...supports(path, o)); return this }
  item(i: Item): this { this.items.push(i); return this }
  /** calque SVG brut dessiné au-dessus de tout (repères de ports, aides) */
  over: string[] = []
  surcouche(svg: string): this { this.over.push(svg); return this }
  sol(x0: number, y0: number, x1: number, y1: number, pas = 40): this { this.sols.push({ x0, y0, x1, y1, pas }); return this }
  etiquette(e: Etiquette): this { this.etiquettes.push(e); return this }
  /** légende : swatch variable CSS + texte */
  legendeAjoute(couleur: string, texte: string): this { this.legende.push({ couleur, texte }); return this }

  /** éléments triés (arrière → avant) */
  trie(): Item[] { return trier(this.items) }

  /** SVG complet. K = zoom ; clair = ajoute la classe light ; css=false pour ne pas inclure la feuille de style. */
  toSvg(o: { K?: number; marge?: number; clair?: boolean; css?: boolean; largeur?: number; hauteur?: number; vue?: [number, number, number, number]; sw?: number; fond?: boolean } = {}): string {
    const K = o.K ?? 1
    // limites écran : union des boîtes projetées élément par élément (plus serré que la boîte globale)
    let mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9
    for (const it of this.items) for (const c of bboxCoins(it.bb)) { const [x, y] = proj(c); mnx = Math.min(mnx, x); mxx = Math.max(mxx, x); mny = Math.min(mny, y); mxy = Math.max(mxy, y) }
    for (const g of this.sols) for (const c of [[g.x0, g.y0], [g.x1, g.y0], [g.x1, g.y1], [g.x0, g.y1]]) { const [x, y] = proj([c[0], c[1], 0]); mnx = Math.min(mnx, x); mxx = Math.max(mxx, x); mny = Math.min(mny, y); mxy = Math.max(mxy, y) }
    const labs = this.cartes()
    for (const l of labs) { mnx = Math.min(mnx, l.x0); mxx = Math.max(mxx, l.x1); mny = Math.min(mny, l.y0); mxy = Math.max(mxy, l.y1) }
    const m = o.marge ?? 50
    const top = this.titre ? 54 : 0
    const vx = mnx - m, vy = mny - m - top, vw = mxx - mnx + 2 * m, vh = mxy - mny + 2 * m + top + (this.legende.length ? 24 : 0)
    const view = o.vue ?? [vx, vy, vw, vh]
    const W = o.largeur ?? Math.round(view[2] * K), H = o.hauteur ?? Math.round(view[3] * K)
    let s = `<svg xmlns="http://www.w3.org/2000/svg" class="iso-root${o.clair ? ' light' : ''}" width="${W}" height="${H}" viewBox="${f(view[0])} ${f(view[1])} ${f(view[2])} ${f(view[3])}"${o.sw ? ` style="--i-sw:${o.sw}px"` : ''}>`
    if (o.css !== false) s += `<style>${cssIso()}</style>`
    if (o.fond !== false) s += `<rect class="bg" x="${f(view[0])}" y="${f(view[1])}" width="${f(view[2])}" height="${f(view[3])}"/>`
    for (const g of this.sols) s += this.solSvg(g)
    s += '<g class="dessin">'
    for (const it of this.trie()) s += it.svg
    s += '</g>'
    for (const o2 of this.over) s += o2
    for (const l of labs) s += l.svg
    if (this.titre) s += `<text class="sub" x="${f(vx + 28)}" y="${f(vy + 30)}">${this.sousTitre}</text><text class="ttl" x="${f(vx + 28)}" y="${f(vy + 54)}">${this.titre}</text>`
    if (this.legende.length) {
      let x = vx + 28
      const y = vy + vh - 18
      s += '<g class="legend">'
      for (const l of this.legende) { s += `<rect x="${f(x)}" y="${f(y - 8)}" width="10" height="10" rx="2" style="fill:${l.couleur}"/><text class="k" x="${f(x + 15)}" y="${f(y + 1)}">${l.texte}</text>`; x += 26 + l.texte.length * 6.2 }
      s += '</g>'
    }
    return s + '</svg>'
  }
  element(o: Parameters<Scene['toSvg']>[0] = {}): SVGElement { return parseSvg(this.toSvg(o)) }

  private solSvg(g: { x0: number; y0: number; x1: number; y1: number; pas: number }): string {
    let d = ''
    for (let x = g.x0; x <= g.x1 + 0.01; x += g.pas) for (let y = g.y0; y <= g.y1 + 0.01; y += g.pas) { const [a, b] = proj([x, y, 0]); d += `M${f(a)} ${f(b)}h.01` }
    return `<path class="sol" d="${d}"/>`
  }

  /** silhouettes écran (polygones convexes) de tous les éléments dessinés */
  obstacles(): Pt[][] { return this.items.map((it) => polyDeBBox(it.bb)) }

  private mesure(e: Etiquette): Mesure {
    const anc: V3 = Array.isArray(e.ancre) ? e.ancre : (e.ancre as Rendu).ancres.haut
    const [ax, ay] = proj(anc)
    if (e.repere) return { e, ax, ay, w: e.repere.length * 6.4 + 12, h: 16 }
    const v = e.valeur != null ? String(e.valeur) : '', u = e.unite ?? '', nom = e.nom ?? ''
    if (e.compact) return { e, ax, ay, w: Math.max(30, (nom ? nom.length * 6.1 + 6 : 0) + v.length * 7.6 + u.length * 6 + 14), h: 17 }
    return { e, ax, ay, w: Math.max(nom.length * 6.9 + 18, v.length * 8.4 + u.length * 6.6 + 22, 54), h: v || u ? 36 : 22 }
  }

  /** Positions retenues des cartes (placement automatique sauf si dx/dy fournis). */
  placees(): { m: Mesure; p: Placee }[] {
    const ms = this.etiquettes.map((e) => this.mesure(e))
    const fixes: Rect[] = [], auto: Mesure[] = []
    const res = new Map<Mesure, Placee>()
    for (const m of ms) {
      if (m.e.dx != null || m.e.dy != null) {
        let x = m.ax + (m.e.dx ?? 30), y = m.ay + (m.e.dy ?? -50)
        if (m.e.repere) { x -= m.w / 2; y -= 8 }
        const tx = Math.max(x, Math.min(x + m.w, m.ax)), ty = m.ay < y ? y : m.ay > y + m.h ? y + m.h : y + m.h / 2
        res.set(m, { x, y, w: m.w, h: m.h, ax: m.ax, ay: m.ay, lx: m.e.repere ? x + m.w / 2 : tx, ly: m.e.repere ? y + m.h : ty, dir: -1, anneau: 0, conflit: false })
        fixes.push(rect(x, y, m.w, m.h))
      } else auto.push(m)
    }
    const dem: Demande[] = auto.map((m) => ({ ax: m.ax, ay: m.ay, w: m.w, h: m.h, pref: m.e.pref }))
    const pl = placerEtiquettes(dem, this.obstacles(), this.placement, fixes)
    auto.forEach((m, i) => res.set(m, pl[i]))
    return ms.map((m) => ({ m, p: res.get(m)! }))
  }

  private cartes(): { svg: string; x0: number; y0: number; x1: number; y1: number }[] {
    return this.placees().map(({ m, p }) => this.rendreCarte(m, p))
  }

  private rendreCarte(m: Mesure, p: Placee): { svg: string; x0: number; y0: number; x1: number; y1: number } {
    const e = m.e, { ax, ay } = m, { x, y, w, h, lx, ly } = p
    const bb = { x0: Math.min(x, ax), y0: Math.min(y, ay), x1: Math.max(x + w, ax), y1: Math.max(y + h, ay) }
    const lead = `<path class="lead" d="M${f(ax)} ${f(ay)}L${f(lx)} ${f(ly)}"/><circle class="dot" cx="${f(ax)}" cy="${f(ay)}" r="1.8"/>`
    if (e.repere) {
      return { svg: `<g class="lbl tag">${lead}<rect class="box" x="${f(x)}" y="${f(y)}" width="${f(w)}" height="16" rx="3"/><text x="${f(x + w / 2)}" y="${f(y + 11.4)}">${e.repere}</text></g>`, ...bb }
    }
    const v = e.valeur != null ? String(e.valeur) : '', u = e.unite ?? '', nom = e.nom ?? ''
    if (e.compact) {
      let s = `<g class="lbl chip${e.etat ? ' ' + e.etat : ''}">${lead}<rect class="box" x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="3"/>`
      s += `<text class="v" x="${f(x + 7)}" y="${f(y + 12.2)}">${nom ? `<tspan class="n">${nom}</tspan><tspan dx="5">` : '<tspan>'}${v}</tspan>${u ? `<tspan class="u" dx="2">${u}</tspan>` : ''}</text></g>`
      return { svg: s, ...bb }
    }
    let s = `<g class="lbl${e.etat ? ' ' + e.etat : ''}">${lead}`
    s += `<rect class="box" x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${h}" rx="3"/>`
    if (nom) s += `<text class="n" x="${f(x + 8)}" y="${f(y + 13)}">${nom}</text>`
    if (v || u) s += `<text class="v" x="${f(x + 8)}" y="${f(y + 29)}">${v}<tspan class="u" dx="3">${u}</tspan></text>`
    s += '</g>'
    return { svg: s, ...bb }
  }
}

/** Recadre un <svg> déjà inséré dans le document sur le dessin réel (getBBox), avec une marge ; K = zoom. Navigateur uniquement. */
export function cadrerSvg(svg: SVGSVGElement, o: { marge?: number; K?: number } = {}): [number, number, number, number] {
  const g = svg.querySelector('.dessin') as SVGGraphicsElement | null
  const m = o.marge ?? 24
  const boxes: DOMRect[] = []
  if (g) boxes.push(g.getBBox())
  svg.querySelectorAll('.lbl, .ttl, .sub, .legend').forEach((e) => boxes.push((e as SVGGraphicsElement).getBBox()))
  const x0 = Math.min(...boxes.map((b) => b.x)), y0 = Math.min(...boxes.map((b) => b.y))
  const x1 = Math.max(...boxes.map((b) => b.x + b.width)), y1 = Math.max(...boxes.map((b) => b.y + b.height))
  const v: [number, number, number, number] = [x0 - m, y0 - m, x1 - x0 + 2 * m, y1 - y0 + 2 * m]
  svg.setAttribute('viewBox', v.map((n) => Math.round(n * 100) / 100).join(' '))
  const K = o.K ?? 1
  svg.setAttribute('width', String(Math.round(v[2] * K))); svg.setAttribute('height', String(Math.round(v[3] * K)))
  const bg = svg.querySelector('rect.bg'); if (bg) { bg.setAttribute('x', String(v[0])); bg.setAttribute('y', String(v[1])); bg.setAttribute('width', String(v[2])); bg.setAttribute('height', String(v[3])) }
  return v
}

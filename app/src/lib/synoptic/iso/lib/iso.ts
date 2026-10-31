// Primitives iso (boîte, cylindre/cône, sphère, plan, anneaux…) et Builder de symboles.
import type { V3, BBox } from './geom'
import { proj, add, sub, mul, dot, unit, f, P2, pts, basePerp, arcCmds, ellipseD, arcD, estProche, silhouette, ptCircle, bboxDe, bboxUnion, bboxCyl, trier, VUE, C30 } from './geom'
import type { EtatNom, Port, Rendu, Valeurs, Params, PortType, Fluide } from './types'

// ───────────────────────── primitives en coordonnées MONDE ─────────────────────────

/** Boîte alignée sur les axes : 3 faces visibles (dessus / gauche +y / droite +x), 3 tons. */
export function boxSvg(b: BBox, faces = 'tlr'): string {
  const { x0, y0, z0, x1, y1, z1 } = b
  const L: V3[] = [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]]
  const R: V3[] = [[x1, y1, z0], [x1, y0, z0], [x1, y0, z1], [x1, y1, z1]]
  const T: V3[] = [[x0, y1, z1], [x1, y1, z1], [x1, y0, z1], [x0, y0, z1]]
  let s = ''
  if (faces.includes('l')) s += `<polygon class="l" points="${pts(L)}"/>`
  if (faces.includes('r')) s += `<polygon class="r" points="${pts(R)}"/>`
  if (faces.includes('t')) s += `<polygon class="t" points="${pts(T)}"/>`
  return s
}

const dmod = (a: number) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
/** arc le plus court de a vers b */
function shortD(a: number, b: number): number { return dmod(b - a + Math.PI) - Math.PI }
/** de a vers b, en passant par la moitié proche (near=true) ou lointaine de la caméra */
function halfD(u: V3, v: V3, a: number, b: number, near: boolean): number {
  const d = dmod(b - a)
  const m1 = a + d / 2
  return estProche(u, v, m1) === near ? d : d - Math.PI * 2
}

/** Cylindre / tronc de cône d'axe quelconque p0→p1. Rend corps (2 tons) + cap visible. */
export function cylSvg(p0: V3, p1: V3, r0: number, r1: number, o: { cap?: boolean; hollow?: boolean } = {}): string {
  if (dot(sub(p1, p0), VUE) < 0) { [p0, p1] = [p1, p0];[r0, r1] = [r1, r0] }
  const ax = unit(sub(p1, p0))
  const [u, v] = basePerp(ax)
  const [ta, tb] = silhouette(p0, r0, p1, r1, u, v)
  const U0 = mul(u, r0), V0 = mul(v, r0), U1 = mul(u, r1), V1 = mul(v, r1)
  const d1 = halfD(u, v, ta, tb, false)
  const d0 = halfD(u, v, tb, ta, true)
  const body = `M${P2(ptCircle(p0, U0, V0, ta))}L${P2(ptCircle(p1, U1, V1, ta))}${arcCmds(p1, U1, V1, ta, ta + d1)}L${P2(ptCircle(p0, U0, V0, tb))}${arcCmds(p0, U0, V0, tb, tb + d0)}Z`
  const xa = proj(ptCircle(p0, U0, V0, ta))[0], xb = proj(ptCircle(p0, U0, V0, tb))[0]
  const tR = xa > xb ? ta : tb
  const tm = tb + d0 / 2
  const sr = shortD(tm, tR), sr2 = shortD(tR, tm)
  const band = `M${P2(ptCircle(p0, U0, V0, tm))}L${P2(ptCircle(p1, U1, V1, tm))}${arcCmds(p1, U1, V1, tm, tm + sr)}L${P2(ptCircle(p0, U0, V0, tR))}${arcCmds(p0, U0, V0, tR, tR + sr2)}Z`
  let s = `<path class="l0" d="${body}"/><path class="r0" d="${band}"/><path class="ed" d="${body}"/>`
  if (o.cap !== false && r1 > 0.01) {
    const dom = Math.abs(ax[0]) >= Math.abs(ax[1]) && Math.abs(ax[0]) >= Math.abs(ax[2]) ? 'r' : Math.abs(ax[1]) >= Math.abs(ax[2]) ? 'l' : 't'
    s += `<path class="${o.hollow ? 'in' : dom}" d="${ellipseD(p1, U1, V1)}"/>`
  }
  return s
}

/** Anneaux (lignes d'ailettes, joints) sur la moitié proche d'un cylindre. */
export function ringsSvg(p0: V3, p1: V3, r: number, ts: number[], cls = 'ed2'): string {
  if (dot(sub(p1, p0), VUE) < 0) { [p0, p1] = [p1, p0] }
  const ax = unit(sub(p1, p0))
  const [u, v] = basePerp(ax)
  const phi = Math.atan2(dot(v, VUE), dot(u, VUE))
  let s = ''
  for (const t of ts) {
    const c = add(p0, mul(sub(p1, p0), t))
    s += `<path class="${cls}" d="${arcD(c, mul(u, r), mul(v, r), phi - Math.PI / 2, phi + Math.PI / 2)}"/>`
  }
  return s
}

export function ballSvg(c: V3, r: number): string {
  const [x, y] = proj(c)
  // croissant sombre à droite
  const k = 0.55
  return `<circle class="l" cx="${f(x)}" cy="${f(y)}" r="${f(r)}"/><path class="r0" d="M${f(x)} ${f(y - r)}A${f(r)} ${f(r)} 0 0 1 ${f(x)} ${f(y + r)}A${f(r * k)} ${f(r)} 0 0 0 ${f(x)} ${f(y - r)}Z"/><circle class="ed" cx="${f(x)}" cy="${f(y)}" r="${f(r)}"/>`
}

// ───────────────────────── Builder ─────────────────────────

export interface Ctx { tilt?: string; x: number; y: number; z: number; rot: number; W: number; D: number; H: number; etat: EtatNom; val: Valeurs; type: string; p: Params }
export interface Part { bb: BBox; m: string; s: string[]; k: number }

let UID = 0
export class Builder {
  parts: Part[] = []
  ports: Port[] = []
  anchors: Record<string, V3> = {}
  etat: EtatNom
  val: Valeurs
  p: Params
  c: Ctx
  constructor(c: Ctx) { this.c = c; this.etat = c.etat; this.val = c.val; this.p = c.p }

  get marche(): boolean { return this.etat === 'marche' || this.etat === 'modulant' }
  get pos(): number { return Math.max(0, Math.min(100, this.val.position ?? (this.etat === 'ouvert' ? 100 : this.etat === 'ferme' ? 0 : 50))) }
  get ouvert(): boolean { return this.etat === 'ouvert' || (this.etat === 'modulant' && this.pos > 0) || (this.val.position != null && this.val.position > 0) }
  get niveau(): number { return Math.max(0, Math.min(100, this.val.niveau ?? 50)) }

  /** local → monde (rotation par quarts de tour autour de l'empreinte locale W×D) */
  w(p: V3): V3 {
    const t = this.c.tilt
    if (t) p = t === 'x' ? [p[2], p[1], p[0]] : t === 'y' ? [p[0], p[2], p[1]] : t === 'xn' ? [p[2], p[1], -p[0]] : [p[0], p[2], -p[1]]
    let px = p[0], py = p[1], w = this.c.W, d = this.c.D
    for (let r = 0; r < this.c.rot / 90; r++) { const nx = d - py, ny = px; px = nx; py = ny; const t = w; w = d; d = t }
    return [this.c.x + px, this.c.y + py, this.c.z + p[2]]
  }
  /** direction locale → monde */
  wd(dv: V3): V3 {
    const t = this.c.tilt
    if (t) dv = t === 'x' ? [dv[2], dv[1], dv[0]] : t === 'y' ? [dv[0], dv[2], dv[1]] : t === 'xn' ? [dv[2], dv[1], -dv[0]] : [dv[0], dv[2], -dv[1]]
    let x = dv[0], y = dv[1]
    for (let r = 0; r < this.c.rot / 90; r++) { const nx = -y, ny = x; x = nx; y = ny }
    return [x, y, dv[2]]
  }
  get Wr(): number { return this.c.rot % 180 ? this.c.D : this.c.W }
  get Dr(): number { return this.c.rot % 180 ? this.c.W : this.c.D }

  push(bb: BBox, s: string, m = 'mb'): Part {
    const p: Part = { bb, m, s: [s], k: this.parts.length }
    this.parts.push(p)
    return p
  }
  /** ajoute un détail à une pièce existante (même groupe, même ordre de profondeur) */
  on(p: Part, s: string): Part { p.s.push(s); return p }

  box(x: number, y: number, z: number, w: number, d: number, h: number, m = 'mb', faces = 'tlr'): Part {
    const a = this.w([x, y, z]), b = this.w([x + w, y + d, z + h])
    const bb = bboxDe(a, b)
    return this.push(bb, boxSvg(bb, faces), m)
  }
  cyl(p0: V3, p1: V3, r: number, m = 'mb', r1?: number, o: { cap?: boolean; hollow?: boolean } = {}): Part {
    const a = this.w(p0), b = this.w(p1)
    const rr1 = r1 ?? r
    return this.push(bboxCyl(a, b, r, rr1), cylSvg(a, b, r, rr1, o), m)
  }
  cylZ(cx: number, cy: number, z: number, r: number, h: number, m = 'mb', r1?: number, o = {}): Part { return this.cyl([cx, cy, z], [cx, cy, z + h], r, m, r1, o) }
  cylX(x: number, cy: number, cz: number, r: number, l: number, m = 'mb', r1?: number, o = {}): Part { return this.cyl([x, cy, cz], [x + l, cy, cz], r, m, r1, o) }
  cylY(cx: number, y: number, cz: number, r: number, l: number, m = 'mb', r1?: number, o = {}): Part { return this.cyl([cx, y, cz], [cx, y + l, cz], r, m, r1, o) }
  ball(c: V3, r: number, m = 'mb'): Part {
    const a = this.w(c)
    return this.push({ x0: a[0] - r, y0: a[1] - r, z0: a[2] - r, x1: a[0] + r, y1: a[1] + r, z1: a[2] + r }, ballSvg(a, r), m)
  }
  /** anneaux sur un cylindre existant (positions relatives 0..1) */
  rings(part: Part, p0: V3, p1: V3, r: number, ts: number[], cls = 'ed2') {
    this.on(part, ringsSvg(this.w(p0), this.w(p1), r, ts, cls))
  }
  /** bride : disque court + couronne de boulons sur la face visible ; p = centre, axe local */
  flange(p: V3, axis: 'x' | 'y' | 'z', r: number, t = 2.5, n = 6, m = 'mm', sgn: 1 | -1 = 1): Part {
    const e: V3 = axis === 'x' ? [t * sgn, 0, 0] : axis === 'y' ? [0, t * sgn, 0] : [0, 0, t * sgn]
    const q = add(p, e)
    const part = this.cyl(p, q, r, m)
    // boulons : petits points sur le cap visible (celui qui regarde la caméra)
    const A = this.w(p), B = this.w(q)
    const wa = unit(sub(B, A))
    const wc = dot(wa, VUE) >= 0 ? B : A
    const [u, v] = basePerp(wa)
    let s = ''
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.3
      const c = ptCircle(wc, mul(u, r * 0.72), mul(v, r * 0.72), a)
      // cercle de rayon .. en iso : petit disque (ellipse dans le plan du cap)
      s += `<path class="bolt" d="${ellipseD(c, mul(u, r * 0.13), mul(v, r * 0.13))}"/>`
    }
    this.on(part, s)
    return part
  }
  /** surface plane (polygone 3D local) */
  poly(ps: V3[], cls = 'l', m = 'mb'): Part {
    const w = ps.map((q) => this.w(q))
    return this.push(bboxDe(...w), `<polygon class="${cls}" points="${pts(w)}"/>`, m)
  }
  /** matrice du plan local ('xy' z=fixed | 'xz' y=fixed | 'yz' x=fixed) */
  planeM(kind: 'xy' | 'xz' | 'yz', fixed: number): string {
    const map = (u: number, v: number): V3 => kind === 'xy' ? [u, v, fixed] : kind === 'xz' ? [u, fixed, v] : [fixed, u, v]
    const O = proj(this.w(map(0, 0))), U = proj(this.w(map(1, 0))), V = proj(this.w(map(0, 1)))
    return `matrix(${f(U[0] - O[0])} ${f(U[1] - O[1])} ${f(V[0] - O[0])} ${f(V[1] - O[1])} ${f(O[0])} ${f(O[1])})`
  }
  /** dessin 2D porté par un plan ; sur une pièce (détail) ou autonome (r = [u0,v0,u1,v1] pour la profondeur) */
  pl(kind: 'xy' | 'xz' | 'yz', fixed: number, inner: string, on?: Part, r?: [number, number, number, number], m = 'mb'): Part {
    const s = `<g transform="${this.planeM(kind, fixed)}">${inner}</g>`
    if (on) return this.on(on, s)
    const [u0, v0, u1, v1] = r ?? [0, 0, 0, 0]
    const map = (u: number, v: number): V3 => kind === 'xy' ? [u, v, fixed] : kind === 'xz' ? [u, fixed, v] : [fixed, u, v]
    const bb = bboxDe(this.w(map(u0, v0)), this.w(map(u1, v1)))
    return this.push(bb, s, m)
  }
  /** rotor plan animé : contenu centré (0,0) dans le plan, tourne si état marche */
  rotor(kind: 'xy' | 'xz' | 'yz', fixed: number, cu: number, cv: number, inner: string, on: Part, dur = 1.2) {
    const s = `<g transform="translate(${f(cu)} ${f(cv)})"><g class="spin" style="animation-duration:${dur / Math.max(0.2, this.val.vitesse ?? 1)}s">${inner}</g></g>`
    this.pl(kind, fixed, s, on)
  }
  /** ligne 3D */
  line(a: V3, b: V3, cls = 'ed', on?: Part): Part {
    const A = this.w(a), B = this.w(b)
    const s = `<path class="${cls}" d="M${P2(A)}L${P2(B)}"/>`
    return on ? this.on(on, s) : this.push(bboxDe(A, B), s, 'mb')
  }
  /** polyligne 3D (cls = classe) ; closed → polygone */
  path3(ps: V3[], cls: string, on?: Part, closed = false): Part {
    const w = ps.map((q) => this.w(q))
    const d = 'M' + w.map(P2).join('L') + (closed ? 'Z' : '')
    const s = `<path class="${cls}" d="${d}"/>`
    return on ? this.on(on, s) : this.push(bboxDe(...w), s, 'mb')
  }
  /** point lumineux d'état (LED) sur une pièce */
  led(p: V3, on: Part, r = 2, cls = 'led') {
    const [x, y] = proj(this.w(p))
    this.on(on, `<circle class="${cls}" cx="${f(x)}" cy="${f(y)}" r="${r}"/>`)
  }
  /** SVG écran libre, rattaché à une pièce */
  scr(p: V3, on: Part, inner: string) {
    const [x, y] = proj(this.w(p))
    this.on(on, `<g transform="translate(${f(x)} ${f(y)})">${inner}</g>`)
  }
  /** identifiant unique (clipPath…) */
  uid(): string { return 'iu' + (++UID) }
  /** pièce « libre » : boîte locale lo→hi ; fn reçoit la boîte MONDE et renvoie le SVG (coordonnées monde) */
  raw(lo: V3, hi: V3, fn: (bb: BBox, w: (p: V3) => V3) => string, m = 'mb', on?: Part): Part {
    const bb = bboxDe(this.w(lo), this.w(hi))
    const svg = fn(bb, (p) => this.w(p))
    return on ? this.on(on, svg) : this.push(bb, svg, m)
  }
  /** bande verticale sur un cylindre vertical (angles monde en degrés ; 45° = face à la caméra) */
  bandZ(cx: number, cy: number, z0: number, z1: number, r: number, a0: number, a1: number): string {
    const c0 = this.w([cx, cy, z0]), c1 = this.w([cx, cy, z1])
    const A0 = (a0 * Math.PI) / 180, A1 = (a1 * Math.PI) / 180
    const u: V3 = [r, 0, 0], v: V3 = [0, r, 0]
    return `M${P2(ptCircle(c0, u, v, A0))}${arcCmds(c0, u, v, A0, A1)}L${P2(ptCircle(c1, u, v, A1))}${arcCmds(c1, u, v, A1, A0)}Z`
  }
  /** petit trait horizontal sur un cylindre vertical (graduation) */
  tickZ(cx: number, cy: number, z: number, r: number, a0: number, a1: number): string {
    const c0 = this.w([cx, cy, z])
    const A0 = (a0 * Math.PI) / 180, A1 = (a1 * Math.PI) / 180
    return `M${P2(ptCircle(c0, [r, 0, 0], [0, r, 0], A0))}${arcCmds(c0, [r, 0, 0], [0, r, 0], A0, A1)}`
  }
  port(id: string, pos: V3, dir: V3, o: { type?: PortType; fluide?: Fluide; dn?: number; w?: number; h?: number } = {}) {
    this.ports.push({ id, pos: this.w(pos), dir: this.wd(dir), type: o.type ?? 'tube', fluide: o.fluide ?? this.p.fluide, dn: o.dn, w: o.w, h: o.h })
  }
  anchor(name: string, p: V3) { this.anchors[name] = this.w(p) }

  /** assemble : tri peintre des pièces + marqueur d'état + badges */
  finish(): Rendu {
    const sorted = trier(this.parts)
    const bb = bboxUnion(this.parts.map((p) => p.bb).concat([{ x0: this.c.x, y0: this.c.y, z0: this.c.z, x1: this.c.x + this.Wr, y1: this.c.y + this.Dr, z1: this.c.z }]))
    const corps = this.parts.length ? bboxUnion(this.parts.map((p) => p.bb)) : bb
    const etat = this.etat
    let s = `<g class="iso-sym s-${etat}${this.val.manuel ? ' manuel' : ''}" data-type="${this.c.type}"${this.p.id ? ` data-id="${this.p.id}"` : ''}>`
    // marqueur au sol
    const { x, y, z } = this.c
    const g: V3[] = [[x - 3, y - 3, z], [x + this.Wr + 3, y - 3, z], [x + this.Wr + 3, y + this.Dr + 3, z], [x - 3, y + this.Dr + 3, z]]
    if (this.p.marqueur) s += `<polygon class="gm" points="${pts(g)}"/>`
    for (const p of sorted) s += `<g class="${p.m}">${p.s.join('')}</g>`
    // badges (écran)
    const top = this.anchors.badge ?? [x + this.Wr / 2, y + this.Dr / 2, bb.z1 + 6] as V3
    s += badges(top, etat, this.val)
    s += '</g>'
    const ports = this.ports
    const out: Rendu = {
      type: this.c.type, svg: s, bbox: bb, corps, ports, ancres: { centre: [x + this.Wr / 2, y + this.Dr / 2, z + this.c.H / 2], haut: [x + this.Wr / 2, y + this.Dr / 2, bb.z1], ...this.anchors },
      port: (id: string) => { const p = ports.find((q) => q.id === id); if (!p) throw new Error(`port inconnu: ${this.c.type}.${id}`); return p },
      element: () => parseSvg(s),
    }
    return out
  }
}

function badges(top: V3, etat: EtatNom, val: Valeurs): string {
  const [x, y] = proj(top)
  const items: string[] = []
  if (etat === 'defaut') items.push(`<g class="bdg bdg-def"><circle r="6.5"/><path d="M0 -3.4V1.2M0 3.2V3.3" class="ex"/></g>`)
  if (etat === 'alarme') items.push(`<g class="bdg bdg-alm"><path d="M0 -7L7 5.5H-7Z"/><path d="M0 -2.6V1.4M0 3.4V3.5" class="ex"/></g>`)
  if (etat === 'inconnu') items.push(`<g class="bdg bdg-unk"><circle r="6.5"/><path d="M-2.2 -2.2A2.4 2.4 0 1 1 0 .6V1.8M0 3.6V3.7" class="ex"/></g>`)
  if (etat === 'consigne' || etat === 'maintenance') items.push(`<g class="bdg bdg-lock"><rect x="-5" y="-1.5" width="10" height="7.5" rx="1"/><path d="M-3 -1.5V-3.6A3 3 0 0 1 3 -3.6V-1.5" class="sh"/></g>`)
  if (val.manuel) items.push(`<g class="bdg bdg-man"><rect x="-6" y="-6" width="12" height="12" rx="2.5"/><text y="3.4">M</text></g>`)
  if (!items.length) return ''
  const n = items.length
  return `<g class="bdgs" transform="translate(${f(x)} ${f(y - 8)})">${items.map((it, i) => `<g transform="translate(${f((i - (n - 1) / 2) * 15)} 0)">${it}</g>`).join('')}</g>`
}

export function parseSvg(s: string): SVGElement {
  const doc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${s}</svg>`, 'image/svg+xml')
  return document.importNode(doc.documentElement.firstElementChild as Element, true) as SVGElement
}

// helpers de dessin 2D (coordonnées de plan) renvoyant des chaînes SVG
export const r2 = (x: number, y: number, w: number, h: number, cls = 'ed', rx = 0) => `<rect class="${cls}" x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}"${rx ? ` rx="${rx}"` : ''}/>`
export const c2 = (x: number, y: number, r: number, cls = 'ed') => `<circle class="${cls}" cx="${f(x)}" cy="${f(y)}" r="${f(r)}"/>`
export const l2 = (x1: number, y1: number, x2: number, y2: number, cls = 'ed2') => `<path class="${cls}" d="M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}"/>`
export const p2 = (a: [number, number][], cls = 'ed', closed = true) => `<path class="${cls}" d="M${a.map((q) => f(q[0]) + ' ' + f(q[1])).join('L')}${closed ? 'Z' : ''}"/>`
export const d2 = (d: string, cls = 'ed') => `<path class="${cls}" d="${d}"/>`
export { C30 }

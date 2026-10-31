/* eslint-disable */
// @ts-nocheck — catalogue de dessin (code massif copié de iso_lib, qui compile sans strictNullChecks) ; voir iso/README.md
// Stockage : cuves, bassins, silos, décanteur, bâche, ballons…
import { enregistrer } from './registre'
import type { Part } from './iso'
import { Builder, c2, r2, l2, p2, d2, boxSvg, cylSvg as CYL } from './iso'
import { moteurZ, helice, socle, grille } from './communs'
import { rayonDN } from './reseau'
import type { V3, BBox } from './geom'
import { pts, P2, f, proj, arcCmds, ptCircle } from './geom'
import type { Params, EtatNom, Valeurs, Fluide } from './types'

const NIV: [EtatNom, Valeurs?, number?][] = [['arret', { niveau: 20 }], ['marche', { niveau: 55 }], ['alarme', { niveau: 92, seuils: { b: 15, h: 85, tb: 5, th: 95 } }], ['defaut', { niveau: 4, seuils: { b: 15, tb: 8 } }], ['consigne', { niveau: 70, manuel: true }], ['inconnu', { niveau: 50 }], ['marche', { niveau: 65 }, 90], ['arret', { niveau: 35 }, 90]]
const exSeuils = { tb: 6, b: 15, h: 85, th: 94 }

/** Fenêtre de niveau (jauge) sur un cylindre vertical, graduations + seuils */
function jaugeZ(b: Builder, on: Part, cx: number, cy: number, z0: number, z1: number, r: number, fl: Fluide) {
  const A0 = 36, A1 = 50
  let s = `<path class="fk" style="opacity:.6" d="${b.bandZ(cx, cy, z0, z1, r + 0.2, A0, A1)}"/>`
  const lv = z0 + ((z1 - z0) * b.niveau) / 100
  if (b.niveau > 0.5) s += `<g class="fl-${fl}"><path class="fl" d="${b.bandZ(cx, cy, z0, lv, r + 0.25, A0, A1)}"/></g>`
  s += `<path class="ed" d="${b.bandZ(cx, cy, z0, z1, r + 0.3, A0, A1)}"/>`
  for (let i = 0; i <= 10; i++) s += `<path class="ed2" d="${b.tickZ(cx, cy, z0 + ((z1 - z0) * i) / 10, r + 0.3, A1 + 2, A1 + (i % 5 === 0 ? 8 : 5))}"/>`
  const sv = b.val.seuils
  if (sv) for (const [k, cls] of [['tb', 'tkr'], ['b', 'tkw'], ['h', 'tkw'], ['th', 'tkr']] as const) {
    const v = (sv as any)[k]; if (v != null) s += `<path class="${cls}" d="${b.tickZ(cx, cy, z0 + ((z1 - z0) * v) / 100, r + 0.4, A0 - 9, A0 - 1)}"/>`
  }
  b.on(on, s)
}

type Dir = 'x+' | 'x-' | 'y+' | 'y-' | 'z+' | 'z-'
/** piquage : tube court + bride, déclare le port. pos = point sur la paroi. */
function buse(b: Builder, id: string, pos: V3, dir: Dir, len: number, r: number, fl?: Fluide, m = 'mm') {
  const a = dir[0], sg = dir[1] === '+' ? 1 : -1
  const e: V3 = a === 'x' ? [sg * len, 0, 0] : a === 'y' ? [0, sg * len, 0] : [0, 0, sg * len]
  const end: V3 = [pos[0] + e[0], pos[1] + e[1], pos[2] + e[2]]
  b.cyl(pos, end, r, m)
  const t = 2.8
  const e2: V3 = a === 'x' ? [sg * t, 0, 0] : a === 'y' ? [0, sg * t, 0] : [0, 0, sg * t]
  const fe: V3 = [end[0] - e2[0], end[1] - e2[1], end[2] - e2[2]]
  b.flange(fe, a as 'x', r * 1.7, t, 6, 'mm', sg as 1)
  const dv: V3 = a === 'x' ? [sg, 0, 0] : a === 'y' ? [0, sg, 0] : [0, 0, sg]
  b.port(id, end, dv, { dn: r, fluide: fl })
}

/** Agitateur : embase, motoréducteur, moteur vertical, arbre et hélice(s) */
export function agitateur(b: Builder, cx: number, cy: number, zTop: number, len: number, immerge: boolean, rp = 16, nbH = 1) {
  b.box(cx - 15, cy - 15, zTop, 30, 30, 3, 'mm')
  b.cylZ(cx - 11, cy - 11, zTop + 3, 1.4, 2, 'md'); b.cylZ(cx + 11, cy + 11, zTop + 3, 1.4, 2, 'md')
  const gb = b.box(cx - 10, cy - 10, zTop + 3, 20, 20, 14, 'mb')
  b.pl('xz', cy + 10, r2(cx - 6, zTop + 8, 12, 5, 'fk', 1) + c2(cx - 3, zTop + 10.5, 1, 'led'), gb)
  const top = moteurZ(b, cx, cy, zTop + 17, 8.5, 22, { bornes: true })
  const sh = b.cylZ(cx, cy, immerge ? zTop - len : zTop - 4, 1.9, (immerge ? len : 4) + 3, 'mm')
  if (immerge) {
    for (let i = 0; i < nbH; i++) {
      const zh = zTop - len + 6 + i * 22
      b.pl('xy', zh, helice(rp, 3, 'fm'), undefined, [cx - rp, cy - rp, cx + rp, cy + rp], 'mm')
    }
    // on remplace par un rotor animé centré sur l'arbre
  }
  return { sh, top }
}

function tankRotors(b: Builder, cx: number, cy: number, zTop: number, len: number, rp: number, nbH: number) {
  for (let i = 0; i < nbH; i++) {
    const zh = zTop - len + 6 + i * (len - 12) / Math.max(1, nbH)
    const carrier = b.cylZ(cx, cy, zh - 1, 3, 2, 'mm')
    b.rotor('xy', zh + 1, cx, cy, helice(rp, 3, 'fm'), carrier, 0.8)
  }
}


export interface Piquage { id: string; face?: 'paroi' | 'fond' | 'toit' | 'trop_plein'; h?: number; angle?: number; r?: number; dn?: number; len?: number; fluide?: Fluide }
const dnRayon = (dn: number) => (dn >= 15 ? rayonDN(dn) : dn)
/** Piquages d'une cuve verticale. paroi : h = fraction de hauteur (0..1), angle en degrés (arrondi au quart de tour, 0 = +x, 90 = +y) ;
 *  fond : sortie sous le fût au rayon relatif r ; toit : au rayon relatif r ; trop_plein : paroi haute. */
function piquagesCuve(b: Builder, L: Piquage[], g: { cx: number; cy: number; r: number; h: number; zl: number; top: number; fond?: string; fluide: Fluide }) {
  const dirs: Dir[] = ['x+', 'y+', 'x-', 'y-']
  for (const q of L) {
    const rd = dnRayon(q.dn ?? 4), fl = q.fluide ?? g.fluide
    const face = q.face ?? 'paroi'
    const k = ((Math.round((q.angle ?? 0) / 90) % 4) + 4) % 4
    const a = (k * Math.PI) / 2
    const ux = Math.round(Math.cos(a)), uy = Math.round(Math.sin(a))
    if (face === 'fond') {
      const rr = (q.r ?? 0) * g.r
      const z0 = g.zl - (g.fond === 'bombe' ? 4 : 0)
      buse(b, q.id, [g.cx + ux * rr, g.cy + uy * rr, z0], 'z-', q.len ?? 12, rd, fl)
    } else if (face === 'toit') {
      const rr = (q.r ?? 0.55) * g.r
      buse(b, q.id, [g.cx + ux * rr, g.cy + uy * rr, g.top + 2.4], 'z+', q.len ?? 12, rd, fl)
    } else {
      const hh = face === 'trop_plein' ? (q.h ?? 0.93) : (q.h ?? 0.5)
      buse(b, q.id, [g.cx + ux * g.r, g.cy + uy * g.r, g.zl + g.h * hh], dirs[k], q.len ?? (face === 'trop_plein' ? 12 : 16), rd, fl)
    }
  }
}
/** échelle à crinoline simplifiée contre la paroi (angle en degrés) */
function echelleCuve(b: Builder, cx: number, cy: number, r: number, z0: number, z1: number, ang: number) {
  const a = (ang * Math.PI) / 180
  const nx = Math.cos(a), ny = Math.sin(a), tx = -ny, ty = nx
  const px = cx + nx * (r + 3), py = cy + ny * (r + 3)
  const w = 4.5
  for (const s of [-1, 1]) b.cyl([px + tx * w * s, py + ty * w * s, z0], [px + tx * w * s, py + ty * w * s, z1 + 8], 0.9, 'mm')
  const n = Math.floor((z1 - z0) / 7)
  for (let i = 0; i <= n; i++) { const z = z0 + 3 + i * 7; if (z < z1 + 6) b.cyl([px - tx * w, py - ty * w, z], [px + tx * w, py + ty * w, z], 0.55, 'mm') }
  for (const z of [z0 + (z1 - z0) * 0.3, z0 + (z1 - z0) * 0.75]) b.cyl([px, py, z], [cx + nx * r, cy + ny * r, z], 0.8, 'mm')
}
/** garde-corps circulaire sur le toit : montants + lisse haute + lisse intermédiaire */
function gardeCorps(b: Builder, cx: number, cy: number, r: number, z: number) {
  const n = 14, rr = r - 1.5, hh = 9
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; b.cylZ(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, z, 0.8, hh, 'mm') }
  for (const k of [1, 0.5]) {
    const P: V3[] = []
    for (let i = 0; i <= 28; i++) { const a = (i / 28) * Math.PI * 2; P.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, z + hh * k]) }
    b.path3(P, 'ed')
  }
}

enregistrer({
  id: 'cuve.verticale', famille: 'Stockage', nom: 'Cuve verticale (fond plat / bombé / conique, pieds)',
  taille: (p) => { const r = p.r ?? 34; return [2 * r + 40, 2 * r + 40, (p.h ?? 84) + (p.pieds === false ? 0 : (p.pieds_h ?? 18)) + (p.fond === 'conique' ? r * 0.55 : 0) + 26] },
  defauts: { r: 34, h: 84, fond: 'plat', toit: 'plat', pieds: true, vue: 'opaque', fluide: 'eau', agitateur: false, dn: 4 },
  variantes: ['fond=plat|bombe|conique', 'toit=plat|bombe|ouvert', 'vue=opaque|verre', 'agitateur', 'pieds'], planche: NIV, exemple: { seuils: exSeuils },
  dessiner(b: Builder, p: Params) {
    const r = p.r, h = p.h, cx = r + 20, cy = r + 20
    const pieds = p.pieds !== false
    const conique = p.fond === 'conique'
    const hc = conique ? r * 0.55 : 0
    const ph = pieds ? (p.pieds_h ?? 18) : 0
    const zl = ph + hc            // bas du fût
    const verre = p.vue === 'verre'
    // pieds : 4 jambes + couronne
    if (pieds) {
      for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const lx = cx + dx * r * 0.66, ly = cy + dy * r * 0.66
        b.cylZ(lx, ly, 0, 2.6 + (ph - 18) * 0.05, ph + hc * 0.5, 'mm'); b.cylZ(lx, ly, 0, 4.4 + (ph - 18) * 0.06, 1.6, 'mm')
      }
    }
    if (conique) b.cylZ(cx, cy, zl - hc, 5, hc + 0.1, 'mb', r)
    else if (p.fond === 'bombe') b.cylZ(cx, cy, zl - 4, r * 0.86, 4.2, 'mb', r)
    const fut = b.cylZ(cx, cy, zl, r, h, 'mb', undefined, { cap: p.toit !== 'ouvert' && !verre })
    b.rings(fut, [cx, cy, zl], [cx, cy, zl + h], r, [0.33, 0.66], 'ed2')
    const top = zl + h
    // niveau
    if (p.toit === 'ouvert' || verre) {
      const id = b.uid()
      const lv = zl + (h * b.niveau) / 100
      b.raw([cx - r, cy - r, top], [cx + r, cy + r, top], (bb, w) => {
        const c = w([cx, cy, top]), cl = w([cx, cy, lv])
        const U: V3 = [r, 0, 0], V: V3 = [0, r, 0]
        const ell = (cc: V3, k = 1) => `M${P2(ptCircle(cc, [r * k, 0, 0], [0, r * k, 0], 0))}${arcCmds(cc, [r * k, 0, 0], [0, r * k, 0], 0, Math.PI * 2)}Z`
        void U; void V
        let s = `<clipPath id="${id}"><path d="${ell(c, 0.97)}"/></clipPath>`
        s += `<path class="in" d="${ell(c)}"/><g clip-path="url(#${id})"><g class="fl-${p.fluide}"><path class="t" d="${ell(cl, 0.97)}"/></g></g><path class="ed" d="${ell(c)}"/>`
        return s
      }, 'mb', fut)
      if (verre) {
        // liquide vu à travers la paroi : volume translucide
        const wz0 = b.w([cx, cy, zl]), wz1 = b.w([cx, cy, lv])
        void wz0; void wz1
      }
    } else if (p.toit === 'bombe') {
      b.cylZ(cx, cy, top, r, r * 0.2, 'mb', r * 0.18)
      b.cylZ(cx, cy, top + r * 0.2, r * 0.18, 4, 'mm')
    } else {
      b.cylZ(cx, cy, top, r + 1.6, 2.4, 'mm')
      // trou d'homme et évent : écartés du centre si un agitateur occupe le toit
      const ag = !!p.agitateur
      const mx = ag ? cx + r * 0.52 : cx + r * 0.35, my = ag ? cy - r * 0.5 : cy - r * 0.15
      const vx = ag ? cx - r * 0.55 : cx - r * 0.45, vy = ag ? cy - r * 0.45 : cy + r * 0.25
      const mh = b.cylZ(mx, my, top + 2.4, 8.5, 4, 'mm')
      b.pl('xy', top + 6.5, c2(mx, my, 5.6, 'ed2') + c2(mx, my, 1.6, 'fd'), mh)
      b.cylZ(vx, vy, top + 2.4, 2.2, 10, 'mm'); b.cylZ(vx, vy, top + 12.4, 3.4, 2, 'md')
    }
    // fenêtre de niveau (cuve opaque)
    if (!verre && p.toit !== 'ouvert') jaugeZ(b, fut, cx, cy, zl + 5, top - 5, r, p.fluide)
    // liquide visible en transparence (vue verre)
    if (verre) {
      const lv = zl + (h * b.niveau) / 100
      b.raw([cx - r, cy - r, zl], [cx + r, cy + r, lv], (bb, w) => {
        const cylSvg = CYL
        return `<g class="fl-${p.fluide}" style="opacity:.5">${cylSvg(w([cx, cy, zl]), w([cx, cy, lv]), r - 0.4, r - 0.4, { cap: true })}</g>`
      }, 'mb')
    }
    // agitateur
    if (p.agitateur) {
      const L = h - 12
      agitateur(b, cx, cy, top + (p.toit === 'ouvert' ? 6 : 3), L + 3, !!(verre || p.toit === 'ouvert'), Math.min(18, r * 0.5), 1)
      if (verre || p.toit === 'ouvert') tankRotors(b, cx, cy, top + 6, L + 3, Math.min(18, r * 0.5), p.helices ?? 1)
    }
    // piquages : liste paramétrable (fond / paroi hauteur+angle / toit / trop-plein) ou jeu par défaut
    const zin = zl + h * 0.82, zout = zl + h * 0.12
    if (Array.isArray(p.piquages)) piquagesCuve(b, p.piquages, { cx, cy, r, h, zl, top, fond: p.fond, fluide: p.fluide })
    else {
      buse(b, 'e', [cx - r, cy, zin], 'x-', 16, p.dn, p.fluide)
      buse(b, 's', [cx + r, cy, zout], 'x+', 16, p.dn, p.fluide)
      buse(b, 'e2', [cx, cy + r, zl + h * 0.55], 'y+', 12, p.dn, p.fluide)
      buse(b, 'v', [cx, cy - r, zout + 6], 'y-', 12, p.dn, p.fluide)
    }
    if (p.echelle) echelleCuve(b, cx, cy, r, zl, top, p.echelle === true ? 225 : p.echelle)
    if (p.garde_corps) gardeCorps(b, cx, cy, r, top + (p.toit === 'ouvert' ? 0 : 2.4))
    b.anchor('badge', [cx, cy, top + 40]); b.anchor('haut', [cx, cy, top + 6]); b.anchor('niveau', [cx, cy, zl + (h * b.niveau) / 100])
  },
})

enregistrer({
  id: 'cuve.horizontale', famille: 'Stockage', nom: 'Cuve horizontale sur selles',
  taille: (p) => [(p.l ?? 130) + 70, (p.r ?? 26) * 2 + 40, (p.r ?? 26) * 2 + 26], defauts: { r: 26, l: 130, fluide: 'eau', dn: 4 }, planche: NIV, exemple: { seuils: exSeuils },
  dessiner(b: Builder, p: Params) {
    const r = p.r, l = p.l, x0 = 28, cy = r + 22, zc = r + 8
    const sellePos = [x0 + l * 0.2, x0 + l * 0.8]
    for (const sx of sellePos) {
      b.box(sx - 5, cy - r * 0.92, 0, 10, r * 1.84, zc - r * 0.55, 'mm')
      b.box(sx - 7, cy - r - 2, 0, 14, r * 2 + 4, 2.4, 'mm')
    }
    const t = b.cylX(x0, cy, zc, r, l, 'mb', undefined, { cap: false })
    b.rings(t, [x0, cy, zc], [x0 + l, cy, zc], r, [0.2, 0.5, 0.8], 'ed2')
    // fond bombé (côté +x)
    b.cylX(x0 + l, cy, zc, r, r * 0.3, 'mb', r * 0.5)
    b.cylX(x0 + l + r * 0.3, cy, zc, r * 0.5, 2, 'mm')
    // trou d'homme + piquages sur le dessus
    const mh = b.cylZ(x0 + l * 0.45, cy, zc + r - 1, 9, 5, 'mm')
    b.pl('xy', zc + r + 4, c2(x0 + l * 0.45, cy, 5.8, 'ed2') + c2(x0 + l * 0.45, cy, 1.8, 'fd'), mh)
    buse(b, 'e', [x0 + l * 0.15, cy, zc + r - 1], 'z+', 12, p.dn, p.fluide)
    buse(b, 'v', [x0 + l * 0.8, cy, zc + r - 1], 'z+', 10, p.dn * 0.7, p.fluide)
    buse(b, 's', [x0 - 0, cy, zc - r * 0.35], 'x-', 14, p.dn, p.fluide)
    // jauge visuelle latérale (+y)
    const gx = x0 + l * 0.68, gy = cy + r + 10
    const tube = b.cylZ(gx, gy, zc - r + 3, 2.6, 2 * r - 6, 'mm')
    b.cylY(gx, cy + r - 2, zc - r + 6, 1.4, 12, 'mm'); b.cylY(gx, cy + r - 2, zc + r - 8, 1.4, 12, 'mm')
    const hh = 2 * r - 10
    b.raw([gx - 3, gy - 3, zc - r + 5], [gx + 3, gy + 3, zc + r - 5], (bb, w) => {
      const z0 = zc - r + 5
      const lv = z0 + (hh * b.niveau) / 100
      const a = w([gx, gy, z0]), bb2 = w([gx, gy, z0 + hh])
      let s = `<path class="fk" style="opacity:.55" d="M${P2([a[0], a[1], a[2]])}L${P2(bb2)}" />`
      void s
      s = `<g class="fl-${p.fluide}"><path class="fl" d="M${P2(w([gx, gy + 1.9, z0]))}L${P2(w([gx, gy + 1.9, lv]))}L${P2(w([gx + 1.9, gy, lv]))}L${P2(w([gx + 1.9, gy, z0]))}Z"/></g>`
      return s
    }, 'mb', tube)
    b.anchor('badge', [x0 + l / 2, cy, zc + r + 26]); b.anchor('haut', [x0 + l / 2, cy, zc + r + 6])
  },
})

/** SVG d'un bassin ouvert (coordonnées monde). */
export function bassinSvg(bb: BBox, t: number, niv: number, fl: Fluide, id: string, fond = 5): string {
  const { x0, y0, z0, x1, y1, z1 } = bb
  let s = boxSvg(bb, 'lr')
  const ix0 = x0 + t, iy0 = y0 + t, ix1 = x1 - t, iy1 = y1 - t, zf = z0 + fond
  const op: V3[] = [[ix0, iy1, z1], [ix1, iy1, z1], [ix1, iy0, z1], [ix0, iy0, z1]]
  const ou: V3[] = [[x0, y1, z1], [x1, y1, z1], [x1, y0, z1], [x0, y0, z1]]
  const dd = (a: V3[]) => 'M' + a.map(P2).join('L') + 'Z'
  s += `<path class="t" fill-rule="evenodd" d="${dd(ou)}${dd(op)}"/>`
  s += `<clipPath id="${id}"><path d="${dd(op)}"/></clipPath><g clip-path="url(#${id})">`
  const wallX = (zt: number): V3[] => [[ix0, iy0, zf], [ix0, iy1, zf], [ix0, iy1, zt], [ix0, iy0, zt]]
  const wallY = (zt: number): V3[] => [[ix0, iy0, zf], [ix1, iy0, zf], [ix1, iy0, zt], [ix0, iy0, zt]]
  const flo: V3[] = [[ix0, iy1, zf], [ix1, iy1, zf], [ix1, iy0, zf], [ix0, iy0, zf]]
  s += `<polygon class="in" points="${pts(wallX(z1))}"/><polygon class="in" points="${pts(wallY(z1)).replace(/^/, '')}" style="filter:none"/>`
  s += `<polygon class="r" points="${pts(wallX(z1))}"/><polygon class="l" points="${pts(wallY(z1))}"/><polygon class="t" points="${pts(flo)}"/>`
  if (niv > 0.5) {
    const zl = zf + ((z1 - zf) * niv) / 100
    const surf: V3[] = [[ix0, iy1, zl], [ix1, iy1, zl], [ix1, iy0, zl], [ix0, iy0, zl]]
    s += `<g class="fl-${fl}" style="opacity:.9"><polygon class="r" points="${pts(wallX(zl))}"/><polygon class="l" points="${pts(wallY(zl))}"/><polygon class="t" points="${pts(surf)}"/></g>`
  }
  s += `</g><path class="ed" d="${dd(op)}"/>`
  return s
}

enregistrer({
  id: 'bassin.beton', famille: 'Stockage', nom: 'Bassin béton ouvert',
  taille: (p) => [p.l ?? 180, p.w ?? 120, (p.h ?? 54) + 24], defauts: { l: 180, w: 120, h: 54, t: 8, fluide: 'eau', dn: 5 }, planche: NIV.slice(0, 7), exemple: {}, 
  dessiner(b: Builder, p: Params) {
    const { l, w, h, t } = p
    const id = b.uid()
    const base = b.raw([0, 0, 0], [l, w, h], (bb) => bassinSvg(bb, t, b.niveau, p.fluide, id), 'mc')
    // joints de dilatation sur les parois
    b.pl('xz', w, [0.33, 0.66].map((k) => l2(l * k, 0, l * k, h, 'ed2')).join(''), base)
    b.pl('yz', l, [0.5].map((k) => l2(w * k, 0, w * k, h, 'ed2')).join(''), base)
    // garde-corps sur les bords avant
    const nxp = Math.round(l / 40), nyp = Math.round(w / 40)
    for (let i = 0; i <= nxp; i++) b.cylZ((l * i) / nxp, w - t / 2, h, 1, 14, 'mm')
    for (let j = 0; j < nyp; j++) b.cylZ(l - t / 2, (w * j) / nyp, h, 1, 14, 'mm')
    b.path3([[0, w - t / 2, h + 14], [l - t / 2, w - t / 2, h + 14], [l - t / 2, 0, h + 14]], 'ed')
    b.path3([[0, w - t / 2, h + 7], [l - t / 2, w - t / 2, h + 7], [l - t / 2, 0, h + 7]], 'ed2')
    buse(b, 'e', [0, w * 0.5, h * 0.7], 'x-', 14, p.dn, p.fluide)
    buse(b, 's', [l, w * 0.4, h * 0.25], 'x+', 14, p.dn, p.fluide)
    buse(b, 'v', [l * 0.5, 0, h * 0.2], 'y-', 12, p.dn, p.fluide)
    b.anchor('badge', [l / 2, w / 2, h + 30]); b.anchor('haut', [l / 2, w / 2, h + 14])
    b.anchor('niveau', [l / 2, w / 2, 5 + ((h - 5) * b.niveau) / 100])
  },
})

/** trémie pyramidale tronquée (coordonnées monde) */
function tremieSvg(cx: number, cy: number, zt: number, hw: number, zb: number, hb: number): string {
  const X: V3[] = [[cx + hw, cy - hw, zt], [cx + hw, cy + hw, zt], [cx + hb, cy + hb, zb], [cx + hb, cy - hb, zb]]
  const Y: V3[] = [[cx - hw, cy + hw, zt], [cx + hw, cy + hw, zt], [cx + hb, cy + hb, zb], [cx - hb, cy + hb, zb]]
  return `<polygon class="r" points="${pts(X)}"/><polygon class="l" points="${pts(Y)}"/>`
}

enregistrer({
  id: 'decanteur.lamellaire', famille: 'Stockage', nom: 'Décanteur lamellaire (trémies)',
  taille: (p) => [(p.nb ?? 4) * 64 + 24, 190, 150], defauts: { nb: 4, fluide: 'eau', dn: 4 }, variantes: ['nb=2..6'], planche: [['arret', { niveau: 78 }], ['marche', { niveau: 82 }], ['alarme', { niveau: 96 }], ['defaut', { niveau: 30 }], ['consigne', { niveau: 80, manuel: true }], ['inconnu', { niveau: 60 }], ['marche', { niveau: 82 }, 90]],
  dessiner(b: Builder, p: Params) {
    const nb = p.nb, pitch = 64, L = nb * pitch, Wd = 120, x0 = 12, y0 = 22
    const zb = 30, hh = 44, zt = zb + hh, ht = 38
    // trémies + piquages de soutirage en +y
    for (let i = 0; i < nb; i++) {
      const cx = x0 + pitch * (i + 0.5), cy = y0 + Wd / 2
      b.raw([cx - 30, cy - 30, zb], [cx + 30, cy + 30, zt], (bb, w) => {
        const c = w([cx, cy, 0])
        return tremieSvg(c[0], c[1], zt, 30, zb, 6)
      }, 'mc')
      // soutirage : tube horizontal vers +y depuis la pointe de trémie
      b.cylZ(cx, cy, zb - 8, 5.6, 8.4, 'mm')
      b.cylY(cx, cy, zb - 8, 5, y0 + Wd + 50 - cy - 4, 'mm')
      b.flange([cx, y0 + Wd + 46, zb - 8], 'y', 8.4, 3, 6)
      b.port('h' + (i + 1), [cx, y0 + Wd + 49, zb - 8], [0, 1, 0], { dn: 5, fluide: 'boues' })
      b.cylZ(cx - 30, y0 + 4, 0, 2.6, zb + hh * 0.6, 'mm'); b.cylZ(cx + 30, y0 + Wd - 4, 0, 2.6, zb + hh * 0.6, 'mm')
    }
    // fût rectangulaire à lamelles
    const id = b.uid()
    const body = b.raw([x0, y0, zt], [x0 + L, y0 + Wd, zt + ht], (bb) => bassinSvg(bb, 6, b.niveau, p.fluide, id, 0), 'mc')
    const zs = zt + (ht * b.niveau) / 100
    // modules lamellaires + goulottes de collecte (sur l'eau)
    for (let i = 0; i < nb; i++) {
      const gx = x0 + pitch * i + 10
      b.raw([gx, y0 + 12, zs - 3], [gx + pitch - 20, y0 + Wd - 12, zs + 0.4], (bb) => {
        let s = ''
        const ix0 = bb.x0, ix1 = bb.x1, iy0 = bb.y0, iy1 = bb.y1, z = bb.z1
        s += `<polygon class="t" style="opacity:.85" points="${pts([[ix0, iy1, z], [ix1, iy1, z], [ix1, iy0, z], [ix0, iy0, z]])}"/>`
        for (let k = 1; k < 9; k++) { const yy = iy0 + ((iy1 - iy0) * k) / 9; s += `<path class="ed2" d="M${P2([ix0, yy, z])}L${P2([ix1, yy, z])}"/>` }
        return s
      }, 'mm')
      b.box(gx + (pitch - 20) / 2 - 2.5, y0 + 8, zs + 0.4, 5, Wd - 16, 3, 'mm')
    }
    // goulotte d'eau décantée longitudinale et passerelle
    b.box(x0 + 6, y0 + Wd - 22, zt + ht, L - 12, 6, 2, 'mm')
    for (let i = 0; i <= nb * 2; i++) b.cylZ(x0 + 4 + (L - 8) * i / (nb * 2), y0 + Wd - 1.5, zt + ht, 0.9, 12, 'mm')
    b.path3([[x0 + 4, y0 + Wd - 1.5, zt + ht + 12], [x0 + L - 4, y0 + Wd - 1.5, zt + ht + 12]], 'ed')
    b.path3([[x0 + 4, y0 + Wd - 1.5, zt + ht + 6], [x0 + L - 4, y0 + Wd - 1.5, zt + ht + 6]], 'ed2')
    buse(b, 'e', [x0, y0 + Wd / 2, zt + ht * 0.55], 'x-', 14, p.dn * 1.3, p.fluide)
    buse(b, 's', [x0 + L, y0 + Wd / 2, zt + ht * 0.8], 'x+', 14, p.dn * 1.3, 'eau_decantee')
    b.anchor('badge', [x0 + L / 2, y0 + Wd / 2, zt + ht + 36]); b.anchor('haut', [x0 + L / 2, y0 + Wd / 2, zt + ht + 4])
    b.anchor('niveau', [x0 + L / 2, y0 + Wd / 2, zs])
    void body
  },
})

enregistrer({
  id: 'silo.tremie', famille: 'Stockage', nom: 'Silo à trémie',
  taille: (p) => [(p.r ?? 28) * 2 + 40, (p.r ?? 28) * 2 + 40, (p.h ?? 70) + 90], defauts: { r: 28, h: 70, fluide: 'boues', dn: 4 }, planche: NIV.slice(0, 7), exemple: { seuils: exSeuils },
  dessiner(b: Builder, p: Params) {
    const r = p.r, h = p.h, cx = r + 20, cy = r + 20, hc = r * 1.1, zl = 38 + hc
    // pieds contreventés
    for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      b.cylZ(cx + dx * r * 0.8, cy + dy * r * 0.8, 0, 2.4, zl + 4, 'mm'); b.box(cx + dx * r * 0.8 - 4, cy + dy * r * 0.8 - 4, 0, 8, 8, 1.6, 'mm')
    }
    for (const sgn of [1, -1]) b.path3([[cx + r * 0.8, cy + sgn * r * 0.8, 6], [cx + r * 0.8, cy - sgn * r * 0.8, zl - 8]], 'ed2')
    for (const sgn of [1, -1]) b.path3([[cx + sgn * r * 0.8, cy + r * 0.8, 6], [cx - sgn * r * 0.8, cy + r * 0.8, zl - 8]], 'ed2')
    // trémie conique
    b.cylZ(cx, cy, zl - hc, 4.5, hc + 0.1, 'mb', r)
    b.cylZ(cx, cy, zl - hc - 6, 4.5, 6, 'mm'); 
    const sas = b.box(cx - 8, cy - 8, zl - hc - 20, 16, 16, 14, 'mm')
    b.pl('xz', cy + 8, c2(cx, zl - hc - 13, 4.6, 'ed2') + c2(cx, zl - hc - 13, 1.4, 'fd'), sas)
    const fut = b.cylZ(cx, cy, zl, r, h, 'mb')
    b.rings(fut, [cx, cy, zl], [cx, cy, zl + h], r, [0.25, 0.5, 0.75], 'ed2')
    jaugeZ(b, fut, cx, cy, zl + 8, zl + h - 8, r, p.fluide)
    // toit conique + filtre dépoussiéreur
    b.cylZ(cx, cy, zl + h, r, r * 0.26, 'mb', r * 0.4)
    const fl = b.cylZ(cx, cy, zl + h + r * 0.26, r * 0.4, 14, 'mm')
    b.rings(fl, [cx, cy, zl + h + r * 0.26], [cx, cy, zl + h + r * 0.26 + 14], r * 0.4, [0.5], 'ed2')
    b.cylZ(cx, cy, zl + h + r * 0.26 + 14, r * 0.46, 2.4, 'mm')
    buse(b, 'e', [cx - r, cy, zl + h * 0.8], 'x-', 14, p.dn, p.fluide)
    b.port('s', [cx, cy, zl - hc - 20], [0, 0, -1], { dn: 5 })
    b.anchor('badge', [cx, cy, zl + h + r * 0.26 + 30]); b.anchor('haut', [cx, cy, zl + h + r * 0.26 + 16])
  },
})

enregistrer({
  id: 'bache', famille: 'Stockage', nom: 'Bâche (réservoir rectangulaire à panneaux)',
  taille: (p) => [(p.l ?? 120) + 40, (p.w ?? 84) + 40, (p.h ?? 64) + 30], defauts: { l: 120, w: 84, h: 64, fluide: 'eau_decantee', dn: 4 }, planche: NIV, exemple: { seuils: exSeuils },
  dessiner(b: Builder, p: Params) {
    const { l, w, h } = p, x0 = 20, y0 = 10, zb = 6
    b.box(x0 + 8, y0 + 4, 0, 12, w - 8, zb, 'mm'); b.box(x0 + l - 20, y0 + 4, 0, 12, w - 8, zb, 'mm')
    const cu = b.box(x0, y0, zb, l, w, h, 'mc')
    const nx = 4, ny = 3
    // panneaux boulonnés : joints
    let sY = '', sX = ''
    for (let i = 1; i < nx; i++) sY += l2(x0 + (l * i) / nx, zb, x0 + (l * i) / nx, zb + h, 'ed2')
    for (let j = 1; j < 3; j++) sY += l2(x0, zb + (h * j) / 3, x0 + l, zb + (h * j) / 3, 'ed2')
    for (let i = 1; i < ny; i++) sX += l2(y0 + (w * i) / ny, zb, y0 + (w * i) / ny, zb + h, 'ed2')
    for (let j = 1; j < 3; j++) sX += l2(y0, zb + (h * j) / 3, y0 + w, zb + (h * j) / 3, 'ed2')
    b.pl('xz', y0 + w, sY, cu); b.pl('yz', x0 + l, sX, cu)
    // jauge à tube transparent sur la face +x
    const gx = x0 + l, gz0 = zb + 6, gz1 = zb + h - 6
    const gy = y0 + w * 0.8
    const lv = gz0 + ((gz1 - gz0) * b.niveau) / 100
    b.pl('yz', gx + 0.1, r2(gy - 3, gz0, 6, gz1 - gz0, 'fk', 1.5).replace('class="fk"', 'class="fk" style="opacity:.6"') + `<g class="fl-${p.fluide}">${r2(gy - 2.2, gz0 + 0.8, 4.4, Math.max(0, lv - gz0 - 0.8), 'fl', 1)}</g>` +
      [0, 1, 2, 3, 4].map((i) => l2(gy + 4, gz0 + ((gz1 - gz0) * i) / 4, gy + 8, gz0 + ((gz1 - gz0) * i) / 4, 'ed2')).join('') +
      (b.val.seuils ? (['tb', 'b', 'h', 'th'] as const).map((k) => { const v = (b.val.seuils as any)[k]; return v != null ? l2(gy - 9, gz0 + ((gz1 - gz0) * v) / 100, gy - 4.5, gz0 + ((gz1 - gz0) * v) / 100, k === 'tb' || k === 'th' ? 'tkr' : 'tkw') : '' }).join('') : ''), cu)
    // toit : trou d'homme, évent, échelle
    const mh = b.cylZ(x0 + l * 0.3, y0 + w * 0.5, zb + h, 9, 4, 'mm')
    b.pl('xy', zb + h + 4, c2(x0 + l * 0.3, y0 + w * 0.5, 5.6, 'ed2') + c2(x0 + l * 0.3, y0 + w * 0.5, 1.6, 'fd'), mh)
    b.cylZ(x0 + l * 0.7, y0 + w * 0.3, zb + h, 2.4, 9, 'mm'); b.cylZ(x0 + l * 0.7, y0 + w * 0.3, zb + h + 9, 3.6, 2, 'md')
    // échelle sur la face +x (rails + barreaux)
    const ex = x0 + l + 0.6, ey = y0 + w * 0.2
    let sl = l2(ey - 4, zb, ey - 4, zb + h, 'ed') + l2(ey + 4, zb, ey + 4, zb + h, 'ed')
    for (let z = zb + 6; z < zb + h; z += 7) sl += l2(ey - 4, z, ey + 4, z, 'ed2')
    b.pl('yz', ex, sl, cu)
    buse(b, 'e', [x0, y0 + w * 0.5, zb + h * 0.78], 'x-', 14, p.dn, p.fluide)
    buse(b, 's', [x0 + l, y0 + w * 0.45, zb + h * 0.1], 'x+', 14 + 2, p.dn * 1.2, p.fluide)
    buse(b, 'tp', [x0 + l * 0.5, y0 + w, zb + h * 0.88], 'y+', 12, p.dn * 0.8, p.fluide)
    b.anchor('badge', [x0 + l / 2, y0 + w / 2, zb + h + 30]); b.anchor('haut', [x0 + l / 2, y0 + w / 2, zb + h + 4])
    b.anchor('niveau', [x0 + l / 2, y0 + w / 2, gz0 + ((gz1 - gz0) * b.niveau) / 100])
  },
})

enregistrer({
  id: 'ballon.ecs', famille: 'Stockage', nom: 'Ballon ECS (calorifugé, piquages, thermomètre)',
  taille: (p) => [(p.r ?? 24) * 2 + 40, (p.r ?? 24) * 2 + 40, (p.h ?? 92) + 30], defauts: { r: 24, h: 92, fluide: 'ecs', dn: 3.4 }, planche: [['arret'], ['marche', { valeur: 58 }], ['alarme'], ['defaut'], ['consigne', { manuel: true }], ['inconnu'], ['marche', {}, 90], ['arret', {}, 90]],
  dessiner(b: Builder, p: Params) {
    const r = p.r, h = p.h, cx = r + 20, cy = r + 20, z0 = 10
    for (const [dx, dy] of [[1, 0], [-0.5, 0.87], [-0.5, -0.87]]) b.cylZ(cx + dx * r * 0.75, cy + dy * r * 0.75, 0, 3, z0 + 2, 'mm')
    b.cylZ(cx, cy, z0 - 2, r * 0.9, 3, 'mm')
    const fut = b.cylZ(cx, cy, z0, r, h, 'mb')
    b.rings(fut, [cx, cy, z0], [cx, cy, z0 + h], r, [0.18, 0.36, 0.54, 0.72, 0.9], 'ed2')
    b.cylZ(cx, cy, z0 + h, r, r * 0.34, 'mb', r * 0.45)
    b.cylZ(cx, cy, z0 + h + r * 0.34, r * 0.45, 3, 'mm')
    // bride de visite + thermomètre + anode
    const vi = b.cylZ(cx + r - 2, cy + 0, z0 + 12, 0.1, 0.1, 'mm')
    void vi
    const th = b.cylZ(cx - r * 0.35, cy + r * 0.2, z0 + h + r * 0.1, 1.2, 14, 'mm')
    void th
    b.cylZ(cx + r * 0.2, cy - r * 0.25, z0 + h + r * 0.28, 2.6, 8, 'mm'); b.cylZ(cx + r * 0.2, cy - r * 0.25, z0 + h + r * 0.28 + 8, 3.6, 2, 'md')
    // bande thermométrique : chaud en haut → froid en bas (statique), valeur = repère
    const cols = ['eau_chaude_aller', 'ecs', 'eau_chaude_retour', 'eau_glacee']
    let sv = `<path class="fk" style="opacity:.5" d="${b.bandZ(cx, cy, z0 + 8, z0 + h - 8, r + 0.2, 36, 50)}"/>`
    for (let i = 0; i < 4; i++) { const za = z0 + h - 8 - ((h - 16) * (i + 1)) / 4, zbb = z0 + h - 8 - ((h - 16) * i) / 4; sv += `<g class="fl-${cols[i]}"><path class="fl" style="opacity:.85" d="${b.bandZ(cx, cy, za + 1, zbb - 1, r + 0.25, 36, 50)}"/></g>` }
    sv += `<path class="ed" d="${b.bandZ(cx, cy, z0 + 8, z0 + h - 8, r + 0.3, 36, 50)}"/>`
    b.on(fut, sv)
    // piquages : primaire (serpentin) à gauche, ECS haut, EF bas, bouclage
    buse(b, 'ecs', [cx, cy, z0 + h + r * 0.34 + 3], 'z+', 8, p.dn, 'ecs')
    buse(b, 'ef', [cx - r, cy, z0 + 8], 'x-', 14, p.dn, 'eau')
    buse(b, 'bouclage', [cx - r, cy, z0 + h * 0.45], 'x-', 14, p.dn * 0.8, 'ecs')
    buse(b, 'pa', [cx + r, cy, z0 + h * 0.62], 'x+', 14, p.dn, 'eau_chaude_aller')
    buse(b, 'pr', [cx + r, cy, z0 + h * 0.18], 'x+', 14, p.dn, 'eau_chaude_retour')
    b.anchor('badge', [cx, cy, z0 + h + 34]); b.anchor('haut', [cx, cy, z0 + h + 12])
  },
})

enregistrer({
  id: 'vase_expansion', famille: 'Stockage', nom: "Vase d'expansion (à membrane)",
  taille: () => [84, 84, 78], defauts: { fluide: 'eau_chaude_retour', dn: 3.4 }, planche: [['arret'], ['marche'], ['alarme'], ['defaut'], ['consigne'], ['inconnu'], ['arret', {}, 90]],
  dessiner(b: Builder, p: Params) {
    const r = 22, cx = 42, cy = 42
    for (const [dx, dy] of [[1, 0], [-0.5, 0.87], [-0.5, -0.87]]) { b.cylZ(cx + dx * r * 0.78, cy + dy * r * 0.78, 0, 2.4, 14, 'mm'); b.cylZ(cx + dx * r * 0.78, cy + dy * r * 0.78, 0, 4, 1.4, 'mm') }
    b.cylZ(cx, cy, 12, r * 0.55, 4, 'mm', r * 0.8)
    b.cylZ(cx, cy, 16, r * 0.8, 3, 'mm', r * 0.96)
    const fut = b.cylZ(cx, cy, 19, r, 28, 'mb')
    b.rings(fut, [cx, cy, 19], [cx, cy, 47], r, [0.5], 'ed2')
    b.cylZ(cx, cy, 47, r, 4, 'ma')
    b.cylZ(cx, cy, 51, r, 6, 'mb', r * 0.6)
    b.cylZ(cx, cy, 57, r * 0.6, 3, 'mb', r * 0.25)
    b.cylZ(cx, cy, 60, 3.6, 4, 'mm'); b.cylZ(cx, cy, 64, 2.2, 3, 'md')
    buse(b, 'a', [cx - r * 0.8, cy, 14], 'x-', 16, p.dn, p.fluide)
    b.anchor('badge', [cx, cy, 82]); b.anchor('haut', [cx, cy, 66])
  },
})

enregistrer({
  id: 'bouteille_decouplage', famille: 'Stockage', nom: 'Bouteille de découplage hydraulique',
  taille: () => [84, 60, 140], defauts: { fluide: 'eau_chaude_aller', dn: 5 }, planche: [['arret'], ['marche'], ['alarme'], ['defaut'], ['consigne'], ['inconnu'], ['marche', {}, 90], ['arret', {}, 90]],
  dessiner(b: Builder, p: Params) {
    const r = 15, cx = 42, cy = 30
    b.cylZ(cx - 11, cy, 0, 2.4, 14, 'mm'); b.cylZ(cx + 11, cy, 0, 2.4, 14, 'mm'); b.box(cx - 16, cy - 8, 12, 32, 16, 3, 'mm')
    b.cylZ(cx, cy, 15, r * 0.6, 4, 'mb', r)
    const fut = b.cylZ(cx, cy, 19, r, 94, 'mb')
    b.rings(fut, [cx, cy, 19], [cx, cy, 113], r, [0.2, 0.4, 0.6, 0.8], 'ed2')
    b.cylZ(cx, cy, 113, r, 5, 'mb', r * 0.55)
    // purgeur automatique
    b.cylZ(cx, cy, 118, 3, 4, 'mm'); b.cylZ(cx, cy, 122, 4.6, 9, 'md'); b.cylZ(cx, cy, 131, 2, 3, 'mm')
    // bande colorée chaud / froid
    b.cylZ(cx, cy, 80, r + 0.5, 2, 'ma'); b.cylZ(cx, cy, 50, r + 0.5, 2, 'ma')
    buse(b, 'gh', [cx - r, cy, 94], 'x-', 14, p.dn, 'eau_chaude_aller')
    buse(b, 'gb', [cx - r, cy, 30], 'x-', 14, p.dn, 'eau_chaude_retour')
    buse(b, 'dh', [cx + r, cy, 94], 'x+', 14, p.dn, 'eau_chaude_aller')
    buse(b, 'db', [cx + r, cy, 30], 'x+', 14, p.dn, 'eau_chaude_retour')
    b.cylY(cx, cy + r - 1, 24, 2.6, 8, 'mm')
    b.anchor('badge', [cx, cy, 148]); b.anchor('haut', [cx, cy, 134])
  },
})

enregistrer({
  id: 'cuve.double_paroi', famille: 'Stockage', nom: 'Cuve double paroi sur rétention',
  taille: () => [150, 150, 130], defauts: { fluide: 'reactif', dn: 3.4 }, planche: NIV, exemple: { seuils: exSeuils },
  dessiner(b: Builder, p: Params) {
    const id = b.uid()
    const r = 32, cx = 75, cy = 75, zl = 12
    const bund = b.raw([0, 0, 0], [150, 150, 20], (bb) => bassinSvg(bb, 6, 0, 'eau', id, 4), 'mc')
    // sondes de fuite dans la rétention
    const pr = b.box(128, 128, 4, 8, 8, 8, 'mm'); b.led([132, 132, 12], pr, 1.8)
    b.cylZ(cx, cy, 4, 36, 8, 'mm', 30)
    b.cylZ(cx, cy, zl - 4, r + 3.5, h0(), 'mm')
    const fut = b.cylZ(cx, cy, zl + 2, r + 3, 86, 'mm')
    b.cylZ(cx, cy, zl + 88, r + 3, 2, 'mm')
    // paroi intérieure visible par l'espace annulaire du toit
    const ring = b.cylZ(cx, cy, zl + 90, r - 1.5, 3, 'mb')
    b.rings(ring, [cx, cy, zl + 90], [cx, cy, zl + 93], r - 1.5, [], 'ed2')
    b.cylZ(cx, cy, zl + 93, r + 2.4, 3, 'mm')
    b.rings(fut, [cx, cy, zl + 2], [cx, cy, zl + 88], r + 3, [0.33, 0.66], 'ed2')
    jaugeZ(b, fut, cx, cy, zl + 10, zl + 80, r + 3, p.fluide)
    const mh = b.cylZ(cx + 8, cy - 6, zl + 96, 8, 4, 'mm'); b.pl('xy', zl + 100.2, c2(cx + 8, cy - 6, 5, 'ed2'), mh)
    buse(b, 'e', [cx - r - 3, cy, zl + 60], 'x-', 16, p.dn, p.fluide)
    buse(b, 's', [cx + r + 3, cy, zl + 16], 'x+', 16, p.dn, p.fluide)
    b.anchor('badge', [cx, cy, zl + 118]); b.anchor('haut', [cx, cy, zl + 100]); void bund
    function h0() { return 1.8 }
  },
})

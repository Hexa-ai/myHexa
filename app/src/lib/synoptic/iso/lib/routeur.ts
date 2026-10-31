// Routeur orthogonal 3D : chemin en segments x/y/z, nombre de coudes minimal, contournement des boîtes, ponts aux croisements.
import type { V3, BBox } from './geom'
import { add, sub, mul, len, unit, dot } from './geom'
import { rayonCoude, EPAIS_BRIDE } from './reseau'

export interface Obstacle { id?: string; bb: BBox }
export interface Seg { a: V3; b: V3; r: number; lien?: string }
export interface PortRoute { pos: V3; dir: V3; r: number; obstacle?: number /** index dans obstacles à ignorer sur la 1re/dernière branche */ }
export interface RouteOpts {
  r: number
  obstacles: Obstacle[]
  segments?: Seg[]            // tuyaux déjà posés (croisement → pont, parallèle → interdit)
  via?: V3[]
  marge?: number
  /** pénalité de coude (px équivalents) */
  coude?: number
  /** longueur de sortie mini imposée (sinon calculée) */
  sortieA?: number; sortieB?: number
  zMin?: number
  /** indices d'obstacles à toujours prendre en compte (nouvelle tentative après collision) */
  inclure?: number[]
}
export interface Route { pts: V3[]; ok: boolean; coudes: number; croisements: { seg: Seg; at: V3 }[]; collisions: Hit[] }
export interface Hit { segment: number; obstacle: number }

const DIRS: V3[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]
const dIdx = (d: V3): number => DIRS.findIndex((q) => q[0] === d[0] && q[1] === d[1] && q[2] === d[2])
const snapDir = (d: V3): V3 => { const k = [0, 1, 2].reduce((m, i) => Math.abs(d[i]) > Math.abs(d[m]) ? i : m, 0); const o: V3 = [0, 0, 0]; o[k] = d[k] >= 0 ? 1 : -1; return o }

function uniq(a: number[]): number[] {
  const s = [...a].sort((x, y) => x - y)
  const o: number[] = []
  for (const v of s) if (!o.length || v - o[o.length - 1] > 0.5) o.push(v)
  return o
}

/** distance mini entre deux segments (3D) */
export function distSeg(p1: V3, q1: V3, p2: V3, q2: V3): number {
  const d1 = sub(q1, p1), d2 = sub(q2, p2), r = sub(p1, p2)
  const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r)
  const cl = (x: number) => Math.max(0, Math.min(1, x))
  let s: number, t: number
  if (a < 1e-9 && e < 1e-9) { s = t = 0 }
  else if (a < 1e-9) { s = 0; t = cl(f / e) }
  else {
    const c = dot(d1, r)
    if (e < 1e-9) { t = 0; s = cl(-c / a) }
    else {
      const b = dot(d1, d2), den = a * e - b * b
      s = den > 1e-9 ? cl((b * f - c * e) / den) : 0
      t = (b * s + f) / e
      if (t < 0) { t = 0; s = cl(-c / a) } else if (t > 1) { t = 1; s = cl((b - c) / a) }
    }
  }
  const c1 = add(p1, mul(d1, s)), c2 = add(p2, mul(d2, t))
  return len(sub(c1, c2))
}

/** ce segment (axe) franchit-il le segment s à l'intérieur, en perpendiculaire, au même niveau ? */
export function croise(p: V3, q: V3, s: Seg, rr: number): V3 | null {
  const d1 = unit(sub(q, p)), d2 = unit(sub(s.b, s.a))
  if (Math.abs(dot(d1, d2)) > 1e-6) return null
  if (Math.abs(d1[2]) > 0.5 || Math.abs(d2[2]) > 0.5) return null
  if (Math.abs(p[2] - s.a[2]) > rr + s.r + 2) return null
  // intersection en plan
  const ax = Math.abs(d1[0]) > 0.5 ? 0 : 1, ay = 1 - ax
  const X = p[ay === 1 ? 0 : 1] // coordonnée fixe de p (sur l'autre axe)
  void X
  const px = p[ay], sx = s.a[ax]
  // p varie selon ax ; s varie selon ay
  const t = (sx - p[ax]) / (q[ax] - p[ax])
  const u = (px - s.a[ay]) / (s.b[ay] - s.a[ay])
  if (!(t > 0.02 && t < 0.98 && u > 0.02 && u < 0.98)) return null
  const at: V3 = [0, 0, p[2]]
  at[ax] = sx; at[ay] = px
  return at
}

function segBoxHit(p: V3, q: V3, b: BBox): boolean {
  // segment axis-aligned vs boîte ouverte
  const lo: V3 = [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.min(p[2], q[2])]
  const hi: V3 = [Math.max(p[0], q[0]), Math.max(p[1], q[1]), Math.max(p[2], q[2])]
  return hi[0] > b.x0 + 1e-6 && lo[0] < b.x1 - 1e-6 && hi[1] > b.y0 + 1e-6 && lo[1] < b.y1 - 1e-6 && hi[2] > b.z0 + 1e-6 && lo[2] < b.z1 - 1e-6
}
export const inflate = (b: BBox, m: number): BBox => ({ x0: b.x0 - m, y0: b.y0 - m, z0: b.z0 - m, x1: b.x1 + m, y1: b.y1 + m, z1: b.z1 + m })

export function sortieMiniPort(r: number, rPort: number): number {
  return rayonCoude(r) + EPAIS_BRIDE + 4 + (Math.abs(r - rPort) > 0.5 ? 12 : 0)
}

/** Calcule le chemin entre deux ports. pts[0] = A.pos, pts[last] = B.pos. */
function routerCore(A: PortRoute, B: PortRoute, o: RouteOpts): Route {
  const r = o.r, R = rayonCoude(r), m = (o.marge ?? 7) + r
  const dA = snapDir(A.dir), dB = snapDir(B.dir)
  const L0A = o.sortieA ?? sortieMiniPort(r, A.r), L0B = o.sortieB ?? sortieMiniPort(r, B.r)
  const Lmin = 2 * R + 2
  const wp: V3[] = [A.pos, ...(o.via ?? []), B.pos]
  // zone utile : boîte des points clés élargie ; seuls les obstacles qui la touchent comptent (perf)
  const keys = [A.pos, B.pos, ...(o.via ?? [])]
  const zone: BBox = inflate({ x0: Math.min(...keys.map((p) => p[0])), y0: Math.min(...keys.map((p) => p[1])), z0: Math.min(...keys.map((p) => p[2])), x1: Math.max(...keys.map((p) => p[0])), y1: Math.max(...keys.map((p) => p[1])), z1: Math.max(...keys.map((p) => p[2])) }, 60 + m)
  const hitZ = (b: BBox) => b.x1 > zone.x0 && b.x0 < zone.x1 && b.y1 > zone.y0 && b.y0 < zone.y1 && b.z1 > zone.z0 && b.z0 < zone.z1
  const oi: number[] = []
  o.obstacles.forEach((x, i) => { if (hitZ(x.bb) || i === A.obstacle || i === B.obstacle || (o.inclure ?? []).includes(i)) oi.push(i) })
  const obs = oi.map((i) => inflate(o.obstacles[i].bb, m))
  const mapO = (i: number | undefined) => (i == null ? -1 : oi.indexOf(i))
  const oA = mapO(A.obstacle), oB = mapO(B.obstacle)
  const segs = (o.segments ?? []).filter((s) => hitZ({ x0: Math.min(s.a[0], s.b[0]), x1: Math.max(s.a[0], s.b[0]), y0: Math.min(s.a[1], s.b[1]), y1: Math.max(s.a[1], s.b[1]), z0: Math.min(s.a[2], s.b[2]), z1: Math.max(s.a[2], s.b[2]) }))
  const zMin = o.zMin ?? (r + 2)
  const bend = o.coude ?? 40

  // treillis
  const X: number[] = [], Y: number[] = [], Z: number[] = []
  const addP = (p: V3) => { X.push(p[0]); Y.push(p[1]); Z.push(p[2]) }
  for (const p of wp) addP(p)
  addP(add(A.pos, mul(dA, L0A))); addP(add(B.pos, mul(dB, L0B)))
  for (const b of obs) { X.push(b.x0, b.x1); Y.push(b.y0, b.y1); Z.push(b.z0, b.z1) }
  // niveaux de repli : au-dessus des obstacles proches
  const zTop = Math.max(...obs.map((b) => b.z1), A.pos[2], B.pos[2]) + 2 * R
  Z.push(zTop)
  const xs = uniq(X), ys = uniq(Y), zs = uniq(Z.filter((z) => z >= zMin - 1e-6 || true))
  const nx = xs.length, ny = ys.length, nz = zs.length
  const id = (i: number, j: number, k: number) => i + nx * (j + ny * k)
  const idx = (arr: number[], v: number) => { let b = 0, d = 1e9; for (let i = 0; i < arr.length; i++) { const e = Math.abs(arr[i] - v); if (e < d) { d = e; b = i } } return b }
  const nodePos = (n: number): V3 => { const i = n % nx, j = Math.floor(n / nx) % ny, k = Math.floor(n / (nx * ny)); return [xs[i], ys[j], zs[k]] }
  const nodeOf = (p: V3) => id(idx(xs, p[0]), idx(ys, p[1]), idx(zs, p[2]))

  const wpN = wp.map(nodeOf)
  const nVia = wp.length - 2
  const total = nx * ny * nz
  const nS = total * 6 * (nVia + 1)
  const S = (n: number, d: number, k: number) => (k * total + n) * 6 + d
  const dist = new Float64Array(nS).fill(Infinity)
  const prev = new Int32Array(nS).fill(-1)
  // file de priorité binaire
  const heap: [number, number][] = []
  const push = (c: number, s: number) => { heap.push([c, s]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break;[heap[p], heap[i]] = [heap[i], heap[p]]; i = p } }
  const pop = (): [number, number] => { const t = heap[0], l = heap.pop()!; if (heap.length) { heap[0] = l; let i = 0; for (;;) { const a = 2 * i + 1, b = a + 1; let s = i; if (a < heap.length && heap[a][0] < heap[s][0]) s = a; if (b < heap.length && heap[b][0] < heap[s][0]) s = b; if (s === i) break;[heap[s], heap[i]] = [heap[i], heap[s]]; i = s } } return t }

  const cache = new Map<number, boolean>()
  const stepBlocked = (n1: number, n2: number, ignA: boolean, ignB: boolean): boolean => {
    const key = (n1 * total + n2) * 4 + (ignA ? 1 : 0) + (ignB ? 2 : 0)
    const c = cache.get(key); if (c !== undefined) return c
    const p = nodePos(n1), q = nodePos(n2)
    let hit = false
    if (q[2] < zMin - 1e-6 && Math.abs(q[2] - p[2]) > 1e-6 && q[2] < p[2]) hit = true
    for (let i = 0; i < obs.length && !hit; i++) {
      if ((ignA && i === oA) || (ignB && i === oB)) continue
      if (segBoxHit(p, q, obs[i])) hit = true
    }
    if (!hit) for (const s of segs) {
      const dd = distSeg(p, q, s.a, s.b)
      if (dd < r + s.r + 3) { if (!croise(p, q, s, r)) { hit = true; break } }
    }
    cache.set(key, hit)
    return hit
  }
  const crossCost = (n1: number, n2: number): number => {
    let c = 0
    const p = nodePos(n1), q = nodePos(n2)
    for (const s of segs) if (croise(p, q, s, r)) c += 45
    return c
  }

  const sN = wpN[0], tN = wpN[wpN.length - 1]
  const startS = S(sN, dIdx(dA), 0)
  dist[startS] = 0
  push(0, startS)
  let best = -1
  while (heap.length) {
    const [c, s] = pop()
    if (c > dist[s]) continue
    const d = s % 6, nk = Math.floor(s / 6), n = nk % total, k = Math.floor(nk / total)
    if (n === tN && k === nVia && d === dIdx(mul(dB, -1))) { best = s; break }
    const first = s === startS
    for (let nd = 0; nd < 6; nd++) {
      if (first && nd !== dIdx(dA)) continue
      const dv = DIRS[nd], dc = DIRS[d]
      if (!first) {
        if (dv[0] === -dc[0] && dv[1] === -dc[1] && dv[2] === -dc[2]) continue
        if (nd === d && !(k > 0 && n === wpN[k])) continue // continuité droite seulement sur un point de passage
      }
      // marche le long de nd
      let cur = n, len0 = 0
      const pos0 = nodePos(n)
      for (let step = 0; step < 60; step++) {
        const p = nodePos(cur)
        const i = cur % nx, j = Math.floor(cur / nx) % ny, kk = Math.floor(cur / (nx * ny))
        const ni = i + dv[0], nj = j + dv[1], nk2 = kk + dv[2]
        if (ni < 0 || nj < 0 || nk2 < 0 || ni >= nx || nj >= ny || nk2 >= nz) break
        const nxt = id(ni, nj, nk2)
        const q = nodePos(nxt)
        // exclusion des obstacles propriétaires seulement sur l'axe du port
        const onA = nd === dIdx(dA) && onAxis(A.pos, dA, q)
        const onB = nd === dIdx(mul(dB, -1)) && onAxis(B.pos, dB, q)
        if (stepBlocked(cur, nxt, first || onA, onB)) break
        cur = nxt; len0 = len(sub(q, pos0))
        void p
        // arrivée possible en `cur`
        let nkk = k
        if (nkk < nVia && cur === wpN[nkk + 1]) nkk++
        // contraintes de longueur
        const isEnd = cur === tN && nkk === nVia && nd === dIdx(mul(dB, -1))
        const need = isEnd ? (first ? 1 : L0B) : (first ? L0A : Lmin)
        if (len0 < need - 1e-6) continue
        const cost = c + len0 + (first ? 0 : bend) + crossCost(n, cur)
        const ns = S(cur, nd, nkk)
        if (cost < dist[ns] - 1e-9) { dist[ns] = cost; prev[ns] = s; push(cost, ns) }
      }
    }
  }
  if (best < 0) {
    // repli : équerre simple
    const pts = repli(A, B, dA, dB, L0A, L0B)
    return { pts, ok: false, coudes: pts.length - 2, croisements: [], collisions: [] }
  }
  const nodes: V3[] = []
  for (let s = best; s >= 0; s = prev[s]) nodes.push(nodePos(Math.floor(s / 6) % total))
  nodes.reverse()
  nodes[0] = A.pos; nodes[nodes.length - 1] = B.pos
  const pts = simplifier(nodes)
  const cr: { seg: Seg; at: V3 }[] = []
  for (let i = 0; i < pts.length - 1; i++) for (const s of segs) { const at = croise(pts[i], pts[i + 1], s, r); if (at) cr.push({ seg: s, at }) }
  return { pts, ok: true, coudes: pts.length - 2, croisements: cr, collisions: [] }
}

/** Contrôle segment par segment contre TOUTES les boîtes (agrandies de r + marge). Les boîtes propriétaires des ports ne comptent pas sur la 1re / dernière branche. */
export function collisions(pts: V3[], obstacles: Obstacle[], r: number, o: { marge?: number; ignA?: number; ignB?: number } = {}): Hit[] {
  const m = r + (o.marge ?? 1), out: Hit[] = []
  for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < obstacles.length; k++) {
    if ((i === 0 && k === o.ignA) || (i === pts.length - 2 && k === o.ignB)) continue
    if (segBoxHit(pts[i], pts[i + 1], inflate(obstacles[k].bb, m))) out.push({ segment: i, obstacle: k })
  }
  return out
}

/** Calcule le chemin entre deux ports. pts[0] = A.pos, pts[last] = B.pos. Relance avec les boîtes oubliées si le tracé en traverse une. */
export function router(A: PortRoute, B: PortRoute, o: RouteOpts): Route {
  let inclure = [...(o.inclure ?? [])]
  let route = routerCore(A, B, { ...o, inclure })
  for (let it = 0; it < 4; it++) {
    const hits = collisions(route.pts, o.obstacles, o.r, { ignA: A.obstacle, ignB: B.obstacle })
    route.collisions = hits
    const nv = hits.map((h) => h.obstacle).filter((k) => !inclure.includes(k))
    if (!hits.length || !nv.length || !route.ok) break
    inclure = [...inclure, ...nv]
    route = routerCore(A, B, { ...o, inclure })
  }
  route.collisions = collisions(route.pts, o.obstacles, o.r, { ignA: A.obstacle, ignB: B.obstacle })
  return route
}

function onAxis(p: V3, d: V3, q: V3): boolean {
  const w = sub(q, p)
  const t = dot(w, d)
  if (t < -1e-6) return false
  return len(sub(w, mul(d, t))) < 0.6
}

function repli(A: PortRoute, B: PortRoute, dA: V3, dB: V3, L0A: number, L0B: number): V3[] {
  const a1 = add(A.pos, mul(dA, L0A)), b1 = add(B.pos, mul(dB, L0B))
  const p: V3[] = [A.pos, a1, [a1[0], a1[1], b1[2]], [b1[0], a1[1], b1[2]], b1, B.pos]
  return simplifier(p)
}

export function simplifier(P: V3[]): V3[] {
  const out: V3[] = []
  for (const p of P) {
    if (out.length && len(sub(p, out[out.length - 1])) < 1e-6) continue
    out.push(p)
    while (out.length >= 3) {
      const a = out[out.length - 3], b = out[out.length - 2], c = out[out.length - 1]
      const u = unit(sub(b, a)), v = unit(sub(c, b))
      if (len(sub(u, v)) < 1e-6) out.splice(out.length - 2, 1); else break
    }
  }
  return out
}

/** Ajoute un pont (saut en z) à chaque croisement du chemin avec un tuyau existant. */
export function ajouterPonts(pts: V3[], segs: Seg[], r: number): V3[] {
  const R = rayonCoude(r)
  let P = pts
  for (let guard = 0; guard < 6; guard++) {
    let done = true
    for (let i = 0; i < P.length - 1 && done; i++) {
      for (const s of segs) {
        const at = croise(P[i], P[i + 1], s, r)
        if (!at) continue
        const d = unit(sub(P[i + 1], P[i]))
        const hw = R + s.r + 3
        const rise = Math.max(2 * R + 2, r + s.r + 6)
        const t0 = dot(sub(at, P[i]), d), L = len(sub(P[i + 1], P[i]))
        const lowOK = (i === 0 ? true : true)
        void lowOK
        if (t0 - hw < R + 2 || L - t0 - hw < R + 2) continue
        const base = P[i][2]
        const p1 = sub(at, mul(d, hw)), p2 = add(at, mul(d, hw))
        p1[2] = base; p2[2] = base
        const lift = (p: V3): V3 => [p[0], p[1], base + rise]
        P = [...P.slice(0, i + 1), p1, lift(p1), lift(p2), p2, ...P.slice(i + 1)]
        // marquer : on évite de re-traiter ce croisement
        segs = segs.filter((q) => q !== s)
        done = false
        break
      }
    }
    if (done) break
  }
  return P
}

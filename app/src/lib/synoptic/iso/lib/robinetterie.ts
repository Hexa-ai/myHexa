/* eslint-disable */
// @ts-nocheck — catalogue de dessin (code massif copié de iso_lib, qui compile sans strictNullChecks) ; voir iso/README.md
// Robinetterie paramétrée par le DN (tous les volumes suivent le rayon visuel r) :
// quart de tour à levier (petit DN), papillon à levier / à réducteur / électrique (moyen et gros DN),
// robinet-vanne à opercule, vanne à manchon pneumatique (pinch valve), vannes à siège agro (T, L, double siège),
// clapets à battant et à boule, sélecteur automatique selon le DN.
import { enregistrer, symbole } from './registre'
import { Builder, c2, r2, l2, d2 } from './iso'
import type { Params, EtatNom } from './types'

const dn = (p: Params) => p.dn ?? 5
const T = (r: number) => 2.4 + r * 0.22
const NB = (r: number) => (r < 4.4 ? 4 : r < 8 ? 6 : r < 12 ? 8 : 12)
const ZC = (r: number) => r * 2.6 + 3
const CYF = (r: number) => r * 3

const PLTOR: [EtatNom, Valeurs?, number?][] = [['ferme'], ['ouvert'], ['defaut'], ['alarme'], ['consigne', { manuel: true }], ['inconnu'], ['ouvert', {}, 90], ['ferme', {}, 90]]
type Valeurs = Record<string, any>

function brides(b: Builder, W: number, cy: number, zc: number, r: number, rb = r * 1.9, fl?: string) {
  const t = T(r), n = NB(r)
  b.flange([0, cy, zc], 'x', rb, t, n); b.flange([W - t, cy, zc], 'x', rb, t, n)
  b.port('a', [0, cy, zc], [-1, 0, 0], { dn: r, fluide: fl as any }); b.port('b', [W, cy, zc], [1, 0, 0], { dn: r, fluide: fl as any })
  return t
}
const fleche = (x: number, z: number, s = 1) => `<g transform="translate(${x} ${z}) scale(${s})">${d2('M-6 -1.6H0V-4L6 0L0 4V1.6H-6Z', 'fa')}</g>`
const volant = (R: number, n = 4) => `<path class="fm" style="fill-rule:evenodd" d="M${R} 0A${R} ${R} 0 1 0 ${-R} 0A${R} ${R} 0 1 0 ${R} 0ZM${R * 0.84} 0A${R * 0.84} ${R * 0.84} 0 1 1 ${-R * 0.84} 0A${R * 0.84} ${R * 0.84} 0 1 1 ${R * 0.84} 0Z"/>` + Array.from({ length: n }, (_, i) => { const a = (i * Math.PI) / n; return l2(-Math.cos(a) * R, -Math.sin(a) * R, Math.cos(a) * R, Math.sin(a) * R, 'ed2') }).join('') + c2(0, 0, R * 0.2, 'fd')

// ─────────── quart de tour à boisseau, levier (petit DN)
enregistrer({
  id: 'vanne.quart_tour', famille: 'Vannes', nom: 'Vanne ¼ de tour à boisseau, levier (petit DN)',
  taille: (p) => { const r = dn(p); return [r * 7 + 6, CYF(r) * 2, ZC(r) + r * 4.6] }, defauts: { fluide: 'eau', dn: 3 }, planche: PLTOR,
  dessiner(b: Builder, p: Params) {
    const r = dn(p), W = r * 7 + 6, cy = CYF(r), zc = ZC(r), ouv = b.ouvert || b.etat === 'marche'
    const t = brides(b, W, cy, zc, r, r * 1.9, p.fluide)
    b.cylX(t, cy, zc, r * 1.15, W - 2 * t, 'mm')
    // corps de boisseau : cylindre coaxial au tube (plus de sphère mal projetée)
    const bc = b.cylX(W / 2 - r * 1.7, cy, zc, r * 1.9, r * 3.4, 'mm'); b.rings(bc, [W / 2 - r * 1.7, cy, zc], [W / 2 + r * 1.7, cy, zc], r * 1.9, [0.5], 'ed2')
    b.cylZ(W / 2, cy, zc + r * 1.6, r * 0.55, r * 1.2, 'mm')
    const base = b.cylZ(W / 2, cy, zc + r * 2.7, r * 1.1, r * 0.5, 'mm')
    const a = ouv ? 0 : -90
    b.pl('xy', zc + r * 3.2, `<g transform="translate(${W / 2} ${cy}) rotate(${a})">${d2(`M${-r * 0.4} ${-r * 0.4}H${r * 3.2}V${r * 0.4}H${-r * 0.4}Z`, 'fm')}${d2(`M${r * 3.2} ${-r * 0.55}H${r * 4.8}V${r * 0.55}H${r * 3.2}Z`, 'fa')}${c2(0, 0, r * 0.45, 'fd')}</g>`, base)
    b.anchor('badge', [W / 2, cy, zc + r * 4.8])
  },
})

// ─────────── papillon : levier cranté (moyen DN), réducteur + volant (gros DN), électrique
enregistrer({
  id: 'vanne.papillon_reducteur', famille: 'Vannes', nom: 'Vanne papillon (levier, réducteur à volant, actionneur électrique)',
  taille: (p) => { const r = dn(p); return [r * 2.6 + 8, CYF(r) * 2.2, ZC(r) + r * 6] }, defauts: { fluide: 'eau', dn: 12, variante: 'reducteur' }, variantes: ['levier', 'reducteur', 'electrique'], planche: PLTOR,
  dessiner(b: Builder, p: Params) {
    const r = dn(p), W = r * 2.6 + 8, cy = CYF(r) * 1.1, zc = ZC(r), v = p.variante ?? 'reducteur'
    const t = brides(b, W, cy, zc, r, r * 1.9, p.fluide)
    const co = b.cylX(t, cy, zc, r * 1.55, W - 2 * t, 'mm')
    b.rings(co, [t, cy, zc], [W - t, cy, zc], r * 1.55, [0.3, 0.7], 'ed2')
    const x = W / 2
    b.cylZ(x, cy, zc + r * 1.2, r * 0.5, r * 1.2, 'mm')
    const ouv = b.ouvert || b.etat === 'marche'
    if (v === 'levier') {
      const base = b.cylZ(x, cy, zc + r * 2.2, r * 1.3, r * 0.5, 'mm')
      b.pl('xy', zc + r * 2.7, `<g transform="translate(${x} ${cy})">${d2(`M${-r * 1.3} 0A${r * 1.3} ${r * 1.3} 0 0 1 0 ${-r * 1.3}L0 0Z`, 'ed2')}${[0, 22, 45, 67, 90].map((a) => `<g transform="rotate(${-a})">${l2(r * 1.0, 0, r * 1.3, 0, 'ed')}</g>`).join('')}<g transform="rotate(${ouv ? 0 : -90})">${d2(`M${-r * .5} ${-r * .4}H${r * 3.6}V${r * .4}H${-r * .5}Z`, 'fm')}${d2(`M${r * 3.6} ${-r * .55}H${r * 5}V${r * .55}H${r * 3.6}Z`, 'fa')}${c2(0, 0, r * .4, 'fd')}</g></g>`, base)
      b.anchor('badge', [x, cy, zc + r * 4.5])
    } else {
      const bw = r * 2.6
      const gb = b.box(x - bw / 2, cy - bw / 2, zc + r * 2.4, bw, bw, r * 1.8, 'mb')
      b.pl('xz', cy + bw / 2 + 0.05, `<g transform="translate(${x} ${zc + r * 3.3})">${r2(-bw * 0.4, -r * 0.5, bw * 0.8, r, 'ed2', 1)}${l2(-bw * 0.2, 0, bw * 0.2, 0, 'ed')}</g>`, gb)
      b.led([x + bw / 2 - 2, cy - bw / 2, zc + r * 4.0], gb, Math.max(1.4, r * 0.18))
      if (v === 'reducteur') {
        // arbre d'entrée côté +y, volant dans le plan xz
        b.cylY(x, cy + bw / 2, zc + r * 3.3, r * 0.3, r * 1.2, 'mm')
        const hw = b.cylY(x, cy + bw / 2 + r * 1.2, zc + r * 3.3, r * 0.45, r * 0.5, 'mm')
        b.pl('xz', cy + bw / 2 + r * 1.75, `<g transform="translate(${x} ${zc + r * 3.3})">${volant(r * 2.3, 4)}</g>`, hw)
        b.cylZ(x, cy, zc + r * 4.2, r * 0.7, r * 0.9, 'mm')
        b.pl('xy', zc + r * 5.1, `<g transform="translate(${x} ${cy})"><g transform="rotate(${ouv ? 0 : 90})">${l2(-r * 0.6, 0, r * 0.6, 0, 'stk')}</g></g>`)
      } else {
        // actionneur électrique : gros boîtier moteur sur le côté, capot et indicateur
        const mo = b.cylY(x, cy + bw / 2, zc + r * 3.3, r * 1.15, r * 2.6, 'md')
        b.rings(mo, [x, cy + bw / 2, zc + r * 3.3], [x, cy + bw / 2 + r * 2.6, zc + r * 3.3], r * 1.15, [0.33, 0.66])
        b.cylY(x, cy + bw / 2 + r * 2.6, zc + r * 3.3, r * 0.9, r * 0.5, 'mm')
        const dome = b.cylZ(x, cy, zc + r * 4.2, r * 0.9, r * 0.5, 'mm')
        b.pl('xy', zc + r * 4.7, `<g transform="translate(${x} ${cy})"><g transform="rotate(${ouv ? 0 : 90})">${l2(-r * 0.7, 0, r * 0.7, 0, 'stk')}</g></g>`, dome)
        b.box(x - bw / 2 - r * 0.2, cy - bw * 0.15, zc + r * 3.0, r * 0.5, bw * 0.3, r * 0.8, 'mk')
      }
      b.anchor('badge', [x, cy, zc + r * 5.6])
    }
  },
})

// ─────────── robinet-vanne à opercule, tige montante, volant
enregistrer({
  id: 'vanne.opercule', famille: 'Vannes', nom: 'Robinet-vanne à opercule (volant, tige montante)',
  taille: (p) => { const r = dn(p); return [r * 4 + 10, CYF(r) * 2, ZC(r) + r * 9] }, defauts: { fluide: 'eau', dn: 10 }, planche: PLTOR,
  dessiner(b: Builder, p: Params) {
    const r = dn(p), W = r * 4 + 10, cy = CYF(r), zc = ZC(r), x = W / 2
    const t = brides(b, W, cy, zc, r, r * 1.9, p.fluide)
    b.cylX(t, cy, zc, r * 1.25, W - 2 * t, 'mm')
    const bd = b.cylZ(x, cy, zc - r * 1.5, r * 1.8, r * 3.8, 'mm')
    b.rings(bd, [x, cy, zc - r * 1.5], [x, cy, zc + r * 2.3], r * 1.8, [0.5], 'ed2')
    b.flange([x, cy, zc + r * 2.3], 'z', r * 2.3, T(r) * 0.8, NB(r))
    const hY = r * 5.2, h = (b.pos / 100) * r * 2.2
    b.cylZ(x - r * 1.4, cy, zc + r * 2.9, r * 0.32, hY, 'mm'); b.cylZ(x + r * 1.4, cy, zc + r * 2.9, r * 0.32, hY, 'mm')
    b.box(x - r * 1.8, cy - r * 0.45, zc + r * 2.9 + hY, r * 3.6, r * 0.9, r * 0.5, 'mm')
    b.cylZ(x, cy, zc + r * 2.9, r * 0.26, hY + r * 0.5 + h, 'mm')
    const hub = b.cylZ(x, cy, zc + r * 3.4 + hY + h, r * 0.5, r * 0.6, 'mm')
    b.pl('xy', zc + r * 4.0 + hY + h, `<g transform="translate(${x} ${cy})">${volant(r * 2.1, 4)}</g>`, hub)
    b.anchor('badge', [x, cy, zc + r * 9])
  },
})

// ─────────── vanne à manchon pneumatique (pinch valve)
enregistrer({
  id: 'vanne.manchon', famille: 'Vannes', nom: 'Vanne à manchon pneumatique (pinch valve)',
  taille: (p) => { const r = dn(p); return [r * 6.5 + 8, CYF(r) * 2, ZC(r) + r * 3.4] }, defauts: { fluide: 'boues', dn: 7 },
  planche: [['ouvert'], ['ferme'], ['modulant', { position: 50 }], ['defaut'], ['consigne', { manuel: true }], ['inconnu'], ['ouvert', {}, 90], ['ferme', {}, 90]],
  dessiner(b: Builder, p: Params) {
    const r = dn(p), W = r * 6.5 + 8, cy = CYF(r), zc = ZC(r), x = W / 2
    const t = brides(b, W, cy, zc, r, r * 2.15, p.fluide)
    const rc = r * 1.7
    // corps cylindrique unique, coaxial aux deux brides ; une seule bague de calandre au milieu
    const co = b.cylX(t, cy, zc, rc, W - 2 * t, 'mm')
    b.rings(co, [t, cy, zc], [W - t, cy, zc], rc, [0.5], 'ed2')
    // raccord d'air comprimé sur le dessus (chambre de commande du manchon)
    b.cylZ(x, cy, zc + rc - 1, r * 0.45, r * 0.9, 'mm')
    b.cylZ(x, cy, zc + rc + r * 0.7, r * 0.7, r * 0.5, 'mm')
    b.port('air', [x, cy, zc + rc + r * 1.2], [0, 0, 1], { dn: Math.max(1.4, r * 0.3), fluide: 'air_comprime' })
    b.anchor('badge', [x, cy, zc + rc + r * 2.2])
  },
})

// ─────────── vannes à siège pneumatique, agroalimentaire (inox, clamp)
function clamp(b: Builder, x: number, cy: number, zc: number, r: number, dir: 1 | -1) {
  const rr = r * 1.55
  b.cylX(x, cy, zc, rr, 2.2 * dir, 'mm', r * 1.25)
  b.cylX(x + 2.2 * dir, cy, zc, r * 1.75, 2.4 * dir, 'mm')
}
function actionneurAgro(b: Builder, x: number, cy: number, z: number, r: number, o: { double?: boolean } = {}): number {
  const ra = r * 1.75
  const lan = b.cylZ(x, cy, z, r * 0.9, r * 1.6, 'mm')
  b.rings(lan, [x, cy, z], [x, cy, z + r * 1.6], r * 0.9, [0.5])
  let zz = z + r * 1.6
  const ac = b.cylZ(x, cy, zz, ra, r * 4.2, 'mm')
  b.rings(ac, [x, cy, zz], [x, cy, zz + r * 4.2], ra, [0.5], 'ed2')
  zz += r * 4.2
  if (o.double) {
    const a2 = b.cylZ(x, cy, zz, ra * 0.8, r * 2.6, 'mm')
    b.rings(a2, [x, cy, zz], [x, cy, zz + r * 2.6], ra * 0.8, [0.5], 'ed2')
    zz += r * 2.6
  }
  b.cylZ(x, cy, zz, ra * 0.95, r * 0.5, 'mm')
  zz += r * 0.5
  // tête de contrôle (indicateur de position, détecteurs, raccords d'air)
  const hd = b.cylZ(x, cy, zz, r * 1.0, r * 1.7, 'mb')
  b.led([x, cy - r * 0.8, zz + r * 1.0], hd, Math.max(1.3, r * 0.2))
  const cap = b.cylZ(x, cy, zz + r * 1.7, r * 0.85, r * 0.6, 'md')
  b.pl('xy', zz + r * 2.3, `<g transform="translate(${x} ${cy})">${c2(0, 0, r * 0.45, 'fa')}</g>`, cap)
  b.cylY(x + r * 0.8, cy + r * 0.3, zz + r * 0.8, r * 0.22, r * 1.2, 'mm')
  return zz + r * 2.3
}
enregistrer({
  id: 'vanne.siege_agro', famille: 'Vannes', nom: 'Vanne à clapet / siège pneumatique inox (T ou L, clamp, tête de contrôle)',
  taille: (p) => { const r = dn(p); return [r * 7 + 6, CYF(r) * 2 + r * 3, ZC(r) + r * 13] }, defauts: { fluide: 'reactif', dn: 4, forme: 'T' }, variantes: ['forme=T|L'], planche: PLTOR,
  dessiner(b: Builder, p: Params) {
    const r = dn(p), W = r * 7 + 6, cy = CYF(r), zc = ZC(r), x = W / 2, L = p.forme === 'L'
    const rr = r * 1.25
    const dx = L ? 0 : 1
    b.cylX(0, cy, zc, rr, (L ? x : W), 'mm')
    clamp(b, 0, cy, zc, r, 1)
    if (!L) clamp(b, W, cy, zc, r, -1)
    b.port('a', [0, cy, zc], [-1, 0, 0], { dn: r, fluide: p.fluide })
    if (!L) b.port('b', [W, cy, zc], [1, 0, 0], { dn: r, fluide: p.fluide })
    // branche perpendiculaire (côté +y)
    const bl = r * 3
    b.cylY(x, cy, zc, rr, bl + r * 1.6, 'mm')
    b.cylY(x, cy + bl + r * 1.0, zc, r * 1.55, 2.2, 'mm', r * 1.25)
    b.cylY(x, cy + bl + r * 1.0 + 2.2, zc, r * 1.75, 2.4, 'mm')
    b.port(L ? 'b' : 'c', [x, cy + bl + r * 1.0 + 4.6, zc], [0, 1, 0], { dn: r, fluide: p.fluide })
    void dx
    // corps de siège + actionneur
    b.cylZ(x, cy, zc - rr * 0.6, rr * 1.35, r * 2.2, 'mm')
    const top = actionneurAgro(b, x, cy, zc + r * 1.5, r)
    b.anchor('badge', [x, cy, top + 4])
  },
})
enregistrer({
  id: 'vanne.double_siege', famille: 'Vannes', nom: 'Vanne à double siège (mixproof) — chambre de fuite',
  taille: (p) => { const r = dn(p); return [r * 12 + 6, CYF(r) * 2 + r * 3, ZC(r) + r * 16] }, defauts: { fluide: 'reactif', dn: 4 }, planche: PLTOR,
  dessiner(b: Builder, p: Params) {
    const r = dn(p), W = r * 12 + 6, cy = CYF(r), zc = ZC(r), x = W / 2, rr = r * 1.25
    // tube traversant, brides clamp coaxiales aux deux extrémités
    b.cylX(0, cy, zc, rr, W, 'mm'); clamp(b, 0, cy, zc, r, 1); clamp(b, W, cy, zc, r, -1)
    b.port('a', [0, cy, zc], [-1, 0, 0], { dn: r, fluide: p.fluide }); b.port('b', [W, cy, zc], [1, 0, 0], { dn: r, fluide: p.fluide })
    // deux corps de siège cylindriques de part et d'autre de la chambre de fuite, reliés par un étrier
    const hh = r * 1.9, hz = hh * 2
    for (const dx of [-r * 2.6, r * 2.6]) { const c = b.cylZ(x + dx, cy, zc - hh, hh, hz, 'mm'); b.rings(c, [x + dx, cy, zc - hh], [x + dx, cy, zc + hh], hh, [0.5], 'ed2') }
    b.box(x - r * 2.6, cy - r * 0.9, zc + hh - 0.5, r * 5.2, r * 1.8, r * 1.1, 'mm')
    // évent de la chambre de fuite : piquage vers le spectateur, au milieu
    b.cylY(x, cy, zc - r * 0.2, r * 0.5, r * 3.4, 'mm')
    b.cylY(x, cy + r * 3.4, zc - r * 0.2, r * 0.85, 2, 'mb')
    const top = actionneurAgro(b, x, cy, zc + hh + r * 0.6, r * 1.1, { double: true })
    b.anchor('badge', [x, cy, top + 4])
  },
})

// ─────────── clapets
function corpsClapet(b: Builder, W: number, cy: number, zc: number, r: number, fl: any) {
  const t = brides(b, W, cy, zc, r, r * 1.9, fl)
  return t
}
enregistrer({
  id: 'vanne.clapet_battant', famille: 'Vannes', nom: 'Clapet de non-retour à battant (couvercle boulonné)',
  taille: (p) => { const r = dn(p); return [r * 6 + 8, CYF(r) * 2, ZC(r) + r * 3] }, defauts: { fluide: 'eau', dn: 7 }, planche: [['ouvert'], ['ferme'], ['defaut'], ['inconnu'], ['ouvert', {}, 90], ['ferme', {}, 90]],
  dessiner(b: Builder, p: Params) {
    const r = dn(p), W = r * 6 + 8, cy = CYF(r), zc = ZC(r), x = W * 0.5
    const t = corpsClapet(b, W, cy, zc, r, p.fluide)
    const co = b.cylX(t, cy, zc, r * 1.5, W - 2 * t, 'mm')
    b.rings(co, [t, cy, zc], [W - t, cy, zc], r * 1.5, [0.5], 'ed2')
    b.cylZ(x, cy, zc + r * 1.0, r * 1.9, r * 1.0, 'mm')
    b.flange([x, cy, zc + r * 2.0], 'z', r * 2.0, T(r) * 0.8, NB(r))
    b.cylZ(x, cy, zc + r * 2.0 + T(r) * 0.8, r * 0.5, r * 0.5, 'mm')
    b.pl('xz', cy + r * 1.5 + 0.05, fleche(x, zc - r * 0.2, Math.max(0.8, r / 6)), co)
    b.anchor('badge', [x, cy, zc + r * 3.8])
  },
})
enregistrer({
  id: 'vanne.clapet_boule', famille: 'Vannes', nom: 'Clapet à boule (eaux usées, bulbe de loge)',
  taille: (p) => { const r = dn(p); return [r * 6 + 8, CYF(r) * 2, ZC(r) + r * 3.6] }, defauts: { fluide: 'boues', dn: 7 }, planche: [['ouvert'], ['ferme'], ['defaut'], ['inconnu'], ['ouvert', {}, 90], ['ferme', {}, 90]],
  dessiner(b: Builder, p: Params) {
    const r = dn(p), W = r * 6 + 8, cy = CYF(r), zc = ZC(r), x = W * 0.5
    const t = corpsClapet(b, W, cy, zc, r, p.fluide)
    b.cylX(t, cy, zc, r * 1.3, W - 2 * t, 'mm')
    // loge de la boule : cylindre vertical (comme le clapet à battant), couvercle boulonné sur le dessus
    const bl = b.cylZ(x, cy, zc, r * 1.9, r * 2.0, 'mm')
    b.rings(bl, [x, cy, zc], [x, cy, zc + r * 2.0], r * 1.9, [0.5], 'ed2')
    b.flange([x, cy, zc + r * 2.0], 'z', r * 1.9, T(r) * 0.8, NB(r))
    b.pl('xz', cy + r * 1.9 + 0.05, fleche(x, zc + r * 0.9, Math.max(0.8, r / 6)), bl)
    b.anchor('badge', [x, cy, zc + r * 3.4])
  },
})

// ─────────── sélecteur automatique selon le DN : petit = ¼ de tour à levier, moyen = papillon à levier, gros = papillon à réducteur
enregistrer({
  id: 'vanne.auto', famille: 'Vannes', nom: 'Vanne adaptée au DN (levier / papillon / réducteur)',
  taille: (p) => symbole(choix(dn(p))).taille({ ...p, ...paramsAuto(dn(p), p) }), defauts: { fluide: 'eau', dn: 5 }, planche: PLTOR,
  dessiner(b: Builder, p: Params) { const id = choix(dn(p)); symbole(id).dessiner(b, { ...symbole(id).defauts, ...p, ...paramsAuto(dn(p), p) }) },
})
const choix = (r: number) => (r <= 4.6 ? 'vanne.quart_tour' : 'vanne.papillon_reducteur')
const paramsAuto = (r: number, p: Params) => (r <= 4.6 ? {} : { variante: p.variante ?? (r <= 10 ? 'levier' : 'reducteur') })

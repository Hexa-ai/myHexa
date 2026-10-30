/* eslint-disable */
// @ts-nocheck
// Dessin SVG de la famille CVC (bandeau de CTA et lignes hydrauliques). Plat, trait fin régulier, couleurs uniquement par classes CSS
// (variables du thème : voir synoptique.css, section « CVC »). Chaque module est dessiné dans son repère local (cellule w × 160) ;
// l'étage d'extraction d'une CTA est dessiné en miroir (l'air y va de droite à gauche), les textes sont posés hors du miroir.
import {
  GAINE, HAUTEUR_ETAGE, HYDRO, MARGE_COLLECTEUR, MODULES_CTA, MODULES_HYDRO, UNITES_SLOT,
  airBas, airHaut, disposerCta, disposerHydro, enMarche, etatModule, libelleModule, modulesDe, positionModule,
} from './cvc-modele'

const AXE = GAINE.axe

/** décimales par grandeur */
const DEC = { temperature: 1, entree_t: 1, sortie_t: 1, puissance: 1, energie: 0, humidite: 0, co2: 0, pression: 0, debit: 0, dp: 0, position: 0, vitesse: 0, frequence: 0 }
export function texteValeur(type, base, x, fr) {
  let u = UNITES_SLOT[base] || ''
  let d = DEC[base] ?? 1
  if (type === 'hydro') {
    if (base === 'pression') { u = 'bar'; d = 1 }
    if (base === 'dp') { u = 'kPa'; d = 1 }
    if (base === 'debit') d = 1
  }
  if (base === 'energie') { u = ''; d = 0 }   // l'unité (kWh) est dans le pictogramme du compteur
  return fr(x, d) + (u ? ' ' + u : '')
}

/** nom sur une ou deux lignes (coupé aux espaces) : renvoie les lignes ; au-delà de deux lignes la seconde est tronquée */
function lignesNom(t, w) {
  const n = Math.max(6, Math.floor(w / 5.2)), mots = String(t).split(/\s+/).filter(Boolean), l = []
  let cur = ''
  for (const mot of mots) { if ((cur + ' ' + mot).trim().length > n && cur) { l.push(cur); cur = mot } else cur = (cur + ' ' + mot).trim() }
  if (cur) l.push(cur)
  const cut = (x) => (x.length > n ? x.slice(0, n - 1) + '…' : x)
  return l.length <= 1 ? l.map(cut) : [cut(l[0]), cut(l.slice(1).join(' '))]
}
function nomSvg(s, t, x, w, cls, dy = 0) {
  const ls = lignesNom(t, w)
  return ls.map((l, i) => s('text', { x, y: dy + (ls.length > 1 ? 146 : 150) + i * 11, class: cls || 'cv-nom', text: l }))
}

/** rotation d'une pale autour de son axe (l'attribut transform est recalculé à chaque redessin) */
const rot = (a, x, y) => `rotate(${a} ${x} ${y})`

/* ---------------------------------------------------------------- CTA : modules (repère local, air de gauche à droite) */
function flecheAir(s, x0, x1, air) {
  const xm = x0 + (x1 - x0) * 0.5
  return s('path', { d: `M${x0} ${AXE - 8} H${xm} V${AXE - 20} L${x1} ${AXE} L${xm} ${AXE + 20} V${AXE + 8} H${x0} Z`, class: 'cv-fleche a-' + air })
}
function louvres(s, x, ouvert) {   // cadre de prise ou de rejet : montants + quelques lames
  const o = [s('line', { x1: x, x2: x, y1: GAINE.haut + 4, y2: GAINE.bas - 4, class: 'cv-trait' })]
  for (let y = 44; y <= 116; y += 18) o.push(s('line', { x1: x - 5, x2: x + 5, y1: y + 3, y2: y - 3, class: 'cv-trait fin' }))
  return o
}

const CTA = {
  air_neuf: (s, c) => [flecheAir(s, 10, 50, c.air), ...louvres(s, 6)],
  reprise: (s, c) => [flecheAir(s, 10, 50, c.air), ...louvres(s, 6)],
  soufflage: (s, c) => [flecheAir(s, 8, 48, c.air), ...louvres(s, c.w - 6)],
  rejet: (s, c) => [flecheAir(s, 8, 48, c.air), ...louvres(s, c.w - 6)],
  gaine: () => [],
  registre: (s, c) => {
    const p = c.pos
    const a = p == null ? 45 : 90 * (1 - p / 100)
    const o = []
    for (let i = 0; i < 5; i++) {
      const cy = 40 + 20 * i
      o.push(s('line', { x1: 19, x2: 41, y1: cy, y2: cy, transform: rot(a, 30, cy), class: 'cv-trait cv-act cv-lame' }), s('circle', { cx: 30, cy, r: 1.6, class: 'cv-pivot' }))
    }
    o.push(s('circle', { cx: 49, cy: 40, r: 7, class: 'cv-corps' }))
    o.fixe = [['M', 49, 40.5, 'cv-lettre']]
    return o
  },
  filtre_plan: (s, c) => {
    const o = [s('rect', { x: 22, y: 34, width: 16, height: 92, class: 'cv-corps' })]
    for (let y = 36; y <= 112; y += 14) o.push(s('line', { x1: 22, x2: 38, y1: y + 14, y2: y, class: 'cv-trait fin' }))
    return o
  },
  filtre_poches: (s, c) => {
    const o = [s('line', { x1: 14, x2: 14, y1: 34, y2: 126, class: 'cv-trait' })]
    for (const y of [50, 80, 110]) o.push(s('path', { d: `M14 ${y - 14} L104 ${y} L14 ${y + 14} Z`, class: 'cv-corps' }))
    return o
  },
  batterie_chaude: (s, c) => batterie(s, c, 'chaude'),
  batterie_froide: (s, c) => batterie(s, c, 'froide'),
  batterie_elec: (s, c) => {
    const o = [s('rect', { x: 14, y: 36, width: 32, height: 88, rx: 3, class: 'cv-corps' })]
    for (const y of [52, 80, 108]) o.push(s('path', { d: `M18 ${y} h4 l3 -7 l6 14 l6 -14 l6 14 l3 -7 h4`, class: 'cv-trait cv-chaud' + (c.etat === 'arret' ? ' off' : '') }))
    return o
  },
  humidificateur: (s, c) => {
    const o = []
    for (const [i, x] of [[0, 17], [1, 30], [2, 43]]) {
      o.push(s('line', { x1: x, x2: x, y1: 32, y2: 58, class: 'cv-trait' }), s('path', { d: `M${x - 3} 58 h6 l-3 5 Z`, class: 'cv-corps' }))
      for (const [j, dy] of [[0, 72], [1, 88], [2, 104]]) o.push(s('circle', { cx: x + ((i + j) % 2 ? 3 : -3), cy: dy, r: 2.6, class: 'cv-goutte cv-eau-r', style: `animation-delay:${((i * 3 + j) * 0.23).toFixed(2)}s` }))
    }
    return o
  },
  piege_son: (s) => {
    const o = []
    for (const x of [20, 52, 84]) {
      o.push(s('rect', { x, y: 34, width: 16, height: 92, rx: 3, class: 'cv-corps' }))
      for (let y = 46; y < 124; y += 12) o.push(s('line', { x1: x + 4, x2: x + 12, y1: y, y2: y, class: 'cv-trait fin' }))
    }
    return o
  },
  ventilateur: (s, c) => {
    const o = [s('circle', { cx: 30, cy: AXE, r: 26, class: 'cv-corps' })]
    const pales = []
    for (let i = 0; i < 6; i++) pales.push(s('path', { d: 'M30 80 C 40 76 42 64 31 55', transform: rot(i * 60, 30, AXE), class: 'cv-trait cv-act' }))
    const rotor = s('g', { class: 'cv-rotor', style: c.dureeRotor ? `animation-duration:${c.dureeRotor}s` : null }, s('circle', { cx: 30, cy: AXE, r: 24, class: 'cv-cadre' }), ...pales, s('circle', { cx: 30, cy: AXE, r: 4, class: 'cv-corps cv-act' }))
    o.push(rotor)
    return o
  },
  sonde: (s, c) => [s('line', { x1: 30, x2: 30, y1: GAINE.haut, y2: 66, class: 'cv-trait' }), s('circle', { cx: 30, cy: 70, r: 4.5, class: 'cv-corps cv-act' })],
}

function batterie(s, c, genre) {
  const cls = genre === 'chaude' ? 'cv-chaud' : 'cv-froid'
  const inactif = c.etat === 'ferme' || c.etat === 'inconnu'
  const op = c.pos == null ? 1 : 0.35 + 0.65 * (c.pos / 100)
  const o = [s('rect', { x: 14, y: 36, width: 32, height: 88, rx: 3, class: 'cv-corps' })]
  let d = 'M18 40'
  for (let i = 0; i < 6; i++) d += ` L${i % 2 ? 18 : 42} ${40 + (i + 1) * 14}`
  o.push(s('path', { d, class: `cv-trait ${cls}${inactif ? ' off' : ''}`, style: inactif ? null : `opacity:${op.toFixed(2)}` }))
  // piquages eau en bas : retour à gauche, aller à droite avec sa petite vanne
  o.push(s('line', { x1: 22, x2: 22, y1: GAINE.bas, y2: 140, class: 'cv-eau-r-t' }), s('line', { x1: 38, x2: 38, y1: GAINE.bas, y2: 140, class: 'cv-eau-a-t' }))
  o.push(s('path', { d: 'M34 131 L42 131 L34 138 L42 138 Z', class: 'cv-trait cv-act' }))
  return o
}

/** module double 120×320 : repère local, étage haut y 0..160, étage bas y 160..320 */
const DOUBLE = {
  recup_plaques: (s, c) => {
    const o = [s('path', { d: 'M60 46 L106 160 L60 274 L14 160 Z', class: 'cv-corps' })]
    // plaques : lignes parallèles à l'arête haut → droite
    for (let i = 1; i < 8; i++) {
      const t = i / 8
      o.push(s('line', { x1: 14 + t * 46, y1: 160 - t * 114, x2: 60 + t * 46, y2: 274 - t * 114, class: 'cv-trait fin' }))
    }
    o.push(s('path', { d: 'M60 46 L106 160 L60 274 L14 160 Z', class: 'cv-trait cv-act' }))
    return o
  },
  recup_roue: (s, c) => {
    const o = [s('circle', { cx: 60, cy: 160, r: 54, class: 'cv-corps' })]
    const rayons = []
    for (let i = 0; i < 12; i++) rayons.push(s('line', { x1: 60, y1: 160, x2: 60, y2: 110, transform: rot(i * 30, 60, 160), class: 'cv-trait fin cv-act' }))
    const dureeStyle = c.dureeRotor ? `animation-duration:${c.dureeRotor * 3}s` : null
    o.push(s('g', { class: 'cv-rotor', style: dureeStyle }, s('circle', { cx: 60, cy: 160, r: 54, class: 'cv-cadre' }), ...rayons, s('circle', { cx: 60, cy: 160, r: 41, class: 'cv-trait cv-act', 'stroke-dasharray': '4 6' })))
    o.push(s('circle', { cx: 60, cy: 160, r: 54, class: 'cv-trait cv-act' }), s('circle', { cx: 60, cy: 160, r: 8, class: 'cv-corps cv-act' }))
    return o
  },
  caisson_melange: (s, c) => {
    const p = c.pos
    const a = p == null ? 45 : 90 * (p / 100)
    const o = [s('rect', { x: 28, y: 104, width: 64, height: 112, rx: 3, class: 'cv-corps' })]
    for (let i = 0; i < 5; i++) { const cy = 120 + 20 * i; o.push(s('line', { x1: 36, x2: 84, y1: cy, y2: cy, transform: rot(a, 60, cy), class: 'cv-trait cv-act cv-lame' }), s('circle', { cx: 60, cy, r: 1.6, class: 'cv-pivot' })) }
    o.push(s('circle', { cx: 104, cy: 160, r: 7, class: 'cv-corps' }))
    o.fixe = [['M', 104, 160.5, 'cv-lettre']]
    return o
  },
}

/** nom d'un type d'air → classe de fluide */
const airCls = (a) => 'a-' + a

/** étiquettes d'un module : valeurs au-dessus de la gaine (2 au plus), nom en dessous */
function etiquettesCta(s, m, def, w, off, c) {
  const o = []
  const vs = []
  const cand = ['air_neuf', 'reprise', 'soufflage', 'rejet', 'sonde'].includes(m.k) ? def.slots : def.mesures
  for (const b of cand) { const x = c.lire(m.id, b); if (x != null && vs.length < 2) vs.push(texteValeur('cta', b, x, c.fr)) }
  const aucun = def.mesures.length && !vs.length
  if (vs[0]) o.push(s('text', { x: w / 2, y: off + 23, class: 'cv-v1', text: vs[0] }))
  if (vs[1]) o.push(s('text', { x: w / 2, y: off + 10, class: 'cv-v2', text: vs[1] }))
  else if (aucun && c.etat === 'inconnu') { /* rien : pas de valeur reçue */ }
  const nom = libelleModule(m, 'cta')
  if (nom) o.push(...nomSvg(s, nom, w / 2, w))
  return o
}

function pastille(s, x, y) {
  return s('g', { class: 'cv-pastille' }, s('circle', { cx: x, cy: y, r: 7 }), s('text', { x, y: y + 0.5, text: '!' }))
}

/**
 * Dessin d'une CTA. ctx = { lire(idModule, base), fr(x, d), uid, edition }.
 * Retourne { corps, box, ports, h, w } : `corps` est ajouté au groupe du nœud (repère = coin haut-gauche du nœud).
 */
export function dessinerCta(s, params, ctx) {
  const g = disposerCta(params)
  const places = modulesDe('cta', params)
  const lire = ctx.lire
  const marcheGlobale = enMarche(places, lire)
  const corps = []
  const defs = MODULES_CTA
  const etage = (haut, off, cell, m, air) => {
    const def = defs[m.k]
    const gr = s('g', { class: 'cv-mod', 'data-mod': m.id, transform: `translate(${cell.x} ${off})` })
    const etat = etatModule(m, lire)
    gr.classList.add('m-' + etat)
    const w = cell.w
    // gaine de fond sur toute la largeur de la colonne
    gr.append(s('rect', { x: 0, y: GAINE.haut, width: w, height: GAINE.bas - GAINE.haut, class: 'cv-gaine' }))
    const ventiles = marcheGlobale
    gr.append(s('line', { x1: 3, x2: w - 3, y1: AXE, y2: AXE, class: `cv-flux ${airCls(air)}${ventiles ? ' actif' : ''}`, style: haut ? 'transform:scaleX(-1);transform-box:fill-box;transform-origin:center' : null }))
    const mw = def.w
    const ox = (w - mw) / 2
    const dessin = CTA[m.k]
    if (dessin) {
      const c = { w: mw, air, etat, pos: positionModule(m.id, lire), lire, dureeRotor: dureeRotor(m, lire) }
      const els = dessin(s, c)
      const mir = s('g', { transform: haut ? `translate(${ox + mw} 0) scale(-1 1)` : `translate(${ox} 0)` })
      els.forEach((e) => mir.append(e))
      gr.append(mir)
      ;(els.fixe || []).forEach(([t, x, y, cls]) => gr.append(s('text', { x: haut ? ox + mw - x : ox + x, y, class: cls, text: t })))
    }
    etiquettesCta(s, m, def, w, 0, { lire, fr: ctx.fr, etat }).forEach((e) => gr.append(e))
    if (etat === 'defaut') gr.append(pastille(s, w - 9, 140))
    corps.push(gr)
  }
  g.cellules.forEach((cell) => {
    if (cell.double) {
      const m = cell.double
      const def = defs[m.k]
      const gr = s('g', { class: 'cv-mod', 'data-mod': m.id, transform: `translate(${cell.x} 0)` })
      const etat = etatModule(m, lire)
      gr.classList.add('m-' + etat)
      const w = cell.w
      // deux gaines et le corps du module qui les relie
      gr.append(s('rect', { x: 0, y: GAINE.haut, width: w, height: GAINE.bas - GAINE.haut, class: 'cv-gaine' }), s('rect', { x: 0, y: HAUTEUR_ETAGE + GAINE.haut, width: w, height: GAINE.bas - GAINE.haut, class: 'cv-gaine' }), s('rect', { x: 0, y: GAINE.bas - 1, width: w, height: 2 * HAUTEUR_ETAGE - 2 * GAINE.haut - (GAINE.bas - GAINE.haut) + 2 - 0, class: 'cv-gaine', style: 'stroke:none' }))
      const corpsMod = s('rect', { x: 0, y: GAINE.haut, width: w, height: 2 * HAUTEUR_ETAGE - 2 * GAINE.haut, class: 'cv-gaine' })
      gr.append(corpsMod)
      const iAir = g.cellules.findIndex((q) => q.double)
      gr.append(s('line', { x1: 3, x2: w - 3, y1: AXE, y2: AXE, class: `cv-flux a-${m.air_haut || 'rejete'}${marcheGlobale ? ' actif' : ''}`, style: 'transform:scaleX(-1);transform-box:fill-box;transform-origin:center' }))
      gr.append(s('line', { x1: 3, x2: w - 3, y1: HAUTEUR_ETAGE + AXE, y2: HAUTEUR_ETAGE + AXE, class: `cv-flux a-${m.air || 'souffle'}${marcheGlobale ? ' actif' : ''}` }))
      const dessin = DOUBLE[m.k]
      if (dessin) {
        const c = { w, etat, pos: positionModule(m.id, lire), clip: `cvc_${ctx.uid}_${m.id}`.replace(/\W/g, '_'), dureeRotor: dureeRotor(m, lire) }
        const els = dessin(s, c)
        els.forEach((e) => gr.append(e))
        ;(els.fixe || []).forEach(([t, x, y, cls]) => gr.append(s('text', { x, y, class: cls, text: t })))
      }
      // étiquettes : valeurs entre les deux étages (au centre), nom sous l'ensemble
      const vs = []
      for (const b of def.mesures) { const x = lire(m.id, b); if (x != null && vs.length < 2) vs.push(texteValeur('cta', b, x, ctx.fr)) }
      vs.forEach((t, i) => gr.append(s('text', { x: 60, y: 158 + i * 0, dy: i ? '1.15em' : 0, class: i ? 'cv-v2 centre' : 'cv-v1 centre', text: t })))
      const nom = libelleModule(m, 'cta')
      if (nom) nomSvg(s, nom, w / 2, w, null, HAUTEUR_ETAGE).forEach((e) => gr.append(e))
      if (etat === 'defaut') gr.append(pastille(s, w - 9, 2 * HAUTEUR_ETAGE - 20))
      corps.push(gr)
      return
    }
    if (g.double && cell.haut) etage(true, g.yHaut, cell, cell.haut, airHaut(g, cell))
    else if (g.double) corps.push(gaineVide(s, cell, g.yHaut, true, airHaut(g, cell), marcheGlobale))
    if (cell.bas) etage(false, g.yBas, cell, cell.bas, airBas(g, cell))
    else corps.push(gaineVide(s, cell, g.yBas, false, airBas(g, cell), marcheGlobale))
  })
  const w = Math.max(g.w, 120)
  return {
    corps,
    w: g.w,
    h: g.h,
    box: [-6, -4, g.w + 12, g.h + 8],
    ports: {
      in: { x: 0, y: g.yBas + AXE, side: 'W' },
      out: { x: g.w, y: g.yBas + AXE, side: 'E' },
      ...(g.double ? { p3: { x: g.w, y: AXE, side: 'E' }, p4: { x: 0, y: AXE, side: 'W' } } : {}),
    },
    geom: g,
  }
}

function gaineVide(s, cell, off, haut, air, actif) {
  const gr = s('g', { class: 'cv-mod m-ok', transform: `translate(${cell.x} ${off})` })
  gr.append(s('rect', { x: 0, y: GAINE.haut, width: cell.w, height: GAINE.bas - GAINE.haut, class: 'cv-gaine' }))
  gr.append(s('line', { x1: 3, x2: cell.w - 3, y1: AXE, y2: AXE, class: `cv-flux ${airCls(air)}${actif ? ' actif' : ''}`, style: haut ? 'transform:scaleX(-1);transform-box:fill-box;transform-origin:center' : null }))
  return gr
}

/** durée d'un tour de rotor selon la vitesse (0..100 %) ; null = durée par défaut */
function dureeRotor(m, lire) {
  const v = lire(m.id, 'vitesse')
  if (v == null) return null
  return +(0.5 + 2.2 * (1 - Math.max(0, Math.min(100, v)) / 100)).toFixed(2)
}

/* ---------------------------------------------------------------- hydraulique */
const bowtie = (s, x, y, k, cls) => s('path', { d: `M${x - 9 * k} ${y - 7 * k} L${x + 9 * k} ${y + 7 * k} V${y - 7 * k} L${x - 9 * k} ${y + 7 * k} Z`, class: cls || 'cv-corps cv-act' })
const tri = (s, x, y, k, sens, cls) => s('path', { d: sens > 0 ? `M${x - 8 * k} ${y - 9 * k} L${x + 10 * k} ${y} L${x - 8 * k} ${y + 9 * k} Z` : `M${x + 8 * k} ${y - 9 * k} L${x - 10 * k} ${y} L${x + 8 * k} ${y + 9 * k} Z`, class: cls || 'cv-act cv-plein' })
const yLigne = (m) => (m.ligne === 'retour' ? HYDRO.retour : HYDRO.aller)
const sensLigne = (m) => (m.ligne === 'retour' ? -1 : 1)

const HY = {
  chaudiere: (s, c) => {
    const o = [s('rect', { x: 14, y: 22, width: 92, height: 116, rx: 6, class: 'cv-corps' }), s('rect', { x: 24, y: 114, width: 72, height: 1, class: 'cv-sep' })]
    o.push(s('path', { d: 'M60 40 C 66 54 80 62 78 82 C 77 96 68 104 59 104 C 47 104 41 94 43 82 C 44 72 51 68 53 58 C 56 61 58 52 60 40 Z', class: 'cv-corps cv-act cv-flamme-f' + (c.etat === 'marche' || c.etat === 'modulant' ? ' on' : '') }))
    o.push(s('path', { d: 'M60 72 C 64 80 68 83 67 92 C 66 98 62 100 59 100 C 54 100 51 95 53 89 C 54 84 58 82 60 72 Z', class: 'cv-trait cv-act cv-flamme-i' }))
    return o
  },
  pac: (s, c) => {
    const o = [s('rect', { x: 14, y: 22, width: 92, height: 116, rx: 6, class: 'cv-corps' })]
    const pales = []
    for (let i = 0; i < 4; i++) pales.push(s('path', { d: 'M40 62 C 48 60 50 52 41 47', transform: rot(i * 90, 40, 62), class: 'cv-trait cv-act' }))
    o.push(s('circle', { cx: 40, cy: 62, r: 20, class: 'cv-trait' }), s('g', { class: 'cv-rotor' }, s('circle', { cx: 40, cy: 62, r: 18, class: 'cv-cadre' }), ...pales, s('circle', { cx: 40, cy: 62, r: 3, class: 'cv-corps cv-act' })))
    // compresseur + boucle frigorifique
    o.push(s('circle', { cx: 82, cy: 62, r: 14, class: 'cv-corps' }), s('path', { d: 'M76 69 L82 55 L88 69 Z', class: 'cv-trait cv-act' }))
    o.push(s('path', { d: 'M40 84 V100 H82 V76', class: 'cv-trait fin' }))
    return o
  },
  pompe: (s, c) => {
    const y = yLigne(c.m), sens = sensLigne(c.m)
    const o = [s('circle', { cx: 30, cy: y, r: 19, class: 'cv-corps' }), s('circle', { cx: 30, cy: y, r: 25, class: 'cv-couronne cv-act' }), tri(s, 30, y, 1, sens)]
    return o
  },
  vanne_2v: (s, c) => {
    const y = yLigne(c.m)
    return [bowtie(s, 30, y, 1.15), s('line', { x1: 30, x2: 30, y1: y, y2: y - 15, class: 'cv-trait' }), s('rect', { x: 23, y: y - 23, width: 14, height: 8, rx: 2, class: 'cv-corps' })]
  },
  vanne_3v: (s, c) => {
    const y = yLigne(c.m)
    const o = [s('line', { x1: 30, x2: 30, y1: y + 7, y2: HYDRO.retour, class: 'cv-eau-r-t' }), s('circle', { cx: 30, cy: HYDRO.retour, r: 3, class: 'cv-noeud-r' })]
    o.push(bowtie(s, 30, y, 1.15), s('path', { d: `M24 ${y + 4} L36 ${y + 4} L30 ${y + 16} Z`, class: 'cv-corps cv-act' }))
    o.push(s('line', { x1: 30, x2: 30, y1: y, y2: y - 15, class: 'cv-trait' }), s('rect', { x: 23, y: y - 23, width: 14, height: 8, rx: 2, class: 'cv-corps' }))
    return o
  },
  echangeur: (s) => {
    const o = [s('rect', { x: 20, y: 32, width: 80, height: 96, rx: 5, class: 'cv-corps' })]
    for (let x = 32; x <= 88; x += 8) o.push(s('line', { x1: x, x2: x + 8, y1: 38, y2: 122, class: 'cv-trait fin' }))
    o.push(s('rect', { x: 20, y: 32, width: 80, height: 96, rx: 5, class: 'cv-trait cv-act' }))
    return o
  },
  bouteille: (s, c) => [
    s('rect', { x: 14, y: 24, width: 32, height: 112, rx: 9, class: 'cv-corps' }),
    s('path', { d: 'M14 80 V33 a9 9 0 0 1 9 -9 h14 a9 9 0 0 1 9 9 V80 Z', class: 'cv-teinte-a' }),
    s('path', { d: 'M14 80 V127 a9 9 0 0 0 9 9 h14 a9 9 0 0 0 9 -9 V80 Z', class: 'cv-teinte-r' }),
    s('rect', { x: 14, y: 24, width: 32, height: 112, rx: 9, class: 'cv-trait cv-act' }),
  ],
  ballon_ecs: (s, c) => [
    s('rect', { x: 22, y: 18, width: 76, height: 118, rx: 14, class: 'cv-corps' }),
    s('path', { d: 'M22 80 V32 a14 14 0 0 1 14 -14 h48 a14 14 0 0 1 14 14 V80 Z', class: 'cv-teinte-a' }),
    s('path', { d: 'M22 80 V122 a14 14 0 0 0 14 14 h48 a14 14 0 0 0 14 -14 V80 Z', class: 'cv-teinte-r' }),
    s('path', { d: 'M22 50 H70 A30 30 0 0 1 70 110 H22', class: 'cv-trait cv-serpentin' }),
    s('rect', { x: 22, y: 18, width: 76, height: 118, rx: 14, class: 'cv-trait cv-act' }),
  ],
  vase: (s) => [
    s('line', { x1: 30, x2: 30, y1: HYDRO.retour, y2: 117, class: 'cv-eau-r-t' }),
    s('circle', { cx: 30, cy: 128, r: 12, class: 'cv-corps' }),
    s('path', { d: 'M18 128 a12 12 0 0 0 24 0 Z', class: 'cv-teinte-r' }),
    s('circle', { cx: 30, cy: 128, r: 12, class: 'cv-trait' }),
  ],
  pot_boue: (s, c) => {
    const y = yLigne(c.m)
    return [s('circle', { cx: 30, cy: y, r: 11, class: 'cv-corps' }), s('path', { d: `M30 ${y + 11} V${y + 17} M22 ${y + 17} h16 l-2 14 h-12 Z`, class: 'cv-trait' }), s('line', { x1: 22, x2: 38, y1: y - 6, y2: y + 6, class: 'cv-trait fin' })]
  },
  filtre: (s, c) => {
    const y = yLigne(c.m)
    const o = [s('rect', { x: 20, y: y - 11, width: 20, height: 22, rx: 3, class: 'cv-corps cv-act' }), s('path', { d: `M30 ${y + 11} V${y + 16} M23 ${y + 16} h14 l-2 10 h-10 Z`, class: 'cv-trait' })]
    for (let x = 22; x < 40; x += 6) o.push(s('line', { x1: x, x2: x + 6, y1: y + 10, y2: y - 10, class: 'cv-trait fin' }))
    return o
  },
  compteur: (s, c) => {
    const y = yLigne(c.m)
    return [s('circle', { cx: 30, cy: y, r: 16, class: 'cv-corps' }), s('circle', { cx: 30, cy: y, r: 16, class: 'cv-trait' })]
  },
  clapet: (s, c) => {
    const y = yLigne(c.m), sens = sensLigne(c.m)
    return [s('circle', { cx: 30, cy: y, r: 12, class: 'cv-corps' }), tri(s, 28, y, 0.7, sens, 'cv-trait'), s('line', { x1: 30 + sens * 7, x2: 30 + sens * 7, y1: y - 7, y2: y + 7, class: 'cv-trait' })]
  },
  isolement: (s) => {
    const o = []
    for (const y of [HYDRO.aller, HYDRO.retour]) o.push(bowtie(s, 30, y, 0.95, 'cv-corps cv-act'), s('line', { x1: 24, x2: 36, y1: y - 14, y2: y - 14, class: 'cv-trait' }), s('line', { x1: 30, x2: 30, y1: y - 14, y2: y, class: 'cv-trait' }))
    return o
  },
  depart: (s) => [
    s('path', { d: `M8 ${HYDRO.aller - 5} H34 V${HYDRO.aller - 13} L54 ${HYDRO.aller} L34 ${HYDRO.aller + 13} V${HYDRO.aller + 5} H8 Z`, class: 'cv-fleche-a' }),
    s('path', { d: `M52 ${HYDRO.retour - 5} H26 V${HYDRO.retour - 13} L6 ${HYDRO.retour} L26 ${HYDRO.retour + 13} V${HYDRO.retour + 5} H52 Z`, class: 'cv-fleche-r' }),
  ],
  sonde_t: (s, c) => {
    const y = yLigne(c.m)
    const o = [s('line', { x1: 30, x2: 30, y1: y, y2: y - 14, class: 'cv-trait' }), s('circle', { cx: 30, cy: y - 20, r: 8, class: 'cv-corps' }), s('circle', { cx: 30, cy: y, r: 3, class: 'cv-noeud' })]
    o.fixe = [['T', 30, y - 19.5, 'cv-lettre']]
    return o
  },
  tuyau: () => [],
}
HY.arrivee = HY.depart

/** ligne verticale cassée autour des croisements (petit saut) */
function barreVerticale(s, x, y0, y1, trous, cls) {
  let d = ''
  let cur = y0
  const t = trous.filter((y) => y > y0 && y < y1).sort((a, b) => a - b)
  for (const y of t) { d += `M${x} ${cur} V${y - 7} `; cur = y + 7 }
  d += `M${x} ${cur} V${y1}`
  return s('path', { d, class: cls })
}

/** étiquettes d'un module hydraulique : valeurs (au plus 2), nom */
function posValeurs(m) {
  const y = yLigne(m)
  switch (m.k) {
    case 'chaudiere': case 'pac': return [128, 112]
    case 'echangeur': return [22, 8]
    case 'bouteille': return [86, 100]
    case 'ballon_ecs': return [86, 100]
    case 'vase': return [86, 98]
    case 'depart': case 'arrivee': return [84, 98]
    case 'isolement': return [84, 98]
    case 'vanne_3v': return [y - 30, y - 43]
    default: return [y - 30, y - 43]
  }
}

/**
 * Dessin d'un bloc hydraulique. ctx = { lire, fr, uid }. Retourne { corps, w, h, box, ports }.
 */
export function dessinerHydro(s, params, ctx) {
  const g = disposerHydro(params)
  const places = modulesDe('hydro', params)
  const lire = ctx.lire
  const corps = []
  const n = g.rangees.length
  const xAller = 14, xRetour = 34
  // collecteurs verticaux : aller à gauche, retour juste à côté (cassé là où les lignes aller des autres départs le croisent)
  if (n > 1) {
    const yA0 = HYDRO.aller, yA1 = HYDRO.aller + HAUTEUR_ETAGE * (n - 1)
    const yR0 = HYDRO.retour, yR1 = HYDRO.retour + HAUTEUR_ETAGE * (n - 1)
    corps.push(barreVerticale(s, xAller, yA0, yA1, [HYDRO.retour], 'cv-eau-a-t cv-collecteur'))
    corps.push(barreVerticale(s, xRetour, yR0, yR1, Array.from({ length: n - 1 }, (_, i) => HYDRO.aller + HAUTEUR_ETAGE * (i + 1)), 'cv-eau-r-t cv-collecteur'))
    for (let i = 1; i < n; i++) corps.push(s('circle', { cx: xAller, cy: HYDRO.aller + HAUTEUR_ETAGE * i, r: 3.2, class: 'cv-noeud-a' }), s('circle', { cx: xRetour, cy: HYDRO.retour + HAUTEUR_ETAGE * i, r: 3.2, class: 'cv-noeud-r' }))
    corps.push(s('circle', { cx: xAller, cy: HYDRO.aller, r: 3.2, class: 'cv-noeud-a' }), s('circle', { cx: xRetour, cy: HYDRO.retour, r: 3.2, class: 'cv-noeud-r' }))
  }
  g.rangees.forEach((r, i) => {
    const off = r.y
    const actif = enMarche(places, lire, i)
    // la première rangée traverse le bloc de part en part (elle prolonge la production placée à gauche) ; les autres partent des collecteurs
    const x0A = n > 1 && i > 0 ? xAller : 0, x0R = n > 1 && i > 0 ? xRetour : 0
    const ligneA = (x2) => `M${x0A} ${HYDRO.aller + off} H${x2}`
    const ligneR = (x2) => `M${x2} ${HYDRO.retour + off} H${x0R}`
    const w = r.wRangee
    const rg = s('g', { class: 'cv-rangee' })
    rg.append(s('path', { d: ligneA(w), class: 'cv-eau-a-t' }), s('path', { d: ligneR(w), class: 'cv-eau-r-t' }))
    rg.append(s('path', { d: ligneA(w), class: 'cv-flux-eau a' + (actif ? ' actif' : '') }), s('path', { d: ligneR(w), class: 'cv-flux-eau r' + (actif ? ' actif' : '') }))
    corps.push(rg)
    r.cellules.forEach(({ x, w: cw, module: m }) => {
      const def = MODULES_HYDRO[m.k]
      if (!def) return
      const etat = etatModule(m, lire)
      const gr = s('g', { class: 'cv-mod m-' + etat, 'data-mod': m.id, transform: `translate(${x} ${off})` })
      const dessin = HY[m.k]
      if (dessin) {
        const c = { m, w: cw, etat, pos: positionModule(m.id, lire), lire }
        const els = dessin(s, c)
        if (m.k === 'pompe' || m.k === 'vanne_2v' || m.k === 'vanne_3v') c.ok = true
        // une pompe, une chaudière… tournent / brûlent seulement en marche (classe d'état sur le groupe)
        els.forEach((e) => gr.append(e))
        ;(els.fixe || []).forEach(([t, tx, ty, cls]) => gr.append(s('text', { x: tx, y: ty, class: cls, text: t })))
        if (m.k === 'compteur') {
          const y = yLigne(m)
          const e = lire(m.id, 'energie')
          gr.append(s('text', { x: 30, y: y + 3, class: 'cv-lettre petit', text: 'kWh' }))
        }
        if (m.k === 'vanne_3v' || m.k === 'vanne_2v') {
          const p = c.pos
          if (p != null && p > 2 && p < 98) gr.append(s('path', { d: `M24 ${yLigne(m) - 23} h${(14 * p) / 100} v8 h${-(14 * p) / 100} Z`, class: 'cv-niveau-vanne' }))
        }
      }
      // étiquettes
      const [y1, y2] = posValeurs(m)
      const vs = []
      for (const b of def.mesures) { const v = lire(m.id, b); if (v != null && vs.length < 2) vs.push(texteValeur('hydro', b, v, ctx.fr)) }
      if (vs[0]) gr.append(s('text', { x: cw / 2 - (m.k === 'chaudiere' || m.k === 'pac' || m.k === 'ballon_ecs' || m.k === 'echangeur' ? 0 : 0), y: y1, class: 'cv-v1', text: vs[0] }))
      if (vs[1]) gr.append(s('text', { x: cw / 2, y: y2, class: 'cv-v2', text: vs[1] }))
      const nom = libelleModule(m, 'hydro')
      if (nom) nomSvg(s, nom, cw / 2, cw).forEach((e) => gr.append(e))
      if (etat === 'defaut') gr.append(pastille(s, cw - 9, 135))
      corps.push(gr)
    })
  })
  return {
    corps,
    w: g.w,
    h: g.h,
    box: [-6, -4, g.w + 12, g.h + 8],
    ports: { in: { x: 0, y: HYDRO.aller, side: 'W' }, out: { x: g.w, y: HYDRO.aller, side: 'E' }, p3: { x: g.w, y: HYDRO.retour, side: 'E' }, p4: { x: 0, y: HYDRO.retour, side: 'W' } },
    geom: g,
  }
}

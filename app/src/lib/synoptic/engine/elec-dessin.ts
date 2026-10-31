/* eslint-disable */
// @ts-nocheck
// Dessin SVG de la famille « Schéma électrique » (NF C 15-100 / CEI 60617). Trait fin régulier, plat, couleurs par classes CSS uniquement
// (voir synoptique.css, section « Schéma électrique »). Convention de dessin : le courant descend (entrée en haut, sortie en bas) ;
// un appareil de coupure est dessiné dans sa position physique : lame fermée (verticale) ou ouverte (inclinée), jamais déduite quand
// la position est inconnue (alors ouverte, en pointillé).
import {
  PAS_POLE, LARGEUR_REPERE, UNITE_ELEC, geometrieElec, nbBarres, polesDessines, aBobine, reposFerme, contactsFermes, bobineExcitee, estCoupure,
} from './elec-modele'

const Y_HAUT = 25      // contact fixe
const Y_BAS = 55       // charnière de la lame
const cl = (...c) => c.filter(Boolean).join(' ')
const tcls = (t) => (t === true ? 'el-on' : t === false ? 'el-off' : '')

/** motif commun : un dessin = liste d'éléments SVG + cadre. `ctx` : { lire, fr, etat, libelle, repere, tension: { haut, bas }, uid } */
export function dessinerElec(s, params, ctx) {
  const sym = params.sym, g = geometrieElec(params), H = g.h, cx = g.cx
  const st = ctx.etat || 'ok'
  const lire = ctx.lire || (() => undefined)
  const th = ctx.tension ? ctx.tension.haut : null, tb = ctx.tension ? ctx.tension.bas : null
  const o = []
  const trait = (d, c) => s('path', { d, class: cl('el-trait', c) })
  const ligne = (x1, y1, x2, y2, c) => trait(`M${x1} ${y1}L${x2} ${y2}`, c)
  const fil = (x, y1, y2, t) => ligne(x, y1, x, y2, cl('el-fil', tcls(t)))
  const texte = (x, y, t, c) => s('text', { x, y, class: c, text: t })
  const sinus = (x, y, w, c) => trait(`M${x} ${y}q${w / 4} ${-w / 3} ${w / 2} 0t${w / 2} 0`, c)
  const fermeContacts = contactsFermes(st)

  /* ---- pôle de coupure : conducteurs + lame ; `o` = qualificatifs */
  function pole(px, ferme, q, repos) {
    const r = []
    const tHaut = th, tBas = tb
    r.push(fil(px, 0, Y_HAUT, tHaut), fil(px, Y_BAS, H, tBas))
    const inc = ferme === null
    const f = inc ? !!repos : ferme
    const bx = f ? px : px + 11, by = f ? Y_HAUT : Y_HAUT + 2
    r.push(ligne(px, Y_BAS, bx, by, cl('el-act', 'el-lame', inc ? 'el-inc' : '', f ? 'ferme' : 'ouvert')))
    if (q.croix) { const y = 14; r.push(ligne(px - 4, y - 4, px + 4, y + 4, 'el-act'), ligne(px - 4, y + 4, px + 4, y - 4, 'el-act')) }
    if (q.barre) r.push(ligne(px - 6, Y_HAUT, px + 6, Y_HAUT, 'el-fixe'))
    if (q.crochet) r.push(ligne(px - 7, Y_HAUT, px, Y_HAUT, 'el-fixe'))
    if (q.cercle) r.push(s('circle', { cx: px, cy: Y_BAS, r: 3.2, class: 'el-trait el-noeud' }))
    if (q.arc) r.push(trait(`M${px} ${Y_BAS - 9}a6 6 0 0 1 0 -12`, 'el-act'))
    if (q.fusible) {
      const ang = f ? 0 : (Math.atan2(11, Y_BAS - Y_HAUT - 2) * 180) / Math.PI
      r.push(s('rect', { x: px - 3.5, y: Y_BAS - 28, width: 7, height: 20, class: 'el-corps', transform: `rotate(${ang.toFixed(1)} ${px} ${Y_BAS})` }))
    }
    if (q.temporisation) r.push(trait(`M${px - 9} ${Y_BAS - 6}a5 5 0 0 0 10 0M${px - 9} ${Y_BAS - 6}v0`, 'el-act'), trait(`M${px - 2} ${Y_BAS - 3}l-3 -3m3 3l3 -3`, 'el-act'))
    return r
  }
  /** barres obliques du mode unifilaire (nombre de conducteurs) sur le conducteur d'entrée et de sortie */
  function barres(x, n, yHaut) {
    if (n < 2) return []
    const r = []
    for (let i = 0; i < n; i++) r.push(ligne(x - 4, yHaut + 5 + i * 4, x + 4, yHaut - 1 + i * 4, 'el-obliq'))
    return r
  }
  const uni = (params.mode ?? 'multi') === 'uni'
  const nBar = uni ? nbBarres(params.poles) : 1
  const pas = g.poles
  const px0 = pas[0], pxN = pas[pas.length - 1]
  /** liaison mécanique entre pôles (tirets) */
  const liaisonMeca = (y, dx) => (pas.length > 1 ? [ligne(px0 + dx, y, pxN + dx, y, 'el-meca')] : [])
  /** contacts de tous les pôles d'un appareil de coupure */
  const poles = (q, repos) => { const r = []; for (const px of pas) r.push(...pole(px, fermeContacts, q, repos)); r.push(...liaisonMeca(40, 5)); return r }
  const slashes = () => (uni ? [...barres(cx, nBar, 6), ...barres(cx, nBar, H - 22)] : [])

  /* ---- bobine (contacteur, relais, télérupteur, minuterie) : A1 en haut, A2 en bas, repère de bobine mis en évidence quand excitée */
  function bobine(x, glyphe) {
    const exc = bobineExcitee(lire), r = []
    r.push(fil(x, 0, 26, null), fil(x, 54, H, null))
    r.push(s('rect', { x: x - 10, y: 26, width: 20, height: 28, class: cl('el-corps', 'el-bobine', exc === true ? 'bob-on' : exc === null ? 'el-inc' : '') }))
    if (glyphe === 'pas') r.push(trait(`M${x - 5} ${46}h4v-6h4v-6h3`, 'el-glyphe'))
    if (glyphe === 'temps') r.push(s('circle', { cx: x, cy: 40, r: 6, class: 'el-trait el-glyphe' }), trait(`M${x} ${40}v-4M${x} ${40}l3 2`, 'el-glyphe'))
    r.push(texte(x + 14, 12, 'A1', 'el-pin'), texte(x + 14, H - 6, 'A2', 'el-pin'))
    return r
  }

  /* ---- déclencheurs thermique / magnétique (disjoncteur magnétothermique), organe différentiel */
  function declencheurs(d) {
    const r = [], bx = px0 - 13
    r.push(ligne(px0 + 4, 40, bx, 40, 'el-meca'), ligne(bx, 28, bx, 52, 'el-meca'))
    r.push(ligne(bx, 31, bx - 5, 31, 'el-trait'), ligne(bx, 49, bx - 5, 49, 'el-trait'))
    r.push(s('rect', { x: bx - 17, y: 26, width: 12, height: 10, class: 'el-corps' }), trait(`M${bx - 15} ${34}V${28}H${bx - 7}V${32}`, 'el-glyphe'))
    r.push(s('rect', { x: bx - 17, y: 44, width: 12, height: 10, class: 'el-corps' }), s('rect', { x: bx - 16, y: 49, width: 10, height: 4, class: 'el-plein' }))
    return r
  }
  function differentiel() {
    const r = [], rx = (pxN - px0) / 2 + 9, mid = (px0 + pxN) / 2
    r.push(s('ellipse', { cx: mid, cy: 10, rx, ry: 5.5, class: cl('el-trait', 'el-tore', st === 'defaut' ? 'el-act' : '') }))
    const bx = px0 - 17
    r.push(ligne(mid - rx, 10, bx + 6, 10, 'el-meca'))
    r.push(s('rect', { x: bx - 6, y: 4, width: 12, height: 12, class: 'el-corps' }), texte(bx, 10.5, 'Δ', 'el-glyphe-t'))
    return r
  }

  switch (sym) {
    case 'disjoncteur': o.push(...poles({ croix: true })); break
    case 'disj_mt': o.push(...poles({ croix: true }), ...declencheurs()); break
    case 'disj_diff': o.push(...poles({ croix: true }), ...declencheurs(), ...differentiel()); break
    case 'inter_diff': o.push(...poles({ cercle: true }), ...differentiel()); break
    case 'sectionneur': o.push(...poles({ barre: true })); break
    case 'inter_sect': o.push(...poles({ barre: true, cercle: true })); break
    case 'sect_fusible': o.push(...poles({ barre: true, fusible: true })); break
    case 'fusible': {
      for (const px of pas) {
        const blown = st === 'defaut'
        o.push(fil(px, 0, blown ? 36 : H, th), blown ? fil(px, 44, H, tb) : null)
        o.push(s('rect', { x: px - 5, y: 22, width: 10, height: 36, class: cl('el-corps', blown ? 'el-act' : '') }))
      }
      break
    }
    case 'parafoudre': {
      o.push(fil(cx, 0, 20, th), s('rect', { x: cx - 7, y: 20, width: 14, height: 34, class: cl('el-corps', st === 'defaut' ? 'el-act' : '') }))
      o.push(ligne(cx - 4, 48, cx + 4, 26, 'el-trait'), trait(`M${cx + 4} ${26}l-5 1m5 -1l-1 5`, 'el-trait'))
      o.push(ligne(cx, 54, cx, 72, 'el-fil'), ligne(cx - 9, 72, cx + 9, 72, 'el-trait'), ligne(cx - 6, 78, cx + 6, 78, 'el-trait'), ligne(cx - 3, 84, cx + 3, 84, 'el-trait'))
      break
    }
    case 'contacteur': {
      o.push(...bobine(20, null), ...poles({ arc: true }))
      o.push(ligne(30, 40, px0 + 5, 40, 'el-meca'))
      break
    }
    case 'relais': { o.push(...bobine(20, null), ...pole(px0, fermeContacts, {}, false), ligne(30, 40, px0 + 5, 40, 'el-meca')); break }
    case 'telerupteur': { o.push(...bobine(20, 'pas'), ...pole(px0, fermeContacts, {}, false), ligne(30, 40, px0 + 5, 40, 'el-meca')); break }
    case 'minuterie': { o.push(...bobine(20, 'temps'), ...pole(px0, fermeContacts, { temporisation: true }, false), ligne(30, 40, px0 + 5, 40, 'el-meca')); break }
    case 'contact_no': o.push(...pole(cx, fermeContacts, {}, reposFerme(params))); break
    case 'contact_nf': o.push(...pole(cx, fermeContacts, { crochet: true }, true)); break
    case 'bouton': {
      const presse = fermeContacts === true, dx = presse ? 3 : 0
      o.push(...pole(cx, fermeContacts, {}, false))
      o.push(ligne(cx + 4, 40, cx - 10 + dx, 40, 'el-meca'), ligne(cx - 10 + dx, 40, cx - 16 + dx, 40, 'el-trait'), ligne(cx - 16 + dx, 33, cx - 16 + dx, 47, 'el-trait'))
      break
    }
    case 'voyant': case 'eclairage': {
      const allume = st === 'marche', r = 12, cy = 44
      o.push(fil(cx, 0, cy - r, th))
      if (sym === 'voyant') o.push(fil(cx, cy + r, H, tb))
      o.push(s('circle', { cx, cy, r, class: cl('el-corps', 'el-act', allume ? 'el-allume' : '') }))
      const k = r * 0.7
      o.push(ligne(cx - k, cy - k, cx + k, cy + k, 'el-trait'), ligne(cx - k, cy + k, cx + k, cy - k, 'el-trait'))
      if (sym === 'eclairage') for (const a of [0, 45, 90, 135, 180, 225, 270, 315]) { const c = Math.cos((a * Math.PI) / 180), d = Math.sin((a * Math.PI) / 180); if (a === 270) continue; o.push(ligne(cx + c * (r + 3), cy + d * (r + 3), cx + c * (r + 7), cy + d * (r + 7), cl('el-rayon', allume ? 'el-act' : ''))) }
      break
    }
    case 'relais_th': {
      for (const px of pas) {
        o.push(fil(px, 0, 28, th), fil(px, 52, H, tb), s('rect', { x: px - 8, y: 28, width: 16, height: 24, class: cl('el-corps', st === 'defaut' ? 'el-act' : '') }))
        o.push(trait(`M${px - 4} ${47}V${33}H${px + 4}V${40}`, 'el-glyphe'))
      }
      o.push(...liaisonMeca(40, 8))
      const ax = g.ports.p3.x
      o.push(ligne(pxN + 8, 40, ax + 5, 40, 'el-meca'))
      o.push(fil(ax, 0, Y_HAUT, null), fil(ax, Y_BAS, H, null))
      const ouvert = st === 'defaut'
      o.push(ligne(ax, Y_BAS, ouvert ? ax + 11 : ax, Y_HAUT + (ouvert ? 2 : 0), cl('el-act', 'el-lame')), ligne(ax - 7, Y_HAUT, ax, Y_HAUT, 'el-fixe'))
      o.push(texte(ax + 9, 10, '95', 'el-pin'), texte(ax + 9, H - 5, '96', 'el-pin'))
      break
    }
    case 'transfo': {
      o.push(fil(cx, 0, 22, th), fil(cx, 78, H, tb))
      o.push(s('circle', { cx, cy: 38, r: 16, class: cl('el-corps', 'el-act') }), s('circle', { cx, cy: 62, r: 16, class: cl('el-trait', 'el-act') }))
      break
    }
    case 'moteur': {
      o.push(fil(cx, 0, 34, th))
      o.push(s('circle', { cx, cy: 56, r: 22, class: cl('el-corps', 'el-act') }), texte(cx, 52, 'M', 'el-m'))
      o.push(params.phases === 1 ? [texte(cx, 67, '1', 'el-glyphe-t'), sinus(cx + 2, 66, 8, 'el-glyphe')] : [texte(cx - 4, 67, '3', 'el-glyphe-t'), sinus(cx - 1, 66, 9, 'el-glyphe')])
      break
    }
    case 'variateur': case 'demarreur': {
      o.push(fil(cx, 0, 22, th), fil(cx, 78, H, tb), s('rect', { x: cx - 26, y: 22, width: 52, height: 56, class: cl('el-corps', 'el-act') }))
      o.push(ligne(cx - 26, 78, cx + 26, 22, 'el-trait'))
      o.push(sinus(cx - 20, 40, 14, 'el-glyphe'))
      if (sym === 'variateur') o.push(sinus(cx + 6, 66, 14, 'el-glyphe'), ligne(cx + 6, 71, cx + 20, 71, 'el-glyphe'))
      else o.push(trait(`M${cx + 4} ${70}h5l9 -9h4`, 'el-glyphe'))
      break
    }
    case 'prise': {
      o.push(fil(cx, 0, 38, th), ligne(cx - 6, 22, cx + 6, 22, 'el-trait'))
      o.push(trait(`M${cx - 11} ${38}A11 11 0 0 0 ${cx + 11} ${38}Z`, cl('el-corps', 'el-act')))
      break
    }
    case 'resistance': {
      o.push(fil(cx, 0, 24, th), fil(cx, 56, H, tb), s('rect', { x: cx - 6, y: 24, width: 12, height: 32, class: cl('el-corps', 'el-act') }))
      break
    }
    case 'compteur': {
      o.push(fil(cx, 0, 22, th), fil(cx, 78, H, tb), s('rect', { x: cx - 22, y: 22, width: 44, height: 56, class: cl('el-corps') }))
      o.push(texte(cx, 46, 'kWh', 'el-glyphe-t'), sinus(cx - 7, 62, 14, 'el-glyphe'))
      break
    }
    case 'tc': {
      o.push(fil(cx, 0, H, th), s('circle', { cx, cy: 40, r: 9, class: 'el-corps' }))
      o.push(ligne(cx + 8.5, g.ports.p3.y, g.ports.p3.x, g.ports.p3.y, 'el-trait'), ligne(cx + 8.5, g.ports.p4.y, g.ports.p4.x, g.ports.p4.y, 'el-trait'))
      o.push(s('circle', { cx: cx + 9, cy: 36, r: 1.6, class: 'el-plein' }))
      o.push(texte(g.ports.p3.x - 4, g.ports.p3.y - 4, 'S1', 'el-pin'), texte(g.ports.p4.x - 4, g.ports.p4.y + 10, 'S2', 'el-pin'))
      break
    }
    case 'barres': {
      const n = uni ? 1 : Math.max(1, Math.min(4, nbBarres(params.poles)))
      const L = g.w
      for (let i = 0; i < n; i++) { const y = 12 + (i - (n - 1) / 2) * 5; o.push(s('path', { d: `M0 ${y}H${L}`, class: cl('el-barre', tcls(th)) })) }
      o.push(fil(20, 0, 12, th))
      for (const [k, p] of Object.entries(g.ports)) if (k !== 'in' && k !== 'out') o.push(fil(p.x, 12, 24, th))
      if (uni) o.push(...barres(20, nbBarres(params.poles), 1))
      break
    }
    case 'arrivee': {
      const absent = st === 'arret'
      o.push(fil(cx, 18, H, th))
      o.push(s('path', { d: `M${cx - 8} 4L${cx + 8} 4L${cx} 18Z`, class: cl('el-corps', 'el-act', absent ? 'el-inc' : '') }))
      if (uni) o.push(...barres(cx, nbBarres(params.poles ?? '3P'), 28))
      break
    }
    case 'depart': {
      o.push(fil(cx, 0, 46, th), trait(`M${cx - 7} 46L${cx} 56L${cx + 7} 46`, 'el-act'))
      if (uni) o.push(...barres(cx, nbBarres(params.poles ?? '3P'), 8))
      break
    }
    case 'borne': { o.push(fil(cx, 0, 16, th), fil(cx, 24, H, tb), s('circle', { cx, cy: 20, r: 4, class: 'el-corps' })); break }
    case 'bornier': {
      const x0 = pas[0] - 12, x1 = pas[pas.length - 1] + 12
      o.push(s('rect', { x: x0, y: 14, width: x1 - x0, height: 32, class: 'el-fin' }))
      for (const [i, px] of pas.entries()) {
        o.push(fil(px, 6, 26, th), fil(px, 34, 54, tb), s('circle', { cx: px, cy: 30, r: 4, class: 'el-corps' }), texte(px, 42.5, String(i + 1), 'el-pin c'))
      }
      if (pas.length > 1) o.push(fil(pas[0], 6, 6, th), ligne(pas[0], 6, pxN, 6, cl('el-fil', tcls(th))), ligne(pas[0], 54, pxN, 54, cl('el-fil', tcls(tb))))
      o.push(fil(cx, 0, 6, th), fil(cx, 54, H, tb))
      break
    }
    case 'terre': {
      o.push(fil(cx, 0, 18, null), ligne(cx - 10, 18, cx + 10, 18, 'el-trait'), ligne(cx - 6.5, 24, cx + 6.5, 24, 'el-trait'), ligne(cx - 3, 30, cx + 3, 30, 'el-trait'))
      break
    }
    case 'neutre': {
      o.push(fil(cx, 0, 20, th), fil(cx, 20, H, tb), s('path', { d: `M${cx - 14} 20H${cx + 14}`, class: 'el-barre el-barre-n' }), texte(cx + 18, 24, 'N', 'el-glyphe-t'))
      break
    }
    default: o.push(s('rect', { x: cx - 20, y: 20, width: 40, height: 40, class: 'el-corps el-inc' }), texte(cx, 42, '?', 'el-glyphe-t'))
  }
  o.push(...slashes().filter(() => estCoupure(sym) || ['relais_th', 'fusible', 'parafoudre', 'bornier'].includes(sym)))

  /* ---- colonne des repères et des mesures (à droite du symbole) */
  const x = g.w + (sym === 'barres' ? 14 : 6)
  const y0 = sym === 'barres' ? 14 : Math.max(14, H / 2 - 14)
  const lignes = []
  if (ctx.repere) lignes.push(texte(x, y0, ctx.repere, 'el-rep'))
  let yy = y0 + 12
  if (ctx.libelle && ctx.libelle !== ctx.repere) { lignes.push(texte(x, yy, String(ctx.libelle).slice(0, 15), 'el-lib')); yy += 11 }
  if ((sym === 'arrivee' || sym === 'depart') && params.texte) { lignes.push(texte(x, yy, params.texte, 'el-lib')); yy += 11 }
  for (const nom of ['courant', 'tension', 'puissance', 'energie', 'frequence', 'temperature']) {
    const v = lire(nom); if (v == null) continue
    const u = UNITE_ELEC[nom]
    lignes.push(texte(x, yy, `${u.lettre} ${ctx.fr(v, u.d)} ${u.u}`, 'el-mes')); yy += 11
  }
  o.push(...lignes)
  const etiquette = ctx.etatTexte
  if (etiquette) o.push(texte(x, yy, etiquette, 'el-etat'))
  const w = g.w + LARGEUR_REPERE
  return { corps: o.flat().filter(Boolean), box: [0, 0, w, H], geo: g }
}

/** pictogramme 24×24 du Palette : le symbole par défaut, réduit, trait constant (la couleur vient du CSS de la palette) */
export function iconeElec(s, params) {
  const g = geometrieElec(params)
  const r = dessinerElec(s, params, { lire: () => undefined, fr: (v) => String(v), etat: 'ok', repere: '', libelle: '', tension: { haut: null, bas: null } })
  const gauche = 0, largeur = g.w, haut = g.h
  const k = Math.min(20 / Math.max(largeur, haut), 0.6)
  const racine = s('g', { transform: `translate(${(24 - largeur * k) / 2} ${(24 - haut * k) / 2}) scale(${k})` })
  r.corps.filter((n) => n.tagName !== 'text').forEach((n) => racine.append(n))
  const svg = s('svg', { viewBox: '0 0 24 24' }); svg.append(racine)
  return svg.innerHTML
}

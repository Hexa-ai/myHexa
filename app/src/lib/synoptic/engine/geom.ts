/* eslint-disable */
// @ts-nocheck
// Géométrie des symboles (tailles, ports, routage orthogonal des conduites) : fonctions pures, sans DOM.
// Géométrie des symboles : UNE seule source de vérité, utilisée par la mise en page (node) et par le rendu (navigateur).
// Entrée : un équipement du modele.json + ses éléments rattachés. Sortie : taille du nœud, ports de raccordement,
// positions relatives des éléments (moteur d'agitateur, annexes, vannes de trémie, étiquette). Aucune coordonnée absolue.
import { disposerCta, disposerHydro, portsCvc } from './cvc-modele'
const G: any = {};
G.CELL_W = 86; G.CELL_H = 84;   // cellule d'un instrument en ligne (sur une conduite)
G.ANNEXE_W = 74; G.ANNEXE_H = 66; // cellule d'une annexe (sonde, poire) sous un récipient

// Découpe un libellé en lignes de n caractères max (2 lignes max).
G.coupe = function (txt, n) {
  n = n || 18;
  const mots = String(txt || '').split(/\s+/); const lignes = []; let cur = '';
  for (const m of mots) {
    if ((cur + ' ' + m).trim().length > n && cur) { lignes.push(cur); cur = m; } else cur = (cur + ' ' + m).trim();
  }
  if (cur) lignes.push(cur);
  if (lignes.length > 2) { const r = lignes.slice(1).join(' '); return [lignes[0], r.length > n ? r.slice(0, n - 1) + '…' : r]; }
  return lignes;
};
const largeurTexte = (lignes, px) => Math.max(0, ...lignes.map(l => l.length * px));

// lettres d'un instrument : « PE-FIT-01 » → « FIT »
G.lettres = function (id) {
  const m = String(id).split('-'); return (m.length > 1 ? m[1] : m[0]).slice(0, 4);
};


// Tag court d'une annexe : on retire le préfixe d'aire déjà porté par l'hôte (« RF-LSL-01 » sur « RF-RV-01 » → « LSL-01 »).
G.tagCourt = function (id, hoteId) {
  const a = String(id).split('-'), h = String(hoteId || '').split('-');
  return (a.length > 2 && a[0] === h[0]) ? a.slice(1).join('-') : id;
};
// Disposition d'instruments en ligne sur une conduite : vannes dans la ligne, mesures en « piquages » alternés
// dessus/dessous (comme sur un P&ID), instruments sans donnée en pastille compacte. Une seule source pour mise en page et rendu.
// eqs = liste d'équipements, aDonnee = (eq) => bool. Retourne { w, h, cells:[{id, dx, side, mode}] } (dx = centre, relatif au bord gauche).
G.TAP = 46;
G.dispo = function (eqs, aDonnee) {
  let x = 17, alt = 1; const cells = [];
  for (const e of eqs) {
    const vanne = e.type === 'vanne' || e.type === 'vanne_reg';
    const donnee = vanne ? true : (aDonnee ? aDonnee(e) : true);
    const w = vanne ? 62 : (donnee ? 50 : 44);   // piquages alternés dessus/dessous : deux cellules voisines ne partagent jamais le même côté, donc un pas étroit suffit
    let side = 0, mode = 'ligne';
    if (!vanne) { mode = donnee ? 'piquage' : 'compact'; side = alt; alt = -alt; }
    cells.push({ id: e.id, dx: x + w / 2, side, mode }); x += w;
  }
  const taps = cells.some(c => c.mode === 'piquage');
  return { w: x + 17, h: taps ? 2 * (G.TAP + 44) : 72, cells };
};

// Passe 7 : symboles ajoutés à la palette. rw / rh = demi-largeur / demi-hauteur du dessin ; val = ligne de valeur sous le symbole ;
// ports supplémentaires p3, p4… = [dx, dy, côté] en fractions de (rw, rh) depuis le centre.
G.EXTRA = {
  vanne_man: { rw: 20, rh: 24 }, vanne_3v: { rw: 20, rh: 24, ports: { p3: [0, 0.92, 'S'] } }, clapet: { rw: 16, rh: 16 }, filtre: { rw: 22, rh: 24, val: 1 },
  echangeur: { rw: 32, rh: 24, val: 1, ports: { p3: [-0.5, -1, 'N'], p4: [0.5, -1, 'N'] } }, compresseur: { rw: 26, rh: 26 }, ventilateur: { rw: 26, rh: 26 },
  convoyeur: { rw: 58, rh: 16 }, verin: { rw: 46, rh: 14 }, disjoncteur: { rw: 22, rh: 24 }, transformateur: { rw: 28, rh: 20, val: 1 }, variateur: { rw: 26, rh: 22, val: 1 }
};
// ctx = { annexes: [eq...], vannes: [eq...], moteurAgit: eq|null, f: facteur de taille }
G.mesurer = function (eq, ctx) {
  ctx = ctx || {}; const f = ctx.f || 1; const ann = ctx.annexes || []; const vannes = ctx.vannes || [];
  const lignes = G.coupe(eq.libelle, 18);
  const lblW = Math.max(eq.id.length * 8.2, largeurTexte(lignes, 7.1)) + 8;
  const lblH = 20 + 16 * lignes.length;
  const g = { lignes, ports: {}, annexes: [], vannes: [], type: eq.type, f };
  const t = eq.type;

  if (t === 'pompe') {
    const r = ((eq.variante === 'doseuse' || eq.variante === 'vide_fut') ? 24 : 30) * f;
    const w = Math.max(2 * (r + 10), lblW), cy = r + 10;
    g.r = r; g.cx = w / 2; g.cy = cy; g.w = w;
    g.label = { x: w / 2, y: 2 * (r + 10) + 4 }; g.h = 2 * (r + 10) + 4 + lblH;
    g.ports = { in: { x: 0, y: cy, side: 'W', vx: w / 2 - r - 9 }, out: { x: w, y: cy, side: 'E', vx: w / 2 + r + 9 }, nord: { x: w / 2, y: 0, side: 'N' } };
  } else if (t === 'cuve' || t === 'parametre') {
    const decant = t === 'parametre';
    const motor = !!ctx.moteurAgit;
    const top = decant ? 18 : (motor ? 50 : 16);
    const n = decant ? ((eq.params && eq.params.tremies) || 4) : 0;
    const hw = (decant && ctx.corps_w) ? ctx.corps_w / n : 60;   // corps_w / corps_h / annexes_colonnes : réglages posés par une correction de placement
    const bw = decant ? n * hw : (ctx.corps_w || 116), bh = ctx.corps_h || (decant ? 96 : 106);
    let y = top; g.corps = { x: 0, y: top, w: bw, h: bh };
    let yBas = top + bh;
    if (decant) {
      g.tremie_h = 46; g.tremies = n; g.hw = hw;
      yBas = top + bh + g.tremie_h;
      g.collecteurY = yBas + 56;
      vannes.forEach((v, i) => {
        const k = (v.emplacement && v.emplacement.tremie) ? v.emplacement.tremie - 1 : i;
        g.vannes.push({ id: v.id, tx: k * hw + hw / 2, ty: yBas, vy: yBas + 24, k });
      });
      yBas = g.collecteurY + 20; // étiquettes des vannes
    }
    const cols = ctx.annexes_colonnes ? Math.min(ctx.annexes_colonnes, ann.length) : (ann.length > 4 ? Math.ceil(ann.length / 2) : ann.length), rows = Math.ceil(ann.length / Math.max(cols, 1)) || 1;   // annexes sur 2 rangées au-delà de 4
    const annW = cols * G.ANNEXE_W;
    const w = Math.max(bw + (decant ? 28 : 34), annW, lblW, 136);
    g.w = w; g.corps.x = (w - bw) / 2;
    g.vannes.forEach(v => { v.tx += g.corps.x; });
    if (motor) g.moteur = { x: w / 2, y: 22, r: 15 };
    let ya = yBas + 8;
    if (ann.length) {
      const x0 = (w - annW) / 2;
      ann.forEach((a, i) => g.annexes.push({ id: a.id, x: x0 + (i % cols) * G.ANNEXE_W + G.ANNEXE_W / 2, y: ya + 16 + Math.floor(i / cols) * G.ANNEXE_H }));
      ya += rows * G.ANNEXE_H;
    }
    g.label = { x: w / 2, y: ya + 2 }; g.h = ya + 2 + lblH + 24;   // +24 : ligne d'état fixe sous le repère
    // PORTS PAR TYPE DE SYMBOLE (règle générique) : entrée en haut à gauche, sortie en bas à droite, surverse en haut à droite ;
    // le décanteur entre bas à gauche (eau brute) et sort par les goulottes, en haut à droite. `ref` = port qui se cale sur l'axe.
    const pin = top + bh * (decant ? 0.62 : 0.14), pout = top + bh * (decant ? 0.2 : 0.88), psur = top + bh * 0.14;
    g.ports = { in: { x: 0, y: pin, side: 'W', vx: g.corps.x }, out: { x: w, y: pout, side: 'E', vx: g.corps.x + bw }, nord: { x: g.corps.x + 22, y: 0, side: 'N' } };
    if (!decant) g.ports.surverse = { x: w, y: psur, side: 'E', vx: g.corps.x + bw };
    if (eq.forme === 'silo') g.ports.out = { x: g.corps.x + bw / 2, y: top + bh, side: 'S' };   // silo : sortie au bas de la trémie
    g.ref = decant ? 'in' : 'out';
    if (decant) g.ports.boues = { x: w, y: g.collecteurY, side: 'E' };
  } else if (t === 'silhouette') {
    const s = eq.silhouette || { largeur: 100, hauteur: 100, primitives: [] };
    const k = 1.3 * f; g.k = k;
    const sw = s.largeur * k, sh = s.hauteur * k;
    const w = Math.max(sw + 30, lblW); g.w = w; g.sx = (w - sw) / 2; g.sy = 8; g.sw = sw; g.sh = sh;
    g.label = { x: w / 2, y: sh + 14 }; g.h = sh + 14 + lblH;
    const pe = (s.ports && s.ports.entree) || [0, s.hauteur / 2], ps = (s.ports && s.ports.sortie) || [s.largeur, s.hauteur / 2];
    const cote = (p) => { const d = { W: p[0], E: s.largeur - p[0], N: p[1], S: s.hauteur - p[1] }; return Object.keys(d).sort((a, b) => d[a] - d[b])[0]; };
    const port = (p) => { const sd = cote(p), px = g.sx + p[0] * k, py = g.sy + p[1] * k; return sd === 'W' ? { x: 0, y: py, side: 'W', vx: px } : sd === 'E' ? { x: w, y: py, side: 'E', vx: px } : { x: px, y: py, side: sd }; };
    g.ports = { in: port(pe), out: port(ps), nord: { x: w / 2, y: 0, side: 'N' } };
    Object.entries(s.ports || {}).forEach(([nom, p]) => { if (nom !== 'entree' && nom !== 'sortie' && /^p\d+$/.test(nom) && Array.isArray(p)) g.ports[nom] = port(p); });   // ports supplémentaires déclarés dans l'éditeur de formes
  } else if (t === 'image') {
    // image déposée : cadre standard (jamais recoloré), état par la couleur du cadre + une pastille
    const iw = 132 * f, ih = 100 * f, w = Math.max(iw + 20, lblW); g.w = w; g.ix = (w - iw) / 2; g.iy = 8; g.iw = iw; g.ih = ih; g.cx = w / 2; g.cy = 8 + ih / 2;
    g.label = { x: w / 2, y: ih + 16 }; g.h = ih + 16 + lblH;
    g.ports = { in: { x: 0, y: g.cy, side: 'W', vx: g.ix }, out: { x: w, y: g.cy, side: 'E', vx: g.ix + iw }, nord: { x: w / 2, y: 0, side: 'N' } };
  } else if (t === 'raccord') {
    // terminal compact : flèche 34x34, libellé AU-DESSUS (déborde dans l'espace entre couches)
    const w = 34, h = 34;
    g.w = w; g.h = h; g.ports = { in: { x: 0, y: h / 2, side: 'W' }, out: { x: w, y: h / 2, side: 'E' }, nord: { x: w / 2, y: 0, side: 'N' } };
    g.lignesRaccord = G.coupe(eq.libelle, 15); g.label = { x: w / 2, y: -8 }; g.ancre = 'milieu';
  } else if (t === 'cta' || t === 'hydro') {   // famille CVC : bandeau de CTA / lignes hydrauliques, géométrie dans cvc-modele.ts
    const gg = t === 'cta' ? disposerCta(eq.params) : disposerHydro(eq.params);
    g.cvc = true; g.w = Math.max(60, gg.w); g.h = gg.h; g.cx = g.w / 2; g.cy = gg.h / 2; g.label = null; g.lignes = [];
    g.ports = portsCvc(t, eq.params);
    g.ports.nord = { x: g.w / 2, y: 0, side: 'N' };
  } else if (G.EXTRA[t]) {   // symboles de la passe 7 : 2 ports W / E sur l'axe du symbole (+ p3, p4 selon le type)
    const X = G.EXTRA[t], rw = X.rw * f, rh = X.rh * f, w = Math.max(2 * (rw + 14), lblW), cy = rh + 12 + (t === 'vanne_man' || t === 'vanne_3v' ? 12 * f : 0);
    g.rw = rw; g.rh = rh; g.cx = w / 2; g.cy = cy; g.w = w; g.aVal = !!X.val;
    g.valY = cy + rh + 15; g.label = { x: w / 2, y: cy + rh + 12 + (X.val ? 18 : 0) }; g.h = g.label.y + lblH;
    g.ports = { in: { x: 0, y: cy, side: 'W', vx: w / 2 - rw - 8 }, out: { x: w, y: cy, side: 'E', vx: w / 2 + rw + 8 }, nord: { x: w / 2, y: 0, side: 'N' } };
    Object.entries(X.ports || {}).forEach(([nom, q]) => { g.ports[nom] = { x: w / 2 + q[0] * rw, y: cy + q[1] * rh, side: q[2] }; });
  } else { // mesure / voyant / vanne isolés, ou type inconnu
    const r = 20 * f, cy = 30 * f, w = Math.max(Math.round(84 * f), lblW); g.w = w; g.cx = w / 2; g.cy = cy; g.r = r;
    g.label = { x: w / 2, y: cy + 26 * f }; g.h = cy + 26 * f + lblH;
    g.ports = { in: { x: 0, y: cy, side: 'W' }, out: { x: w, y: cy, side: 'E' }, nord: { x: w / 2, y: 0, side: 'N' } };
    g.inconnu = !['mesure', 'voyant', 'vanne', 'vanne_reg', 'moteur'].includes(t);
  }
  if (!g.ref) g.ref = 'in';
  return g;
};

// ---------------------------------------------------------------- routage orthogonal (partagé : mise en page node + éditeur navigateur)
// pa/pb = ports [x,y], da/db = direction de sortie du tuyau hors du port ('E','W','N','S'), o.via = points de passage imposés,
// o.coude = 'milieu' | 'fin' | 'debut' (où placer le décrochement). Renvoie une polyligne strictement orthogonale.
G.STUB = 18;
const DV = { E: [1, 0], W: [-1, 0], N: [0, -1], S: [0, 1] };
const horiz = (d) => d === 'E' || d === 'W';
const eq = (a, b) => Math.abs(a - b) < 0.01;
G.simplifier = function (pts) {
  const out = [];
  for (const p of pts) { const q = out[out.length - 1]; if (q && eq(q[0], p[0]) && eq(q[1], p[1])) continue; out.push([+p[0].toFixed(1), +p[1].toFixed(1)]); }
  for (let i = 1; i < out.length - 1;) { const a = out[i - 1], b = out[i], c = out[i + 1];
    if ((eq(a[0], b[0]) && eq(b[0], c[0])) || (eq(a[1], b[1]) && eq(b[1], c[1]))) out.splice(i, 1); else i++; }
  return out;
};
G.router = function (pa, da, pb, db, o) {
  o = o || {}; const st = o.stub != null ? o.stub : G.STUB, coude = o.coude || 'milieu';
  const va = DV[da] || DV.E, vb = DV[db] || DV.W;
  const sa = [pa[0] + va[0] * st, pa[1] + va[1] * st], sb = [pb[0] + vb[0] * st, pb[1] + vb[1] * st];
  const seq = [sa, ...(o.via || []), sb]; const pts = [pa, sa]; let h = horiz(da);
  for (let i = 1; i < seq.length; i++) {
    const p = pts[pts.length - 1], q = seq[i], dernier = i === seq.length - 1, hq = dernier ? horiz(db) : null; const c = [];
    if (!eq(p[0], q[0]) && !eq(p[1], q[1])) {
      if (hq === null) c.push(h ? [q[0], p[1]] : [p[0], q[1]]);
      else if (h && hq) { if (coude === 'fin') c.push([q[0], p[1]]); else if (coude === 'debut') c.push([p[0], q[1]]); else { const xm = (p[0] + q[0]) / 2; c.push([xm, p[1]], [xm, q[1]]); } }
      else if (!h && !hq) { if (coude === 'fin') c.push([p[0], q[1]]); else if (coude === 'debut') c.push([q[0], p[1]]); else { const ym = (p[1] + q[1]) / 2; c.push([p[0], ym], [q[0], ym]); } }
      else if (h && !hq) c.push([q[0], p[1]]); else c.push([p[0], q[1]]);
    }
    pts.push(...c, q);
    const a = pts[pts.length - 2], b = pts[pts.length - 1]; if (!eq(a[0], b[0]) || !eq(a[1], b[1])) h = !eq(a[1], b[1]) ? eq(a[0], b[0]) ? false : h : true;
  }
  pts.push(pb); return G.simplifier(pts);
};


export default G

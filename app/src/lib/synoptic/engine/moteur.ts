/* eslint-disable */
// @ts-nocheck
/**
 * Moteur de synoptique : rendu SVG animé + éditeur graphique, porté du prototype STEMI (passes 1-7).
 * Chaque appel de `creerSynoptique` crée une instance isolée (fermeture) attachée à une racine DOM : aucune variable globale,
 * donc une tuile, sa vue agrandie et l'éditeur peuvent exister en même temps. La structure interne est celle du prototype,
 * découpée en sections « MODULE : … » ; voir docs/flux/synoptique.md (carte des sections et marche à suivre pour ajouter un symbole).
 */
import GEOM from './geom'
import { appliquerRegle, estEmplacementEtat, OPERATEURS } from '../regles'
import type { SynopticDocument, SynopticHost, SynopticInstance, SynopticOptions } from './types'

export function creerSynoptique(root: HTMLElement, options: SynopticOptions): SynopticInstance {
  const HOST: SynopticHost = options.host ?? {}
  const DATA: any = { modele: options.doc.modele, layout: options.doc.layout, catalogue: options.catalogue ?? [] }
  let VALEURS: Record<string, number> = { ...(options.values ?? {}) }
  const SYN: any = {}          // échelle courante (lue par les tests)
  const EDITEUR: any = {}      // points d'entrée de l'éditeur (remplis par les sections editeur_*)
  const INTERNE: any = {}      // opérations exposées aux tests (aucune souris nécessaire)
  const byId = (id: string) => root.querySelector('#' + id) as HTMLElement
  const ecouteurs: Array<() => void> = []
  /** écouteurs posés sur window / document : retirés à la destruction de l'instance */
  const addG = (cible: any, type: string, fn: any, opt?: any) => { cible.addEventListener(type, fn, opt); ecouteurs.push(() => cible.removeEventListener(type, fn, opt)) }
  /** raccourcis clavier globaux (+ − 0) : seulement si la souris ou le focus est dans ce synoptique, ou en plein cadre */
  const clavierActif = () => !!options.pleinCadre || root.matches(':hover') || root.contains(document.activeElement)

/* ======================================================================
   MODULE : couleurs — couleurs des tuyaux (palette, légende)
   ====================================================================== */

/* Passe 7 — couleurs des tuyaux (pinceau).
   Un tuyau est « Procédé » (neutre) tant qu'on ne le colore pas. Palette FIXE de 8 teintes sobres (pas de sélecteur libre).
   Le nom d'une couleur est facultatif : seules les couleurs NOMMÉES et UTILISÉES apparaissent dans la légende (générée).
   Modèle : liaison.couleur = '#hex' (absente = Procédé) ; modele.legende = { '#hex': 'Nom' }.
   Rétrocompatibilité : l'ancien champ `fluide` (eau/boue/reactif/polymere/air) est converti en couleur nommée au chargement. */
const PALETTE = [
  { c: '#9bd3ee', t: '#34526a', nom: 'Bleu clair' }, { c: '#c8a46e', t: '#5b5140', nom: 'Sable' }, { c: '#b3a6f2', t: '#4a4468', nom: 'Lavande' }, { c: '#e8a3cb', t: '#5d4458', nom: 'Rose' },
  { c: '#cfe3ea', t: '#4d5f66', nom: 'Gris bleuté' }, { c: '#8fa6c9', t: '#3f4d65', nom: 'Ardoise' }, { c: '#b5bd7a', t: '#565c3c', nom: 'Olive' }, { c: '#d9a08c', t: '#624a42', nom: 'Terre' }
];
const FLUIDE_COULEUR = { eau: ['#9bd3ee', 'Eau'], boue: ['#c8a46e', 'Boues'], reactif: ['#b3a6f2', 'Coagulant'], polymere: ['#e8a3cb', 'Polymère'], air: ['#cfe3ea', 'Air'] };
const COULEUR_NEUTRE = { c: '#b9c6d3', t: '#44566a' };   // « Procédé » : flux gris-bleu clair sur tuyau neutre
const infoCouleur = (c) => PALETTE.find(p => p.c === c) || null;
const coulTuyau = (c) => (c ? (infoCouleur(c) || { t: '#44566a' }).t : COULEUR_NEUTRE.t);
const coulFlux = (c) => c || COULEUR_NEUTRE.c;

/* Convertit en place un modèle (et sa mise en page) : fluides nommés -> couleurs nommées. Idempotent. */
function migrerCouleurs(modele, layout) {
  if (!modele) return;
  modele.legende = modele.legende || {};
  const parId = {};
  (modele.liaisons || []).forEach(l => {
    if (!l.couleur && FLUIDE_COULEUR[l.fluide] && !l.couleur_choisie) {
      l.couleur = FLUIDE_COULEUR[l.fluide][0];
      if (!modele.legende[l.couleur] && !(l.couleur in modele.legende)) modele.legende[l.couleur] = FLUIDE_COULEUR[l.fluide][1];
    }
    parId[l.id] = l;
  });
  if (layout) (layout.aretes || []).forEach(a => {
    const l = parId[a.id]; const c = (l && l.couleur) || (!l && FLUIDE_COULEUR[a.fluide] ? FLUIDE_COULEUR[a.fluide][0] : null);
    if (c) a.couleur = c; else delete a.couleur;
  });
  if (!Object.keys(modele.legende).length) delete modele.legende;
}
/* Couleurs nommées ET utilisées, dans l'ordre de la palette. */
function legendeCouleurs(modele, layout) {
  const leg = modele.legende || {}, util = new Set((layout.aretes || []).map(a => a.couleur).concat((modele.liaisons || []).map(l => l.couleur)).filter(Boolean));   // + liaisons des cartes (tirets d'injection)
  return PALETTE.filter(p => util.has(p.c) && leg[p.c] && String(leg[p.c]).trim()).map(p => ({ c: p.c, nom: String(leg[p.c]).trim() }));
}


/* ======================================================================
   MODULE : donnees — lecture des variables : règles, états, alarmes, activité des conduites
   ====================================================================== */
// Étape 3 — rendu. Entrées : DATA.modele (modele.json), DATA.layout (layout.json), DATA.valeurs (optionnel).
// Tout est générique : aucune référence à un repère de projet. Le style est imposé ici (normaliseur), jamais par le modèle.

const NS = 'http://www.w3.org/2000/svg';
// Document courant : modifiable par l'éditeur (chargerDoc) ; tout le rendu relit ces liaisons à chaque dessin.
let M, L, EQ, V;
const G = GEOM
const MAXPT = 24; // largeur de la fenêtre de démonstration (heures)

function s(tag, a, ...kids) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(a || {})) { if (v === null || v === undefined || v === false) continue; if (k === 'text') n.textContent = v; else n.setAttribute(k, String(v)); }
  for (const c of kids.flat()) if (c) n.append(c);
  return n;
}
function h(tag, cls, html) { const n = document.createElement(tag); if (cls) n.className = cls; if (html !== undefined) n.innerHTML = html; return n; }
const fr = (v, d = 1) => (typeof v === 'number') ? v.toLocaleString('fr-FR', { maximumFractionDigits: d, minimumFractionDigits: 0 }) : String(v);
const hash = (str) => { let x = 2166136261; for (const c of str) { x ^= c.charCodeAt(0); x = Math.imul(x, 16777619); } return x >>> 0; };
const rnd = (seed) => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };

/* ------------------------------------------------------------------ valeurs de démonstration (génériques) */
function genererDemo(M) {
  const V = {}; const set = (v, x) => { if (v && !(v in V)) V[v] = x; };
  const vannes = M.equipements.filter(e => e.type === 'vanne');
  let alarmeFaite = false;
  const groupes = {};
  vannes.forEach(v => { (groupes[v.monte_sur || '_'] ||= []).push(v); });
  const ouverte = new Set(Object.values(groupes).map(g => (g.length > 1 ? g[1] : g[0]).id));
  const premiereAlarmeMesure = M.equipements.find(e => e.type === 'mesure' && e.params && e.params.seuils && e.params.seuils.haut != null && e.slots && e.slots.valeur && e.slots.valeur.variable);
  for (const e of M.equipements) {
    const sl = e.slots || {}; const p = e.params || {};
    for (const [nom, sp] of Object.entries(sl)) {
      if (!sp || !sp.variable) continue; const v = sp.variable;
      if (['declenche', 'colmatage'].includes(nom)) set(v, 0);
      else if (nom === 'dp') set(v, 0.4);
      else if (nom === 'entree_t') set(v, 12.4);
      else if (nom === 'sortie_t') set(v, 18.7);
      else if (nom === 'frequence') set(v, 42);
      else if (nom === 'temperature') set(v, 54);
      else if (nom === 'sorti') set(v, 1);
      else if (nom === 'rentre') set(v, 0);
      else if (e.type === 'disjoncteur' && nom === 'ferme') set(v, 1);
      else if (['vanne_man', 'vanne_3v'].includes(e.type) && nom === 'ouvert') set(v, 1);
      else if (nom.startsWith('s_')) set(v, (p.etats_demo || {})[nom] != null ? p.etats_demo[nom] : 0);
      else if (nom === 'marche') set(v, 1);
      else if (nom === 'defaut') set(v, 0);
      else if (nom === 'vitesse') set(v, 55);
      else if (nom === 'ouvert') set(v, ouverte.has(e.id) ? 1 : 0);
      else if (nom === 'ferme') set(v, ouverte.has(e.id) ? 0 : 1);
      else if (nom === 'position') set(v, 40);
      else if (nom === 'niveau') set(v, (p.niveau_max != null ? p.niveau_max : 100) * 0.58);
      else if (nom === 'etat') {
        const al = p.alarme_si; let x = al === 1 ? 0 : al === 0 ? 1 : 0;
        if (!alarmeFaite && !premiereAlarmeMesure && al != null) { x = al; alarmeFaite = true; }
        set(v, x);
      } else if (nom === 'valeur') {
        const mn = p.min != null ? p.min : 0, mx = p.max != null ? p.max : 100;
        let f = 0.58; if (e.grandeur === 'ph') f = 0.52; if (e.grandeur === 'turbidite') f = 0.09; if (e.grandeur === 'pression') f = 0.55; if (e.grandeur === 'niveau') f = 0.6;
        let x = mn + (mx - mn) * f;
        if (e === premiereAlarmeMesure) { x = p.seuils.haut * 1.07; alarmeFaite = true; }
        set(v, Math.round(x * 10) / 10);
      }
    }
    (e.variables_associees || []).forEach((va, i) => set(va.variable, 12000 + (hash(va.variable) % 9000)));
  }
  (M.bandeau || []).forEach(b => set(b.variable, b.alarme_si === 1 ? 0 : b.alarme_si === 0 ? 1 : 0));
  return V;
}
function chargerDoc(doc) {
  migrerCouleurs(doc.modele, doc.layout); M = doc.modele; L = doc.layout; EQ = Object.fromEntries(M.equipements.map(e => [e.id, e]));
  V = VALEURS;
}
chargerDoc({ modele: DATA.modele, layout: DATA.layout });

/* ------------------------------------------------------------------ lecture des emplacements */
function slot(eq, nom) { return eq && eq.slots ? eq.slots[nom] : undefined; }
// RÈGLE : un emplacement sans variable de retour est INCONNU. Aucune marche / ouverture / vitesse / défaut n'est jamais déduite
// (ni d'un débit, ni d'un niveau, ni d'un ordre) ; toute autre déduction de confiance < SEUIL_CONF est ignorée au rendu.
const SEUIL_CONF = 0.6, ACTIONNEURS = ['marche', 'ouvert', 'ferme', 'position', 'vitesse', 'defaut'];
const deduitIgnoree = (sp, nom) => !!(sp.derive && (ACTIONNEURS.includes(nom) || (sp.confiance || 0) < SEUIL_CONF));
const slotRelie = (sp, nom) => !!(sp && (sp.variable || (sp.derive && !deduitIgnoree(sp, nom)) || sp.derive_tor));
// Règle d'un emplacement posée dans l'éditeur : { op: 'eq'|'ne'|'gt'|'ge'|'lt'|'le', val } → 1 / 0 pour les états ; { min, max } pour les niveaux et valeurs.
const OPS = OPERATEURS;
const estTor = estEmplacementEtat;
function lire(eq, nom, prof = 0) {
  const sp = slot(eq, nom); if (!sp || prof > 4) return undefined;
  if (sp.variable) return appliquerRegle(sp, nom, V[sp.variable]);
  if (sp.derive && !deduitIgnoree(sp, nom)) {
    if (sp.derive.mesure) { const m = lire(EQ[sp.derive.mesure], 'valeur', prof + 1); return m == null ? undefined : (m > sp.derive.sup ? 1 : 0); }
    if (sp.derive.slot) { const [i, n] = sp.derive.slot.split('.'); return lire(EQ[i], n, prof + 1); }
  }
  return undefined;
}
const aDonnee = (e) => Object.values(e.slots || {}).some(sp => sp && sp.variable);
function niveau(eq) {            // → { frac, texte, qualitatif }
  const sp = slot(eq, 'niveau'); if (!sp) return null;
  if (sp.variable) { const raw = V[sp.variable]; if (raw == null) return null; const rg = sp.regle || {};
    const mn = rg.min != null ? rg.min : 0, mx = rg.max != null ? rg.max : ((eq.params && eq.params.niveau_max) || 100); const u = (eq.params && eq.params.unite_niveau) || '%';
    return { frac: Math.max(0, Math.min(1, (raw - mn) / ((mx - mn) || 1))), texte: fr(raw) + ' ' + u }; }
  if (sp.derive_tor) {
    const hi = sp.derive_tor.haut && lire(EQ[sp.derive_tor.haut], 'etat'), lo = sp.derive_tor.bas && EQ[sp.derive_tor.bas];
    if (hi == null && !lo) return null;
    if (hi === 1) return { frac: .95, qualitatif: true, texte: 'très haut' };
    if (hi != null && !lo) return { frac: .62, qualitatif: true, texte: 'sous seuil haut' };
    if (lo) { const x = lire(lo, 'etat'); if (x != null && x === lo.params.alarme_si) return { frac: .06, qualitatif: true, texte: 'très bas' }; }
    return { frac: .62, qualitatif: true, texte: 'normal' };
  }
  return null;
}
const COMPORTEMENT_TYPE = { pompe: 'pompe', vanne: 'vanne', cuve: 'cuve', libre: 'libre' };
function etatExtra(eq, t) {   // symboles de la passe 7 : états optionnels -> « normal » sans variable, jamais « en marche » sans retour
  const d = lire(eq, 'defaut') === 1;
  if (t === 'vanne_man') { if (d) return 'defaut'; const o = lire(eq, 'ouvert'); return o === 1 ? 'ouvert' : o === 0 ? 'ferme' : 'ok'; }
  if (t === 'vanne_3v') { if (d) return 'defaut'; const o = lire(eq, 'ouvert'), p = lire(eq, 'position'); if (o != null) return o === 1 ? 'ouvert' : 'ferme'; if (p != null) return p > 2 ? 'ouvert' : 'ferme'; return 'inconnu'; }
  if (t === 'clapet') return d ? 'defaut' : 'ok';
  if (t === 'filtre') return d ? 'defaut' : lire(eq, 'colmatage') === 1 ? 'alarme' : 'ok';
  if (t === 'echangeur') return d ? 'defaut' : 'ok';
  if (t === 'transformateur') return d ? 'defaut' : 'ok';
  if (t === 'compresseur' || t === 'ventilateur' || t === 'convoyeur' || t === 'variateur') { if (d) return 'defaut'; const m = lire(eq, 'marche'); return m === 1 ? 'marche' : m === 0 ? 'arret' : 'inconnu'; }
  if (t === 'verin') { if (d) return 'defaut'; if (lire(eq, 'sorti') === 1) return 'marche'; if (lire(eq, 'rentre') === 1) return 'arret'; return 'inconnu'; }
  if (t === 'disjoncteur') { if (lire(eq, 'declenche') === 1) return 'defaut'; const f = lire(eq, 'ferme'); return f === 1 ? 'marche' : f === 0 ? 'arret' : 'inconnu'; }
  return null;
}
function etatLibre(eq) {   // liste libre d'états nommés (symbole de l'entreprise) : défaut > état actif > rien d'actif > inconnu
  const defs = eq.etats || []; let relie = 0, actif = null, defaut = false;
  defs.forEach(d => { const x = lire(eq, d.cle); if (x == null) return; relie++; if (x === 1) { if (d.defaut) defaut = true; else actif = actif || d; } });
  return defaut ? 'defaut' : actif ? 'marche' : relie ? 'arret' : 'inconnu';
}
function etat(eq) {              // état d'affichage d'un équipement
  let t = eq.type === 'image' ? (eq.type_origine || 'voyant') : eq.type;
  if (t === 'silhouette' && eq.comportement) { const c = COMPORTEMENT_TYPE[eq.comportement]; if (c === 'libre') return etatLibre(eq); if (c === 'cuve') return 'ok'; t = c || t; }
  const ex = etatExtra(eq, t); if (ex) return ex;   // une image déposée garde la logique d'état du symbole remplacé
  if (t === 'pompe' || t === 'moteur') {
    if (lire(eq, 'defaut') === 1) return 'defaut';
    const m = lire(eq, 'marche'); return m === 1 ? 'marche' : m === 0 ? 'arret' : 'inconnu';
  }
  if (t === 'vanne' || t === 'vanne_reg') {
    if (lire(eq, 'defaut') === 1) return 'defaut';
    if (lire(eq, 'ferme') === 1) return 'ferme'; if (lire(eq, 'ouvert') === 1) return 'ouvert';
    const p = lire(eq, 'position'); if (p != null) return p > 2 ? 'ouvert' : 'ferme';
    return 'inconnu';
  }
  if (t === 'voyant') { const x = lire(eq, 'etat'); const al = eq.params && eq.params.alarme_si; if (x == null) return 'inconnu'; return al != null && x === al ? 'alarme' : (al == null && x === 1 ? 'info' : 'ok'); }
  if (t === 'mesure') { const x = lire(eq, 'valeur'); const sz = eq.params && eq.params.seuils; if (x == null) return 'inconnu';
    if (sz && ((sz.haut != null && x > sz.haut) || (sz.bas != null && x < sz.bas))) return 'alarme'; return 'ok'; }
  return 'ok';
}
const aVerifier = (eq) => !!eq.a_verifier || Object.entries(eq.slots || {}).some(([n, sp]) => slotRelie(sp, n) && sp.a_verifier);

/* ------------------------------------------------------------------ alarmes */
const ALARMES = [];
function collecteAlarmes() {
  ALARMES.length = 0;
  const t0 = new Date(Date.now() - 12 * 60000 - 25 * 60000);
  const hh = t0.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  for (const e of M.equipements) {
    const st = etat(e);
    if (st === 'alarme') {
      let txt = (e.params && e.params.libelle_alarme) || e.libelle;
      if (e.type === 'mesure' && e.params.seuils && e.params.seuils.haut != null) txt = e.libelle + ' haute';
      ALARMES.push({ id: e.id, texte: txt, depuis: hh });
    } else if (st === 'defaut') ALARMES.push({ id: e.id, texte: 'Défaut ' + e.libelle.toLowerCase(), depuis: hh });
  }
  for (const b of M.bandeau || []) { const x = V[b.variable]; if (b.alarme_si != null && x === b.alarme_si) ALARMES.push({ id: b.id, texte: b.libelle_alarme || b.libelle, depuis: hh }); }
}

/* ------------------------------------------------------------------ activité des liaisons (écoulement) */
const ACTIF = {};
const typeEff = (e) => e.type === 'image' ? (e.type_origine || 'voyant') : (e.type === 'silhouette' && e.comportement === 'pompe') ? 'pompe' : (['compresseur', 'ventilateur'].includes(e.type) ? 'pompe' : e.type);
function calculeActivite() {
  // preuve = débit mesuré en ligne (> 0,5) ; sinon l'activité suit la source ; source inconnue → conduite sans animation (jamais « en marche » par défaut)
  for (const k of Object.keys(ACTIF)) delete ACTIF[k];
  const nodes = {}; L.noeuds.forEach(n => { const e = EQ[n.id]; const st = etat(e);
    nodes[n.id] = { e, actif: (typeEff(e) === 'pompe' || typeEff(e) === 'moteur') ? (st === 'marche' ? true : null) : (e.type === 'raccord' && e.sens === 'entree' ? null : null) }; });
  const preuve = (a) => { // débit mesuré sur la conduite : true/false/null ; une vanne fermée coupe
    let r = null;
    for (const i of (a.inline || [])) { const q = EQ[i]; if (!q) continue;
      if (['vanne', 'vanne_man', 'vanne_3v'].includes(q.type) && etat(q) === 'ferme') return false;
      if (q.type === 'mesure' && q.grandeur === 'debit') { const x = lire(q, 'valeur'); if (x != null) r = x > 0.5; } }
    return r;
  };
  for (let it = 0; it < 12; it++) for (const a of L.aretes) {
    const src = nodes[a.nd], dst = nodes[a.na]; if (!src || !dst) continue;
    let act;
    if (a.fluide === 'boue') { const v = (L.noeuds.find(n => n.id === a.nd).rattaches || { vannes: [] }).vannes.map(x => etat(EQ[x])); act = v.some(x => x === 'ouvert') ? true : v.every(x => x === 'ferme') && v.length ? false : null; }
    else { const p = preuve(a); act = p !== null ? p : (src.actif === false ? false : (src.actif === true ? true : null)); }
    ACTIF[a.id] = act === true;
    if (act === true && !['pompe', 'moteur'].includes(typeEff(dst.e)) && dst.e.type !== 'raccord') dst.actif = true;
    if (act === true && src.e.type === 'raccord' && src.actif == null) src.actif = true;   // le terminal d'entrée suit la preuve aval
  }
}


/* ======================================================================
   MODULE : symboles — dessin des symboles de base
   ====================================================================== */

/* ------------------------------------------------------------------ normaliseur de silhouettes (le style n'est jamais celui du modèle) */
const NORM = { rejets: 0 };
function normaliser(sil, k, ox, oy) {
  const g = []; const c = (x) => Math.max(-6, Math.min(sil.largeur + 6, +x || 0));
  const X = (x) => ox + c(x) * k, Y = (y) => oy + Math.max(-6, Math.min(sil.hauteur + 6, +y || 0)) * k;
  for (const p of sil.primitives || []) {
    const role = p.role || 'trait';
    if (p.t === 'rect') g.push(s('rect', { x: X(p.x), y: Y(p.y), width: p.w * k, height: p.h * k, rx: (p.rx || 0) * k, class: role === 'corps' ? 'corps' : 'trait' }));
    else if (p.t === 'ligne') g.push(s('line', { x1: X(p.x1), y1: Y(p.y1), x2: X(p.x2), y2: Y(p.y2), class: 'trait' }));
    else if (p.t === 'cercle') { g.push(s('circle', { cx: X(p.cx), cy: Y(p.cy), r: p.r * k, class: role === 'moteur' ? 'corps' : 'trait' })); if (p.lettre) g.push(s('text', { x: X(p.cx), y: Y(p.cy), class: 'lettres', text: String(p.lettre).slice(0, 2) })); }
    else if (p.t === 'poly') g.push(s('polygon', { points: p.pts.map(q => `${X(q[0])},${Y(q[1])}`).join(' '), class: role === 'rotor' ? 'trait pale' : 'trait' }));
    else if (p.t === 'arc') {
      const a0 = p.a0 * Math.PI / 180, a1 = p.a1 * Math.PI / 180, r = p.r * k;
      const x0 = X(p.cx) + r * Math.cos(a0), y0 = Y(p.cy) + r * Math.sin(a0), x1 = X(p.cx) + r * Math.cos(a1), y1 = Y(p.cy) + r * Math.sin(a1);
      g.push(s('path', { d: `M${x0} ${y0} A${r} ${r} 0 ${(p.a1 - p.a0) > 180 ? 1 : 0} 1 ${x1} ${y1}`, class: 'trait' }));
    } else if (p.t === 'ellipse') {   // éditeur de formes : ellipse = polygone fermé à 32 points
      const pts = []; for (let i = 0; i < 32; i++) { const a = i * Math.PI / 16; pts.push(`${X(p.cx + p.rx * Math.cos(a))},${Y(p.cy + p.ry * Math.sin(a))}`); }
      g.push(s('polygon', { points: pts.join(' '), class: 'trait' }));
    } else if (p.t === 'path' && /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s-]+$/.test(p.d || '')) {   // import SVG en dernier recours : tracé conservé, recoloré au style imposé
      g.push(s('path', { d: p.d, transform: `translate(${ox} ${oy}) scale(${k})`, class: 'trait', 'vector-effect': 'non-scaling-stroke' }));
    } else NORM.rejets++;
  }
  return g;
}
/* centre d'une primitive (pour rattacher les formes à la zone « partie tournante » de l'éditeur de formes) */
function centrePrim(p) {
  if (p.t === 'rect') return [p.x + p.w / 2, p.y + p.h / 2]; if (p.t === 'ligne') return [(p.x1 + p.x2) / 2, (p.y1 + p.y2) / 2];
  if (p.t === 'cercle' || p.t === 'arc' || p.t === 'ellipse') return [p.cx, p.cy];
  if (p.t === 'poly' && p.pts && p.pts.length) return [p.pts.reduce((a, q) => a + q[0], 0) / p.pts.length, p.pts.reduce((a, q) => a + q[1], 0) / p.pts.length];
  return [0, 0];
}
/* silhouette + animations déclarées : partie tournante (tourne en marche) ou niveau (remplissage) */
function silhouetteAnimee(e, sil, g, st) {
  const z = e.zone_anim; if (!z || !z.type) return normaliser(sil, g.k, g.sx, g.sy);
  const dedans = (p) => { const c = centrePrim(p); return c[0] >= z.x && c[0] <= z.x + z.w && c[1] >= z.y && c[1] <= z.y + z.h; };
  const fixes = (sil.primitives || []).filter(p => z.type === 'niveau' || !dedans(p)), mob = (sil.primitives || []).filter(p => z.type === 'rotor' && dedans(p));
  const out = [];
  if (z.type === 'niveau') { const lv = niveau(e), fr_ = lv ? lv.frac : 0.4, k = g.k, hh = z.h * fr_;
    out.push(s('rect', { x: g.sx + z.x * k, y: g.sy + (z.y + z.h - hh) * k, width: z.w * k, height: hh * k, class: lv ? 'eau' : 'contenu', rx: 2 })); }
  out.push(...normaliser(Object.assign({}, sil, { primitives: fixes }), g.k, g.sx, g.sy));
  if (mob.length) out.push(s('g', { class: 'rotor' }, ...normaliser(Object.assign({}, sil, { primitives: mob }), g.k, g.sx, g.sy)));
  return out;
}

/* ------------------------------------------------------------------ symboles */
// Vanne papillon + tige + tête d'actionneur (forme du simulateur STEMI, re-colorée dans la charte du portail) ;
// `vert` = conduite verticale (corps le long de la conduite, actionneur sur le côté). Les tirets traversent le corps quand elle est ouverte.
function vanneSym(x, y, vert, k) {
  k = k || 1; const a = 16 * k, b = 12 * k;
  const corps = vert ? `M${x - b} ${y - a} L${x + b} ${y + a} L${x - b} ${y + a} L${x + b} ${y - a} Z` : `M${x - a} ${y - b} L${x + a} ${y + b} L${x + a} ${y - b} L${x - a} ${y + b} Z`;
  return [
    vert ? s('line', { x1: x, y1: y - a - 8, x2: x, y2: y + a + 8, class: 'vanne-flux' }) : s('line', { x1: x - a - 8, y1: y, x2: x + a + 8, y2: y, class: 'vanne-flux' }),
    vert ? s('line', { x1: x, y1: y, x2: x + 22 * k, y2: y, class: 'trait vanne-tige' }) : s('line', { x1: x, y1: y, x2: x, y2: y - 22 * k, class: 'trait vanne-tige' }),
    vert ? s('rect', { x: x + 21 * k, y: y - 8 * k, width: 11 * k, height: 16 * k, rx: 2, class: 'actionneur' }) : s('rect', { x: x - 8 * k, y: y - 32 * k, width: 16 * k, height: 11 * k, rx: 2, class: 'actionneur' }),
    s('path', { d: corps, class: 'corps vanne-corps' })];
}
function lettresMesure(e) { return G.lettres(e.id); }
const aEtatFixe = (e) => e.type === 'cuve' || e.type === 'parametre';   // ouvrages : une ligne d'état à place fixe, juste sous le repère
function textes(g, e, n, etatTxt) { // étiquette standard : repère, [état de l'ouvrage], libellé
  const lb = g.label; if (!lb) return [];
  const dec = aEtatFixe(e) ? 1.75 : 0;
  const o = [s('text', { x: lb.x, y: lb.y + 12, class: 'tag', text: e.id + (textes.suf || '') })];
  if (dec && etatTxt) o.push(s('text', { x: lb.x, y: lb.y + 12, dy: '1.3em', class: 'val u etat-ouvrage', text: etatTxt }));
  g.lignes.forEach((l, i) => o.push(s('text', { x: lb.x, y: lb.y + 12, dy: (1.35 + dec + i * 1.22) + 'em', class: 'lib', text: l })));
  return o;
}
function marqueInconnu(x, y) { return s('g', { class: 'inc-g' }, s('circle', { cx: x, cy: y, r: 7.5, class: 'inc' }), s('text', { x, y: y + 0.5, class: 'inc-t', text: '?' })); }
function marqueVerif(e, x, y) { return aVerifier(e) ? s('g', { class: 'verif-g' }, s('circle', { cx: x, cy: y, r: 5.5, class: 'verif' })) : null; }

function symPompe(e, g) {
  const st = etat(e), r = g.r, cx = g.cx, cy = g.cy; const dos = (e.variante === 'doseuse' || e.variante === 'vide_fut');
  const glyph = dos
    ? s('path', { d: `M${cx - 9} ${cy - 10} V${cy + 10} M${cx + 1} ${cy - 10} V${cy + 10} M${cx + 1} ${cy} H${cx + 14}`, class: 'trait' })
    : s('path', { d: `M${cx - r * .55} ${cy - r * .62} L${cx + r} ${cy} L${cx - r * .55} ${cy + r * .62}`, class: 'trait' });
  const sp = lire(e, 'vitesse');
  return { cls: st, corps: [s('circle', { cx, cy, r: r + 8, class: 'anneau', style: `animation-duration:${sp != null ? Math.max(.7, 2.6 - sp / 45) : 1.8}s` }), s('circle', { cx, cy, r, class: 'corps plein' }), glyph],
    val: null, suffixe: (sp != null ? ' · ' + fr(sp, 0) + ' %' : ''), box: [cx - r - 10, cy - r - 10, 2 * r + 20, 2 * r + 20], verif: [cx + r * .72, cy - r * .72], inc: st === 'inconnu' ? [cx - r * .78, cy - r * .78] : null };
}
function symCuve(e, g, n) {
  const c = g.corps, lv = niveau(e), parts = [];
  const id = 'cl_' + e.id.replace(/\W/g, '');
  if (e.forme === 'silo' || e.forme === 'bassin') {   // passe 7 : silo (trémie conique) et bassin ouvert, dans le même cadre que la cuve
    const x0 = c.x, y0 = c.y, w = c.w, hh = c.h, cx0 = x0 + w / 2;
    const d = e.forme === 'silo' ? `M${x0} ${y0} H${x0 + w} V${y0 + hh * .62} L${cx0 + 12} ${y0 + hh} H${cx0 - 12} L${x0} ${y0 + hh * .62} Z` : `M${x0} ${y0 - 6} V${y0 + hh - 8} Q${x0} ${y0 + hh} ${x0 + 8} ${y0 + hh} H${x0 + w - 8} Q${x0 + w} ${y0 + hh} ${x0 + w} ${y0 + hh - 8} V${y0 - 6}`;
    parts.push(s('clipPath', { id }, s('path', { d: d + (e.forme === 'silo' ? '' : ` Z`) }))); parts.push(s('path', { d, class: 'corps' }));
    if (e.forme === 'silo') parts.push(s('line', { x1: x0, x2: x0 + w, y1: y0, y2: y0, class: 'trait' }));
  } else {
  parts.push(s('clipPath', { id }, s('rect', { x: c.x + 1, y: c.y + 1, width: c.w - 2, height: c.h - 2, rx: 6 })));
  parts.push(s('rect', { x: c.x, y: c.y, width: c.w, height: c.h, rx: 7, class: 'corps' })); }
  const fr_ = lv ? lv.frac : 0.4, yy = c.y + c.h - c.h * fr_;
  parts.push(s('g', { 'clip-path': `url(#${id})` }, s('rect', { x: c.x, y: yy, width: c.w, height: c.y + c.h - yy, class: lv ? 'eau' : 'contenu' }),
    s('line', { x1: c.x, x2: c.x + c.w, y1: yy, y2: yy, class: lv ? 'surf' : 'contenu-s' })));
  let cls = 'ok', val = null;
  if (lv) val = { t: lv.texte };
  if (g.moteur) {
    const m = g.moteur, em = n.rattaches && EQ[n.rattaches.moteur]; const stm = em ? etat(em) : 'inconnu'; cls = '';
    const bas = c.y + c.h - 18; const incM = stm === 'inconnu';
    const gm = s('g', { class: stm }, s('line', { x1: m.x, y1: m.y + m.r, x2: m.x, y2: bas, class: 'trait' }),
      s('g', { class: 'pale' }, s('path', { d: `M${m.x - 22} ${bas - 6} L${m.x} ${bas} L${m.x + 22} ${bas - 6} M${m.x - 22} ${bas + 7} L${m.x} ${bas} L${m.x + 22} ${bas + 7}`, class: 'trait' })),
      s('circle', { cx: m.x, cy: m.y, r: m.r + 7, class: 'anneau' }), s('circle', { cx: m.x, cy: m.y, r: m.r, class: 'corps plein' }), s('text', { x: m.x, y: m.y, class: 'lettres', text: 'M' }));
    gm.dataset.eq = em ? em.id : ''; gm.classList.add('obj', 'moteur-sel'); gm.append(s('rect', { class: 'halo', x: m.x - m.r - 9, y: m.y - m.r - 9, width: 2 * m.r + 18, height: 2 * m.r + 18 }));
    if (em && aVerifier(em)) gm.append(s('circle', { cx: m.x + m.r * .8, cy: m.y - m.r * .8, r: 4.5, class: 'verif verif-g' }));
    if (incM) gm.append(marqueInconnu(m.x - m.r * .95, m.y - m.r * .95));
    parts.push(gm);
  }
  return { cls, corps: parts, val, box: [c.x - 6, 0, c.w + 12, c.y + c.h + 6], verif: [c.x + c.w - 2, c.y + 2] };
}
function symDecanteur(e, g, n) {
  const c = g.corps, lv = niveau(e), parts = [], hw = g.hw, th = g.tremie_h, yb = c.y + c.h, nT = g.tremies;
  let d = `M${c.x} ${c.y} L${c.x + c.w} ${c.y} L${c.x + c.w} ${yb} `;
  for (let i = nT - 1; i >= 0; i--) d += `L${c.x + (i + 1) * hw} ${yb} L${c.x + i * hw + hw / 2} ${yb + th} L${c.x + i * hw} ${yb} `;
  d += 'Z';
  const id = 'cl_' + e.id.replace(/\W/g, '');
  parts.push(s('clipPath', { id }, s('path', { d })));
  parts.push(s('path', { d, class: 'corps' }));
  const total = c.h + th, fr_ = lv ? lv.frac : 0.4, yy = c.y + c.h - (c.h) * fr_ + 0;
  parts.push(s('g', { 'clip-path': `url(#${id})` }, s('rect', { x: c.x, y: yy, width: c.w, height: yb + th - yy, class: lv ? 'eau' : 'contenu' }), s('line', { x1: c.x, x2: c.x + c.w, y1: yy, y2: yy, class: lv ? 'surf' : 'contenu-s' })));
  const k = (e.params && e.params.lamelles) || 12;
  for (let i = 0; i < k; i++) { const x = c.x + 18 + i * (c.w - 60) / k; parts.push(s('line', { x1: x, y1: c.y + 22, x2: x + 26, y2: c.y + c.h - 14, class: 'lamelle' })); }
  // trémies : vanne d'extraction + conduite de purge + collecteur
  const vs = g.vannes; const x0 = vs.length ? Math.min(...vs.map(v => v.tx)) : 0; let anyOpen = false;
  for (const v of vs) {
    const ev = EQ[v.id], st = etat(ev), open = st === 'ouvert'; anyOpen = anyOpen || open;
    parts.push(s('path', { d: `M${v.tx} ${v.ty} V${g.collecteurY}`, class: 'tuyau fine f-boue' + (open ? ' actif' : '') }));
    parts.push(s('path', { d: `M${v.tx} ${v.ty} V${g.collecteurY}`, class: 'flux f-boue' + (open ? ' actif' : '') }));
    const vy = v.vy;
    const gv = s('g', { class: 'obj ' + st, 'data-eq': v.id },
      s('rect', { class: 'halo', x: v.tx - 18, y: vy - 22, width: 56, height: 44 }),
      ...vanneSym(v.tx, vy, true, 0.9));
    if (aVerifier(ev)) gv.append(s('circle', { cx: v.tx - 14, cy: vy - 14, r: 4.5, class: 'verif verif-g' }));
    parts.push(gv);
    parts.push(s('text', { x: v.tx, y: g.collecteurY + 17, class: 'tag', text: v.id.replace(/^[A-Z]+-/, '') }));
  }
  if (vs.length) {
    const xe = g.ports.boues.x;
    parts.push(s('path', { d: `M${x0} ${g.collecteurY} H${xe}`, class: 'tuyau f-boue' + (anyOpen ? ' actif' : '') }));
    parts.push(s('path', { d: `M${x0} ${g.collecteurY} H${xe}`, class: 'flux f-boue' + (anyOpen ? ' actif' : '') }));
  }
  return { cls: 'ok', corps: parts, val: lv ? { t: lv.texte } : null, box: [c.x - 6, 0, c.w + 12, c.y + c.h + th + 6], verif: [c.x + c.w, c.y], nobox: true };
}
function symSilhouette(e, g) {
  const sil = e.silhouette || { largeur: 100, hauteur: 100, primitives: [] }; const st = etat(e);
  const parts = [];
  if (sil.liquide) { const q = sil.liquide, k = g.k; parts.push(s('rect', { x: g.sx + q.x * k, y: g.sy + q.y * k, width: q.w * k, height: q.h * k, class: 'eau', rx: 3 })); }
  parts.push(...silhouetteAnimee(e, sil, g, st));
  return { cls: st, corps: parts, box: [g.sx - 6, g.sy - 6, g.sw + 12, g.sh + 12], verif: [g.sx + g.sw, g.sy] };
}
function symImage(e, g) {
  const st = etat(e);
  const parts = [s('rect', { x: g.ix, y: g.iy, width: g.iw, height: g.ih, rx: 9, class: 'corps cadre-image' })];
  if (e.image) { const id = 'cl_' + e.id.replace(/\W/g, ''); parts.push(s('clipPath', { id }, s('rect', { x: g.ix + 4, y: g.iy + 4, width: g.iw - 8, height: g.ih - 8, rx: 6 })));
    parts.push(s('image', { href: e.image, x: g.ix + 4, y: g.iy + 4, width: g.iw - 8, height: g.ih - 8, preserveAspectRatio: 'xMidYMid meet', class: 'img-grise', 'clip-path': `url(#${id})` })); }
  else parts.push(s('text', { x: g.cx, y: g.cy, class: 'lib', text: 'image' }));
  parts.push(s('circle', { cx: g.ix + g.iw - 12, cy: g.iy + 12, r: 6, class: 'pastille ' + (st === 'marche' || st === 'ouvert' || st === 'ok' || st === 'info' ? 'ok' : st) }));
  return { cls: st, corps: parts, box: [g.ix - 6, g.iy - 6, g.iw + 12, g.ih + 12], verif: [g.ix + g.iw, g.iy], inc: null };
}
function symRaccord(e, g) {
  return { cls: 'raccord', corps: [s('rect', { x: 0, y: 0, width: 34, height: 34, rx: 9, class: 'corps' }),
    s('path', { d: 'M9 17 H25 M19 11 L25 17 L19 23', class: 'trait', style: 'stroke:#9aa8b3' })], box: [-4, -4, 42, 42] };
}
function symIsole(e, g) {
  const st = etat(e), cx = g.cx, cy = g.cy, r = g.r;
  if (e.type === 'voyant') { const on = st === 'alarme' ? 'on' : st === 'info' ? 'info' : st === 'ok' ? '' : ''; return { cls: st, corps: [s('circle', { cx, cy, r: 11 * (g.f || 1), class: 'lamp ' + on })], box: [cx - 18 * (g.f || 1), cy - 18 * (g.f || 1), 36 * (g.f || 1), 36 * (g.f || 1)] }; }
  if (e.type === 'vanne' || e.type === 'vanne_reg') { const p = e.type === 'vanne_reg' ? lire(e, 'position') : null;
    const kv = 1.1 * (g.f || 1), corps = vanneSym(cx, cy, false, kv); if (e.type === 'vanne_reg') corps.push(s('text', { x: cx, y: cy - 32 * kv + 6, class: 'lettres', style: 'font-size:9px', text: p != null ? fr(p, 0) + '%' : '%' }));
    return { cls: st, corps, box: [cx - 30 * (g.f || 1), cy - 42 * (g.f || 1), 60 * (g.f || 1), 70 * (g.f || 1)] }; }
  if (e.type === 'moteur') return { cls: st, corps: [s('circle', { cx, cy, r: r + 7, class: 'anneau' }), s('circle', { cx, cy, r, class: 'corps plein' }), s('text', { x: cx, y: cy, class: 'lettres', text: 'M' })], box: [cx - r - 8, cy - r - 8, 2 * r + 16, 2 * r + 16], verif: [cx + r * .72, cy - r * .72], inc: st === 'inconnu' ? [cx - r * .78, cy - r * .78] : null };
  return { cls: st, corps: [s('circle', { cx, cy, r, class: 'corps' }), s('line', { x1: cx - r, y1: cy, x2: cx + r, y2: cy, class: 'trait', style: 'stroke-width:1;opacity:.5' }), s('text', { x: cx, y: cy - 6, class: 'lettres', text: lettresMesure(e) })], box: [cx - r - 4, cy - r - 4, 2 * r + 8, 2 * r + 8] };
}

/* cellule d'un instrument : annexe d'un récipient, vanne en ligne, piquage alterné dessus/dessous (P&ID), pastille compacte (sans donnée) */
function celluleInstrument(e, cx, cy, opt) {
  opt = opt || {}; const st = etat(e);
  const g = s('g', { class: 'obj ' + st, 'data-eq': e.id });
  const donnee = aDonnee(e) || e.type === 'vanne';
  const tagTxt = opt.annexe ? G.tagCourt(e.id, opt.hote) : e.id;
  const ti = s('title', { text: `${e.id} · ${e.libelle}${st === 'inconnu' ? ' · état inconnu (aucune variable reliée)' : ''}` }); g.append(ti);
  const valeur = (x, y, cls) => { const v = lire(e, 'valeur'); return (e.type === 'mesure' && v != null) ? s('text', { x, y, class: 'val' + (st === 'alarme' ? ' alerte' : ''), text: fr(v) + ' ' + ((e.params && e.params.unite) || '') }) : null; };
  const verif = (x, y) => aVerifier(e) ? s('circle', { cx: x, cy: y, r: 4.5, class: 'verif verif-g' }) : null;
  const symbole = (x, y, ra, petit) => {
    if (e.type === 'vanne' || e.type === 'vanne_reg') return vanneSym(x, y, false, 1);
    if (e.type === 'voyant') return [s('circle', { cx: x, cy: y, r: 9, class: 'lamp ' + (st === 'alarme' ? 'on' : st === 'info' ? 'info' : '') })];
    return [s('circle', { cx: x, cy: y, r: ra, class: 'corps' }), s('line', { x1: x - ra, y1: y, x2: x + ra, y2: y, class: 'trait', style: 'stroke-width:1;opacity:.4' }),
      s('text', { x, y: y - (petit ? 3 : 5), class: 'lettres', style: petit ? 'font-size:9px' : '', text: lettresMesure(e) })];
  };
  if (opt.annexe) {
    g.append(s('rect', { class: 'halo', x: cx - 31, y: cy - 19, width: 62, height: 66 }));
    symbole(cx, cy, 13, true).forEach(n => g.append(n));
    g.append(s('text', { x: cx, y: cy + 29, class: 'tag hov', text: tagTxt }));
    const v = valeur(cx, cy + 45); if (v) g.append(v);
    const vf = verif(cx + 10, cy - 10); if (vf) g.append(vf);
  } else if (opt.mode === 'piquage') {
    const yb = cy + opt.side * G.TAP, ra = 15;
    g.append(s('rect', { class: 'halo', x: cx - 30, y: opt.side < 0 ? yb - ra - 44 : cy - 4, width: 60, height: ra + 44 + G.TAP - 4 + 6 }));
    g.append(s('line', { x1: cx, y1: cy, x2: cx, y2: yb - opt.side * ra, class: 'trait stub' }), s('circle', { cx, cy, r: 3, class: 'noeud-t' }));
    symbole(cx, yb, ra, false).forEach(n => g.append(n));
    const vy = opt.side < 0 ? yb - ra - 7 : yb + ra + 17, ty = opt.side < 0 ? yb - ra - 24 : yb + ra + 33;
    const v = valeur(cx, vy); if (v) g.append(v); else g.append(s('text', { x: cx, y: vy, class: 'val vide', text: '—' }));
    g.append(s('text', { x: cx, y: ty, class: 'tag hov', text: tagTxt }));
    const vf = verif(cx + ra * .8, yb - ra * .8); if (vf) g.append(vf);
  } else if (opt.mode === 'compact') {
    g.append(s('rect', { class: 'halo', x: cx - 18, y: cy - 20, width: 36, height: 40 }));
    symbole(cx, cy, 11, true).forEach(n => g.append(n));
    g.append(s('text', { x: cx, y: cy + 26, class: 'tag cmp', text: tagTxt }));
    const vf = verif(cx + 9, cy - 9); if (vf) g.append(vf);
  } else {  // vanne (ou autre) dans la ligne
    g.append(s('rect', { class: 'halo', x: cx - 26, y: cy - 38, width: 52, height: 76 }));
    symbole(cx, cy, 17, false).forEach(n => g.append(n));
    g.append(s('text', { x: cx, y: cy + 33, class: 'tag', text: tagTxt }));
    if (st === 'inconnu') g.append(marqueInconnu(cx + 15, cy - 14));
    const vf = verif(cx - 15, cy - 14); if (vf) g.append(vf);
  }
  return g;
}

/* ------------------------------------------------------------------ tracé orthogonal arrondi */
function cheminArrondi(pts, r = 9) {
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
    const l1 = Math.hypot(x1 - x0, y1 - y0), l2 = Math.hypot(x2 - x1, y2 - y1), rr = Math.min(r, l1 / 2, l2 / 2);
    if (rr < 1) { d += ` L${x1} ${y1}`; continue; }
    const ax = x1 - (x1 - x0) / l1 * rr, ay = y1 - (y1 - y0) / l1 * rr, bx = x1 + (x2 - x1) / l2 * rr, by = y1 + (y2 - y1) / l2 * rr;
    d += ` L${ax} ${ay} Q${x1} ${y1} ${bx} ${by}`;
  }
  const f = pts[pts.length - 1]; return d + ` L${f[0]} ${f[1]}`;
}


/* ======================================================================
   MODULE : symboles_p7 — dessin des symboles supplémentaires (passe 7)
   ====================================================================== */

/* Passe 7 — dessin des symboles ajoutés à la palette (vanne manuelle, vanne 3 voies, clapet, filtre, échangeur, compresseur,
   ventilateur, convoyeur, vérin, disjoncteur, transformateur, variateur). Même langage graphique que les symboles existants :
   un trait (classe `trait`), un corps légèrement rempli (`corps`), la couleur n'apparaît que par l'état (classe de l'objet).
   Géométrie (taille, ports) : GEOM.EXTRA dans geom.js. Chaque fonction reçoit le centre (cx, cy) et le facteur de taille k. */
const TRI = (cx, cy, k, pts) => 'M' + pts.map(p => `${cx + p[0] * k} ${cy + p[1] * k}`).join(' L') + ' Z';
function valeurSym(e, g, nom, unite, d) {
  const x = lire(e, nom); return x == null ? null : fr(x, d == null ? 1 : d) + ' ' + unite;
}
function symExtra(e, g) {
  const st = etat(e), t = e.type, cx = g.cx, cy = g.cy, k = g.f || 1, rw = g.rw, rh = g.rh, o = [];
  const fils = (demi) => { o.push(s('path', { d: `M${cx - rw - 8} ${cy} H${cx - demi} M${cx + demi} ${cy} H${cx + rw + 8}`, class: 'trait' })); };
  let val = null, anim = {};
  if (t === 'vanne_man' || t === 'vanne_3v') {
    const v = vanneSym(cx, cy, false, k);
    if (t === 'vanne_man') {   // manuelle : volant (barre) à la place de l'actionneur
      v.splice(2, 1, s('line', { x1: cx - 9 * k, y1: cy - 23 * k, x2: cx + 9 * k, y2: cy - 23 * k, class: 'trait vanne-tige' }));
    } else v.push(s('path', { d: TRI(cx, cy, k, [[0, 0], [-12, 22], [12, 22]]), class: 'corps vanne-corps' }));
    if (t === 'vanne_3v') v.push(s('line', { x1: cx, y1: cy + 22 * k, x2: cx, y2: cy + 30 * k, class: 'trait' }));
    o.push(...v);
  } else if (t === 'clapet') {
    fils(13 * k);
    o.push(s('circle', { cx, cy, r: 13 * k, class: 'corps plein' }), s('path', { d: TRI(cx, cy, k, [[-5, -7], [6, 0], [-5, 7]]), class: 'trait' }), s('path', { d: `M${cx + 8 * k} ${cy - 8 * k} V${cy + 8 * k}`, class: 'trait' }));
  } else if (t === 'filtre') {
    fils(14 * k); const id = 'cl_' + e.id.replace(/\W/g, '');
    o.push(s('clipPath', { id }, s('rect', { x: cx - 14 * k, y: cy - 20 * k, width: 28 * k, height: 40 * k, rx: 4 * k })));
    o.push(s('rect', { x: cx - 14 * k, y: cy - 20 * k, width: 28 * k, height: 40 * k, rx: 4 * k, class: 'corps' }));
    const hach = []; for (let d = -30; d <= 30; d += 9) hach.push(s('line', { x1: cx + (d - 20) * k, y1: cy + 20 * k, x2: cx + (d + 20) * k, y2: cy - 20 * k, class: 'trait', style: 'stroke-width:1.1;opacity:.55' }));
    o.push(s('g', { 'clip-path': `url(#${id})` }, ...hach));
    val = valeurSym(e, g, 'dp', 'bar', 2);
  } else if (t === 'echangeur') {
    fils(28 * k); const w = 56 * k, hh = 40 * k;
    o.push(s('path', { d: `M${cx - 16 * k} ${cy - 24 * k} V${cy - 20 * k} M${cx + 16 * k} ${cy - 24 * k} V${cy - 20 * k}`, class: 'trait' }));
    o.push(s('rect', { x: cx - w / 2, y: cy - hh / 2, width: w, height: hh, rx: 10 * k, class: 'corps' }));
    o.push(s('path', { d: `M${cx - 20 * k} ${cy + 8 * k} L${cx - 10 * k} ${cy - 8 * k} L${cx} ${cy + 8 * k} L${cx + 10 * k} ${cy - 8 * k} L${cx + 20 * k} ${cy + 8 * k}`, class: 'trait' }));
    const a = lire(e, 'entree_t'), b = lire(e, 'sortie_t'); if (a != null || b != null) val = (a != null ? fr(a) : '—') + ' → ' + (b != null ? fr(b) : '—') + ' °C';
  } else if (t === 'compresseur') {
    fils(20 * k); const sp = lire(e, 'vitesse');
    o.push(s('circle', { cx, cy, r: 25 * k, class: 'anneau', style: `animation-duration:${sp != null ? Math.max(.7, 2.6 - sp / 45) : 1.8}s` }), s('circle', { cx, cy, r: 20 * k, class: 'corps plein' }),
      s('path', { d: `M${cx - 12 * k} ${cy - 12 * k} L${cx + 14 * k} ${cy - 5 * k} M${cx - 12 * k} ${cy + 12 * k} L${cx + 14 * k} ${cy + 5 * k}`, class: 'trait' }));
  } else if (t === 'ventilateur') {
    fils(20 * k); const lames = [0, 90, 180, 270].map(a => s('ellipse', { cx, cy: cy - 9 * k, rx: 3.6 * k, ry: 8 * k, transform: `rotate(${a} ${cx} ${cy})`, class: 'trait' }));
    o.push(s('circle', { cx, cy, r: 20 * k, class: 'corps plein' }), s('g', { class: 'rotor' }, ...lames), s('circle', { cx, cy, r: 2.2 * k, class: 'trait' }));
  } else if (t === 'convoyeur') {
    fils(52 * k);
    o.push(s('rect', { x: cx - 52 * k, y: cy - 12 * k, width: 104 * k, height: 24 * k, rx: 12 * k, class: 'corps plein' }),
      s('circle', { cx: cx - 40 * k, cy, r: 4 * k, class: 'trait' }), s('circle', { cx: cx + 40 * k, cy, r: 4 * k, class: 'trait' }),
      s('path', { d: `M${cx - 33 * k} ${cy} H${cx + 33 * k}`, class: 'trait defile' }));
  } else if (t === 'verin') {
    const sorti = st === 'marche'; const bx = cx - 40 * k, ex = cx + (sorti ? 46 : 16) * k;
    o.push(s('path', { d: `M${cx - 30 * k} ${cy - 10 * k} V${cy - 14 * k} M${cx - 2 * k} ${cy - 10 * k} V${cy - 14 * k}`, class: 'trait' }));
    o.push(s('rect', { x: bx, y: cy - 10 * k, width: 44 * k, height: 20 * k, rx: 3 * k, class: 'corps plein' }), s('circle', { cx: bx - 5 * k, cy, r: 3.5 * k, class: 'trait' }));
    o.push(s('g', { class: 'tige-v' }, s('path', { d: `M${cx - 2 * k} ${cy - 7 * k} V${cy + 7 * k} M${cx + 4 * k} ${cy} H${ex} M${ex} ${cy - 8 * k} V${cy + 8 * k}`, class: 'trait' })));
  } else if (t === 'disjoncteur') {
    fils(22 * k); const ferme = st === 'marche';
    o.push(s('rect', { x: cx - 22 * k, y: cy - 20 * k, width: 44 * k, height: 40 * k, rx: 6 * k, class: 'corps' }),
      s('circle', { cx: cx - 12 * k, cy, r: 2.6 * k, class: 'trait' }), s('circle', { cx: cx + 12 * k, cy, r: 2.6 * k, class: 'trait' }));
    const bx = ferme ? cx + 12 * k : cx + 7 * k, by = ferme ? cy : cy - 14 * k;
    o.push(s('path', { d: `M${cx - 12 * k} ${cy} L${bx} ${by} M${(cx - 12 * k + bx) / 2 - 3 * k} ${(cy + by) / 2 - 3 * k} l${6 * k} ${6 * k} m${-6 * k} 0 l${6 * k} ${-6 * k}`, class: 'trait' }));
  } else if (t === 'transformateur') {
    fils(23 * k);
    o.push(s('circle', { cx: cx - 9 * k, cy, r: 14 * k, class: 'corps' }), s('circle', { cx: cx + 9 * k, cy, r: 14 * k, class: 'trait' }));
    val = valeurSym(e, g, 'temperature', '°C', 0);
  } else if (t === 'variateur') {
    fils(24 * k);
    o.push(s('rect', { x: cx - 24 * k, y: cy - 18 * k, width: 48 * k, height: 36 * k, rx: 5 * k, class: 'corps' }), s('path', { d: `M${cx - 24 * k} ${cy + 18 * k} L${cx + 24 * k} ${cy - 18 * k}`, class: 'trait' }),
      s('path', { d: `M${cx - 18 * k} ${cy - 8 * k} q${4 * k} ${-9 * k} ${8 * k} 0 t${8 * k} 0 M${cx + 4 * k} ${cy + 7 * k} h${12 * k} M${cx + 4 * k} ${cy + 12 * k} h${12 * k}`, class: 'trait' }));
    val = valeurSym(e, g, 'frequence', 'Hz', 0);
  }
  if (g.aVal) o.push(s('text', { x: cx, y: g.valY + 2, class: 'val' + (val == null ? ' vide' : ''), text: val == null ? '' : val }));
  const rotor = ['compresseur', 'ventilateur'].includes(t);
  return { cls: st, corps: o, box: [cx - rw - 8, cy - rh - 6, 2 * rw + 16, 2 * rh + 12], verif: [cx + rw * .7, cy - rh * .85], inc: st === 'inconnu' ? [cx - rw * .8, cy - rh * .85] : null };
}


/* ======================================================================
   MODULE : scene — rendu de la scène, zoom et déplacement
   ====================================================================== */

/* ------------------------------------------------------------------ passe 4 : puces de mesure, cartes d'auxiliaires, mode édition */
const UNITE_ETAT = { ok: 'normal', alarme: 'alarme', info: 'actif', inconnu: '—', marche: 'marche', arret: 'arrêt', defaut: 'défaut', ouvert: 'ouverte', ferme: 'fermée' };
function puce(e, cx, cy, o) {     // petite étiquette de valeur accrochée à l'ouvrage : repère + valeur (ou état), pastille « à vérifier » en édition
  const st = etat(e), w = o.w || 100, h = 44; const g = s('g', { class: 'obj ' + st, 'data-eq': e.id });
  g.append(s('title', { text: `${e.id} · ${e.libelle}${st === 'inconnu' ? ' · état inconnu (aucune variable reliée)' : ''}` }));
  g.append(s('rect', { x: cx - w / 2, y: cy - h / 2, width: w, height: h, rx: 9, class: 'puce' }));
  let v = null;
  if (e.type === 'mesure') { const x = lire(e, 'valeur'); v = x == null ? '—' : fr(x) + ' ' + ((e.params && e.params.unite) || ''); }
  else if (e.type === 'voyant') v = st === 'alarme' ? 'alarme' : st === 'inconnu' ? '—' : 'normal';
  else v = UNITE_ETAT[st] || st;
  g.append(s('text', { x: cx, y: cy - 5, class: 'tag', text: o.tag || e.id }), s('text', { x: cx, y: cy + 15, class: 'val' + (st === 'alarme' ? ' alerte' : '') + (v === '—' ? ' vide' : ''), text: v }));
  if (st === 'alarme') g.append(s('circle', { cx: cx + w / 2 - 8, cy: cy - h / 2 + 8, r: 4, class: 'alarme-bulle' }));
  if (aVerifier(e)) g.append(s('circle', { cx: cx - w / 2 + 2, cy: cy - h / 2 + 2, r: 5.5, class: 'verif verif-g' }));
  return g;
}
function videsEdition(gr, e, g) {   // mode édition : emplacements sans variable de retour, sous le libellé de l'équipement
  if (!g.label || e.type === 'raccord') return;
  const v = Object.entries(e.slots || {}).filter(([n, sp]) => !slotRelie(sp, n)).map(([n]) => libEmpl(e, n));
  if (!v.length) return;
  gr.append(s('text', { x: g.label.x, y: g.label.y + 12, dy: (1.35 + (aEtatFixe(e) ? 1.75 : 0) + (g.lignes ? g.lignes.length : 1) * 1.22) + 'em', class: 'lib ed-only vide-ed', text: '○ vide : ' + v.join(', ') }));
}
function etatCarte(c) {   // pire état parmi les membres ; gris si aucun membre n'a de retour
  const sts = c.membres.map(id => etat(EQ[id]));
  if (sts.some(x => x === 'alarme' || x === 'defaut')) return 'alarme';
  const connus = sts.filter(x => x !== 'inconnu' && x !== 'ok'); const ok = sts.some(x => x === 'ok' || x === 'marche' || x === 'ouvert' || x === 'ferme' || x === 'arret');
  return connus.length || ok ? 'ok' : 'inconnu';
}
function dessinerCarte(c, gFond, gHaut) {
  const st = etatCarte(c);
  const fluide = (M.liaisons.find(l => c.membres.includes(l.de) && ['reactif', 'polymere'].includes(l.fluide)) || {}).fluide || 'reactif';
  if (c.lien) {
    const d = c.lien.points.map((q, i) => (i ? 'L' : 'M') + q[0] + ' ' + q[1]).join(' ');
    gFond.append(s('path', { d, class: 'lien-carte f-' + fluide }));
    if (c.lien.point) gFond.append(s('circle', { cx: c.lien.point[0], cy: c.lien.point[1], r: 4.5, class: 'inj-pt f-' + fluide }));
  }
  const g = s('g', { class: 'obj carte ' + st, 'data-carte': c.id });
  g.append(s('title', { text: `${c.titre} · ${c.membres.length} équipements · cliquer pour le détail` }));
  g.append(s('rect', { x: c.x, y: c.y, width: c.w, height: c.h, rx: 12, class: 'carte-f' }), s('rect', { class: 'halo', x: c.x - 3, y: c.y - 3, width: c.w + 6, height: c.h + 6 }));
  g.append(s('text', { x: c.x + 16, y: c.y + 26, class: 'carte-t', text: c.titre }));
  g.append(s('circle', { cx: c.x + c.w - 20, cy: c.y + 21, r: 6, class: 'pastille ' + st }));
  if (c.membres.some(id => aVerifier(EQ[id]))) g.append(s('circle', { cx: c.x + c.w - 40, cy: c.y + 21, r: 5.5, class: 'verif verif-g' }));
  g.append(s('line', { x1: c.x + 14, x2: c.x + c.w - 14, y1: c.y + 36, y2: c.y + 36, class: 'carte-sep' }));
  let vides = 0;
  (c.etats_cles || []).slice(0, 3).forEach((it, i) => {
    const eq = EQ[it.eq]; const t = eq ? texteSlot(eq, it.slot) : null; const y = c.y + 56 + i * 21;
    g.append(s('text', { x: c.x + 16, y, class: 'lib carte-l', text: it.libelle }), s('text', { x: c.x + c.w - 16, y, class: 'val carte-v' + (t == null ? ' vide' : (eq && etat(eq) === 'alarme' ? ' alerte' : '')), text: t == null ? 'inconnu' : t }));
    if (t == null) vides++;
  });
  const tot = c.membres.reduce((n, id) => n + Object.entries(EQ[id].slots || {}).filter(([k, sp]) => !slotRelie(sp, k)).length, 0);
  if (tot) g.append(s('text', { x: c.x + 16, y: c.y + c.h - 9, class: 'lib ed-only vide-ed carte-l', text: `○ ${tot} emplacement${tot > 1 ? 's' : ''} vide${tot > 1 ? 's' : ''}` }));
  gHaut.append(g);
}

/* ------------------------------------------------------------------ scène */
const svg = byId('scene');
const racine = s('g', { id: 'monde' }); svg.append(racine);
function dessiner() {
  collecteAlarmes(); calculeActivite();
  svg.innerHTML = ''; svg.append(racine); racine.innerHTML = '';
  const defs = s('defs'); racine.append(defs);
  const gZ = s('g'), gP = s('g'), gN = s('g'), gI = s('g'); racine.append(gZ, gP, gN, gI);
  for (const z of L.zones) {
    const zz = (M.zones || []).find(q => q.id === z.id) || {};
    gZ.append(s('g', { class: 'zone-g', 'data-zone': z.id },
      s('rect', { x: z.x, y: z.y, width: z.w, height: z.h, rx: 16, class: 'zone' + (zz.hors_umt ? ' hors' : '') }),
      s('circle', { cx: z.x + 22, cy: z.y + 23, r: 3, fill: '#00d4aa', opacity: .75 }),
      s('text', { x: z.x + 32, y: z.y + 27, class: 'zone-t', text: z.titre })));
  }
  // conduites
  for (const a of L.aretes) {
    const act = !!ACTIF[a.id]; const fine = a.fluide === 'reactif' || a.fluide === 'polymere';
    const d = cheminArrondi(a.points);
    (a.passage ? gI : gP).append(s('g', { class: 'cond-g', 'data-arete': a.id }, s('path', { d, class: `tuyau f-${a.fluide}${fine ? ' fine' : ''}${a.axe ? ' axe' : ''}${act ? ' actif' : ''}`, style: act ? `stroke:${coulTuyau(a.couleur)}` : null }), s('path', { d, class: `flux f-${a.fluide}${a.axe ? ' axe' : ''}${act ? ' actif' : ''}`, style: `stroke:${coulFlux(a.couleur)}` }),
      s('path', { d, class: 'cond-zone' })));
  }
  // nœuds
  for (const n of L.noeuds) {
    const e = EQ[n.id], g = n.geom; let r;
    if (e.type === 'pompe') r = symPompe(e, g);
    else if (e.type === 'cuve') r = symCuve(e, g, n);
    else if (e.type === 'parametre') r = symDecanteur(e, g, n);
    else if (e.type === 'silhouette') r = symSilhouette(e, g);
    else if (e.type === 'raccord') r = symRaccord(e, g);
    else if (e.type === 'image') r = symImage(e, g);
    else if (G.EXTRA[e.type]) r = symExtra(e, g);
    else r = symIsole(e, g);
    const gr = s('g', { transform: `translate(${n.x} ${n.y})`, class: 'obj ' + (r.cls || ''), 'data-eq': e.id, 'data-node': e.id });
    if (!r.nobox) gr.append(s('rect', { class: 'halo', x: r.box[0], y: r.box[1], width: r.box[2], height: r.box[3] }));
    else gr.append(s('rect', { class: 'halo', x: r.box[0], y: r.box[1], width: r.box[2], height: r.box[3] }));
    r.corps.forEach(c => { if (c.tagName === 'clipPath') defs.append(c); else gr.append(c); });
    if (g.label) {
      if (e.type === 'raccord') { const ls = g.lignesRaccord || [e.libelle]; ls.forEach((l, i) => gr.append(s('text', { x: 17, y: -9, dy: (-(ls.length - 1 - i) * 1.22) + 'em', class: 'lib raccord-l', text: l }))); }
      else { textes.suf = r.suffixe || ''; textes(g, e, n, r.val && r.val.t).forEach(t => gr.append(t)); }   // l'état d'un ouvrage vit sous son repère, à place fixe
    }
    if (r.verif && aVerifier(e) && e.type !== 'pompe') gr.append(s('circle', { cx: r.verif[0], cy: r.verif[1], r: 5.5, class: 'verif verif-g' }));
    else if (r.verif && aVerifier(e)) gr.append(s('circle', { cx: r.verif[0], cy: r.verif[1], r: 5.5, class: 'verif verif-g' }));
    if (r.inc) gr.append(marqueInconnu(r.inc[0], r.inc[1]));
    // annexes (sondes, poires) sous le récipient
    (g.annexes || []).forEach(an => gr.append(L.mode === 'hier' ? puce(EQ[an.id], an.x, an.y, { w: 92, tag: G.tagCourt(an.id, e.id) }) : celluleInstrument(EQ[an.id], an.x, an.y, { annexe: true, hote: e.id })));
    if (L.mode === 'hier') videsEdition(gr, e, g);
    gN.append(gr);
  }
  // instruments en ligne
  for (const a of L.aretes) {
    if (a.chips) { a.chips.forEach(c => { if (!EQ[c.id]) return; const sy = c.sy != null ? c.sy : a.points[0][1]; gI.append(s('line', { x1: c.x, y1: sy, x2: c.x, y2: c.y - c.side * 22, class: 'trait stub' }), s('circle', { cx: c.x, cy: sy, r: 3, class: 'noeud-t' }), puce(EQ[c.id], c.x, c.y, { w: 120 })); }); continue; }
    if (!a.label || !a.inline.length) continue;
    const y = a.label.y + a.label.h / 2;     // la conduite passe au milieu de la réserve d'espace
    G.dispo(a.inline.map(i => EQ[i]), aDonnee).cells.forEach(c => gI.append(celluleInstrument(EQ[c.id], a.label.x + c.dx, y, { mode: c.mode, side: c.side })));
  }
  if (L.mode === 'hier') (L.cartes || []).forEach(c => dessinerCarte(c, gZ, gI));
  (L.textes || []).forEach(t => gI.append(s('g', { class: 'obj texte-g', 'data-texte': t.id }, s('rect', { class: 'halo', x: t.x - 6, y: t.y - 18, width: Math.max(40, t.texte.length * 8.2) + 12, height: 26 }), s('text', { x: t.x, y: t.y, class: 'texte-libre', text: t.texte }))));
  const b = root.querySelector('.synbody'); b.classList.toggle('sans-verif', !etatVerif); b.classList.toggle('edition', etatVerif);
  majLegende();
  if (EDITEUR) EDITEUR.apresDessin();
}
function majLegende() {   // légende générée : couleurs NOMMÉES et UTILISÉES uniquement (passe 7)
  const z = byId('leg-couleurs'); if (!z) return; z.innerHTML = '';
  legendeCouleurs(M, L).forEach(it => z.append(h('span', '', `<b style="color:${it.c}"></b>${esc(it.nom)}`)));
}
let etatVerif = false;   // false = Consultation (défaut) ; true = Édition (pastilles « à vérifier » + emplacements vides)

/* ------------------------------------------------------------------ zoom / déplacement (viewBox) */
const VB = { x: 0, y: 0, w: L.w, h: L.h };
function echelle() {   // pixels écran par unité du dessin ; les textes grandissent (bornés) pour tenir un minimum à l'écran, les libellés secondaires se replient
  const r = svg.getBoundingClientRect(); if (!r.width) return; const sc = Math.min(r.width / VB.w, r.height / VB.h);
  const f = (base, min, max) => Math.max(base, Math.min(max, min / sc)).toFixed(2);
  const pc = window.innerWidth >= 1500; svg.style.setProperty('--fs-tag', f(12.6, pc ? 12.3 : 11, 20)); svg.style.setProperty('--fs-val', f(14, pc ? 13.4 : 11.5, 21)); svg.style.setProperty('--fs-lib', f(12, pc ? 11.6 : 11, 19));
  svg.classList.toggle('sans-lib', sc < 0.62); SYN.sc = sc;
}
let fitAuto = true;   // vrai tant que l'utilisateur n'a pas zoomé / déplacé : la vue suit alors la taille de la tuile
function appliquerVB() { fitAuto = false; svg.setAttribute('viewBox', `${VB.x} ${VB.y} ${VB.w} ${VB.h}`); echelle(); }
function ajuster() {
  const r = svg.getBoundingClientRect(); const ar = r.width / r.height; const mobile = false;
  if (mobile) { // vue de départ : centrée sur la zone qui contient le plus d'équipements (le cœur du procédé)
    const cnt = z => L.noeuds.filter(n => n.x >= z.x && n.x <= z.x + z.w && n.y >= z.y && n.y <= z.y + z.h).length;
    const zc = [...L.zones].sort((a, b) => cnt(b) - cnt(a))[0] || { x: 0, y: 0, w: L.w, h: L.h };
    VB.w = Math.min(L.w, 640); VB.h = VB.w / ar; VB.x = zc.x + zc.w / 2 - VB.w / 2; VB.y = zc.y + zc.h / 2 - VB.h / 2; }
  else { let w = L.w, hh = L.w / ar; if (hh < L.h) { hh = L.h; w = hh * ar; } VB.w = w; VB.h = hh; VB.x = (L.w - w) / 2; VB.y = (L.h - hh) / 2; }
  appliquerVB(); fitAuto = true;
}
function zoomer(f, cx, cy) {
  const r = svg.getBoundingClientRect(); const px = (cx == null ? r.width / 2 : cx), py = (cy == null ? r.height / 2 : cy);
  const mx = VB.x + VB.w * px / r.width, my = VB.y + VB.h * py / r.height;
  VB.w = Math.max(250, Math.min(L.w * 1.5, VB.w * f)); VB.h = VB.w * r.height / r.width;
  VB.x = mx - VB.w * px / r.width; VB.y = my - VB.h * py / r.height; appliquerVB();
}
function brancherZoom() {
  const corps = root.querySelector('.synbody'); let drag = null, moved = false; const pts = new Map(); let pinch = null;
  /* Molette (passe 6, retour Julien) :
     - jamais de zoom quand la souris est sur la palette, le panneau de propriétés, la légende ou les boutons : ces listes défilent normalement ;
     - Ctrl + molette (ou pincement du pavé tactile) = zoom du synoptique, sans zoomer le navigateur ;
     - molette seule : en Consultation, la page défile (petite astuce affichée) ; en Édition, elle déplace la vue (Maj = horizontal). */
  let astuceT = null;
  const astuce = () => { let a = corps.querySelector('.zoom-astuce'); if (!a) { a = h('div', 'zoom-astuce', 'Ctrl + molette pour zoomer'); corps.append(a); }
    a.classList.add('vis'); clearTimeout(astuceT); astuceT = setTimeout(() => a.classList.remove('vis'), 1400); };
  corps.addEventListener('wheel', ev => {
    if (!ev.target.closest('#scene')) return;
    const r = svg.getBoundingClientRect(), ctrl = ev.ctrlKey || ev.metaKey;
    const dy = ev.deltaMode === 1 ? ev.deltaY * 16 : ev.deltaY, dx = ev.deltaMode === 1 ? ev.deltaX * 16 : ev.deltaX;
    if (ctrl) { ev.preventDefault(); zoomer(Math.max(0.7, Math.min(1.4, Math.exp(dy * 0.0025))), ev.clientX - r.left, ev.clientY - r.top); return; }
    if (!etatVerif) { astuce(); return; }
    ev.preventDefault(); const hx = ev.shiftKey ? dy : dx, vy = ev.shiftKey ? 0 : dy;
    VB.x += hx * VB.w / r.width; VB.y += vy * VB.h / r.height; appliquerVB();
  }, { passive: false });
  // En Édition, Ctrl + molette ne zoome jamais le navigateur, où que soit la souris.
  addG(window, 'wheel', ev => { if (etatVerif && (ev.ctrlKey || ev.metaKey)) ev.preventDefault(); }, { passive: false });
  // Clavier : + / − / 0 (ou Ctrl + + / Ctrl + − / Ctrl + 0) zooment le synoptique au lieu du navigateur.
  addG(document, 'keydown', ev => {
    const t = ev.target; if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
    if (!clavierActif()) return;
    const ctrl = ev.ctrlKey || ev.metaKey, k = ev.key, c = ev.code;
    const plus = k === '+' || k === '=' || c === 'NumpadAdd', moins = k === '-' || k === '_' || c === 'NumpadSubtract', zero = k === '0' || c === 'Numpad0' || c === 'Digit0';
    if (!(plus || moins || zero) || ev.altKey) return;
    if (!ctrl && !etatVerif && root.querySelector('.detail-fond:not([hidden])')) return;
    ev.preventDefault(); if (zero) ajuster(); else zoomer(plus ? 1 / 1.25 : 1.25);
  });
  corps.addEventListener('pointerdown', ev => { if (ev.target.closest('.zoomb') || (etatVerif && EDITEUR && EDITEUR.gere(ev))) return; pts.set(ev.pointerId, [ev.clientX, ev.clientY]); drag = { x: ev.clientX, y: ev.clientY, vx: VB.x, vy: VB.y }; moved = false;
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
  addG(window, 'pointermove', ev => {
    if (!pts.has(ev.pointerId)) return; pts.set(ev.pointerId, [ev.clientX, ev.clientY]);
    if (pts.size === 2 && pinch) { const [a, b] = [...pts.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); const r = svg.getBoundingClientRect(); zoomer(pinch / d, (a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top); pinch = d; moved = true; return; }
    if (!drag) return; const r = svg.getBoundingClientRect(); const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 5) { moved = true; corps.classList.add('drag'); }
    if (moved) { VB.x = drag.vx - dx * VB.w / r.width; VB.y = drag.vy - dy * VB.h / r.height; appliquerVB(); } });
  addG(window, 'pointerup', ev => { pts.delete(ev.pointerId); if (pts.size < 2) pinch = null; if (!pts.size) { drag = null; corps.classList.remove('drag'); } });
  corps.addEventListener('click', ev => { if (etatVerif) return; if (moved) { ev.stopPropagation(); ev.preventDefault(); moved = false; return; }
    const k = ev.target.closest('[data-carte]'); if (k) { ouvrirDetailCarte(k.dataset.carte); return; }
    const o = ev.target.closest('[data-eq]'); if (o && o.dataset.eq) ouvrirDetail(o.dataset.eq); }, true);
  byId('z-plus').onclick = () => zoomer(1 / 1.3); byId('z-moins').onclick = () => zoomer(1.3); byId('z-fit').onclick = ajuster;
}


/* ======================================================================
   MODULE : detail — fenêtre de détail d’un équipement
   ====================================================================== */

/* ------------------------------------------------------------------ fenêtre de détail (générique) */
const TYPE_FR = { pompe: 'Pompe', moteur: 'Moteur', vanne: 'Vanne', vanne_reg: 'Vanne de régulation', cuve: 'Cuve', parametre: 'Décanteur', silhouette: 'Équipement', vanne_man: 'Vanne manuelle', vanne_3v: 'Vanne 3 voies', clapet: 'Clapet anti-retour', filtre: 'Filtre', echangeur: 'Échangeur', compresseur: 'Compresseur', ventilateur: 'Ventilateur', convoyeur: 'Convoyeur', verin: 'Vérin', disjoncteur: 'Disjoncteur', transformateur: 'Transformateur', variateur: 'Variateur', mesure: 'Mesure', voyant: 'Détecteur', raccord: 'Raccordement' };
const SLOT_FR = { marche: 'Marche', defaut: 'Défaut', vitesse: 'Vitesse', ouvert: 'Ouverte', ferme: 'Fermée', position: 'Position', niveau: 'Niveau', valeur: 'Valeur', etat: 'État', colmatage: 'Colmatage', dp: 'Delta P', entree_t: 'Température entrée', sortie_t: 'Température sortie', temperature: 'Température', sorti: 'Sortie', rentre: 'Rentrée', declenche: 'Déclenché', frequence: 'Fréquence' };
const ST_FR = { marche: 'En marche', arret: 'À l’arrêt', defaut: 'Défaut', ouvert: 'Ouverte', ferme: 'Fermée', alarme: 'Alarme', ok: 'Normal', info: 'Actif', inconnu: 'État inconnu' };
function texteSlot(eq, nom) {
  const x = lire(eq, nom); const p = eq.params || {}; if (x == null && nom !== 'niveau') return null;
  if (nom === 'marche') return x === 1 ? 'Marche' : 'Arrêt';
  if (nom === 'defaut') return x === 1 ? 'Défaut' : 'Aucun';
  if (nom === 'ouvert') return x === 1 ? 'Oui' : 'Non'; if (nom === 'ferme') return x === 1 ? 'Oui' : 'Non';
  if (['colmatage', 'declenche', 'sorti', 'rentre'].includes(nom)) return x === 1 ? 'Oui' : 'Non';
  if (nom === 'dp') return fr(x) + ' bar'; if (nom === 'entree_t' || nom === 'sortie_t' || nom === 'temperature') return fr(x) + ' °C'; if (nom === 'frequence') return fr(x) + ' Hz';
  if (nom.startsWith('s_')) return x === 1 ? 'Actif' : 'Inactif';
  if (nom === 'vitesse' || nom === 'position') return fr(x, 0) + ' %';
  if (nom === 'valeur') return fr(x) + ' ' + (p.unite || '');
  if (nom === 'etat') { const al = p.alarme_si; return al != null && x === al ? (p.libelle_alarme || 'Alarme') : 'Normal'; }
  if (nom === 'niveau') { const lv = niveau(eq); return lv ? lv.texte : null; }
  return String(x);
}
function serie(nom, val, binaire, seuil) {
  const r = rnd(hash(nom)), N = 96, o = [];
  if (binaire && /DEF/i.test(nom)) return new Array(N).fill(val);
  if (binaire) { let v = val, tr = 0; const arr = new Array(N); arr[N - 1] = val; for (let i = N - 2; i >= 0; i--) { if (r() < .035 && tr < 3) { v = 1 - v; tr++; } arr[i] = v; } return arr; }
  let a = val, ph = r() * 6.28, amp = Math.max(Math.abs(val) * .12, .02); const arr = new Array(N); arr[N - 1] = val;
  for (let i = N - 2; i >= 0; i--) { a = val + amp * (Math.sin(ph + i / 9) * .7 + (r() - .5) * .8) * (1 - i / (N * 3)); arr[i] = a; }
  arr[N - 1] = val; return arr;
}
function courbeSvg(arr, binaire, seuil) {
  const W = 400, H = 58, pad = 4; let mn = Math.min(...arr), mx = Math.max(...arr); if (seuil != null) mx = Math.max(mx, seuil); if (mn === mx) { mn -= 1; mx += 1; }
  const X = i => pad + i * (W - 2 * pad) / (arr.length - 1), Y = v => H - 8 - (v - mn) / (mx - mn) * (H - 18);
  let d = ''; arr.forEach((v, i) => { d += (i ? (binaire ? `H${X(i)} V${Y(v)}` : ` L${X(i)} ${Y(v)}`) : `M${X(i)} ${Y(v)}`); });
  const a = s('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none' });
  const gid = 'g' + Math.floor(Math.random() * 1e6);
  a.append(s('defs', {}, s('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 }, s('stop', { offset: 0, 'stop-color': '#00d4aa', 'stop-opacity': .28 }), s('stop', { offset: 1, 'stop-color': '#00d4aa', 'stop-opacity': 0 }))));
  [0, .5, 1].forEach(f => a.append(s('line', { x1: pad, x2: W - pad, y1: 8 + f * (H - 18), y2: 8 + f * (H - 18), stroke: '#1d2832', 'stroke-width': 1 })));
  if (seuil != null) a.append(s('line', { x1: pad, x2: W - pad, y1: Y(seuil), y2: Y(seuil), stroke: '#ff7a7a', 'stroke-dasharray': '4 4', 'stroke-width': 1, opacity: .7 }));
  a.append(s('path', { d: d + ` L${X(arr.length - 1)} ${H - 8} L${X(0)} ${H - 8} Z`, fill: `url(#${gid})` }), s('path', { d, fill: 'none', stroke: '#00d4aa', 'stroke-width': 1.8, 'vector-effect': 'non-scaling-stroke', 'stroke-linejoin': 'round' }));
  a.append(s('text', { x: pad, y: H - 0.5, text: '00:00' }), s('text', { x: W - pad, y: H - 0.5, 'text-anchor': 'end', text: 'maintenant' }));
  return a;
}
function variablesAssociees(eq) {
  const out = [], vus = new Set();
  const ajout = (nom, lib, val, bin, seuil, unite) => { if (val == null || vus.has(nom) || out.length >= 3) return; vus.add(nom); out.push({ nom, lib, val, bin, seuil, unite }); };
  const propres = (q) => { for (const [n, sp] of Object.entries(q.slots || {})) { if (sp && sp.variable && !['defaut'].includes(n) || (sp && sp.variable && n === 'defaut')) {
      const x = V[sp.variable]; const bin = ['marche', 'defaut', 'ouvert', 'ferme', 'etat'].includes(n);
      ajout(sp.variable, `${q.id !== eq.id ? q.id + ' · ' : ''}${libEmpl(q, n)}`, x, bin, q.params && q.params.seuils && q.params.seuils.haut, q.params && q.params.unite); } }
    (q.variables_associees || []).forEach(va => ajout(va.variable, va.libelle, V[va.variable], false, null, '')); };
  propres(eq);
  // voisins : éléments rattachés, instruments en ligne sur les liaisons voisines
  const voisins = [];
  L.aretes.forEach(a => { if (a.nd === eq.id || a.na === eq.id) (a.inline || []).forEach(i => voisins.push(EQ[i])); });
  L.noeuds.forEach(n => { if (n.id === eq.id && n.rattaches) [...n.rattaches.annexes, ...n.rattaches.vannes, n.rattaches.moteur].filter(Boolean).forEach(i => voisins.push(EQ[i])); });
  voisins.filter(Boolean).forEach(propres);
  return out;
}
let selNode = null;
function ouvrirDetail(id) {
  const eq = EQ[id]; if (!eq) return; fermerDetail();
  const st = etat(eq);
  const voile = h('div', 'voile'); voile.id = 'voile';
  const d = h('div', 'dlg'); d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true');
  d.innerHTML = `<header><div><div class="mono">${TYPE_FR[eq.type] || eq.type}${eq.grandeur ? ' · ' + eq.grandeur : ''}</div><h2>${eq.id}<span class="pill ${st}"><i></i>${ST_FR[st] || st}</span></h2><div style="color:#9aa8b3;font-size:13px">${eq.libelle}</div></div><button class="x" aria-label="Fermer">×</button></header>`;
  const sEtats = h('section'); sEtats.append(h('h4', 'mono', 'États reliés'));
  let n = 0, nonLies = 0;
  for (const [nom, sp] of Object.entries(eq.slots || {})) {
    if (!slotRelie(sp, nom)) { nonLies++; continue; }
    const t = texteSlot(eq, nom); if (t == null) continue; n++;
    const inf = !!(sp.derive || sp.derive_tor);
    const al = (nom === 'defaut' && t === 'Défaut') || (nom === 'etat' && st === 'alarme') || (nom === 'valeur' && st === 'alarme');
    const mn = sp.variable ? `<span class="mn">${sp.variable}${sp.adresse ? ' · ' + sp.adresse : ''}</span>` : `<span class="mn">${sp.derive_tor ? 'déduit des poires de niveau' : 'déduit d’une autre mesure'}</span>`;
    const bv = sp.a_verifier ? `<span class="badge-v">à vérifier · ${Math.round((sp.confiance || 0) * 100)} %</span>` : '';
    const r = h('div', 'etat', `<div>${libEmpl(eq, nom)}${bv}${mn}</div><div class="v${al ? ' al' : ''}">${t}</div>`);
    sEtats.append(r);
  }
  if (!n) sEtats.append(h('div', 'sub', 'Aucun emplacement relié à une variable.'));
  if (nonLies) sEtats.append(h('div', 'sub', `${nonLies} emplacement${nonLies > 1 ? 's' : ''} sans variable de retour : état inconnu, rien n’est déduit`));
  if (st === 'inconnu') sEtats.append(h('div', 'note note-inc', '<b>État inconnu · </b>aucune variable de retour n’est reliée à cet emplacement. Le synoptique n’affiche jamais un état déduit (pas de « en marche » supposé d’un débit ou d’un niveau) : symbole gris en pointillé avec un « ? ».'));
  if (eq.note) sEtats.append(h('div', 'note', `<b>Brouillon IA · </b>${eq.note}`));
  d.append(sEtats);
  const vars = variablesAssociees(eq);
  const sv = h('section'); sv.append(h('h4', 'mono', 'Variables associées'));
  vars.forEach(v => {
    const c = h('div', 'courbe'); const arr = serie(v.nom, v.val, v.bin, v.seuil);
    c.append(h('div', 'h', `<span>${v.lib}<span class="etat"><span class="mn" style="margin:0 0 0 6px">${v.nom}</span></span></span><b>${v.bin ? (v.val === 1 ? '1' : '0') : fr(v.val) + (v.unite ? ' ' + v.unite : '')}</b>`));
    sv.append(c);
  });
  if (!vars.length) sv.append(h('div', 'sub', 'Aucune variable associée.'));
  d.append(sv);
  d.append(h('div', 'leg-dlg', '<span><i class="lg m"></i>En marche / ouverte</span><span><i class="lg a"></i>Arrêt / fermée</span><span><i class="lg d"></i>Défaut / alarme</span><span><i class="lg i">?</i>Inconnu : pas de variable de retour</span><span><i class="lg v"></i>À vérifier</span>'));
  d.append(h('footer', '', '<span class="mono">Lecture seule · valeurs de la box</span>'));
  voile.append(d); root.append(voile);
  voile.addEventListener('click', ev => { if (ev.target === voile) fermerDetail(); });
  d.querySelector('.x').onclick = fermerDetail;
}

function ouvrirDetailCarte(cid) {
  const c = (L.cartes || []).find(q => q.id === cid); if (!c) return; fermerDetail();
  const st = etatCarte(c); const voile = h('div', 'voile'); voile.id = 'voile';
  const d = h('div', 'dlg'); d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true');
  d.innerHTML = `<header><div><div class="mono">Groupe d’auxiliaires · ${c.membres.length} équipements</div><h2>${c.titre}<span class="pill ${st}"><i></i>${ST_FR[st] || st}</span></h2><div style="color:#9aa8b3;font-size:13px">Injection : ${c.injection && EQ[c.injection.cible] ? EQ[c.injection.cible].libelle : (c.injection && c.injection.cible) || '—'}</div></div><button class="x" aria-label="Fermer">×</button></header>`;
  const sec = h('section'); sec.append(h('h4', 'mono', 'Sous-équipements et états'));
  const varsCarte = [];
  for (const id of c.membres) {
    const eq = EQ[id], se = etat(eq); const lignes = [];
    for (const [nom, sp] of Object.entries(eq.slots || {})) {
      if (!slotRelie(sp, nom)) continue; const t = texteSlot(eq, nom); if (t == null) continue;
      lignes.push(`<span class="mn" style="display:inline;margin-right:10px">${libEmpl(eq, nom)} : <b style="color:#e6edf3">${t}</b></span>`);
    }
    const r = h('div', 'etat', `<div>${eq.id} · ${eq.libelle}${aVerifier(eq) ? '<span class="badge-v">à vérifier</span>' : ''}<span class="mn">${lignes.join('') || 'aucun emplacement relié : état inconnu'}</span></div><div class="v"><span class="pill ${se}" style="margin:0"><i></i>${ST_FR[se] || se}</span></div>`);
    r.style.cursor = 'pointer'; r.onclick = () => ouvrirDetail(id); sec.append(r);
    variablesAssociees(eq).forEach(v => { if (!varsCarte.some(q => q.nom === v.nom)) varsCarte.push(v); });
  }
  d.append(sec);
  const sv = h('section'); sv.append(h('h4', 'mono', 'Variables associées'));
  varsCarte.slice(0, 4).forEach(v => { const cb = h('div', 'courbe'); const arr = serie(v.nom, v.val, v.bin, v.seuil);
    cb.append(h('div', 'h', `<span>${v.lib}<span class="etat"><span class="mn" style="margin:0 0 0 6px">${v.nom}</span></span></span><b>${v.bin ? (v.val === 1 ? '1' : '0') : fr(v.val) + (v.unite ? ' ' + v.unite : '')}</b>`)); sv.append(cb); });
  if (!varsCarte.length) sv.append(h('div', 'sub', 'Aucune variable associée.'));
  d.append(sv, h('footer', '', '<span class="mono">Lecture seule · cliquer un équipement pour son détail</span>'));
  voile.append(d); root.append(voile);
  voile.addEventListener('click', ev => { if (ev.target === voile) fermerDetail(); }); d.querySelector('.x').onclick = fermerDetail;
}
function fermerDetail() { const v = byId('voile'); if (v) v.remove(); }
addG(document, 'keydown', ev => { if (ev.key === 'Escape') fermerDetail(); });


/* ======================================================================
   MODULE : editeur_etat — éditeur : document, historique annuler/rétablir, import/export
   ====================================================================== */

/* Éditeur — état du document, historique (pile d'instantanés), persistance (localStorage), import / export JSON.
   Le document édité = { modele, layout } : exactement le format produit par la chaîne (modele.json + layout_h.json),
   donc réimportable par `build.py --doc`. Rien n'est envoyé nulle part : tout reste dans le navigateur de l'utilisateur. */
const SCHEMA = 'myhexa-synoptique-edition/1';
const ED = { outil: 'selection', sel: [], fluide: 'procede', grandeur: 'generique', palQ: '', palReplie: [], pile: [], idx: -1, grille: 10, grilleVisible: true, aimant: true, restaure: false,
  attente: null, drag: null, armee: null, espace: false, onglet: 'proprietes', enregistre: null };
let BROUILLON_IA = JSON.stringify({ modele: DATA.modele, layout: DATA.layout });   // instantané de la dernière version enregistrée
const EMPREINTE = hash(BROUILLON_IA);
const CLE_LS = 'myhexa.synoptique.' + (((DATA.modele.meta && DATA.modele.meta.projet) || 'proto').replace(/\W+/g, '_'));

const instantane = () => JSON.stringify({ modele: M, layout: L });
const estModifie = () => instantane() !== BROUILLON_IA;

function docValide(d) {
  if (!d || typeof d !== 'object') return 'fichier vide';
  if (!d.modele || !Array.isArray(d.modele.equipements)) return 'pas de « modele.equipements »';
  if (!d.layout || !Array.isArray(d.layout.noeuds) || !Array.isArray(d.layout.aretes)) return 'pas de mise en page (« layout.noeuds / aretes »)';
  if (typeof d.layout.w !== 'number' || typeof d.layout.h !== 'number') return 'dimensions du dessin absentes';
  const ids = new Set(d.modele.equipements.map(e => e.id));
  const orphelin = d.layout.noeuds.find(n => !ids.has(n.id));
  if (orphelin) return `le nœud « ${orphelin.id} » n'a pas d'équipement`;
  return null;
}

/* ---------- messages discrets */
function toast(msg, genre) {
  let z = byId('toasts'); if (!z) { z = document.createElement('div'); z.id = 'toasts'; z.setAttribute('role', 'status'); root.append(z); }
  const t = document.createElement('div'); t.className = 'toast ' + (genre || ''); t.textContent = msg; z.append(t);
  setTimeout(() => t.classList.add('part'), 3200); setTimeout(() => t.remove(), 3700);
}

/* ---------- historique : une pile d'instantanés JSON du document */
function appliquerInstantane(txt) { chargerDoc(JSON.parse(txt)); ED.sel = ED.sel.filter(existeCle); ED.attente = null; }
let minuteurPousser = null;
function pousser() {   // à appeler après chaque opération terminée (clic relâché, champ validé…)
  clearTimeout(minuteurPousser); minuteurPousser = null;
  const txt = instantane(); if (ED.pile[ED.idx] === txt) return false;
  ED.pile = ED.pile.slice(0, ED.idx + 1); ED.pile.push(txt); if (ED.pile.length > 150) ED.pile.shift(); ED.idx = ED.pile.length - 1;
  sauver(); majBarre(); return true;
}
function pousserDiffere() { clearTimeout(minuteurPousser); minuteurPousser = setTimeout(pousser, 450); }   // rafales (touches fléchées)
function annuler() { if (minuteurPousser) pousser(); if (ED.idx <= 0) return false; ED.idx--; appliquerInstantane(ED.pile[ED.idx]); sauver(); redessinerTout(); return true; }
function retablir() { if (minuteurPousser) pousser(); if (ED.idx >= ED.pile.length - 1) return false; ED.idx++; appliquerInstantane(ED.pile[ED.idx]); sauver(); redessinerTout(); return true; }

/* ---------- persistance dans le navigateur */
function sauver(explicite) {   // Ctrl+S / bouton : l'application enregistre une nouvelle version (HOST.onSave)
  if (explicite && HOST.onSave) HOST.onSave(documentCourant());
  return true;
}
function restaurerSauvegarde() { return false; }

/* ---------- export / import JSON */
function documentExport() { return { schema: SCHEMA, exporte: new Date().toISOString(), origine: (M.meta && M.meta.titre) || '', modele: M, layout: L }; }
function exporterDoc() {
  const doc = documentExport(); const blob = new Blob([JSON.stringify(doc, null, 1)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `synoptique_${((M.meta && M.meta.projet) || 'synoptique').replace(/\W+/g, '_')}.json`;
  root.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  toast('JSON exporté : ' + a.download, 'ok'); return doc;
}
function importerTexte(txt) {
  let d; try { d = JSON.parse(txt); } catch (e) { toast('Import impossible : ce n’est pas un JSON valide', 'err'); return false; }
  if (!d.modele && Array.isArray(d.equipements)) { toast('Ce fichier est un modele.json seul : il manque la mise en page. Importez un JSON exporté par l’éditeur.', 'err'); return false; }
  const err = docValide(d); if (err) { toast('Import impossible : ' + err, 'err'); return false; }
  chargerDoc({ modele: d.modele, layout: d.layout }); ED.sel = []; ED.attente = null; (M.bibliotheque || []).forEach(x => normaliserDef(x)); sauverBiblio(); pousser(); redessinerTout(); toast('JSON importé', 'ok'); return true;
}

/* ---------- démarrage */
restaurerSauvegarde();
ED.pile = [instantane()]; ED.idx = 0;


/* ======================================================================
   MODULE : editeur_ops — éditeur : opérations sur le document (création, déplacement, conduites, suppression)
   ====================================================================== */

/* Éditeur — opérations sur le document (aucune souris ici : tout est appelable par code, donc testable).
   Principe : on modifie M (modèle) et L (mise en page), puis redessinerTout() ; pousser() enregistre l'étape dans l'historique. */
G.ANNEXE_W = 96; G.ANNEXE_H = 52;   // même réglage que hierarchie.mjs : une annexe = une puce (repère + valeur)
const PUCE = { w: 120, h: 44, pas: 132, decalage: 56 }, CARTE_DIM = { w: 290, h: 118, y: 22 };
const TYPES_PRINCIPAUX = ['cuve', 'parametre', 'silhouette'];

const leNoeud = (id) => L.noeuds.find(n => n.id === id);
const lArete = (id) => L.aretes.find(a => a.id === id);
const laCarte = (id) => (L.cartes || []).find(c => c.id === id);
const laZone = (id) => (L.zones || []).find(z => z.id === id);
const leTexte = (id) => (L.textes || []).find(t => t.id === id);
/* Taille (passe 7) : remplace le « rang » dans l'interface. Le champ `rang` reste dans les données (génération IA) :
   principal = Grand, secondaire = Normal, auxiliaire = carte. Le facteur est relatif à la taille par défaut du symbole
   (un ouvrage « Grand » garde donc exactement sa taille générée). */
const FACTEUR_TAILLE = { petit: 0.75, normal: 1, grand: 1.4 }, TAILLES_FR = { petit: 'Petit', normal: 'Normal', grand: 'Grand' };
const tailleParDefaut = (e) => rangDe(e) === 'principal' ? 'grand' : 'normal';
const tailleDe = (e) => e.taille || tailleParDefaut(e);
const facteurTaille = (e) => FACTEUR_TAILLE[tailleDe(e)] / FACTEUR_TAILLE[tailleParDefaut(e)];
const rangDe = (e) => e.rang || (e.carte ? 'auxiliaire' : TYPES_PRINCIPAUX.includes(e.type) ? 'principal' : 'secondaire');
const snap = (v) => ED.aimant ? Math.round(v / ED.grille) * ED.grille : v;
const arr1 = (v) => +(+v).toFixed(1);
const copie = (o) => JSON.parse(JSON.stringify(o));

/* ------------------------------------------------------------------ bibliothèque de symboles (palette) */
const slotVide = () => ({ variable: null, confiance: 1, a_verifier: false });
const BIBLIO = {
  vanne:     { nom: 'Vanne',                 pref: 'XV', lib: 'Vanne',                  type: 'vanne',      slots: ['ouvert', 'ferme', 'defaut'] },
  vanne_reg: { nom: 'Vanne de régulation',   pref: 'FV', lib: 'Vanne de régulation',    type: 'vanne_reg',  slots: ['position', 'defaut'] },
  pompe:     { nom: 'Pompe',                 pref: 'PC', lib: 'Pompe',                  type: 'pompe',      slots: ['marche', 'defaut', 'vitesse'] },
  moteur:    { nom: 'Moteur',                pref: 'MO', lib: 'Moteur',                 type: 'moteur',     slots: ['marche', 'defaut'] },
  agitateur: { nom: 'Agitateur',             pref: 'AA', lib: 'Agitateur',              type: 'moteur',     role: 'agitateur', slots: ['marche', 'defaut'] },
  cuve:      { nom: 'Cuve',                  pref: 'RV', lib: 'Cuve',                   type: 'cuve',       slots: ['niveau'] },
  decanteur: { nom: 'Décanteur paramétré',   pref: 'DE', lib: 'Décanteur',              type: 'parametre',  famille: 'decanteur', params: { tremies: 4, lamelles: 12 }, slots: ['niveau'] },
  mesure:    { nom: 'Mesure',                pref: 'IT', lib: 'Mesure',                 type: 'mesure',     grandeur: 'generique', params: { unite: '', min: 0, max: 100 }, slots: ['valeur'] },
  voyant:    { nom: 'Voyant',                pref: 'LS', lib: 'Voyant',                 type: 'voyant',     params: { alarme_si: 1 }, slots: ['etat'] },
  carte:     { nom: 'Carte auxiliaire',      pref: 'AX', lib: 'Pompe doseuse',          type: 'pompe',      variante: 'doseuse', slots: ['marche', 'defaut', 'vitesse'], special: 'carte' },
  texte:     { nom: 'Texte',                 special: 'texte' },
  zone:      { nom: 'Zone',                  special: 'zone' },
};
Object.assign(BIBLIO, {
  vanne_man:   { nom: 'Vanne manuelle',     pref: 'HV',  lib: 'Vanne manuelle',     type: 'vanne_man',   slots: ['ouvert'], famille_pal: 'proc' },
  vanne_3v:    { nom: 'Vanne 3 voies',      pref: 'XV',  lib: 'Vanne 3 voies',      type: 'vanne_3v',    slots: ['ouvert', 'position', 'defaut'], famille_pal: 'proc' },
  clapet:      { nom: 'Clapet anti-retour', pref: 'NRV', lib: 'Clapet anti-retour', type: 'clapet',      slots: ['defaut'], famille_pal: 'proc' },
  filtre:      { nom: 'Filtre',             pref: 'FI',  lib: 'Filtre',             type: 'filtre',      slots: ['colmatage', 'defaut', 'dp'], famille_pal: 'proc' },
  echangeur:   { nom: 'Échangeur',          pref: 'HX',  lib: 'Échangeur',          type: 'echangeur',   slots: ['entree_t', 'sortie_t'], famille_pal: 'proc' },
  compresseur: { nom: 'Compresseur',        pref: 'KC',  lib: 'Compresseur',        type: 'compresseur', slots: ['marche', 'defaut', 'vitesse'], famille_pal: 'proc' },
  ventilateur: { nom: 'Ventilateur',        pref: 'FN',  lib: 'Ventilateur',        type: 'ventilateur', slots: ['marche', 'defaut', 'vitesse'], famille_pal: 'proc' },
  silo:        { nom: 'Silo / trémie',      pref: 'SI',  lib: 'Silo',               type: 'cuve',        forme: 'silo', slots: ['niveau'], famille_pal: 'proc' },
  bassin:      { nom: 'Bassin ouvert',      pref: 'BA',  lib: 'Bassin',             type: 'cuve',        forme: 'bassin', slots: ['niveau'], famille_pal: 'proc' },
  convoyeur:   { nom: 'Convoyeur',          pref: 'CV',  lib: 'Convoyeur',          type: 'convoyeur',   slots: ['marche', 'defaut', 'vitesse'], famille_pal: 'mach' },
  verin:       { nom: 'Vérin',              pref: 'VR',  lib: 'Vérin',              type: 'verin',       slots: ['sorti', 'rentre', 'defaut'], famille_pal: 'mach' },
  disjoncteur: { nom: 'Disjoncteur',        pref: 'QF',  lib: 'Disjoncteur',        type: 'disjoncteur', slots: ['ferme', 'declenche'], famille_pal: 'elec' },
  transformateur: { nom: 'Transformateur',  pref: 'TR',  lib: 'Transformateur',     type: 'transformateur', slots: ['defaut', 'temperature'], famille_pal: 'elec' },
  variateur:   { nom: 'Variateur',          pref: 'VFD', lib: 'Variateur',          type: 'variateur',   slots: ['marche', 'defaut', 'frequence'], famille_pal: 'elec' }
});
/* Mesure par grandeur : une seule entrée de palette ; la grandeur préremplit l'unité et le préfixe de repère ISA (modifiables ensuite). */
const GRANDEURS = { debit: { nom: 'Débit', unite: 'm³/h', pref: 'FIT' }, pression: { nom: 'Pression', unite: 'bar', pref: 'PIT' }, niveau: { nom: 'Niveau', unite: 'm', pref: 'LIT' },
  temperature: { nom: 'Température', unite: '°C', pref: 'TIT' }, ph: { nom: 'pH', unite: 'pH', pref: 'AIT' }, generique: { nom: 'Générique', unite: '', pref: 'IT' } };
const SLOTS_TYPE = { pompe: ['marche', 'defaut', 'vitesse'], moteur: ['marche', 'defaut', 'vitesse'], vanne: ['ouvert', 'ferme', 'defaut'], vanne_reg: ['position', 'defaut'],
  cuve: ['niveau'], parametre: ['niveau'], mesure: ['valeur'], voyant: ['etat'], silhouette: [], raccord: [], image: ['etat'] };
Object.values(BIBLIO).forEach(b => { if (b.famille_pal) SLOTS_TYPE[b.type] = b.slots; });
const SLOT_TOR = ['marche', 'defaut', 'ouvert', 'ferme', 'etat', 'colmatage', 'sorti', 'rentre', 'declenche'];
const estTorSlot = (nom) => SLOT_TOR.includes(nom) || String(nom).startsWith('s_');
const cleSymbole = (e) => e.type === 'moteur' && e.role === 'agitateur' ? 'agitateur' : e.type === 'parametre' ? 'decanteur' : e.type;
const typeBase = (e) => e.type === 'image' ? (e.type_origine || 'voyant') : e.type;
const estOuvrage = (e) => !!e && (e.type === 'cuve' || e.type === 'parametre');

function idLibre(pref, w) { for (let i = 1; ; i++) { const id = pref + String(i).padStart(w, '0'); if (!EQ[id] && !M.liaisons.some(l => l.id === id) && !(M.cartes || []).some(c => c.id === id) && !(M.zones || []).some(z => z.id === id) && !lArete(id) && !laCarte(id) && !laZone(id) && !leTexte(id)) return id; } }

/* ------------------------------------------------------------------ mesure / ports / routage */
function ctxNoeud(n) {
  const e = EQ[n.id], r = n.rattaches || { annexes: [], vannes: [], moteur: null };
  const ctx = { annexes: (r.annexes || []).map(i => EQ[i]).filter(Boolean), vannes: (r.vannes || []).map(i => EQ[i]).filter(Boolean), moteurAgit: r.moteur ? EQ[r.moteur] : null };
  ctx.f = facteurTaille(e);
  if (estOuvrage(e)) {
    const c0 = n.geom && n.geom.corps, t = n.taille || {};
    ctx.corps_w = t.corps_w || (c0 && c0.w) || (e.type === 'parametre' ? ((e.params && e.params.tremies) || 4) * 70 : 170);
    ctx.corps_h = t.corps_h || (c0 && c0.h) || (e.type === 'parametre' ? 100 : 110);
    ctx.annexes_colonnes = Math.max(1, Math.floor((ctx.corps_w + 20) / G.ANNEXE_W));
  }
  return ctx;
}
function mesurerNoeud(n) {
  n.geom = G.mesurer(EQ[n.id], ctxNoeud(n)); n.w = n.geom.w; n.h = n.geom.h; n.rang = rangDe(EQ[n.id]);
  for (const p of Object.values(n.geom.ports)) { p.ax = arr1(n.x + p.x); p.ay = arr1(n.y + p.y); }
}
const portAbs = (n, nom) => { const p = n.geom.ports[nom]; return [arr1(n.x + (p.vx != null ? p.vx : p.x)), arr1(n.y + p.y)]; };
const PORTS_VISIBLES = ['in', 'out', 'surverse', 'boues', 'nord', 'p3', 'p4', 'p5', 'p6'];

function puces(a) {   // instruments en ligne : posés sur le plus long tronçon horizontal, de part et d'autre
  const ins = (a.inline || []).filter(i => EQ[i]); a.inline = ins; if (!ins.length && !a.chips) return;
  let sy = a.points[0][1], x0 = a.points[0][0], x1 = a.points[a.points.length - 1][0], best = -1;
  for (let q = 0; q < a.points.length - 1; q++) { const len = Math.abs(a.points[q + 1][0] - a.points[q][0]);
    if (Math.abs(a.points[q + 1][1] - a.points[q][1]) < 0.01 && len > best) { best = len; sy = a.points[q][1]; x0 = Math.min(a.points[q][0], a.points[q + 1][0]); x1 = Math.max(a.points[q][0], a.points[q + 1][0]); } }
  const nc = Math.ceil(ins.length / 2), deb = (x0 + x1) / 2 - (nc * PUCE.pas) / 2;
  a.chips = ins.map((id, j) => { const side = j % 2 === 0 ? -1 : 1, c = Math.floor(j / 2);
    return { id, x: arr1(deb + c * PUCE.pas + PUCE.pas / 2), y: arr1(sy + side * PUCE.decalage), sy: arr1(sy), side }; });
}
function routerArete(a) {
  const A = leNoeud(a.de), B = leNoeud(a.a); if (!A || !B) return;
  a.nd = a.de; a.na = a.a; a.ports = a.ports || { de: 'out', a: 'in' };
  if (!A.geom.ports[a.ports.de]) a.ports.de = 'out'; if (!B.geom.ports[a.ports.a]) a.ports.a = 'in';
  const pa = A.geom.ports[a.ports.de], pb = B.geom.ports[a.ports.a], P0 = portAbs(A, a.ports.de), P1 = portAbs(B, a.ports.a);
  if (a.passage) a.points = [[arr1(P0[0] - 14), P0[1]], [arr1(P1[0] + 14), P0[1]]];   // surverse dans la paroi commune (bassins accolés)
  else a.points = G.router(P0, pa.side, P1, pb.side, { via: a.jalons || [], coude: a.coude || 'milieu' });
  puces(a);
}
function rerouterAutour(ids) { for (const a of L.aretes) if (ids.has(a.de) || ids.has(a.a)) routerArete(a); majLiensCartes(); }
function majLiensCartes() {
  (L.cartes || []).forEach((c, i) => {
    const t = c.injection || {}, n = leNoeud(t.cible); const yb0 = c.y + c.h;
    if (n) {
      const cg = n.geom.corps, p = cg ? { x: n.x + cg.x + cg.w * 0.2, y: n.y + cg.y } : { x: n.x + n.w / 2, y: n.y };
      const sx = Math.min(Math.max(p.x, c.x + 26), c.x + c.w - 26), bus = yb0 + 22 + (i % 2) * 12;
      c.lien = { points: (Math.abs(sx - p.x) < 1 ? [[p.x, yb0], [p.x, p.y]] : [[sx, yb0], [sx, bus], [p.x, bus], [p.x, p.y]]).map(q => [arr1(q[0]), arr1(q[1])]), vers: t.cible, point: [arr1(p.x), arr1(p.y)] };
    } else { const d = laCarte(t.cible); if (d) { const droite = d.x > c.x, y = c.y + c.h / 2; c.lien = { points: [[droite ? c.x + c.w : c.x, y], [droite ? d.x : d.x + d.w, y]], vers: d.id }; } else delete c.lien; }
  });
}

/* ------------------------------------------------------------------ création */
function creerEquipement(cle, opt) {
  opt = opt || {}; const b = BIBLIO[cle], gr = cle === 'mesure' ? GRANDEURS[opt.grandeur || 'generique'] : null;
  const id = idLibre('NV-' + (gr ? gr.pref : b.pref) + '-', 2);
  const e = { id, libelle: b.lib, type: b.type, confiance: 1, a_verifier: false, source: 'éditeur', slots: {} };
  ['role', 'famille', 'grandeur', 'variante', 'forme'].forEach(k => { if (b[k]) e[k] = b[k]; });
  if (b.params) e.params = copie(b.params);
  if (gr) { e.grandeur = opt.grandeur || 'generique'; e.params.unite = gr.unite; e.libelle = gr.nom === 'Générique' ? 'Mesure' : 'Mesure ' + gr.nom.toLowerCase(); }
  b.slots.forEach(nom => { e.slots[nom] = slotVide(); });
  e.rang = TYPES_PRINCIPAUX.includes(e.type) ? 'principal' : 'secondaire';
  M.equipements.push(e); EQ[id] = e; return e;
}
function ajouterNoeud(e, cx, cy) {   // (cx, cy) = centre voulu
  const n = { id: e.id, x: 0, y: 0, w: 0, h: 0, geom: null, rang: rangDe(e), rattaches: null };
  L.noeuds.push(n); mesurerNoeud(n); n.x = snap(cx - n.w / 2); n.y = snap(cy - n.h / 2); mesurerNoeud(n); return n;
}
function attacher(e, hoteId) {
  const n = leNoeud(hoteId); if (!n || !estOuvrage(EQ[hoteId])) return false;
  n.rattaches = n.rattaches || { annexes: [], vannes: [], moteur: null };
  if (e.type === 'moteur' && e.role === 'agitateur') { if (n.rattaches.moteur && n.rattaches.moteur !== e.id) return false; n.rattaches.moteur = e.id; }
  else n.rattaches.annexes.push(e.id);
  e.monte_sur = hoteId; e.rang = 'secondaire'; L.hote = L.hote || {}; L.hote[e.id] = hoteId; mesurerNoeud(n); rerouterAutour(new Set([hoteId])); return true;
}
function poserSurConduite(e, areteId) {
  const a = lArete(areteId), l = (M.liaisons || []).find(x => x.id === areteId); if (!a || !l) return false;
  a.inline = a.inline || []; l.inline = l.inline || []; a.inline.push(e.id); l.inline.push(e.id); e.rang = 'secondaire'; puces(a); return true;
}
function creerCarte(cx) {
  const eq = creerEquipement('carte'); eq.rang = 'auxiliaire';
  const id = idLibre('CARTE_NV', 1); eq.carte = id;
  const cuve = L.noeuds.filter(n => estOuvrage(EQ[n.id])).sort((p, q) => Math.abs(p.x + p.w / 2 - cx) - Math.abs(q.x + q.w / 2 - cx))[0];
  eq.injection = { cible: cuve ? cuve.id : null, point: 'haut' };
  const c = { id, titre: 'Nouvel auxiliaire', injection: { cible: cuve ? cuve.id : null, point: 'haut' }, etats_cles: [{ libelle: 'Marche', eq: eq.id, slot: 'marche' }], membres: [eq.id],
    w: CARTE_DIM.w, h: CARTE_DIM.h, x: snap(Math.max(0, Math.min(L.w - CARTE_DIM.w, cx - CARTE_DIM.w / 2))), y: CARTE_DIM.y };
  (M.cartes = M.cartes || []).push({ id, titre: c.titre, injection: c.injection, etats_cles: c.etats_cles });
  (L.cartes = L.cartes || []).push(c); majLiensCartes(); return c;
}
function creerConduite(deId, portDe, aId, portA, fluide) {
  const A = leNoeud(deId), B = leNoeud(aId); if (!A || !B) return { erreur: 'extrémité absente' };
  if (deId === aId) return { erreur: 'une conduite relie deux ouvrages différents' };
  if (L.aretes.some(a => a.de === deId && a.a === aId && a.ports && a.ports.de === portDe && a.ports.a === portA)) return { erreur: 'cette conduite existe déjà' };
  const id = idLibre('L', 2); fluide = fluide || 'procede';   // « Procédé » : neutre, sans choix au tracé (la couleur se pose ensuite au pinceau)
  M.liaisons.push({ id, de: deId, a: aId, fluide, libelle: '', inline: [], port_de: portDe, port_a: portA, confiance: 1, source: 'éditeur' });
  const a = { id, de: deId, a: aId, nd: deId, na: aId, fluide, libelle: '', points: [], inline: [], label: null, chips: [], jalons: [], axe: false, passage: false, ports: { de: portDe, a: portA } };
  L.aretes.push(a); routerArete(a); return { id };
}
function ajouterTexte(x, y) { const t = { id: idLibre('TXT', 2), x: snap(x), y: snap(y), texte: 'Texte' }; (L.textes = L.textes || []).push(t); return t; }
function ajouterZone(cx, cy) {
  const id = idLibre('Z_NV', 1), w = 360, h = 220; const z = { id, titre: 'Nouvelle zone', x: snap(cx - w / 2), y: snap(cy - h / 2), w, h };
  (L.zones = L.zones || []).push(z); (M.zones = M.zones || []).push({ id, titre: z.titre, confiance: 1 }); return z;
}
/* Dépôt d'un symbole de la palette en (x, y) ; `cible` = élément DOM sous le pointeur (fixation sur un ouvrage ou une conduite). */
function deposer(cle, x, y, cible, opt) {
  if (String(cle).startsWith('ent:')) return deposerEnt(cle.slice(4), x, y, cible);
  const b = BIBLIO[cle]; if (!b) return null;
  if (b.special === 'texte') return { cle: 'te:' + ajouterTexte(x, y).id };
  if (b.special === 'zone') return { cle: 'zo:' + ajouterZone(x, y).id };
  if (b.special === 'carte') { const c = creerCarte(x); return { cle: 'ca:' + c.id }; }
  const e = creerEquipement(cle, opt || { grandeur: ED.grandeur });
  const hoteEl = cible && cible.closest && cible.closest('[data-node]'), cond = cible && cible.closest && cible.closest('[data-arete]');
  if (hoteEl && ['agitateur', 'mesure', 'voyant'].includes(cle) && !(opt && opt.pasHote) && attacher(e, hoteEl.dataset.node)) return { cle: 'eq:' + e.id, fixe: hoteEl.dataset.node };
  if (cond && ['vanne', 'vanne_reg', 'mesure', 'vanne_man', 'vanne_3v', 'clapet'].includes(cle) && poserSurConduite(e, cond.dataset.arete)) return { cle: 'eq:' + e.id, surConduite: cond.dataset.arete };
  ajouterNoeud(e, x, y); return { cle: 'eq:' + e.id };
}

/* ------------------------------------------------------------------ modification */
function deplacerCles(origines, dx, dy) {   // origines : Map(clé → {x,y}) ; ne bouge que ce qui est déplaçable
  const bouges = new Set();
  for (const [k, o] of origines) { const t = k.slice(0, 2), id = k.slice(3);
    if (t === 'eq') { const n = leNoeud(id); if (n) { n.x = arr1(o.x + dx); n.y = arr1(o.y + dy); bouges.add(id); } }
    else if (t === 'ca') { const c = laCarte(id); if (c) { c.x = arr1(o.x + dx); c.y = arr1(o.y + dy); } }
    else if (t === 'zo') { const z = laZone(id); if (z) { z.x = arr1(o.x + dx); z.y = arr1(o.y + dy); } }
    else if (t === 'te') { const q = leTexte(id); if (q) { q.x = arr1(o.x + dx); q.y = arr1(o.y + dy); } } }
  L.noeuds.forEach(n => { if (bouges.has(n.id)) for (const p of Object.values(n.geom.ports)) { p.ax = arr1(n.x + p.x); p.ay = arr1(n.y + p.y); } });
  rerouterAutour(bouges);
}
const originesDe = (cles) => { const m = new Map(); for (const k of cles) { const id = k.slice(3), o = k.startsWith('eq:') ? leNoeud(id) : k.startsWith('ca:') ? laCarte(id) : k.startsWith('zo:') ? laZone(id) : k.startsWith('te:') ? leTexte(id) : null; if (o) m.set(k, { x: o.x, y: o.y }); } return m; };
function redimensionnerNoeud(id, cw, ch) {
  const n = leNoeud(id); if (!n || !estOuvrage(EQ[n.id])) return false;
  n.taille = { corps_w: Math.max(60, Math.round(cw)), corps_h: Math.max(50, Math.round(ch)) };
  if (EQ[id].type === 'parametre') { const nb = (EQ[id].params && EQ[id].params.tremies) || 4; n.taille.corps_w = Math.max(nb * 30, Math.round(n.taille.corps_w / nb) * nb); }
  mesurerNoeud(n); rerouterAutour(new Set([id])); return true;
}
function redimensionnerZone(id, w, h) { const z = laZone(id); if (!z) return; z.w = Math.max(80, Math.round(w)); z.h = Math.max(60, Math.round(h)); }
function changerTremies(id, nb) {
  const e = EQ[id], n = leNoeud(id); if (!e || e.type !== 'parametre') return; nb = Math.max(1, Math.min(8, Math.round(nb)));
  const ancien = (e.params && e.params.tremies) || 4, hw = (n.taille && n.taille.corps_w ? n.taille.corps_w : n.geom.corps.w) / ancien;
  e.params = Object.assign({}, e.params, { tremies: nb }); n.taille = { corps_w: Math.round(hw * nb), corps_h: (n.taille && n.taille.corps_h) || n.geom.corps.h };
  M.equipements.filter(v => v.monte_sur === id && v.emplacement && v.emplacement.tremie > nb).forEach(v => { v.emplacement.tremie = nb; });
  mesurerNoeud(n); rerouterAutour(new Set([id]));
}
function changerLibelle(id, txt) { const e = EQ[id]; if (!e || !txt.trim()) return; e.libelle = txt.trim(); const n = leNoeud(id) || leNoeud(e.monte_sur); if (n) { mesurerNoeud(n); rerouterAutour(new Set([n.id])); } }
function renommer(ancien, nouveau) {
  nouveau = nouveau.trim(); if (!nouveau || nouveau === ancien) return null;
  if (!/^[\w.\-]+$/.test(nouveau)) return 'repère : lettres, chiffres, tiret, point et souligné uniquement';
  if (EQ[nouveau] || lArete(nouveau) || laCarte(nouveau) || laZone(nouveau)) return 'ce repère existe déjà';
  const txt = JSON.stringify({ modele: M, layout: L }).split(JSON.stringify(ancien)).join(JSON.stringify(nouveau));   // remplace toutes les références exactes (liaisons, nœuds, cartes, hôtes…)
  chargerDoc(JSON.parse(txt)); ED.sel = ED.sel.map(k => k.slice(3) === ancien ? k.slice(0, 3) + nouveau : k); return null;
}
function validerEquipement(id, tout) {
  const e = EQ[id]; if (!e) return; e.a_verifier = false;
  if (tout) Object.values(e.slots || {}).forEach(sp => { if (sp) sp.a_verifier = false; });
}
function validerEmplacement(id, nom) { const sp = EQ[id] && EQ[id].slots && EQ[id].slots[nom]; if (sp) sp.a_verifier = false; }
function lierVariable(id, nom, variable) {
  const e = EQ[id]; if (!e) return; e.slots = e.slots || {}; const sp = (e.slots[nom] = e.slots[nom] || slotVide());
  if (!variable) { sp.variable = null; delete sp.adresse; sp.confiance = 0; return; }
  const c = DATA.catalogue.find(x => x.nom === variable);
  sp.variable = variable; sp.adresse = (c && c.adresse) || sp.adresse; sp.confiance = 1; sp.a_verifier = false; sp.source = 'éditeur';
  if (c && c.unite && e.type === 'mesure' && e.params && !e.params.unite) e.params.unite = c.unite;
  if (c && c.echelle && e.type === 'mesure' && e.params && e.params.max === 100 && e.params.min === 0) { e.params.min = c.echelle[0]; e.params.max = c.echelle[1]; }
}
function poserRegle(id, nom, regle) { const sp = EQ[id].slots[nom]; if (!regle || !Object.keys(regle).length) delete sp.regle; else sp.regle = regle; sp.a_verifier = false; }
function ajouterEmplacement(id, nom) { const e = EQ[id]; e.slots = e.slots || {}; if (!e.slots[nom]) e.slots[nom] = slotVide(); }
function reinitialiserTrace(areteId) { const a = lArete(areteId); if (!a) return; a.jalons = []; syncVia(a); routerArete(a); }
function insererVia(a, segment, pt) {   // point intermédiaire ajouté sur le tronçon `segment` ; renvoie son indice
  const idxPts = (a.jalons || []).map(v => a.points.findIndex(p => Math.abs(p[0] - v[0]) < 0.6 && Math.abs(p[1] - v[1]) < 0.6));
  let pos = 0; idxPts.forEach(i => { if (i >= 0 && i <= segment) pos++; });
  a.jalons = a.jalons || []; a.jalons.splice(pos, 0, [arr1(pt[0]), arr1(pt[1])]); return pos;
}
function syncVia(a) { const l = M.liaisons.find(x => x.id === a.id); if (l) { if (a.jalons && a.jalons.length) l.jalons = copie(a.jalons); else delete l.jalons; } }

/* « Remplacer le dessin » : autre symbole de la bibliothèque, ou image déposée */
function remplacerSymbole(id, cle) {
  const e = EQ[id], b = BIBLIO[cle]; if (!e || !b || b.special) return;
  if (e.type === 'image') { delete e.image; delete e.type_origine; }
  e.type = b.type; if (b.role) e.role = b.role; else delete e.role; if (b.famille) e.famille = b.famille; else delete e.famille;
  if (b.params) e.params = Object.assign(copie(b.params), e.params || {});
  e.slots = e.slots || {}; b.slots.forEach(nom => { if (!e.slots[nom]) e.slots[nom] = slotVide(); });
  if (!e.carte && !e.monte_sur) e.rang = TYPES_PRINCIPAUX.includes(e.type) ? 'principal' : 'secondaire';
  remesurerFamille(id);
}
function poserImage(id, dataUrl) {
  const e = EQ[id]; if (!e) return; if (e.type !== 'image') e.type_origine = e.type; e.type = 'image'; e.image = dataUrl; delete e.role; delete e.famille;
  if (!e.carte && !e.monte_sur) e.rang = 'secondaire'; remesurerFamille(id);
}
function comportementImage(id, base) {   // l'image garde la logique d'état d'un symbole de la bibliothèque
  const e = EQ[id]; if (!e || e.type !== 'image') return; e.type_origine = base; (SLOTS_TYPE[base] || []).forEach(nom => { if (!e.slots[nom]) e.slots[nom] = slotVide(); }); remesurerFamille(id);
}
function remesurerFamille(id) { const n = leNoeud(id) || leNoeud((EQ[id] || {}).monte_sur); if (n) { mesurerNoeud(n); rerouterAutour(new Set([n.id])); } }

/* ------------------------------------------------------------------ suppression */
function supprimerEquipement(id) {
  const aSupprimer = new Set([id]); M.equipements.forEach(e => { if (e.monte_sur === id) aSupprimer.add(e.id); });
  const hotes = new Set(); aSupprimer.forEach(i => { const h = EQ[i] && EQ[i].monte_sur; if (h && !aSupprimer.has(h)) hotes.add(h); });
  M.equipements = M.equipements.filter(e => !aSupprimer.has(e.id));
  const perdues = new Set(M.liaisons.filter(l => aSupprimer.has(l.de) || aSupprimer.has(l.a)).map(l => l.id));
  M.liaisons = M.liaisons.filter(l => !perdues.has(l.id)); M.liaisons.forEach(l => { if (l.inline) l.inline = l.inline.filter(i => !aSupprimer.has(i)); });
  L.aretes = L.aretes.filter(a => !perdues.has(a.id)); L.aretes.forEach(a => { if (a.inline) a.inline = a.inline.filter(i => !aSupprimer.has(i)); });
  L.noeuds = L.noeuds.filter(n => !aSupprimer.has(n.id));
  L.noeuds.forEach(n => { if (n.rattaches) { n.rattaches.annexes = (n.rattaches.annexes || []).filter(i => !aSupprimer.has(i)); n.rattaches.vannes = (n.rattaches.vannes || []).filter(i => !aSupprimer.has(i)); if (aSupprimer.has(n.rattaches.moteur)) n.rattaches.moteur = null; } });
  aSupprimer.forEach(i => { if (L.hote) delete L.hote[i]; });
  (L.cartes || []).forEach(c => { c.membres = (c.membres || []).filter(i => !aSupprimer.has(i)); c.etats_cles = (c.etats_cles || []).filter(it => !aSupprimer.has(it.eq)); });
  (M.cartes || []).forEach(c => { c.etats_cles = (c.etats_cles || []).filter(it => !aSupprimer.has(it.eq)); });
  const vides = (L.cartes || []).filter(c => !c.membres.length).map(c => c.id); L.cartes = (L.cartes || []).filter(c => c.membres.length); M.cartes = (M.cartes || []).filter(c => !vides.includes(c.id));
  EQ = Object.fromEntries(M.equipements.map(e => [e.id, e]));
  hotes.forEach(h => { const n = leNoeud(h); if (n) mesurerNoeud(n); }); L.aretes.forEach(a => puces(a)); majLiensCartes();
}
function supprimerCles(cles) {
  for (const k of cles) { const id = k.slice(3);
    if (k.startsWith('eq:') && EQ[id]) supprimerEquipement(id);
    else if (k.startsWith('ar:')) { M.liaisons = M.liaisons.filter(l => l.id !== id); L.aretes = L.aretes.filter(a => a.id !== id); }
    else if (k.startsWith('zo:')) { L.zones = L.zones.filter(z => z.id !== id); M.zones = (M.zones || []).filter(z => z.id !== id); }
    else if (k.startsWith('te:')) L.textes = (L.textes || []).filter(t => t.id !== id);
    else if (k.startsWith('ca:')) { const c = laCarte(id); if (c) c.membres.slice().forEach(m => { if (EQ[m]) supprimerEquipement(m); }); } }
  ED.sel = ED.sel.filter(existeCle);
}
function existeCle(k) {
  const id = k.slice(3);
  return k.startsWith('eq:') ? !!EQ[id] : k.startsWith('ar:') ? !!lArete(id) : k.startsWith('zo:') ? !!laZone(id) : k.startsWith('te:') ? !!leTexte(id) : k.startsWith('ca:') ? !!laCarte(id) : false;
}

/* ------------------------------------------------------------------ redessin complet (après une opération structurelle) */
function redessinerTout(leger) {
  V = VALEURS;   // les variables nouvellement reliées reçoivent leur valeur de démonstration
  dessiner(); if (!leger) { habillage(); EDITEUR.panneau(); } majBarre();
}


/* ======================================================================
   MODULE : editeur_p7 — éditeur : taille, cartes, pinceau, bibliothèque
   ====================================================================== */

/* Éditeur — passe 7 : opérations (sans souris, donc testables) pour la taille, « Afficher en carte », le pinceau de couleurs et la bibliothèque de l'entreprise. */

/* ------------------------------------------------------------------ Taille (immédiate, annulable) */
function changerTaille(id, t) {
  const e = EQ[id], n = leNoeud(id); if (!e || !FACTEUR_TAILLE[t]) return false;
  if (!n) { e.taille = t; return true; }           // sans nœud (instrument rattaché) : mémorisé seulement
  const avant = facteurTaille(e); e.taille = t; const ratio = facteurTaille(e) / avant;
  if (estOuvrage(e)) {                               // ouvrage : le corps est redimensionné (les poignées restent utilisables ensuite)
    const c = n.geom.corps, nb = e.type === 'parametre' ? ((e.params && e.params.tremies) || 4) : 1;
    let cw = Math.round(c.w * ratio), ch = Math.round(c.h * ratio); if (e.type === 'parametre') cw = Math.max(nb * 30, Math.round(cw / nb) * nb);
    n.taille = { corps_w: Math.max(60, cw), corps_h: Math.max(50, ch) };
  }
  const cx = n.x + n.w / 2, cy = n.y + n.h / 2;
  mesurerNoeud(n); n.x = snap(cx - n.w / 2); n.y = snap(cy - n.h / 2); mesurerNoeud(n);   // le centre ne bouge pas
  rerouterAutour(new Set([id])); return true;
}

/* ------------------------------------------------------------------ « Afficher en carte » */
const peutEtreCarte = (e) => !!e && !estOuvrage(e) && e.type !== 'raccord' && !e.monte_sur && !(M.liaisons || []).some(l => (l.inline || []).includes(e.id));
function enCarte(id) {
  const e = EQ[id], n = leNoeud(id); if (!e || !n || e.carte || !peutEtreCarte(e)) return false;
  const cuve = L.noeuds.filter(q => estOuvrage(EQ[q.id])).sort((p, q) => Math.abs(p.x + p.w / 2 - (n.x + n.w / 2)) - Math.abs(q.x + q.w / 2 - (n.x + n.w / 2)))[0];
  const cid = idLibre('CARTE_NV', 1); e.carte = cid; e.rang = 'auxiliaire'; e.injection = { cible: cuve ? cuve.id : null, point: 'haut' };
  const noms = Object.keys(e.slots || {}).slice(0, 3);
  const c = { id: cid, titre: e.libelle, injection: { cible: cuve ? cuve.id : null, point: 'haut' }, etats_cles: noms.map(nm => ({ libelle: libEmpl(e, nm), eq: e.id, slot: nm })), membres: [e.id], w: CARTE_DIM.w, h: CARTE_DIM.h, x: 0, y: CARTE_DIM.y };
  let x = snap(Math.max(0, Math.min(L.w - c.w, n.x + n.w / 2 - c.w / 2)));
  const libre = (xx) => !(L.cartes || []).some(o => xx < o.x + o.w + 10 && xx + c.w + 10 > o.x);
  for (let k = 0; k < 12 && !libre(x); k++) { x += c.w + 20; if (x + c.w > L.w) x = 0; }
  c.x = x;
  // les conduites du symbole disparaissent (la liaison devient le lien pointillé vers l'ouvrage)
  const perdues = new Set(M.liaisons.filter(l => l.de === id || l.a === id).map(l => l.id));
  M.liaisons = M.liaisons.filter(l => !perdues.has(l.id)); L.aretes = L.aretes.filter(a => !perdues.has(a.id));
  L.noeuds = L.noeuds.filter(q => q.id !== id);
  (M.cartes = M.cartes || []).push({ id: cid, titre: c.titre, injection: c.injection, etats_cles: c.etats_cles }); (L.cartes = L.cartes || []).push(c);
  majLiensCartes(); ED.sel = ['eq:' + id]; return true;
}
function depuisCarte(id) {
  const e = EQ[id]; if (!e || !e.carte) return false;
  const c = laCarte(e.carte); const cx = c ? c.x + c.w / 2 : L.w / 2, cy = c ? c.y + c.h + 150 : 300;
  if (c) { c.membres = c.membres.filter(m => m !== id); c.etats_cles = (c.etats_cles || []).filter(it => it.eq !== id);
    const m = (M.cartes || []).find(q => q.id === c.id); if (m) m.etats_cles = (m.etats_cles || []).filter(it => it.eq !== id);
    if (!c.membres.length) { L.cartes = L.cartes.filter(q => q.id !== c.id); M.cartes = (M.cartes || []).filter(q => q.id !== c.id); } }
  delete e.carte; delete e.injection; e.rang = TYPES_PRINCIPAUX.includes(e.type) ? 'principal' : 'secondaire';
  ajouterNoeud(e, cx, cy); majLiensCartes(); ED.sel = ['eq:' + id]; return true;
}

/* ------------------------------------------------------------------ pinceau de couleurs */
function colorerAretes(ids, couleur) {
  ids.forEach(id => { const a = lArete(id), l = M.liaisons.find(x => x.id === id); if (!a || !l) return;
    if (couleur) { a.couleur = couleur; l.couleur = couleur; delete l.couleur_choisie; } else { delete a.couleur; delete l.couleur; l.couleur_choisie = true; } });
}
function nommerCouleur(c, nom) {
  M.legende = M.legende || {}; nom = String(nom || '').trim();
  if (nom) M.legende[c] = nom; else delete M.legende[c];
  if (!Object.keys(M.legende).length) delete M.legende;
}

/* ------------------------------------------------------------------ bibliothèque de l'entreprise (symboles personnalisés) */
const CLE_BIB = 'myhexa.synoptique.bibliotheque';   // la bibliothèque de l'entreprise survit au rechargement et aux autres brouillons
function sauverBiblio() { }   // la bibliothèque de l'entreprise vit dans le document (modele.bibliotheque)
function fusionnerBiblio() { }
const biblioEnt = () => M.bibliotheque || [];
const defEnt = (id) => biblioEnt().find(d => d.id === id);
const SLOTS_COMPORTEMENT = { pompe: ['marche', 'defaut', 'vitesse'], vanne: ['ouvert', 'ferme', 'defaut'], cuve: ['niveau'], libre: [] };
const slotsSymbole = (d) => d.comportement === 'libre' ? (d.etats || []).map(x => x.cle) : SLOTS_COMPORTEMENT[d.comportement || 'pompe'];
function normaliserDef(d) {   // garde-fous communs (éditeur de formes, import JSON)
  d.comportement = SLOTS_COMPORTEMENT[d.comportement] ? d.comportement : 'pompe'; d.etats = d.comportement === 'libre' ? (d.etats || []) : [];
  d.silhouette = d.silhouette || { largeur: 100, hauteur: 80, primitives: [] }; return d;
}
function enregistrerSymbole(d) {   // crée ou remplace (même id) une entrée de la bibliothèque
  normaliserDef(d); M.bibliotheque = M.bibliotheque || [];
  if (!d.id) { let i = 1; while (defEnt('SYM-' + String(i).padStart(2, '0'))) i++; d.id = 'SYM-' + String(i).padStart(2, '0'); }
  const k = M.bibliotheque.findIndex(x => x.id === d.id); if (k >= 0) M.bibliotheque[k] = d; else M.bibliotheque.push(d); sauverBiblio(); return d;
}
function supprimerSymboleEnt(id) { M.bibliotheque = biblioEnt().filter(d => d.id !== id); if (!M.bibliotheque.length) delete M.bibliotheque; sauverBiblio(); }
function appliquerDefAEquipement(e, d) {
  e.type = 'silhouette'; e.silhouette = copie(d.silhouette); e.comportement = d.comportement; e.symbole_ent = d.id;
  if (d.comportement === 'libre') e.etats = copie(d.etats); else delete e.etats;
  if (d.zone && d.zone.type) e.zone_anim = copie(d.zone); else delete e.zone_anim;
  e.slots = e.slots || {}; slotsSymbole(d).forEach(nm => { if (!e.slots[nm]) e.slots[nm] = slotVide(); });
}
function creerEquipementEnt(d) {
  const id = idLibre('NV-' + (d.prefixe || 'SY') + '-', 2);
  const e = { id, libelle: d.nom, type: 'silhouette', confiance: 1, a_verifier: false, source: 'éditeur', slots: {}, rang: 'secondaire' };
  appliquerDefAEquipement(e, d); M.equipements.push(e); EQ[id] = e; return e;
}
function deposerEnt(defId, x, y) {
  const d = defEnt(defId); if (!d) return null; const e = creerEquipementEnt(d); ajouterNoeud(e, x, y); return { cle: 'eq:' + e.id };
}
/* « Modifier le dessin » d'une silhouette : remplace le dessin de CET équipement (la bibliothèque n'est pas touchée). */
function modifierDessin(id, d) {
  const e = EQ[id]; if (!e) return; e.silhouette = copie(d.silhouette); e.comportement = d.comportement || e.comportement;
  if (d.zone && d.zone.type) e.zone_anim = copie(d.zone); else delete e.zone_anim;
  if (d.comportement === 'libre') e.etats = copie(d.etats); else if (d.comportement) delete e.etats;
  e.slots = e.slots || {}; slotsSymbole({ comportement: e.comportement || 'pompe', etats: e.etats }).forEach(nm => { if (e.comportement && !e.slots[nm]) e.slots[nm] = slotVide(); });
  remesurerFamille(id);
}
const libEmpl = (e, nom) => SLOT_FR[nom] || ((e && e.etats) || []).reduce((r, x) => r || (x.cle === nom ? x.nom : null), null) || nom;


/* ======================================================================
   MODULE : editeur_controles — éditeur : contrôles (chevauchements, hors cadre)
   ====================================================================== */

/* Éditeur — contrôles en direct : mêmes règles que hierarchie.mjs (chevauchement de boîtes, hors cadre) + textes qui sortent du cadre.
   Résultat discret : un compteur dans la barre (info-bulle = liste) et un contour orange sur les éléments concernés. */
const accoles = (a, b) => (EQ[b] && EQ[b].accole_a === a) || (EQ[a] && EQ[a].accole_a === b);
function boitesControle() {
  const b = [];
  L.noeuds.forEach(n => b.push({ k: n.id, id: n.id, x: n.x, y: n.y, w: n.w, h: n.h }));
  L.aretes.forEach(a => (a.chips || []).forEach(c => { if (EQ[c.id]) b.push({ k: 'puce ' + c.id, id: c.id, x: c.x - PUCE.w / 2, y: c.y - PUCE.h / 2, w: PUCE.w, h: PUCE.h }); }));
  (L.cartes || []).forEach(c => b.push({ k: 'carte ' + c.id, id: null, cle: 'ca:' + c.id, x: c.x, y: c.y, w: c.w, h: c.h }));
  return b;
}
function controles(avecTextes) {
  const msgs = [], ids = new Set(), W = L.w, H = L.h; const b = boitesControle();
  for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) {
    const p = b[i], q = b[j]; if (accoles(p.k, q.k)) continue;
    const ox = Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x), oy = Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y);
    if (ox > 1 && oy > 1) { msgs.push({ txt: `chevauchement ${p.k} / ${q.k}`, cle: (p.id ? 'eq:' + p.id : p.cle) }); if (p.id) ids.add(p.id); if (q.id) ids.add(q.id); }
  }
  b.forEach(x => { if (x.x < 0 || x.y < 0 || x.x + x.w > W || x.y + x.h > H) { msgs.push({ txt: `hors cadre : ${x.k}`, cle: x.id ? 'eq:' + x.id : x.cle }); if (x.id) ids.add(x.id); } });
  if (avecTextes !== false && etatVerif) {   // textes réellement affichés qui dépassent le cadre de la scène
    const m = svg.getScreenCTM(); if (m) { const f = { l: m.e - 1, t: m.f - 1, r: m.e + W * m.a + 1, b: m.f + H * m.d + 1 }, vus = new Set();
      svg.querySelectorAll('text').forEach(t => { if (!t.textContent.trim() || getComputedStyle(t).opacity === '0') return; const r = t.getBoundingClientRect(); if (!r.width) return;
        if (r.left < f.l || r.top < f.t || r.right > f.r || r.bottom > f.b) { const o = t.closest('[data-eq]'), id = o && o.dataset.eq; const k = id || t.textContent; if (vus.has(k)) return; vus.add(k);
          msgs.push({ txt: `texte hors cadre : ${(t.textContent || '').slice(0, 30)}`, cle: id ? 'eq:' + id : null }); if (id) ids.add(id); } }); }
  }
  return { messages: msgs, ids: [...ids] };
}
let minuteurControle = null;
function planifierControles() { clearTimeout(minuteurControle); minuteurControle = setTimeout(afficherControles, 120); }
function afficherControles() {
  const r = controles(); ED.avertissements = r.messages;
  r.ids.forEach(id => root.querySelectorAll(`#scene [data-node="${id}"]`).forEach(g => g.classList.add('avert')));
  const el = byId('ed-alertes'); if (!el) return;
  el.hidden = !r.messages.length; el.textContent = r.messages.length ? `⚠ ${r.messages.length}` : '';
  el.title = r.messages.map(m => m.txt).join('\n') || 'Aucun avertissement';
}


/* ======================================================================
   MODULE : editeur_scene — éditeur : souris et clavier dans la scène
   ====================================================================== */

/* Éditeur — interactions dans la scène : sélection, cadre, déplacement avec aimantation, poignées, conduites, clavier.
   Les événements passent par EDITEUR.gere(ev), appelé par le gestionnaire de zoom/déplacement de scene.js (retourne true = événement pris). */

const corpsScene = root.querySelector('.synbody');
const SEUIL_CLIC = 4;   // pixels écran avant qu'un appui devienne un déplacement
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const CLES_HIT = '[data-poignee],[data-via],[data-mid],[data-port],[data-eq],[data-carte],[data-arete],[data-texte],[data-zone]';

function monde(ev) { const p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY; const q = p.matrixTransform(svg.getScreenCTM().inverse()); return [q.x, q.y]; }
function cleDe(el) {
  if (el.dataset.eq) return 'eq:' + el.dataset.eq; if (el.dataset.carte) return 'ca:' + el.dataset.carte; if (el.dataset.arete) return 'ar:' + el.dataset.arete;
  if (el.dataset.texte) return 'te:' + el.dataset.texte; if (el.dataset.zone) return 'zo:' + el.dataset.zone; return null;
}
const deplacable = (k) => k.startsWith('eq:') ? !!leNoeud(k.slice(3)) : /^(ca|zo|te):/.test(k);
function selectionner(cles, ajout) {
  ED.sel = ajout ? [...new Set([...ED.sel, ...cles])] : cles; dessiner(); EDITEUR.panneau();
}
function basculerSel(k) { selectionner(ED.sel.includes(k) ? ED.sel.filter(x => x !== k) : [...ED.sel, k]); }

/* ------------------------------------------------------------------ superpositions (grille, sélection, poignées, ports, aperçu) */
EDITEUR.apresDessin = function () {
  const racine = byId('monde'); if (!racine || !etatVerif) return;
  const defs = racine.querySelector('defs');
  // grille visible en édition seulement : motif fin + repère tous les 5 pas
  const g = ED.grille, motif = s('pattern', { id: 'pat-grille', width: g * 5, height: g * 5, patternUnits: 'userSpaceOnUse' });
  for (let i = 0; i < 5; i++) { const o = i === 0 ? 0.16 : 0.07; motif.append(s('path', { d: `M${i * g} 0V${g * 5}`, class: 'gr', 'stroke-opacity': o }), s('path', { d: `M0 ${i * g}H${g * 5}`, class: 'gr', 'stroke-opacity': o })); }
  defs.append(motif);
  const fond = s('g', { class: 'ed-fond' }, s('rect', { x: 0, y: 0, width: L.w, height: L.h, class: 'ed-cadre' }));
  if (ED.grilleVisible) fond.prepend(s('rect', { x: 0, y: 0, width: L.w, height: L.h, fill: 'url(#pat-grille)', class: 'ed-grille' }));
  racine.insertBefore(fond, defs.nextSibling);
  // classes de sélection
  for (const k of ED.sel) { const id = k.slice(3), sel = k.startsWith('eq:') ? `[data-eq="${id}"]` : k.startsWith('ar:') ? `[data-arete="${id}"]` : k.startsWith('zo:') ? `[data-zone="${id}"]` : k.startsWith('te:') ? `[data-texte="${id}"]` : `[data-carte="${id}"]`;
    svg.querySelectorAll(sel).forEach(el => el.classList.add('sel')); }
  const haut = s('g', { class: 'ed-haut' }); racine.append(haut);
  const unique = ED.sel.length === 1 ? ED.sel[0] : null;
  // poignées de redimensionnement (ouvrage principal ou zone sélectionné seul)
  if (unique && unique.startsWith('eq:') && estOuvrage(EQ[unique.slice(3)]) && leNoeud(unique.slice(3))) {
    const n = leNoeud(unique.slice(3)), c = n.geom.corps; const x0 = n.x + c.x, y0 = n.y + c.y;
    haut.append(s('rect', { x: x0, y: y0, width: c.w, height: c.h, class: 'ed-cadre-sel' }));
    [['e', x0 + c.w, y0 + c.h / 2], ['s', x0 + c.w / 2, y0 + c.h], ['se', x0 + c.w, y0 + c.h]].forEach(([cote, x, y]) => haut.append(s('rect', { x: x - 6, y: y - 6, width: 12, height: 12, rx: 3, class: 'ed-poignee ' + cote, 'data-poignee': cote })));
  }
  if (unique && unique.startsWith('zo:')) { const z = laZone(unique.slice(3)); if (z) [['e', z.x + z.w, z.y + z.h / 2], ['s', z.x + z.w / 2, z.y + z.h], ['se', z.x + z.w, z.y + z.h]].forEach(([cote, x, y]) => haut.append(s('rect', { x: x - 6, y: y - 6, width: 12, height: 12, rx: 3, class: 'ed-poignee ' + cote, 'data-poignee': cote }))); }
  // points intermédiaires de la conduite sélectionnée : poignées de coude + poignées de milieu de tronçon
  if (unique && unique.startsWith('ar:')) { const a = lArete(unique.slice(3));
    if (a && !a.passage) {
      (a.jalons || []).forEach((v, i) => haut.append(s('circle', { cx: v[0], cy: v[1], r: 7, class: 'ed-via', 'data-via': i })));
      for (let i = 0; i < a.points.length - 1; i++) { const p = a.points[i], q = a.points[i + 1]; if (Math.hypot(q[0] - p[0], q[1] - p[1]) < 40) continue;
        haut.append(s('circle', { cx: (p[0] + q[0]) / 2, cy: (p[1] + q[1]) / 2, r: 5, class: 'ed-mid', 'data-mid': i })); } } }
  // ports : visibles avec l'outil Conduite (ou pendant un tracé)
  if (ED.outil === 'conduite' || ED.attente) {
    L.noeuds.forEach(n => Object.keys(n.geom.ports).filter(p => PORTS_VISIBLES.includes(p)).forEach(nom => { if (nom === 'nord' && !estOuvrage(EQ[n.id])) return;
      const [x, y] = portAbs(n, nom); const att = ED.attente && ED.attente.id === n.id && ED.attente.port === nom;
      haut.append(s('circle', { cx: x, cy: y, r: 8, class: 'ed-port' + (att ? ' att' : ''), 'data-port': n.id + '|' + nom }, s('title', { text: `${n.id} · ${PORTS_FR[nom] || nom}` }))); })); }
  EDITEUR.apercu(haut);
  if (ED.drag && ED.drag.type === 'cadre' && ED.drag.actif) { const r = ED.drag.rect; haut.append(s('rect', { x: r.x, y: r.y, width: r.w, height: r.h, class: 'ed-cadre-selection' })); }
  planifierControles();
};
const PORTS_FR = { in: 'entrée', out: 'sortie', surverse: 'surverse', boues: 'boues', nord: 'haut', p3: 'port 3', p4: 'port 4', p5: 'port 5', p6: 'port 6' };
EDITEUR.apercu = function (haut) {   // aperçu orthogonal du tracé en cours
  const at = ED.attente; if (!at || !at.curseur) return;
  const A = leNoeud(at.id); if (!A) return; const pa = A.geom.ports[at.port], P0 = portAbs(A, at.port), cur = at.curseur;
  const DIR_OPPOSEE = { E: 'W', W: 'E', N: 'S', S: 'N' }; let fin = cur, db = DIR_OPPOSEE[pa.side];
  if (at.survol) { const B = leNoeud(at.survol.id); if (B) { fin = portAbs(B, at.survol.port); db = B.geom.ports[at.survol.port].side; } }
  const pts = G.router(P0, pa.side, fin, db, {});
  haut.append(s('path', { d: pts.map((q, i) => (i ? 'L' : 'M') + q[0] + ' ' + q[1]).join(' '), class: 'ed-apercu' }));
};

/* ------------------------------------------------------------------ gestion de la souris */
EDITEUR.gere = function (ev) {
  if (!etatVerif) return false;
  if (ev.target.closest('.ed-palette,.ed-props,.legende,.edbar,.ed-popup')) return true;   // on ne fait pas glisser la vue depuis les panneaux
  if (ev.button !== 0 || ED.espace) return false;                                          // bouton milieu / Espace + glisser = déplacer la vue
  if (document.activeElement && document.activeElement !== root) document.activeElement.blur();
  fermerSelecteur();
  const cibleEl = ev.target.closest(CLES_HIT), [mx, my] = monde(ev); ev.preventDefault();
  const base = { cx: ev.clientX, cy: ev.clientY, depart: [mx, my], actif: false, shift: ev.shiftKey };
  if (ED.armee) { const r = deposerEtSelectionner(ED.armee, mx, my, ev.target); ED.armee = null; majPalette(); return true; }
  // --- outil Conduite : clic sur un port, puis sur un autre
  if (cibleEl && cibleEl.dataset.port) {
    const [id, port] = cibleEl.dataset.port.split('|');
    if (!ED.attente) ED.attente = { id, port, curseur: [mx, my], survol: null };
    else if (ED.attente.id === id && ED.attente.port === port) ED.attente = null;
    else terminerConduite(id, port);
    ED.drag = { type: 'port', ...base, port: cibleEl.dataset.port }; dessiner(); return true;
  }
  if (ED.attente) { ED.attente = null; dessiner(); }
  if (cibleEl && cibleEl.dataset.poignee) { ED.drag = { type: 'taille', ...base, cote: cibleEl.dataset.poignee, cle: ED.sel[0] }; initTaille(ED.drag); return true; }
  if (cibleEl && cibleEl.dataset.jalons != null) { const a = lArete(ED.sel[0].slice(3)); ED.drag = { type: 'via', ...base, arete: a.id, i: +cibleEl.dataset.jalons }; return true; }
  if (cibleEl && cibleEl.dataset.mid != null) { const a = lArete(ED.sel[0].slice(3)); ED.drag = { type: 'via', ...base, arete: a.id, i: null, seg: +cibleEl.dataset.mid }; return true; }
  if (cibleEl) {
    const k = cleDe(cibleEl); if (!k) return true;
    if (ev.shiftKey) { basculerSel(k); return true; }
    if (!ED.sel.includes(k)) selectionner([k]);
    const cles = ED.sel.filter(deplacable);
    ED.drag = { type: 'deplacer', ...base, cle: k, orig: originesDe(cles) }; return true;
  }
  // --- fond : cadre de sélection
  if (!ev.shiftKey && ED.sel.length) { ED.sel = []; dessiner(); EDITEUR.panneau(); }
  ED.drag = { type: 'cadre', ...base, rect: { x: mx, y: my, w: 0, h: 0 }, avant: ev.shiftKey ? ED.sel.slice() : [] }; return true;
};
function initTaille(d) {
  if (d.cle.startsWith('eq:')) { const n = leNoeud(d.cle.slice(3)); d.o = { w: n.geom.corps.w, h: n.geom.corps.h }; } else { const z = laZone(d.cle.slice(3)); d.o = { w: z.w, h: z.h }; }
}
function terminerConduite(id, port) {
  const a = ED.attente; ED.attente = null; let de = a.id, pde = a.port, vers = id, pvers = port;
  if (pde === 'in' && pvers !== 'in') { [de, pde, vers, pvers] = [vers, pvers, de, pde]; }   // le sens suit l'écoulement : une entrée n'est jamais la source
  const r = creerConduite(de, pde, vers, pvers, ED.fluide);
  if (r.erreur) { toast(r.erreur, 'err'); return; }
  pousser(); ED.sel = ['ar:' + r.id]; redessinerTout(); toast(`Conduite ${r.id} créée`, 'ok');
}
function portSous(el) { const p = el && el.closest && el.closest('[data-port]'); if (!p) return null; const [id, port] = p.dataset.port.split('|'); return { id, port }; }

addG(window, 'pointermove', ev => {
  if (!etatVerif) return;
  if (ED.attente) { const el = document.elementFromPoint(ev.clientX, ev.clientY), ps = portSous(el); ED.attente.curseur = monde(ev); const avant = ED.attente.survol; ED.attente.survol = ps && !(ps.id === ED.attente.id && ps.port === ED.attente.port) ? ps : null;
    dessiner(); return; }
  const d = ED.drag; if (!d) return;
  if (!d.actif) { if (Math.hypot(ev.clientX - d.cx, ev.clientY - d.cy) < SEUIL_CLIC) return; d.actif = true; }
  const [mx, my] = monde(ev), dx0 = mx - d.depart[0], dy0 = my - d.depart[1];
  if (d.type === 'deplacer') {
    const ref = d.orig.get(d.cle); if (!ref) return;
    const dx = snap(ref.x + dx0) - ref.x, dy = snap(ref.y + dy0) - ref.y;
    deplacerCles(d.orig, dx, dy); d.bouge = true; dessiner();
  } else if (d.type === 'taille') {
    const w = d.cote.includes('e') ? snap(d.o.w + dx0) : d.o.w, h = d.cote.includes('s') ? snap(d.o.h + dy0) : d.o.h;
    if (d.cle.startsWith('eq:')) redimensionnerNoeud(d.cle.slice(3), w, h); else redimensionnerZone(d.cle.slice(3), w, h);
    d.bouge = true; dessiner();
  } else if (d.type === 'via') {
    const a = lArete(d.arete); if (d.i == null) d.i = insererVia(a, d.seg, [snap(mx), snap(my)]); a.jalons[d.i] = [snap(mx), snap(my)]; routerArete(a); syncVia(a); d.bouge = true; dessiner();
  } else if (d.type === 'cadre') {
    d.rect = { x: Math.min(d.depart[0], mx), y: Math.min(d.depart[1], my), w: Math.abs(mx - d.depart[0]), h: Math.abs(my - d.depart[1]) }; dessiner();
  }
});
addG(window, 'pointerup', ev => {
  if (!etatVerif) return;
  const d = ED.drag; ED.drag = null; if (!d) return;
  if (d.type === 'port') {   // glisser d'un port à l'autre = même résultat que deux clics
    if (d.actif && ED.attente) { const ps = portSous(document.elementFromPoint(ev.clientX, ev.clientY)); if (ps && !(ps.id === ED.attente.id && ps.port === ED.attente.port)) { terminerConduite(ps.id, ps.port); } else { dessiner(); } }
    return;
  }
  if (d.type === 'cadre') {
    if (d.actif) { const r = d.rect, hit = (x, y, w, h) => x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y;
      const cles = [...d.avant, ...L.noeuds.filter(n => hit(n.x, n.y, n.w, n.h)).map(n => 'eq:' + n.id), ...(L.cartes || []).filter(c => hit(c.x, c.y, c.w, c.h)).map(c => 'ca:' + c.id),
        ...(L.zones || []).filter(z => hit(z.x, z.y, z.w, z.h)).map(z => 'zo:' + z.id), ...(L.textes || []).filter(t => hit(t.x, t.y - 18, 120, 26)).map(t => 'te:' + t.id)];
      ED.sel = [...new Set(cles)]; }
    dessiner(); EDITEUR.panneau(); return;
  }
  if (d.bouge) { pousser(); redessinerTout(true); EDITEUR.panneau(); }
  else if (d.type === 'deplacer' && !d.shift) { /* simple clic : déjà sélectionné */ }
});
corpsScene.addEventListener('dblclick', ev => {   // double-clic : sur une conduite = point intermédiaire ; sur un point = le retirer
  if (!etatVerif) return; const via = ev.target.closest('[data-via]'), ar = ev.target.closest('[data-arete]');
  if (via && ED.sel.length === 1 && ED.sel[0].startsWith('ar:')) { const a = lArete(ED.sel[0].slice(3)); a.jalons.splice(+via.dataset.jalons, 1); routerArete(a); syncVia(a); pousser(); redessinerTout(true); return; }
  if (ar && !ev.target.closest('[data-eq]')) { const a = lArete(ar.dataset.arete); if (a.passage) return; const [mx, my] = monde(ev);
    let best = 0, dm = 1e9; for (let i = 0; i < a.points.length - 1; i++) { const p = a.points[i], q = a.points[i + 1]; const t = clamp(((mx - p[0]) * (q[0] - p[0]) + (my - p[1]) * (q[1] - p[1])) / (((q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2) || 1), 0, 1); const dd = Math.hypot(p[0] + t * (q[0] - p[0]) - mx, p[1] + t * (q[1] - p[1]) - my); if (dd < dm) { dm = dd; best = i; } }
    insererVia(a, best, [snap(mx), snap(my)]); routerArete(a); syncVia(a); pousser(); ED.sel = ['ar:' + a.id]; redessinerTout(); }
});

/* ------------------------------------------------------------------ dépôt depuis la palette / image glissée */
function deposerEtSelectionner(cle, x, y, cible) {
  const r = deposer(cle, x, y, cible); if (!r) return null;
  ED.sel = [r.cle]; pousser(); redessinerTout();
  if (r.fixe) toast(`Fixé sur ${r.fixe}`, 'ok'); else if (r.surConduite) toast(`Posé sur la conduite ${r.surConduite}`, 'ok');
  return r;
}
EDITEUR.deposer = deposerEtSelectionner;
svg.addEventListener('dragover', ev => { if (etatVerif && ev.dataTransfer && [...ev.dataTransfer.types].includes('Files')) ev.preventDefault(); });
svg.addEventListener('drop', ev => {
  if (!etatVerif || !ev.dataTransfer || !ev.dataTransfer.files.length) return; ev.preventDefault();
  const f = ev.dataTransfer.files[0]; if (!/^image\//.test(f.type)) { toast('Ce fichier n’est pas une image', 'err'); return; }
  const [x, y] = monde(ev), cible = ev.target;
  imagePreparee(f).then(url => { const e = creerEquipement('voyant'); e.libelle = 'Image'; ajouterNoeud(e, x, y); poserImage(e.id, url); ED.sel = ['eq:' + e.id]; pousser(); redessinerTout(); });
});
function imagePreparee(fichier) {   // réduit l'image (320 px max) : le JSON reste léger
  return new Promise((ok, ko) => { const fr = new FileReader(); fr.onerror = ko; fr.onload = () => { const im = new Image(); im.onerror = ko; im.onload = () => {
    const k = Math.min(1, 320 / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = Math.max(1, Math.round(im.width * k)); c.height = Math.max(1, Math.round(im.height * k));
    c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); ok(c.toDataURL('image/png')); }; im.src = fr.result; }; fr.readAsDataURL(fichier); });
}

/* ------------------------------------------------------------------ clavier */
const saisie = (t) => t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
addG(document, 'keydown', ev => {
  if (!etatVerif) return;
  const ctrl = ev.ctrlKey || ev.metaKey, k = ev.key.toLowerCase(), enSaisie = saisie(ev.target) || ev.target.isContentEditable;
  if (ctrl && k === 'z' && !ev.shiftKey) { if (enSaisie) return; ev.preventDefault(); annuler(); return; }
  if (ctrl && (k === 'y' || (k === 'z' && ev.shiftKey))) { if (enSaisie) return; ev.preventDefault(); retablir(); return; }
  if (ctrl && k === 's') { ev.preventDefault(); sauver(true); return; }
  if (enSaisie) { if (ev.key === 'Escape') ev.target.blur(); return; }
  if (ctrl && k === 'a') { ev.preventDefault(); selectionner(L.noeuds.map(n => 'eq:' + n.id)); return; }
  if (ev.key === 'Escape') { ED.attente = null; ED.armee = null; fermerSelecteur(); ED.sel = []; dessiner(); EDITEUR.panneau(); majPalette(); return; }
  if (ev.key === 'Delete' || ev.key === 'Backspace') { if (!ED.sel.length) return; ev.preventDefault(); supprimerCles(ED.sel.slice()); pousser(); redessinerTout(); toast('Supprimé', 'ok'); return; }
  if (ev.key.startsWith('Arrow')) {
    const cles = ED.sel.filter(deplacable); if (!cles.length) return; ev.preventDefault();
    const pas = ev.altKey ? 1 : ev.shiftKey ? ED.grille * 5 : ED.grille, dx = ev.key === 'ArrowRight' ? pas : ev.key === 'ArrowLeft' ? -pas : 0, dy = ev.key === 'ArrowDown' ? pas : ev.key === 'ArrowUp' ? -pas : 0;
    deplacerCles(originesDe(cles), 0, 0); const o = originesDe(cles); deplacerCles(o, dx, dy); pousserDiffere(); redessinerTout(true); return;
  }
  if (ev.key === ' ') { ED.espace = true; corpsScene.classList.add('pan'); ev.preventDefault(); return; }
  if (k === 'c' && !ctrl) { definirOutil('conduite'); return; }
  if (k === 'v' && !ctrl) { definirOutil('selection'); return; }
  if (k === 'g' && !ctrl) { ED.grilleVisible = !ED.grilleVisible; majBarre(); dessiner(); return; }
});
addG(document, 'keyup', ev => { if (ev.key === ' ') { ED.espace = false; corpsScene.classList.remove('pan'); } });
function definirOutil(o) { ED.outil = o; ED.attente = null; corpsScene.classList.toggle('outil-conduite', o === 'conduite'); majBarre(); dessiner(); }


/* ======================================================================
   MODULE : editeur_formes — éditeur de formes (symboles personnalisés)
   ====================================================================== */

/* Éditeur de formes (passe 7) : dessine un symbole personnalisé avec les MÊMES primitives que le vocabulaire silhouette de l'IA
   (rect, ligne, cercle, poly, arc ; + ellipse, convertie en polygone au rendu). Le style (trait, couleur, épaisseur) est imposé par le
   normaliseur : l'utilisateur ne choisit que les formes, les ports, une zone animée facultative et le modèle d'emplacements.
   Fenêtre modale au style Dialog du portail. Tout le travail se fait sur un état local FE ; rien n'est écrit dans le document avant « Enregistrer ». */
let FE = null;
const FE_OUTILS = [['sel', 'Sélection'], ['ligne', 'Ligne'], ['rect', 'Rectangle'], ['cercle', 'Cercle'], ['ellipse', 'Ellipse'], ['arc', 'Arc'], ['poly', 'Polygone'], ['port', 'Port'], ['zone', 'Zone animée']];
const FE_COMPORTEMENTS = { pompe: 'Comme une pompe (marche / défaut / vitesse)', vanne: 'Comme une vanne (ouverte / fermée / défaut)', cuve: 'Comme une cuve (niveau)', libre: 'Liste libre d’états nommés' };
const feCopie = (o) => JSON.parse(JSON.stringify(o));
const NOM_PORT = (i) => i === 0 ? 'entrée' : i === 1 ? 'sortie' : 'port ' + (i + 1);
const CLE_PORT = (i) => i === 0 ? 'entree' : i === 1 ? 'sortie' : 'p' + (i + 1);

function feTranslater(p, dx, dy) {
  const q = feCopie(p);
  if (q.t === 'rect') { q.x += dx; q.y += dy; } else if (q.t === 'ligne') { q.x1 += dx; q.x2 += dx; q.y1 += dy; q.y2 += dy; }
  else if (q.t === 'cercle' || q.t === 'arc' || q.t === 'ellipse') { q.cx += dx; q.cy += dy; } else if (q.t === 'poly') q.pts = q.pts.map(a => [a[0] + dx, a[1] + dy]);
  else if (q.t === 'path') { q.tx = (q.tx || 0) + dx; q.ty = (q.ty || 0) + dy; }
  return q;
}
const arrondi1 = (v) => Math.round(v * 10) / 10;

/* ------------------------------------------------------------------ import SVG (dernier recours) */
function importerSvgTexte(txt) {
  const doc = new DOMParser().parseFromString(txt, 'image/svg+xml'), root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) return { erreur: 'ce fichier n’est pas un SVG lisible' };
  let vb = (root.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
  if (vb.length !== 4 || vb.some(isNaN)) { const w = parseFloat(root.getAttribute('width')) || 100, hh = parseFloat(root.getAttribute('height')) || 100; vb = [0, 0, w, hh]; }
  const sc = 100 / Math.max(vb[2], vb[3]), X = (x) => arrondi1((x - vb[0]) * sc), Y = (y) => arrondi1((y - vb[1]) * sc), R = (v) => arrondi1(v * sc), num = (el, a) => parseFloat(el.getAttribute(a)) || 0;
  const prims = []; let conserves = 0, convertis = 0;
  root.querySelectorAll('line,rect,circle,ellipse,polygon,polyline,path').forEach(el => {
    const tag = el.tagName.toLowerCase();
    if (tag === 'line') prims.push({ t: 'ligne', x1: X(num(el, 'x1')), y1: Y(num(el, 'y1')), x2: X(num(el, 'x2')), y2: Y(num(el, 'y2')) });
    else if (tag === 'rect') prims.push({ t: 'rect', x: X(num(el, 'x')), y: Y(num(el, 'y')), w: R(num(el, 'width')), h: R(num(el, 'height')), rx: R(num(el, 'rx')), role: 'corps' });
    else if (tag === 'circle') prims.push({ t: 'cercle', cx: X(num(el, 'cx')), cy: Y(num(el, 'cy')), r: R(num(el, 'r')), role: 'corps' });
    else if (tag === 'ellipse') prims.push({ t: 'ellipse', cx: X(num(el, 'cx')), cy: Y(num(el, 'cy')), rx: R(num(el, 'rx')), ry: R(num(el, 'ry')) });
    else if (tag === 'polygon' || tag === 'polyline') {
      const nb = (el.getAttribute('points') || '').split(/[\s,]+/).filter(Boolean).map(Number), pts = []; for (let i = 0; i + 1 < nb.length; i += 2) pts.push([X(nb[i]), Y(nb[i + 1])]);
      if (tag === 'polygon' && pts.length >= 3) prims.push({ t: 'poly', pts }); else for (let i = 0; i + 1 < pts.length; i++) prims.push({ t: 'ligne', x1: pts[i][0], y1: pts[i][1], x2: pts[i + 1][0], y2: pts[i + 1][1] });
    } else if (tag === 'path') {
      const d = el.getAttribute('d') || '', cmds = d.match(/[a-zA-Z][^a-zA-Z]*/g) || [];
      if (cmds.length && cmds.every(c => /^[MmLlHhVvZz]/.test(c))) {   // chemin simple : polygone / lignes
        const sous = []; let cur = null, x = 0, y = 0, x0 = 0, y0 = 0;
        cmds.forEach(c => { const k = c[0], a = (c.slice(1).match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || []).map(Number), rel = k === k.toLowerCase(), K = k.toUpperCase();
          if (K === 'Z') { if (cur) { cur.ferme = true; x = x0; y = y0; } return; }
          const pas = K === 'H' || K === 'V' ? 1 : 2;
          for (let i = 0; i + pas <= a.length; i += pas) {
            if (K === 'H') x = rel ? x + a[i] : a[i]; else if (K === 'V') y = rel ? y + a[i] : a[i]; else { x = rel ? x + a[i] : a[i]; y = rel ? y + a[i + 1] : a[i + 1]; }
            if (K === 'M' && i === 0) { cur = { pts: [[x, y]] }; sous.push(cur); x0 = x; y0 = y; } else if (cur) cur.pts.push([x, y]); } });
        sous.forEach(sp => { const pts = sp.pts.map(q => [X(q[0]), Y(q[1])]);
          if (sp.ferme && pts.length >= 3) prims.push({ t: 'poly', pts }); else for (let i = 0; i + 1 < pts.length; i++) prims.push({ t: 'ligne', x1: pts[i][0], y1: pts[i][1], x2: pts[i + 1][0], y2: pts[i + 1][1] }); });
        convertis++;
      } else if (/^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s-]+$/.test(d)) { prims.push({ t: 'path', d, s: sc, tx: arrondi1(-vb[0] * sc), ty: arrondi1(-vb[1] * sc) }); conserves++; }
    }
  });
  if (!prims.length) return { erreur: 'aucune forme reconnue dans ce SVG' };
  return { largeur: Math.round(vb[2] * sc), hauteur: Math.round(vb[3] * sc), primitives: prims, conserves, convertis };
}

/* ------------------------------------------------------------------ ouverture / fermeture */
function ouvrirEditeurFormes(opt) {
  fermerEditeurFormes();
  let init = { largeur: 120, hauteur: 80, primitives: [], ports: {} }, nom = '', prefixe = 'SY', comportement = 'pompe', etats = [], zone = null, eqId = null, titre = 'Nouveau symbole';
  if (opt && opt.equipement && EQ[opt.equipement]) {
    const e = EQ[opt.equipement]; eqId = e.id; init = feCopie(e.silhouette || init); nom = e.libelle; comportement = e.comportement || ''; etats = feCopie(e.etats || []); zone = e.zone_anim ? feCopie(e.zone_anim) : null; titre = 'Modifier le dessin · ' + e.id;
  }
  const pts = []; const pp = init.ports || {}; ['entree', 'sortie'].forEach(k => { if (pp[k]) pts.push({ x: pp[k][0], y: pp[k][1] }); });
  Object.keys(pp).filter(k => /^p\d+$/.test(k)).sort((a, b) => +a.slice(1) - +b.slice(1)).forEach(k => pts.push({ x: pp[k][0], y: pp[k][1] }));
  FE = { eqId, titre, W: init.largeur || 120, H: init.hauteur || 80, prims: feCopie(init.primitives || []), extra: (({ ports, largeur, hauteur, primitives, ...r }) => r)(init), ports: pts, zone, comportement, etats, nom, prefixe,
    outil: 'sel', sel: -1, aimant: true, grille: 5, arrondi: false, corps: true, ouv: 180, temp: null, pile: [], idx: -1, ecrireBib: false, importe: null };
  fePousser(true); feConstruire();
}
function fermerEditeurFormes() { const v = byId('fe-voile'); if (v) v.remove(); FE = null; window.removeEventListener('keydown', feClavier, true); }
const feEtat = () => JSON.stringify({ p: FE.prims, o: FE.ports, z: FE.zone, W: FE.W, H: FE.H });
function fePousser(init) { const t = feEtat(); if (FE.pile[FE.idx] === t) return; FE.pile = FE.pile.slice(0, FE.idx + 1); FE.pile.push(t); FE.idx = FE.pile.length - 1; if (!init) feMajPanneau(); }
function feAnnuler() { if (FE.idx <= 0) return; FE.idx--; const o = JSON.parse(FE.pile[FE.idx]); Object.assign(FE, { prims: o.p, ports: o.o, zone: o.z, W: o.W, H: o.H }); FE.sel = -1; feRendre(); feMajPanneau(); }
function feRetablir() { if (FE.idx >= FE.pile.length - 1) return; FE.idx++; const o = JSON.parse(FE.pile[FE.idx]); Object.assign(FE, { prims: o.p, ports: o.o, zone: o.z, W: o.W, H: o.H }); FE.sel = -1; feRendre(); feMajPanneau(); }

/* ------------------------------------------------------------------ fenêtre */
function feConstruire() {
  const voile = h('div', 'voile fe-voile'); voile.id = 'fe-voile';
  const d = h('div', 'dlg fe-dlg'); d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-label', FE.titre);
  d.innerHTML = `<header><div><div class="mono">Éditeur de formes</div><h2>${esc(FE.titre)}</h2></div><button class="x" type="button" aria-label="Fermer" id="fe-x">×</button></header>
  <div class="fe-corps">
    <div class="fe-gauche">
      <div class="fe-outils" role="group" aria-label="Outils de dessin">${FE_OUTILS.map(([k, t]) => `<button type="button" class="btn xs fe-o" data-o="${k}" title="${t}">${t}</button>`).join('')}
        <span class="ed-sep"></span><button type="button" class="btn xs" id="fe-annuler" title="Annuler (Ctrl+Z)">↶ Annuler</button><button type="button" class="btn xs" id="fe-retablir" title="Rétablir (Ctrl+Y)">↷</button>
        <button type="button" class="btn xs" id="fe-aimant" title="Aimantation à la grille">Aimant</button></div>
      <div class="fe-options" id="fe-options"></div>
      <svg id="fe-svg" class="fe-svg" role="img" aria-label="Canevas de dessin du symbole"></svg>
      <div class="fe-aide" id="fe-aide"></div>
    </div>
    <div class="fe-droite">
      <label class="ed-champ"><span>Nom du symbole</span><input class="ed-in" id="fe-nom" type="text" value="${esc(FE.nom)}" placeholder="ex. Station de dosage"></label>
      <div class="ed-2"><label class="ed-champ"><span>Largeur</span><input class="ed-in" id="fe-w" type="number" min="20" max="400" step="5" value="${FE.W}"></label><label class="ed-champ"><span>Hauteur</span><input class="ed-in" id="fe-h" type="number" min="20" max="400" step="5" value="${FE.H}"></label></div>
      <h4>Modèle d’emplacements</h4>
      <select class="ed-in" id="fe-comp" aria-label="Modèle d’emplacements">${FE.eqId && !FE.comportement ? '<option value="">Conserver (inchangé)</option>' : ''}${Object.entries(FE_COMPORTEMENTS).map(([k, t]) => `<option value="${k}" ${FE.comportement === k ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <div id="fe-etats"></div>
      <h4>Ports de raccordement</h4><div id="fe-ports"></div>
      <h4>Zone animée (facultatif)</h4>
      <select class="ed-in" id="fe-zone-type" aria-label="Zone animée"><option value="">Aucune</option><option value="rotor">Partie tournante (tourne en marche)</option><option value="niveau">Niveau (se remplit)</option></select>
      <div id="fe-zone-info" class="ed-desc"></div>
      <h4>Importer / décrire</h4>
      <div class="ed-btns"><button type="button" class="btn xs" id="fe-import">Importer un SVG…</button><input type="file" id="fe-fichier" accept=".svg,image/svg+xml,image/*" hidden></div>
      <input class="ed-in fe-ia" type="text" disabled placeholder="Décrire le symbole (IA)" aria-label="Décrire le symbole (IA), indisponible"><div class="ed-desc">Disponible dans le portail.</div>
    </div>
  </div>
  <footer class="fe-pied"><span class="ed-err" id="fe-err"></span><span class="ed-sp"></span>${FE.eqId ? '<label class="fe-case"><input type="checkbox" id="fe-bib"> Ajouter aussi à la bibliothèque</label>' : ''}<button type="button" class="btn" id="fe-annuler-fen">Annuler</button><button type="button" class="btn primaire" id="fe-enregistrer">${FE.eqId ? 'Appliquer le dessin' : 'Enregistrer dans la bibliothèque'}</button></footer>`;
  voile.append(d); root.append(voile);
  voile.addEventListener('mousedown', ev => { if (ev.target === voile) ev.preventDefault(); });
  const $ = (id) => d.querySelector('#' + id);
  $('fe-x').onclick = $('fe-annuler-fen').onclick = fermerEditeurFormes;
  d.querySelectorAll('.fe-o').forEach(b => b.onclick = () => feOutil(b.dataset.o));
  $('fe-annuler').onclick = feAnnuler; $('fe-retablir').onclick = feRetablir;
  $('fe-aimant').onclick = () => { FE.aimant = !FE.aimant; feMajPanneau(); };
  $('fe-nom').oninput = (ev) => { FE.nom = ev.target.value; };
  $('fe-w').onchange = (ev) => { FE.W = Math.max(20, Math.min(400, +ev.target.value || FE.W)); fePousser(); feRendre(); };
  $('fe-h').onchange = (ev) => { FE.H = Math.max(20, Math.min(400, +ev.target.value || FE.H)); fePousser(); feRendre(); };
  $('fe-comp').onchange = (ev) => { FE.comportement = ev.target.value; if (FE.comportement === 'libre' && !FE.etats.length) FE.etats = [{ cle: 's_actif', nom: 'Actif', defaut: false }]; feMajPanneau(); };
  $('fe-zone-type').onchange = (ev) => { const t = ev.target.value; if (!t) FE.zone = null; else { FE.zone = Object.assign(FE.zone || { x: FE.W * .3, y: FE.H * .25, w: FE.W * .4, h: FE.H * .5 }, { type: t }); } fePousser(); feRendre(); };
  $('fe-import').onclick = () => $('fe-fichier').click();
  $('fe-fichier').onchange = (ev) => { const f = ev.target.files[0]; ev.target.value = ''; if (f) feImporter(f); };
  $('fe-enregistrer').onclick = feEnregistrer;
  const sv = $('fe-svg'); sv.addEventListener('pointerdown', feDown); sv.addEventListener('dblclick', feDbl);
  addG(window, 'keydown', feClavier, true);
  $('fe-svg').addEventListener('pointermove', feMove); addG(window, 'pointerup', feUp);
  feOutil('sel'); feRendre(); feMajPanneau();
}
function feImporter(f) {
  if (!/svg/i.test(f.type) && !/\.svg$/i.test(f.name)) {   // image bitmap : comportement actuel (gris + pastille)
    const url = f; fermerEditeurFormes(); creerImageA([L.w / 2, L.h / 2], url); toast('Image : posée en gris dans un cadre standard (la pastille donne l’état)', 'ok'); return; }
  f.text().then(txt => { const r = importerSvgTexte(txt); if (r.erreur) { feMsg('Import impossible : ' + r.erreur); return; }
    FE.W = r.largeur; FE.H = r.hauteur; FE.prims = FE.prims.concat(r.primitives); FE.importe = { conserves: r.conserves, convertis: r.convertis };
    fePousser(); feRendre(); feMajPanneau(); toast(`SVG importé : ${r.primitives.length} forme(s)${r.conserves ? ', ' + r.conserves + ' tracé(s) conservé(s) recoloré(s)' : ''}`, 'ok'); });
}
const feMsg = (t) => { const e = byId('fe-err'); if (e) e.textContent = t || ''; };

/* ------------------------------------------------------------------ rendu du canevas */
const FE_ECH = 5.2;   // pixels par unité de dessin
function feBoite() { return { x: -8, y: -8, w: FE.W + 16, h: FE.H + 16 }; }
function feRendre() {
  const sv = byId('fe-svg'); if (!sv) return; const b = feBoite();
  sv.setAttribute('viewBox', `${b.x} ${b.y} ${b.w} ${b.h}`); sv.style.width = Math.min(640, b.w * FE_ECH) + 'px'; sv.style.aspectRatio = `${b.w} / ${b.h}`; sv.innerHTML = '';
  const g = FE.grille;
  const defs = s('defs', {}, s('pattern', { id: 'fe-pat', width: g, height: g, patternUnits: 'userSpaceOnUse' }, s('path', { d: `M${g} 0V${g}H0`, fill: 'none', stroke: '#1d2832', 'stroke-width': .3 })));
  sv.append(defs, s('rect', { x: 0, y: 0, width: FE.W, height: FE.H, fill: 'url(#fe-pat)', class: 'fe-grille' }), s('rect', { x: 0, y: 0, width: FE.W, height: FE.H, class: 'fe-cadre' }));
  if (FE.zone && FE.zone.type) sv.append(s('rect', { x: FE.zone.x, y: FE.zone.y, width: FE.zone.w, height: FE.zone.h, class: 'fe-zone', rx: 1.5 }), s('text', { x: FE.zone.x + 1.5, y: FE.zone.y + 4, class: 'fe-zone-t', text: FE.zone.type === 'rotor' ? 'partie tournante' : 'niveau' }));
  const sil = (p) => ({ largeur: FE.W, hauteur: FE.H, primitives: [p] });
  const toutes = FE.prims.concat(FE.temp ? [FE.temp] : []);
  toutes.forEach((p, i) => {
    const gr = s('g', { class: 'fe-forme' + (i === FE.sel ? ' sel' : '') + (i >= FE.prims.length ? ' temp' : ''), 'data-i': i });
    const els = normaliser(sil(p), 1, 0, 0); els.forEach(n => gr.append(n));
    if (i < FE.prims.length) els.forEach(n => { const c = n.cloneNode(true); c.setAttribute('class', 'fe-hit'); gr.append(c); });
    sv.append(gr);
  });
  FE.ports.forEach((p, i) => sv.append(s('g', { class: 'fe-port', 'data-port': i }, s('circle', { cx: p.x, cy: p.y, r: 2.6, class: 'fe-port-c' }), s('text', { x: p.x, y: p.y - 4.2, class: 'fe-port-t', text: NOM_PORT(i) }))));
  if (FE.poly) { const pts = FE.poly.pts.concat(FE.poly.cur ? [FE.poly.cur] : []); sv.append(s('polyline', { points: pts.map(q => q.join(',')).join(' '), class: 'fe-temp' })); FE.poly.pts.forEach(q => sv.append(s('circle', { cx: q[0], cy: q[1], r: 1.4, class: 'fe-pt' }))); }
}

/* ------------------------------------------------------------------ panneau (outils, ports, états, options) */
function feOutil(o) { FE.outil = o; FE.poly = null; FE.drag = null; FE.temp = null; root.querySelectorAll('.fe-o').forEach(b => b.classList.toggle('on', b.dataset.o === o)); feMajPanneau(); feRendre(); }
function feMajPanneau() {
  const dlg = root.querySelector('.fe-dlg'); if (!dlg) return; const $ = (id) => dlg.querySelector('#' + id);
  dlg.querySelectorAll('.fe-o').forEach(b => b.classList.toggle('on', b.dataset.o === FE.outil));
  $('fe-aimant').classList.toggle('on', FE.aimant); $('fe-annuler').disabled = FE.idx <= 0; $('fe-retablir').disabled = FE.idx >= FE.pile.length - 1;
  const aide = { sel: 'Cliquez une forme pour la sélectionner, glissez pour la déplacer, Suppr pour l’effacer.', ligne: 'Glissez pour tracer une ligne.', rect: 'Glissez pour tracer un rectangle.', cercle: 'Glissez du centre vers le bord.', ellipse: 'Glissez la diagonale de l’ellipse.',
    arc: 'Glissez du centre vers le bord : la direction fixe le début de l’arc.', poly: 'Cliquez les sommets ; double-clic ou Entrée pour fermer, Échap pour annuler.', port: 'Cliquez sur le bord du cadre pour poser un port (1er = entrée, 2e = sortie).', zone: 'Glissez le rectangle de la zone animée.' };
  $('fe-aide').textContent = aide[FE.outil] || '';
  const p = FE.sel >= 0 ? FE.prims[FE.sel] : null;
  let opt = '';
  if (FE.outil === 'rect' || (p && p.t === 'rect')) opt += `<label><input type="checkbox" id="fe-arrondi" ${(p && p.t === 'rect' ? p.rx > 0 : FE.arrondi) ? 'checked' : ''}> Coins arrondis</label>`;
  if (FE.outil === 'rect' || FE.outil === 'cercle' || (p && (p.t === 'rect' || p.t === 'cercle'))) opt += `<label><input type="checkbox" id="fe-corps" ${(p && (p.t === 'rect' || p.t === 'cercle') ? p.role === 'corps' : FE.corps) ? 'checked' : ''}> Remplissage léger</label>`;
  if (FE.outil === 'arc') opt += `<label>Ouverture <select id="fe-ouv" class="ed-in sm">${[90, 180, 270].map(v => `<option ${FE.ouv === v ? 'selected' : ''}>${v}</option>`).join('')}</select>°</label>`;
  if (p) opt += `<button type="button" class="btn xs danger" id="fe-suppr">Supprimer la forme</button>`;
  const od = $('fe-options'); od.innerHTML = opt || '<span class="fe-vide">Style imposé : trait, couleur et épaisseur ne sont pas réglables.</span>';
  const a = od.querySelector('#fe-arrondi'); if (a) a.onchange = () => { if (p && p.t === 'rect') { p.rx = a.checked ? Math.min(6, Math.min(p.w, p.h) / 3) : 0; fePousser(); feRendre(); } else FE.arrondi = a.checked; };
  const c = od.querySelector('#fe-corps'); if (c) c.onchange = () => { if (p && (p.t === 'rect' || p.t === 'cercle')) { p.role = c.checked ? 'corps' : 'trait'; fePousser(); feRendre(); } else FE.corps = c.checked; };
  const ov = od.querySelector('#fe-ouv'); if (ov) ov.onchange = () => { FE.ouv = +ov.value; };
  const su = od.querySelector('#fe-suppr'); if (su) su.onclick = feSupprimer;
  // modèle d'emplacements
  $('fe-comp').value = FE.comportement;
  const et = $('fe-etats'); et.innerHTML = '';
  if (FE.comportement === 'libre') {
    et.innerHTML = FE.etats.map((x, i) => `<div class="fe-etat"><input class="ed-in" data-i="${i}" data-k="nom" value="${esc(x.nom)}" aria-label="Nom de l’état ${i + 1}"><label title="Cet état est un défaut (rouge)"><input type="checkbox" data-i="${i}" data-k="defaut" ${x.defaut ? 'checked' : ''}> défaut</label><button type="button" class="btn xs" data-del="${i}" aria-label="Retirer l’état">×</button></div>`).join('') + '<button type="button" class="btn xs" id="fe-etat-plus">+ état</button>';
    et.querySelectorAll('input[data-k="nom"]').forEach(inp => inp.oninput = () => { FE.etats[+inp.dataset.i].nom = inp.value; });
    et.querySelectorAll('input[data-k="defaut"]').forEach(inp => inp.onchange = () => { FE.etats[+inp.dataset.i].defaut = inp.checked; });
    et.querySelectorAll('[data-del]').forEach(bt => bt.onclick = () => { FE.etats.splice(+bt.dataset.del, 1); feMajPanneau(); });
    et.querySelector('#fe-etat-plus').onclick = () => { FE.etats.push({ cle: '', nom: 'État ' + (FE.etats.length + 1), defaut: false }); feMajPanneau(); };
  } else if (FE.comportement) et.innerHTML = `<div class="ed-desc">Emplacements : ${({ pompe: 'marche, défaut, vitesse', vanne: 'ouvert, fermé, défaut', cuve: 'niveau' })[FE.comportement]}.</div>`;
  const pl = $('fe-ports'); pl.innerHTML = FE.ports.length ? FE.ports.map((q, i) => `<div class="fe-lp"><span>${NOM_PORT(i)}</span><span class="mono">${arrondi1(q.x)} ; ${arrondi1(q.y)}</span><button type="button" class="btn xs" data-pdel="${i}" aria-label="Retirer le port ${NOM_PORT(i)}">×</button></div>`).join('') : '<div class="ed-desc">Aucun port : entrée à gauche et sortie à droite par défaut.</div>';
  pl.querySelectorAll('[data-pdel]').forEach(bt => bt.onclick = () => { FE.ports.splice(+bt.dataset.pdel, 1); fePousser(); feRendre(); feMajPanneau(); });
  $('fe-zone-type').value = FE.zone && FE.zone.type ? FE.zone.type : '';
  $('fe-zone-info').textContent = FE.zone && FE.zone.type ? (FE.zone.type === 'rotor' ? 'Les formes dont le centre est dans la zone tournent quand le symbole est en marche. Choisissez l’outil « Zone animée » pour la redessiner.' : 'La zone se remplit selon le niveau relié. Choisissez l’outil « Zone animée » pour la redessiner.') : 'Aucune animation.';
  $('fe-w').value = FE.W; $('fe-h').value = FE.H;
}
function feSupprimer() { if (FE.sel < 0) return; FE.prims.splice(FE.sel, 1); FE.sel = -1; fePousser(); feRendre(); }

/* ------------------------------------------------------------------ souris / clavier */
function fePoint(ev) { const sv = byId('fe-svg'), p = sv.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY; const q = p.matrixTransform(sv.getScreenCTM().inverse()); const sn = (v) => FE.aimant ? Math.round(v / FE.grille) * FE.grille : arrondi1(v); return [sn(q.x), sn(q.y)]; }
function feBord(pt) {   // projette un point sur le bord du cadre
  const [x, y] = pt, cx = Math.max(0, Math.min(FE.W, x)), cy = Math.max(0, Math.min(FE.H, y)), d = { W: cx, E: FE.W - cx, N: cy, S: FE.H - cy }, c = Object.keys(d).sort((a, b) => d[a] - d[b])[0];
  return c === 'W' ? { x: 0, y: cy } : c === 'E' ? { x: FE.W, y: cy } : c === 'N' ? { x: cx, y: 0 } : { x: cx, y: FE.H };
}
function feDown(ev) {
  if (ev.button !== 0) return; ev.preventDefault(); const pt = fePoint(ev), o = FE.outil;
  byId('fe-svg').setPointerCapture && byId('fe-svg').setPointerCapture(ev.pointerId);
  const forme = ev.target.closest && ev.target.closest('.fe-forme'), pc = ev.target.closest && ev.target.closest('.fe-port');
  if (o === 'sel') {
    if (pc) { FE.ports.splice(+pc.dataset.port, 1); fePousser(); feRendre(); feMajPanneau(); return; }
    FE.sel = forme && +forme.dataset.i < FE.prims.length ? +forme.dataset.i : -1;
    if (FE.sel >= 0) FE.drag = { depart: pt, orig: feCopie(FE.prims[FE.sel]), bouge: false };
    feRendre(); feMajPanneau(); return;
  }
  if (o === 'port') { FE.ports.push(feBord(pt)); fePousser(); feRendre(); feMajPanneau(); return; }
  if (o === 'poly') { const P = FE.poly || (FE.poly = { pts: [] }); const p0 = P.pts[0];
    if (p0 && P.pts.length >= 3 && Math.hypot(pt[0] - p0[0], pt[1] - p0[1]) < FE.grille) { feFermerPoly(); return; }
    if (!P.pts.length || P.pts[P.pts.length - 1][0] !== pt[0] || P.pts[P.pts.length - 1][1] !== pt[1]) P.pts.push(pt); feRendre(); return; }
  FE.drag = { depart: pt, creer: o };
}
function feMove(ev) {
  if (!FE) return; const pt = fePoint(ev), d = FE.drag;
  if (FE.outil === 'poly' && FE.poly) { FE.poly.cur = pt; feRendre(); return; }
  if (!d) return;
  if (!d.creer) { const dx = pt[0] - d.depart[0], dy = pt[1] - d.depart[1]; if (dx || dy) { d.bouge = true; FE.prims[FE.sel] = feTranslater(d.orig, dx, dy); feRendre(); } return; }
  const [x0, y0] = d.depart, [x1, y1] = pt; let p = null;
  if (d.creer === 'ligne') p = { t: 'ligne', x1: x0, y1: y0, x2: x1, y2: y1 };
  else if (d.creer === 'rect') p = { t: 'rect', x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0), rx: FE.arrondi ? 4 : 0, role: FE.corps ? 'corps' : 'trait' };
  else if (d.creer === 'cercle') p = { t: 'cercle', cx: x0, cy: y0, r: arrondi1(Math.hypot(x1 - x0, y1 - y0)), role: FE.corps ? 'corps' : 'trait' };
  else if (d.creer === 'ellipse') p = { t: 'ellipse', cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, rx: Math.abs(x1 - x0) / 2, ry: Math.abs(y1 - y0) / 2 };
  else if (d.creer === 'arc') { const a0 = Math.round(Math.atan2(y1 - y0, x1 - x0) * 180 / Math.PI); p = { t: 'arc', cx: x0, cy: y0, r: arrondi1(Math.hypot(x1 - x0, y1 - y0)), a0, a1: a0 + FE.ouv }; }
  else if (d.creer === 'zone') { FE.zone = { type: (FE.zone && FE.zone.type) || 'rotor', x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) }; d.bouge = true; feRendre(); return; }
  FE.temp = p; d.p = p; feRendre();
}
function feUp(ev) {
  if (!FE || !FE.drag) return; const d = FE.drag; FE.drag = null; FE.temp = null;
  if (d.creer === 'zone') { if (FE.zone && FE.zone.w >= 2 && FE.zone.h >= 2) { fePousser(); } feRendre(); feMajPanneau(); return; }
  if (d.creer) { const p = d.p; const ok = p && ((p.t === 'ligne' && Math.hypot(p.x2 - p.x1, p.y2 - p.y1) >= 1) || (p.t === 'rect' && p.w >= 1 && p.h >= 1) || (p.t === 'cercle' && p.r >= 1) || (p.t === 'ellipse' && p.rx >= 1 && p.ry >= 1) || (p.t === 'arc' && p.r >= 1));
    if (ok) { FE.prims.push(p); FE.sel = FE.prims.length - 1; fePousser(); } feRendre(); feMajPanneau(); return; }
  if (d.bouge) fePousser(); feRendre();
}
function feFermerPoly() { const P = FE.poly; FE.poly = null; if (P && P.pts.length >= 3) { FE.prims.push({ t: 'poly', pts: P.pts }); FE.sel = FE.prims.length - 1; fePousser(); } feRendre(); feMajPanneau(); }
function feDbl() { if (FE.outil === 'poly' && FE.poly) { if (FE.poly.pts.length > 3) FE.poly.pts.pop(); feFermerPoly(); } }
function feClavier(ev) {
  if (!FE) return; const t = ev.target, saisie = t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)), k = ev.key, ctrl = ev.ctrlKey || ev.metaKey;
  if (k === 'Escape') { ev.stopImmediatePropagation(); ev.preventDefault(); if (FE.poly) { FE.poly = null; feRendre(); } else fermerEditeurFormes(); return; }
  if (saisie) { ev.stopPropagation(); return; }
  ev.stopImmediatePropagation();
  if (ctrl && k.toLowerCase() === 'z' && !ev.shiftKey) { ev.preventDefault(); feAnnuler(); }
  else if (ctrl && (k.toLowerCase() === 'y' || (k.toLowerCase() === 'z' && ev.shiftKey))) { ev.preventDefault(); feRetablir(); }
  else if (k === 'Delete' || k === 'Backspace') { ev.preventDefault(); feSupprimer(); }
  else if (k === 'Enter' && FE.poly) { ev.preventDefault(); feFermerPoly(); }
}

/* ------------------------------------------------------------------ enregistrement */
function feDefinition() {
  const nom = FE.nom.trim(); if (!FE.prims.length) return { erreur: 'dessinez au moins une forme' };
  const defs = FE.ports.length ? FE.ports : [{ x: 0, y: FE.H / 2 }, { x: FE.W, y: FE.H / 2 }];
  const pr = {}; const liste = FE.ports.length >= 2 ? FE.ports : FE.ports.length === 1 ? [FE.ports[0], { x: FE.W, y: FE.H / 2 }] : defs;
  liste.forEach((q, i) => { pr[CLE_PORT(i)] = [arrondi1(q.x), arrondi1(q.y)]; });
  const sil = Object.assign({}, FE.extra, { largeur: FE.W, hauteur: FE.H, primitives: feCopie(FE.prims), ports: pr });
  const etats = FE.comportement === 'libre' ? FE.etats.filter(x => x.nom.trim()).map((x, i, a) => ({ cle: x.cle || ('s_' + (String(sansAccent(x.nom)).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'etat') + (a.findIndex(y => sansAccent(y.nom) === sansAccent(x.nom)) === i ? '' : '_' + i)), nom: x.nom.trim(), defaut: !!x.defaut })) : [];
  if (FE.comportement === 'libre' && !etats.length) return { erreur: 'ajoutez au moins un état nommé' };
  return { nom, prefixe: FE.prefixe, silhouette: sil, comportement: FE.comportement, etats, zone: FE.zone && FE.zone.type && FE.zone.w >= 2 ? feCopie(FE.zone) : null };
}
function feEnregistrer() {
  const d = feDefinition(); if (d.erreur) { feMsg(d.erreur[0].toUpperCase() + d.erreur.slice(1)); return; }
  if (!d.nom) { feMsg('Donnez un nom au symbole'); return; }
  if (FE.eqId) {
    const id = FE.eqId, bib = byId('fe-bib') && byId('fe-bib').checked; fermerEditeurFormes();
    modifierDessin(id, d); if (bib) enregistrerSymbole(Object.assign({}, d, { comportement: d.comportement || 'pompe' }));
    pousser(); redessinerTout(); construirePalette(); toast('Dessin modifié', 'ok'); return;
  }
  fermerEditeurFormes(); const def = enregistrerSymbole(d); pousser(); construirePalette(); toast(`Symbole « ${def.nom} » ajouté à la bibliothèque de l’entreprise`, 'ok');
}


/* ======================================================================
   MODULE : editeur_props — éditeur : panneau de propriétés et sélecteur de variable
   ====================================================================== */

/* Éditeur — panneau de propriétés (à droite, style Sheet/Card du portail) et sélecteur de variable avec recherche. */
const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sansAccent = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const panneauEl = byId('proprietes');
const TYPE_ED = { pompe: 'Pompe', moteur: 'Moteur', vanne: 'Vanne', vanne_reg: 'Vanne de régulation', cuve: 'Cuve', parametre: 'Décanteur paramétré', mesure: 'Mesure', voyant: 'Voyant', silhouette: 'Silhouette', raccord: 'Raccord', image: 'Image' };
Object.assign(TYPE_ED, { vanne_man: 'Vanne manuelle', vanne_3v: 'Vanne 3 voies', clapet: 'Clapet anti-retour', filtre: 'Filtre', echangeur: 'Échangeur', compresseur: 'Compresseur', ventilateur: 'Ventilateur', convoyeur: 'Convoyeur', verin: 'Vérin', disjoncteur: 'Disjoncteur', transformateur: 'Transformateur', variateur: 'Variateur' });
const OPS_FR = { eq: '=', ne: '≠', gt: '>', ge: '≥', lt: '<', le: '≤' };
const DEFAUT_EMPL = { marche: 'Marche', defaut: 'Défaut', vitesse: 'Vitesse', ouvert: 'Ouverte', ferme: 'Fermée', position: 'Position', niveau: 'Niveau', valeur: 'Valeur', etat: 'État' };

function aVerifierListe() {
  return M.equipements.filter(aVerifier).map(e => ({ e, nb: Object.entries(e.slots || {}).filter(([n, sp]) => slotRelie(sp, n) && sp.a_verifier).length }));
}
const champ = (lib, html, aide) => `<label class="ed-champ"><span>${lib}</span>${html}${aide ? `<small>${aide}</small>` : ''}</label>`;
const input = (f, v, type, extra) => `<input class="ed-in" data-f="${f}" type="${type || 'text'}" value="${esc(v)}" ${extra || ''}>`;
const bouton = (act, txt, cls, extra) => `<button type="button" class="btn ${cls || ''}" data-act="${act}" ${extra || ''}>${txt}</button>`;

function htmlEmplacement(e, nom) {
  const sp = (e.slots || {})[nom] || {}, cat = sp.variable && DATA.catalogue.find(c => c.nom === sp.variable);
  const tor = estTorSlot(nom), rg = sp.regle || {}, ver = slotRelie(sp, nom) && sp.a_verifier;
  let corps = `<button type="button" class="ed-var ${sp.variable ? '' : 'vide'}" data-act="choisir" data-slot="${nom}" aria-label="Choisir la variable de ${esc(libEmpl(e, nom))}">${sp.variable ? esc(sp.variable) : '○ Choisir une variable…'}</button>`;
  if (sp.variable) corps += `<div class="ed-desc">${cat ? esc(cat.description) + (cat.unite ? ' · ' + esc(cat.unite) : '') + (cat.type ? ' · ' + cat.type : '') : '<i>variable hors catalogue</i>'}</div>`;
  else if (sp.derive_tor) corps += `<div class="ed-desc">Déduit de ${esc(Object.values(sp.derive_tor).join(', '))}</div>`;
  else if (sp.derive) corps += `<div class="ed-desc">Déduit de ${esc(sp.derive.mesure || sp.derive.slot || '')} (non affiché)</div>`;
  if (sp.variable && tor) corps += `<div class="ed-regle">Vrai si valeur <select class="ed-in sm" data-f="regle-op" data-slot="${nom}">${Object.entries(OPS_FR).map(([k, t]) => `<option value="${k}" ${(rg.op || 'eq') === k ? 'selected' : ''}>${t}</option>`).join('')}</select> <input class="ed-in sm" data-f="regle-val" data-slot="${nom}" type="number" step="any" value="${rg.val != null ? rg.val : 1}"></div>`;
  if (sp.variable && !tor) corps += `<div class="ed-regle">Échelle <input class="ed-in sm" data-f="regle-min" data-slot="${nom}" type="number" step="any" placeholder="min" value="${rg.min != null ? rg.min : ''}"> à <input class="ed-in sm" data-f="regle-max" data-slot="${nom}" type="number" step="any" placeholder="max" value="${rg.max != null ? rg.max : ''}"></div>`;
  return `<div class="ed-slot" data-slot-ligne="${nom}"><div class="ed-slot-h"><b>${esc(libEmpl(e, nom))}</b>${ver ? '<span class="ed-pastille" title="À vérifier"></span>' : ''}${sp.variable || sp.derive || sp.derive_tor ? '' : '<span class="ed-vide">vide</span>'}${ver ? bouton('valider-slot', 'Valider', 'xs', `data-slot="${nom}"`) : ''}</div>${corps}</div>`;
}
function htmlEquipement(k) {
  const id = k.slice(3), e = EQ[id], n = leNoeud(id), t = typeBase(e), p = e.params || {};
  const ver = aVerifier(e);
  let h = `<header class="ed-ph"><div><h3>${esc(e.libelle)}</h3><div class="mono">${esc(e.id)} · ${TYPE_ED[e.type] || e.type}${e.type === 'image' ? ' (' + (TYPE_ED[typeBase(e)] || '') + ')' : ''}${n ? '' : e.carte ? ' · auxiliaire' : e.monte_sur ? ' · sur ' + esc(e.monte_sur) : ' · en ligne'}</div></div>${ver ? '<span class="ed-pastille grande" title="À vérifier"></span>' : ''}</header>`;
  if (ver) h += `<div class="ed-note">À vérifier${e.note ? ' — ' + esc(e.note.slice(0, 220)) : ''}<div>${bouton('valider-eq', '✓ Valider', 'primaire')}</div></div>`;
  h += `<section class="ed-sec">${champ('Repère', input('id', e.id), '<span class="ed-err" id="ed-err-id"></span>')}${champ('Libellé', input('libelle', e.libelle))}`;
  if (n && !e.carte && !estOuvrage(e) || n && estOuvrage(e)) h += champ('Taille', `<select class="ed-in" data-f="taille">${Object.entries(TAILLES_FR).map(([v, t]) => `<option value="${v}" ${tailleDe(e) === v ? 'selected' : ''}>${t}</option>`).join('')}</select>`, estOuvrage(e) ? 'Applique la taille tout de suite ; les poignées affinent le corps.' : 'S’applique tout de suite au dessin et aux conduites.');
  if (n && peutEtreCarte(e) || e.carte) h += `<label class="ed-champ ed-case"><input type="checkbox" data-f="en-carte" ${e.carte ? 'checked' : ''}> <span>Afficher en carte</span><small>Carte reliée en pointillé à l’ouvrage, comme les réactifs.</small></label>`;
  if (e.type === 'mesure') h += champ('Grandeur', `<select class="ed-in" data-f="grandeur">${Object.entries(GRANDEURS).map(([v, g]) => `<option value="${v}" ${e.grandeur === v ? 'selected' : ''}>${g.nom}</option>`).join('')}${e.grandeur && !GRANDEURS[e.grandeur] ? `<option selected>${esc(e.grandeur)}</option>` : ''}</select>`, 'Préremplit l’unité (modifiable).');
  if (e.type === 'parametre') h += champ('Nombre de trémies', input('tremies', p.tremies || 4, 'number', 'min="1" max="8"')) + champ('Lamelles', input('lamelles', p.lamelles || 0, 'number', 'min="0" max="60"'));
  if (estOuvrage(e)) h += champ('Niveau maximal', input('niveau_max', p.niveau_max != null ? p.niveau_max : '', 'number', 'step="any" placeholder="100"')) + champ('Unité du niveau', input('unite_niveau', p.unite_niveau || '', 'text', 'placeholder="%"'));
  if (e.type === 'mesure') h += champ('Unité', input('unite', p.unite || '')) + `<div class="ed-2">${champ('Min', input('min', p.min != null ? p.min : 0, 'number', 'step="any"'))}${champ('Max', input('max', p.max != null ? p.max : 100, 'number', 'step="any"'))}</div>`
    + `<div class="ed-2">${champ('Seuil bas', input('seuil_bas', p.seuils && p.seuils.bas != null ? p.seuils.bas : '', 'number', 'step="any"'))}${champ('Seuil haut', input('seuil_haut', p.seuils && p.seuils.haut != null ? p.seuils.haut : '', 'number', 'step="any"'))}</div>`;
  if (t === 'voyant') h += champ('Alarme si l’état vaut', `<select class="ed-in" data-f="alarme_si">${[['', 'jamais (information)'], ['1', '1'], ['0', '0']].map(([v, tx]) => `<option value="${v}" ${String(p.alarme_si == null ? '' : p.alarme_si) === v ? 'selected' : ''}>${tx}</option>`).join('')}</select>`);
  if (e.type === 'pompe') h += champ('Variante', `<select class="ed-in" data-f="variante">${[['', 'standard'], ['doseuse', 'doseuse'], ['vide_fut', 'vide-fût']].map(([v, tx]) => `<option value="${v}" ${(e.variante || '') === v ? 'selected' : ''}>${tx}</option>`).join('')}</select>`);
  h += '</section>';
  // emplacements
  const noms = [...new Set([...(SLOTS_TYPE[t] || []), ...Object.keys(e.slots || {})])];
  h += `<section class="ed-sec"><h4>Emplacements <span class="mono">${noms.length}</span></h4>${noms.map(nm => htmlEmplacement(e, nm)).join('') || '<div class="ed-desc">Aucun emplacement pour ce symbole.</div>'}`;
  const manque = (SLOTS_TYPE[t] || []).filter(nm => !(e.slots || {})[nm]);
  if (manque.length) h += `<div class="ed-ajout">+ ${manque.map(nm => bouton('ajout-slot', libEmpl(e, nm), 'xs', `data-slot="${nm}"`)).join(' ')}</div>`;
  h += '</section>';
  if (e.type === 'silhouette') h += `<section class="ed-sec"><h4>Dessin</h4><div class="ed-btns">${bouton('modifier-dessin', 'Modifier le dessin')}</div><div class="ed-desc">Formes, ports, partie animée et emplacements de ce symbole.</div></section>`;
  // remplacer le dessin
  const symboles = Object.entries(BIBLIO).filter(([, b]) => !b.special);
  h += `<section class="ed-sec"><h4>Remplacer le dessin</h4>`
    + (e.type === 'image' ? `<div class="ed-vignette"><img src="${e.image || ''}" alt="" class="img-grise"></div>` : '')
    + champ('Symbole de la bibliothèque', `<select class="ed-in" data-f="symbole"><option value="">— choisir —</option>${symboles.map(([c, b]) => `<option value="${c}" ${c === cleSymbole(e) && e.type !== 'image' ? 'selected' : ''}>${b.nom}</option>`).join('')}</select>`)
    + `<div class="ed-btns">${bouton('image', 'Déposer une image…')}${e.type === 'image' ? bouton('retirer-image', 'Retirer l’image') : ''}</div><input type="file" accept="image/*" id="ed-fichier-image" hidden>`
    + (e.type === 'image' ? champ('L’état de l’image se lit comme un', `<select class="ed-in" data-f="comportement">${['voyant', 'pompe', 'moteur', 'vanne', 'mesure'].map(b => `<option ${typeBase(e) === b ? 'selected' : ''}>${b}</option>`).join('')}</select>`, 'Affichée en gris dans un cadre standard ; l’état est donné par la pastille.') : '') + '</section>';
  h += `<footer class="ed-pf">${bouton('supprimer', 'Supprimer', 'danger')}</footer>`;
  return h;
}
/* Pinceau de couleurs : palette fixe ; le nom dans la légende est facultatif. */
function htmlPinceau(ids) {
  const cs = ids.map(i => (lArete(i) || {}).couleur || null), distinct = [...new Set(cs.filter(Boolean))];
  const sw = (c, t, nom) => `<button type="button" class="ed-sw ${cs.length && cs.every(x => x === c) ? 'on' : ''} ${c ? '' : 'neutre'}" data-act="couleur" data-c="${c || ''}" title="${esc(nom)}" aria-label="Couleur : ${esc(nom)}" ${c ? `style="--c:${c}"` : ''}></button>`;
  return `<h4>Couleur du tuyau${ids.length > 1 ? 's' : ''}</h4><div class="ed-pinceau" role="group" aria-label="Pinceau de couleurs">${sw(null, '', 'Procédé (neutre)')}${PALETTE.map(p => sw(p.c, p.t, p.nom)).join('')}</div>`
    + distinct.map(c => `<label class="ed-champ"><span>Nom dans la légende <i class="ed-teinte" style="--c:${c}"></i></span><input class="ed-in" data-f="legende-nom" data-c="${c}" type="text" placeholder="facultatif" value="${esc((M.legende || {})[c] || '')}"><small>Sans nom, cette couleur n’apparaît pas dans la légende.</small></label>`).join('');
}
function htmlArete(k) {
  const a = lArete(k.slice(3)), l = M.liaisons.find(x => x.id === a.id) || {};
  return `<header class="ed-ph"><div><h3>Conduite ${esc(a.id)}</h3><div class="mono">${esc(a.de)} (${PORTS_FR[a.ports.de] || a.ports.de}) → ${esc(a.a)} (${PORTS_FR[a.ports.a] || a.ports.a})</div></div></header>
  <section class="ed-sec">${htmlPinceau([a.id])}
  ${champ('Libellé', input('libelle-conduite', l.libelle || ''))}
  <div class="ed-desc">${(a.jalons || []).length} point(s) intermédiaire(s). Glisser les ● pour allonger ou plier le tuyau ; double-clic sur la conduite = ajouter un point, sur un point = le retirer.</div>
  <div class="ed-btns">${bouton('reinit-trace', 'Tracé automatique')}</div>
  ${(a.inline || []).length ? `<h4>Instruments en ligne</h4>${a.inline.map(i => `<div class="ed-lien" data-act="aller" data-cle="eq:${esc(i)}">${esc(i)} · ${esc((EQ[i] || {}).libelle)}</div>`).join('')}` : ''}</section>
  <footer class="ed-pf">${bouton('supprimer', 'Supprimer', 'danger')}</footer>`;
}
function htmlSelection(cles) {
  if (!cles.length) {
    const nb = aVerifierListe().length;
    return `<header class="ed-ph"><div><h3>Synoptique</h3><div class="mono">${L.noeuds.length} ouvrages · ${L.aretes.length} conduites</div></div></header>
    <section class="ed-sec"><div class="ed-desc">Cliquez un élément pour modifier ses propriétés. Glissez un symbole de la palette dans la scène. Outil <b>Conduite</b> (touche C) : cliquez un port, puis un autre.</div>
    ${nb ? `<div class="ed-note">${nb} équipement(s) à vérifier ${bouton('onglet-verif', 'Voir la liste')}</div>` : '<div class="ed-desc">Rien à vérifier.</div>'}</section>`;
  }
  if (cles.length > 1) return `<header class="ed-ph"><div><h3>${cles.length} éléments</h3><div class="mono">sélection multiple</div></div></header>${cles.some(c => c.startsWith('ar:')) ? `<section class="ed-sec">${htmlPinceau(cles.filter(c => c.startsWith('ar:')).map(c => c.slice(3)))}</section>` : ''}<section class="ed-sec">${cles.map(c => `<div class="ed-lien" data-act="aller" data-cle="${esc(c)}">${esc(c.slice(3))}</div>`).join('')}</section><footer class="ed-pf">${bouton('supprimer', 'Supprimer la sélection', 'danger')}</footer>`;
  const k = cles[0], id = k.slice(3);
  if (k.startsWith('eq:')) return htmlEquipement(k);
  if (k.startsWith('ar:')) return htmlArete(k);
  if (k.startsWith('zo:')) { const z = laZone(id); return `<header class="ed-ph"><div><h3>Zone</h3><div class="mono">${esc(id)}</div></div></header><section class="ed-sec">${champ('Titre', input('zone-titre', z.titre))}</section><footer class="ed-pf">${bouton('supprimer', 'Supprimer', 'danger')}</footer>`; }
  if (k.startsWith('te:')) { const t = leTexte(id); return `<header class="ed-ph"><div><h3>Texte</h3><div class="mono">${esc(id)}</div></div></header><section class="ed-sec">${champ('Texte', input('texte', t.texte))}</section><footer class="ed-pf">${bouton('supprimer', 'Supprimer', 'danger')}</footer>`; }
  if (k.startsWith('ca:')) { const c = laCarte(id); return `<header class="ed-ph"><div><h3>${esc(c.titre)}</h3><div class="mono">carte auxiliaire · ${esc(id)}</div></div></header><section class="ed-sec">${champ('Titre', input('carte-titre', c.titre))}
    ${champ('Injection dans', `<select class="ed-in" data-f="carte-cible">${L.noeuds.filter(n => estOuvrage(EQ[n.id])).map(n => `<option value="${esc(n.id)}" ${c.injection && c.injection.cible === n.id ? 'selected' : ''}>${esc(n.id)} · ${esc(EQ[n.id].libelle)}</option>`).join('')}</select>`)}
    <h4>Équipements</h4>${c.membres.map(m => `<div class="ed-lien" data-act="aller" data-cle="eq:${esc(m)}">${esc(m)} · ${esc((EQ[m] || {}).libelle)}</div>`).join('')}</section><footer class="ed-pf">${bouton('supprimer', 'Supprimer', 'danger')}</footer>`; }
  return '';
}
function htmlVerifier() {
  const l = aVerifierListe();
  return `<header class="ed-ph"><div><h3>À vérifier</h3><div class="mono">${l.length} équipement(s)</div></div></header><section class="ed-sec">`
    + (l.length ? l.map(({ e, nb }) => `<div class="ed-lien verif" data-act="aller" data-cle="eq:${esc(e.id)}"><span class="ed-pastille"></span><div><b>${esc(e.id)}</b> · ${esc(e.libelle)}<small>${nb ? nb + ' emplacement(s) à confirmer' : 'équipement à confirmer'}</small></div></div>`).join('') : '<div class="ed-desc">Tout est validé.</div>') + '</section>';
}

EDITEUR.panneau = function () {
  if (!etatVerif) return;
  const nbv = aVerifierListe().length;
  const onglets = `<nav class="ed-onglets"><button type="button" class="${ED.onglet === 'proprietes' ? 'on' : ''}" data-act="onglet" data-onglet="proprietes">Propriétés</button><button type="button" class="${ED.onglet === 'verifier' ? 'on' : ''}" data-act="onglet" data-onglet="verifier" id="ed-onglet-verifier">À vérifier <span class="ed-compte">${nbv}</span></button></nav>`;
  panneauEl.innerHTML = onglets + `<div class="ed-corps">${ED.onglet === 'verifier' ? htmlVerifier() : htmlSelection(ED.sel)}</div>`;
  ED.rendu = true;
};

/* ------------------------------------------------------------------ actions du panneau */
function valider(fn, opts) { fn(); pousser(); redessinerTout(); }
function appliquerChamp(el) {
  const f = el.dataset.f, v = el.value, k = ED.sel[0], id = k && k.slice(3), e = k && k.startsWith('eq:') ? EQ[id] : null, num = (x) => (x === '' || isNaN(+x)) ? null : +x;
  if (e) {
    if (f === 'id') { const err = renommer(id, v); if (err) { byId('ed-err-id').textContent = err; return; } pousser(); redessinerTout(); return; }
    if (f === 'libelle') return valider(() => changerLibelle(id, v));
    if (f === 'taille') return valider(() => changerTaille(id, v));
    if (f === 'en-carte') return valider(() => { if (el.checked) enCarte(id); else depuisCarte(id); });
    if (f === 'grandeur') return valider(() => { e.grandeur = v; if (GRANDEURS[v]) e.params.unite = GRANDEURS[v].unite; });
    if (f === 'tremies') return valider(() => changerTremies(id, +v || 4));
    if (f === 'lamelles') return valider(() => { e.params.lamelles = Math.max(0, +v || 0); });
    if (f === 'niveau_max') return valider(() => { e.params = e.params || {}; const x = num(v); if (x == null) delete e.params.niveau_max; else e.params.niveau_max = x; });
    if (f === 'unite_niveau') return valider(() => { e.params = e.params || {}; if (v) e.params.unite_niveau = v; else delete e.params.unite_niveau; });
    if (f === 'unite') return valider(() => { e.params.unite = v; });
    if (f === 'min' || f === 'max') return valider(() => { e.params[f] = num(v) == null ? (f === 'min' ? 0 : 100) : num(v); });
    if (f === 'seuil_bas' || f === 'seuil_haut') return valider(() => { e.params.seuils = e.params.seuils || {}; const c = f === 'seuil_bas' ? 'bas' : 'haut', x = num(v); if (x == null) delete e.params.seuils[c]; else e.params.seuils[c] = x; if (!Object.keys(e.params.seuils).length) delete e.params.seuils; });
    if (f === 'alarme_si') return valider(() => { e.params = e.params || {}; if (v === '') delete e.params.alarme_si; else e.params.alarme_si = +v; });
    if (f === 'variante') return valider(() => { if (v) e.variante = v; else delete e.variante; remesurerFamille(id); });
    if (f === 'symbole' && v) return valider(() => remplacerSymbole(id, v));
    if (f === 'comportement') return valider(() => comportementImage(id, v));
    const nom = el.dataset.slot;
    if (f && f.startsWith('regle-')) return valider(() => {
      const sp = e.slots[nom], rg = Object.assign({}, sp.regle || {});
      if (f === 'regle-op') { rg.op = v; if (rg.val == null) rg.val = 1; } else if (f === 'regle-val') { rg.val = num(v) == null ? 1 : num(v); if (!rg.op) rg.op = 'eq'; }
      else { const c = f === 'regle-min' ? 'min' : 'max'; if (num(v) == null) delete rg[c]; else rg[c] = num(v); }
      if (rg.op === 'eq' && rg.val === 1 && estTorSlot(nom)) poserRegle(id, nom, null); else poserRegle(id, nom, rg);
    });
  }
  if (f === 'legende-nom') return valider(() => nommerCouleur(el.dataset.c, v));
  if (f === 'libelle-conduite') return valider(() => { const l = M.liaisons.find(x => x.id === id); if (l) l.libelle = v; const a = lArete(id); if (a) a.libelle = v; });
  if (f === 'zone-titre') return valider(() => { const z = laZone(id); z.titre = v; const m = (M.zones || []).find(x => x.id === id); if (m) m.titre = v; });
  if (f === 'texte') return valider(() => { leTexte(id).texte = v; });
  if (f === 'carte-titre') return valider(() => { const c = laCarte(id); c.titre = v; const m = (M.cartes || []).find(x => x.id === id); if (m) m.titre = v; });
  if (f === 'carte-cible') return valider(() => { const c = laCarte(id); c.injection.cible = v; const m = (M.cartes || []).find(x => x.id === id); if (m) m.injection = Object.assign({}, m.injection, { cible: v }); majLiensCartes(); });
}
panneauEl.addEventListener('change', ev => { const el = ev.target; if (el.dataset && el.dataset.f) appliquerChamp(el); if (el.id === 'ed-fichier-image' && el.files[0]) choisirImage(el.files[0]); });
panneauEl.addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.dataset && ev.target.dataset.f && ev.target.tagName === 'INPUT') ev.target.blur(); });
panneauEl.addEventListener('click', ev => {
  const b = ev.target.closest('[data-act]'); if (!b) return; const act = b.dataset.act, k = ED.sel[0], id = k && k.slice(3);
  if (act === 'onglet') { ED.onglet = b.dataset.onglet; ED.rendu = false; EDITEUR.panneau(); }
  else if (act === 'onglet-verif') { ED.onglet = 'verifier'; ED.rendu = false; EDITEUR.panneau(); }
  else if (act === 'aller') { ED.onglet = 'proprietes'; ED.rendu = false; allerA(b.dataset.cle); }
  else if (act === 'valider-eq') valider(() => validerEquipement(id, true));
  else if (act === 'valider-slot') valider(() => validerEmplacement(id, b.dataset.slot));
  else if (act === 'ajout-slot') valider(() => ajouterEmplacement(id, b.dataset.slot));
  else if (act === 'choisir') ouvrirSelecteur(id, b.dataset.slot, b);
  else if (act === 'couleur') valider(() => colorerAretes(ED.sel.filter(c => c.startsWith('ar:')).map(c => c.slice(3)), b.dataset.c || null));
  else if (act === 'modifier-dessin') ouvrirEditeurFormes({ equipement: id });
  else if (act === 'supprimer') { supprimerCles(ED.sel.slice()); pousser(); redessinerTout(); }
  else if (act === 'reinit-trace') valider(() => reinitialiserTrace(id));
  else if (act === 'image') byId('ed-fichier-image').click();
  else if (act === 'retirer-image') valider(() => remplacerSymbole(id, EQ[id].type_origine === 'moteur' ? 'moteur' : (BIBLIO[EQ[id].type_origine] ? EQ[id].type_origine : 'voyant')));
});
function choisirImage(f) { const id = ED.sel[0].slice(3); imagePreparee(f).then(url => { poserImage(id, url); pousser(); redessinerTout(); toast('Image posée : affichée en gris dans un cadre standard', 'ok'); }).catch(() => toast('Image illisible', 'err')); }

/* aller à un élément : le sélectionne et recentre la vue si besoin */
function allerA(cle) {
  ED.sel = [cle]; const id = cle.slice(3); const e = cle.startsWith('eq:') ? EQ[id] : null;
  const n = leNoeud(id) || (e && (leNoeud(e.monte_sur))) || null, c = e && e.carte ? laCarte(e.carte) : cle.startsWith('ca:') ? laCarte(id) : null;
  const cx = n ? n.x + n.w / 2 : c ? c.x + c.w / 2 : null, cy = n ? n.y + n.h / 2 : c ? c.y + c.h / 2 : null;
  if (cx != null && (cx < VB.x + 40 || cx > VB.x + VB.w - 40 || cy < VB.y + 40 || cy > VB.y + VB.h - 40)) { VB.x = cx - VB.w / 2; VB.y = cy - VB.h / 2; appliquerVB(); }
  dessiner(); EDITEUR.panneau();
}

/* ------------------------------------------------------------------ sélecteur de variable (avec recherche) */
let popup = null;
function fermerSelecteur() { if (popup) { popup.remove(); popup = null; } }
function ouvrirSelecteur(id, nom, bouton) {
  fermerSelecteur(); const e = EQ[id], courant = e.slots && e.slots[nom] && e.slots[nom].variable;
  popup = h('div', 'ed-popup'); popup.setAttribute('role', 'dialog'); popup.setAttribute('aria-label', 'Choisir une variable');
  popup.innerHTML = `<div class="ed-pop-h"><b>${esc(e.id)} · ${esc(libEmpl(e, nom))}</b><button type="button" class="ed-x" data-x aria-label="Fermer">×</button></div>
    <input class="ed-in" id="ed-recherche" type="search" placeholder="Rechercher : nom, description, unité…" autocomplete="off" aria-label="Rechercher une variable">
    <div class="ed-liste" id="ed-liste" role="listbox"></div><div class="ed-pop-f"><button type="button" class="btn xs" data-aucune>Aucune variable</button><span class="mono" id="ed-nb"></span></div>`;
  root.append(popup);
  const r = bouton.getBoundingClientRect(), pw = 380; popup.style.left = Math.max(8, Math.min(innerWidth - pw - 8, r.left - pw - 10)) + 'px'; popup.style.top = Math.max(8, Math.min(innerHeight - 470, r.top - 40)) + 'px';
  const champR = popup.querySelector('#ed-recherche'), liste = popup.querySelector('#ed-liste'); let actifIdx = 0, filtre = [];
  const rendre = () => {
    const q = sansAccent(champR.value).split(/\s+/).filter(Boolean);
    filtre = DATA.catalogue.filter(c => { const s2 = sansAccent([c.nom, c.description, c.unite, c.type, c.repere, c.commentaire, c.adresse].join(' ')); return q.every(t => s2.includes(t)); })
      .sort((a, b) => (b.nom === courant) - (a.nom === courant) || (q.length ? (sansAccent(b.nom).startsWith(q[0]) - sansAccent(a.nom).startsWith(q[0])) : 0));
    actifIdx = Math.min(actifIdx, Math.max(0, filtre.length - 1));
    liste.innerHTML = filtre.slice(0, 80).map((c, i) => `<div class="ed-opt ${i === actifIdx ? 'actif' : ''} ${c.nom === courant ? 'courant' : ''}" role="option" data-nom="${esc(c.nom)}"><div><b>${esc(c.nom)}</b> <span class="mono">${esc(c.type)}${c.unite ? ' · ' + esc(c.unite) : ''}</span></div><small>${esc(c.description)}${c.utilisee_par.length ? ' — utilisée par ' + esc(c.utilisee_par.slice(0, 2).join(', ')) : ''}</small></div>`).join('') || '<div class="ed-desc" style="padding:12px">Aucune variable ne correspond.</div>';
    popup.querySelector('#ed-nb').textContent = `${filtre.length} / ${DATA.catalogue.length}`;
  };
  const choisir = (nomVar) => { fermerSelecteur(); valider(() => lierVariable(id, nom, nomVar)); toast(nomVar ? `${nom} ← ${nomVar}` : 'Variable retirée', 'ok'); };
  champR.addEventListener('input', () => { actifIdx = 0; rendre(); });
  champR.addEventListener('keydown', ev => {
    if (ev.key === 'ArrowDown') { actifIdx = Math.min(filtre.length - 1, actifIdx + 1); rendre(); ev.preventDefault(); popup.querySelector('.actif') && popup.querySelector('.actif').scrollIntoView({ block: 'nearest' }); }
    else if (ev.key === 'ArrowUp') { actifIdx = Math.max(0, actifIdx - 1); rendre(); ev.preventDefault(); popup.querySelector('.actif') && popup.querySelector('.actif').scrollIntoView({ block: 'nearest' }); }
    else if (ev.key === 'Enter' && filtre[actifIdx]) { ev.preventDefault(); choisir(filtre[actifIdx].nom); }
    else if (ev.key === 'Escape') { ev.stopPropagation(); fermerSelecteur(); }
  });
  popup.addEventListener('click', ev => { if (ev.target.closest('[data-x]')) return fermerSelecteur(); if (ev.target.closest('[data-aucune]')) return choisir(null); const o = ev.target.closest('.ed-opt'); if (o) choisir(o.dataset.nom); });
  rendre(); champR.focus();
}
addG(document, 'pointerdown', ev => { if (popup && !popup.contains(ev.target) && !ev.target.closest('[data-act="choisir"]')) fermerSelecteur(); }, true);


/* ======================================================================
   MODULE : editeur_ui — éditeur : barre d’outils et palette
   ====================================================================== */

/* Éditeur — barre d'outils, palette de symboles, bascule Consultation / Édition. */
const barreEl = byId('edbar'), paletteEl = byId('palette');
const ICONES = {   // pictogrammes de la palette (même trait que les symboles : un trait, une teinte)
  vanne: '<path d="M4 6l8 6-8 6zM20 6l-8 6 8 6z"/>', vanne_reg: '<path d="M4 9l8 6-8 6zM20 9l-8 6 8 6z"/><path d="M12 15V6M8 6h8"/>',
  pompe: '<circle cx="12" cy="12" r="8"/><path d="M12 4l7 5M12 20l7-5"/>', moteur: '<circle cx="12" cy="12" r="8"/><path d="M8.5 15.5v-7l3.5 4 3.5-4v7"/>',
  agitateur: '<path d="M12 3v10M7 21l5-8 5 8"/><circle cx="12" cy="3.5" r="2"/>', cuve: '<path d="M5 4v14a2 2 0 002 2h10a2 2 0 002-2V4"/><path d="M5 12h14" stroke-dasharray="2 3"/>',
  decanteur: '<path d="M3 5h18v8l-4 6H7l-4-6z"/><path d="M9 5v14M15 5v14" stroke-dasharray="1 3"/>', mesure: '<circle cx="12" cy="12" r="8"/><path d="M8 15c1-4 3-6 8-7"/>',
  voyant: '<circle cx="12" cy="12" r="4"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>', carte: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18"/>',
  texte: '<path d="M5 6h14M12 6v13M9 19h6"/>', zone: '<rect x="3" y="4" width="18" height="16" rx="3" stroke-dasharray="3 3"/>', image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M4 18l5-5 4 4 3-3 4 4"/>'
};
Object.assign(ICONES, {
  vanne_man: '<path d="M4 9l8 6-8 6zM20 9l-8 6 8 6z"/><path d="M12 15V6M8 6h8"/>', vanne_3v: '<path d="M3 7l8 5-8 5zM21 7l-8 5 8 5z"/><path d="M12 12l-4 8h8z"/>',
  clapet: '<circle cx="12" cy="12" r="8"/><path d="M9 8l6 4-6 4zM17 7v10"/>', filtre: '<rect x="6" y="3" width="12" height="18" rx="3"/><path d="M6 17L18 7M6 12l8-6M10 21l8-6"/>',
  echangeur: '<rect x="2" y="6" width="20" height="12" rx="5"/><path d="M5 14l3-4 3 4 3-4 3 4"/>', compresseur: '<circle cx="12" cy="12" r="8"/><path d="M6 8l12 4M6 16l12-4"/>',
  ventilateur: '<circle cx="12" cy="12" r="8"/><path d="M12 5.5c3 0 3 5 0 6.5M18.5 12c0 3-5 3-6.5 0M12 18.5c-3 0-3-5 0-6.5M5.5 12c0-3 5-3 6.5 0"/>',
  silo: '<path d="M5 3h14v11l-5 7h-4l-5-7z"/><path d="M5 9h14" stroke-dasharray="2 3"/>', bassin: '<path d="M4 4v13a3 3 0 003 3h10a3 3 0 003-3V4"/><path d="M4 13h16" stroke-dasharray="2 3"/>',
  convoyeur: '<rect x="2" y="8" width="20" height="8" rx="4"/><circle cx="6" cy="12" r="1.3"/><circle cx="18" cy="12" r="1.3"/><path d="M10 12h4" stroke-dasharray="1.5 2"/>', verin: '<rect x="3" y="8" width="11" height="8" rx="2"/><path d="M14 12h7M21 9v6"/>',
  disjoncteur: '<rect x="4" y="3" width="16" height="18" rx="3"/><circle cx="12" cy="8" r="1.4"/><circle cx="12" cy="16" r="1.4"/><path d="M12 9.5l4 5"/>', transformateur: '<circle cx="9" cy="12" r="5.5"/><circle cx="15" cy="12" r="5.5"/>',
  variateur: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 19L21 5M6 10q1.5-3 3 0t3 0"/>', nouveau: '<path d="M12 5v14M5 12h14"/>', ent: '<rect x="4" y="4" width="16" height="16" rx="3" stroke-dasharray="3 3"/><path d="M8 14l3-4 3 4"/>'
});
const FAMILLES_PALETTE = [
  ['proc', 'Procédé', ['cuve', 'decanteur', 'silo', 'bassin', 'pompe', 'compresseur', 'ventilateur', 'vanne', 'vanne_reg', 'vanne_man', 'vanne_3v', 'clapet', 'filtre', 'echangeur']],
  ['mach', 'Machine', ['moteur', 'agitateur', 'convoyeur', 'verin']],
  ['elec', 'Électrique', ['disjoncteur', 'transformateur', 'variateur']],
  ['gen', 'Génériques', ['mesure', 'voyant', 'carte', 'texte', 'zone', 'image']]
];
const NOM_PAL = (c) => c === 'image' ? 'Image…' : c === 'mesure' ? 'Mesure…' : BIBLIO[c].nom;
function iconeSil(d) {   // vignette d'un symbole de l'entreprise (mêmes primitives, trait de la palette)
  const sil = d.silhouette, k = 20 / Math.max(sil.largeur, sil.hauteur), ox = (24 - sil.largeur * k) / 2, oy = (24 - sil.hauteur * k) / 2;
  const g = s('svg', { viewBox: '0 0 24 24' }); normaliser(sil, k, ox, oy).forEach(n => g.append(n)); return g.innerHTML;
}
const iconeDe = (cle) => String(cle).startsWith('ent:') ? (defEnt(cle.slice(4)) ? iconeSil(defEnt(cle.slice(4))) : ICONES.ent) : ICONES[cle];
function itemPalette(c) {
  const ent = String(c).startsWith('ent:'), d = ent ? defEnt(c.slice(4)) : null, nom = ent ? d.nom : NOM_PAL(c);
  return `<div class="pal-item" role="button" tabindex="0" data-sym="${c}" data-nom="${esc(sansAccent(nom))}" aria-label="${esc(nom)}"><svg viewBox="0 0 24 24" aria-hidden="true">${iconeDe(c)}</svg><span>${esc(nom)}</span>${ent ? `<button type="button" class="pal-del" data-ent-del="${d.id}" title="Retirer de la bibliothèque" aria-label="Retirer ${esc(nom)} de la bibliothèque">×</button>` : ''}</div>`
    + (c === 'mesure' ? `<div class="pal-sub"><label for="pal-grandeur">Grandeur</label><select id="pal-grandeur" class="ed-in sm" aria-label="Grandeur de la mesure">${Object.entries(GRANDEURS).map(([v, g]) => `<option value="${v}" ${ED.grandeur === v ? 'selected' : ''}>${g.nom}</option>`).join('')}</select></div>` : '');
}
let sigBib = null;
function construirePalette() {
  const bib = biblioEnt(); sigBib = JSON.stringify(bib.map(d => [d.id, d.nom, d.silhouette]));
  const fam = (id, titre, items, extra) => { const ferme = ED.palReplie.includes(id);
    return `<div class="pal-g" data-fam="${id}"><button type="button" class="pal-t pal-bascule" data-bascule="${id}" aria-expanded="${!ferme}"><span class="pal-chev">${ferme ? '▸' : '▾'}</span>${titre}</button><div class="pal-corps" ${ferme ? 'hidden' : ''}>${items.map(itemPalette).join('')}${extra || ''}</div></div>`; };
  paletteEl.innerHTML = '<h3 class="mono">Palette</h3>'
    + `<input class="ed-in" id="pal-recherche" type="search" placeholder="Rechercher un symbole…" aria-label="Rechercher un symbole" autocomplete="off" value="${esc(ED.palQ)}">`
    + FAMILLES_PALETTE.map(([id, t, cles]) => fam(id, t, cles)).join('')
    + fam('ent', 'Bibliothèque de l’entreprise', bib.map(d => 'ent:' + d.id), `<button type="button" class="btn xs pal-nouveau" id="pal-nouveau"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONES.nouveau}</svg>Nouveau symbole</button>${bib.length ? '' : '<p class="pal-aide">Aucun symbole personnalisé pour l’instant.</p>'}`)
    + '<p class="pal-aide">Glissez un symbole dans la scène (ou cliquez-le, puis cliquez la scène). Sur un ouvrage : agitateur, mesure et voyant s’y fixent. Sur une conduite : vanne, clapet et mesure s’y posent.</p><input type="file" accept="image/*" id="ed-pal-image" hidden>';
  filtrerPalette();
}
function filtrerPalette() {
  const q = sansAccent(ED.palQ).trim();
  paletteEl.querySelectorAll('.pal-g').forEach(g => { let nb = 0;
    g.querySelectorAll('.pal-item').forEach(i => { const ok = !q || i.dataset.nom.includes(q); i.hidden = !ok; if (ok) nb++; });
    const sub = g.querySelector('.pal-sub'); if (sub) sub.hidden = !!q && sub.previousElementSibling && sub.previousElementSibling.hidden;
    g.hidden = !!q && !nb && g.dataset.fam !== 'ent';
    if (q && nb) { g.querySelector('.pal-corps').hidden = false; } else if (!q) { g.querySelector('.pal-corps').hidden = ED.palReplie.includes(g.dataset.fam); }
    const nv = g.querySelector('.pal-nouveau'); if (nv) nv.hidden = !!q; });
}
function majPalette() {
  if (JSON.stringify(biblioEnt().map(d => [d.id, d.nom, d.silhouette])) !== sigBib) construirePalette();
  paletteEl.querySelectorAll('.pal-item').forEach(i => i.classList.toggle('armee', i.dataset.sym === ED.armee)); corpsScene.classList.toggle('arme', !!ED.armee);
}
paletteEl.addEventListener('input', ev => { if (ev.target.id === 'pal-recherche') { ED.palQ = ev.target.value; filtrerPalette(); } });
paletteEl.addEventListener('change', ev => { if (ev.target.id === 'pal-grandeur') ED.grandeur = ev.target.value; });
paletteEl.addEventListener('click', ev => {
  const bas = ev.target.closest('[data-bascule]');
  if (bas) { const id = bas.dataset.bascule; ED.palReplie = ED.palReplie.includes(id) ? ED.palReplie.filter(x => x !== id) : [...ED.palReplie, id]; construirePalette(); return; }
  if (ev.target.closest('#pal-nouveau')) { ouvrirEditeurFormes({}); return; }
  const del = ev.target.closest('[data-ent-del]');
  if (del) { ev.stopPropagation(); supprimerSymboleEnt(del.dataset.entDel); pousser(); construirePalette(); toast('Symbole retiré de la bibliothèque (les équipements déjà posés restent)', 'ok'); }
});
paletteEl.addEventListener('pointerdown', ev => {
  if (ev.target.closest('[data-ent-del],.pal-sub,#pal-recherche,.pal-bascule,#pal-nouveau')) return;
  const it = ev.target.closest('.pal-item'); if (!it || ev.button !== 0) return; ev.preventDefault(); const cle = it.dataset.sym; let fantome = null, actif = false;
  const mv = e => {
    if (!actif && Math.hypot(e.clientX - ev.clientX, e.clientY - ev.clientY) < 5) return; actif = true;
    if (!fantome) { fantome = h('div', 'pal-fantome'); fantome.innerHTML = `<svg viewBox="0 0 24 24">${iconeDe(cle)}</svg>`; root.append(fantome); }
    fantome.style.left = e.clientX + 'px'; fantome.style.top = e.clientY + 'px';
  };
  const up = e => {
    window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); if (fantome) fantome.remove();
    if (!actif) { if (cle === 'image') { byId('ed-pal-image').click(); return; } ED.armee = ED.armee === cle ? null : cle; majPalette(); return; }
    const el = document.elementFromPoint(e.clientX, e.clientY); if (!el || !svg.contains(el)) return;
    if (cle === 'image') { creerImageA(monde(e), null); return; }
    const [x, y] = monde(e); EDITEUR.deposer(cle, x, y, el);
  };
  addG(window, 'pointermove', mv); addG(window, 'pointerup', up);
});
paletteEl.addEventListener('keydown', ev => { const it = ev.target.closest('.pal-item'); if (it && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); if (it.dataset.sym === 'image') byId('ed-pal-image').click(); else { ED.armee = it.dataset.sym; majPalette(); } } });
paletteEl.addEventListener('change', ev => { if (ev.target.id === 'ed-pal-image' && ev.target.files[0]) { creerImageA([L.w / 2, L.h / 2], ev.target.files[0]); ev.target.value = ''; } });
function creerImageA(pt, fichier) {   // nouvel équipement « image » (cadre standard, état par pastille)
  const e = creerEquipement('voyant'); e.libelle = 'Image'; ajouterNoeud(e, pt[0], pt[1]); poserImage(e.id, null); e.type_origine = 'voyant'; delete e.image;
  const fin = () => { ED.sel = ['eq:' + e.id]; pousser(); redessinerTout(); };
  if (fichier) imagePreparee(fichier).then(url => { poserImage(e.id, url); fin(); }).catch(() => { toast('Image illisible', 'err'); fin(); }); else fin();
}

/* ------------------------------------------------------------------ barre d'outils */
function construireBarre() {
  barreEl.innerHTML = `
    <div class="seg modes" role="group" aria-label="Outil"><span id="ed-outil-selection" role="button" tabindex="0" data-outil="selection" title="Sélection (V)">Sélection</span><span id="ed-outil-conduite" role="button" tabindex="0" data-outil="conduite" title="Tracer une conduite (C)">Conduite</span></div>
    <span class="ed-sep"></span>
    <button type="button" class="btn" id="ed-annuler" title="Annuler (Ctrl+Z)">↶ Annuler</button><button type="button" class="btn" id="ed-retablir" title="Rétablir (Ctrl+Y)">↷ Rétablir</button>
    <span class="ed-sep"></span>
    <button type="button" class="btn" id="ed-grille" title="Afficher la grille (G)">Grille</button><button type="button" class="btn" id="ed-aimant" title="Aimantation à la grille">Aimant</button>
    <span class="ed-sp"></span>
    <span class="mono" id="ed-statut"></span><span class="chip inf" id="ed-alertes" hidden></span>
    <button type="button" class="btn primaire" id="ed-enregistrer" title="Enregistrer une nouvelle version (Ctrl+S)">Enregistrer</button>
    <button type="button" class="btn" id="ed-exporter">Exporter JSON</button><button type="button" class="btn" id="ed-importer">Importer…</button><input type="file" id="ed-fichier-json" accept=".json,application/json" hidden>`;
  const $ = (id) => byId(id);
  barreEl.querySelectorAll('[data-outil]').forEach(b => { b.onclick = () => definirOutil(b.dataset.outil); b.onkeydown = e => { if (e.key === 'Enter') b.click(); }; });
  $('ed-annuler').onclick = () => { if (!annuler()) toast('Rien à annuler'); }; $('ed-retablir').onclick = () => { if (!retablir()) toast('Rien à rétablir'); };
  $('ed-grille').onclick = () => { ED.grilleVisible = !ED.grilleVisible; majBarre(); dessiner(); }; $('ed-aimant').onclick = () => { ED.aimant = !ED.aimant; majBarre(); };
  $('ed-enregistrer').onclick = () => { pousser(); sauver(true); majBarre(); }; $('ed-exporter').onclick = exporterDoc;
  $('ed-importer').onclick = () => $('ed-fichier-json').click();
  $('ed-fichier-json').onchange = (e) => { const f = e.target.files[0]; if (!f) return; f.text().then(importerTexte); e.target.value = ''; };
  $('ed-alertes').onclick = () => { const m = ED.avertissements.find(x => x.cle); if (m) allerA(m.cle); };
}
function majBarre() {
  const $ = (id) => byId(id); if (!$('ed-annuler')) return;
  $('ed-annuler').disabled = ED.idx <= 0; $('ed-retablir').disabled = ED.idx >= ED.pile.length - 1;
  $('ed-outil-selection').classList.toggle('on', ED.outil === 'selection'); $('ed-outil-conduite').classList.toggle('on', ED.outil === 'conduite');
  $('ed-grille').classList.toggle('on', ED.grilleVisible); $('ed-aimant').classList.toggle('on', ED.aimant);
  const mod = estModifie(), hh = ED.enregistre ? ED.enregistre.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : null;
  $('ed-statut').textContent = mod ? 'Modifié, non enregistré' : 'Enregistré'; HOST.onEtat && HOST.onEtat(etatPublic());
  const v = byId('vers'); if (v) v.textContent = mod ? 'Version 1 · modifiée à la main' : 'Version 1 · brouillon IA';
}

/* ------------------------------------------------------------------ bascule de mode */
EDITEUR.mode = function (edition) {
  barreEl.hidden = !edition; paletteEl.hidden = !edition; panneauEl.hidden = !edition;
  ED.sel = []; ED.attente = null; ED.armee = null; ED.drag = null; ED.outil = 'selection'; corpsScene.classList.remove('outil-conduite');
  fermerSelecteur();
  const info = byId('pied-info'); if (info) info.textContent = edition ? 'Édition - modifications enregistrées dans ce navigateur, aucune commande vers l’automate' : 'Lecture seule - aucune commande vers l’automate';
  dessiner(); if (edition) { EDITEUR.panneau(); majBarre(); majPalette(); if (ED.restaure) { toast('Version enregistrée dans ce navigateur rechargée', 'ok'); ED.restaure = false; } }
  setTimeout(() => { ajuster(); if (edition) afficherControles(); }, 40);
};
fusionnerBiblio(); ED.pile = [instantane()]; ED.idx = 0;
construireBarre(); construirePalette(); majBarre();
Object.assign(INTERNE, { ED, defEnt, biblioEnt, enregistrerSymbole, deposerEnt, changerTaille, enCarte, depuisCarte, colorerAretes, nommerCouleur, legendeCouleurs, facteurTaille, ouvrirEditeurFormes, M: () => M, L: () => L, EQ: () => EQ, controles, exporterDoc, documentExport, importerTexte, annuler, retablir, pousser, sauver, estModifie, redessinerTout });

/* ====================================================================== MODULE : pont — liaison avec l'application */
function documentCourant() { return { schema: SCHEMA, modele: copie(M), layout: copie(L) }; }
function etatPublic() {
  return { alarmes: ALARMES.length, aVerifier: aVerifierListe().length, modifie: estModifie(), peutAnnuler: ED.idx > 0, peutRetablir: ED.idx < ED.pile.length - 1, avertissements: (ED.avertissements || []).length };
}
function habillage() {
  const nv = byId('n-verif'); if (nv) nv.textContent = `${aVerifierListe().length} à vérifier`;
  HOST.onEtat && HOST.onEtat(etatPublic());
}
function basculerMode(edition) {
  etatVerif = !!edition; const b = root.querySelector('.synbody');
  b.classList.toggle('sans-verif', !etatVerif); b.classList.toggle('edition', etatVerif); root.classList.toggle('mode-edition', etatVerif);
  EDITEUR.mode(etatVerif); habillage(); setTimeout(ajuster, 30);
}
dessiner(); habillage(); brancherZoom(); ajuster();
const observateur = new ResizeObserver(() => { if (!svg.getBoundingClientRect().width) return; if (fitAuto) ajuster(); else echelle(); });
observateur.observe(svg);
const lisseValeurs = (a, b) => { const ka = Object.keys(a), kb = Object.keys(b); return ka.length === kb.length && ka.every(k => a[k] === b[k]); };

const instance = {
  /** remplace les valeurs affichées (nom de variable → nombre) ; ne redessine que si quelque chose a changé */
  setValues(vals) { if (lisseValeurs(VALEURS, vals)) return; VALEURS = { ...vals }; V = VALEURS; dessiner(); if (etatVerif) EDITEUR.panneau(); habillage(); },
  setCatalogue(c) { DATA.catalogue = c; },
  mode: basculerMode,
  getDoc: documentCourant,
  /** après un enregistrement réussi : le document courant devient la référence (plus « modifié ») */
  marquerEnregistre() { BROUILLON_IA = instantane(); majBarre(); habillage(); },
  estModifie: () => estModifie(),
  importerTexte: (txt) => importerTexte(txt),
  ajuster, zoomer,
  interne: INTERNE,
  destroy() { ecouteurs.forEach(f => f()); observateur.disconnect(); fermerDetail(); fermerSelecteur(); clearTimeout(minuteurPousser); clearTimeout(minuteurControle); root.querySelectorAll('.voile,.ed-popup,#toasts,.pal-fantome').forEach(n => n.remove()); },
};
return instance;
}

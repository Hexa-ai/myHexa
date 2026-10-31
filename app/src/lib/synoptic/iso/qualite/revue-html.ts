// Planche de revue des symboles iso : une page HTML autonome (sans serveur) où chaque symbole apparaît en grand,
// état « marche » (ou équivalent) et « défaut », en fond CLAIR et SOMBRE côte à côte, avec son statut et les avertissements automatiques.
// Le relecteur coche « validé » ou « à refaire » et commente ; les décisions restent dans le navigateur (localStorage) et s'exportent en JSON,
// que `pnpm qualite:appliquer` reporte ensuite dans le champ `statut` des définitions.
import { construire, cssIso } from '../lib'
import type { EtatNom, SymboleDef, Valeurs } from '../lib/types'
import type { Constat, RapportSymbole } from './analyse'
import { LIBELLE_CODE } from './rapport'

export const SCHEMA_REVUE = 'myhexa-revue-symboles/1'
export const CLE_STOCKAGE = 'myhexa.revue.symboles.v1'

export interface Decision {
  decision: 'valide' | 'a_refaire'
  commentaire?: string
  date?: string
}
export interface ExportRevue {
  schema: typeof SCHEMA_REVUE
  exporte: string
  decisions: Record<string, Decision>
}

export interface VueEtat {
  etat: EtatNom
  clair: string
  sombre: string
}
export interface Fiche {
  id: string
  nom: string
  famille: string
  statut: string
  remplacePar?: string
  constats: Constat[]
  score: number
  vues: VueEtat[]
}

export const slug = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

const LIBELLE_ETAT: Record<string, string> = { arret: 'Arrêt', marche: 'Marche', defaut: 'Défaut', alarme: 'Alarme', ouvert: 'Ouvert', ferme: 'Fermé', modulant: 'Modulant', inconnu: 'Inconnu', consigne: 'Consigne', maintenance: 'Maintenance' }

/** les deux états montrés : « marche » (sinon ouvert, sinon le premier déclaré) et « défaut » */
export function etatsDeRevue(def: SymboleDef): EtatNom[] {
  const declares = new Set<EtatNom>([...(def.etats ?? []), ...(def.planche ?? []).map((c) => c[0])])
  const premier: EtatNom = declares.has('marche') ? 'marche' : declares.has('ouvert') ? 'ouvert' : ([...declares].find((e) => e !== 'defaut') ?? 'arret')
  return [premier, 'defaut']
}

function valeursDe(def: SymboleDef, etat: EtatNom): Valeurs {
  return (def.planche ?? []).find((c) => c[0] === etat)?.[1] ?? def.exemple ?? {}
}

/** SVG du symbole seul, cadré serré, aux couleurs imposées (clair / sombre) */
function svgSymbole(def: SymboleDef, etat: EtatNom, theme: 'clair' | 'sombre'): string {
  try {
    const rot = (def.planche ?? []).find((c) => c[0] === etat)?.[2]
    const r = construire({ version: 1, composants: [{ id: 'v', type: def.id, x: 0, y: 0, z: 0, etat, params: { ...def.exemplePlanche, ...(rot ? { rot } : {}) }, valeurs: valeursDe(def, etat) }], liaisons: [] } as never)
    return r.scene.toSvg({ css: false, fond: true, marge: 12 }).replace(/ width="[-\d.]+" height="[-\d.]+"/, ' width="100%" height="100%"').replace('class="iso-root', `class="iso-root fond-${theme}`)
  } catch {
    return ''
  }
}

export function fichesDe(defs: readonly SymboleDef[], rapports: readonly RapportSymbole[]): Fiche[] {
  const par = new Map(rapports.map((r) => [r.id, r]))
  return defs.map((def) => {
    const r = par.get(def.id)
    return {
      id: def.id, nom: def.nom, famille: def.famille, statut: def.statut ?? 'brouillon', remplacePar: def.remplacePar,
      constats: r?.constats ?? [], score: r?.score ?? 0,
      vues: etatsDeRevue(def).map((etat) => ({ etat, clair: svgSymbole(def, etat, 'clair'), sombre: svgSymbole(def, etat, 'sombre') })),
    }
  })
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function carte(f: Fiche): string {
  const groupes = new Map<string, Constat[]>()
  for (const c of f.constats) groupes.set(c.code, [...(groupes.get(c.code) ?? []), c])
  const alertes = [...groupes.entries()].map(([code, l]) => {
    const dur = l[0].gravite === 'erreur'
    return `<li class="${dur ? 'err' : 'avert'}" title="${esc(l.map((c) => c.message + ' (' + c.cas.join(' ; ') + ')').join('\n'))}">${dur ? '❌' : '⚠'} ${esc(LIBELLE_CODE[code] ?? code)}${l.length > 1 ? ` ×${l.length}` : ''} — ${esc(l[0].message.slice(0, 110))}</li>`
  })
  const lignes = f.vues.map((v) => `
      <div class="etat">${esc(LIBELLE_ETAT[v.etat] ?? v.etat)}</div>
      <div class="vue clair">${v.clair || '<span class="vide">rendu impossible</span>'}</div>
      <div class="vue sombre">${v.sombre || '<span class="vide">rendu impossible</span>'}</div>`).join('')
  return `
  <article class="carte" data-id="${esc(f.id)}" data-famille="${esc(f.famille)}" data-statut="${esc(f.statut)}" data-alertes="${f.constats.length}" data-erreurs="${f.constats.filter((c) => c.gravite === 'erreur').length}" id="s-${esc(f.id)}">
    <header>
      <div><strong class="nom">${esc(f.nom)}</strong><code class="id">${esc(f.id)}</code></div>
      <span class="statut" data-statut="${esc(f.statut)}">${esc(f.statut)}${f.remplacePar ? ' → ' + esc(f.remplacePar) : ''}</span>
    </header>
    <div class="grille"><div class="entete"></div><div class="entete">Fond clair</div><div class="entete">Fond sombre</div>${lignes}
    </div>
    ${alertes.length ? `<ul class="alertes">${alertes.join('')}</ul>` : '<p class="rien">Aucun avertissement automatique.</p>'}
    <div class="decision">
      <label class="choix valide"><input type="radio" name="d-${esc(f.id)}" value="valide"> Validé</label>
      <label class="choix refaire"><input type="radio" name="d-${esc(f.id)}" value="a_refaire"> À refaire</label>
      <button type="button" class="effacer" title="Effacer la décision">✕</button>
      <textarea placeholder="Commentaire (ce qui ne va pas, ce qu'il faut voir en France…)" rows="2"></textarea>
    </div>
  </article>`
}

const CSS_PAGE = `
*{box-sizing:border-box}
body{margin:0;font:14px/1.4 system-ui,Segoe UI,Roboto,sans-serif;background:#e9ebec;color:#15191d}
code{font:12px ui-monospace,Menlo,Consolas,monospace}
.barre{position:sticky;top:0;z-index:5;background:#15191dee;color:#fff;padding:8px 16px;display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.barre h1{font-size:15px;margin:0 8px 0 0}
.barre select,.barre input[type=search],.barre button{font:inherit;padding:4px 8px;border-radius:6px;border:1px solid #556;background:#222b33;color:#fff}
.barre button{cursor:pointer}.barre button.fort{background:#2b83e0;border-color:#2b83e0;font-weight:600}
.barre label{font-size:13px;display:flex;gap:4px;align-items:center}
.compte{margin-left:auto;font-size:13px;opacity:.9}
main{padding:14px 16px 60px;max-width:1500px;margin:auto}
h2.famille{margin:26px 0 8px;font-size:20px;border-bottom:2px solid #15191d33;padding-bottom:4px}
.cartes{display:grid;grid-template-columns:repeat(auto-fill,minmax(640px,1fr));gap:14px}
.carte{background:#fff;border:2px solid #c9d0d4;border-radius:10px;padding:10px 12px;break-inside:avoid}
.carte[data-decision=valide]{border-color:#2e9e5b;background:#f2fbf5}
.carte[data-decision=a_refaire]{border-color:#d33;background:#fff5f5}
.carte header{display:flex;justify-content:space-between;gap:8px;align-items:baseline;margin-bottom:6px}
.nom{font-size:16px;margin-right:8px}.id{color:#56636c}
.statut{font-size:12px;padding:1px 9px;border-radius:99px;background:#9aa3ab;color:#fff;white-space:nowrap}
.statut[data-statut=revu]{background:#2b83e0}.statut[data-statut=valide]{background:#2e9e5b}.statut[data-statut=obsolete]{background:#b0794a}
.grille{display:grid;grid-template-columns:54px 1fr 1fr;gap:6px;align-items:stretch}
.entete{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#56636c;text-align:center}
.etat{font-size:12px;font-weight:600;align-self:center;writing-mode:vertical-rl;transform:rotate(180deg);text-align:center}
.vue{height:210px;border-radius:7px;overflow:hidden;border:1px solid #c9d0d4}
.vue.clair{background:#f3f4f1}.vue.sombre{background:#0b0f13}
.vue svg{display:block;width:100%;height:100%}
.vide{color:#d33;padding:10px;display:block}
.alertes{list-style:none;margin:8px 0 0;padding:0;font-size:12px}
.alertes li{padding:2px 6px;border-radius:4px;margin-top:2px}
.alertes li.err{background:#ffe3e3;color:#7a1010}.alertes li.avert{background:#fff4d6;color:#6b4a00}
.rien{font-size:12px;color:#2e7d4b;margin:8px 0 0}
.decision{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:8px}
.choix{padding:3px 10px;border-radius:99px;border:1px solid #9aa3ab;cursor:pointer;font-size:13px}
.choix.valide:has(input:checked){background:#2e9e5b;color:#fff;border-color:#2e9e5b}
.choix.refaire:has(input:checked){background:#d33;color:#fff;border-color:#d33}
.bouton{padding:4px 8px;border-radius:6px;border:1px solid #556;background:#222b33;cursor:pointer}
.effacer{border:0;background:none;cursor:pointer;color:#56636c}
.decision textarea{flex:1 1 100%;font:inherit;font-size:13px;padding:5px 8px;border:1px solid #c9d0d4;border-radius:6px;resize:vertical}
.cache{display:none!important}
body.capture .barre{position:static}
@media print{.barre{display:none}}
`

const SCRIPT = `
const CLE = '${CLE_STOCKAGE}'
const lire = () => { try { return JSON.parse(localStorage.getItem(CLE) || '{}') } catch { return {} } }
let dec = lire()
const cartes = [...document.querySelectorAll('.carte')]
const $ = (id) => document.getElementById(id)
function sauver() { localStorage.setItem(CLE, JSON.stringify(dec)); compter() }
function afficherCarte(c) {
  const d = dec[c.dataset.id]
  if (d && d.decision) c.dataset.decision = d.decision; else delete c.dataset.decision
  c.querySelectorAll('input[type=radio]').forEach((r) => { r.checked = !!d && r.value === d.decision })
  c.querySelector('textarea').value = d && d.commentaire ? d.commentaire : ''
}
for (const c of cartes) {
  const id = c.dataset.id
  afficherCarte(c)
  c.querySelectorAll('input[type=radio]').forEach((r) => r.addEventListener('change', () => {
    dec[id] = { ...(dec[id] || {}), decision: r.value, date: new Date().toISOString() }
    c.dataset.decision = r.value; sauver()
  }))
  c.querySelector('textarea').addEventListener('input', (e) => {
    const t = e.target.value
    if (!dec[id]) { if (!t) return; dec[id] = { decision: undefined, date: new Date().toISOString() } }
    dec[id].commentaire = t
    if (!dec[id].decision && !t) delete dec[id]
    sauver()
  })
  c.querySelector('.effacer').addEventListener('click', () => { delete dec[id]; afficherCarte(c); sauver() })
}
function compter() {
  const v = Object.values(dec)
  $('compte').textContent = cartes.filter((c) => !c.classList.contains('cache')).length + ' affiché(s) · ' + v.filter((d) => d.decision === 'valide').length + ' validé(s) · ' + v.filter((d) => d.decision === 'a_refaire').length + ' à refaire · ' + (cartes.length - Object.keys(dec).filter((k) => dec[k].decision).length) + ' sans décision'
}
function filtrer() {
  const fam = $('f-fam').value, st = $('f-statut').value, q = $('f-q').value.trim().toLowerCase()
  const av = $('f-avert').checked, nd = $('f-nd').checked
  for (const c of cartes) {
    const ok = (!fam || c.dataset.famille === fam) && (!st || c.dataset.statut === st) && (!av || +c.dataset.alertes > 0) && (!nd || !(dec[c.dataset.id] && dec[c.dataset.id].decision)) &&
      (!q || (c.dataset.id + ' ' + c.querySelector('.nom').textContent).toLowerCase().includes(q))
    c.classList.toggle('cache', !ok)
  }
  for (const h of document.querySelectorAll('h2.famille')) h.classList.toggle('cache', ![...document.querySelectorAll('.carte[data-famille="' + CSS.escape(h.dataset.famille) + '"]')].some((c) => !c.classList.contains('cache')))
  compter()
}
for (const id of ['f-fam', 'f-statut', 'f-avert', 'f-nd']) $(id).addEventListener('change', filtrer)
$('f-q').addEventListener('input', filtrer)
const h = new URLSearchParams(location.hash.slice(1))
if (h.get('fam')) $('f-fam').value = h.get('fam')
if (h.get('avert')) $('f-avert').checked = true
if (h.has('capture')) document.body.classList.add('capture')
$('exporter').addEventListener('click', () => {
  const sortie = { schema: '${SCHEMA_REVUE}', exporte: new Date().toISOString(), decisions: Object.fromEntries(Object.entries(dec).filter(([, d]) => d.decision || d.commentaire)) }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([JSON.stringify(sortie, null, 2)], { type: 'application/json' }))
  a.download = 'revue-symboles-' + new Date().toISOString().slice(0, 10) + '.json'
  a.click()
})
$('importer').addEventListener('change', async (e) => {
  const f = e.target.files[0]; if (!f) return
  try {
    const j = JSON.parse(await f.text())
    if (j.schema !== '${SCHEMA_REVUE}') throw new Error('schéma inconnu')
    dec = { ...dec, ...j.decisions }; sauver(); cartes.forEach(afficherCarte); filtrer()
  } catch (err) { alert('Import impossible : ' + err.message) }
  e.target.value = ''
})
$('raz').addEventListener('click', () => { if (confirm('Effacer toutes les décisions de ce navigateur ?')) { dec = {}; sauver(); cartes.forEach(afficherCarte); filtrer() } })
filtrer()
`

export function pageRevue(fiches: readonly Fiche[], o: { date: string; resume: string }): string {
  const familles = [...new Set(fiches.map((f) => f.famille))].sort((a, b) => a.localeCompare(b, 'fr'))
  const sections = familles.map((fam) => {
    const l = fiches.filter((f) => f.famille === fam).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    return `<h2 class="famille" data-famille="${esc(fam)}" id="f-${slug(fam)}">${esc(fam)} <small>(${l.length})</small></h2><div class="cartes">${l.map(carte).join('')}</div>`
  })
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>Revue des symboles iso</title><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${CSS_PAGE}</style><style>${cssIso()}</style></head>
<body>
<div class="barre">
  <h1>Revue des symboles iso</h1>
  <select id="f-fam" aria-label="Famille"><option value="">Toutes les familles</option>${familles.map((f) => `<option>${esc(f)}</option>`).join('')}</select>
  <select id="f-statut" aria-label="Statut"><option value="">Tous les statuts</option><option value="brouillon">Brouillon</option><option value="revu">Revu</option><option value="valide">Validé</option><option value="obsolete">Obsolète</option></select>
  <input id="f-q" type="search" placeholder="Chercher (id, nom)">
  <label><input id="f-avert" type="checkbox"> avec avertissements</label>
  <label><input id="f-nd" type="checkbox"> sans décision</label>
  <button id="exporter" class="fort" type="button">Exporter les décisions (JSON)</button>
  <label class="bouton">Importer <input id="importer" type="file" accept="application/json,.json" hidden></label>
  <button id="raz" type="button">Tout effacer</button>
  <span class="compte" id="compte"></span>
</div>
<main>
  <p>Généré le ${esc(o.date)} — ${esc(o.resume)}. Cochez « Validé » ou « À refaire » ; les décisions sont gardées dans ce navigateur, puis exportées en JSON (<code>pnpm qualite:appliquer revue-symboles-….json</code> les reporte dans le champ <code>statut</code>).</p>
  ${sections.join('\n')}
</main>
<script>${SCRIPT}</script>
</body></html>`
}

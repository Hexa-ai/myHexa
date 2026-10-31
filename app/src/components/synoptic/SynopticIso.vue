<script setup lang="ts">
// Vue isométrique d'un synoptique : affichage en direct (tuile, vue agrandie, plein écran mobile) et éditeur (grille au sol,
// pose aimantée, liaison de ports, accessoires sur tuyau). Le dessin et le routage des tuyaux viennent de la bibliothèque iso
// (lib/) ; ce composant ne fait que : état → document de la bibliothèque → SVG, et gestes → opérations d'édition (edition.ts).
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { catalogue as catalogueIso, construire, rendu0, cssIso } from '@/lib/synoptic/iso/lib'
import type { Resultat } from '@/lib/synoptic/iso/lib'
import type { CatalogueVariable, SynopticEtat } from '@/lib/synoptic/engine/types'
import { docLib, objetsIso, type IsoSection } from '@/lib/synoptic/iso/format'
import { estAccessoireIso } from '@/lib/synoptic/iso/familles'
import { lireEtat, estLie } from '@/lib/synoptic/iso/etats'
import {
  abscisseCurviligne, ajouterAccessoire, deplacerComposant, poserComposant, reglerPlan, relierPorts, supprimerObjet, tourner,
} from '@/lib/synoptic/iso/edition'
import { PAS_AIMANT, auSol, boiteSol, deplacementSol, grilleSvg, projeter, solEffectif } from '@/lib/synoptic/iso/grille'
import IsoProprietes from './IsoProprietes.vue'
import '@/lib/synoptic/engine/synoptique.css'
import '@/lib/synoptic/engine/adaptation.css'
import '@/lib/synoptic/iso/iso.css'

type Sel = { k: 'c' | 'l' | 'a'; id: string }
type Vb = [number, number, number, number]

const props = withDefaults(
  defineProps<{
    iso: IsoSection
    values: Record<string, number>
    catalogue?: CatalogueVariable[]
    editing?: boolean
    fullFrame?: boolean
    /** false = consultation sans geste (tuile de tablette) */
    gestes?: boolean
    mobile?: boolean
  }>(),
  { catalogue: () => [], gestes: true },
)
const emit = defineEmits<{
  (e: 'change', iso: IsoSection): void
  (e: 'etat', etat: SynopticEtat): void
  (e: 'save'): void
}>()

// feuille de style des symboles : une seule fois dans la page
if (!document.getElementById('iso-css')) {
  const st = document.createElement('style')
  st.id = 'iso-css'
  st.textContent = cssIso()
  document.head.appendChild(st)
}

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T
const travail = ref<IsoSection>(clone(props.iso))
const stage = ref<HTMLDivElement | null>(null)
const res = shallowRef<Resultat | null>(null)
const erreur = ref('')
const info = ref('')
const sel = ref<Sel | null>(null)
const mode = ref<'sel' | 'lien'>('sel')
const arme = ref<string | null>(null)
const attente = ref<string | null>(null)
const aimant = ref<number>(20)
const filtrePalette = ref('')
let vb: Vb | null = null
let raf = 0
let dernierDoc = ''

// ── historique (annuler / rétablir) : instantanés de la section
const histo: string[] = [JSON.stringify(travail.value)]
const pos = ref(0)
const peutAnnuler = computed(() => pos.value > 0)
const peutRetablir = ref(false)
function majHisto() {
  peutRetablir.value = pos.value < histo.length - 1
}
function valider() {
  const s = JSON.stringify(travail.value)
  if (s === histo[pos.value]) return
  histo.length = pos.value + 1
  histo.push(s)
  pos.value++
  majHisto()
  emit('change', clone(travail.value))
  rendre()
}
function aller(p: number) {
  if (p < 0 || p >= histo.length) return
  pos.value = p
  travail.value = JSON.parse(histo[p]) as IsoSection
  majHisto()
  sel.value = null
  emit('change', clone(travail.value))
  rendre(true)
}
const annuler = () => aller(pos.value - 1)
const retablir = () => aller(pos.value + 1)

// document remplacé par le parent (autre version, import) : on repart de lui ; l'écho de nos propres changements est ignoré
watch(
  () => props.iso,
  (n) => {
    if (JSON.stringify(n) === JSON.stringify(travail.value)) return
    travail.value = clone(n)
    histo.length = 0
    histo.push(JSON.stringify(travail.value))
    pos.value = 0
    majHisto()
    vb = null
    rendre(true)
  },
)
watch(() => props.values, () => rendre())
watch(() => props.editing, () => { vb = null; rendre(true) })

// ── dessin
function planifier() {
  if (!raf) raf = requestAnimationFrame(() => { raf = 0; rendre(true) })
}
function rendre(force = false) {
  const el = stage.value
  if (!el) return
  try {
    const dl = docLib(travail.value, props.values, { editeur: props.editing })
    const cle = JSON.stringify(dl) + (props.editing ? JSON.stringify([sel.value, mode.value, attente.value]) : '')
    if (!force && cle === dernierDoc) return
    dernierDoc = cle
    const r = construire(dl)
    res.value = r
    erreur.value = ''
    let svg = r.scene.toSvg({ css: false, fond: false, marge: 30 })
    const m = svg.match(/viewBox="([-\d. ]+)"/)
    const v = (m?.[1] ?? '0 0 400 300').split(' ').map(Number) as Vb
    let grille = ''
    if (props.editing) {
      const sol = solEffectif(travail.value)
      grille = grilleSvg(sol)
      if (!vb) {
        const b = boiteSol(sol)
        const x0 = Math.min(v[0], b[0] - 20), y0 = Math.min(v[1], b[1] - 20)
        const x1 = Math.max(v[0] + v[2], b[0] + b[2] + 20), y1 = Math.max(v[1] + v[3], b[1] + b[3] + 20)
        vb = [x0, y0, x1 - x0, y1 - y0]
      }
    } else if (!vb) vb = v
    svg = svg.replace(/width="\d+" height="\d+" viewBox="[-\d. ]+"/, `width="100%" height="100%" viewBox="${vb.join(' ')}"`)
    if (grille) svg = svg.replace('<g class="dessin">', grille + '<g class="dessin">')
    let sur = ''
    if (props.editing && mode.value === 'lien') {
      for (const c of travail.value.composants) {
        const rd = r.rendus[c.id]
        if (!rd) continue
        for (const p of rd.ports) {
          const a = projeter(p.pos[0], p.pos[1], p.pos[2])
          sur += `<circle class="pt${attente.value === c.id + ':' + p.id ? ' on' : ''}" data-port="${c.id}:${p.id}" cx="${a[0].toFixed(1)}" cy="${a[1].toFixed(1)}" r="5.5"><title>${c.id}.${p.id}</title></circle>`
        }
      }
    }
    svg = svg.replace('</svg>', `<g id="iso-sur">${sur}</g></svg>`)
    el.innerHTML = svg
    if (sel.value) {
      const q = sel.value.k === 'c' ? `[data-c="${sel.value.id}"]` : sel.value.k === 'a' ? `[data-acc="${sel.value.id}"]` : `.lien[data-lien="${sel.value.id}"]`
      el.querySelectorAll(q).forEach((n) => n.classList.add('sel'))
    }
    signaler(r)
  } catch (e) {
    erreur.value = (e as Error).message
  }
}

/** résumé remonté au parent : alarmes en direct (objets reliés en alarme ou en défaut) */
function signaler(r: Resultat) {
  let alarmes = 0
  for (const o of objetsIso(travail.value)) {
    if (!estLie(o.obj)) continue
    const t = o.genre === 'l' ? 'tuyau' : (o.obj as { type: string }).type
    const e = lireEtat({ type: t, etat: o.obj.etat, valeurs: 'valeurs' in o.obj ? o.obj.valeurs : undefined, slots: o.obj.slots, niveau_max: o.obj.niveau_max, seuils: o.obj.seuils }, props.values).etat
    if (e === 'alarme' || e === 'defaut') alarmes++
  }
  emit('etat', {
    alarmes,
    aVerifier: 0,
    modifie: pos.value > 0,
    peutAnnuler: peutAnnuler.value,
    peutRetablir: peutRetablir.value,
    avertissements: r.avertissements.length,
  })
}

// ── géométrie écran
const svgEl = () => stage.value?.querySelector('svg') as SVGSVGElement | null
function svgPt(e: { clientX: number; clientY: number }): [number, number] {
  const s = svgEl()
  const ctm = s?.getScreenCTM()
  if (!s || !ctm) return [0, 0]
  const p = s.createSVGPoint()
  p.x = e.clientX
  p.y = e.clientY
  const q = p.matrixTransform(ctm.inverse())
  return [q.x, q.y]
}
const toucher = (e: Event, q: string) => (e.target as Element).closest(q) as SVGElement | null
const compo = (id: string) => travail.value.composants.find((c) => c.id === id)

// ── gestes
const pointeurs = new Map<number, [number, number]>()
let glisse: { id: string; sx: number; sy: number; x0: number; y0: number; bouge: boolean } | null = null
let glisseAcc: { lien: string; id: string; bouge: boolean } | null = null
let pan: { x: number; y: number; vb: Vb } | null = null
let pincement: { d: number; vb: Vb } | null = null

function onDown(e: PointerEvent) {
  pointeurs.set(e.pointerId, [e.clientX, e.clientY])
  if (pointeurs.size === 2) {
    const [a, b] = [...pointeurs.values()]
    pincement = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), vb: [...vb!] as Vb }
    pan = null
    glisse = null
    return
  }
  if (e.button !== 0) return
  if (props.editing) {
    if (touchEdition(e)) return
  } else if (!props.gestes) return
  pan = { x: e.clientX, y: e.clientY, vb: [...vb!] as Vb }
  stage.value?.setPointerCapture(e.pointerId)
}

/** vrai si le geste a été pris en charge par l'édition */
function touchEdition(e: PointerEvent): boolean {
  const port = toucher(e, '[data-port]')
  if (port && mode.value === 'lien') {
    choisirPort(port.getAttribute('data-port')!)
    return true
  }
  const lien = toucher(e, '.lien')
  if (arme.value && estAccessoireIso(arme.value)) {
    if (lien) {
      poserSurTuyau(arme.value, lien.getAttribute('data-lien')!, e, e.shiftKey)
      return true
    }
    info.value = 'Cliquez sur un tuyau pour y poser cet appareil'
    return true
  }
  if (arme.value) {
    poserArme(arme.value, e)
    if (!e.shiftKey) arme.value = null
    return true
  }
  const acc = toucher(e, '.acc')
  if (acc) {
    const id = acc.getAttribute('data-acc')!
    sel.value = { k: 'a', id }
    glisseAcc = { lien: acc.getAttribute('data-lien')!, id, bouge: false }
    stage.value?.setPointerCapture(e.pointerId)
    rendre(true)
    return true
  }
  const c = toucher(e, '.cmp')
  if (c) {
    const id = c.getAttribute('data-c')!
    const cc = compo(id)
    sel.value = { k: 'c', id }
    if (cc && !cc.monte) {
      glisse = { id, sx: e.clientX, sy: e.clientY, x0: cc.x, y0: cc.y, bouge: false }
      stage.value?.setPointerCapture(e.pointerId)
    }
    rendre(true)
    return true
  }
  if (lien) {
    sel.value = { k: 'l', id: lien.getAttribute('data-lien')! }
    rendre(true)
    return true
  }
  sel.value = null
  rendre(true)
  return false
}

function onMove(e: PointerEvent) {
  if (pointeurs.has(e.pointerId)) pointeurs.set(e.pointerId, [e.clientX, e.clientY])
  if (pincement && pointeurs.size === 2) {
    const [a, b] = [...pointeurs.values()]
    const d = Math.hypot(a[0] - b[0], a[1] - b[1])
    const f = pincement.d / (d || 1)
    const w = pincement.vb[2] * f, h = pincement.vb[3] * f
    const cx = pincement.vb[0] + pincement.vb[2] / 2, cy = pincement.vb[1] + pincement.vb[3] / 2
    vb = [cx - w / 2, cy - h / 2, w, h]
    svgEl()?.setAttribute('viewBox', vb.join(' '))
    return
  }
  if (glisse) {
    const cc = compo(glisse.id)
    const s = svgEl()
    if (!cc || !s) return
    const k = 1 / (s.getScreenCTM()?.a || 1)
    const [dx, dy] = deplacementSol((e.clientX - glisse.sx) * k, (e.clientY - glisse.sy) * k)
    deplacerComposant(cc, glisse.x0 + dx, glisse.y0 + dy, aimant.value)
    glisse.bouge = true
    planifier()
  } else if (glisseAcc) {
    const L = res.value?.liaisons[glisseAcc.lien]
    const a = travail.value.liaisons.find((l) => l.id === glisseAcc!.lien)?.accessoires?.find((q) => q.id === glisseAcc!.id)
    if (!L || !a) return
    const [px, py] = svgPt(e)
    a.s = Math.round(Math.min(0.97, Math.max(0.03, abscisseCurviligne(L.pts.map((p) => projeter(p[0], p[1], p[2])), px, py))) * 100) / 100
    delete a.d
    glisseAcc.bouge = true
    planifier()
  } else if (pan) {
    const s = svgEl()
    if (!s) return
    const k = 1 / (s.getScreenCTM()?.a || 1)
    vb = [pan.vb[0] - (e.clientX - pan.x) * k, pan.vb[1] - (e.clientY - pan.y) * k, pan.vb[2], pan.vb[3]]
    s.setAttribute('viewBox', vb.join(' '))
  }
}
function onUp(e: PointerEvent) {
  pointeurs.delete(e.pointerId)
  if (pointeurs.size < 2) pincement = null
  const bouge = glisse?.bouge || glisseAcc?.bouge
  glisse = null
  glisseAcc = null
  pan = null
  if (bouge) valider()
}
function onWheel(e: WheelEvent) {
  if (!vb || (!props.editing && !props.gestes)) return
  e.preventDefault()
  zoomer(e.deltaY > 0 ? 1.12 : 1 / 1.12, svgPt(e))
}
function zoomer(f: number, c?: [number, number]) {
  if (!vb) return
  const [px, py] = c ?? [vb[0] + vb[2] / 2, vb[1] + vb[3] / 2]
  vb = [px - (px - vb[0]) * f, py - (py - vb[1]) * f, vb[2] * f, vb[3] * f]
  svgEl()?.setAttribute('viewBox', vb.join(' '))
}
function ajuster() {
  vb = null
  rendre(true)
}

// ── pose
function centreDe(type: string): [number, number] {
  try {
    const a = rendu0(type, {}, 'arret', {}, 0).ancres.centre
    return [a[0], a[1]]
  } catch {
    return [0, 0]
  }
}
function poserArme(type: string, e: { clientX: number; clientY: number }) {
  const [sx, sy] = svgPt(e)
  const [x, y] = auSol(sx, sy, 0)
  const id = poserComposant(travail.value, type, x, y, { aimant: aimant.value, centre: centreDe(type) })
  sel.value = { k: 'c', id }
  info.value = `Posé : ${id}`
  valider()
}
function poserSurTuyau(type: string, lienId: string, e: { clientX: number; clientY: number }, garder = false) {
  const L = res.value?.liaisons[lienId]
  if (!L) return
  const [px, py] = svgPt(e)
  const s = abscisseCurviligne(L.pts.map((p) => projeter(p[0], p[1], p[2])), px, py)
  const a = ajouterAccessoire(travail.value, lienId, type, s)
  if (a) {
    sel.value = { k: 'a', id: a.id }
    info.value = `${type} posé sur ${lienId}, calé dans l'axe`
    if (!garder) arme.value = null
    valider()
  }
}
function lacher(ev: DragEvent) {
  ev.preventDefault()
  const type = ev.dataTransfer?.getData('text/plain')
  if (!type || !props.editing) return
  if (estAccessoireIso(type)) {
    const lien = (ev.target as Element).closest('.lien')
    if (lien) poserSurTuyau(type, lien.getAttribute('data-lien')!, ev)
    else info.value = 'Déposez cet appareil sur un tuyau'
  } else poserArme(type, ev)
}

// ── liaison de deux ports
function choisirPort(pid: string) {
  if (!attente.value) {
    attente.value = pid
    info.value = 'Choisissez le 2e port'
    rendre(true)
    return
  }
  if (attente.value === pid) {
    attente.value = null
    rendre(true)
    return
  }
  const [c1, p1] = attente.value.split(':')
  const [c2, p2] = pid.split(':')
  if (c1 === c2 && p1 === p2) return
  const A = res.value!.rendus[c1].port(p1)
  const B = res.value!.rendus[c2].port(p2)
  const id = relierPorts(travail.value, { c: c1, port: p1 }, { c: c2, port: p2 }, A, B)
  attente.value = null
  mode.value = 'sel'
  sel.value = { k: 'l', id }
  info.value = `Tuyau ${id} tracé`
  valider()
}
function basculerLien() {
  mode.value = mode.value === 'lien' ? 'sel' : 'lien'
  attente.value = null
  arme.value = null
  info.value = mode.value === 'lien' ? 'Mode liaison : cliquez un port puis un autre' : ''
  rendre(true)
}

// ── actions
function supprimer() {
  const s = sel.value
  if (!s) return
  supprimerObjet(travail.value, s.k, s.id)
  sel.value = null
  valider()
}
function tournerSel() {
  const c = sel.value?.k === 'c' ? compo(sel.value.id) : null
  if (!c) return
  tourner(c)
  valider()
}
function planSel(p: 'avant' | 'arriere') {
  const s = sel.value
  if (!s) return
  const o = s.k === 'c' ? compo(s.id) : s.k === 'l' ? travail.value.liaisons.find((l) => l.id === s.id) : travail.value.liaisons.flatMap((l) => l.accessoires ?? []).find((a) => a.id === s.id)
  if (!o) return
  reglerPlan(o, p)
  valider()
}
function armer(type: string) {
  arme.value = arme.value === type ? null : type
  mode.value = 'sel'
  attente.value = null
  info.value = arme.value ? (estAccessoireIso(type) ? 'Cliquez sur un tuyau' : 'Cliquez sur la grille pour poser') : ''
  rendre(true)
}

function touche(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null
  const saisie = !!t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)
  // le dessin 2D reste monté sous la vue iso : il ne doit rien recevoir de ce qu'on tape ici
  if (!saisie) e.stopImmediatePropagation()
  if (saisie) return
  const ctrl = e.ctrlKey || e.metaKey
  const k = e.key.toLowerCase()
  if (ctrl && k === 'z' && !e.shiftKey) { e.preventDefault(); annuler(); return }
  if (ctrl && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); retablir(); return }
  if (ctrl && k === 's') { e.preventDefault(); emit('save'); return }
  if (ctrl) return
  if (k === 'r') { tournerSel() }
  else if (k === 'l') basculerLien()
  else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); supprimer() }
  else if (e.key === 'PageUp' || e.key === 'PageDown') { e.preventDefault(); planSel(e.key === 'PageUp' ? 'avant' : 'arriere') }
  else if (e.key === 'Escape') { arme.value = null; attente.value = null; mode.value = 'sel'; info.value = ''; sel.value = null; rendre(true) }
  else if (e.key === '[' || e.key === ']') {
    const c = sel.value?.k === 'c' ? compo(sel.value.id) : null
    if (c) { c.z += e.key === ']' ? 10 : -10; valider() }
  } else if (e.key.startsWith('Arrow')) {
    const c = sel.value?.k === 'c' ? compo(sel.value.id) : null
    if (!c) return
    e.preventDefault()
    const p = aimant.value
    if (e.key === 'ArrowRight') c.x += p
    else if (e.key === 'ArrowLeft') c.x -= p
    else if (e.key === 'ArrowDown') c.y += p
    else c.y -= p
    valider()
  }
}
function toucheRelachee(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null
  if (!(t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) e.stopImmediatePropagation()
}

onMounted(() => {
  rendre(true)
  stage.value?.addEventListener('wheel', onWheel, { passive: false })
  if (props.editing) {
    window.addEventListener('keydown', touche, true)
    window.addEventListener('keyup', toucheRelachee, true)
  }
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', touche, true)
  window.removeEventListener('keyup', toucheRelachee, true)
  if (raf) cancelAnimationFrame(raf)
})

// ── palette
const groupes = computed(() => {
  const f = filtrePalette.value.trim().toLowerCase()
  const par = new Map<string, { id: string; nom: string }[]>()
  for (const d of catalogueIso()) {
    if (f && !(d.nom + ' ' + d.id + ' ' + d.famille).toLowerCase().includes(f)) continue
    const g = estAccessoireIso(d.id) ? 'Sur un tuyau (vannes, capteurs)' : d.famille
    if (!par.has(g)) par.set(g, [])
    par.get(g)!.push({ id: d.id, nom: d.nom })
  }
  const tous = [...par.entries()].map(([nom, items]) => ({ nom, items }))
  // les accessoires en premier : c'est ce que l'on cherche le plus souvent
  return tous.sort((a, b) => Number(b.nom.startsWith('Sur un')) - Number(a.nom.startsWith('Sur un')))
})

defineExpose({ annuler, retablir, ajuster, snapshot: () => clone(travail.value) })
void nextTick
</script>

<template>
  <div class="syn-root iso-vue" :class="{ 'syn-plein': fullFrame, 'syn-sans-geste': gestes === false, 'syn-mobile': mobile, 'mode-edition': editing }" data-testid="iso-root">
    <div v-if="editing" class="edbar" data-testid="iso-barre">
      <button type="button" class="btn" :class="{ on: mode === 'lien' }" data-testid="iso-relier" title="Relier deux ports (L)" @click="basculerLien">⟷ Relier (L)</button>
      <button type="button" class="btn" :disabled="sel?.k !== 'c'" data-testid="iso-barre-tourner" title="Quart de tour (R)" @click="tournerSel">↻ Tourner (R)</button>
      <button type="button" class="btn" :disabled="!sel" title="Suppr" @click="supprimer">✕ Supprimer</button>
      <span class="ed-sep" />
      <label class="mono">Aimant
        <select v-model.number="aimant" class="ed-in sm" data-testid="iso-aimant">
          <option v-for="p in PAS_AIMANT" :key="p" :value="p">{{ p }}</option>
        </select>
      </label>
      <button type="button" class="btn" :disabled="!sel" @click="planSel('avant')">⇧ Premier plan</button>
      <button type="button" class="btn" :disabled="!sel" @click="planSel('arriere')">⇩ Arrière-plan</button>
      <span class="ed-sep" />
      <button type="button" class="btn" :disabled="!peutAnnuler" data-testid="iso-annuler" @click="annuler">↶ Annuler</button>
      <button type="button" class="btn" :disabled="!peutRetablir" data-testid="iso-retablir" @click="retablir">↷ Rétablir</button>
      <button type="button" class="btn" @click="ajuster">⤢ Ajuster</button>
      <span class="ed-sp" />
      <span class="mono" data-testid="iso-info">{{ info }}</span>
    </div>
    <div class="synbody" :class="{ edition: editing }">
      <aside v-if="editing" class="ed-palette" aria-label="Palette isométrique" data-testid="iso-palette">
        <input v-model="filtrePalette" class="ed-in" type="search" placeholder="Chercher…" data-testid="iso-palette-filtre">
        <details v-for="g in groupes" :key="g.nom" :open="g.nom.startsWith('Sur un') || g.nom === 'Pompes' || !!filtrePalette">
          <summary class="mono">{{ g.nom }}</summary>
          <button
            v-for="i in g.items" :key="i.id" type="button" class="iso-pal" :class="{ on: arme === i.id }" draggable="true"
            :data-testid="`iso-pal-${i.id}`" :title="i.id" @click="armer(i.id)" @dragstart="$event.dataTransfer?.setData('text/plain', i.id)"
          >{{ i.nom }}</button>
        </details>
      </aside>
      <div
        ref="stage" class="iso-stage" :class="{ lien: mode === 'lien', arme: !!arme, plein: !editing }" data-testid="iso-stage"
        @pointerdown="onDown" @pointermove="onMove" @pointerup="onUp" @pointercancel="onUp" @contextmenu.prevent @dragover.prevent @drop="lacher"
      />
      <p v-if="erreur" class="iso-erreur" data-testid="iso-erreur">Dessin impossible : {{ erreur }}</p>
      <aside v-if="editing" class="ed-props" aria-label="Propriétés" data-testid="iso-props">
        <IsoProprietes
          :iso="travail" :sel="sel" :catalogue="catalogue" :values="values"
          @change="valider" @supprimer="supprimer" @tourner="tournerSel"
        />
      </aside>
      <div v-if="!editing && gestes" class="zoomb">
        <button type="button" aria-label="Zoom avant" @click="zoomer(1 / 1.25)">+</button>
        <button type="button" aria-label="Zoom arrière" @click="zoomer(1.25)">−</button>
        <button type="button" aria-label="Ajuster" @click="ajuster">⤢</button>
      </div>
    </div>
  </div>
</template>

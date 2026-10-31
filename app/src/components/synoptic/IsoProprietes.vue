<script setup lang="ts">
// Panneau de propriétés de la vue isométrique : même organisation que celui des symboles 2D
// (libellé, position, état fixe, variables reliées par emplacement avec leur règle, ordre de profondeur).
import { computed, ref } from 'vue'
import type { CatalogueVariable } from '@/lib/synoptic/engine/types'
import { OPERATEURS_LIBELLES, type OperateurRegle } from '@/lib/synoptic/regles'
import { FLUIDES, DN_TABLE, symbole } from '@/lib/synoptic/iso/lib'
import type { EtatNom } from '@/lib/synoptic/iso/lib'
import { MAX_MESURES, type Habillage, type IsoAccessoire, type IsoComposant, type IsoLiaison, type IsoSection, type NiveauHabillage } from '@/lib/synoptic/iso/format'
import { familleIso, SLOTS_LIAISON, SLOTS_PAR_FAMILLE, type SlotDef } from '@/lib/synoptic/iso/familles'
import { ETATS_STATIQUES, reglerPlan } from '@/lib/synoptic/iso/edition'
import { LIBELLES_ETAT, lireEtat, estLie } from '@/lib/synoptic/iso/etats'

type Sel = { k: 'c' | 'l' | 'a'; id: string }
const props = defineProps<{
  iso: IsoSection
  sel: Sel | null
  catalogue: CatalogueVariable[]
  values: Record<string, number>
  /** liaison d'un accessoire sélectionné : trouvée par le parent */
}>()
const emit = defineEmits<{
  (e: 'change'): void
  (e: 'supprimer'): void
  (e: 'tourner'): void
}>()

const composant = computed<IsoComposant | null>(() =>
  props.sel?.k === 'c' ? (props.iso.composants.find((c) => c.id === props.sel!.id) ?? null) : null,
)
const liaison = computed<IsoLiaison | null>(() =>
  props.sel?.k === 'l' ? (props.iso.liaisons.find((c) => c.id === props.sel!.id) ?? null) : null,
)
const accessoire = computed<IsoAccessoire | null>(() => {
  if (props.sel?.k !== 'a') return null
  for (const L of props.iso.liaisons) {
    const a = (L.accessoires ?? []).find((q) => q.id === props.sel!.id)
    if (a) return a
  }
  return null
})
const objet = computed<IsoComposant | IsoAccessoire | IsoLiaison | null>(
  () => composant.value ?? accessoire.value ?? liaison.value,
)
const type = computed(() => composant.value?.type ?? accessoire.value?.type ?? '')
const nomSymbole = computed(() => {
  if (!type.value) return 'Tuyau'
  try {
    return symbole(type.value).nom
  } catch {
    return type.value
  }
})
const slotsDef = computed<readonly SlotDef[]>(() => {
  if (liaison.value) return SLOTS_LIAISON
  return type.value ? SLOTS_PAR_FAMILLE[familleIso(type.value)] : []
})
const def = computed(() => {
  try {
    return type.value ? symbole(type.value) : null
  } catch {
    return null
  }
})
const familleCuve = computed(() => !!type.value && familleIso(type.value) === 'cuve')
const familleMesure = computed(() => !!type.value && familleIso(type.value) === 'mesure')

const lecture = computed(() => {
  const o = objet.value
  if (!o) return null
  return lireEtat({ type: type.value || 'tuyau', etat: o.etat, valeurs: 'valeurs' in o ? o.valeurs : undefined, slots: o.slots, niveau_max: o.niveau_max, seuils: o.seuils }, props.values)
})

// ── champs
const modifie = () => emit('change')
const nombre = (ev: Event): number => Number((ev.target as HTMLInputElement).value)
function poser<T extends object, K extends keyof T>(o: T, k: K, v: T[K]) {
  o[k] = v
  modifie()
}
function paramsDe(c: IsoComposant | IsoAccessoire): Record<string, unknown> {
  return (c.params ??= {})
}
function poserParam(o: IsoComposant | IsoAccessoire, cle: string, v: unknown) {
  const p = paramsDe(o)
  if (v === '' || v === undefined) delete p[cle]
  else p[cle] = v
  modifie()
}
/** paramètres réglables du symbole : ses valeurs par défaut numériques ou booléennes, sauf celles que portent déjà les ports (dn, fluide) */
const paramsReglables = computed(() => {
  const d = def.value?.defauts ?? {}
  return Object.entries(d)
    .filter(([k, v]) => !['dn', 'fluide', 'sansMarqueur', 'dir', 'variante'].includes(k) && (typeof v === 'number' || typeof v === 'boolean'))
    .map(([k, v]) => ({ cle: k, genre: typeof v === 'boolean' ? 'bool' : 'num', defaut: v }))
})
const variantes = computed(() => (def.value?.variantes ?? []).filter((v) => !v.includes('=')))
const aFluide = computed(() => !!def.value && 'fluide' in (def.value.defauts ?? {}))
const valeurParam = (o: IsoComposant | IsoAccessoire, k: string, dflt: unknown) => o.params?.[k] ?? dflt

// ── variables
const choix = ref<string | null>(null) // nom du slot dont on choisit la variable
const filtre = ref('')
const proposees = computed(() => {
  const f = filtre.value.trim().toLowerCase()
  const liste = props.catalogue
  return (f ? liste.filter((v) => (v.nom + ' ' + v.description).toLowerCase().includes(f)) : liste).slice(0, 200)
})
const defCourante = computed(() => (choix.value?.startsWith('hab:') ? { libelle: 'Variable de l’habillage' } : slotsDef.value.find((s) => s.nom === choix.value)))
function ouvrirChoix(nom: string) {
  filtre.value = ''
  choix.value = nom
}
function choisir(nom: string | null) {
  const o = objet.value
  if (!o || !choix.value) return
  if (choix.value.startsWith('hab:')) return choisirHab(nom)
  const slots = (o.slots ??= {})
  if (nom) slots[choix.value] = { ...(slots[choix.value] ?? {}), variable: nom }
  else delete slots[choix.value]
  if (!Object.keys(slots).length) delete o.slots
  choix.value = null
  modifie()
}
// ── habillage d'information (rien / voyant / mesures / carte)
const NIVEAUX: { id: NiveauHabillage; libelle: string; aide: string }[] = [
  { id: 'rien', libelle: 'Rien', aide: 'Décoratif : aucune variable' },
  { id: 'voyant', libelle: 'Voyant', aide: 'Pastille d’état (défaut / marche)' },
  { id: 'mesures', libelle: 'Mesures', aide: '1 à 4 valeurs dans une étiquette' },
  { id: 'carte', libelle: 'Carte', aide: 'Titre, état, mesures et lien' },
]
const hab = computed<Habillage | undefined>(() => composant.value?.habillage)
function niveauHab(n: NiveauHabillage | null) {
  const c = composant.value
  if (!c) return
  if (n === null) delete c.habillage
  else {
    const h: Habillage = { ...(c.habillage ?? {}), niveau: n }
    if ((n === 'mesures' || n === 'carte') && !h.mesures?.length) h.mesures = [{ slot: {} }]
    c.habillage = h
  }
  modifie()
}
function ajouterMesure() {
  const h = hab.value
  if (!h || (h.mesures?.length ?? 0) >= MAX_MESURES) return
  h.mesures = [...(h.mesures ?? []), { slot: {} }]
  modifie()
}
function retirerMesure(i: number) {
  const h = hab.value
  if (!h?.mesures) return
  h.mesures = h.mesures.filter((_, k) => k !== i)
  modifie()
}
function champMesure(i: number, k: 'libelle' | 'unite', v: string) {
  const m = hab.value?.mesures?.[i]
  if (!m) return
  if (v) m[k] = v
  else delete m[k]
  modifie()
}
function champCarte(k: 'titre' | 'lien', v: string) {
  const h = hab.value
  if (!h) return
  const c = { ...(h.carte ?? {}) }
  if (v.trim()) c[k] = v.trim()
  else delete c[k]
  h.carte = c
  modifie()
}
const varHab = (cle: string): string | undefined => {
  const h = hab.value
  if (cle === 'hab:defaut') return h?.voyant?.defaut?.variable ?? undefined
  if (cle === 'hab:marche') return h?.voyant?.marche?.variable ?? undefined
  return h?.mesures?.[Number(cle.slice(5))]?.slot.variable ?? undefined
}
function choisirHab(nom: string | null) {
  const h = hab.value
  const cle = choix.value
  choix.value = null
  if (!h || !cle) return
  const sl = nom ? { variable: nom } : {}
  if (cle === 'hab:defaut' || cle === 'hab:marche') {
    const v = (h.voyant ??= {})
    if (nom) v[cle === 'hab:defaut' ? 'defaut' : 'marche'] = sl
    else delete v[cle === 'hab:defaut' ? 'defaut' : 'marche']
  } else {
    const m = h.mesures?.[Number(cle.slice(5))]
    if (m) m.slot = sl
  }
  modifie()
}
function poserRegle(slot: string, champ: 'op' | 'val', v: string | number) {
  const o = objet.value
  const sp = o?.slots?.[slot]
  if (!sp) return
  const r = { op: 'eq' as OperateurRegle, val: 1, ...(sp.regle ?? {}) }
  if (champ === 'op') r.op = v as OperateurRegle
  else r.val = Number(v)
  sp.regle = r
  modifie()
}
const valeurLive = (nom: string): string => {
  const v = props.values[nom]
  return v === undefined ? 'pas de valeur' : String(Math.round(v * 100) / 100)
}
const planCourant = computed(() => {
  const p = (objet.value as { plan?: unknown } | null)?.plan
  return p === 'avant' ? 'Premier plan' : p === 'arriere' ? 'Arrière-plan' : 'Automatique'
})
function plan(p: 'avant' | 'arriere' | 'auto') {
  if (!objet.value) return
  reglerPlan(objet.value as { plan?: never }, p)
  modifie()
}
const aVariable = (nom: string) => !!objet.value?.slots?.[nom]?.variable
void estLie
</script>

<template>
  <div class="ed-corps" data-testid="iso-proprietes">
    <div v-if="!objet" class="ed-sec">
      <h4>Vue isométrique</h4>
      <p class="ed-desc">
        Choisissez un équipement dans la palette, cliquez sur la grille pour le poser (aimanté). Reliez deux ports avec
        « Relier » ; un clic sur un tuyau avec une vanne ou un capteur armé le pose dans l'axe.
      </p>
      <p class="ed-desc">{{ iso.composants.length }} équipement(s) · {{ iso.liaisons.length }} tuyau(x)</p>
    </div>
    <template v-else>
      <div class="ed-ph">
        <h3>{{ objet.libelle || nomSymbole }}</h3>
        <button type="button" class="btn" data-testid="iso-supprimer" @click="emit('supprimer')">Supprimer</button>
      </div>
      <div class="ed-sec">
        <p class="ed-desc mono">{{ sel?.id }} · {{ nomSymbole }}</p>
        <label class="ed-champ"><span>Libellé</span>
          <input
class="ed-in" type="text" :value="objet.libelle ?? ''" data-testid="iso-libelle" placeholder="ex. Pompe d'eau brute"
            @change="poser(objet, 'libelle', ($event.target as HTMLInputElement).value || undefined)">
        </label>
        <label v-if="'tag' in objet || accessoire || familleMesure" class="ed-champ"><span>Repère (étiquette)</span>
          <input
class="ed-in" type="text" :value="(objet as IsoAccessoire).tag ?? ''" placeholder="ex. PT1"
            @change="poser(objet as IsoAccessoire, 'tag', ($event.target as HTMLInputElement).value || undefined)">
        </label>
      </div>

      <!-- composant : position, hauteur, rotation -->
      <div v-if="composant" class="ed-sec">
        <h4>Position</h4>
        <div class="ed-btns">
          <label class="ed-champ"><span>X</span>
            <input class="ed-in sm" type="number" step="10" :value="composant.x" data-testid="iso-x" @change="poser(composant, 'x', nombre($event))"></label>
          <label class="ed-champ"><span>Y</span>
            <input class="ed-in sm" type="number" step="10" :value="composant.y" data-testid="iso-y" @change="poser(composant, 'y', nombre($event))"></label>
          <label class="ed-champ"><span>Hauteur (z)</span>
            <input class="ed-in sm" type="number" step="10" :value="composant.z" data-testid="iso-z" @change="poser(composant, 'z', nombre($event))"></label>
        </div>
        <div class="ed-btns">
          <button type="button" class="btn" data-testid="iso-z-plus" @click="poser(composant, 'z', composant.z + 10)">▲ +10</button>
          <button type="button" class="btn" data-testid="iso-z-moins" @click="poser(composant, 'z', composant.z - 10)">▼ −10</button>
          <button type="button" class="btn" data-testid="iso-tourner" @click="emit('tourner')">↻ Quart de tour (R)</button>
        </div>
        <p class="ed-desc">Rotation : {{ composant.rot ?? 0 }}°</p>
      </div>

      <!-- tuyau : DN, fluide, écoulement -->
      <div v-if="liaison" class="ed-sec">
        <h4>Tuyau</h4>
        <label class="ed-champ"><span>DN (diamètre nominal)</span>
          <select class="ed-in" :value="liaison.dn ?? 100" data-testid="iso-dn" @change="poser(liaison, 'dn', nombre($event))">
            <option v-for="d in DN_TABLE" :key="d[0]" :value="d[0]">DN {{ d[0] }}</option>
          </select>
        </label>
        <label class="ed-champ"><span>Fluide</span>
          <select
class="ed-in" :value="liaison.fluide ?? 'eau'" data-testid="iso-fluide"
            @change="poser(liaison, 'fluide', ($event.target as HTMLSelectElement).value as never)">
            <option v-for="f in FLUIDES" :key="f.id" :value="f.id">{{ f.id.replace(/_/g, ' ') }}</option>
          </select>
        </label>
        <label class="ed-champ"><span><input type="checkbox" :checked="!!liaison.calo" @change="poser(liaison, 'calo', ($event.target as HTMLInputElement).checked)"> Calorifugé</span></label>
        <p class="ed-desc">{{ liaison.accessoires?.length ?? 0 }} accessoire(s) sur ce tuyau. Armez une vanne ou un capteur dans la palette puis cliquez sur le tuyau.</p>
      </div>

      <!-- accessoire : position sur le tuyau -->
      <div v-if="accessoire" class="ed-sec">
        <h4>Sur le tuyau</h4>
        <label class="ed-champ"><span>Position le long du tuyau ({{ Math.round((accessoire.s ?? 0) * 100) }} %)</span>
          <input
class="ed-in" type="range" min="3" max="97" :value="Math.round((accessoire.s ?? 0.5) * 100)" data-testid="iso-pos-acc"
            @input="accessoire.d = undefined; poser(accessoire, 's', nombre($event) / 100)">
        </label>
        <p class="ed-desc">L'appareil se cale tout seul dans l'axe du tuyau.</p>
      </div>

      <!-- réglages du symbole -->
      <div v-if="(composant || accessoire) && (paramsReglables.length || variantes.length || aFluide)" class="ed-sec">
        <h4>Réglages</h4>
        <label v-if="variantes.length" class="ed-champ"><span>Variante</span>
          <select class="ed-in" :value="valeurParam(objet as IsoComposant, 'variante', '')" @change="poserParam(objet as IsoComposant, 'variante', ($event.target as HTMLSelectElement).value)">
            <option value="">(par défaut)</option>
            <option v-for="v in variantes" :key="v" :value="v">{{ v }}</option>
          </select>
        </label>
        <label v-if="aFluide" class="ed-champ"><span>Fluide</span>
          <select class="ed-in" :value="valeurParam(objet as IsoComposant, 'fluide', '')" @change="poserParam(objet as IsoComposant, 'fluide', ($event.target as HTMLSelectElement).value)">
            <option value="">(par défaut)</option>
            <option v-for="f in FLUIDES" :key="f.id" :value="f.id">{{ f.id.replace(/_/g, ' ') }}</option>
          </select>
        </label>
        <label v-for="p in paramsReglables" :key="p.cle" class="ed-champ">
          <span>{{ p.cle }}</span>
          <input
v-if="p.genre === 'num'" class="ed-in sm" type="number" :value="valeurParam(objet as IsoComposant, p.cle, p.defaut)"
            @change="poserParam(objet as IsoComposant, p.cle, nombre($event))">
          <input
v-else type="checkbox" :checked="!!valeurParam(objet as IsoComposant, p.cle, p.defaut)"
            @change="poserParam(objet as IsoComposant, p.cle, ($event.target as HTMLInputElement).checked)">
        </label>
      </div>

      <!-- état -->
      <div class="ed-sec">
        <h4>État</h4>
        <label class="ed-champ"><span>État fixe (sans variable reliée)</span>
          <select class="ed-in" :value="objet.etat ?? 'arret'" data-testid="iso-etat" @change="poser(objet, 'etat', ($event.target as HTMLSelectElement).value as EtatNom)">
            <option v-for="e in ETATS_STATIQUES" :key="e" :value="e">{{ LIBELLES_ETAT[e] }}</option>
          </select>
        </label>
        <p v-if="lecture" class="ed-desc" data-testid="iso-etat-lu">
          Affiché : <b>{{ LIBELLES_ETAT[lecture.etat] }}</b>{{ lecture.lie ? ' (lu sur la box)' : ' (état fixe)' }}
        </p>
        <template v-if="familleCuve">
          <label class="ed-champ"><span>Niveau plein (unité de la variable de niveau)</span>
            <input class="ed-in sm" type="number" :value="objet.niveau_max ?? 100" @change="poser(objet, 'niveau_max', nombre($event))"></label>
        </template>
        <template v-if="familleMesure">
          <div class="ed-btns">
            <label class="ed-champ"><span>Seuil haut</span>
              <input class="ed-in sm" type="number" :value="objet.seuils?.haut ?? ''" @change="objet.seuils = { ...objet.seuils, haut: ($event.target as HTMLInputElement).value === '' ? undefined : nombre($event) }; modifie()"></label>
            <label class="ed-champ"><span>Seuil bas</span>
              <input class="ed-in sm" type="number" :value="objet.seuils?.bas ?? ''" @change="objet.seuils = { ...objet.seuils, bas: ($event.target as HTMLInputElement).value === '' ? undefined : nombre($event) }; modifie()"></label>
          </div>
        </template>
      </div>

      <!-- variables -->
      <div class="ed-sec" data-testid="iso-variables">
        <h4>Variables reliées</h4>
        <div v-for="s in slotsDef" :key="s.nom" class="ed-slot" :data-testid="`iso-slot-${s.nom}`">
          <div class="ed-slot-h"><b>{{ s.libelle }}</b></div>
          <button type="button" class="ed-var" :class="{ vide: !aVariable(s.nom) }" :data-testid="`iso-var-${s.nom}`" @click="ouvrirChoix(s.nom)">
            {{ objet.slots?.[s.nom]?.variable || 'Relier une variable…' }}
          </button>
          <template v-if="aVariable(s.nom)">
            <small class="ed-desc">Valeur : {{ valeurLive(objet.slots![s.nom].variable!) }}</small>
            <div v-if="s.etat" class="ed-btns">
              <span class="ed-desc">actif si valeur</span>
              <select class="ed-in sm" :value="objet.slots![s.nom].regle?.op ?? 'eq'" @change="poserRegle(s.nom, 'op', ($event.target as HTMLSelectElement).value)">
                <option v-for="(l, op) in OPERATEURS_LIBELLES" :key="op" :value="op">{{ l }}</option>
              </select>
              <input class="ed-in sm" type="number" :value="objet.slots![s.nom].regle?.val ?? 1" @change="poserRegle(s.nom, 'val', nombre($event))">
            </div>
          </template>
        </div>
      </div>

      <!-- habillage d'information -->
      <div v-if="composant" class="ed-sec" data-testid="iso-habillage">
        <h4>Affichage des données</h4>
        <div class="ed-btns" role="group" aria-label="Niveau d’affichage">
          <button
            v-for="n in NIVEAUX" :key="n.id" type="button" class="btn" :class="{ on: hab?.niveau === n.id }" :aria-pressed="hab?.niveau === n.id" :title="n.aide"
            :data-testid="`iso-habillage-${n.id}`" @click="niveauHab(n.id)"
          >{{ n.libelle }}</button>
        </div>
        <p v-if="!hab" class="ed-desc">Réglage d’origine : la valeur reliée s’affiche en étiquette.</p>
        <button v-else type="button" class="btn" data-testid="iso-habillage-origine" @click="niveauHab(null)">Revenir au réglage d’origine</button>
        <template v-if="hab && (hab.niveau === 'voyant' || hab.niveau === 'carte' || hab.niveau === 'mesures')">
          <div v-for="v in [{ k: 'hab:defaut', l: 'Variable de défaut' }, { k: 'hab:marche', l: 'Variable de marche' }]" :key="v.k" class="ed-slot">
            <div class="ed-slot-h"><b>{{ v.l }}</b></div>
            <button type="button" class="ed-var" :class="{ vide: !varHab(v.k) }" :data-testid="`iso-${v.k.replace(':', '-')}`" @click="ouvrirChoix(v.k)">{{ varHab(v.k) || 'Relier une variable…' }}</button>
          </div>
        </template>
        <template v-if="hab && (hab.niveau === 'mesures' || hab.niveau === 'carte')">
          <div v-for="(m, i) in hab.mesures ?? []" :key="i" class="ed-slot" :data-testid="`iso-mesure-${i}`">
            <div class="ed-slot-h"><b>Mesure {{ i + 1 }}</b><button type="button" class="btn" :aria-label="`Retirer la mesure ${i + 1}`" @click="retirerMesure(i)">×</button></div>
            <button type="button" class="ed-var" :class="{ vide: !m.slot.variable }" :data-testid="`iso-hab-m${i}`" @click="ouvrirChoix(`hab:${i}`)">{{ m.slot.variable || 'Relier une variable…' }}</button>
            <div class="ed-btns">
              <input class="ed-in sm" type="text" placeholder="Libellé" :value="m.libelle ?? ''" @change="champMesure(i, 'libelle', ($event.target as HTMLInputElement).value)">
              <input class="ed-in sm" type="text" placeholder="Unité" :value="m.unite ?? ''" @change="champMesure(i, 'unite', ($event.target as HTMLInputElement).value)">
            </div>
          </div>
          <button v-if="(hab.mesures?.length ?? 0) < MAX_MESURES" type="button" class="btn" data-testid="iso-hab-ajouter" @click="ajouterMesure">+ Ajouter une mesure ({{ hab.mesures?.length ?? 0 }}/{{ MAX_MESURES }})</button>
        </template>
        <template v-if="hab && hab.niveau === 'carte'">
          <label class="ed-champ"><span>Titre de la carte</span>
            <input class="ed-in" type="text" :value="hab.carte?.titre ?? ''" data-testid="iso-carte-titre" @change="champCarte('titre', ($event.target as HTMLInputElement).value)"></label>
          <label class="ed-champ"><span>Ouvre le synoptique (identifiant)</span>
            <input class="ed-in" type="text" :value="hab.carte?.lien ?? ''" data-testid="iso-carte-lien" placeholder="collez l’identifiant du synoptique" @change="champCarte('lien', ($event.target as HTMLInputElement).value)"></label>
        </template>
      </div>

      <!-- profondeur -->
      <div class="ed-sec">
        <h4>Ordre de profondeur</h4>
        <p class="ed-desc">Automatique par défaut — {{ planCourant }}.</p>
        <div class="ed-btns">
          <button type="button" class="btn" data-testid="iso-premier-plan" @click="plan('avant')">⇧ Premier plan</button>
          <button type="button" class="btn" data-testid="iso-arriere-plan" @click="plan('arriere')">⇩ Arrière-plan</button>
          <button type="button" class="btn" @click="plan('auto')">Auto</button>
        </div>
      </div>
    </template>

    <!-- sélecteur de variable -->
    <div v-if="choix" class="ed-popup" style="right: 370px; top: 110px" role="dialog" aria-label="Choisir une variable" data-testid="iso-choix-variable">
      <div class="ed-pop-h"><b>{{ defCourante?.libelle }}</b>
        <button type="button" class="btn" @click="choix = null">Fermer</button></div>
      <input v-model="filtre" class="ed-in" type="search" placeholder="Filtrer (nom, description)" data-testid="iso-filtre-variable" autofocus>
      <div class="ed-liste">
        <div v-for="v in proposees" :key="v.nom" class="ed-opt" :class="{ courant: objet?.slots?.[choix]?.variable === v.nom }" :data-testid="`iso-opt-${v.nom}`" @click="choisir(v.nom)">
          <b>{{ v.nom }}</b><small>{{ v.description }}{{ v.unite ? ' · ' + v.unite : '' }}</small>
        </div>
        <div v-if="!proposees.length" class="ed-opt">Aucune variable</div>
      </div>
      <div class="ed-pop-f"><button type="button" class="btn" @click="choisir(null)">Retirer la variable</button></div>
    </div>
  </div>
</template>

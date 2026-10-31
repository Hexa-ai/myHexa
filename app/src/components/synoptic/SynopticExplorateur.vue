<script setup lang="ts">
// Explorateur de la bibliothèque de symboles : grand dialogue (≈ 80 % de l'écran) ouvert par « Tout voir… » du Spotlight,
// par le bouton « Bibliothèque » des palettes ou par Ctrl+Maj+K. Arbre des familles à gauche, grille de vignettes au centre,
// détail (aperçu, états, variantes, mots-clés) à droite. Le composant cherche, montre et prévient (`poser`, `bibliotheques`) ;
// la pose reste à l'éditeur. Entièrement utilisable au clavier.
import { computed, nextTick, ref, watch } from 'vue'
import type { Entree, Contexte } from '@/lib/synoptic/recherche'
import { basculerFavori, lireFavoris, lireRecents, noterRecent } from '@/lib/synoptic/recherche/preferences'
import { catalogue as catalogueIso } from '@/lib/synoptic/iso/lib'
import { vignetteComposition, vignetteIso } from '@/lib/synoptic/vignette'
import {
  BIBLIOTHEQUE_EXEMPLE, enregistrerBibliotheque, estSymboleBibliotheque, exporterBibliotheque, importerBibliotheque, retirerBibliotheque,
  trouverSymbole, type Bibliotheque,
} from '@/lib/synoptic/bibliotheque'
import {
  LIBELLE_ETAT, NOEUD_BIBLIO, NOEUD_FAMILLES, NOEUD_FAVORIS, NOEUD_RECENTS, NOEUD_TOUT, aplatir, construireArbre, etatsDe, motsClesAffiches,
  noeudBiblio, selonNoeud, symbolesVisibles, variantesDe, type Filtre, type Noeud, type NoeudId,
} from '@/lib/synoptic/explorateur'
import ExplorateurVignette from './ExplorateurVignette.vue'

const props = defineProps<{
  contexte: Contexte
  /** tous les symboles connus (iso, 2D, bibliothèques importées) */
  symboles: Entree[]
  /** bibliothèques importées (pour l'arbre et l'aperçu des compositions) */
  bibliotheques: Bibliotheque[]
  /** contenu SVG 24×24 d'un symbole 2D de la palette */
  icone2d?: (cle: string) => string
  /** Q7 : où poser la fenêtre (la zone en plein écran, sinon <body>) */
  zoneCible?: string | HTMLElement
}>()
const emit = defineEmits<{
  (e: 'poser', entree: Entree): void
  /** liste à jour après un import ou un retrait */
  (e: 'bibliotheques', liste: Bibliotheque[]): void
}>()

const ouvert = ref(false)
const q = ref('')
const filtre = ref<Filtre>('tout')
const noeud = ref<NoeudId>(NOEUD_TOUT)
const ouverts = ref<Set<string>>(new Set([NOEUD_FAMILLES]))
const favoris = ref<string[]>([])
const recents = ref<string[]>([])
const selCle = ref('')
const survolCle = ref('')
const etatChoisi = ref('')
const params = ref<Record<string, string | number>>({})
const retour = ref<{ ok: boolean; textes: string[] } | null>(null)

const champ = ref<HTMLInputElement | null>(null)
const dialogue = ref<HTMLElement | null>(null)
const grille = ref<HTMLElement | null>(null)
const arbreEl = ref<HTMLElement | null>(null)
const fichier = ref<HTMLInputElement | null>(null)
let avant: HTMLElement | null = null

const typeConnu = (base: string): boolean => catalogueIso().some((d) => d.id === base)
const defDe = (id: string) => catalogueIso().find((d) => d.id === id)

const options = computed(() => ({ filtre: filtre.value, requete: q.value, favoris: favoris.value, recents: recents.value, contexte: props.contexte }))
const visibles = computed(() => symbolesVisibles(props.symboles, options.value))
const arbre = computed<Noeud[]>(() => construireArbre(visibles.value, options.value, props.bibliotheques.map((b) => ({ id: b.id, nom: b.nom }))))
const liste = computed<Entree[]>(() => selonNoeud(visibles.value, noeud.value, options.value, !!q.value.trim()))
const lignesArbre = computed(() => aplatir(arbre.value, ouverts.value))
const titreNoeud = computed(() => lignesArbre.value.find((n) => n.id === noeud.value)?.libelle ?? 'Tout')

const actuelle = computed<Entree | null>(() => liste.value.find((e) => e.cle === selCle.value) ?? liste.value[0] ?? null)
const cible = computed<Entree | null>(() => (survolCle.value ? (liste.value.find((e) => e.cle === survolCle.value) ?? actuelle.value) : actuelle.value))

const defCible = computed(() => (cible.value && cible.value.contexte === 'iso' && !estSymboleBibliotheque(cible.value.id) ? defDe(cible.value.id) : undefined))
const etats = computed(() => etatsDe(defCible.value))
const etatCourant = computed(() => etats.value.find((e) => e.etat === etatChoisi.value) ?? etats.value[0])
const variantes = computed(() => variantesDe(defCible.value))
const motsCles = computed(() => (cible.value ? motsClesAffiches(cible.value) : []))
const symboleLib = computed(() => (cible.value && estSymboleBibliotheque(cible.value.id) ? trouverSymbole(props.bibliotheques, cible.value.id) : null))
const estFavori = (e: Entree | null): boolean => !!e && favoris.value.includes(e.cle)

watch(cible, () => {
  // un autre symbole : on repart de son état et de ses variantes par défaut
  etatChoisi.value = ''
  params.value = {}
})
watch([q, filtre, noeud], () => {
  survolCle.value = ''
  if (!liste.value.some((e) => e.cle === selCle.value)) selCle.value = liste.value[0]?.cle ?? ''
})

function apercu(e: Entree, grand = false): string {
  if (e.contexte === '2d') return props.icone2d?.(e.id) ?? ''
  if (estSymboleBibliotheque(e.id)) {
    const s = trouverSymbole(props.bibliotheques, e.id)
    return s ? vignetteComposition(e.id, s.parties) : ''
  }
  // l'aperçu en grand suit l'état et les variantes choisis ; les vignettes de la grille montrent l'état de base
  return grand && e === cible.value ? vignetteIso(e.id, etatCourant.value?.etat ?? 'arret', params.value, etatCourant.value?.valeurs ?? {}) : vignetteIso(e.id)
}
const apercuGrand = computed(() => (cible.value ? apercu(cible.value, true) : ''))
const valeurVariante = (cle: string): string | number | undefined => params.value[cle] ?? (defCible.value?.defauts?.[cle] as string | number | undefined)
function choisirVariante(cle: string, v: string | number) {
  params.value = { ...params.value, [cle]: v }
}

// ───────────── ouverture / fermeture
function ouvrir(o: { requete?: string } = {}) {
  avant = (document.activeElement as HTMLElement | null) ?? null
  favoris.value = lireFavoris()
  recents.value = lireRecents()
  q.value = o.requete ?? ''
  filtre.value = 'tout'
  noeud.value = NOEUD_TOUT
  retour.value = null
  survolCle.value = ''
  selCle.value = liste.value[0]?.cle ?? ''
  ouvert.value = true
  void nextTick(() => champ.value?.focus())
}
function fermer() {
  if (!ouvert.value) return
  ouvert.value = false
  void nextTick(() => avant?.isConnected && avant.focus?.())
}
defineExpose({ ouvrir, fermer, basculer: () => (ouvert.value ? fermer() : ouvrir()), ouvert })

// ───────────── actions
function poser(e: Entree | null) {
  if (!e) return
  noterRecent(e.cle)
  fermer()
  emit('poser', e)
}
function etoile(e: Entree | null) {
  if (e) favoris.value = basculerFavori(e.cle)
}
function glisser(ev: DragEvent, e: Entree) {
  if (e.contexte !== 'iso' || props.contexte !== 'iso') return ev.preventDefault()
  ev.dataTransfer?.setData('text/plain', e.id)
  noterRecent(e.cle)
  // le dialogue se retire pour laisser le canevas recevoir le dépôt
  window.setTimeout(fermer, 0)
}
const glissable = (e: Entree): boolean => e.contexte === 'iso' && props.contexte === 'iso'

function telecharger(nom: string, texte: string) {
  const url = URL.createObjectURL(new Blob([texte], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = nom
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
async function importer(ev: Event) {
  const f = (ev.target as HTMLInputElement).files?.[0]
  ;(ev.target as HTMLInputElement).value = ''
  if (!f) return
  const texte = await f.text()
  const r = importerBibliotheque(texte, typeConnu)
  if (!r.ok || !r.bibliotheque) {
    retour.value = { ok: false, textes: [`« ${f.name} » n’est pas une bibliothèque valide :`, ...r.erreurs.slice(0, 6)] }
    return
  }
  const l = enregistrerBibliotheque(r.bibliotheque, typeConnu)
  emit('bibliotheques', l)
  ouverts.value = new Set([...ouverts.value, NOEUD_BIBLIO])
  q.value = ''
  filtre.value = 'tout'
  noeud.value = noeudBiblio(r.bibliotheque.id)
  retour.value = { ok: true, textes: [`Bibliothèque « ${r.bibliotheque.nom} » importée : ${r.bibliotheque.symboles.length} symbole${r.bibliotheque.symboles.length > 1 ? 's' : ''}.`] }
}
const biblioCourante = computed(() => (noeud.value.startsWith('lib:') ? (props.bibliotheques.find((b) => b.id === noeud.value.slice(4)) ?? null) : null))
function exporter() {
  const b = biblioCourante.value
  if (b) telecharger(`${b.id}.json`, exporterBibliotheque(b))
}
function retirer() {
  const b = biblioCourante.value
  if (!b) return
  emit('bibliotheques', retirerBibliotheque(b.id, typeConnu))
  noeud.value = NOEUD_BIBLIO
  retour.value = { ok: true, textes: [`Bibliothèque « ${b.nom} » retirée.`] }
}

// ───────────── clavier
function colonnes(): number {
  const g = grille.value
  if (!g) return 1
  return Math.max(1, getComputedStyle(g).gridTemplateColumns.split(' ').filter(Boolean).length)
}
function focaliser(cle: string) {
  selCle.value = cle
  void nextTick(() => {
    const el = grille.value?.querySelector<HTMLElement>(`[data-cle="${CSS.escape(cle)}"]`)
    el?.focus()
    el?.scrollIntoView({ block: 'nearest' })
  })
}
function cleGrille(ev: KeyboardEvent) {
  const l = liste.value
  if (!l.length) return
  const i = Math.max(0, l.findIndex((e) => e.cle === actuelle.value?.cle))
  const n = colonnes()
  const aller = (j: number) => { ev.preventDefault(); focaliser(l[Math.max(0, Math.min(l.length - 1, j))].cle) }
  if (ev.key === 'ArrowRight') aller(i + 1)
  else if (ev.key === 'ArrowLeft') aller(i - 1)
  else if (ev.key === 'ArrowDown') aller(i + n)
  else if (ev.key === 'ArrowUp') {
    if (i - n < 0) { ev.preventDefault(); champ.value?.focus() } else aller(i - n)
  }
  else if (ev.key === 'Home') aller(0)
  else if (ev.key === 'End') aller(l.length - 1)
  else if (ev.key === 'PageDown') aller(i + n * 3)
  else if (ev.key === 'PageUp') aller(i - n * 3)
  else if (ev.key === 'Enter') { ev.preventDefault(); poser(l[i]) }
  else if ((ev.key === 'f' || ev.key === 'F') && !ev.ctrlKey && !ev.metaKey && !ev.altKey) { ev.preventDefault(); etoile(l[i]) }
}
function cleChamp(ev: KeyboardEvent) {
  if (ev.key === 'ArrowDown') { ev.preventDefault(); if (actuelle.value) focaliser(actuelle.value.cle) }
  else if (ev.key === 'Enter') { ev.preventDefault(); poser(actuelle.value) }
}
function cleArbre(ev: KeyboardEvent) {
  const l = lignesArbre.value
  const i = Math.max(0, l.findIndex((n) => n.id === noeud.value))
  const aller = (j: number) => {
    ev.preventDefault()
    const n = l[Math.max(0, Math.min(l.length - 1, j))]
    if (!n) return
    noeud.value = n.id
    void nextTick(() => arbreEl.value?.querySelector<HTMLElement>(`[data-noeud="${CSS.escape(n.id)}"]`)?.focus())
  }
  const n = l[i]
  if (ev.key === 'ArrowDown') aller(i + 1)
  else if (ev.key === 'ArrowUp') aller(i - 1)
  else if (ev.key === 'Home') aller(0)
  else if (ev.key === 'End') aller(l.length - 1)
  else if (ev.key === 'ArrowRight') {
    if (n?.enfants && !ouverts.value.has(n.id)) { ev.preventDefault(); ouverts.value = new Set([...ouverts.value, n.id]) }
    else if (n?.enfants) aller(i + 1)
    else { ev.preventDefault(); if (actuelle.value) focaliser(actuelle.value.cle) }
  } else if (ev.key === 'ArrowLeft') {
    if (n?.enfants && ouverts.value.has(n.id)) { ev.preventDefault(); const s = new Set(ouverts.value); s.delete(n.id); ouverts.value = s }
  } else if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); if (actuelle.value) focaliser(actuelle.value.cle) }
}
function basculerNoeud(n: Noeud) {
  noeud.value = n.id
}
function plier(n: Noeud) {
  const s = new Set(ouverts.value)
  if (s.has(n.id)) s.delete(n.id)
  else s.add(n.id)
  ouverts.value = s
}

const SELECTEUR_FOCUS = 'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
/** Échap ferme ; Tab reste dans le dialogue */
function cleDialogue(ev: KeyboardEvent) {
  if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); fermer(); return }
  if (ev.key !== 'Tab' || !dialogue.value) return
  const f = [...dialogue.value.querySelectorAll<HTMLElement>(SELECTEUR_FOCUS)].filter((x) => x.offsetParent !== null)
  if (!f.length) return
  const premier = f[0], dernier = f[f.length - 1]
  if (ev.shiftKey && document.activeElement === premier) { ev.preventDefault(); dernier.focus() }
  else if (!ev.shiftKey && document.activeElement === dernier) { ev.preventDefault(); premier.focus() }
}

const sous = (e: Entree): string => `${e.famille}${e.contexte === 'iso' ? ' · iso' : ' · 2D'}`
const nbTexte = (n: number): string => `${n} symbole${n > 1 ? 's' : ''}`
const modeleJson = (): void => telecharger('modele-bibliotheque.json', exporterBibliotheque(BIBLIOTHEQUE_EXEMPLE))
</script>

<template>
  <Teleport :to="zoneCible ?? 'body'">
    <div v-if="ouvert" class="expl-fond" data-testid="explorateur" @mousedown.self="fermer">
      <div ref="dialogue" class="expl" role="dialog" aria-modal="true" aria-label="Bibliothèque de symboles" @keydown="cleDialogue">
        <header class="expl-tete">
          <svg viewBox="0 0 24 24" class="expl-loupe" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l5 5" /></svg>
          <input
            ref="champ" v-model="q" class="expl-champ" type="text" autocomplete="off" spellcheck="false" data-testid="explorateur-champ"
            placeholder="Chercher un symbole : conteneur, pump, transfo, armoire…" aria-label="Rechercher dans la bibliothèque" @keydown="cleChamp"
          >
          <div class="expl-filtre" role="group" aria-label="Type de symboles">
            <button v-for="o in ([['2d', '2D'], ['iso', 'Iso'], ['tout', 'Tout']] as const)" :key="o[0]" type="button" :aria-pressed="filtre === o[0]" :data-testid="`explorateur-filtre-${o[0]}`" @click="filtre = o[0]">{{ o[1] }}</button>
          </div>
          <button type="button" class="expl-btn" data-testid="explorateur-importer" title="Importer une bibliothèque (JSON)" @click="fichier?.click()">Importer…</button>
          <input ref="fichier" type="file" accept="application/json,.json" hidden data-testid="explorateur-fichier" @change="importer">
          <button type="button" class="expl-fermer" aria-label="Fermer l’explorateur" data-testid="explorateur-fermer" @click="fermer">✕</button>
        </header>

        <nav ref="arbreEl" class="expl-arbre" role="tree" aria-label="Familles" @keydown="cleArbre">
          <template v-for="n in arbre" :key="n.id">
            <div class="expl-noeud" :class="{ on: noeud === n.id, parent: !!n.enfants }">
              <button
                v-if="n.enfants" type="button" class="expl-plie" :aria-label="ouverts.has(n.id) ? `Replier ${n.libelle}` : `Déplier ${n.libelle}`" tabindex="-1"
                @click="plier(n)"
              >{{ ouverts.has(n.id) ? '▾' : '▸' }}</button>
              <span v-else class="expl-plie" />
              <button
                type="button" role="treeitem" class="expl-noeud-btn" :data-noeud="n.id" :data-testid="`explorateur-noeud-${n.id}`" :aria-selected="noeud === n.id"
                :aria-expanded="n.enfants ? ouverts.has(n.id) : undefined" :tabindex="noeud === n.id ? 0 : -1" @click="basculerNoeud(n)"
              >
                <span class="expl-noeud-nom">{{ n.id === NOEUD_FAVORIS ? '★ ' : '' }}{{ n.libelle }}</span><span class="expl-nb">{{ n.nombre }}</span>
              </button>
            </div>
            <template v-if="n.enfants && ouverts.has(n.id)">
              <div v-for="c in n.enfants" :key="c.id" class="expl-noeud enfant" :class="{ on: noeud === c.id }">
                <span class="expl-plie" />
                <button
                  type="button" role="treeitem" class="expl-noeud-btn" :data-noeud="c.id" :data-testid="`explorateur-noeud-${c.id}`" :aria-selected="noeud === c.id"
                  :tabindex="noeud === c.id ? 0 : -1" @click="basculerNoeud(c)"
                ><span class="expl-noeud-nom">{{ c.libelle }}</span><span class="expl-nb">{{ c.nombre }}</span></button>
              </div>
              <p v-if="n.id === NOEUD_BIBLIO && !n.enfants.length" class="expl-aide">Aucune bibliothèque importée. Utilisez « Importer… » (fichier JSON).</p>
            </template>
          </template>
        </nav>

        <main class="expl-centre">
          <div class="expl-bandeau">
            <h2 class="expl-titre" data-testid="explorateur-titre">{{ titreNoeud }}</h2>
            <span class="expl-compte" data-testid="explorateur-compte">{{ nbTexte(liste.length) }}</span>
            <span class="expl-sp" />
            <template v-if="biblioCourante">
              <button type="button" class="expl-btn" data-testid="explorateur-exporter" @click="exporter">Exporter (JSON)</button>
              <button type="button" class="expl-btn danger" data-testid="explorateur-retirer" @click="retirer">Retirer</button>
            </template>
          </div>
          <div v-if="retour" class="expl-retour" :class="{ ko: !retour.ok }" :role="retour.ok ? 'status' : 'alert'" data-testid="explorateur-retour">
            <p v-for="(t, i) in retour.textes" :key="i">{{ t }}</p>
          </div>
          <div v-if="!liste.length" class="expl-vide" data-testid="explorateur-vide">
            <template v-if="q">Aucun symbole ne correspond à « {{ q }} ».</template>
            <template v-else-if="noeud === NOEUD_FAVORIS">Aucun favori. Cliquez sur ☆ (ou touche F) pour en ajouter.</template>
            <template v-else-if="noeud === NOEUD_RECENTS">Aucun symbole posé récemment.</template>
            <template v-else-if="noeud.startsWith('lib')">
              Aucun symbole dans cette bibliothèque. Une bibliothèque est un fichier JSON qui compose des symboles existants.
              <button type="button" class="expl-lien" @click="modeleJson">Télécharger un modèle</button>
            </template>
            <template v-else>Rien à afficher avec ce filtre.</template>
          </div>
          <div v-else ref="grille" class="expl-grille" role="listbox" aria-label="Symboles" data-testid="explorateur-grille" @keydown="cleGrille">
            <div
              v-for="e in liste" :key="e.cle" class="expl-case" :class="{ on: actuelle?.cle === e.cle }" role="option" :aria-selected="actuelle?.cle === e.cle"
              :tabindex="actuelle?.cle === e.cle ? 0 : -1" :data-cle="e.cle" :data-testid="`explorateur-cell-${e.id}`" :draggable="glissable(e)"
              @click="selCle = e.cle" @dblclick="poser(e)" @mouseenter="survolCle = e.cle" @focus="selCle = e.cle" @dragstart="glisser($event, e)"
            >
              <button
                type="button" class="expl-etoile" :class="{ on: estFavori(e) }" :aria-pressed="estFavori(e)" tabindex="-1"
                :aria-label="estFavori(e) ? `Retirer ${e.nom} des favoris` : `Ajouter ${e.nom} aux favoris`" :data-testid="`explorateur-etoile-${e.id}`"
                @click.stop="etoile(e)" @mousedown.stop @dblclick.stop
              >{{ estFavori(e) ? '★' : '☆' }}</button>
              <span class="expl-img"><ExplorateurVignette :fabrique="() => apercu(e)" :pictogramme="e.contexte === '2d'" /></span>
              <span class="expl-nom">{{ e.nom }}</span>
              <span class="expl-fam">{{ sous(e) }}</span>
            </div>
          </div>
        </main>

        <aside class="expl-detail" aria-label="Détail du symbole" data-testid="explorateur-detail">
          <template v-if="cible">
            <div class="expl-grand" :class="{ picto: cible.contexte === '2d' }" data-testid="explorateur-apercu">
              <svg v-if="cible.contexte === '2d'" viewBox="0 0 24 24" v-html="apercuGrand" />
              <span v-else-if="apercuGrand" class="expl-grand-iso" v-html="apercuGrand" />
              <span v-else class="expl-sans">Aperçu indisponible</span>
            </div>
            <h3 class="expl-d-nom" data-testid="explorateur-d-nom">{{ cible.nom }}</h3>
            <p class="expl-d-fam">{{ sous(cible) }}</p>
            <p class="expl-d-id">{{ cible.id }}</p>

            <section v-if="cible.contexte === 'iso' && !symboleLib" aria-label="États">
              <h4>États</h4>
              <div class="expl-puces" role="group" aria-label="État du symbole">
                <button
                  v-for="s in etats" :key="s.etat" type="button" :aria-pressed="etatCourant?.etat === s.etat" :data-testid="`explorateur-etat-${s.etat}`"
                  @click="etatChoisi = s.etat"
                >{{ LIBELLE_ETAT[s.etat] ?? s.etat }}</button>
              </div>
            </section>
            <section v-for="v in variantes" :key="v.cle" :aria-label="`Variante ${v.cle}`">
              <h4>{{ v.cle }}</h4>
              <div class="expl-puces" role="group" :aria-label="`Variante ${v.cle}`">
                <button
                  v-for="x in v.valeurs" :key="String(x)" type="button" :aria-pressed="String(valeurVariante(v.cle)) === String(x)"
                  :data-testid="`explorateur-var-${v.cle}-${x}`" @click="choisirVariante(v.cle, x)"
                >{{ x }}</button>
              </div>
            </section>
            <section v-if="symboleLib" aria-label="Composition">
              <h4>Composition</h4>
              <p class="expl-d-id">{{ symboleLib.parties.map((p) => p.base).join(' + ') }}</p>
            </section>
            <section v-if="cible.contexte === '2d'" aria-label="À savoir">
              <p class="expl-aide">Symbole 2D : ses états se règlent dans le panneau de propriétés, une fois posé.</p>
            </section>
            <section v-if="motsCles.length" aria-label="Mots-clés">
              <h4>Mots-clés</h4>
              <ul class="expl-mots" data-testid="explorateur-mots"><li v-for="m in motsCles" :key="m">{{ m }}</li></ul>
            </section>
            <div class="expl-actions">
              <button
                type="button" class="expl-btn" :class="{ actif: estFavori(cible) }" :aria-pressed="estFavori(cible)" data-testid="explorateur-favori" @click="etoile(cible)"
              >{{ estFavori(cible) ? '★ Favori' : '☆ Ajouter aux favoris' }}</button>
              <button type="button" class="expl-btn primaire" data-testid="explorateur-poser" @click="poser(cible)">Poser ↵</button>
            </div>
          </template>
          <p v-else class="expl-aide">Sélectionnez un symbole pour voir son aperçu.</p>
        </aside>

        <footer class="expl-pied">
          <span><kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> naviguer</span><span><kbd>↵</kbd> poser</span><span><kbd>F</kbd> favori</span>
          <span><kbd>Tab</kbd> zone suivante</span><span><kbd>Échap</kbd> fermer</span>
          <span class="expl-sp" /><span v-if="props.contexte === 'iso'">Glissez une vignette vers le dessin pour la poser.</span>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style>
.expl-fond { position: fixed; inset: 0; z-index: 5100; background: color-mix(in oklab, #000 45%, transparent); display: flex; align-items: center; justify-content: center; }
.expl {
  width: min(1500px, max(80vw, 960px), calc(100vw - 16px)); height: min(max(80vh, 560px), calc(100vh - 16px));
  display: grid; grid-template-columns: 224px minmax(0, 1fr) 320px; grid-template-rows: auto minmax(0, 1fr) auto;
  grid-template-areas: 'tete tete tete' 'arbre centre detail' 'pied pied pied';
  border: 1px solid var(--border, #444); border-radius: 14px; background: var(--card, #fff); color: var(--foreground, #111);
  box-shadow: 0 28px 80px rgba(0, 0, 0, .45); overflow: hidden; font-size: 13px;
}
.expl button { font: inherit; color: inherit; cursor: pointer; }
.expl :focus-visible { outline: 2px solid var(--signal, #1e88e5); outline-offset: 1px; }
.expl-tete { grid-area: tete; display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-bottom: 1px solid var(--border, #ddd); }
.expl-loupe { width: 18px; height: 18px; flex: none; fill: none; stroke: currentColor; stroke-width: 2; opacity: .6; }
.expl-champ { flex: 1; min-width: 0; border: 0; outline: 0 !important; background: transparent; font-size: 16px; color: inherit; }
.expl-filtre { display: flex; border: 1px solid var(--border, #ccc); border-radius: 7px; padding: 2px; }
.expl-filtre button { font-size: 12px; padding: 3px 11px; border-radius: 5px; opacity: .7; }
.expl-filtre button[aria-pressed='true'] { background: color-mix(in oklab, var(--signal, #1e88e5) 20%, transparent); opacity: 1; }
.expl-btn { font-size: 12px; padding: 5px 12px; border-radius: 7px; border: 1px solid var(--border, #bbb); background: transparent; }
.expl-btn:hover { background: color-mix(in oklab, var(--muted, #888) 14%, transparent); }
.expl-btn.primaire { background: var(--signal, #1e88e5); border-color: var(--signal, #1e88e5); color: #fff; font-weight: 600; }
.expl-btn.primaire:hover { filter: brightness(1.08); background: var(--signal, #1e88e5); }
.expl-btn.actif { color: #c98a00; border-color: #c98a00; }
.expl-btn.danger:hover { color: #d33; border-color: #d33; }
.expl-fermer { width: 28px; height: 28px; border-radius: 7px; border: 0; background: transparent; opacity: .7; }
.expl-fermer:hover { opacity: 1; background: color-mix(in oklab, var(--muted, #888) 18%, transparent); }

.expl-arbre { grid-area: arbre; overflow-y: auto; padding: 8px 6px; border-right: 1px solid var(--border, #ddd); background: color-mix(in oklab, var(--muted, #888) 6%, transparent); }
.expl-noeud { display: flex; align-items: center; border-radius: 7px; }
.expl-noeud.enfant { padding-left: 14px; }
.expl-noeud.on { background: color-mix(in oklab, var(--signal, #1e88e5) 16%, transparent); }
.expl-plie { width: 18px; flex: none; text-align: center; font-size: 11px; opacity: .6; background: transparent; border: 0; padding: 0; }
.expl-noeud-btn { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; text-align: left; padding: 5px 8px 5px 2px; border: 0; background: transparent; }
.expl-noeud-nom { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.expl-noeud.parent .expl-noeud-nom { font-weight: 600; }
.expl-nb { font-size: 11px; opacity: .6; font-variant-numeric: tabular-nums; }
.expl-aide { margin: 4px 8px 8px 24px; font-size: 11.5px; opacity: .65; line-height: 1.4; }

.expl-centre { grid-area: centre; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
.expl-bandeau { display: flex; align-items: center; gap: 10px; padding: 10px 14px 6px; }
.expl-titre { margin: 0; font-size: 15px; font-weight: 600; }
.expl-compte { font-size: 12px; opacity: .6; }
.expl-sp { flex: 1; }
.expl-retour { margin: 0 14px 6px; padding: 6px 10px; border-radius: 8px; font-size: 12px; background: color-mix(in oklab, #2e9e5b 14%, transparent); border: 1px solid color-mix(in oklab, #2e9e5b 45%, transparent); }
.expl-retour.ko { background: color-mix(in oklab, #d33 12%, transparent); border-color: color-mix(in oklab, #d33 45%, transparent); }
.expl-retour p { margin: 2px 0; }
.expl-vide { padding: 40px 24px; text-align: center; opacity: .7; line-height: 1.6; }
.expl-lien { text-decoration: underline; background: none; border: 0; }
.expl-grille { flex: 1; min-height: 0; overflow-y: auto; padding: 6px 14px 14px; display: grid; grid-template-columns: repeat(auto-fill, minmax(148px, 1fr)); grid-auto-rows: 168px; gap: 10px; align-content: start; }
.expl-case { position: relative; display: flex; flex-direction: column; align-items: stretch; gap: 1px; padding: 6px 8px 7px; border: 1px solid var(--border, #ddd); border-radius: 10px; cursor: pointer; background: var(--card, #fff); min-width: 0; }
.expl-case:hover { border-color: color-mix(in oklab, var(--signal, #1e88e5) 55%, var(--border, #ddd)); }
.expl-case.on { border-color: var(--signal, #1e88e5); box-shadow: 0 0 0 1px var(--signal, #1e88e5); background: color-mix(in oklab, var(--signal, #1e88e5) 7%, var(--card, #fff)); }
.expl-img { flex: 1; min-height: 0; display: block; position: relative; overflow: hidden; }
.expl-img > .expl-vign { position: absolute; inset: 0; }
.expl-nom { font-size: 12.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.expl-fam { font-size: 11px; opacity: .6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.expl-etoile { position: absolute; top: 4px; right: 5px; z-index: 1; font-size: 16px; line-height: 1; padding: 2px 4px; border: 0; background: transparent; opacity: 0; }
.expl-case:hover .expl-etoile, .expl-case.on .expl-etoile, .expl-etoile.on, .expl-etoile:focus-visible { opacity: .85; }
.expl-etoile.on { color: #e0a800; opacity: 1; }
.expl-etoile:hover { color: #e0a800; }

.expl-detail { grid-area: detail; overflow-y: auto; padding: 14px; border-left: 1px solid var(--border, #ddd); display: flex; flex-direction: column; gap: 6px; min-height: 0; }
.expl-grand { height: 230px; flex: none; border-radius: 10px; display: grid; place-items: center; background: color-mix(in oklab, var(--muted, #888) 10%, transparent); overflow: hidden; padding: 8px; }
.expl-grand-iso, .expl-grand-iso > svg { display: block; width: 100%; height: 100%; }
.expl-grand.picto svg { width: 58%; height: 58%; fill: none; stroke: currentColor; stroke-width: 1.2; }
.expl-sans { opacity: .5; font-size: 12px; }
.expl-d-nom { margin: 8px 0 0; font-size: 15px; font-weight: 600; line-height: 1.25; }
.expl-d-fam { margin: 0; font-size: 12px; opacity: .65; }
.expl-d-id { margin: 0; font: 11px ui-monospace, Menlo, Consolas, monospace; opacity: .6; word-break: break-all; }
.expl-detail h4 { margin: 10px 0 4px; font-size: 10.5px; text-transform: uppercase; letter-spacing: .07em; opacity: .55; font-weight: 600; }
.expl-puces { display: flex; flex-wrap: wrap; gap: 5px; }
.expl-puces button { font-size: 12px; padding: 3px 10px; border-radius: 999px; border: 1px solid var(--border, #bbb); background: transparent; }
.expl-puces button:hover { background: color-mix(in oklab, var(--muted, #888) 14%, transparent); }
.expl-puces button[aria-pressed='true'] { background: color-mix(in oklab, var(--signal, #1e88e5) 20%, transparent); border-color: var(--signal, #1e88e5); }
.expl-mots { display: flex; flex-wrap: wrap; gap: 4px; margin: 0; padding: 0; list-style: none; }
.expl-mots li { font-size: 11px; padding: 1px 8px; border-radius: 999px; background: color-mix(in oklab, var(--muted, #888) 16%, transparent); }
.expl-actions { margin-top: auto; padding-top: 12px; display: flex; gap: 8px; }
.expl-actions .expl-btn { flex: 1; padding: 8px 10px; }
.expl-pied { grid-area: pied; display: flex; align-items: center; gap: 14px; padding: 7px 14px; border-top: 1px solid var(--border, #ddd); font-size: 11px; opacity: .85; }
.expl-pied kbd { font-size: 10px; border: 1px solid var(--border, #bbb); border-radius: 4px; padding: 0 4px; margin-right: 2px; background: color-mix(in oklab, var(--muted, #888) 12%, transparent); }
@media (max-width: 1000px) {
  .expl { grid-template-columns: 180px minmax(0, 1fr); grid-template-areas: 'tete tete' 'arbre centre' 'pied pied'; }
  .expl-detail { display: none; }
}
@media (prefers-reduced-motion: no-preference) {
  .expl-vign:not(.pret) { animation: expl-chatoie 1.4s linear infinite; }
}
@keyframes expl-chatoie { to { background-position: -200% 0; } }
</style>

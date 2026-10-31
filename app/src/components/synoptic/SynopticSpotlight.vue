<script setup lang="ts">
// Recherche « Spotlight » de l'éditeur de synoptique (2D et iso) : Ctrl+K, « / » ou Espace hors saisie.
// Résultats instantanés : symboles (vignette, nom, famille), éléments du synoptique courant, variables de la box.
// Le composant ne fait que chercher et prévenir (`symbole`, `element`, `variable`) ; la pose et la sélection restent à l'éditeur.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { chercher, entreeElement, entreeVariable, type Contexte, type Entree, type Portee, type Resultat } from '@/lib/synoptic/recherche'
import { basculerFavori, lireFavoris, lireRecents, noterRecent } from '@/lib/synoptic/recherche/preferences'
import { vignetteIso } from '@/lib/synoptic/vignette'

const props = defineProps<{
  contexte: Contexte
  /** tous les symboles connus (iso, 2D, bibliothèques importées) */
  symboles: Entree[]
  /** éléments du synoptique courant */
  elements: { id: string; nom: string; type: string }[]
  /** variables de la box */
  variables: { nom: string; description: string; unite: string }[]
  /** vignette (contenu SVG 24×24) d'un symbole 2D de la palette */
  icone2d?: (cle: string) => string
  /** un élément est-il sélectionné (pour proposer « lier la variable ») ? */
  selectionPresente?: boolean
}>()
const emit = defineEmits<{
  (e: 'symbole', entree: Entree): void
  (e: 'element', entree: Entree): void
  (e: 'variable', entree: Entree): void
  (e: 'explorateur'): void
}>()

const ouvert = ref(false)
const q = ref('')
const portee = ref<Portee>('contexte')
const actif = ref(0)
const champ = ref<HTMLInputElement | null>(null)
const liste = ref<HTMLElement | null>(null)
const favoris = ref<string[]>(lireFavoris())
const recents = ref<string[]>(lireRecents())

const entrees = computed<Entree[]>(() => [
  ...props.symboles,
  ...props.elements.map((e) => entreeElement(props.contexte, e.id, e.nom, e.type)),
  ...props.variables.map((v) => entreeVariable(props.contexte, v.nom, v.description, v.unite)),
])
const resultats = computed<Resultat[]>(() =>
  chercher(entrees.value, q.value, { contexte: props.contexte, portee: portee.value, favoris: favoris.value, recents: recents.value, limite: 30 }),
)
watch([q, portee], () => (actif.value = 0))

function ouvrir() {
  favoris.value = lireFavoris()
  recents.value = lireRecents()
  ouvert.value = true
  q.value = ''
  actif.value = 0
  void nextTick(() => champ.value?.focus())
}
function fermer() { ouvert.value = false }
defineExpose({ ouvrir, fermer })

function choisir(r: Resultat | undefined) {
  if (!r) return
  const e = r.entree
  if (e.genre === 'symbole') noterRecent(e.cle)
  fermer()
  if (e.genre === 'symbole') emit('symbole', e)
  else if (e.genre === 'element') emit('element', e)
  else emit('variable', e)
}
function etoile(r: Resultat) { favoris.value = basculerFavori(r.entree.cle) }

function clavier(ev: KeyboardEvent) {
  if (ev.key === 'ArrowDown') { actif.value = Math.min(resultats.value.length - 1, actif.value + 1); ev.preventDefault() }
  else if (ev.key === 'ArrowUp') { actif.value = Math.max(0, actif.value - 1); ev.preventDefault() }
  else if (ev.key === 'Enter') { choisir(resultats.value[actif.value]); ev.preventDefault() }
  else if (ev.key === 'Escape') { fermer(); ev.preventDefault() }
  else if (ev.key === 'Tab') { portee.value = portee.value === 'tout' ? 'contexte' : 'tout'; ev.preventDefault() }
  void nextTick(() => liste.value?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }))
}

/** raccourcis globaux : Ctrl+K partout ; « / » ou Espace seulement quand rien n'est en saisie */
function global(ev: KeyboardEvent) {
  if (ev.defaultPrevented) return
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') { ev.preventDefault(); ouvert.value ? fermer() : ouvrir(); return }
  if (ouvert.value || ev.ctrlKey || ev.metaKey || ev.altKey) return
  if (ev.key !== '/' && ev.key !== ' ') return
  const t = document.activeElement as HTMLElement | null
  const saisie = !!t && (/^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(t.tagName) || t.isContentEditable)
  if (saisie) return
  ev.preventDefault()
  ouvrir()
}
onMounted(() => window.addEventListener('keydown', global))
onBeforeUnmount(() => window.removeEventListener('keydown', global))

const vignette = (e: Entree): string => (e.genre === 'symbole' && e.contexte === 'iso' && !e.id.startsWith('lib:') ? vignetteIso(e.id) : '')
const GENRE: Record<string, string> = { symbole: 'Symbole', element: 'Élément', variable: 'Variable' }
const sous = (e: Entree): string => (e.genre === 'symbole' ? `${e.famille}${e.contexte === 'iso' ? ' · iso' : ' · 2D'}` : e.genre === 'element' ? `${e.detail ?? ''}` : `${e.detail ?? ''}${e.unite ? ' · ' + e.unite : ''}`)
const action = (e: Entree): string => (e.genre === 'symbole' ? 'poser' : e.genre === 'element' ? 'aller à' : props.selectionPresente ? 'lier à la sélection' : 'sélectionnez un élément')
function glisser(ev: DragEvent, e: Entree) {
  if (e.genre !== 'symbole' || e.contexte !== 'iso') return ev.preventDefault()
  ev.dataTransfer?.setData('text/plain', e.id)
  noterRecent(e.cle)
  window.setTimeout(fermer, 0)
}
</script>

<template>
  <Teleport to="body">
    <div v-if="ouvert" class="spot-fond" data-testid="spotlight" @mousedown.self="fermer">
      <div class="spot" role="dialog" aria-label="Recherche" aria-modal="true">
        <div class="spot-tete">
          <svg viewBox="0 0 24 24" class="spot-loupe" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l5 5" /></svg>
          <input
            ref="champ" v-model="q" class="spot-champ" type="text" autocomplete="off" spellcheck="false" data-testid="spotlight-champ"
            placeholder="Pompe, pump, vanne 3 voies, transfo, chaufferie, une variable…" aria-label="Rechercher" role="combobox" aria-expanded="true" aria-controls="spot-liste"
            @keydown="clavier"
          >
          <div class="spot-portee" role="group" aria-label="Portée">
            <button type="button" :aria-pressed="portee === 'contexte'" data-testid="spotlight-contexte" @click="portee = 'contexte'">{{ contexte === 'iso' ? 'Iso' : '2D' }}</button>
            <button type="button" :aria-pressed="portee === 'tout'" data-testid="spotlight-tout" @click="portee = 'tout'">Tout</button>
          </div>
        </div>
        <ul id="spot-liste" ref="liste" class="spot-liste" role="listbox" data-testid="spotlight-liste">
          <li v-if="!resultats.length" class="spot-vide">
            {{ q ? 'Aucun résultat.' : 'Tapez pour chercher. Vos favoris et derniers symboles posés apparaissent ici.' }}
          </li>
          <li
            v-for="(r, i) in resultats" :key="r.entree.cle" role="option" class="spot-ligne" :class="{ on: i === actif }" :aria-selected="i === actif"
            :data-testid="`spotlight-r-${r.entree.id}`" :draggable="r.entree.genre === 'symbole' && r.entree.contexte === 'iso'" @mousemove="actif = i" @click="choisir(r)" @dragstart="glisser($event, r.entree)"
          >
            <span class="spot-vign" aria-hidden="true">
              <span v-if="vignette(r.entree)" v-html="vignette(r.entree)" />
              <svg v-else-if="r.entree.genre === 'symbole' && r.entree.contexte === '2d' && icone2d" viewBox="0 0 24 24" v-html="icone2d(r.entree.id)" />
              <span v-else class="spot-genre">{{ r.entree.genre === 'element' ? '◆' : r.entree.genre === 'variable' ? '≈' : '▢' }}</span>
            </span>
            <span class="spot-txt">
              <span class="spot-nom">{{ r.entree.nom }}</span>
              <span class="spot-fam">{{ sous(r.entree) }}</span>
            </span>
            <span class="spot-genre-lib">{{ GENRE[r.entree.genre] }}<template v-if="r.recent && !q"> · récent</template></span>
            <button
              v-if="r.entree.genre === 'symbole'" type="button" class="spot-etoile" :class="{ on: r.favori }" :aria-pressed="r.favori"
              :aria-label="r.favori ? 'Retirer des favoris' : 'Ajouter aux favoris'" data-testid="spotlight-etoile" @click.stop="etoile(r)" @mousedown.stop
            >{{ r.favori ? '★' : '☆' }}</button>
            <kbd v-if="i === actif" class="spot-act">↵ {{ action(r.entree) }}</kbd>
          </li>
        </ul>
        <div class="spot-pied">
          <span><kbd>↑</kbd><kbd>↓</kbd> naviguer</span><span><kbd>↵</kbd> choisir</span><span><kbd>Tab</kbd> iso/2D ⇄ tout</span><span><kbd>Échap</kbd> fermer</span>
          <button type="button" class="spot-tout-voir" data-testid="spotlight-explorateur" @click="fermer(); emit('explorateur')">Tout voir…</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style>
.spot-fond { position: fixed; inset: 0; z-index: 300; background: color-mix(in oklab, #000 38%, transparent); display: flex; justify-content: center; align-items: flex-start; padding-top: 12vh; }
.spot { width: min(640px, 94vw); max-height: 70vh; display: flex; flex-direction: column; border: 1px solid var(--border, #444); border-radius: 12px; background: var(--card, #fff); color: var(--foreground, #111); box-shadow: 0 24px 60px rgba(0, 0, 0, .35); overflow: hidden; }
.spot-tete { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-bottom: 1px solid var(--border, #ddd); }
.spot-loupe { width: 18px; height: 18px; flex: none; fill: none; stroke: currentColor; stroke-width: 2; opacity: .6; }
.spot-champ { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; font-size: 16px; color: inherit; }
.spot-portee { display: flex; border: 1px solid var(--border, #ccc); border-radius: 6px; padding: 2px; }
.spot-portee button { font-size: 11px; padding: 2px 8px; border-radius: 4px; opacity: .7; }
.spot-portee button[aria-pressed='true'] { background: color-mix(in oklab, var(--signal, #1e88e5) 18%, transparent); opacity: 1; }
.spot-liste { overflow-y: auto; margin: 0; padding: 6px; list-style: none; }
.spot-vide { padding: 22px; text-align: center; font-size: 13px; opacity: .65; }
.spot-ligne { display: flex; align-items: center; gap: 10px; padding: 6px 8px; border-radius: 8px; cursor: pointer; }
.spot-ligne.on { background: color-mix(in oklab, var(--signal, #1e88e5) 14%, transparent); }
.spot-vign { width: 44px; height: 36px; flex: none; display: grid; place-items: center; border-radius: 6px; background: color-mix(in oklab, var(--muted, #888) 14%, transparent); overflow: hidden; }
.spot-vign svg { width: 100%; height: 100%; fill: none; stroke: currentColor; stroke-width: 1.4; }
.spot-vign > span > svg { fill: initial; stroke: initial; stroke-width: initial; }
.spot-genre { opacity: .5; font-size: 16px; }
.spot-txt { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.spot-nom { font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.spot-fam { font-size: 11px; opacity: .6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.spot-genre-lib { font-size: 10px; text-transform: uppercase; letter-spacing: .06em; opacity: .5; }
.spot-etoile { font-size: 16px; opacity: .45; line-height: 1; }
.spot-etoile.on, .spot-etoile:hover { opacity: 1; color: #e0a800; }
.spot-act, .spot-pied kbd { font-size: 10px; border: 1px solid var(--border, #bbb); border-radius: 4px; padding: 0 4px; background: color-mix(in oklab, var(--muted, #888) 12%, transparent); }
.spot-pied { display: flex; align-items: center; gap: 12px; padding: 7px 14px; border-top: 1px solid var(--border, #ddd); font-size: 11px; opacity: .85; }
.spot-pied kbd { margin-right: 3px; }
.spot-tout-voir { margin-left: auto; font-size: 11px; text-decoration: underline; }
</style>

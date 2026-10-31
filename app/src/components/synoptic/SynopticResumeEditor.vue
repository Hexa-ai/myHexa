<script setup lang="ts">
// Onglet « Résumé mobile » de l'éditeur : corriger le résumé automatique de la tuile mobile (voir docs/flux/synoptique.md).
// À gauche, les cartes calculées (réordonner, renommer, masquer, créer) et leurs équipements (épingler, masquer, déplacer, famille) ;
// à droite, l'aperçu EN DIRECT au format téléphone (le vrai composant de la tuile, avec les vraies valeurs si elles sont connues).
// Tout reste automatique tant qu'on ne corrige rien ; le composant ne garde que la section `modele.resume` et la renvoie à l'éditeur.
import { computed, ref, watch } from 'vue'
import { construireResume, detailResume, type CarteDetail } from '@/lib/synoptic/resume'
import { FAMILLES_PICTO, type FamillePicto } from '@/lib/synoptic/familles-picto'
import {
  MAX_VALEURS_CARTE,
  choisirValeurs,
  creerCartePerso,
  deplacer,
  deplacerDans,
  epingler,
  forcerFamille,
  masquer,
  masquerCarte,
  renommerCarte,
  reordonner,
  supprimerCartePerso,
} from '@/lib/synoptic/resume-config'
import type { ResumeConfig, SynopticDocument } from '@/lib/synoptic/engine/types'
import SynopticSummary from './SynopticSummary.vue'

const props = defineProps<{
  /** document courant de l'éditeur (instantané pris à l'ouverture de l'onglet) */
  doc: SynopticDocument
  /** valeurs courantes (vides = aperçu sans mesure) */
  values: Record<string, number>
}>()
const emit = defineEmits<{ (e: 'change', config: ResumeConfig | undefined): void }>()

const config = ref<ResumeConfig | undefined>(clone(props.doc.modele.resume))
watch(
  () => props.doc,
  (d) => (config.value = clone(d.modele.resume)),
)
function clone<T>(x: T): T {
  return x === undefined ? x : JSON.parse(JSON.stringify(x))
}
function appliquer(c: ResumeConfig | undefined) {
  config.value = c
  emit('change', c)
}

const docCourant = computed<SynopticDocument>(() => ({
  ...props.doc,
  modele: { ...props.doc.modele, resume: config.value },
}))
const detail = computed(() => detailResume(docCourant.value, props.values))
const apercu = computed(() => construireResume(docCourant.value, props.values))
/** carte que le calcul automatique donne à chaque équipement (pour savoir si un déplacement revient à l'automatique) */
const carteAuto = computed(() => {
  const m = new Map<string, string>()
  for (const c of detailResume(docCourant.value, props.values, { auto: true }).cartes) for (const e of c.membres) m.set(e.id, c.id)
  return m
})
const cartesChoix = computed(() => detail.value.cartes.filter((c) => !c.cvc))
const modifie = computed(() => !!config.value)
const avecValeurs = computed(() => Object.keys(props.values).length > 0)

// ---- cartes
const ouvertes = ref(new Set<string>())
function basculerOuverte(id: string) {
  const s = new Set(ouvertes.value)
  if (!s.delete(id)) s.add(id)
  ouvertes.value = s
}
function renommer(c: CarteDetail, titre: string) {
  appliquer(renommerCarte(config.value, c.id, titre === c.titreAuto ? '' : titre))
}
function deplacerCarte(de: number, vers: number) {
  const ids = detail.value.cartes.map((c) => c.id)
  if (vers < 0 || vers >= ids.length) return
  appliquer(reordonner(config.value, deplacerDans(ids, de, vers)))
}
const glisse = ref<number | null>(null)
const survol = ref<number | null>(null)
function lacher(vers: number) {
  if (glisse.value !== null && glisse.value !== vers) deplacerCarte(glisse.value, vers)
  glisse.value = survol.value = null
}

// ---- équipements
const etiquetteFamille = (f: FamillePicto | null) => FAMILLES_PICTO.find((x) => x.id === f)?.libelle ?? 'aucune'
function changerFamille(id: string, v: string) {
  appliquer(forcerFamille(config.value, id, v === '' ? undefined : (v as FamillePicto | 'aucun')))
}
function viderCartesPersoVides(c: ResumeConfig | undefined): ResumeConfig | undefined {
  let out = c
  for (const p of c?.cartesPerso ?? []) if (!p.equipements.length) out = supprimerCartePerso(out, p.id)
  return out
}
function vers(id: string, cible: string) {
  appliquer(viderCartesPersoVides(deplacer(config.value, id, cible, carteAuto.value.get(id) ?? null)))
}

// ---- valeurs d'une carte
function basculerValeur(c: CarteDetail, variable: string) {
  const l = c.valeursChoisies.includes(variable) ? c.valeursChoisies.filter((x) => x !== variable) : [...c.valeursChoisies, variable]
  appliquer(choisirValeurs(config.value, c.id, l))
}

// ---- nouvelle carte
const creation = ref(false)
const nouveauTitre = ref('')
const nouveauxEquipements = ref(new Set<string>())
function ouvrirCreation() {
  nouveauTitre.value = ''
  nouveauxEquipements.value = new Set()
  creation.value = true
}
function cocher(id: string, oui: boolean) {
  const s = new Set(nouveauxEquipements.value)
  if (oui) s.add(id)
  else s.delete(id)
  nouveauxEquipements.value = s
}
function creer() {
  if (!nouveauxEquipements.value.size) return
  const { config: c, id } = creerCartePerso(config.value, nouveauTitre.value, [...nouveauxEquipements.value])
  appliquer(viderCartesPersoVides(c))
  creation.value = false
  ouvertes.value = new Set([...ouvertes.value, id])
}
function supprimerPerso(id: string) {
  appliquer(supprimerCartePerso(config.value, id))
}

function retablir() {
  if (!modifie.value) return
  if (!window.confirm('Rétablir le résumé automatique ? Toutes les corrections du résumé mobile seront retirées.')) return
  appliquer(undefined)
}

/** les raccourcis du dessin (Suppr, flèches, Ctrl+Z…) ne doivent pas agir sous cet onglet ; Ctrl+S reste l'enregistrement */
function garderLeClavier(ev: KeyboardEvent) {
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') return
  ev.stopPropagation()
}

const CLASSE_BOUTON =
  'rounded border px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors hover:border-signal/50 hover:text-foreground'
const BOUTON_OFF = 'border-border text-muted-foreground'
const BOUTON_ON = 'border-signal text-signal'
const CHAMP = 'rounded border border-border bg-background px-2 py-1 text-xs text-foreground'
</script>

<template>
  <div class="flex h-full min-h-0 flex-col" data-testid="resume-editeur" @keydown.capture="garderLeClavier">
    <div class="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
      <p class="min-w-0 flex-1 text-xs text-muted-foreground">
        Le résumé est <b class="font-medium text-foreground">automatique</b> : corrigez seulement ce qui ne convient pas. Un équipement
        masqué n'apparaît plus dans les cartes, mais <b class="font-medium text-foreground">ses alarmes restent affichées</b>.
      </p>
      <span v-if="modifie" class="font-mono text-[10px] uppercase tracking-widest text-signal" data-testid="resume-corrige">Corrigé</span>
      <span v-else class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Tout automatique</span>
      <button type="button" :class="[CLASSE_BOUTON, BOUTON_OFF, !modifie && 'opacity-40']" :disabled="!modifie" data-testid="resume-retablir" @click="retablir">
        Rétablir l'automatique
      </button>
    </div>

    <div class="flex min-h-0 flex-1 gap-4 overflow-hidden p-3">
      <!-- cartes calculées -->
      <section class="flex min-w-0 flex-1 flex-col gap-2 overflow-y-auto pr-1" aria-label="Cartes du résumé">
        <ul class="flex flex-col gap-2">
          <li
            v-for="(c, i) in detail.cartes"
            :key="c.id"
            class="rounded-md border bg-card"
            :class="[survol === i ? 'border-signal' : 'border-border', c.masquee && 'opacity-60']"
            data-testid="resume-carte"
            :data-carte-id="c.id"
            @dragover.prevent="survol = i"
            @drop.prevent="lacher(i)"
          >
            <div class="flex items-center gap-2 px-2 py-1.5">
              <span
                class="cursor-grab select-none px-1 font-mono text-sm text-muted-foreground"
                draggable="true"
                title="Glisser pour réordonner"
                aria-hidden="true"
                data-testid="resume-poignee"
                @dragstart="glisse = i"
                @dragend="glisse = survol = null"
                >⋮⋮</span
              >
              <input
                :value="c.titre"
                :class="[CHAMP, 'min-w-0 flex-1 font-medium']"
                :aria-label="`Titre de la carte ${c.titreAuto}`"
                data-testid="resume-titre"
                @change="renommer(c, ($event.target as HTMLInputElement).value)"
              />
              <span v-if="c.personnalisee" class="font-mono text-[10px] uppercase tracking-widest text-signal">Perso</span>
              <button type="button" :class="[CLASSE_BOUTON, BOUTON_OFF]" aria-label="Monter la carte" data-testid="resume-monter" :disabled="i === 0" @click="deplacerCarte(i, i - 1)">↑</button>
              <button type="button" :class="[CLASSE_BOUTON, BOUTON_OFF]" aria-label="Descendre la carte" data-testid="resume-descendre" :disabled="i === detail.cartes.length - 1" @click="deplacerCarte(i, i + 1)">↓</button>
              <button
                type="button"
                :class="[CLASSE_BOUTON, c.masquee ? BOUTON_ON : BOUTON_OFF]"
                :aria-pressed="c.masquee"
                data-testid="resume-masquer-carte"
                @click="appliquer(masquerCarte(config, c.id, !c.masquee))"
              >
                {{ c.masquee ? 'Masquée' : 'Masquer' }}
              </button>
              <button
                v-if="!c.cvc"
                type="button"
                :class="[CLASSE_BOUTON, BOUTON_OFF]"
                :aria-expanded="ouvertes.has(c.id)"
                data-testid="resume-details"
                @click="basculerOuverte(c.id)"
              >
                {{ ouvertes.has(c.id) ? '− Détail' : `+ ${c.membres.length} équip.` }}
              </button>
              <span v-else class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">CVC</span>
            </div>

            <div v-if="ouvertes.has(c.id) && !c.cvc" class="flex flex-col gap-3 border-t border-border px-3 py-2.5">
              <ul class="flex flex-col divide-y divide-border">
                <li v-for="m in c.membres" :key="m.id" class="flex flex-wrap items-center gap-2 py-1.5 text-xs" data-testid="resume-equipement" :data-equipement-id="m.id">
                  <span class="min-w-0 basis-full truncate">
                    <span class="text-foreground">{{ m.libelle }}</span>
                    <span class="ml-1.5 font-mono text-[10px] text-muted-foreground">{{ m.id }} · {{ m.type }}</span>
                    <span v-if="m.enAlarme" class="ml-1.5 font-mono text-[10px] uppercase text-destructive">alarme</span>
                  </span>
                  <button type="button" :class="[CLASSE_BOUTON, m.epingle ? BOUTON_ON : BOUTON_OFF]" :aria-pressed="m.epingle" data-testid="resume-epingler" @click="appliquer(epingler(config, m.id, !m.epingle))">
                    {{ m.epingle ? 'Épinglé' : 'Épingler' }}
                  </button>
                  <button type="button" :class="[CLASSE_BOUTON, m.masque ? BOUTON_ON : BOUTON_OFF]" :aria-pressed="m.masque" data-testid="resume-masquer" @click="appliquer(masquer(config, m.id, !m.masque))">
                    {{ m.masque ? 'Masqué' : 'Masquer' }}
                  </button>
                  <select
                    :class="CHAMP"
                    :value="config?.equipements?.[m.id]?.famille ?? ''"
                    :aria-label="`Pictogramme de ${m.libelle}`"
                    data-testid="resume-famille"
                    @change="changerFamille(m.id, ($event.target as HTMLSelectElement).value)"
                  >
                    <option value="">Pictogramme : auto ({{ etiquetteFamille(m.familleAuto) }})</option>
                    <option v-for="f in FAMILLES_PICTO" :key="f.id" :value="f.id">{{ f.libelle }}</option>
                    <option value="aucun">Aucun</option>
                  </select>
                  <select :class="CHAMP" :value="c.id" :aria-label="`Carte de ${m.libelle}`" data-testid="resume-vers" @change="vers(m.id, ($event.target as HTMLSelectElement).value)">
                    <option v-for="t in cartesChoix" :key="t.id" :value="t.id">→ {{ t.titre }}</option>
                  </select>
                </li>
              </ul>

              <div v-if="c.valeursPossibles.length">
                <p class="mb-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Valeurs affichées · {{ c.valeursChoisies.length ? `${c.valeursChoisies.length} / ${MAX_VALEURS_CARTE}` : 'automatique' }}
                  <button v-if="c.valeursChoisies.length" type="button" :class="[CLASSE_BOUTON, BOUTON_OFF]" data-testid="resume-valeurs-auto" @click="appliquer(choisirValeurs(config, c.id, []))">Automatique</button>
                </p>
                <label v-for="p in c.valeursPossibles" :key="p.variable" class="flex items-center gap-2 py-0.5 text-xs">
                  <input
                    type="checkbox"
                    :checked="c.valeursChoisies.includes(p.variable)"
                    :disabled="!c.valeursChoisies.includes(p.variable) && c.valeursChoisies.length >= MAX_VALEURS_CARTE"
                    data-testid="resume-valeur"
                    :data-variable="p.variable"
                    @change="basculerValeur(c, p.variable)"
                  />
                  <span class="truncate">{{ p.libelle }}</span>
                  <span class="font-mono text-[10px] text-muted-foreground">{{ p.variable }}</span>
                </label>
              </div>
              <div v-if="c.personnalisee">
                <button type="button" :class="[CLASSE_BOUTON, BOUTON_OFF, 'hover:border-destructive hover:text-destructive']" data-testid="resume-supprimer-carte" @click="supprimerPerso(c.id)">
                  Supprimer cette carte
                </button>
              </div>
            </div>
          </li>
        </ul>

        <div v-if="creation" class="rounded-md border border-signal bg-card p-3" data-testid="resume-creation">
          <input v-model="nouveauTitre" :class="[CHAMP, 'mb-2 w-full']" placeholder="Titre de la carte" aria-label="Titre de la nouvelle carte" data-testid="resume-nouveau-titre" />
          <div class="max-h-48 overflow-y-auto">
            <template v-for="c in cartesChoix" :key="c.id">
              <p class="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{{ c.titre }}</p>
              <label v-for="m in c.membres" :key="m.id" class="flex items-center gap-2 py-0.5 text-xs">
                <input type="checkbox" :checked="nouveauxEquipements.has(m.id)" data-testid="resume-nouveau-equipement" @change="cocher(m.id, ($event.target as HTMLInputElement).checked)" />
                {{ m.libelle }} <span class="font-mono text-[10px] text-muted-foreground">{{ m.id }}</span>
              </label>
            </template>
          </div>
          <div class="mt-2 flex gap-2">
            <button type="button" :class="[CLASSE_BOUTON, BOUTON_ON]" :disabled="!nouveauxEquipements.size" data-testid="resume-creer" @click="creer">Créer la carte</button>
            <button type="button" :class="[CLASSE_BOUTON, BOUTON_OFF]" @click="creation = false">Annuler</button>
          </div>
        </div>
        <button v-else type="button" :class="[CLASSE_BOUTON, BOUTON_OFF, 'self-start']" data-testid="resume-ajouter-carte" @click="ouvrirCreation">+ carte</button>
      </section>

      <!-- aperçu téléphone -->
      <aside class="flex w-[430px] shrink-0 flex-col items-center gap-2 overflow-y-auto" aria-label="Aperçu sur téléphone">
        <p class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Aperçu téléphone · {{ avecValeurs ? 'valeurs en direct' : 'sans valeur reçue' }}
        </p>
        <div class="w-[390px] max-w-full rounded-[22px] border-2 border-border bg-background" data-testid="resume-apercu">
          <SynopticSummary :resume="apercu" telephone />
        </div>
      </aside>
    </div>
  </div>
</template>

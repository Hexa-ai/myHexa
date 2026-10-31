<script setup lang="ts">
// Résumé d'un synoptique pour mobile : alarmes actives (rouge), puis une carte par zone ou ouvrage avec son état et ses
// valeurs principales. Ne capte aucun geste : la page défile toujours. Un appui sur une carte ou sur le bouton ouvre le dessin.
import type { CadreDessin, EtatOuvrage, ResumeSynoptique } from '@/lib/synoptic/resume'
import SynopticPicto from './SynopticPicto.vue'

defineProps<{
  resume: ResumeSynoptique
  /** vrai = toujours une colonne (aperçu 390 px de l'éditeur, quelle que soit la largeur de l'écran) */
  telephone?: boolean
}>()
const emit = defineEmits<{ (e: 'ouvrir', cadre: CadreDessin | null): void }>()

const LIBELLE_ETAT: Record<EtatOuvrage, string> = {
  marche: 'En marche',
  arret: 'À l’arrêt',
  defaut: 'Défaut',
  ok: 'Normal',
  inconnu: 'État inconnu',
}
/** pastille d'état : variables du thème uniquement */
const PASTILLE: Record<EtatOuvrage, string> = {
  marche: 'bg-signal',
  arret: 'bg-muted-foreground',
  defaut: 'bg-destructive',
  ok: 'bg-signal/50',
  inconnu: 'border border-dashed border-muted-foreground',
}
</script>

<template>
  <div class="flex flex-col gap-3 p-3" data-testid="synoptic-resume">
    <div
      v-if="resume.alarmes.length"
      class="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2.5"
      role="alert"
      data-testid="synoptic-resume-alarmes"
    >
      <p class="font-mono text-[10px] uppercase tracking-widest text-destructive">
        {{ resume.alarmes.length }} alarme{{ resume.alarmes.length > 1 ? 's' : '' }} active{{
          resume.alarmes.length > 1 ? 's' : ''
        }}
      </p>
      <ul class="mt-1.5 flex flex-col gap-1">
        <li
          v-for="a in resume.alarmes"
          :key="a.id"
          class="flex items-baseline gap-2 text-sm text-foreground"
        >
          <span class="mt-1.5 size-1.5 shrink-0 self-start rounded-full bg-destructive" />
          <span class="min-w-0">
            {{ a.texte }}
            <span v-if="a.ouvrage" class="text-xs text-muted-foreground">· {{ a.ouvrage }}</span>
          </span>
        </li>
      </ul>
    </div>
    <p v-else class="flex items-center gap-2 text-xs text-muted-foreground">
      <span class="size-1.5 rounded-full bg-signal" />Aucune alarme active
    </p>

    <div class="grid gap-2" :class="telephone ? '' : 'sm:grid-cols-2'">
      <button
        v-for="c in resume.ouvrages"
        :key="c.id"
        type="button"
        class="flex min-w-0 flex-col gap-1.5 rounded-md border bg-card px-3 py-2.5 text-left active:bg-muted"
        :class="c.etat === 'defaut' ? 'border-destructive/50' : 'border-border'"
        data-testid="synoptic-carte"
        @click="emit('ouvrir', c.cadre)"
      >
        <span class="flex min-w-0 items-center gap-2">
          <span class="size-2.5 shrink-0 rounded-full" :class="PASTILLE[c.etat]" />
          <span class="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{{
            c.titre
          }}</span>
          <span
            class="shrink-0 font-mono text-[10px] uppercase tracking-wider"
            :class="c.etat === 'defaut' ? 'text-destructive' : 'text-muted-foreground'"
            >{{
              c.alarmes ? `${c.alarmes} alarme${c.alarmes > 1 ? 's' : ''}` : LIBELLE_ETAT[c.etat]
            }}</span
          >
        </span>
        <span v-if="c.pictos.length" class="flex items-center gap-2" data-testid="synoptic-pictos">
          <SynopticPicto v-for="p in c.pictos" :key="p.id" :picto="p" />
        </span>
        <span
          v-for="v in c.valeurs"
          :key="v.libelle"
          class="flex min-w-0 items-baseline justify-between gap-3 text-sm"
        >
          <span class="min-w-0 truncate text-muted-foreground">{{ v.libelle }}</span>
          <span class="shrink-0 font-mono text-foreground">{{ v.texte }}</span>
        </span>
        <span v-if="!c.valeurs.length" class="text-xs text-muted-foreground">Pas de mesure reçue</span>
      </button>
    </div>

    <button
      type="button"
      class="min-h-11 rounded-md border border-signal px-4 text-sm font-medium text-signal active:bg-signal/10"
      data-testid="synoptic-voir"
      @click="emit('ouvrir', null)"
    >
      Voir le synoptique
    </button>
  </div>
</template>

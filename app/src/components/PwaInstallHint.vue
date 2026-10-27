<script setup lang="ts">
/**
 * iPhone : Safari ne propose jamais l'installation. Bandeau discret qui explique « Partager » → « Sur l'écran d'accueil ».
 * Affiché seulement sur iPhone/iPad, dans Safari (pas déjà installée), et plus jamais une fois fermé.
 */
import { ref } from 'vue'
import { isIOS, isStandalone } from '@/lib/pwa'

const KEY = 'myhexa.pwaHintClosed'
const show = ref(isIOS && !isStandalone && localStorage.getItem(KEY) !== '1')
function close() {
  localStorage.setItem(KEY, '1')
  show.value = false
}
</script>

<template>
  <div
    v-if="show"
    class="pwa-hint md:hidden border border-border bg-card rounded-xl shadow-lg px-4 py-3 flex items-start gap-3"
    data-testid="pwa-hint"
  >
    <img src="/pwa/icon-192.png" alt="" class="size-10 rounded-[10px] shrink-0" />
    <div class="min-w-0 text-sm leading-snug">
      <div class="font-medium">Installer myHexa sur votre iPhone</div>
      <div class="text-muted-foreground mt-0.5">
        Touchez
        <svg
          viewBox="0 0 24 24"
          class="inline size-4 -mt-1 text-signal"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M12 3v12M7 8l5-5 5 5" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" stroke-linecap="round" />
        </svg>
        <b>Partager</b>, puis <b>Sur l'écran d'accueil</b>. Vous pourrez aussi recevoir les alarmes.
      </div>
    </div>
    <button
      class="shrink-0 -mr-1 size-8 inline-flex items-center justify-center text-muted-foreground"
      aria-label="Fermer"
      data-testid="pwa-hint-close"
      @click="close"
    >
      ✕
    </button>
  </div>
</template>

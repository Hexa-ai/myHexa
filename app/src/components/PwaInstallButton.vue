<script setup lang="ts">
/**
 * PC (Chrome, Edge) et Android : bouton « Installer l'application » quand le navigateur le permet
 * (événement beforeinstallprompt). Caché si déjà installée ou si le navigateur ne le propose pas
 * (Safari : Fichier → Ajouter au Dock ; iPhone : bandeau dédié).
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { isStandalone } from '@/lib/pwa'

defineProps<{ collapsed?: boolean }>()

type InstallEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: string }>
}
const deferred = ref<InstallEvent | null>(null)

function onPrompt(e: Event) {
  e.preventDefault() // pas de mini-barre du navigateur : on propose notre bouton
  deferred.value = e as InstallEvent
}
function onInstalled() {
  deferred.value = null
}
onMounted(() => {
  if (isStandalone) return
  const early = (window as unknown as { __myhexaInstall?: InstallEvent }).__myhexaInstall
  if (early) deferred.value = early
  window.addEventListener('beforeinstallprompt', onPrompt)
  window.addEventListener('appinstalled', onInstalled)
})
onBeforeUnmount(() => {
  window.removeEventListener('beforeinstallprompt', onPrompt)
  window.removeEventListener('appinstalled', onInstalled)
})

async function install() {
  const e = deferred.value
  if (!e) return
  await e.prompt()
  await e.userChoice.catch(() => null)
  deferred.value = null
}
</script>

<template>
  <button
    v-if="deferred"
    type="button"
    :title="collapsed ? 'Installer l\'application' : undefined"
    :class="[
      'w-full flex items-center gap-2.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors',
      collapsed ? 'justify-center px-0 py-2' : 'px-3 py-2',
    ]"
    data-testid="pwa-install"
    @click="install"
  >
    <svg
      viewBox="0 0 24 24"
      class="size-4 shrink-0"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    >
      <path d="M12 3v12M7 10l5 5 5-5" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke-linecap="round" />
    </svg>
    <span v-if="!collapsed">Installer l'application</span>
  </button>
</template>

<script setup lang="ts">
// Partage d'un tableau en lecture seule avec un compte myHexa (y compris d'une autre organisation).
// Le destinataire voit les blocs et leurs données, jamais la fiche des box ni leurs autres variables.
import { onMounted, ref, watch } from 'vue'
import {
  listShares,
  shareDashboard,
  unshareDashboard,
  type DashboardShare,
} from '@/composables/useDashboards'

const props = defineProps<{ dashboardId: string }>()
defineEmits<{ (e: 'close'): void }>()

const shares = ref<DashboardShare[]>([])
const email = ref('')
const busy = ref(false)
const msg = ref('')
const err = ref('')

async function refresh() {
  err.value = ''
  try {
    shares.value = await listShares(props.dashboardId)
  } catch (e) {
    err.value = (e as Error).message
  }
}
onMounted(refresh)
watch(() => props.dashboardId, refresh)

async function add() {
  const e = email.value.trim()
  if (!e) return
  busy.value = true
  msg.value = err.value = ''
  try {
    await shareDashboard(props.dashboardId, e)
    email.value = ''
    msg.value = `Partagé avec ${e}.`
    await refresh()
  } catch (x) {
    err.value = (x as Error).message
  } finally {
    busy.value = false
  }
}
async function drop(s: DashboardShare) {
  if (!confirm(`Retirer le partage avec ${s.name || s.email} ?`)) return
  busy.value = true
  msg.value = err.value = ''
  try {
    await unshareDashboard(props.dashboardId, s.recipient_id)
    await refresh()
  } catch (x) {
    err.value = (x as Error).message
  } finally {
    busy.value = false
  }
}
const fmt = (s: string) => new Date(s).toLocaleDateString('fr-FR')
</script>

<template>
  <section
    class="mb-4 border border-border rounded-md bg-card/60 p-3 text-sm"
    data-testid="share-panel"
  >
    <div class="flex items-center gap-2 mb-2">
      <div class="font-medium flex-1">Partage en lecture seule</div>
      <button
        class="text-xs px-2 py-1 rounded border border-border hover:border-signal/60"
        @click="$emit('close')"
      >
        Fermer
      </button>
    </div>
    <p class="text-xs text-muted-foreground mb-3">
      La personne voit ce tableau et les données de ses blocs, même si elle fait partie d'une autre
      organisation. Elle n'a pas accès à la fiche des box, ni aux autres variables, ni aux rapports.
      Elle doit déjà avoir un compte myHexa.
    </p>
    <form class="flex flex-wrap gap-2 mb-3" @submit.prevent="add">
      <input
        v-model="email"
        type="email"
        required
        placeholder="adresse e-mail du compte myHexa"
        class="flex-1 min-w-[14rem] bg-background border border-border rounded px-2 py-1.5 text-sm"
        data-testid="share-email"
      />
      <button
        type="submit"
        class="text-xs font-mono uppercase tracking-wider px-3 py-1.5 rounded border border-signal/50 text-signal disabled:opacity-40"
        :disabled="busy || !email.trim()"
        data-testid="share-add"
      >
        Partager
      </button>
    </form>
    <p v-if="msg" class="text-xs text-signal mb-2">{{ msg }}</p>
    <p v-if="err" class="text-xs text-offline mb-2" data-testid="share-error">{{ err }}</p>
    <div v-if="!shares.length" class="text-xs text-muted-foreground">
      Ce tableau n'est partagé avec personne.
    </div>
    <table v-else class="w-full text-sm" data-testid="share-list">
      <tbody>
        <tr v-for="s in shares" :key="s.recipient_id" class="border-t border-border">
          <td class="py-1.5 pr-3">
            {{ s.name || s.email }}
            <div class="text-[11px] text-muted-foreground">{{ s.email }}</div>
          </td>
          <td class="py-1.5 pr-3 text-xs text-muted-foreground">{{ s.company }}</td>
          <td class="py-1.5 pr-3 font-mono text-[11px] text-muted-foreground hidden sm:table-cell">
            {{ fmt(s.created_at) }}
          </td>
          <td class="py-1.5 text-right">
            <button
              class="font-mono text-[10px] uppercase text-muted-foreground hover:text-offline"
              :disabled="busy"
              @click="drop(s)"
            >
              Retirer
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

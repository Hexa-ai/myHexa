<script setup lang="ts">
// Synoptique en plein cadre, lecture seule. Destination quand l'édition est demandée sur un appareil qui ne la permet pas.
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDevices } from '@/composables/useDevices'
import { useSynoptic, useSynopticLive } from '@/composables/useSynoptic'
import SynopticCanvas from '@/components/synoptic/SynopticCanvas.vue'
import SynopticFrame from '@/components/synoptic/SynopticFrame.vue'
import SynopticBar from '@/components/synoptic/SynopticBar.vue'

const route = useRoute()
const router = useRouter()
const id = computed(() => String(route.params.id))
const { allDevices, load } = useDevices()
onMounted(load)
const deviceId = ref<string>()
const device = computed(() => allDevices.value.find((d) => d.id === deviceId.value) ?? null)
const { charge, doc, chargement, erreur, values, enDirect, recu, variables } = useSynoptic(
  id,
  device,
)
watch(charge, (c) => (deviceId.value = c?.synoptic.device_ids[0]))
useSynopticLive(deviceId, variables)

const avis = computed(() => route.query.avis === 'bureau')
const retour = computed(() =>
  typeof route.query.retour === 'string' ? route.query.retour : '/admin/devices',
)
</script>

<template>
  <div>
    <SynopticFrame enligne @close="router.push(retour)">
      <SynopticBar
        :titre="charge?.synoptic.name ?? 'Synoptique'"
        :en-direct="enDirect"
        :recu="recu"
        :alarmes="0"
      >
        <button
          type="button"
          class="text-xs px-2.5 py-1 rounded border border-border text-muted-foreground hover:text-foreground"
          @click="router.push(retour)"
        >
          ← Retour
        </button>
      </SynopticBar>
      <p
        v-if="avis"
        class="px-3 py-2 text-xs bg-card border-b border-border"
        data-testid="synoptic-avis-bureau"
      >
        L'édition du synoptique est réservée aux ordinateurs (écran large, souris).
      </p>
      <p v-if="erreur" class="p-4 text-sm text-destructive">{{ erreur }}</p>
      <p v-else-if="chargement && !doc" class="p-4 text-sm text-muted-foreground">Chargement…</p>
      <div v-else-if="doc" class="flex-1 min-h-0">
        <SynopticCanvas :doc="doc" :values="values" full-frame />
      </div>
    </SynopticFrame>
  </div>
</template>

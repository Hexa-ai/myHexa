// Charge un synoptique (document de la version courante) et fournit ses valeurs en direct :
// valeur directe de la box si le mode direct est actif, sinon dernières valeurs du statut (30 min), comme les autres tuiles.
import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { chargerSynoptique, type SynopticCharge } from '@/lib/synoptic/api'
import {
  construireCatalogue,
  valeurNumerique,
  valeursDuStatut,
  variablesLiees,
} from '@/lib/synoptic/variables'
import { fetchCatalog, type HistVar } from '@/composables/useHistory'
import { useLiveStore } from '@/stores/live'
import type { DeviceWithStatus } from '@/composables/useDevices'

export function useSynoptic(
  synopticId: Ref<string | undefined>,
  device: Ref<DeviceWithStatus | null | undefined>,
) {
  const live = useLiveStore()
  const charge = ref<SynopticCharge | null>(null)
  const chargement = ref(false)
  const erreur = ref('')

  async function recharger() {
    if (!synopticId.value) return
    chargement.value = true
    erreur.value = ''
    try {
      charge.value = await chargerSynoptique(synopticId.value)
      if (!charge.value) erreur.value = 'Synoptique introuvable ou non autorisé.'
    } catch (e) {
      erreur.value = (e as Error).message
    } finally {
      chargement.value = false
    }
  }
  watch(synopticId, recharger, { immediate: true })

  const doc = computed(() => charge.value?.doc ?? null)
  const variables = computed(() => (doc.value ? variablesLiees(doc.value) : []))

  /** valeur directe d'une variable, sinon undefined (repli sur le statut) */
  function directe(nom: string): number | null | undefined {
    const id = device.value?.id
    if (!id) return undefined
    const lv = live.value(id, nom)
    return lv === undefined || lv === null ? undefined : valeurNumerique(lv)
  }
  const values = computed<Record<string, number>>(() => {
    void live.tick
    const out = valeursDuStatut(device.value?.status_payload, variables.value)
    for (const nom of variables.value) {
      const d = directe(nom)
      if (typeof d === 'number') out[nom] = d
    }
    return out
  })
  /** vrai si au moins une variable arrive en direct */
  const enDirect = computed(() => {
    void live.tick
    return variables.value.some((n) => typeof directe(n) === 'number')
  })
  const recu = computed(() => device.value?.status_received_at ?? null)

  // catalogue de l'éditeur : chargé à la demande
  const histo = ref<HistVar[]>([])
  const catalogue = computed(() => construireCatalogue(histo.value, device.value?.status_payload))
  async function chargerCatalogue() {
    if (device.value?.id) histo.value = await fetchCatalog(device.value.id).catch(() => [])
  }

  return {
    charge,
    doc,
    chargement,
    erreur,
    recharger,
    variables,
    values,
    enDirect,
    recu,
    catalogue,
    chargerCatalogue,
  }
}

/** pour les pages hors tableau : surveille la box et annonce les variables voulues au mode direct */
export function useSynopticLive(deviceId: Ref<string | undefined>, variables: Ref<string[]>) {
  const live = useLiveStore()
  let relache: (() => void) | null = null
  watch(
    deviceId,
    (id) => {
      relache?.()
      relache = id ? live.watch([id]) : null
    },
    { immediate: true },
  )
  watch(
    [deviceId, variables],
    ([id, vars]) => {
      if (id) live.setWanted({ [id]: vars })
    },
    { immediate: true },
  )
  onBeforeUnmount(() => relache?.())
}

// Shared cursor across SeriesChart instances on a page.
// Charts write `activeTs` when they're hovered; the others react by showing
// their tooltip at the closest matching point.

import { ref } from 'vue'

const activeTs = ref<number | null>(null)
let ownerId: symbol | null = null

export function useChartSync() {
  const id = Symbol('chart-sync')

  function set(ts: number | null) {
    ownerId = id
    activeTs.value = ts
  }

  function isOwner() {
    return ownerId === id
  }

  function reset() {
    if (ownerId === id) {
      ownerId = null
      activeTs.value = null
    }
  }

  return { activeTs, set, isOwner, reset }
}

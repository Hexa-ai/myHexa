// Shared cursor + zoom state across SeriesChart instances on a page.
//
// Cursor uses Vue refs (fired only on hover — low frequency).
// Zoom uses a direct callback registry to avoid reactivity overhead during
// continuous wheel/pan gestures.

import { ref } from 'vue'

const activeTs = ref<number | null>(null)
let cursorOwner: symbol | null = null

interface ZoomRange { min: number; max: number }
type ZoomListener = (range: ZoomRange | null, ownerId: symbol) => void
const zoomListeners = new Set<ZoomListener>()
let currentZoomRange: ZoomRange | null = null

export function useChartSync() {
  const id = Symbol('chart-sync')

  // ---- Cursor ----
  function setCursor(ts: number | null) {
    cursorOwner = id
    activeTs.value = ts
  }
  function isCursorOwner() {
    return cursorOwner === id
  }
  function resetCursor() {
    if (cursorOwner === id) {
      cursorOwner = null
      activeTs.value = null
    }
  }

  // ---- Zoom ----
  function subscribeZoom(cb: ZoomListener): () => void {
    zoomListeners.add(cb)
    // Replay the current state so newly mounted charts catch up
    if (currentZoomRange) cb(currentZoomRange, id)
    return () => zoomListeners.delete(cb)
  }
  function broadcastZoom(range: ZoomRange | null) {
    currentZoomRange = range
    for (const cb of zoomListeners) cb(range, id)
  }
  function getZoomRange() {
    return currentZoomRange
  }

  return {
    activeTs,
    setCursor,
    isCursorOwner,
    resetCursor,
    subscribeZoom,
    broadcastZoom,
    getZoomRange,
    id,
  }
}

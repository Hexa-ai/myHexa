// Shared cursor + zoom state across SeriesChart instances on a page.
// Charts write `activeTs` on hover and `zoomRange` on zoom/pan ; the others
// react by showing tooltips and applying the same x-range.

import { ref } from 'vue'

const activeTs = ref<number | null>(null)
const zoomRange = ref<{ min: number; max: number } | null>(null)
let cursorOwner: symbol | null = null
let zoomOwner: symbol | null = null
let zoomEpoch = 0

export function useChartSync() {
  const id = Symbol('chart-sync')

  // Cursor
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

  // Zoom
  function setZoom(range: { min: number; max: number } | null) {
    zoomOwner = id
    zoomEpoch += 1
    zoomRange.value = range
  }
  function isZoomOwner() {
    return zoomOwner === id
  }

  return {
    activeTs,
    setCursor,
    isCursorOwner,
    resetCursor,
    zoomRange,
    setZoom,
    isZoomOwner,
  }
}

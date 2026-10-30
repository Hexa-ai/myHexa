// Édition de la grille d'un tableau de bord : glisser-déposer avec insertion et poignée de redimensionnement.
// La logique de calcul est dans lib/dashboardGrid.ts (fonctions pures) ; ici, seulement l'état et les événements.
import { ref, type Ref } from 'vue'
import {
  dropSide,
  insertionIndex,
  isNoopDrop,
  moveItem,
  resizeTo,
  setSize,
  widgetCols,
  type DropSide,
  type SizedWidget,
} from '@/lib/dashboardGrid'

export function useGridEditing<T extends SizedWidget>(widgets: Ref<T[]>) {
  // ---- glisser-déposer ----
  const dragIdx = ref<number | null>(null)
  /** tuile survolée et côté d'insertion ; null = pas d'emplacement valide */
  const drop = ref<{ target: number; side: DropSide } | null>(null)

  function onDragStart(e: DragEvent, i: number) {
    dragIdx.value = i
    // Firefox exige des données pour lancer un glisser
    e.dataTransfer?.setData('text/plain', String(i))
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
  }
  function onDragOver(e: DragEvent, i: number) {
    if (dragIdx.value === null) return
    const el = e.currentTarget as HTMLElement
    const side = dropSide(el.getBoundingClientRect(), { x: e.clientX, y: e.clientY }, widgetCols(widgets.value[i]))
    const noop = isNoopDrop(dragIdx.value, insertionIndex(i, side))
    drop.value = noop ? null : { target: i, side }
  }
  /** zone « fin de liste » sous la grille */
  function onDragOverEnd() {
    if (dragIdx.value === null) return
    const last = widgets.value.length - 1
    drop.value = isNoopDrop(dragIdx.value, last + 1) ? null : { target: last, side: 'after' }
  }
  function onDrop() {
    const from = dragIdx.value
    const d = drop.value
    endDrag()
    if (from === null || !d) return
    widgets.value = moveItem(widgets.value, from, insertionIndex(d.target, d.side))
  }
  function endDrag() {
    dragIdx.value = null
    drop.value = null
  }

  // ---- redimensionnement (poignée en bas à droite) ----
  const resizingIdx = ref<number | null>(null)
  let start: { x: number; y: number; widthPx: number; heightPx: number; gridPx: number } | null = null

  function onResizeStart(e: PointerEvent, i: number) {
    const handle = e.currentTarget as HTMLElement
    const slot = handle.closest('[data-testid=widget-slot]') as HTMLElement
    const grid = slot.parentElement as HTMLElement
    handle.setPointerCapture(e.pointerId)
    const r = slot.getBoundingClientRect()
    start = { x: e.clientX, y: e.clientY, widthPx: r.width, heightPx: r.height, gridPx: grid.clientWidth }
    resizingIdx.value = i
  }
  function onResizeMove(e: PointerEvent, i: number) {
    if (resizingIdx.value !== i || !start) return
    const size = resizeTo(start, { dx: e.clientX - start.x, dy: e.clientY - start.y }, start.gridPx)
    setSize(widgets.value[i], size)
  }
  function onResizeEnd() {
    resizingIdx.value = null
    start = null
  }

  return {
    dragIdx, drop, onDragStart, onDragOver, onDragOverEnd, onDrop, endDrag,
    resizingIdx, onResizeStart, onResizeMove, onResizeEnd,
  }
}

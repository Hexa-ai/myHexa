// Édition de la grille d'un tableau de bord : glisser-déposer avec insertion et poignées de redimensionnement (fantôme aimanté).
// La logique de calcul est dans lib/dashboardGrid.ts (fonctions pures) ; ici, seulement l'état et les événements.
import { ref, type Ref } from 'vue'
import {
  dropSide,
  insertionIndex,
  isNoopDrop,
  moveItem,
  isAutoHeight,
  resizeTo,
  setSize,
  spanBox,
  widgetCols,
  widgetRows,
  type DropSide,
  type GridSize,
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

  // ---- redimensionnement : poignées d'angle (largeur + hauteur), de bord droit (largeur) et de bord bas (hauteur) ----
  // Pendant le geste, la tuile et la mise en page ne bougent PAS : seul un fantôme (boîte aimantée à la grille, avec sa taille)
  // suit le pointeur. La taille n'est appliquée qu'au relâchement (Échap ou annulation du pointeur : rien n'est appliqué).
  type Axis = 'x' | 'y' | 'xy'
  /** aperçu en cours : taille cible (colonnes × rangées) et boîte du fantôme en px, relative à la grille */
  interface ResizePreview extends GridSize {
    idx: number
    left: number
    top: number
    width: number
    height: number
  }
  const resizingIdx = ref<number | null>(null)
  const preview = ref<ResizePreview | null>(null)
  let start: {
    x: number
    y: number
    widthPx: number
    heightPx: number
    gridPx: number
    left: number
    top: number
    axis: Axis
    type?: string
  } | null = null

  function onResizeStart(e: PointerEvent, i: number, axis: Axis = 'xy') {
    const handle = e.currentTarget as HTMLElement
    const slot = handle.closest('[data-testid=widget-slot]') as HTMLElement
    const grid = slot.parentElement as HTMLElement
    handle.setPointerCapture(e.pointerId)
    const r = slot.getBoundingClientRect()
    start = {
      x: e.clientX,
      y: e.clientY,
      widthPx: r.width,
      heightPx: r.height,
      gridPx: grid.clientWidth,
      left: slot.offsetLeft,
      top: slot.offsetTop,
      axis,
      type: widgets.value[i].type,
    }
    resizingIdx.value = i
    document.body.classList.add('select-none') // pas de sélection de texte pendant le geste
    window.addEventListener('keydown', onKey)
    onResizeMove(e, i)
  }
  function onResizeMove(e: PointerEvent, i: number) {
    if (resizingIdx.value !== i || !start) return
    const size = resizeTo(start, { dx: e.clientX - start.x, dy: e.clientY - start.y }, start.gridPx, {
      axis: start.axis,
      type: start.type,
    })
    const box = spanBox(start.gridPx, size, start.left, start.top)
    const p = preview.value
    if (p && p.w === size.w && p.h === size.h && p.left === box.left) return // aimanté : rien à redessiner
    preview.value = { idx: i, ...size, ...box }
  }
  function onResizeEnd(commit = true) {
    const p = preview.value
    if (commit && p && resizingIdx.value === p.idx) {
      const wd = widgets.value[p.idx]
      const sameW = p.w === widgetCols(wd)
      const sameH = p.h === widgetRows(wd)
      // une taille inchangée ne doit pas figer la hauteur par défaut d'une tuile sans hauteur enregistrée
      if (!sameW || !sameH) setSize(wd, { ...(sameW ? {} : { w: p.w }), ...(sameH && isAutoHeight(wd) ? {} : { h: p.h }) })
    }
    cancelResize()
  }
  function cancelResize() {
    resizingIdx.value = null
    preview.value = null
    start = null
    document.body.classList.remove('select-none')
    window.removeEventListener('keydown', onKey)
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') cancelResize()
  }

  return {
    dragIdx, drop, onDragStart, onDragOver, onDragOverEnd, onDrop, endDrag,
    resizingIdx, preview, onResizeStart, onResizeMove, onResizeEnd, cancelResize,
  }
}

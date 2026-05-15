import { ref } from 'vue'

export type ToastKind = 'info' | 'success' | 'alert' | 'error'

export interface Toast {
  id: number
  kind: ToastKind
  title: string
  body?: string
  durationMs?: number
}

const toasts = ref<Toast[]>([])
let nextId = 1

export function useToasts() {
  function push(t: Omit<Toast, 'id'>) {
    const toast: Toast = { id: nextId++, durationMs: 6_000, ...t }
    toasts.value.push(toast)
    if (toast.durationMs && toast.durationMs > 0) {
      setTimeout(() => dismiss(toast.id), toast.durationMs)
    }
    return toast.id
  }
  function dismiss(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }
  function clear() {
    toasts.value = []
  }
  return { toasts, push, dismiss, clear }
}

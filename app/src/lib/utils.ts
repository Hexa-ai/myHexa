import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const RTF = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' })

export function formatRelative(input: string | null | undefined): string {
  if (!input) return '—'
  const ts = new Date(input).getTime()
  if (Number.isNaN(ts)) return '—'
  const diffSec = Math.round((ts - Date.now()) / 1000)
  const abs = Math.abs(diffSec)
  if (abs < 60) return RTF.format(diffSec, 'second')
  if (abs < 3600) return RTF.format(Math.round(diffSec / 60), 'minute')
  if (abs < 86400) return RTF.format(Math.round(diffSec / 3600), 'hour')
  if (abs < 86400 * 30) return RTF.format(Math.round(diffSec / 86400), 'day')
  return new Date(input).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function isOnline(lastConnectionAt: string | null | undefined, thresholdMs = 60 * 60 * 1000): boolean {
  if (!lastConnectionAt) return false
  return Date.now() - new Date(lastConnectionAt).getTime() < thresholdMs
}

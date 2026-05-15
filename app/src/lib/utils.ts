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

const NETWORK_KEYS = ['eth0', 'eth1', 'wlan0', 'wwan0', 'tailscale'] as const
export type InterfaceKey = (typeof NETWORK_KEYS)[number]

interface RawNetIfc {
  ip?: string | null
  connected?: boolean
}

export function activeInterfaces(payload: unknown): InterfaceKey[] {
  if (!payload || typeof payload !== 'object') return []
  const net = (payload as { network?: Record<string, RawNetIfc> }).network
  if (!net) return []
  return NETWORK_KEYS.filter((k) => net[k]?.connected === true)
}

export function tailscaleIp(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const ts = (payload as { network?: { tailscale?: RawNetIfc } }).network?.tailscale
  if (ts?.connected && ts.ip) return ts.ip
  return null
}

export function activeAlarmCount(payload: unknown): number {
  if (!payload || typeof payload !== 'object') return 0
  const vars = (payload as { variables?: Array<{ category?: string; value: unknown }> }).variables
  if (!Array.isArray(vars)) return 0
  return vars.filter(
    (v) => v?.category === 'alarm' && v?.value !== 0 && v?.value !== null && v?.value !== false,
  ).length
}

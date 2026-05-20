import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export type Severity = 'info' | 'warning' | 'error'

export const SEVERITY_LABEL: Record<Severity, string> = {
  info: 'Info',
  warning: 'Warning',
  error: 'Error',
}

export const SEVERITY_ICON: Record<Severity, string> = {
  info: 'ⓘ',
  warning: '⚠',
  error: '●',
}

/** Strong chip used in tables — colored bg + border + bold text. */
export function severityPillClass(level: string | null | undefined): string {
  const k = String(level ?? '').toLowerCase() as Severity
  if (k === 'error') {
    return 'bg-offline/15 text-offline border border-offline/40 font-semibold'
  }
  if (k === 'warning') {
    return 'bg-warn/15 text-warn border border-warn/40 font-semibold'
  }
  if (k === 'info') {
    return 'bg-signal/10 text-signal border border-signal/30 font-semibold'
  }
  return 'bg-muted text-muted-foreground border border-border'
}

/** For toggle/select buttons : inactive is outline-only, active is filled. */
export function severityButtonClass(level: Severity, active: boolean): string {
  if (active) {
    if (level === 'error') return 'bg-offline text-background border-offline shadow-[0_0_30px_-12px_var(--offline)]'
    if (level === 'warning') return 'bg-warn text-background border-warn shadow-[0_0_30px_-12px_var(--warn)]'
    return 'bg-signal text-primary-foreground border-signal shadow-[0_0_30px_-12px_var(--signal)]'
  }
  if (level === 'error') return 'border-offline/40 text-offline hover:bg-offline/10'
  if (level === 'warning') return 'border-warn/40 text-warn hover:bg-warn/10'
  return 'border-signal/40 text-signal hover:bg-signal/10'
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

const LAN_PRIORITY: InterfaceKey[] = ['eth1', 'eth0', 'wlan0']

export interface AccessTarget {
  ip: string
  iface: InterfaceKey
  network: 'tailscale' | 'lan'
}

/**
 * Pick the best openable URL for the device given the viewer context.
 * If `tailscaleReachable` is true and the device has a connected Tailscale IP,
 * prefer it. Otherwise fall back to the first connected LAN interface IP.
 */
export function bestAccessTarget(
  payload: unknown,
  tailscaleReachable: boolean | null,
): AccessTarget | null {
  if (!payload || typeof payload !== 'object') return null
  const net = (payload as { network?: Record<string, RawNetIfc> }).network
  if (!net) return null

  if (tailscaleReachable === true) {
    const ts = net.tailscale
    if (ts?.connected && ts.ip) return { ip: ts.ip, iface: 'tailscale', network: 'tailscale' }
  }
  for (const k of LAN_PRIORITY) {
    const ifc = net[k]
    if (ifc?.connected && ifc.ip) return { ip: ifc.ip, iface: k, network: 'lan' }
  }
  return null
}

export function vncUrl(host: string | null | undefined, port: number | null | undefined): string | null {
  if (!host) return null
  const p = port && port > 0 ? port : 5900
  return `vnc://${host}:${p}`
}

export function activeAlarmCount(payload: unknown): number {
  if (!payload || typeof payload !== 'object') return 0
  const vars = (payload as { variables?: Array<{ category?: string; value: unknown }> }).variables
  if (!Array.isArray(vars)) return 0
  return vars.filter(
    (v) => v?.category === 'alarm' && v?.value !== 0 && v?.value !== null && v?.value !== false,
  ).length
}

export function maxActiveAlarmSeverity(payload: unknown): 'error' | 'warning' | null {
  if (!payload || typeof payload !== 'object') return null
  const vars = (payload as {
    variables?: Array<{ category?: string; value: unknown; type_alarm?: string }>
  }).variables
  if (!Array.isArray(vars)) return null
  let hasWarning = false
  for (const v of vars) {
    if (v?.category !== 'alarm') continue
    if (v?.value === 0 || v?.value === null || v?.value === false) continue
    const t = String(v?.type_alarm ?? '').toLowerCase()
    if (t === 'error') return 'error'
    if (t === 'warning') hasWarning = true
  }
  return hasWarning ? 'warning' : null
}

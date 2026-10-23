// Aperçu « qui reçoit quoi » : l'exemple expliqué à Julien (règles du firmware v1.3.11).
import { describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
import { buildPreview } from '@/composables/alarmPreview'
import type {
  AlarmConfig,
  Channels,
  Device,
  EscLevel,
  Escalation,
  Person,
  Sub,
} from '@/composables/useAlarmConfig'

const ALL = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const ch = (email: boolean, sms: boolean, call: boolean): Channels => ({ email, sms, call })
const person = (id: string, name: string, c: Channels, phone = '+33600000000'): Person => ({
  id,
  company_id: 'c',
  name,
  contact_email: `${id}@x.fr`,
  phone,
  role: 'viewer',
  auth_user_id: null,
  portal_access: false,
  alarm_enabled: true,
  alarm_channels: c,
  alarm_schedule_days: ALL,
  restrict_to_devices: null,
})
const sub = (rid: string, box: string, e: boolean, w: boolean, i: boolean): Sub => ({
  recipient_id: rid,
  device_id: 'd',
  box_recipient_id: box,
  filters: { error: e, warning: w, info: i },
  channels_override: null,
  schedule_days_override: null,
})
const level = (
  name: string,
  delay: number,
  members: string[],
  mc: Record<string, Channels> = {},
): EscLevel => ({
  name,
  delay_seconds: delay,
  reminders: 0,
  members,
  channels: ch(true, true, false),
  member_channels: mc,
})

function setup(esc: Escalation | null, subs?: Sub[]) {
  const people = [
    person('seb', 'Sébastien', ch(true, true, false)),
    person('ast', 'Astreinte', ch(false, true, true)),
    person('nina', 'Nina', ch(true, false, false)),
  ]
  const s = subs ?? [
    sub('seb', 's1', true, true, true),
    sub('ast', 'a1', true, true, false),
    sub('nina', 'n1', false, true, true),
  ]
  const byId = new Map(people.map((p) => [p.id, p]))
  const channelsOn = (x: Sub) => x.channels_override ?? byId.get(x.recipient_id)!.alarm_channels
  const cfg = {
    subsOf: () => s,
    personById: { value: byId },
    escOf: () => (esc ? { device_id: 'd', config: esc, baseline: null } : null),
    channelsOn,
    memberName: (_: string, m: string) => m,
    memberChannels: (_: string, lv: EscLevel, m: string) => {
      const x = s.find((y) => y.box_recipient_id === m)
      return lv.member_channels[m] ?? (x && channelsOn(x)) ?? lv.channels
    },
  } as unknown as AlarmConfig
  const d = { id: 'd', name: 'box', reported: [], reportedEscalation: null } as unknown as Device
  return { cfg, d }
}
const ESC: Escalation = {
  mode: 'escalation',
  types: { error: true, warning: false, info: false },
  cumulative: false,
  stop_on_clear: true,
  closure_notice: false,
  levels: [
    level('N1', 180, ['a1'], { a1: ch(false, true, false) }),
    level('N2', 300, ['a1'], { a1: ch(false, false, true) }),
    level('N3', 300, ['s1'], { s1: ch(true, false, false) }),
  ],
}

describe('aperçu alarmes', () => {
  it('warning non escaladé : envoi direct, mail + SMS, jamais d’appel', () => {
    const { cfg, d } = setup(ESC)
    const p = buildPreview(cfg, d, 'warning')
    expect(p.mode).toBe('direct')
    expect(p.steps[0].sends).toEqual([
      { name: 'Sébastien', channels: ['email', 'sms'] },
      { name: 'Astreinte', channels: ['sms'] },
      { name: 'Nina', channels: ['email'] },
    ])
  })
  it('erreur escaladée : la chaîne, minute par minute, personne en direct', () => {
    const { cfg, d } = setup(ESC)
    const p = buildPreview(cfg, d, 'error')
    expect(p.mode).toBe('chain')
    expect(p.steps.map((s) => [s.at, s.sends])).toEqual([
      [0, [{ name: 'Astreinte', channels: ['sms'] }]],
      [180, [{ name: 'Astreinte', channels: ['call'] }]],
      [480, [{ name: 'Sébastien', channels: ['email'] }]],
    ])
  })
  it('l’escalade ne peut pas ajouter un canal absent de la fiche', () => {
    const esc = { ...ESC, levels: [level('N1', 60, ['n1'], { n1: ch(false, true, false) })] }
    const { cfg, d } = setup(esc, [sub('nina', 'n1', true, true, true)])
    const p = buildPreview(cfg, d, 'error')
    expect(p.steps[0].sends).toEqual([])
    expect(p.warnings.join()).toMatch(/SMS demandé pour Nina mais pas coché sur sa fiche/)
  })
  it('membre non abonné au type : pas prévenu', () => {
    const esc = { ...ESC, levels: [level('N1', 60, ['n1'])] }
    const { cfg, d } = setup(esc)
    const p = buildPreview(cfg, d, 'error')
    expect(p.warnings.join()).toMatch(/Nina ne reçoit pas les erreurs/)
  })
  it('sans escalade : direct pour tout', () => {
    const { cfg, d } = setup(null)
    expect(buildPreview(cfg, d, 'error').mode).toBe('direct')
  })
})

// PROTOTYPE — état et actions de la page « Alertes · destinataires ».
// UNE liste de personnes : la table recipients (portail) porte aussi les réglages d'alarme.
// Le portail stocke l'état VOULU (recipients.alarm_*, alarm_subscriptions, device_escalation) ;
// la box rapporte l'état CONSTATÉ (bloc notifications de son dernier status).
import { computed, ref } from 'vue'
import { supabase } from '@/lib/supabase'

export type Filters = { info: boolean; warning: boolean; error: boolean }
export type Channels = { email: boolean; sms: boolean; call: boolean }
/** une personne de l'entreprise (ligne recipients) */
export interface Person {
  id: string
  company_id: string | null
  name: string
  contact_email: string | null
  phone: string | null
  role: string
  auth_user_id: string | null
  portal_access: boolean
  alarm_enabled: boolean
  alarm_channels: Channels
  alarm_schedule_days: string[]
  restrict_to_devices: string[] | null
}
export interface Sub {
  recipient_id: string
  device_id: string
  box_recipient_id: string
  filters: Filters
  channels_override: Channels | null
  schedule_days_override: string[] | null
}
export interface BoxRecipient {
  id: string
  name: string
  email?: string
  phone?: string
  enabled?: boolean
  filters?: Filters
  channels?: Channels
}
export interface EscLevel {
  name: string
  delay_seconds: number
  reminders: number
  members: string[]
  channels: Channels
  /** dans le portail : EXCEPTIONS seulement (un membre absent suit ses canaux de la box) */
  member_channels: Record<string, Channels>
}
export interface Escalation {
  mode: 'immediate' | 'escalation'
  types: Filters
  cumulative: boolean
  stop_on_clear: boolean
  closure_notice: boolean
  levels: EscLevel[]
}
// --- compatibilité firmware ----------------------------------------------------------------
// Pilotage à distance des destinataires (set_recipients) : firmware >= 1.3.7.
// Escalade (set_escalation) : firmware >= 1.3.10. La box le prouve elle-même : bloc `remote`
// reçu (remote_seen_at) et `escalation_hash` présent dans son état (absent avant 1.3.10).
export const FW_RECIPIENTS = '1.3.7'
export const FW_ESCALATION = '1.3.10'
export function versionLt(a: string, b: string): boolean {
  const pa = a
    .replace(/^v/, '')
    .split(/[.-]/)
    .map((x) => parseInt(x, 10) || 0)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== pb[i]) return (pa[i] ?? 0) < pb[i]
  return false
}
export type Capability = { level: 'none' | 'recipients' | 'full'; label: string; hint: string }
export function capability(
  d: Pick<Device, 'remote_seen_at' | 'running_version' | 'escalation_hash'>,
): Capability {
  const v = d.running_version ? ` (box en v${d.running_version})` : ''
  if (!d.remote_seen_at)
    return {
      level: 'none',
      label: 'non pilotable',
      hint:
        d.running_version && versionLt(d.running_version, FW_RECIPIENTS)
          ? `Firmware trop ancien${v} : réglage à distance à partir de la ${FW_RECIPIENTS}. Mettre la box à jour.`
          : `La box n'envoie pas d'infos de pilotage : firmware antérieur à ${FW_RECIPIENTS}, ou option « Remote management » désactivée sur la box.`,
    }
  if (d.escalation_hash === null)
    return {
      level: 'recipients',
      label: 'destinataires seulement',
      hint: `l'escalade se règle à distance à partir du firmware ${FW_ESCALATION}${v}. Les destinataires, eux, sont réglables ici.`,
    }
  return { level: 'full', label: 'pilotable', hint: '' }
}

export interface Device {
  id: string
  name: string
  remote_seen_at: string | null
  running_version: string | null
  recipients_hash: string | null
  recipients_hash_ref: string | null
  escalation_hash: string | null
  reported: BoxRecipient[] | null
  reportedEscalation: Escalation | null
  pending: number
  lastAck: { status: string; detail: string | null; type: string } | null
}
export interface EscRow {
  device_id: string
  config: Escalation
  baseline: Escalation | null
}

export const DAYS = [
  ['monday', 'L'],
  ['tuesday', 'M'],
  ['wednesday', 'M'],
  ['thursday', 'J'],
  ['friday', 'V'],
  ['saturday', 'S'],
  ['sunday', 'D'],
] as const
export const LEVELS: { key: keyof Filters; label: string; cls: string }[] = [
  { key: 'error', label: 'E', cls: 'bg-offline/80 text-white' },
  { key: 'warning', label: 'W', cls: 'bg-amber-500/80 text-black' },
  { key: 'info', label: 'I', cls: 'bg-signal/70 text-black' },
]
export const CHANNELS: { key: keyof Channels; label: string }[] = [
  { key: 'email', label: 'mail' },
  { key: 'sms', label: 'SMS' },
  { key: 'call', label: 'appel' },
]
export const DEFAULT_FILTERS: Filters = { info: false, warning: true, error: true }
export const channelLabel = (ch: Channels | null | undefined) =>
  (ch &&
    CHANNELS.filter((c) => ch[c.key])
      .map((c) => c.label)
      .join(' · ')) ||
  'aucun canal'

const PERSON_COLS =
  'id, company_id, name, contact_email, phone, role, auth_user_id, portal_access, alarm_enabled, alarm_channels, alarm_schedule_days, restrict_to_devices'
const SUB_COLS =
  'recipient_id, device_id, box_recipient_id, filters, channels_override, schedule_days_override'
export const same = (a: unknown, b: unknown) =>
  JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b))
function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys)
  if (v && typeof v === 'object')
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, x]) => [k, sortKeys(x)]),
    )
  return v ?? null
}

export function useAlarmConfig() {
  const loading = ref(false)
  const flash = ref<string | null>(null)
  const companyLabel = ref<string | null>(null)
  const people = ref<Person[]>([])
  const subs = ref<Sub[]>([])
  const devices = ref<Device[]>([])
  const escalations = ref<EscRow[]>([])

  function setFlash(msg: string) {
    flash.value = msg
    setTimeout(() => (flash.value === msg ? (flash.value = null) : null), 6000)
  }
  const fail = (e: { message: string }) => setFlash(`Erreur : ${e.message}`)

  async function load(companyId: string | null) {
    if (!companyId) return
    loading.value = true
    try {
      const [p, d, co] = await Promise.all([
        supabase.from('recipients').select(PERSON_COLS).eq('company_id', companyId).order('name'),
        supabase
          .from('devices')
          .select(
            'id, name, remote_seen_at, running_version, recipients_hash, recipients_hash_ref, escalation_hash',
          )
          .eq('company_id', companyId)
          .order('name'),
        supabase.from('companies').select('name').eq('id', companyId).maybeSingle(),
      ])
      if (p.error) throw p.error
      if (d.error) throw d.error
      companyLabel.value = co.data?.name ?? null
      people.value = (p.data ?? []) as unknown as Person[]
      const ids = (d.data ?? []).map((x) => x.id)
      const [s, r, cmd, esc] = await Promise.all([
        supabase.from('alarm_subscriptions').select(SUB_COLS).in('device_id', ids),
        supabase
          .from('reports')
          .select('device_id, notifications:payload->notifications')
          .eq('type', 'status')
          .in('device_id', ids),
        supabase
          .from('device_commands')
          .select('device_id, state, ack_status, ack_detail, type, issued_at')
          .in('device_id', ids)
          .in('type', ['set_recipients', 'set_escalation'])
          .order('issued_at', { ascending: false }),
        supabase
          .from('device_escalation')
          .select('device_id, config, baseline')
          .in('device_id', ids),
      ])
      if (s.error) throw s.error
      subs.value = (s.data ?? []) as unknown as Sub[]
      escalations.value = (esc.data ?? []) as unknown as EscRow[]
      type Notif = { recipients?: BoxRecipient[]; mode?: string; escalation?: Escalation }
      const notif = new Map<string, Notif | null>()
      for (const row of (r.data ?? []) as unknown as {
        device_id: string
        notifications: Notif | null
      }[])
        notif.set(row.device_id, row.notifications)
      const cmds = cmd.data ?? []
      devices.value = (d.data ?? []).map((x): Device => {
        const n = notif.get(x.id)
        const mine = cmds.filter((k) => k.device_id === x.id)
        const acked = mine.find((k) => k.ack_status)
        return {
          ...x,
          reported: n ? (n.recipients ?? []) : null,
          reportedEscalation: n?.escalation?.levels?.length
            ? ({ ...n.escalation, mode: n.mode ?? n.escalation.mode } as Escalation)
            : null,
          pending: mine.filter((k) => ['queued', 'sent', 'in_progress'].includes(k.state)).length,
          lastAck: acked
            ? { status: acked.ack_status ?? '', detail: acked.ack_detail, type: acked.type }
            : null,
        }
      })
    } catch (e) {
      fail(e as Error)
    } finally {
      loading.value = false
    }
  }

  // --- lecture -----------------------------------------------------------------------------
  const personById = computed(() => new Map(people.value.map((c) => [c.id, c])))
  const subsOf = (deviceId: string) => subs.value.filter((s) => s.device_id === deviceId)
  const subOf = (personId: string, deviceId: string) =>
    subs.value.find((s) => s.recipient_id === personId && s.device_id === deviceId)
  const subByBoxId = (deviceId: string, boxId: string) =>
    subs.value.find((x) => x.device_id === deviceId && x.box_recipient_id === boxId)
  const escOf = (deviceId: string) =>
    escalations.value.find((e) => e.device_id === deviceId) ?? null
  const pilotable = (d: Device) => capability(d).level !== 'none'
  const escalationPilotable = (d: Device) => capability(d).level === 'full'
  /** canaux d'une personne sur une box : exception box, sinon sa fiche */
  const channelsOn = (s: Sub) =>
    s.channels_override ?? personById.value.get(s.recipient_id)?.alarm_channels ?? null
  /** nom lisible d'un membre d'escalade (id 8 hex sur la box) */
  function memberName(deviceId: string, boxId: string) {
    const s = subByBoxId(deviceId, boxId)
    if (s) return personById.value.get(s.recipient_id)?.name ?? boxId
    return (
      devices.value.find((d) => d.id === deviceId)?.reported?.find((r) => r.id === boxId)?.name ??
      boxId
    )
  }
  /** canaux effectifs d'un membre dans un niveau (même règle que alarm_resolve_escalation côté SQL) */
  function memberChannels(deviceId: string, lv: EscLevel, boxId: string): Channels {
    const s = subByBoxId(deviceId, boxId)
    return lv.member_channels[boxId] ?? (s && channelsOn(s)) ?? lv.channels
  }
  /** chaîne telle qu'elle sera envoyée : chaque membre avec ses canaux explicites */
  function resolveEscalation(deviceId: string, cfg: Escalation): Escalation {
    return {
      ...cfg,
      levels: cfg.levels.map((lv) => ({
        ...lv,
        member_channels: Object.fromEntries(
          lv.members.map((m) => [m, memberChannels(deviceId, lv, m)]),
        ),
      })),
    }
  }

  /** nombre d'écarts entre la liste voulue et la liste rapportée par la box */
  function diffCount(d: Device): number {
    const got = new Map((d.reported ?? []).map((r) => [r.id, r]))
    let n = 0
    for (const s of subsOf(d.id)) {
      const c = personById.value.get(s.recipient_id)
      const r = got.get(s.box_recipient_id)
      got.delete(s.box_recipient_id)
      if (!c || !r) {
        n++
        continue
      }
      if (
        r.name !== c.name ||
        (r.email ?? '') !== (c.contact_email ?? '') ||
        (r.enabled ?? true) !== c.alarm_enabled ||
        !same(r.filters, s.filters) ||
        !same(r.channels, channelsOn(s))
      )
        n++
    }
    return n + got.size
  }
  const escalationDirty = (deviceId: string) => {
    const e = escOf(deviceId)
    return !!e && !same(resolveEscalation(deviceId, e.config), e.baseline)
  }

  type SyncState = { label: string; cls: string; hint: string }
  function syncState(d: Device): SyncState {
    if (d.pending)
      return {
        label: 'en attente',
        cls: 'text-amber-400',
        hint: 'appliqué au prochain push de la box (~30 min)',
      }
    if (d.recipients_hash && d.recipients_hash_ref && d.recipients_hash !== d.recipients_hash_ref)
      return {
        label: 'modifié sur la box',
        cls: 'text-offline',
        hint: 'la liste a été changée localement sur la box',
      }
    if (
      d.lastAck &&
      ['error', 'rejected'].includes(d.lastAck.status) &&
      (diffCount(d) || escalationDirty(d.id))
    )
      return { label: 'refusé par la box', cls: 'text-offline', hint: d.lastAck.detail ?? '' }
    const parts: string[] = []
    const n = d.reported === null ? (subsOf(d.id).length ? 1 : 0) : diffCount(d)
    if (n) parts.push(`${n} écart${n > 1 ? 's' : ''}`)
    if (escalationDirty(d.id)) parts.push('escalade modifiée')
    if (parts.length)
      return {
        label: parts.join(' · '),
        cls: 'text-amber-400',
        hint: 'le portail diffère de la box : « envoyer » pour appliquer',
      }
    if (d.reported === null)
      return {
        label: 'pas de config reçue',
        cls: 'text-muted-foreground',
        hint: "la box n'envoie pas sa configuration",
      }
    return { label: 'à jour', cls: 'text-online', hint: 'identique à la configuration de la box' }
  }

  /** ce que reçoit une personne d'une box : alarmes directes + rôle dans l'escalade */
  function receives(s: Sub) {
    const e = escOf(s.device_id)?.config
    const levels = (e?.levels ?? []).flatMap((lv, i) =>
      lv.members.includes(s.box_recipient_id)
        ? [
            {
              n: i + 1,
              name: lv.name,
              ch: memberChannels(s.device_id, lv, s.box_recipient_id),
              exception: !!lv.member_channels[s.box_recipient_id],
            },
          ]
        : [],
    )
    const escTypes =
      e && e.mode === 'escalation' ? LEVELS.filter((l) => e.types[l.key]).map((l) => l.label) : []
    return { channels: channelsOn(s), levels, escTypes }
  }
  /** box auxquelles une personne avec accès portail est abonnée sans pouvoir les voir */
  function invisibleBoxes(p: Person) {
    if (!p.portal_access || !p.restrict_to_devices?.length) return []
    return subs.value
      .filter((s) => s.recipient_id === p.id && !p.restrict_to_devices!.includes(s.device_id))
      .map((s) => devices.value.find((d) => d.id === s.device_id)?.name ?? s.device_id)
  }

  // --- abonnements -------------------------------------------------------------------------
  async function addSubs(rows: { recipient_id: string; device_id: string; filters?: Filters }[]) {
    const fresh = rows.filter((r) => !subOf(r.recipient_id, r.device_id))
    if (!fresh.length) return 0
    const { data, error } = await supabase
      .from('alarm_subscriptions')
      .insert(fresh.map((r) => ({ ...r, filters: r.filters ?? DEFAULT_FILTERS })))
      .select(SUB_COLS)
    if (error) return (fail(error), 0)
    subs.value.push(...((data ?? []) as unknown as Sub[]))
    return fresh.length
  }
  /** niveaux d'escalade (index) où figure ce destinataire de box */
  function levelsUsing(deviceId: string, boxId: string) {
    const e = escOf(deviceId)
    return (e?.config.levels ?? []).flatMap((l, i) => (l.members.includes(boxId) ? [i + 1] : []))
  }
  async function removeSub(s: Sub) {
    const used = levelsUsing(s.device_id, s.box_recipient_id)
    const name = personById.value.get(s.recipient_id)?.name ?? ''
    if (used.length) {
      if (
        !confirm(
          `${name} est dans l'escalade de cette box (niveau ${used.join(', ')}). Le retirer aussi de l'escalade ?`,
        )
      )
        return
      const e = escOf(s.device_id)!
      const config: Escalation = JSON.parse(JSON.stringify(e.config))
      for (const l of config.levels) {
        l.members = l.members.filter((m) => m !== s.box_recipient_id)
        delete l.member_channels[s.box_recipient_id]
      }
      if (!(await saveEscalation(s.device_id, config))) return
    }
    const { error } = await supabase
      .from('alarm_subscriptions')
      .delete()
      .match({ recipient_id: s.recipient_id, device_id: s.device_id })
    if (error) return fail(error)
    subs.value = subs.value.filter((x) => x !== s)
  }
  async function updateSub(s: Sub, patch: Partial<Pick<Sub, 'filters' | 'channels_override'>>) {
    const { error } = await supabase
      .from('alarm_subscriptions')
      .update({ ...patch, updated_at: new Date().toISOString() } as never)
      .match({ recipient_id: s.recipient_id, device_id: s.device_id })
    if (error) return (fail(error), false)
    Object.assign(s, patch)
    return true
  }
  async function toggleFilter(s: Sub, key: keyof Filters) {
    const filters = { ...s.filters, [key]: !s.filters[key] }
    if (!filters.info && !filters.warning && !filters.error) return removeSub(s)
    await updateSub(s, { filters })
  }
  async function copySubs(from: Device, targets: string[]) {
    const src = subsOf(from.id)
    const del = await supabase.from('alarm_subscriptions').delete().in('device_id', targets)
    if (del.error) return fail(del.error)
    const rows = targets.flatMap((dev) =>
      src.map((s) => ({ recipient_id: s.recipient_id, device_id: dev, filters: s.filters })),
    )
    if (rows.length) {
      const { error } = await supabase.from('alarm_subscriptions').insert(rows)
      if (error) return fail(error)
    }
    setFlash(`Destinataires de ${from.name} copiés sur ${targets.length} box (à envoyer)`)
  }

  // --- escalade ----------------------------------------------------------------------------
  async function saveEscalation(deviceId: string, config: Escalation) {
    const { error } = await supabase
      .from('device_escalation')
      .upsert({ device_id: deviceId, config, updated_at: new Date().toISOString() } as never)
    if (error) return (fail(error), false)
    const e = escOf(deviceId)
    if (e) e.config = config
    else escalations.value.push({ device_id: deviceId, config, baseline: null })
    return true
  }

  // --- envoi -------------------------------------------------------------------------------
  async function send(d: Device, force = false): Promise<void> {
    const recipients = subsOf(d.id).length > 0 && (d.reported === null || diffCount(d) > 0)
    const { data, error } = await supabase.rpc('queue_alarm_sync', {
      p_device: d.id,
      p_force: force,
      p_recipients: recipients,
    })
    if (error) return fail(error)
    const res = data as { status: string; detail?: string; escalation_skipped?: boolean }
    if (res.status === 'conflict') {
      if (confirm(`${d.name} : ${res.detail}.\n\nImposer quand même la configuration du portail ?`))
        return send(d, true)
      return
    }
    if (res.status !== 'queued') return setFlash(`${d.name} : ${res.detail ?? res.status}`)
    setFlash(
      `${d.name} : envoi programmé (appliqué au prochain push de la box)` +
        (res.escalation_skipped ? ' — escalade non envoyée (firmware antérieur à 1.3.10)' : ''),
    )
  }

  async function importFromBoxes(companyId: string) {
    const { data, error } = await supabase.rpc('import_alarm_config', { p_company: companyId })
    if (error) return fail(error)
    const r = data as { devices: number; people_created: number; subscriptions_created: number }
    setFlash(
      `Import : ${r.devices} box lues, ${r.people_created} personnes et ${r.subscriptions_created} abonnements créés`,
    )
  }

  // --- personnes ---------------------------------------------------------------------------
  async function savePerson(p: Person) {
    const alarm = {
      name: p.name.trim(),
      phone: p.phone?.trim() || null,
      alarm_enabled: p.alarm_enabled,
      alarm_channels: p.alarm_channels,
      alarm_schedule_days: p.alarm_schedule_days,
      updated_at: new Date().toISOString(),
    }
    // l'email d'une personne avec accès portail est son identifiant de connexion : non modifiable ici
    const row = p.portal_access
      ? alarm
      : { ...alarm, contact_email: p.contact_email?.trim() || null }
    const { error } = p.id
      ? await supabase
          .from('recipients')
          .update(row as never)
          .eq('id', p.id)
      : await supabase.from('recipients').insert({
          ...row,
          company_id: p.company_id,
          role: 'viewer',
          portal_access: false,
        } as never)
    if (error) return (fail(error), false)
    setFlash(`${alarm.name} enregistré`)
    return true
  }
  async function deletePerson(p: Person) {
    if (p.portal_access) {
      setFlash(`${p.name} a un accès portail : le supprimer depuis « Destinataires »`)
      return false
    }
    const inEsc = subs.value.filter(
      (s) => s.recipient_id === p.id && levelsUsing(s.device_id, s.box_recipient_id).length,
    )
    if (inEsc.length) {
      setFlash(
        `${p.name} est dans l'escalade de ${inEsc.length} box : retire-le d'abord de ces escalades`,
      )
      return false
    }
    const { error } = await supabase.from('recipients').delete().eq('id', p.id)
    if (error) return (fail(error), false)
    return true
  }
  /** donne l'accès portail (envoie un mail d'invitation) */
  async function invite(p: Person, role: 'viewer' | 'admin') {
    const { data, error } = await supabase.functions.invoke('invite-recipient', {
      body: {
        recipient_id: p.id,
        name: p.name,
        contact_email: p.contact_email,
        phone: p.phone,
        role,
        company_id: p.company_id,
      },
    })
    if (error || !data?.ok)
      return (setFlash(`Erreur : ${error?.message ?? data?.error?.message}`), false)
    setFlash(`Invitation envoyée à ${p.contact_email}`)
    return true
  }

  return {
    loading,
    flash,
    companyLabel,
    people,
    subs,
    devices,
    escalations,
    load,
    setFlash,
    personById,
    subsOf,
    subOf,
    escOf,
    pilotable,
    escalationPilotable,
    capability,
    channelsOn,
    memberName,
    memberChannels,
    resolveEscalation,
    diffCount,
    escalationDirty,
    syncState,
    receives,
    invisibleBoxes,
    addSubs,
    removeSub,
    updateSub,
    toggleFilter,
    copySubs,
    levelsUsing,
    saveEscalation,
    send,
    importFromBoxes,
    savePerson,
    deletePerson,
    invite,
  }
}
export type AlarmConfig = ReturnType<typeof useAlarmConfig>

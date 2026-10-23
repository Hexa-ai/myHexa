// PROTOTYPE — aperçu « qui reçoit quoi » : rejoue, côté portail, les règles du firmware de la box
// (hai-pxxx-ai v1.3.11 : notifications_service.filter_recipients, escalation_service._run_chain/_dispatch).
//  - Deux modes exclusifs : si une chaîne démarre pour ce type, personne n'est prévenu en direct.
//  - Chaîne seulement si mode escalade + type escaladé + au moins un niveau avec membre ; sinon envoi direct.
//  - Envoi direct : mail + SMS, jamais d'appel.
//  - En escalade : canal utilisé = coché sur la fiche ET pour le membre à ce niveau ; filtre de type et jours comptent.
//  - Niveau 1 tout de suite ; chaque niveau attend son délai (× (relances + 1)) avant le suivant.
//  - Cumul : les niveaux précédents sont recontactés à chaque envoi.
import type {
  AlarmConfig,
  Channels,
  Device,
  Escalation,
  Filters,
  Person,
  Sub,
} from './useAlarmConfig'
import { DAYS } from './useAlarmConfig'

export type Send = { name: string; channels: (keyof Channels)[] }
export type Step = { at: number; label: string; sends: Send[] }
export type Preview = {
  mode: 'direct' | 'chain' | 'none'
  steps: Step[]
  warnings: string[]
  notes: string[]
}

const CH_LABEL: Record<keyof Channels, string> = { email: 'mail', sms: 'SMS', call: 'appel' }
export const chList = (c: (keyof Channels)[]) => c.map((k) => CH_LABEL[k]).join(' + ')
export const fmtMin = (s: number) => (s === 0 ? 'tout de suite' : `+${Math.round(s / 60)} min`)

export function buildPreview(
  cfg: AlarmConfig,
  d: Device,
  type: keyof Filters,
  escOverride?: Escalation | null,
): Preview {
  const warnings: string[] = []
  const notes: string[] = []
  const rows = cfg
    .subsOf(d.id)
    .map((s) => ({ s, p: cfg.personById.value.get(s.recipient_id) })) as { s: Sub; p: Person }[]
  const reported = new Map((d.reported ?? []).map((r) => [r.id, r]))
  // le portail n'envoie pas le téléphone (masqué par la box) : la box garde le sien
  const hasPhone = (s: Sub, p: Person) => !!(p.phone || reported.get(s.box_recipient_id)?.phone)
  const hasEmail = (p: Person) => !!p.contact_email
  const esc: Escalation | null =
    escOverride !== undefined ? escOverride : (cfg.escOf(d.id)?.config ?? d.reportedEscalation)
  const label = type === 'error' ? 'erreurs' : type === 'warning' ? 'warnings' : 'infos'

  // jours : la box saute la personne le jour où elle n'est pas de service
  for (const { s, p } of rows) {
    const days = s.schedule_days_override ?? p.alarm_schedule_days
    if (p.alarm_enabled && s.filters[type] && days.length < 7) {
      const off = DAYS.filter(([k]) => !days.includes(k)).map(([k]) => k.slice(0, 3))
      notes.push(`${p.name} ne reçoit rien ces jours-là : ${off.join(', ')}`)
    }
  }

  const chain =
    !!esc &&
    esc.mode === 'escalation' &&
    !!esc.types[type] &&
    esc.levels.some((l) => l.members.length > 0)

  if (!chain) {
    if (esc && esc.mode === 'escalation' && !esc.types[type])
      notes.push(`Les ${label} ne sont pas escaladées : envoi direct à tous les abonnés.`)
    const sends: Send[] = []
    for (const { s, p } of rows) {
      if (!p?.alarm_enabled || !s.filters[type]) continue
      const ch = cfg.channelsOn(s)
      const out: (keyof Channels)[] = []
      if (ch?.email && hasEmail(p)) out.push('email')
      if (ch?.sms) {
        if (hasPhone(s, p)) out.push('sms')
        else warnings.push(`${p.name} : SMS coché mais pas de numéro`)
      }
      if (ch?.call && !ch.sms && !ch.email)
        warnings.push(
          `${p.name} : seul l'appel est coché, or l'envoi direct n'appelle jamais → rien reçu`,
        )
      else if (ch?.call)
        notes.push(`${p.name} : l'appel ne sert qu'en escalade, pas en envoi direct`)
      if (out.length) sends.push({ name: p.name, channels: out })
    }
    if (!sends.length) warnings.push(`Personne ne reçoit les ${label} sur cette box.`)
    return {
      mode: sends.length ? 'direct' : 'none',
      steps: sends.length ? [{ at: 0, label: 'Envoi direct', sends }] : [],
      warnings,
      notes,
    }
  }

  // --- chaîne -------------------------------------------------------------------------------
  const byBox = new Map(rows.map((r) => [r.s.box_recipient_id, r]))
  const inChain = new Set(esc!.levels.flatMap((l) => l.members))
  for (const { s, p } of rows)
    if (p.alarm_enabled && s.filters[type] && !inChain.has(s.box_recipient_id))
      notes.push(
        `${p.name} reçoit les ${label} mais n'est dans aucun niveau : rien pendant l'escalade`,
      )

  const steps: Step[] = []
  const warned = new Set<string>()
  const warnOnce = (w: string) => (warned.has(w) ? null : (warned.add(w), warnings.push(w)))
  /** destinataires d'un envoi au niveau `idx` (avec cumul éventuel), dédoublonnés par canal */
  function dispatch(idx: number): Send[] {
    const start = esc!.cumulative ? 0 : idx
    const seen: Record<keyof Channels, Set<string>> = {
      email: new Set(),
      sms: new Set(),
      call: new Set(),
    }
    const out = new Map<string, (keyof Channels)[]>()
    for (let i = start; i <= idx; i++) {
      const lv = esc!.levels[i]
      for (const m of lv.members) {
        const r = byBox.get(m)
        if (!r) {
          warnOnce(
            `niveau ${i + 1} : ${cfg.memberName(d.id, m)} n'est plus destinataire de la box (ignoré)`,
          )
          continue
        }
        const { s, p } = r
        if (!p.alarm_enabled) {
          warnOnce(`niveau ${i + 1} : ${p.name} a les alarmes désactivées → pas prévenu`)
          continue
        }
        if (!s.filters[type]) {
          warnOnce(
            `niveau ${i + 1} : ${p.name} ne reçoit pas les ${label} sur cette box → pas prévenu`,
          )
          continue
        }
        const fiche = cfg.channelsOn(s)
        const allowed = cfg.memberChannels(d.id, lv, m)
        const got: (keyof Channels)[] = []
        for (const k of ['email', 'sms', 'call'] as (keyof Channels)[]) {
          if (!allowed[k]) continue
          if (!fiche?.[k]) {
            warnOnce(
              `niveau ${i + 1} : ${CH_LABEL[k]} demandé pour ${p.name} mais pas coché sur sa fiche → pas envoyé`,
            )
            continue
          }
          if (k === 'email' ? !hasEmail(p) : !hasPhone(s, p)) {
            warnOnce(
              `niveau ${i + 1} : ${p.name} sans ${k === 'email' ? 'email' : 'numéro'} → pas de ${CH_LABEL[k]}`,
            )
            continue
          }
          if (seen[k].has(m)) continue
          seen[k].add(m)
          got.push(k)
        }
        if (got.length) out.set(p.name, [...(out.get(p.name) ?? []), ...got])
        else warnOnce(`niveau ${i + 1} : ${p.name} ne serait prévenu par aucun canal`)
      }
    }
    return [...out].map(([name, channels]) => ({ name, channels }))
  }

  let t = 0
  esc!.levels.forEach((lv, i) => {
    const name = lv.name || `Niveau ${i + 1}`
    const sends = dispatch(i)
    steps.push({ at: t, label: `${name}${i > 0 && esc!.cumulative ? ' (cumul)' : ''}`, sends })
    for (let r = 1; r <= (lv.reminders || 0); r++) {
      t += lv.delay_seconds
      steps.push({ at: t, label: `${name} — relance ${r}`, sends })
    }
    t += lv.delay_seconds
  })
  notes.push(
    `Sans acquittement (réponse OK au SMS, touche 1 à l'appel, ou page Alarmes), le dernier envoi part à ${fmtMin(t - esc!.levels[esc!.levels.length - 1].delay_seconds)}.`,
  )
  if (esc!.stop_on_clear) notes.push("Elle s'arrête aussi si l'alarme disparaît.")
  return { mode: 'chain', steps, warnings, notes }
}

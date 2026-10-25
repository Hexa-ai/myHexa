// deno test --no-lock supabase/functions/_shared/alarms_test.ts
import { assert, assertEquals } from 'jsr:@std/assert@1'
import { dedupe, eventsFromPayload, occurrences, readEvents, stats, writeEvents, type AlarmEvent } from './alarms.ts'

const H = 3600e3
const T0 = Date.UTC(2026, 9, 20) // 20/10 00:00 UTC
const ev = (h: number, name: string, on: boolean, severity: AlarmEvent['severity'] = 'error'): AlarmEvent => ({
  ts: T0 + h * H, name, on, severity, label: on ? 'ON' : 'OFF', description: name + ' desc', day: '2026-10-20', src: 1,
})

Deno.test('payload -> événements (valeur, gravité, lignes invalides ignorées)', () => {
  const e = eventsFromPayload(
    { alarm_events: [
      { name: 'A', value: 1, timestamp: T0, type_alarm: 'warning', state_label: 'ON' },
      { name: 'A', value: 0, timestamp: T0 + H, type_alarm: 'warning', state_label: 'OFF' },
      { name: '', value: 1, timestamp: T0 },
      { name: 'B', value: 1 },
    ] },
    '2026-10-20',
    1,
  )
  assertEquals(e.length, 2)
  assertEquals([e[0].on, e[1].on, e[0].severity], [true, false, 'warning'])
})

Deno.test('dédoublonnage : même alarme, même instant, même état', () => {
  const a = ev(1, 'A', true)
  assertEquals(dedupe([a, { ...a, src: 2 }, ev(2, 'A', false)]).length, 2)
  assertEquals(dedupe([{ ...a, src: 2 }, a])[0].src, 1)
})

Deno.test('aller-retour Parquet', async () => {
  const rows = [ev(1, 'A', true), ev(2, 'A', false, 'error'), ev(3, 'Bé', true, 'info')]
  const back = await readEvents(writeEvents(rows).buffer as ArrayBuffer)
  assertEquals(back.map((r) => [r.ts, r.name, r.on, r.severity, r.day]), rows.map((r) => [r.ts, r.name, r.on, r.severity, r.day]))
})

Deno.test('occurrences : bornage début / fin de plage, en cours', () => {
  const evs = [ev(-2, 'A', true), ev(1, 'A', false), ev(3, 'A', true), ev(4, 'A', false), ev(10, 'B', true)]
  const occ = occurrences('d', evs, T0, T0 + 24 * H, {}, T0 + 100 * H)
  const a = occ.filter((o) => o.name === 'A').sort((x, y) => x.start - y.start)
  assertEquals(a.length, 2)
  assert(a[0].before && a[0].duration === 1 * H, 'active avant la plage : compte depuis le début')
  assertEquals(a[1].duration, 1 * H)
  const b = occ.find((o) => o.name === 'B')!
  assert(b.ongoing && b.end === null && b.duration === 14 * H, 'sans fin : jusqu’à la fin de plage')
})

Deno.test('occurrences : en cours bornée à maintenant', () => {
  const occ = occurrences('d', [ev(10, 'B', true)], T0, T0 + 24 * H, {}, T0 + 12 * H)
  assertEquals(occ[0].duration, 2 * H)
})

Deno.test('occurrences : terminée avant la plage = ignorée ; OFF orphelin = depuis le début', () => {
  assertEquals(occurrences('d', [ev(-5, 'A', true), ev(-4, 'A', false)], T0, T0 + 24 * H).length, 0)
  const o = occurrences('d', [ev(2, 'A', false)], T0, T0 + 24 * H)
  assertEquals([o.length, o[0].duration, o[0].before], [1, 2 * H, true])
})

Deno.test('filtres nom / gravité', () => {
  const evs = [ev(1, 'A', true), ev(2, 'A', false), ev(1, 'W', true, 'warning'), ev(2, 'W', false, 'warning'), ev(1, 'I', true, 'info')]
  assertEquals(occurrences('d', evs, T0, T0 + 24 * H, { severities: ['warning'] }).map((o) => o.name), ['W'])
  assertEquals(occurrences('d', evs, T0, T0 + 24 * H, { names: ['A', 'I'] }).length, 2)
})

Deno.test('statistiques : parts et taux de présence', () => {
  const evs = [ev(0, 'A', true), ev(1, 'A', false), ev(2, 'A', true), ev(3, 'A', false), ev(4, 'B', true), ev(10, 'B', false)]
  const { rows, totals } = stats(occurrences('d', evs, T0, T0 + 24 * H), T0, T0 + 24 * H, T0 + 48 * H)
  const a = rows.find((r) => r.name === 'A')!
  const b = rows.find((r) => r.name === 'B')!
  assertEquals([a.count, a.duration, a.longest], [2, 2 * H, H])
  assertEquals(Math.round(a.share_count), 67)
  assertEquals(Math.round(b.share_duration), 75)
  assertEquals(Math.round(b.presence), 25)
  assertEquals(totals.error, { count: 3, duration: 8 * H })
  assertEquals(rows[0].name, 'A') // tri : occurrences d'abord
})

Deno.test('texte mal encodé réparé, texte correct inchangé', async () => {
  const { fixMojibake } = await import('./alarms.ts')
  assertEquals(fixMojibake('Defaut niveau trÃ¨s haut'), 'Defaut niveau très haut')
  assertEquals(fixMojibake('très haut'), 'très haut')
  assertEquals(fixMojibake('Surp N°1 DEF'), 'Surp N°1 DEF')
})

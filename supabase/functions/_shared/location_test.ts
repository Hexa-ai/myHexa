import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { parseLocation } from './location.ts'

const NOW = Date.parse('2026-10-31T12:00:00Z')
const good = { latitude: 45.7, longitude: 4.8, accuracy_m: 1250.4, source: 'cell', approximate: true, resolved_at: '2026-10-31T11:30:00Z' }

Deno.test('clé absente, null ou corps vide -> absent', () => {
  assertEquals(parseLocation({}, NOW).kind, 'absent')
  assertEquals(parseLocation({ location: null }, NOW).kind, 'absent')
  assertEquals(parseLocation(null, NOW).kind, 'absent')
  assertEquals(parseLocation('x', NOW).kind, 'absent')
})
Deno.test('position valide', () => {
  const r = parseLocation({ location: good }, NOW)
  assertEquals(r.kind, 'ok')
  if (r.kind === 'ok') {
    assertEquals(r.loc.latitude, 45.7)
    assertEquals(r.loc.accuracy_m, 1250)
    assertEquals(r.loc.resolved_at, '2026-10-31T11:30:00.000Z')
    assertEquals(r.loc.approximate, true)
  }
})
Deno.test('précision et date facultatives', () => {
  const r = parseLocation({ location: { latitude: -33.9, longitude: 151.2, accuracy_m: null, resolved_at: null } }, NOW)
  assertEquals(r.kind, 'ok')
  if (r.kind === 'ok') {
    assertEquals(r.loc.accuracy_m, null)
    assertEquals(r.loc.resolved_at, null)
    assertEquals(r.loc.source, 'cell')
  }
})
Deno.test('date future ramenée à maintenant ; précision négative ou absurde ignorée', () => {
  const r = parseLocation({ location: { ...good, resolved_at: '2030-01-01T00:00:00Z', accuracy_m: -5 } }, NOW)
  assertEquals(r.kind, 'ok')
  if (r.kind === 'ok') {
    assertEquals(r.loc.resolved_at, '2026-10-31T12:00:00.000Z')
    assertEquals(r.loc.accuracy_m, null)
  }
  const s = parseLocation({ location: { ...good, resolved_at: 'pas une date', accuracy_m: 1e12 } }, NOW)
  if (s.kind === 'ok') {
    assertEquals(s.loc.resolved_at, null)
    assertEquals(s.loc.accuracy_m, null)
  }
})
Deno.test('valeurs invalides', () => {
  for (const loc of [
    'texte',
    [],
    { latitude: '45.7', longitude: 4.8 },
    { latitude: 45.7 },
    { latitude: 91, longitude: 4 },
    { latitude: 45, longitude: -181 },
    { latitude: NaN, longitude: 4 },
    { latitude: 0, longitude: 0 },
  ]) {
    assertEquals(parseLocation({ location: loc }, NOW).kind, 'invalid', JSON.stringify(loc))
  }
})

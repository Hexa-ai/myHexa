// deno test --no-lock supabase/functions/_shared/drift_test.ts
import { assert, assertEquals } from 'jsr:@std/assert@1'
import { alarmBurst, confirm, longTerm, shortTerm } from './drift.ts'

// bruit déterministe
let seed = 7
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2
const series = (n: number, f: (i: number) => number, noise = 1) => Array.from({ length: n }, (_, i) => f(i) + rnd() * noise)
const N = 91

Deno.test('jour normal : rien', () => {
  const d = series(N, () => 50)
  assertEquals(shortTerm('P', d[N - 1], d.slice(N - 29, N - 1)), null)
  assertEquals(longTerm('P', d), null)
})

Deno.test('pic isolé : détecté puis déclassé (non confirmé sur 7 jours)', () => {
  const d = series(N, () => 50)
  d[N - 1] = 58
  const a = shortTerm('P', d[N - 1], d.slice(N - 29, N - 1))!
  assert(a && a.kind === 'anomaly' && a.severity >= 4, JSON.stringify(a))
  const sev = a.severity
  confirm(a, d)
  assertEquals(a.evidence.consolidation, 'isolated_peak')
  assertEquals(a.severity, sev - 2)
})

Deno.test('décalage durable sur la semaine : confirmé', () => {
  const d = series(N, (i) => (i >= N - 7 ? 56 : 50))
  const a = shortTerm('P', d[N - 1], d.slice(N - 29, N - 1))!
  assert(a, 'anomalie attendue')
  confirm(a, d)
  assertEquals(a.evidence.consolidation, 'confirmed_7d')
})

Deno.test('dérive lente (+30 % en 12 semaines) : long terme, sans alerte court terme', () => {
  const d = series(N, (i) => 50 * (1 + (0.3 * i) / N), 0.5)
  const t = longTerm('P', d)!
  assert(t && t.kind === 'trend' && t.evidence.direction === 'up' && t.severity >= 2, JSON.stringify(t))
  assert((t.evidence.drift_pct_over_window as number) > 20)
  assertEquals(shortTerm('P', d[N - 1], d.slice(N - 29, N - 1)), null)
})

Deno.test('baisse lente : direction down', () => {
  const d = series(N, (i) => 100 - (40 * i) / N, 0.5)
  assertEquals(longTerm('P', d)?.evidence.direction, 'down')
})

Deno.test('bruit fort sans pente : pas de dérive', () => {
  const d = series(N, () => 50, 15)
  const t = longTerm('P', d)
  assert(!t || t.severity <= 2, JSON.stringify(t?.evidence))
})

Deno.test('historique trop court : rien', () => {
  const d = series(20, () => 50)
  assertEquals(longTerm('P', [...Array(N - 20).fill(NaN), ...d]), null)
  assertEquals(shortTerm('P', 99, [50, 51, 49]), null)
})

Deno.test('trous dans l’historique tolérés', () => {
  const d = series(N, (i) => 50 * (1 + (0.4 * i) / N), 0.5).map((v, i) => (i % 5 === 0 ? NaN : v))
  assert(longTerm('P', d), 'dérive attendue malgré les trous')
})

Deno.test('grandeur très stable : quelques % ne sont pas une anomalie', () => {
  const d = series(N, () => 1000, 2)
  assertEquals(shortTerm('V', 960, d.slice(N - 29, N - 1), 10), null)
  assert(shortTerm('V', 700, d.slice(N - 29, N - 1), 10))
})

Deno.test('rafale d’alarmes', () => {
  const ev = Array.from({ length: 8 }, () => ({ name: 'DEF_POMPE' }))
  const b = alarmBurst(8, [0, 1, 0, 2, 1, 0, 1], ev)!
  assert(b && b.severity === 4 && (b.evidence.top_alarms as { name: string }[])[0].name === 'DEF_POMPE')
  assertEquals(alarmBurst(3, [2, 3, 2, 3, 2, 3, 2], ev), null)
})

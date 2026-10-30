import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// le transport réel importe le client Supabase (variables d'environnement) : inutile ici, la source est factice
vi.mock('@/lib/supabase', () => ({ supabase: {} }))

import { useLiveStore, backoffMs, TRAIL_MAX_POINTS, TRAIL_MS } from '@/stores/live'
import type { LiveChannel, LiveHandlers, LiveSource, ViewerMeta } from '@/lib/live/types'
import { parseValues, boxPresent, createValuesDecoder } from '@/lib/live/supabaseSource'
import { FAST_DURATION_MS } from '@/lib/live'

interface FakeChan extends LiveChannel {
  id: string
  h: LiveHandlers
  viewer: ViewerMeta | null
  tracks: (ViewerMeta | null)[]
  closed: boolean
}

function fakeSource() {
  const chans: FakeChan[] = []
  const src: LiveSource = {
    open(id, h) {
      const c: FakeChan = {
        id,
        h,
        viewer: null,
        tracks: [],
        closed: false,
        setViewer(m) {
          c.viewer = m
          c.tracks.push(m)
        },
        close() {
          c.closed = true
        },
      }
      chans.push(c)
      return c
    },
  }
  const open = () => chans.filter((c) => !c.closed)
  return { src, chans, open }
}

const FIFTEEN = FAST_DURATION_MS // 15 min par défaut (réduit par VITE_LIVE_FAST_MS pour les tests e2e)

function join(c: FakeChan, capable = true) {
  c.h.onStatus('joined')
  c.h.onBox(capable)
}
const vals = (c: FakeChan, d: Record<string, unknown>, full = false) =>
  c.h.onValues({
    t: Date.now(),
    full,
    d: Object.fromEntries(Object.entries(d).map(([k, v]) => [k, [v, Date.now()]])) as never,
  })

describe('liveStore', () => {
  let f: ReturnType<typeof fakeSource>
  let live: ReturnType<typeof useLiveStore>

  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    live = useLiveStore()
    f = fakeSource()
    live.setSource(f.src)
    Object.defineProperty(document, 'hidden', { value: false, configurable: true })
  })
  afterEach(() => {
    live.reset()
    vi.useRealTimers()
  })

  it('un seul canal par box, même avec plusieurs observateurs et une session', () => {
    const r1 = live.watch(['a', 'b'])
    const r2 = live.watch(['a'])
    live.start(['a'], 'fast')
    expect(f.chans.length).toBe(2)
    expect(live._openChannels().sort()).toEqual(['a', 'b'])
    r1()
    // « a » est encore utilisée (observateur 2 + session), « b » plus
    expect(f.open().map((c) => c.id)).toEqual(['a'])
    r2()
    expect(f.open().map((c) => c.id)).toEqual(['a'])
    live.stop()
    expect(f.open().length).toBe(0)
  })

  it("la capacité n'apparaît que si la box est présente sur son canal", () => {
    live.watch(['a', 'b'])
    expect(live.anyCapable(['a', 'b'])).toBe(false)
    join(f.chans[0], true)
    join(f.chans[1], false)
    expect(live.capable('a')).toBe(true)
    expect(live.capable('b')).toBe(false)
    expect(live.anyCapable(['b'])).toBe(false)
    expect(live.anyCapable(['a', 'b'])).toBe(true)
    // la box se déconnecte
    f.chans[0].h.onBox(false)
    expect(live.anyCapable(['a', 'b'])).toBe(false)
  })

  it('direct rapide : présence annoncée, valeurs servies, rien sans session', () => {
    live.watch(['a'])
    join(f.chans[0])
    vals(f.chans[0], { T1: 5 })
    expect(live.value('a', 'T1')).toBeUndefined() // pas de session : statut 30 min inchangé
    live.start(['a'], 'fast')
    expect(f.chans[0].viewer).toMatchObject({ role: 'viewer', mode: 'fast' })
    expect(live.uiState).toBe('live')
    vals(f.chans[0], { T1: 21.5, POMPE: true, TXT: 'ok' }, true)
    expect(live.value('a', 'T1')).toBe(21.5)
    expect(live.value('a', 'POMPE')).toBe(true)
    live.stop()
    expect(f.chans[0].viewer).toBeNull()
    expect(live.value('a', 'T1')).toBeUndefined()
  })

  it('arrêt après 15 min, bandeau « continuer », puis nouveau délai complet', () => {
    live.start(['a'], 'fast')
    join(f.chans[0])
    expect(live.uiState).toBe('live')
    const first = f.chans[0].viewer!.since
    vi.advanceTimersByTime(FIFTEEN - 1000)
    expect(live.uiState).toBe('live')
    vi.advanceTimersByTime(1500)
    expect(live.uiState).toBe('expired')
    expect(live.expired).toBe(true)
    expect(f.chans[0].viewer).toBeNull() // la box arrête d'émettre
    vals(f.chans[0], { T1: 1 })
    expect(live.value('a', 'T1')).toBeUndefined() // repli statut 30 min
    live.continueLive()
    expect(live.uiState).toBe('live')
    expect(f.chans[0].viewer!.since).toBeGreaterThan(first) // présence ré-annoncée
    vi.advanceTimersByTime(FIFTEEN - 1000)
    expect(live.uiState).toBe('live')
    vi.advanceTimersByTime(1500)
    expect(live.uiState).toBe('expired')
  })

  it("onglet caché : pause, le délai ne s'écoule pas, reprise avec nouvelle annonce", () => {
    live.start(['a'], 'fast')
    join(f.chans[0])
    vi.advanceTimersByTime(FIFTEEN / 3)
    const before = f.chans[0].viewer!.since
    Object.defineProperty(document, 'hidden', { value: true, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(live.uiState).toBe('paused')
    expect(f.chans[0].viewer).toBeNull()
    vi.advanceTimersByTime(60 * 60_000) // une heure cachée : aucun arrêt, aucun bandeau
    expect(live.uiState).toBe('paused')
    Object.defineProperty(document, 'hidden', { value: false, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(live.uiState).toBe('live')
    expect(f.chans[0].viewer!.since).toBeGreaterThan(before)
    vi.advanceTimersByTime((FIFTEEN * 2) / 3 - 2000) // 1/3 + 2/3 de la durée cumulés, moins 2 s
    expect(live.uiState).toBe('live')
    vi.advanceTimersByTime(3000)
    expect(live.uiState).toBe('expired')
  })

  it('affichage permanent (lent) : aucune limite de durée', () => {
    live.start(['a'], 'slow')
    join(f.chans[0])
    expect(f.chans[0].viewer).toMatchObject({ mode: 'slow' })
    expect(live.remainingMs).toBeNull()
    vi.advanceTimersByTime(24 * 3600_000)
    expect(live.uiState).toBe('live')
    expect(f.chans[0].viewer).toMatchObject({ mode: 'slow' })
  })

  it("la box signale sa propre limite (etat « pause ») : même traitement que l'arrêt", () => {
    live.start(['a'], 'fast')
    join(f.chans[0])
    f.chans[0].h.onState({ direct: 'pause', mode: 'fast' })
    expect(live.uiState).toBe('expired')
  })

  it('connexion perdue : repli sur les valeurs 30 min, reprise avec délai, présence ré-annoncée', () => {
    live.start(['a'], 'fast')
    join(f.chans[0])
    vals(f.chans[0], { T1: 3 })
    expect(live.value('a', 'T1')).toBe(3)
    f.chans[0].h.onStatus('lost')
    expect(f.chans[0].closed).toBe(true)
    expect(live.value('a', 'T1')).toBeUndefined()
    expect(live.uiState).toBe('degraded')
    expect(f.chans.length).toBe(1)
    vi.advanceTimersByTime(2000) // 1er essai : entre 0,5 s et 1 s
    expect(f.chans.length).toBe(2)
    join(f.chans[1])
    expect(f.chans[1].viewer).toMatchObject({ role: 'viewer', mode: 'fast' })
    expect(live.uiState).toBe('live')
  })

  it("les reprises s'espacent (délai exponentiel plafonné) et se taisent quand plus personne n'écoute", () => {
    const rel = live.watch(['a'])
    for (let i = 0; i < 6; i++) {
      f.chans[f.chans.length - 1].h.onStatus('lost')
      vi.advanceTimersByTime(400_000)
    }
    expect(f.chans.length).toBe(7)
    rel()
    f.chans[f.chans.length - 1].h.onStatus('lost')
    vi.advanceTimersByTime(900_000)
    expect(f.chans.length).toBe(7) // libéré : aucune nouvelle tentative
    expect(backoffMs(0, 60_000, () => 0)).toBe(500)
    expect(backoffMs(20, 60_000, () => 1)).toBe(60_000)
  })

  it('fenêtre glissante bornée (durée et nombre de points) : pas de fuite sur 1 h', () => {
    live.start(['a'], 'fast')
    join(f.chans[0])
    // 3 h de valeurs à 1 s : la mémoire reste bornée
    for (let i = 0; i < 3 * 3600; i++) {
      vi.advanceTimersByTime(1000)
      vals(f.chans[0], { T1: i % 50 })
      if (live.expired) live.continueLive() // ne pas s'arrêter à la fin du délai
    }
    expect(live._trailSize()).toBeLessThanOrEqual(TRAIL_MAX_POINTS)
    const t = live.trail('a', 'T1', 60 * 60_000)
    expect(t.length).toBeGreaterThan(3000)
    expect(t[0][0]).toBeGreaterThanOrEqual(Date.now() - TRAIL_MS)
    // fenêtre 5 min : une seule seconde sur 300 points
    expect(live.trail('a', 'T1', 5 * 60_000).length).toBeLessThanOrEqual(305)
    // le bord droit est prolongé jusqu'à maintenant
    expect(t[t.length - 1][0]).toBe(Date.now())
    live.stop()
    expect(live._trailSize()).toBe(0)
  })

  it('désabonnement propre : stop() retire la présence, ferme le canal et le minuteur', () => {
    live.start(['a', 'b'], 'fast')
    f.chans.forEach((c) => join(c))
    live.stop()
    expect(f.chans.every((c) => c.closed)).toBe(true)
    expect(f.chans.every((c) => c.viewer === null)).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('changer de mode ne laisse pas de présence fantôme', () => {
    live.start(['a'], 'fast')
    join(f.chans[0])
    live.start(['a'], 'slow')
    expect(f.chans[0].viewer).toMatchObject({ mode: 'slow' })
    expect(f.chans.length).toBe(1) // même canal réutilisé
  })

  it('parseValues / boxPresent : messages du contrat, entrées invalides ignorées', () => {
    expect(parseValues(null)).toBeNull()
    const m = parseValues({ v: 1, t: 10, full: true, d: { A: [1.5, 5], B: [true, 6], C: 'x', D: [{}, 1] } })!
    expect(Object.keys(m.d)).toEqual(['A', 'B'])
    expect(m.full).toBe(true)
    expect(boxPresent({ k: [{ role: 'viewer' }] })).toBe(false)
    expect(boxPresent({ k: [{ role: 'box', caps: ['valeurs'] }] })).toBe(true)
    expect(boxPresent({ k: [{ role: 'box', caps: ['cmd'] }] })).toBe(false)
    expect(boxPresent({ k: [{ role: 'box' }] })).toBe(true)
  })

  it('format v2 compact : dictionnaire par époque, index inconnus ignorés, v1 toujours lu', () => {
    const dec = createValuesDecoder()
    // delta reçu avant l'instantané (spectateur arrivé en cours) : rien d'exploitable
    expect(dec({ v: 2, e: 7, s: 1, t: 100, d: [0, 1.5] })!.d).toEqual({})
    const full = dec({ v: 2, e: 7, s: 2, t: 200, f: 1, k: { 0: 'TT01', 1: 'POMPE' }, d: [0, 20.5, 1, true] })!
    expect(full.full).toBe(true)
    expect(full.d).toEqual({ TT01: [20.5, 200], POMPE: [true, 200] })
    expect(dec({ v: 2, e: 7, s: 3, t: 300, d: [0, 21] })!.d).toEqual({ TT01: [21, 300] })
    // nouvelle variable : nom une fois, puis index seul
    expect(dec({ v: 2, e: 7, s: 4, t: 400, k: { 2: 'NIV' }, d: [2, 3] })!.d).toEqual({ NIV: [3, 400] })
    expect(dec({ v: 2, e: 7, s: 5, t: 500, d: [2, 4, 9, 1, 0, { x: 1 }] })!.d).toEqual({ NIV: [4, 500] })
    // la box a redémarré (autre époque) : ancien dictionnaire oublié
    expect(dec({ v: 2, e: 8, s: 1, t: 600, d: [0, 99] })!.d).toEqual({})
    expect(dec({ v: 2, e: 8, s: 2, t: 700, d: 'x' })).toBeNull()
    // un ancien firmware (v1) sur le même canal
    expect(dec({ v: 1, t: 10, full: false, d: { A: [1, 5] } })!.d).toEqual({ A: [1, 5] })
  })

  it('la présence annonce le format compact (fmt 2)', () => {
    const r = live.watch(['a'])
    live.start(['a'], 'fast')
    join(f.chans[0])
    expect(f.chans[0].viewer).toMatchObject({ role: 'viewer', mode: 'fast', fmt: 2 })
    r()
  })
  it('la présence liste les variables affichées par box, et se met à jour', () => {
    const r = live.watch(['a', 'b'])
    live.setWanted({ a: ['TT02', 'TT01', 'TT01'], b: null })
    live.start(['a', 'b'], 'fast')
    join(f.chans[0])
    join(f.chans[1])
    expect(f.chans[0].viewer).toMatchObject({ vars: ['TT01', 'TT02'] })
    expect(f.chans[1].viewer).not.toHaveProperty('vars') // pas de liste = toutes (compatibilité)
    const before = f.chans[1].viewer
    live.setWanted({ a: ['TT03'], b: null })
    expect(f.chans[0].viewer).toMatchObject({ vars: ['TT03'] })
    expect(f.chans[1].viewer).toBe(before) // box b inchangée : pas de nouvelle annonce
    r()
  })
})

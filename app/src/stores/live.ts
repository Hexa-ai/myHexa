// Mode DIRECT — store partagé (Pinia).
//
// Politique (CONCEPTION.md §5 bis) :
//  - par défaut rien ne change : tuiles et graphiques restent sur les statuts 30 min ;
//  - « œil » : direct RAPIDE (cadence demandée 1-2 s dans la présence) pendant FAST_DURATION_MS (15 min), puis arrêt et
//    bandeau « Continuer le direct ? » ; pause automatique onglet caché (le compteur de durée ne tourne alors pas) ;
//  - affichage permanent (écran mural) : cadence LENTE (~10 s), sans limite de durée ni bandeau.
//
// Robustesse : UN SEUL canal par box (même avec dix tuiles), compté par références ; fermeture dès que plus personne n'en
// a besoin ; reprise avec délai exponentiel + jitter ; fenêtre glissante bornée en temps ET en nombre de points ;
// aucun appel Supabase ici hors du transport (LiveSource), et aucun écouteur d'authentification.
import { defineStore } from 'pinia'
import { computed, reactive, ref } from 'vue'
import type { HistPoint } from '@/composables/useHistory'
import { defaultLiveSource, FAST_DURATION_MS, LIVE_ENABLED } from '@/lib/live'
import type { LiveChannel, LiveRate, LiveSource, LiveValue, ValuesMessage } from '@/lib/live/types'

export type LiveMode = 'off' | LiveRate
export type LiveUiState = 'off' | 'connecting' | 'live' | 'paused' | 'expired' | 'degraded'

/** historique glissant gardé en mémoire par variable : borné en durée et en nombre de points */
export const TRAIL_MS = 65 * 60_000
export const TRAIL_MAX_POINTS = 4500

interface DevState {
  /** la box est présente sur son canal = elle annonce la capacité direct */
  capable: boolean
  joined: boolean
  boxState: 'on' | 'pause' | 'idle' | null
  lastAt: number | null
  values: Record<string, LiveValue>
}

interface Entry {
  ch: LiveChannel | null
  attempt: number
  retry: ReturnType<typeof setTimeout> | null
  /** dernière présence appliquée (évite les annonces redondantes) */
  sent: string | null
}

const num = (v: LiveValue): number | null => {
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) return Number(v)
  return null
}

export function backoffMs(attempt: number, cap: number, rnd: () => number = Math.random): number {
  return Math.min(cap, 1000 * 2 ** Math.min(attempt, 10)) * (0.5 + rnd() * 0.5)
}

export const useLiveStore = defineStore('live', () => {
  let source: LiveSource = defaultLiveSource()
  /** pour les tests et la simulation : change de transport avant toute ouverture */
  function setSource(s: LiveSource) {
    source = s
  }

  const devs = reactive<Record<string, DevState>>({})
  const entries = new Map<string, Entry>()
  const watchCount = new Map<string, number>()
  const sessionIds = new Set<string>()
  const trails = new Map<string, HistPoint[]>()
  /** incrémenté à chaque lot de valeurs : les graphiques temps réel le lisent pour se recalculer */
  const tick = ref(0)
  const now = ref(Date.now())

  const mode = ref<LiveMode>('off')
  const paused = ref(false)
  const expired = ref(false)
  /** budget restant du direct rapide (ms) : ne s'écoule que pendant que le direct tourne, onglet visible */
  const budgetMs = ref(FAST_DURATION_MS)
  const announceTs = ref(0)
  let activeSince: number | null = null
  let expireTimer: ReturnType<typeof setTimeout> | null = null
  let nowTimer: ReturnType<typeof setInterval> | null = null
  let visBound = false
  const rnd = () => Math.random()

  const dev = (id: string): DevState =>
    (devs[id] ??= { capable: false, joined: false, boxState: null, lastAt: null, values: {} })

  const isActive = computed(() => mode.value !== 'off' && !paused.value && !expired.value)

  // ───────── capacité ─────────
  const capable = (id: string) => LIVE_ENABLED && !!devs[id]?.capable
  const anyCapable = (ids: Iterable<string>) => {
    for (const id of ids) if (capable(id)) return true
    return false
  }

  // ───────── canaux (un par box) ─────────
  const needed = (id: string) => (watchCount.get(id) ?? 0) > 0 || sessionIds.has(id)

  function viewerKey(): string | null {
    return isActive.value ? `${mode.value}:${announceTs.value}` : null
  }

  function applyViewer(id: string) {
    const e = entries.get(id)
    if (!e?.ch || !dev(id).joined) return
    const want = sessionIds.has(id) ? viewerKey() : null
    if (want === e.sent) return
    e.sent = want
    e.ch.setViewer(
      want ? { role: 'viewer', mode: mode.value as LiveRate, since: announceTs.value } : null,
    )
  }
  const applyAll = () => sessionIds.forEach(applyViewer)

  function scheduleRetry(id: string, e: Entry) {
    if (e.retry) return
    const cap = sessionIds.has(id) ? 60_000 : 300_000
    const wait = backoffMs(e.attempt++, cap, rnd)
    e.retry = setTimeout(() => {
      e.retry = null
      if (needed(id) && entries.get(id) === e) openChannel(id, e)
    }, wait)
  }

  function openChannel(id: string, e: Entry) {
    const d = dev(id)
    e.sent = null
    // les rappels du transport ne sont appelés qu'après le retour de open() (asynchrone par construction)
    const handle: LiveChannel = (e.ch = source.open(id, {
      onStatus(s) {
        if (e.ch !== handle) return // canal remplacé ou fermé
        if (s === 'joined') {
          e.attempt = 0
          d.joined = true
          applyViewer(id)
        } else {
          d.joined = false
          d.boxState = null
          d.capable = false
          handle.close()
          e.ch = null
          scheduleRetry(id, e)
        }
      },
      onBox(present) {
        if (e.ch === handle) d.capable = present
      },
      onState(m) {
        if (e.ch !== handle) return
        d.boxState = m.direct
        // la box a atteint sa limite de 15 min en mode rapide : même traitement que notre propre fin de délai
        if (m.direct === 'pause' && mode.value === 'fast' && sessionIds.has(id) && isActive.value)
          expire()
      },
      onValues(m) {
        if (e.ch === handle) ingest(id, m)
      },
    }))
  }

  function ensureChannel(id: string) {
    let e = entries.get(id)
    if (!e) entries.set(id, (e = { ch: null, attempt: 0, retry: null, sent: null }))
    if (!e.ch && !e.retry) openChannel(id, e)
  }

  function closeIfUnused(id: string) {
    if (needed(id)) return
    const e = entries.get(id)
    if (!e) return
    if (e.retry) clearTimeout(e.retry)
    e.ch?.setViewer(null)
    e.ch?.close()
    entries.delete(id)
    const d = devs[id]
    if (d) {
      d.joined = false
      d.boxState = null
      d.capable = false
      d.values = {}
      d.lastAt = null
    }
    for (const k of [...trails.keys()]) if (k.startsWith(id + '|')) trails.delete(k)
  }

  /** surveille la capacité direct de ces box (présence de la box sur son canal) ; renvoie la fonction de libération */
  function watch(ids: string[]): () => void {
    if (!LIVE_ENABLED) return () => {}
    const mine = [...new Set(ids)]
    for (const id of mine) {
      watchCount.set(id, (watchCount.get(id) ?? 0) + 1)
      ensureChannel(id)
    }
    let released = false
    return () => {
      if (released) return
      released = true
      for (const id of mine) {
        const n = (watchCount.get(id) ?? 1) - 1
        if (n <= 0) watchCount.delete(id)
        else watchCount.set(id, n)
        closeIfUnused(id)
      }
    }
  }

  // ───────── valeurs et fenêtre glissante ─────────
  function ingest(id: string, m: ValuesMessage) {
    const d = dev(id)
    const t = Date.now()
    d.lastAt = t
    for (const [name, [v]] of Object.entries(m.d)) {
      d.values[name] = v
      const n = num(v)
      if (n === null) continue
      const key = `${id}|${name}`
      let tr = trails.get(key)
      if (!tr) trails.set(key, (tr = []))
      const last = tr[tr.length - 1]
      tr.push([last && t <= last[0] ? last[0] + 1 : t, n, n, n])
      const cutoff = t - TRAIL_MS
      let drop = 0
      while (drop < tr.length && tr[drop][0] < cutoff) drop++
      if (tr.length - drop > TRAIL_MAX_POINTS) drop = tr.length - TRAIL_MAX_POINTS
      if (drop) tr.splice(0, drop)
    }
    tick.value++
  }

  /** valeur directe valide (session active, canal rejoint, box en émission) ; sinon null = repli sur le statut 30 min */
  function value(id: string, name: string): LiveValue | undefined {
    if (!isActive.value || !sessionIds.has(id)) return undefined
    const d = devs[id]
    if (!d || !d.joined || d.boxState === 'pause' || d.boxState === 'idle') return undefined
    return d.values[name]
  }

  /** fenêtre glissante d'une variable (copie), prolongée jusqu'à maintenant par la dernière valeur */
  function trail(id: string, name: string, windowMs: number): HistPoint[] {
    void tick.value
    void now.value
    const tr = trails.get(`${id}|${name}`)
    if (!tr || !tr.length) return []
    const t = Date.now()
    const from = t - windowMs
    let i = 0
    while (i < tr.length && tr[i][0] < from) i++
    // un point avant la fenêtre garde la ligne continue au bord gauche
    const out = tr.slice(Math.max(0, i - 1))
    const last = out[out.length - 1]
    if (last && last[0] < t) out.push([t, last[1], last[2], last[3]])
    return out
  }

  // ───────── session ─────────
  function startClock() {
    if (mode.value !== 'fast' || !isActive.value || activeSince !== null) return
    activeSince = Date.now()
    expireTimer = setTimeout(expire, Math.max(0, budgetMs.value))
  }
  function stopClock() {
    if (activeSince !== null) budgetMs.value = Math.max(0, budgetMs.value - (Date.now() - activeSince))
    activeSince = null
    if (expireTimer) clearTimeout(expireTimer)
    expireTimer = null
  }
  function expire() {
    stopClock()
    budgetMs.value = 0
    expired.value = true
    applyAll()
  }
  /** temps de direct rapide restant (ms), pour l'affichage */
  const remainingMs = computed(() => {
    void now.value
    if (mode.value !== 'fast') return null
    return Math.max(0, budgetMs.value - (activeSince !== null ? Date.now() - activeSince : 0))
  })

  function onVisibility() {
    if (mode.value === 'off') return
    setPaused(document.hidden)
  }
  function setPaused(p: boolean) {
    if (paused.value === p) return
    stopClock()
    paused.value = p
    if (!p) announceTs.value = Date.now() // retour : nouvelle annonce, la box renvoie un instantané complet
    startClock()
    applyAll()
    now.value = Date.now()
  }

  function start(ids: string[], rate: LiveRate) {
    if (!LIVE_ENABLED) return
    stopClock()
    const prev = [...sessionIds]
    sessionIds.clear()
    mode.value = rate
    expired.value = false
    budgetMs.value = FAST_DURATION_MS
    paused.value = typeof document !== 'undefined' && document.hidden
    announceTs.value = Date.now()
    for (const id of new Set(ids)) {
      sessionIds.add(id)
      ensureChannel(id)
    }
    // box qui ne font plus partie de la session : présence retirée, canal fermé si plus personne ne l'utilise
    for (const id of prev) {
      if (sessionIds.has(id)) continue
      applyViewer(id)
      closeIfUnused(id)
    }
    if (nowTimer) clearInterval(nowTimer)
    if (!visBound && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility)
      visBound = true
    }
    nowTimer = setInterval(() => (now.value = Date.now()), 1000)
    startClock()
    applyAll()
  }

  function stop() {
    stopClock()
    if (nowTimer) clearInterval(nowTimer)
    nowTimer = null
    if (visBound) {
      document.removeEventListener('visibilitychange', onVisibility)
      visBound = false
    }
    const ids = [...sessionIds]
    mode.value = 'off'
    paused.value = false
    expired.value = false
    applyAll() // présence retirée (mode off)
    sessionIds.clear()
    ids.forEach(closeIfUnused)
    ids.forEach((id) => {
      for (const k of [...trails.keys()]) if (k.startsWith(id + '|')) trails.delete(k)
      const d = devs[id]
      if (d) d.values = {}
    })
  }

  /** « Continuer le direct » : nouveau délai complet, présence ré-annoncée */
  function continueLive() {
    if (mode.value !== 'fast') return
    expired.value = false
    budgetMs.value = FAST_DURATION_MS
    announceTs.value = Date.now()
    startClock()
    applyAll()
  }

  function reset() {
    stop()
    for (const e of entries.values()) {
      if (e.retry) clearTimeout(e.retry)
      e.ch?.close()
    }
    entries.clear()
    watchCount.clear()
    for (const k of Object.keys(devs)) delete devs[k]
    trails.clear()
  }

  // ───────── état pour l'interface ─────────
  const lastAt = computed(() => {
    let t: number | null = null
    for (const id of sessionIds) {
      const x = devs[id]?.lastAt
      if (x && (t === null || x > t)) t = x
    }
    return t
  })
  const ageS = computed(() => {
    void now.value
    return lastAt.value === null ? null : Math.max(0, Math.round((Date.now() - lastAt.value) / 1000))
  })
  const joinedCount = computed(() => [...sessionIds].filter((id) => devs[id]?.joined).length)
  const uiState = computed<LiveUiState>(() => {
    if (mode.value === 'off') return 'off'
    if (expired.value) return 'expired'
    if (paused.value) return 'paused'
    if (!sessionIds.size) return 'off'
    if (joinedCount.value === 0) {
      const failing = [...sessionIds].some((id) => (entries.get(id)?.attempt ?? 0) > 0)
      return failing ? 'degraded' : 'connecting'
    }
    return 'live'
  })

  return {
    devs,
    tick,
    now,
    mode,
    paused,
    expired,
    uiState,
    ageS,
    lastAt,
    remainingMs,
    isActive,
    capable,
    anyCapable,
    watch,
    start,
    stop,
    continueLive,
    value,
    trail,
    reset,
    setSource,
    /** diagnostic / tests */
    _openChannels: () => [...entries.entries()].filter(([, e]) => e.ch).map(([id]) => id),
    _trailSize: () => [...trails.values()].reduce((n, t) => n + t.length, 0),
  }
})

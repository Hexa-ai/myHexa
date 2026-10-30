import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// lib/api.ts lit VITE_EDGE_FUNCTIONS_URL au chargement : on fixe l'env AVANT l'import dynamique.
const EDGE = 'https://edge.example/functions/v1'

async function loadApi() {
  vi.resetModules()
  vi.stubEnv('VITE_EDGE_FUNCTIONS_URL', EDGE)
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'ANON')
  return import('@/lib/api')
}

describe('lib/api', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('submitIntervention envoie un POST JSON avec la clé anon', async () => {
    const { submitIntervention } = await loadApi()
    fetchMock.mockResolvedValue({ json: async () => ({ ok: true, data: { id: 'i1' } }) })
    const input = {
      deviceId: 'D',
      kind: 'intervention' as const,
      technicianName: 'Tech',
      category: 'controle' as const,
      severity: 'info' as const,
    }
    const res = await submitIntervention(input)
    expect(res).toEqual({ ok: true, data: { id: 'i1' } })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${EDGE}/submit-intervention`)
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({ apikey: 'ANON', 'Content-Type': 'application/json' })
    expect(JSON.parse(init.body)).toEqual(input)
  })

  it('renvoie telle quelle une erreur métier de la fonction', async () => {
    const { submitIntervention } = await loadApi()
    const err = { ok: false, error: { code: 'NOT_FOUND', message: 'box inconnue' } }
    fetchMock.mockResolvedValue({ json: async () => err })
    const res = await submitIntervention({
      deviceId: 'X',
      kind: 'signalement',
      technicianName: 'T',
      category: 'incident',
      severity: 'error',
    })
    expect(res).toEqual(err)
  })

  it('refuse de se charger sans VITE_EDGE_FUNCTIONS_URL', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_EDGE_FUNCTIONS_URL', '')
    await expect(import('@/lib/api')).rejects.toThrow('Missing VITE_EDGE_FUNCTIONS_URL')
  })
})

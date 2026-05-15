import { describe, it, expect, vi, beforeEach } from 'vitest'

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import { viewReport, recoverLink, updateLocation } from '@/lib/api'

beforeEach(() => fetchMock.mockReset())

describe('api', () => {
  it('viewReport calls /view-report with t & d in query', async () => {
    fetchMock.mockResolvedValue({
      json: () => Promise.resolve({ ok: true, data: { device: { id: 'dev-1' } } }),
    })
    const res = await viewReport('TOK', 'dev-1')
    expect(res.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url] = fetchMock.mock.calls[0]
    expect(url).toContain('/view-report?')
    expect(url).toContain('t=TOK')
    expect(url).toContain('d=dev-1')
  })

  it('recoverLink POSTs JSON body with email + from_url', async () => {
    fetchMock.mockResolvedValue({
      json: () => Promise.resolve({ ok: true, data: { sent: true } }),
    })
    await recoverLink('a@b.com', 'https://x')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/recover-link')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ email: 'a@b.com', from_url: 'https://x' })
  })

  it('updateLocation POSTs token + deviceId + address', async () => {
    fetchMock.mockResolvedValue({
      json: () => Promise.resolve({ ok: true, data: { deviceId: 'd', address: 'a', latitude: 0, longitude: 0 } }),
    })
    await updateLocation({ token: 'T', deviceId: 'D', address: 'Paris' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/location-update')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ token: 'T', deviceId: 'D', address: 'Paris' })
  })

  it('returns parsed error payload on failure', async () => {
    fetchMock.mockResolvedValue({
      json: () => Promise.resolve({ ok: false, error: { code: 'TOKEN_EXPIRED', message: 'expired' } }),
    })
    const res = await viewReport('X', 'Y')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('TOKEN_EXPIRED')
  })
})

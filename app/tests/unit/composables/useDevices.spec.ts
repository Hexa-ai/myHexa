import { describe, it, expect, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const mockOrder = vi.fn()
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(() => ({
      order: () => mockOrder(),
    })),
  },
}))

import { useDevices } from '@/composables/useDevices'

describe('useDevices', () => {
  it('loads devices via RPC into a ref', async () => {
    setActivePinia(createPinia())
    mockOrder.mockResolvedValue({
      data: [{ id: '1', name: 'D1', status_payload: null }],
      error: null,
    })
    const { devices, load } = useDevices()
    await load()
    expect(devices.value).toHaveLength(1)
    expect(devices.value[0].id).toBe('1')
  })
})

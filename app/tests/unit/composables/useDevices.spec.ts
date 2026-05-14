import { describe, it, expect, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const mockOrder = vi.fn()
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: () => ({
        order: () => mockOrder(),
      }),
    })),
  },
}))

import { useDevices } from '@/composables/useDevices'

describe('useDevices', () => {
  it('loads devices into a ref', async () => {
    setActivePinia(createPinia())
    mockOrder.mockResolvedValue({
      data: [{ id: '1', name: 'D1' }],
      error: null,
    })
    const { devices, load } = useDevices()
    await load()
    expect(devices.value).toHaveLength(1)
  })
})

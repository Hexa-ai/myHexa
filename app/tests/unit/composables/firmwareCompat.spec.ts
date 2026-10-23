// Compatibilité firmware : destinataires >= 1.3.7 (bloc remote), escalade >= 1.3.10 (escalation_hash).
import { describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
import { capability, versionLt } from '@/composables/useAlarmConfig'

describe('compatibilité firmware', () => {
  it('compare les versions', () => {
    expect(versionLt('1.3.6', '1.3.7')).toBe(true)
    expect(versionLt('1.3.10', '1.3.7')).toBe(false)
    expect(versionLt('v1.3.9-i1', '1.3.10')).toBe(true)
    expect(versionLt('1.3.10', '1.3.10')).toBe(false)
  })
  it('sans bloc remote : non pilotable', () => {
    const c = capability({ remote_seen_at: null, running_version: '1.3.5', escalation_hash: null })
    expect(c.level).toBe('none')
    expect(c.hint).toMatch(/1\.3\.7/)
  })
  it('bloc remote sans escalation_hash : destinataires seulement', () => {
    const c = capability({ remote_seen_at: 'x', running_version: '1.3.8', escalation_hash: null })
    expect(c.level).toBe('recipients')
    expect(c.hint).toMatch(/1\.3\.10/)
  })
  it('escalation_hash présent (même vide) : tout est pilotable', () => {
    expect(capability({ remote_seen_at: 'x', running_version: null, escalation_hash: '' }).level).toBe('full')
  })
})

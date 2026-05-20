import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import type { Database } from '@/types/supabase'

export type Recipient = Database['public']['Tables']['recipients']['Row']

export interface InvitePayload {
  name: string
  contact_email: string
  phone?: string | null
  role: 'admin' | 'viewer'
  company_id?: string | null
  restrict_to_devices?: string[] | null
  shared_devices?: string[] | null
  recipient_id?: string
}

export function useRecipients() {
  const auth = useAuthStore()
  const items = ref<Recipient[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchAll() {
    if (!auth.effectiveCompanyId) return
    loading.value = true
    error.value = null
    const { data, error: err } = await supabase
      .from('recipients')
      .select('*')
      .eq('company_id', auth.effectiveCompanyId)
      .order('name', { ascending: true })
    loading.value = false
    if (err) {
      error.value = err.message
      return
    }
    items.value = data ?? []
  }

  async function invite(payload: InvitePayload) {
    const { data, error: err } = await supabase.functions.invoke('invite-recipient', {
      body: payload,
    })
    if (err) throw new Error(err.message)
    if (!data?.ok) throw new Error(data?.error?.message ?? 'Erreur inconnue')
    await fetchAll()
    return data.data as { recipient: Recipient; invited: boolean }
  }

  async function update(id: string, patch: Partial<Recipient>) {
    const { error: err } = await supabase
      .from('recipients')
      .update(patch)
      .eq('id', id)
    if (err) throw new Error(err.message)
    await fetchAll()
  }

  async function remove(id: string) {
    const { data, error: err } = await supabase.functions.invoke('delete-recipient', {
      body: { recipient_id: id },
    })
    if (err) throw new Error(err.message)
    if (!data?.ok) throw new Error(data?.error?.message ?? 'Erreur suppression')
    await fetchAll()
  }

  return { items, loading, error, fetchAll, invite, update, remove }
}

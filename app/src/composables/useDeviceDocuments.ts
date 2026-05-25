import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import type { Database } from '@/types/supabase'

export type DeviceDocument = Database['public']['Tables']['device_documents']['Row']
export type DocumentKind = 'plan_electrique' | 'analyse_fonctionnelle' | 'manuel' | 'photo' | 'autre'

const BUCKET = 'device-docs'
const SIGNED_URL_TTL_SECONDS = 60 * 10 // 10 minutes

export function useDeviceDocuments(deviceId: () => string | null) {
  const auth = useAuthStore()
  const items = ref<DeviceDocument[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchAll() {
    const did = deviceId()
    if (!did) return
    loading.value = true
    error.value = null
    const { data, error: err } = await supabase
      .from('device_documents')
      .select('*')
      .eq('device_id', did)
      .order('created_at', { ascending: false })
    loading.value = false
    if (err) {
      error.value = err.message
      return
    }
    items.value = data ?? []
  }

  async function upload(
    file: File,
    kind: DocumentKind,
    opts?: { description?: string | null; isPublic?: boolean },
  ): Promise<DeviceDocument | null> {
    const did = deviceId()
    if (!did) throw new Error('Aucun device sélectionné')
    // ID pré-généré côté client pour construire un path stable
    const docId = crypto.randomUUID()
    const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const filePath = `${did}/${docId}-${cleanName}`

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, file, { contentType: file.type || undefined, upsert: false })
    if (upErr) throw new Error(`upload: ${upErr.message}`)

    const { data: inserted, error: insErr } = await supabase
      .from('device_documents')
      .insert({
        id: docId,
        device_id: did,
        name: file.name,
        file_path: filePath,
        mime_type: file.type || null,
        size_bytes: file.size || null,
        kind,
        description: opts?.description ?? null,
        is_public: opts?.isPublic ?? false,
        uploaded_by: auth.recipient?.id ?? null,
      })
      .select('*')
      .single()
    if (insErr) {
      // Rollback : on tente de supprimer le fichier orphelin
      await supabase.storage.from(BUCKET).remove([filePath]).catch(() => {})
      throw new Error(`metadata: ${insErr.message}`)
    }
    await fetchAll()
    return inserted as DeviceDocument
  }

  async function getDownloadUrl(doc: DeviceDocument): Promise<string | null> {
    const { data, error: err } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(doc.file_path, SIGNED_URL_TTL_SECONDS, { download: doc.name })
    if (err) {
      console.warn('[docs] createSignedUrl', err.message)
      return null
    }
    return data.signedUrl
  }

  async function remove(doc: DeviceDocument) {
    // Supprime le fichier puis la métadonnée. Si la suppression DB échoue, on
    // accepte d'avoir un fichier orphelin (rare et bénin — il sera nettoyé manuellement).
    await supabase.storage.from(BUCKET).remove([doc.file_path]).catch(() => {})
    const { error: delErr } = await supabase
      .from('device_documents')
      .delete()
      .eq('id', doc.id)
    if (delErr) throw new Error(delErr.message)
    await fetchAll()
  }

  async function togglePublic(doc: DeviceDocument) {
    const { error: err } = await supabase
      .from('device_documents')
      .update({ is_public: !doc.is_public })
      .eq('id', doc.id)
    if (err) throw new Error(err.message)
    await fetchAll()
  }

  return { items, loading, error, fetchAll, upload, getDownloadUrl, remove, togglePublic }
}

export const KIND_LABELS: Record<DocumentKind, string> = {
  plan_electrique: 'Plan électrique',
  analyse_fonctionnelle: 'Analyse fonctionnelle',
  manuel: 'Manuel / notice',
  photo: 'Photo installation',
  autre: 'Autre',
}

export function fmtSize(bytes: number | null | undefined): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} ko`
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`
}

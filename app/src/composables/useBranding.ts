// PROTOTYPE — images d'entreprise : logo (rapports mail / PDF) et images des blocs (voyants, bloc image).
// Bucket public `branding` (PNG/JPEG, 2 Mo) : <company_id>/logo-<horodatage>.<ext>, <company_id>/img/<uuid>.<ext>.
import { supabase } from '@/lib/supabase'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any
export const IMAGE_TYPES = ['image/png', 'image/jpeg']
export const IMAGE_MAX = 2 * 1024 * 1024

export function publicUrl(path: string) {
  return supabase.storage.from('branding').getPublicUrl(path).data.publicUrl
}

function check(file: File) {
  if (!IMAGE_TYPES.includes(file.type)) throw new Error('Format accepté : PNG ou JPEG')
  if (file.size > IMAGE_MAX) throw new Error('Image trop lourde (2 Mo maximum)')
}
const ext = (f: File) => (f.type === 'image/png' ? 'png' : 'jpg')

/** envoie une image de bloc ; renvoie son adresse publique */
export async function uploadImage(companyId: string, file: File): Promise<string> {
  check(file)
  const path = `${companyId}/img/${crypto.randomUUID()}.${ext(file)}`
  const { error } = await supabase.storage
    .from('branding')
    .upload(path, file, { contentType: file.type, cacheControl: '31536000' })
  if (error) throw new Error(error.message)
  return publicUrl(path)
}

export async function loadLogo(companyId: string): Promise<string | null> {
  const { data } = await sb.from('companies').select('logo_path').eq('id', companyId).maybeSingle()
  return data?.logo_path ? publicUrl(data.logo_path) : null
}

/** remplace le logo (nouveau nom à chaque envoi : pas de cache périmé dans les mails) */
export async function uploadLogo(companyId: string, file: File): Promise<string> {
  check(file)
  const path = `${companyId}/logo-${Date.now()}.${ext(file)}`
  const { error } = await supabase.storage
    .from('branding')
    .upload(path, file, { contentType: file.type, cacheControl: '31536000' })
  if (error) throw new Error(error.message)
  const { error: e2 } = await sb.rpc('set_company_logo', { p_company: companyId, p_path: path })
  if (e2) throw new Error(e2.message)
  return publicUrl(path)
}

export async function removeLogo(companyId: string) {
  const { error } = await sb.rpc('set_company_logo', { p_company: companyId, p_path: null })
  if (error) throw new Error(error.message)
}

/** logo variante sombre (optionnel, co-branding) */
export async function uploadLogoDark(companyId: string, file: File): Promise<string> {
  check(file)
  const path = `${companyId}/logo-dark-${Date.now()}.${ext(file)}`
  const { error } = await supabase.storage
    .from('branding')
    .upload(path, file, { contentType: file.type, cacheControl: '31536000' })
  if (error) throw new Error(error.message)
  const { error: e2 } = await sb.rpc('set_company_logo_dark', { p_company: companyId, p_path: path })
  if (e2) throw new Error(e2.message)
  return publicUrl(path)
}
export async function removeLogoDark(companyId: string) {
  const { error } = await sb.rpc('set_company_logo_dark', { p_company: companyId, p_path: null })
  if (error) throw new Error(error.message)
}

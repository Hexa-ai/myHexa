// Typed wrapper around the Supabase Edge Functions (public routes).
// Contracts match the deployed functions in supabase/functions/.

const EDGE_URL = import.meta.env.VITE_EDGE_FUNCTIONS_URL
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!EDGE_URL) {
  throw new Error('Missing VITE_EDGE_FUNCTIONS_URL')
}

export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } }

function authHeaders(): HeadersInit {
  return ANON_KEY ? { apikey: ANON_KEY } : {}
}

async function get<T>(fn: string, params: Record<string, string>): Promise<ApiResponse<T>> {
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(`${EDGE_URL}/${fn}${qs ? '?' + qs : ''}`, {
    headers: authHeaders(),
  })
  return res.json() as Promise<ApiResponse<T>>
}

async function post<T>(fn: string, body: unknown): Promise<ApiResponse<T>> {
  const res = await fetch(`${EDGE_URL}/${fn}`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json() as Promise<ApiResponse<T>>
}

// ----------------------------- submit-intervention --------------------------
// Reste publique car appelée depuis /intervention (QR code, sans compte).

export interface InterventionPhotoInput {
  name?: string
  contentType?: string
  dataBase64: string
}

export type InterventionKind = 'signalement' | 'intervention'

export interface SubmitInterventionInput {
  deviceId: string
  kind: InterventionKind
  technicianName: string
  technicianContact?: string | null
  technicianPhone?: string | null
  category: 'intervention' | 'incident' | 'controle' | 'autre'
  severity: 'info' | 'warning' | 'error'
  message?: string | null
  photos?: InterventionPhotoInput[]
}

export interface SubmitInterventionData {
  id: string
  createdAt: string
  device: { id: string; name: string | null }
  photoCount?: number
}

export const submitIntervention = (input: SubmitInterventionInput) =>
  post<SubmitInterventionData>('submit-intervention', input)

// ----------------------------- generic helper -------------------------------
// Kept for any future ad-hoc call.

export async function callEdge<T>(
  fn: string,
  params: Record<string, string> = {},
): Promise<ApiResponse<T>> {
  return get<T>(fn, params)
}

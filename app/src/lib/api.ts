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

// ----------------------------- view-report ----------------------------------

export interface ViewReportData {
  token: string
  expiresAt: string
  role: 'admin' | 'viewer' | 'member' | string
  device: {
    id: string
    name: string | null
    address: string | null
    latitude: number | null
    longitude: number | null
  }
  status: {
    payload: unknown
    receivedAt: string
  } | null
}

export const viewReport = (token: string, deviceId: string) =>
  get<ViewReportData>('view-report', { t: token, d: deviceId })

// ----------------------------- recover-link ---------------------------------

export const recoverLink = (email: string, fromUrl?: string) =>
  post<{ sent: true }>('recover-link', { email, from_url: fromUrl ?? '' })

// ----------------------------- location-update ------------------------------

export interface UpdateLocationInput {
  token: string
  deviceId: string
  address: string
}

export interface UpdateLocationData {
  deviceId: string
  address: string
  latitude: number
  longitude: number
}

export const updateLocation = (input: UpdateLocationInput) =>
  post<UpdateLocationData>('location-update', input)

// ----------------------------- generic helper -------------------------------
// Kept for any future ad-hoc call.

export async function callEdge<T>(
  fn: string,
  params: Record<string, string> = {},
): Promise<ApiResponse<T>> {
  return get<T>(fn, params)
}

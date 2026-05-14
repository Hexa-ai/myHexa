const EDGE_URL = import.meta.env.VITE_EDGE_FUNCTIONS_URL

if (!EDGE_URL) {
  throw new Error('Missing VITE_EDGE_FUNCTIONS_URL')
}

export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } }

export async function callEdge<T>(
  fn: string,
  params: Record<string, string> = {},
): Promise<ApiResponse<T>> {
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(`${EDGE_URL}/${fn}${qs ? '?' + qs : ''}`)
  return res.json() as Promise<ApiResponse<T>>
}

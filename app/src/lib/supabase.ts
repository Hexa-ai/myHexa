import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('Missing Supabase env vars (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)')
}

// Délai maximal appliqué à TOUTE requête du client, y compris le
// rafraîchissement de jeton.
//
// Sans lui, une requête suspendue (reprise de veille, bascule réseau, lien à
// demi-mort) ne se termine jamais : supabase-js n'impose aucun timeout. Or
// getSession() est appelé avant chaque requête et, quand le jeton est expiré,
// déclenche le rafraîchissement *à l'intérieur du verrou d'auth*. Une seule
// requête pendante y gèle donc définitivement toutes les suivantes, sans
// erreur ni trafic réseau : l'application se tait, l'écran garde ses données
// mortes, et seul un rechargement répare.
//
// Un abandon libère le verrou : la requête échoue, l'erreur remonte, et le
// poll suivant retente.
const REQUEST_TIMEOUT_MS = 20_000

const fetchWithTimeout: typeof fetch = (input, init) => {
  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(new DOMException('Supabase request timeout', 'TimeoutError')),
    REQUEST_TIMEOUT_MS,
  )
  // Ne pas court-circuiter un abandon demandé par l'appelant.
  const caller = init?.signal
  if (caller) {
    if (caller.aborted) controller.abort(caller.reason)
    else caller.addEventListener('abort', () => controller.abort(caller.reason), { once: true })
  }
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer))
}

export const supabase = createClient<Database>(url, anonKey, {
  global: { fetch: fetchWithTimeout },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    // Verrou laissé au défaut (navigator.locks) : il est partagé entre les
    // onglets, ce qui est voulu. Les jetons de rafraîchissement Supabase
    // tournent à chaque usage, et deux onglets qui rafraîchissent en même
    // temps peuvent s'invalider mutuellement. auth-js borne déjà l'acquisition
    // à lockAcquireTimeout (5 s par défaut) et vole les verrous orphelins,
    // donc un verrou abandonné ne peut pas figer le client.
  },
})

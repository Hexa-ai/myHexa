import { createClient, processLock } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('Missing Supabase env vars (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)')
}

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    // Verrou d'auth confiné à l'onglet. Par défaut auth-js utilise
    // navigator.locks, un verrou partagé par TOUS les onglets de l'origine, et
    // l'attend avec un timeout infini. getSession() étant appelé avant chaque
    // requête, un verrou orphelin (onglet fermé pendant un refresh, reprise de
    // veille) fige toutes les requêtes de tous les onglets, sans erreur ni
    // requête réseau : l'UI reste affichée avec des données mortes jusqu'au
    // rechargement. processLock sérialise l'attente dans l'onglet courant
    // uniquement. Cf. supabase-js#2013 et #2111.
    lock: processLock,
  },
})

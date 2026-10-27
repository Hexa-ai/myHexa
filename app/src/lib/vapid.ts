/**
 * Clés publiques VAPID (Web Push) par projet Supabase. Une clé publique n'est pas un secret :
 * elle identifie le serveur d'envoi auprès du navigateur. Les clés privées sont dans les secrets des fonctions.
 */
const KEYS: Record<string, string> = {
  mlbezfyjbnjyogogqmem:
    'BKFqJQylshvLvnHrfb2rUs1Imu3JVn2Ou2AdOPehGBmAfq_iYjm1qwM8aAiJItPlRQBEYqrtKcZFzJFoAEPRDqk', // prod
  mtwqkfbbtjlntkhfojai:
    'BHw0GYGSwCdWcpKZMJjv7HmKKgpiVEX8fqvEdlD9BJkUzz2bAEUEclUwFLlF1l3nA3rJUKg8Qk2AB2rVE_UbR6k', // test
}
const ref =
  String(import.meta.env.VITE_SUPABASE_URL ?? '').match(
    /https:\/\/([a-z0-9]+)\.supabase\.co/,
  )?.[1] ?? ''
export const VAPID_PUBLIC_KEY: string | undefined =
  import.meta.env.VITE_VAPID_PUBLIC_KEY || KEYS[ref]

/**
 * Notifications d'alarme sur cet appareil (Web Push).
 * iPhone : seulement dans l'application installée (écran d'accueil), iOS 16.4 ou plus.
 */
import { computed, ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { isIOS, isStandalone, swRegistration } from '@/lib/pwa'

import { VAPID_PUBLIC_KEY as VAPID } from '@/lib/vapid'
const subscribed = ref(false)
const busy = ref(false)
const lastError = ref('')

function keyBytes(b64url: string) {
  const b64 = (b64url + '='.repeat((4 - (b64url.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

async function registration() {
  if (swRegistration.value) return swRegistration.value
  if (!('serviceWorker' in navigator)) return null
  return (await navigator.serviceWorker.getRegistration('/')) ?? null
}

export function usePushAlarms() {
  /** raison pour laquelle les notifications ne sont pas possibles ici ('' si possibles) */
  const blocker = computed(() => {
    if (!VAPID) return 'non configuré'
    if (typeof window === 'undefined' || !window.isSecureContext)
      return 'connexion non sécurisée (https requis)'
    if (isIOS && !isStandalone)
      return "installez d'abord l'application (Partager → Sur l'écran d'accueil)"
    if (
      !('serviceWorker' in navigator) ||
      !('PushManager' in window) ||
      !('Notification' in window)
    )
      return 'navigateur non compatible'
    if (Notification.permission === 'denied') return 'notifications refusées dans les réglages'
    return ''
  })

  async function refresh() {
    const reg = await registration()
    const sub = await reg?.pushManager.getSubscription()
    subscribed.value = !!sub && Notification.permission === 'granted'
  }

  async function enable() {
    lastError.value = ''
    busy.value = true
    try {
      // doit rester dans le geste de l'utilisateur (iOS)
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') throw new Error('permission refusée')
      const reg = await registration()
      if (!reg) throw new Error('service worker absent')
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyBytes(VAPID!),
        }))
      const j = sub.toJSON()
      const { error } = await supabase.from('push_subscriptions').upsert(
        {
          endpoint: j.endpoint!,
          p256dh: j.keys!.p256dh,
          auth: j.keys!.auth,
          user_agent: navigator.userAgent.slice(0, 200),
        },
        { onConflict: 'endpoint' },
      )
      if (error) throw error
      subscribed.value = true
    } catch (e) {
      lastError.value = (e as Error).message ?? String(e)
    } finally {
      busy.value = false
    }
  }

  async function disable() {
    busy.value = true
    try {
      const reg = await registration()
      const sub = await reg?.pushManager.getSubscription()
      if (sub) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
        await sub.unsubscribe()
      }
      subscribed.value = false
    } finally {
      busy.value = false
    }
  }

  return { blocker, subscribed, busy, lastError, refresh, enable, disable }
}

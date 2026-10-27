// push-alarm — envoie les notifications d'alarme (Web Push) en attente dans push_alarm_queue.
// Appelée par le déclencheur push_after_status (pg_net) quand une alarme passe à l'état actif. Protégée par x-cron-secret.
// Destinataires : abonnements des utilisateurs qui voient la box (push_targets). Abonnement expiré (404/410) : supprimé.
// Mode test : body { "test": true, "endpoint": "…" } envoie une notification d'essai à cet abonnement (si connu).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? ''
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:contact@hexa-ai.fr'

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

type Sub = { id: string; endpoint: string; p256dh: string; auth: string }
type Payload = { title: string; body: string; tag?: string; url?: string }

async function send(sub: Sub, p: Payload): Promise<'ok' | 'gone' | 'error'> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(p),
      { TTL: 3600, urgency: 'high' },
    )
    await admin.from('push_subscriptions').update({ last_ok_at: new Date().toISOString() }).eq('id', sub.id)
    return 'ok'
  } catch (e) {
    const code = (e as { statusCode?: number }).statusCode
    if (code === 404 || code === 410) {
      await admin.from('push_subscriptions').delete().eq('id', sub.id)
      return 'gone'
    }
    console.error('push', code, String((e as Error).message ?? e).slice(0, 200))
    return 'error'
  }
}

Deno.serve(async (req) => {
  if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) return new Response('forbidden', { status: 403 })
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return new Response('vapid manquant', { status: 500 })
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
  const body = await req.json().catch(() => ({}))

  if (body.test && body.endpoint) {
    const { data: s } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('endpoint', body.endpoint).maybeSingle()
    if (!s) return Response.json({ test: 'abonnement inconnu' }, { status: 404 })
    const r = await send(s as Sub, { title: 'myHexa', body: 'Notification d\'essai : tout fonctionne.', url: '/admin/alarms' })
    return Response.json({ test: r })
  }

  // alarmes en attente (moins d'une heure : au-delà, une notification n'a plus de sens)
  const since = new Date(Date.now() - 3600_000).toISOString()
  const { data: rows, error } = await admin
    .from('push_alarm_queue')
    .select('id, device_id, variable, description, type_alarm, created_at')
    .is('sent_at', null)
    .gte('created_at', since)
    .order('created_at')
    .limit(50)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  const names = new Map<string, string>()
  const out: unknown[] = []
  for (const r of rows ?? []) {
    // réservation de la ligne (deux appels simultanés n'envoient pas deux fois)
    const { data: claimed } = await admin
      .from('push_alarm_queue')
      .update({ sent_at: new Date().toISOString() })
      .eq('id', r.id)
      .is('sent_at', null)
      .select('id')
    if (!claimed?.length) continue
    if (!names.has(r.device_id)) {
      const { data: d } = await admin.from('devices').select('name').eq('id', r.device_id).maybeSingle()
      names.set(r.device_id, d?.name ?? 'Box')
    }
    const { data: subs } = await admin.rpc('push_targets', { p_device: r.device_id })
    const p: Payload = {
      title: `${names.get(r.device_id)} · ${r.variable}`,
      body: r.description || 'Nouvelle alarme active',
      tag: `${r.device_id}:${r.variable}`,
      url: `/admin/devices/${r.device_id}`,
    }
    const res = { ok: 0, gone: 0, error: 0 }
    for (const s of (subs ?? []) as Sub[]) res[await send(s, p)]++
    await admin.from('push_alarm_queue').update({ result: res }).eq('id', r.id)
    out.push({ id: r.id, ...res })
  }
  // les alarmes trop anciennes restées en file sont closes sans envoi
  await admin.from('push_alarm_queue').update({ sent_at: new Date().toISOString(), result: { expired: true } }).is('sent_at', null).lt('created_at', since)
  return Response.json({ sent: out })
})

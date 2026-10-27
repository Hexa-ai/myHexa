/* myHexa — service worker
 * 1. Démarrage rapide : les fichiers de l'application (/assets/*, hashés donc immuables) sont gardés en cache ;
 *    la page (index.html) est toujours demandée au réseau d'abord, donc une mise en prod est prise au lancement suivant.
 *    Aucune donnée (Supabase, mesures, alarmes) n'est mise en cache : elles partent toujours au réseau.
 * 2. Notifications d'alarme (Web Push) : affichage et ouverture de la box concernée au toucher.
 */
const VERSION = 'v1'
const SHELL = `myhexa-shell-${VERSION}`
const ASSETS = `myhexa-assets-${VERSION}`

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/', '/manifest.webmanifest', '/pwa/icon-192.png'])).catch(() => {}))
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('myhexa-') && k !== SHELL && k !== ASSETS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return // Supabase, polices… : jamais en cache ici

  // navigation : réseau d'abord (nouvelle version), cache si hors ligne
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(SHELL).then((c) => c.put('/', copy))
          return res
        })
        .catch(() => caches.match('/').then((r) => r || Response.error())),
    )
    return
  }

  // fichiers de build hashés : cache d'abord
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/pwa/')) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(ASSETS).then((c) => c.put(req, copy))
            }
            return res
          }),
      ),
    )
  }
})

// ---------- notifications d'alarme ----------
self.addEventListener('push', (e) => {
  let d = {}
  try {
    d = e.data ? e.data.json() : {}
  } catch {
    d = { title: 'myHexa', body: e.data ? e.data.text() : '' }
  }
  const title = d.title || 'Nouvelle alarme'
  e.waitUntil(
    self.registration.showNotification(title, {
      body: d.body || '',
      icon: '/pwa/icon-192.png',
      badge: '/pwa/icon-192.png',
      tag: d.tag || undefined, // même alarme : la notification est remplacée, pas empilée
      renotify: !!d.tag,
      data: { url: d.url || '/admin/alarms' },
    }),
  )
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const target = new URL(e.notification.data?.url || '/admin/alarms', self.location.origin).href
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ('focus' in w) {
          w.navigate(target).catch(() => {})
          return w.focus()
        }
      }
      return self.clients.openWindow(target)
    }),
  )
})

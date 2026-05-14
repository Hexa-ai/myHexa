# P3 — Edge Functions + Public Routes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Édition des Edge Functions `view-report`, `recover-link`, `location-update` côté Supabase, et création des pages publiques Vue `/r/:token`, `/recover`, `/location/:token` qui les consomment. Validation en parallèle (double-run) des workflows n8n existants.

**Architecture :** Trois Edge Functions Deno indépendantes, chacune avec sa validation de token et son contrat JSON unifié `{ ok, data?, error? }`. Côté Vue, trois vues publiques sans session Supabase, qui appellent `lib/api.ts`. ErrorBoundary global gère les erreurs non capturées.

**Tech Stack :** Supabase Edge Functions (Deno), `supabase-js` côté Edge (service_role), Vue 3, shadcn-vue.

**Prérequis :**
- P2 terminé (DB + auth fonctionnels)
- Workflows n8n existants identifiables (`HCXdZ8tnbQ2bDH09` Token Recovery, et le Report View — récupérer l'ID via memory ou MCP n8n)
- Connaissance du format actuel des tokens (à investiguer Task 0 ci-dessous)
- Supabase CLI installée pour déployer les Edge Functions OU MCP `mcp__supabase__deploy_edge_function`

---

## File Structure

```
supabase/
├── functions/
│   ├── _shared/
│   │   ├── cors.ts                  ← headers CORS communs
│   │   └── response.ts              ← helper { ok, data?, error? }
│   ├── view-report/
│   │   └── index.ts
│   ├── recover-link/
│   │   └── index.ts
│   └── location-update/
│       └── index.ts
└── migrations/
    └── 20260514110000_report_links.sql  ← si table report_links absente

app/src/
├── lib/api.ts                       ← étendu (méthodes typées par fonction)
├── components/ErrorBoundary.vue     ← nouveau
├── views/public/
│   ├── ReportView.vue
│   ├── RecoverView.vue
│   └── LocationView.vue
└── router/index.ts                  ← + 3 routes publiques
```

---

### Task 0 : Audit préalable des workflows n8n existants

**Files:** aucun (investigation)

- [ ] **Step 0.1 : Lister les workflows concernés**

Via MCP n8n :
```
mcp__n8n-mcp__n8n_get_workflow(id="HCXdZ8tnbQ2bDH09")
```
(Token Recovery, déjà en mémoire)

Puis chercher les workflows `Report View` et `Location Update` :
```
mcp__n8n-mcp__n8n_list_workflows(active=true)
```

Noter les IDs.

- [ ] **Step 0.2 : Comprendre le format des tokens**

Pour chaque workflow public, identifier :
- Où vit le token (URL path, query string, body) ?
- Comment il est validé (signature ? lookup en DB ?) ?
- Quelle table (et colonnes) sert de "store" de tokens ?

Si une table `report_links` (ou équivalent) existe déjà, la documenter ici. Sinon, prévoir sa création à la Task 1.

- [ ] **Step 0.3 : Documenter dans la spec**

Mettre à jour `docs/superpowers/specs/2026-05-14-vuejs-architecture-design.md` section 6 avec le schéma exact des tokens découverts (1-2 lignes suffisent).

Commit :
```bash
git add docs/superpowers/specs/2026-05-14-vuejs-architecture-design.md
git commit -m "docs(p3): document existing token storage from n8n audit"
```

---

### Task 1 : Migration `report_links` (conditionnelle)

**Files:**
- Create: `supabase/migrations/20260514110000_report_links.sql` *(seulement si Task 0.2 montre qu'aucune table équivalente n'existe)*

- [ ] **Step 1.1 : Si table absente, l'écrire**

```sql
CREATE TABLE report_links (
  token        text PRIMARY KEY,
  report_id    uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  recipient_id uuid REFERENCES recipients(id) ON DELETE SET NULL,
  expires_at   timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX report_links_report_id_idx ON report_links (report_id);
CREATE INDEX report_links_expires_at_idx ON report_links (expires_at);

ALTER TABLE report_links ENABLE ROW LEVEL SECURITY;

-- Pas de policy = aucun accès via le SDK anon ; seul service_role lit/écrit (Edge Function)
COMMENT ON TABLE report_links IS
  'Tokens signés pour accès public aux rapports — accédés uniquement via Edge Functions';
```

- [ ] **Step 1.2 : Appliquer**

```
mcp__supabase__apply_migration(name="report_links", query=<contenu>)
```

- [ ] **Step 1.3 : Régénérer les types**

```bash
cd app && pnpm types:gen
```

- [ ] **Step 1.4 : Commit**

```bash
git add supabase/migrations/20260514110000_report_links.sql app/src/types/supabase.ts
git commit -m "feat(p3): add report_links table for public access tokens"
```

**Si Task 0.2 a révélé une table existante, sauter Task 1 entièrement et utiliser cette table dans les Edge Functions Task 3-5.**

---

### Task 2 : Helpers partagés Edge Functions

**Files:**
- Create: `supabase/functions/_shared/cors.ts`, `supabase/functions/_shared/response.ts`

- [ ] **Step 2.1 : Créer le helper CORS**

Créer `supabase/functions/_shared/cors.ts` :

```ts
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
```

- [ ] **Step 2.2 : Créer le helper de réponse**

Créer `supabase/functions/_shared/response.ts` :

```ts
import { corsHeaders } from './cors.ts'

export function ok<T>(data: T): Response {
  return new Response(JSON.stringify({ ok: true, data }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export function fail(code: string, message: string, status = 400): Response {
  return new Response(
    JSON.stringify({ ok: false, error: { code, message } }),
    {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    },
  )
}

export function preflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  return null
}
```

- [ ] **Step 2.3 : Commit**

```bash
git add supabase/functions/_shared/
git commit -m "feat(p3): add shared CORS and response helpers for edge functions"
```

---

### Task 3 : Edge Function `view-report`

**Files:**
- Create: `supabase/functions/view-report/index.ts`

- [ ] **Step 3.1 : Écrire la fonction**

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { ok, fail, preflight } from '../_shared/response.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

Deno.serve(async (req) => {
  const pf = preflight(req)
  if (pf) return pf

  const url = new URL(req.url)
  const token = url.searchParams.get('token')
  if (!token) return fail('MISSING_TOKEN', 'Token manquant', 400)

  const { data: link, error: linkErr } = await supabase
    .from('report_links')
    .select('report_id, expires_at')
    .eq('token', token)
    .maybeSingle()

  if (linkErr) return fail('DB_ERROR', linkErr.message, 500)
  if (!link) return fail('TOKEN_NOT_FOUND', 'Lien invalide', 404)

  if (new Date(link.expires_at) < new Date()) {
    return fail('TOKEN_EXPIRED', 'Ce lien a expiré', 401)
  }

  const { data: report, error: reportErr } = await supabase
    .from('reports')
    .select('*, device:devices(id, name, address, company_id)')
    .eq('id', link.report_id)
    .single()

  if (reportErr) return fail('DB_ERROR', reportErr.message, 500)

  return ok({ report })
})
```

- [ ] **Step 3.2 : Déployer**

Via MCP :
```
mcp__supabase__deploy_edge_function(name="view-report", files=[{name: "index.ts", content: <contenu>}])
```

Ou via CLI :
```bash
supabase functions deploy view-report
```

- [ ] **Step 3.3 : Tester avec curl**

```bash
curl -sS "$VITE_EDGE_FUNCTIONS_URL/view-report?token=FAKE_TOKEN" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY"
```

Attendu : `{"ok":false,"error":{"code":"TOKEN_NOT_FOUND","message":"Lien invalide"}}`

Tester ensuite avec un vrai token (à créer manuellement en base) → doit renvoyer `ok: true` + le rapport.

- [ ] **Step 3.4 : Commit**

```bash
git add supabase/functions/view-report/
git commit -m "feat(p3): add view-report edge function"
```

---

### Task 4 : Edge Function `recover-link`

**Files:**
- Create: `supabase/functions/recover-link/index.ts`

- [ ] **Step 4.1 : Écrire la fonction**

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { ok, fail, preflight } from '../_shared/response.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

Deno.serve(async (req) => {
  const pf = preflight(req)
  if (pf) return pf

  if (req.method !== 'POST') {
    return fail('METHOD_NOT_ALLOWED', 'Méthode non supportée', 405)
  }

  const body = await req.json().catch(() => null)
  const email = body?.email as string | undefined
  if (!email || !email.includes('@')) {
    return fail('INVALID_EMAIL', 'Email invalide', 400)
  }

  // Cherche le destinataire le plus récent par email
  const { data: recipient, error } = await supabase
    .from('recipients')
    .select('id, company_id')
    .eq('contact_email', email)
    .maybeSingle()

  if (error) return fail('DB_ERROR', error.message, 500)

  // Renvoyer toujours ok pour ne pas leaker l'existence d'un email
  if (!recipient) return ok({ sent: true })

  // TODO post-cutover : déclencher l'envoi email via SMTP/Resend.
  // Pour la phase de double-run, on appelle le webhook n8n Token Recovery
  // pour conserver le même comportement opérationnel.
  const N8N_WEBHOOK = Deno.env.get('N8N_TOKEN_RECOVERY_WEBHOOK')
  if (N8N_WEBHOOK) {
    await fetch(N8N_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
  }

  return ok({ sent: true })
})
```

**Note importante :** pendant le double-run, cette Edge Function délègue à n8n pour l'envoi email réel (via secret `N8N_TOKEN_RECOVERY_WEBHOOK`). Quand on retire n8n, on remplacera ce bloc par un appel SMTP/Resend.

- [ ] **Step 4.2 : Configurer le secret**

Via dashboard Supabase → Edge Functions → Secrets :
- `N8N_TOKEN_RECOVERY_WEBHOOK` = URL du webhook `POST /webhook/recover-link` de n8n

Ou CLI :
```bash
supabase secrets set N8N_TOKEN_RECOVERY_WEBHOOK=https://...
```

- [ ] **Step 4.3 : Déployer**

```
mcp__supabase__deploy_edge_function(name="recover-link", ...)
```

- [ ] **Step 4.4 : Tester**

```bash
curl -sS -X POST "$VITE_EDGE_FUNCTIONS_URL/recover-link" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
```

Attendu : `{"ok":true,"data":{"sent":true}}` quelle que soit l'existence de l'email.

Vérifier dans n8n que le workflow Token Recovery a bien été déclenché.

- [ ] **Step 4.5 : Commit**

```bash
git add supabase/functions/recover-link/
git commit -m "feat(p3): add recover-link edge function (delegates to n8n during double-run)"
```

---

### Task 5 : Edge Function `location-update`

**Files:**
- Create: `supabase/functions/location-update/index.ts`

- [ ] **Step 5.1 : Écrire la fonction**

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { ok, fail, preflight } from '../_shared/response.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

Deno.serve(async (req) => {
  const pf = preflight(req)
  if (pf) return pf

  const url = new URL(req.url)
  const token = url.searchParams.get('token')
  if (!token) return fail('MISSING_TOKEN', 'Token manquant', 400)

  // GET : retourne l'adresse actuelle du device pour préremplir le formulaire
  if (req.method === 'GET') {
    const { data: device, error } = await supabase
      .from('devices')
      .select('id, name, address, latitude, longitude')
      .eq('token', token)
      .maybeSingle()

    if (error) return fail('DB_ERROR', error.message, 500)
    if (!device) return fail('TOKEN_NOT_FOUND', 'Device introuvable', 404)
    return ok({ device })
  }

  // POST : mise à jour
  if (req.method === 'POST') {
    const body = await req.json().catch(() => null)
    const { address, latitude, longitude } = body ?? {}
    if (!address) return fail('INVALID_INPUT', 'Adresse requise', 400)

    const { error } = await supabase
      .from('devices')
      .update({
        address,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
      })
      .eq('token', token)

    if (error) return fail('DB_ERROR', error.message, 500)
    return ok({ updated: true })
  }

  return fail('METHOD_NOT_ALLOWED', 'Méthode non supportée', 405)
})
```

- [ ] **Step 5.2 : Déployer + tester**

Déployer via MCP/CLI. Tester avec un token de device existant :

```bash
curl -sS "$VITE_EDGE_FUNCTIONS_URL/location-update?token=<DEVICE_TOKEN>" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY"
```

Attendu : `{"ok":true,"data":{"device":{...}}}`.

- [ ] **Step 5.3 : Commit**

```bash
git add supabase/functions/location-update/
git commit -m "feat(p3): add location-update edge function (GET + POST)"
```

---

### Task 6 : Étendre `lib/api.ts` côté Vue

**Files:**
- Modify: `app/src/lib/api.ts`

- [ ] **Step 6.1 : Test du wrapper**

Créer `app/tests/unit/lib/api.spec.ts` :

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import { viewReport, recoverLink } from '@/lib/api'

beforeEach(() => fetchMock.mockReset())

describe('api', () => {
  it('viewReport returns parsed JSON on success', async () => {
    fetchMock.mockResolvedValue({
      json: () => Promise.resolve({ ok: true, data: { report: { id: '1' } } }),
    })
    const res = await viewReport('TOKEN')
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.data.report.id).toBe('1')
  })

  it('recoverLink posts JSON body', async () => {
    fetchMock.mockResolvedValue({
      json: () => Promise.resolve({ ok: true, data: { sent: true } }),
    })
    await recoverLink('a@b.com')
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/recover-link'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'a@b.com' }),
      }),
    )
  })
})
```

- [ ] **Step 6.2 : Lancer (FAIL)**

```bash
pnpm test:unit
```

Attendu : `viewReport`, `recoverLink` non exportés.

- [ ] **Step 6.3 : Implémenter**

Remplacer `app/src/lib/api.ts` :

```ts
const EDGE_URL = import.meta.env.VITE_EDGE_FUNCTIONS_URL
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!EDGE_URL || !ANON_KEY) {
  throw new Error('Missing VITE_EDGE_FUNCTIONS_URL or VITE_SUPABASE_ANON_KEY')
}

export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } }

async function get<T>(fn: string, params: Record<string, string>): Promise<ApiResponse<T>> {
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(`${EDGE_URL}/${fn}?${qs}`, {
    headers: { apikey: ANON_KEY },
  })
  return res.json()
}

async function post<T>(fn: string, body: unknown): Promise<ApiResponse<T>> {
  const res = await fetch(`${EDGE_URL}/${fn}`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

export type ReportPayload = {
  report: {
    id: string
    device_id: string
    payload: unknown
    created_at: string
    device: { id: string; name: string; address: string | null; company_id: string }
  }
}

export type DevicePayload = {
  device: {
    id: string
    name: string
    address: string | null
    latitude: number | null
    longitude: number | null
  }
}

export const viewReport = (token: string) => get<ReportPayload>('view-report', { token })
export const recoverLink = (email: string) => post<{ sent: true }>('recover-link', { email })
export const getDeviceForLocation = (token: string) =>
  get<DevicePayload>('location-update', { token })
export const updateDeviceLocation = (
  token: string,
  body: { address: string; latitude?: number; longitude?: number },
) => post<{ updated: true }>(`location-update?token=${encodeURIComponent(token)}`, body)
```

- [ ] **Step 6.4 : Lancer (PASS)**

```bash
pnpm test:unit
```

- [ ] **Step 6.5 : Commit**

```bash
git add -A
git commit -m "feat(p3): typed API wrapper for edge functions"
```

---

### Task 7 : ErrorBoundary global

**Files:**
- Create: `app/src/components/ErrorBoundary.vue`
- Modify: `app/src/App.vue`

- [ ] **Step 7.1 : Créer le composant**

Créer `app/src/components/ErrorBoundary.vue` :

```vue
<script setup lang="ts">
import { ref, onErrorCaptured } from 'vue'
import { Button } from '@/components/ui/button'

const err = ref<Error | null>(null)

onErrorCaptured((e) => {
  err.value = e as Error
  return false
})

function reload() {
  window.location.reload()
}
</script>

<template>
  <div v-if="err" class="min-h-screen flex items-center justify-center p-8">
    <div class="max-w-md text-center space-y-4">
      <h1 class="text-2xl font-bold">Quelque chose a mal tourné</h1>
      <p class="text-sm text-slate-600">{{ err.message }}</p>
      <Button @click="reload">Recharger la page</Button>
    </div>
  </div>
  <slot v-else />
</template>
```

- [ ] **Step 7.2 : Envelopper App.vue**

Modifier `app/src/App.vue` :

```vue
<script setup lang="ts">
import { RouterView } from 'vue-router'
import ErrorBoundary from '@/components/ErrorBoundary.vue'
</script>

<template>
  <ErrorBoundary>
    <RouterView />
  </ErrorBoundary>
</template>
```

- [ ] **Step 7.3 : Commit**

```bash
git add -A
git commit -m "feat(p3): add global ErrorBoundary"
```

---

### Task 8 : ReportView

**Files:**
- Create: `app/src/views/public/ReportView.vue`

- [ ] **Step 8.1 : Écrire la vue**

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { viewReport, type ReportPayload } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const route = useRoute()
const router = useRouter()

const loading = ref(true)
const error = ref<string | null>(null)
const data = ref<ReportPayload | null>(null)

onMounted(async () => {
  const token = route.params.token as string
  const res = await viewReport(token)
  loading.value = false
  if (res.ok) {
    data.value = res.data
    return
  }
  if (res.error.code === 'TOKEN_EXPIRED') {
    router.replace({ name: 'recover', query: { reason: 'expired', token } })
    return
  }
  error.value = res.error.message
})
</script>

<template>
  <main class="min-h-screen p-4 bg-slate-50">
    <div class="max-w-4xl mx-auto">
      <p v-if="loading">Chargement du rapport…</p>

      <Card v-else-if="error">
        <CardContent class="pt-6 text-center text-red-600">{{ error }}</CardContent>
      </Card>

      <Card v-else-if="data">
        <CardHeader>
          <CardTitle>Rapport — {{ data.report.device.name }}</CardTitle>
        </CardHeader>
        <CardContent>
          <p class="text-sm text-slate-500 mb-4">
            Émis le {{ new Date(data.report.created_at).toLocaleString('fr-FR') }}
          </p>
          <pre class="text-xs bg-slate-100 p-4 rounded overflow-auto">{{ data.report.payload }}</pre>
        </CardContent>
      </Card>
    </div>
  </main>
</template>
```

**Note :** le rendu détaillé du rapport (graphes, valeurs formatées) sera amélioré quand on portera vraiment le flux n8n. Pour la phase de double-run, afficher le payload brut est suffisant.

- [ ] **Step 8.2 : Commit**

```bash
git add app/src/views/public/ReportView.vue
git commit -m "feat(p3): add ReportView for public token access"
```

---

### Task 9 : RecoverView

**Files:**
- Create: `app/src/views/public/RecoverView.vue`

- [ ] **Step 9.1 : Écrire la vue**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import { recoverLink } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const route = useRoute()
const email = ref('')
const submitting = ref(false)
const submitted = ref(false)
const error = ref<string | null>(null)
const reason = ref(route.query.reason as string | undefined)

async function handleSubmit() {
  submitting.value = true
  error.value = null
  const res = await recoverLink(email.value)
  submitting.value = false
  if (!res.ok) {
    error.value = res.error.message
    return
  }
  submitted.value = true
}
</script>

<template>
  <main class="min-h-screen flex items-center justify-center p-4 bg-slate-50">
    <Card class="w-full max-w-md">
      <CardHeader>
        <CardTitle>Récupérer mon lien</CardTitle>
      </CardHeader>
      <CardContent>
        <p v-if="reason === 'expired'" class="mb-4 text-sm text-amber-700">
          Le lien que vous avez utilisé a expiré. Indiquez votre email pour en recevoir un nouveau.
        </p>

        <div v-if="submitted" class="text-center text-green-700">
          Si cette adresse est connue, un nouveau lien vous a été envoyé.
        </div>

        <form v-else class="space-y-4" @submit.prevent="handleSubmit">
          <div class="space-y-2">
            <Label for="email">Email</Label>
            <Input id="email" v-model="email" type="email" required />
          </div>
          <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
          <Button type="submit" class="w-full" :disabled="submitting">
            {{ submitting ? 'Envoi…' : 'Envoyer un nouveau lien' }}
          </Button>
        </form>
      </CardContent>
    </Card>
  </main>
</template>
```

- [ ] **Step 9.2 : Commit**

```bash
git add app/src/views/public/RecoverView.vue
git commit -m "feat(p3): add RecoverView form"
```

---

### Task 10 : LocationView

**Files:**
- Create: `app/src/views/public/LocationView.vue`

- [ ] **Step 10.1 : Écrire la vue**

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { getDeviceForLocation, updateDeviceLocation, type DevicePayload } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const route = useRoute()
const token = route.params.token as string

const loading = ref(true)
const submitting = ref(false)
const submitted = ref(false)
const error = ref<string | null>(null)
const device = ref<DevicePayload['device'] | null>(null)
const address = ref('')

onMounted(async () => {
  const res = await getDeviceForLocation(token)
  loading.value = false
  if (!res.ok) {
    error.value = res.error.message
    return
  }
  device.value = res.data.device
  address.value = res.data.device.address ?? ''
})

async function handleSubmit() {
  submitting.value = true
  error.value = null
  const res = await updateDeviceLocation(token, { address: address.value })
  submitting.value = false
  if (!res.ok) {
    error.value = res.error.message
    return
  }
  submitted.value = true
}
</script>

<template>
  <main class="min-h-screen flex items-center justify-center p-4 bg-slate-50">
    <Card class="w-full max-w-md">
      <CardHeader>
        <CardTitle>Mise à jour de la localisation</CardTitle>
      </CardHeader>
      <CardContent>
        <p v-if="loading">Chargement…</p>
        <p v-else-if="error" class="text-red-600">{{ error }}</p>

        <div v-else-if="submitted" class="text-center text-green-700">
          Adresse mise à jour pour {{ device?.name }}.
        </div>

        <form v-else class="space-y-4" @submit.prevent="handleSubmit">
          <p class="text-sm text-slate-600">Device : <strong>{{ device?.name }}</strong></p>
          <div class="space-y-2">
            <Label for="address">Adresse</Label>
            <Input id="address" v-model="address" type="text" required />
          </div>
          <Button type="submit" class="w-full" :disabled="submitting">
            {{ submitting ? 'Enregistrement…' : 'Enregistrer' }}
          </Button>
        </form>
      </CardContent>
    </Card>
  </main>
</template>
```

- [ ] **Step 10.2 : Commit**

```bash
git add app/src/views/public/LocationView.vue
git commit -m "feat(p3): add LocationView"
```

---

### Task 11 : Brancher les routes publiques

**Files:**
- Modify: `app/src/router/index.ts`

- [ ] **Step 11.1 : Ajouter les routes**

Modifier `app/src/router/index.ts` (ajouter les 3 routes publiques après la route `/login`) :

```ts
import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import LoginView from '@/views/auth/LoginView.vue'
import AdminLayout from '@/views/admin/AdminLayout.vue'
import DevicesView from '@/views/admin/DevicesView.vue'
import ReportView from '@/views/public/ReportView.vue'
import RecoverView from '@/views/public/RecoverView.vue'
import LocationView from '@/views/public/LocationView.vue'
import { requireAuth } from '@/router/guards'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/login', name: 'login', component: LoginView },
    { path: '/r/:token', name: 'report', component: ReportView },
    { path: '/recover', name: 'recover', component: RecoverView },
    { path: '/location/:token', name: 'location', component: LocationView },
    {
      path: '/admin',
      component: AdminLayout,
      beforeEnter: requireAuth,
      children: [
        { path: 'devices', name: 'admin-devices', component: DevicesView },
        { path: '', redirect: { name: 'admin-devices' } },
      ],
    },
  ],
})
```

- [ ] **Step 11.2 : Vérifier**

```bash
pnpm dev
```

Tester manuellement avec un vrai token + un email connu :
- `/r/<TOKEN>` → rapport ou erreur explicite
- `/recover` → formulaire
- `/location/<DEVICE_TOKEN>` → préremplissage + soumission

- [ ] **Step 11.3 : Commit**

```bash
git add -A
git commit -m "feat(p3): wire public routes in router"
```

---

### Task 12 : Tests d'intégration en double-run

- [ ] **Step 12.1 : Comparer un rapport n8n vs Vue**

Prendre un email récent envoyé par n8n :
1. Cliquer sur le lien → vue n8n
2. Remplacer dans l'URL le host n8n par l'URL Netlify, et la route par `/r/:token`
3. Comparer visuellement les données affichées

Vérifier que la donnée affichée par Vue correspond à celle de n8n. Si des champs manquent côté Vue, étoffer la requête `select()` dans `view-report` (Task 3).

- [ ] **Step 12.2 : Tester recover-link en double-run**

Soumettre le formulaire `/recover` avec un email connu. Vérifier dans n8n (logs d'exécution du workflow `HCXdZ8tnbQ2bDH09`) qu'il a bien été déclenché.

- [ ] **Step 12.3 : Tester location-update**

Soumettre une nouvelle adresse via `/location/<TOKEN>`. Vérifier en SQL que la `devices.address` a bien été mise à jour.

- [ ] **Step 12.4 : Sauvegarder en mémoire**

Sauvegarder dans la mémoire les écarts éventuels entre vue n8n et vue Vue.js (pour traiter en P4), et le fait que P3 est terminé en double-run.

---

## Self-Review

- Spec section 4 (Edge Functions) : ✓ Tasks 3, 4, 5
- Spec section 7 (data flow public) : ✓ Tasks 8, 9, 10 + lib/api.ts
- Spec section 8 (errors) : ✓ ErrorBoundary Task 7, gestion explicite TOKEN_EXPIRED → /recover Task 8
- Spec section 6 (auth) : non touchée ici (P2)
- Spec section 10 (cutover) : ✓ Task 12 valide le double-run
- Pas de placeholders ; chaque Edge Function et chaque vue Vue est complète
- Cohérence des noms : `ApiResponse<T>`, `viewReport()`, `recoverLink()`, `getDeviceForLocation()`, `updateDeviceLocation()` utilisés partout

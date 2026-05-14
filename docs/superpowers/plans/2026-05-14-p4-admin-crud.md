# P4 — Admin CRUD complet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compléter les écrans admin : gestion des destinataires (liste + invitation + édition + suppression), édition des devices, et vue Supervision (dashboard agrégé).

**Architecture :** Trois composables (`useRecipients`, `useDevices` étendu, `useSupervision`) + une Edge Function `invite-recipient` qui orchestre la création de l'auth.user + recipient. Tout passe par RLS (admin scope = sa company).

**Tech Stack :** Suite logique de P2/P3 (Vue 3 + shadcn-vue + supabase-js + Edge Functions).

**Prérequis :** P2 et P3 terminés.

---

## File Structure

```
supabase/functions/
└── invite-recipient/
    └── index.ts

app/src/
├── composables/
│   ├── useRecipients.ts          ← nouveau
│   ├── useDevices.ts             ← étendu (add update + invite)
│   └── useSupervision.ts         ← nouveau
├── lib/api.ts                    ← + inviteRecipient
└── views/admin/
    ├── RecipientsView.vue        ← nouveau
    ├── DevicesView.vue           ← modifié (CRUD)
    └── SupervisionView.vue       ← nouveau
```

---

### Task 1 : Edge Function `invite-recipient`

**Files:**
- Create: `supabase/functions/invite-recipient/index.ts`

L'invitation doit (1) créer un user Supabase Auth via l'admin API (qui envoie l'email d'invitation), (2) créer ou mettre à jour le recipient avec `role='member'`. L'admin API exige `service_role`, donc cette logique vit en Edge Function.

- [ ] **Step 1.1 : Écrire la fonction**

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

  // Récupérer le token Authorization de l'utilisateur appelant
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return fail('UNAUTHORIZED', 'Token manquant', 401)

  // Identifier le caller via son JWT (on appelle Supabase Auth avec ce token)
  const callerClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: { user }, error: userErr } = await callerClient.auth.getUser()
  if (userErr || !user) return fail('UNAUTHORIZED', 'Session invalide', 401)

  // Récupérer la company du caller
  const { data: callerRecipient, error: recErr } = await supabase
    .from('recipients')
    .select('company_id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (recErr || !callerRecipient) return fail('FORBIDDEN', 'Pas de profil lié', 403)

  // Lire le body
  const body = await req.json().catch(() => null)
  const { email, name, phone, role } = body ?? {}
  if (!email || !name) return fail('INVALID_INPUT', 'email et name requis', 400)
  const targetRole = role === 'member' ? 'member' : 'external'

  // 1) Si role=member, on invite via Supabase Auth (envoie l'email)
  let authUserId: string | null = null
  if (targetRole === 'member') {
    const { data: inviteData, error: inviteErr } =
      await supabase.auth.admin.inviteUserByEmail(email)
    if (inviteErr && !inviteErr.message.includes('already')) {
      return fail('INVITE_FAILED', inviteErr.message, 500)
    }
    authUserId = inviteData?.user?.id ?? null
    // si l'utilisateur existait déjà, on récupère son id par un lookup
    if (!authUserId) {
      const { data: existing } = await supabase.auth.admin.listUsers()
      authUserId = existing?.users.find((u) => u.email === email)?.id ?? null
    }
  }

  // 2) Upsert du recipient
  const { data: rec, error: insertErr } = await supabase
    .from('recipients')
    .upsert(
      {
        company_id: callerRecipient.company_id,
        contact_email: email,
        name,
        phone: phone ?? null,
        role: targetRole,
        auth_user_id: authUserId,
      },
      { onConflict: 'contact_email,company_id', ignoreDuplicates: false },
    )
    .select()
    .single()

  if (insertErr) return fail('DB_ERROR', insertErr.message, 500)
  return ok({ recipient: rec })
})
```

**Note** : `onConflict: 'contact_email,company_id'` suppose une contrainte unique sur ces colonnes. Si elle n'existe pas, l'ajouter en migration (Step 1.2).

- [ ] **Step 1.2 : Migration de contrainte unique (si absente)**

Vérifier d'abord :
```sql
SELECT conname FROM pg_constraint WHERE conrelid = 'recipients'::regclass;
```

Si pas de contrainte sur `(contact_email, company_id)`, créer `supabase/migrations/20260514120000_recipients_unique_email_company.sql` :

```sql
ALTER TABLE recipients
  ADD CONSTRAINT recipients_email_company_unique
  UNIQUE (contact_email, company_id);
```

Appliquer via MCP.

- [ ] **Step 1.3 : Déployer la fonction**

```
mcp__supabase__deploy_edge_function(name="invite-recipient", ...)
```

- [ ] **Step 1.4 : Tester avec curl**

Récupérer un JWT de membre via login (DevTools → Network → cookies/local-storage Supabase), puis :

```bash
curl -sS -X POST "$VITE_EDGE_FUNCTIONS_URL/invite-recipient" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"email":"new-member@test.com","name":"New M","role":"member"}'
```

Attendu : `{"ok":true,"data":{"recipient":{...}}}`. Vérifier qu'un email d'invitation a été reçu.

- [ ] **Step 1.5 : Commit**

```bash
git add supabase/
git commit -m "feat(p4): invite-recipient edge function with Supabase Auth invite"
```

---

### Task 2 : Étendre `lib/api.ts`

**Files:**
- Modify: `app/src/lib/api.ts`

- [ ] **Step 2.1 : Ajouter inviteRecipient**

Ajouter à `app/src/lib/api.ts` :

```ts
import { supabase } from '@/lib/supabase'
// ... existing exports ...

async function postAuthed<T>(fn: string, body: unknown): Promise<ApiResponse<T>> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) return { ok: false, error: { code: 'UNAUTHORIZED', message: 'Non connecté' } }

  const res = await fetch(`${EDGE_URL}/${fn}`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  return res.json()
}

export type RecipientInput = {
  email: string
  name: string
  phone?: string
  role: 'member' | 'external'
}

export const inviteRecipient = (input: RecipientInput) =>
  postAuthed<{ recipient: unknown }>('invite-recipient', input)
```

- [ ] **Step 2.2 : Commit**

```bash
git add app/src/lib/api.ts
git commit -m "feat(p4): add inviteRecipient API helper"
```

---

### Task 3 : Composable `useRecipients`

**Files:**
- Create: `app/src/composables/useRecipients.ts`

- [ ] **Step 3.1 : Test**

Créer `app/tests/unit/composables/useRecipients.spec.ts` :

```ts
import { describe, it, expect, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const mockSelect = vi.fn()
const mockDelete = vi.fn()
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: () => mockSelect(),
      delete: () => ({ eq: () => mockDelete() }),
    })),
  },
}))

import { useRecipients } from '@/composables/useRecipients'

describe('useRecipients', () => {
  it('loads recipients', async () => {
    setActivePinia(createPinia())
    mockSelect.mockResolvedValue({
      data: [{ id: '1', name: 'X', contact_email: 'x@y' }],
      error: null,
    })
    const { recipients, load } = useRecipients()
    await load()
    expect(recipients.value).toHaveLength(1)
  })
})
```

- [ ] **Step 3.2 : Implémenter**

Créer `app/src/composables/useRecipients.ts` :

```ts
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/supabase'

type Recipient = Database['public']['Tables']['recipients']['Row']

export function useRecipients() {
  const recipients = ref<Recipient[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function load() {
    loading.value = true
    error.value = null
    const { data, error: err } = await supabase
      .from('recipients')
      .select('*')
      .order('name')
    loading.value = false
    if (err) {
      error.value = err.message
      return
    }
    recipients.value = data ?? []
  }

  async function update(id: string, patch: Partial<Recipient>) {
    const { error: err } = await supabase.from('recipients').update(patch).eq('id', id)
    if (err) {
      error.value = err.message
      return false
    }
    await load()
    return true
  }

  async function remove(id: string) {
    const { error: err } = await supabase.from('recipients').delete().eq('id', id)
    if (err) {
      error.value = err.message
      return false
    }
    await load()
    return true
  }

  return { recipients, loading, error, load, update, remove }
}
```

- [ ] **Step 3.3 : Run tests**

```bash
pnpm test:unit
```

- [ ] **Step 3.4 : Commit**

```bash
git add -A
git commit -m "feat(p4): add useRecipients composable"
```

---

### Task 4 : RecipientsView

**Files:**
- Create: `app/src/views/admin/RecipientsView.vue`
- Modify: `app/src/router/index.ts`, `app/src/views/admin/AdminLayout.vue`

- [ ] **Step 4.1 : Ajouter composants shadcn nécessaires**

```bash
cd app && pnpm dlx shadcn-vue@latest add dialog select badge
```

- [ ] **Step 4.2 : Écrire la vue**

Créer `app/src/views/admin/RecipientsView.vue` :

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRecipients } from '@/composables/useRecipients'
import { inviteRecipient } from '@/lib/api'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

const { recipients, loading, error, load, remove } = useRecipients()

const dialogOpen = ref(false)
const form = ref({ email: '', name: '', phone: '', role: 'external' as 'member' | 'external' })
const submitting = ref(false)
const submitError = ref<string | null>(null)

onMounted(load)

async function handleInvite() {
  submitting.value = true
  submitError.value = null
  const res = await inviteRecipient({ ...form.value })
  submitting.value = false
  if (!res.ok) {
    submitError.value = res.error.message
    return
  }
  dialogOpen.value = false
  form.value = { email: '', name: '', phone: '', role: 'external' }
  await load()
}

async function handleDelete(id: string, name: string) {
  if (!confirm(`Supprimer ${name} ?`)) return
  await remove(id)
}
</script>

<template>
  <section>
    <header class="flex items-center justify-between mb-6">
      <h2 class="text-2xl font-bold">Destinataires</h2>
      <Dialog v-model:open="dialogOpen">
        <DialogTrigger as-child>
          <Button>+ Ajouter</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouveau destinataire</DialogTitle>
          </DialogHeader>
          <form class="space-y-4" @submit.prevent="handleInvite">
            <div class="space-y-2">
              <Label for="r-name">Nom</Label>
              <Input id="r-name" v-model="form.name" required />
            </div>
            <div class="space-y-2">
              <Label for="r-email">Email</Label>
              <Input id="r-email" v-model="form.email" type="email" required />
            </div>
            <div class="space-y-2">
              <Label for="r-phone">Téléphone (optionnel)</Label>
              <Input id="r-phone" v-model="form.phone" />
            </div>
            <div class="space-y-2">
              <Label>Rôle</Label>
              <div class="flex gap-4">
                <label class="flex items-center gap-2">
                  <input type="radio" v-model="form.role" value="external" /> Externe
                </label>
                <label class="flex items-center gap-2">
                  <input type="radio" v-model="form.role" value="member" /> Membre (peut se logger)
                </label>
              </div>
            </div>
            <p v-if="submitError" class="text-sm text-red-600">{{ submitError }}</p>
            <Button type="submit" :disabled="submitting" class="w-full">
              {{ submitting ? 'Envoi…' : form.role === 'member' ? 'Inviter' : 'Ajouter' }}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </header>

    <p v-if="loading">Chargement…</p>
    <p v-else-if="error" class="text-red-600">{{ error }}</p>

    <Table v-else>
      <TableHeader>
        <TableRow>
          <TableHead>Nom</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Téléphone</TableHead>
          <TableHead>Rôle</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="r in recipients" :key="r.id">
          <TableCell>{{ r.name }}</TableCell>
          <TableCell>{{ r.contact_email }}</TableCell>
          <TableCell>{{ r.phone || '—' }}</TableCell>
          <TableCell>
            <Badge :variant="r.role === 'member' ? 'default' : 'secondary'">
              {{ r.role === 'member' ? 'Membre' : 'Externe' }}
            </Badge>
          </TableCell>
          <TableCell>
            <Button variant="ghost" size="sm" @click="handleDelete(r.id, r.name)">
              Supprimer
            </Button>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </section>
</template>
```

- [ ] **Step 4.3 : Ajouter la route**

Dans `app/src/router/index.ts`, ajouter à la liste des children admin :

```ts
import RecipientsView from '@/views/admin/RecipientsView.vue'
// ...
children: [
  { path: 'devices', name: 'admin-devices', component: DevicesView },
  { path: 'recipients', name: 'admin-recipients', component: RecipientsView },
  { path: '', redirect: { name: 'admin-devices' } },
],
```

- [ ] **Step 4.4 : Ajouter le lien dans la sidebar**

Dans `app/src/views/admin/AdminLayout.vue`, ajouter sous le RouterLink `Devices` :

```vue
<RouterLink
  :to="{ name: 'admin-recipients' }"
  class="block px-3 py-2 rounded hover:bg-slate-800"
  active-class="bg-slate-800"
>
  Destinataires
</RouterLink>
```

- [ ] **Step 4.5 : Test manuel**

`pnpm dev`, login, aller sur `/admin/recipients`, ajouter un externe puis un membre. Vérifier que :
- L'externe apparaît dans la table immédiatement
- Le membre reçoit un email d'invitation Supabase
- Supprimer un recipient fonctionne

- [ ] **Step 4.6 : Commit**

```bash
git add -A
git commit -m "feat(p4): add RecipientsView with invite/delete"
```

---

### Task 5 : Étendre DevicesView (édition)

**Files:**
- Modify: `app/src/composables/useDevices.ts`, `app/src/views/admin/DevicesView.vue`

- [ ] **Step 5.1 : Étendre le composable**

Ajouter à `app/src/composables/useDevices.ts` après le `load()` :

```ts
async function update(id: string, patch: Partial<Device>) {
  const { error: err } = await supabase.from('devices').update(patch).eq('id', id)
  if (err) {
    error.value = err.message
    return false
  }
  await load()
  return true
}

return { devices, loading, error, load, update }
```

- [ ] **Step 5.2 : Modifier DevicesView pour permettre l'édition**

Remplacer `app/src/views/admin/DevicesView.vue` :

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useDevices } from '@/composables/useDevices'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Database } from '@/types/supabase'

type Device = Database['public']['Tables']['devices']['Row']

const { devices, loading, error, load, update } = useDevices()

const editOpen = ref(false)
const editing = ref<Device | null>(null)
const saving = ref(false)

onMounted(load)

function openEdit(device: Device) {
  editing.value = { ...device }
  editOpen.value = true
}

async function handleSave() {
  if (!editing.value) return
  saving.value = true
  const { id, name, address, serial_number } = editing.value
  const ok = await update(id, { name, address, serial_number })
  saving.value = false
  if (ok) editOpen.value = false
}
</script>

<template>
  <section>
    <h2 class="text-2xl font-bold mb-6">Devices</h2>

    <p v-if="loading">Chargement…</p>
    <p v-else-if="error" class="text-red-600">{{ error }}</p>

    <Table v-else>
      <TableHeader>
        <TableRow>
          <TableHead>Nom</TableHead>
          <TableHead>Numéro de série</TableHead>
          <TableHead>Adresse</TableHead>
          <TableHead>Dernière connexion</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="d in devices" :key="d.id">
          <TableCell>{{ d.name }}</TableCell>
          <TableCell>{{ d.serial_number || '—' }}</TableCell>
          <TableCell>{{ d.address || '—' }}</TableCell>
          <TableCell>{{ d.last_connection_at || '—' }}</TableCell>
          <TableCell>
            <Button variant="ghost" size="sm" @click="openEdit(d)">Modifier</Button>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>

    <Dialog v-model:open="editOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modifier le device</DialogTitle>
        </DialogHeader>
        <form v-if="editing" class="space-y-4" @submit.prevent="handleSave">
          <div class="space-y-2">
            <Label for="d-name">Nom</Label>
            <Input id="d-name" v-model="editing.name" required />
          </div>
          <div class="space-y-2">
            <Label for="d-serial">Numéro de série</Label>
            <Input id="d-serial" v-model="editing.serial_number" />
          </div>
          <div class="space-y-2">
            <Label for="d-address">Adresse</Label>
            <Input id="d-address" v-model="editing.address" />
          </div>
          <Button type="submit" :disabled="saving" class="w-full">
            {{ saving ? 'Enregistrement…' : 'Enregistrer' }}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  </section>
</template>
```

- [ ] **Step 5.3 : Test manuel**

`pnpm dev`, login, `/admin/devices`, ouvrir un device, changer le nom, sauver. Vérifier en SQL que la modif est bien persistée.

- [ ] **Step 5.4 : Commit**

```bash
git add -A
git commit -m "feat(p4): allow editing devices from admin"
```

---

### Task 6 : SupervisionView (dashboard)

**Files:**
- Create: `app/src/composables/useSupervision.ts`, `app/src/views/admin/SupervisionView.vue`
- Modify: `app/src/router/index.ts`, `app/src/views/admin/AdminLayout.vue`

L'objectif est un dashboard simple : nb de devices, dernière connexion par device, alertes en cours. Cohérent avec le workflow n8n `Supervision`. Pas de graphes complexes au MVP.

- [ ] **Step 6.1 : Composable**

Créer `app/src/composables/useSupervision.ts` :

```ts
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'

export type DeviceStatus = {
  id: string
  name: string
  last_connection_at: string | null
  is_alive: boolean
  has_alert: boolean
}

export function useSupervision() {
  const statuses = ref<DeviceStatus[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function load() {
    loading.value = true
    error.value = null
    const { data: devices, error: err } = await supabase
      .from('devices')
      .select('id, name, last_connection_at')
      .order('name')
    if (err) {
      error.value = err.message
      loading.value = false
      return
    }

    const { data: alerts } = await supabase
      .from('connectivity_alerts')
      .select('device_id, state')

    const now = Date.now()
    const threshold = 60 * 60 * 1000 // 1h, cohérent avec connectivity alerts (memory)

    statuses.value = (devices ?? []).map((d) => {
      const lastMs = d.last_connection_at ? new Date(d.last_connection_at).getTime() : 0
      return {
        id: d.id,
        name: d.name,
        last_connection_at: d.last_connection_at,
        is_alive: now - lastMs < threshold,
        has_alert: alerts?.some((a) => a.device_id === d.id && a.state === 'lost') ?? false,
      }
    })
    loading.value = false
  }

  return { statuses, loading, error, load }
}
```

**Note :** la table `connectivity_alerts` est documentée en mémoire ([[myhexa-connectivity-alerts]]). Si elle n'est pas accessible via RLS au membre, ajouter une policy SELECT similaire à celle de `devices` (via une migration P4-supplémentaire).

- [ ] **Step 6.2 : Policy RLS pour connectivity_alerts (si manquante)**

Vérifier les policies existantes :
```
mcp__supabase__execute_sql(query="SELECT policyname FROM pg_policies WHERE tablename = 'connectivity_alerts';")
```

Si rien, créer `supabase/migrations/20260514130000_rls_connectivity_alerts.sql` :

```sql
ALTER TABLE connectivity_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY connectivity_alerts_select_own_company
  ON connectivity_alerts FOR SELECT
  USING (
    device_id IN (
      SELECT id FROM devices WHERE company_id = current_recipient_company_id()
    )
  );
```

Appliquer.

- [ ] **Step 6.3 : Vue**

Créer `app/src/views/admin/SupervisionView.vue` :

```vue
<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useSupervision } from '@/composables/useSupervision'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const { statuses, loading, error, load } = useSupervision()

const totals = computed(() => ({
  total: statuses.value.length,
  alive: statuses.value.filter((s) => s.is_alive).length,
  alerts: statuses.value.filter((s) => s.has_alert).length,
}))

onMounted(load)
</script>

<template>
  <section>
    <h2 class="text-2xl font-bold mb-6">Supervision</h2>

    <p v-if="loading">Chargement…</p>
    <p v-else-if="error" class="text-red-600">{{ error }}</p>

    <template v-else>
      <div class="grid grid-cols-3 gap-4 mb-8">
        <Card>
          <CardHeader><CardTitle class="text-base">Devices</CardTitle></CardHeader>
          <CardContent class="text-3xl font-bold">{{ totals.total }}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle class="text-base">En ligne</CardTitle></CardHeader>
          <CardContent class="text-3xl font-bold text-green-600">{{ totals.alive }}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle class="text-base">Alertes actives</CardTitle></CardHeader>
          <CardContent class="text-3xl font-bold text-red-600">{{ totals.alerts }}</CardContent>
        </Card>
      </div>

      <div class="space-y-2">
        <div
          v-for="s in statuses"
          :key="s.id"
          class="flex items-center justify-between p-3 bg-white rounded border"
        >
          <div>
            <p class="font-medium">{{ s.name }}</p>
            <p class="text-xs text-slate-500">
              Dernière connexion :
              {{ s.last_connection_at ? new Date(s.last_connection_at).toLocaleString('fr-FR') : 'jamais' }}
            </p>
          </div>
          <div class="flex gap-2">
            <Badge :variant="s.is_alive ? 'default' : 'destructive'">
              {{ s.is_alive ? 'En ligne' : 'Hors ligne' }}
            </Badge>
            <Badge v-if="s.has_alert" variant="destructive">Alerte</Badge>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>
```

- [ ] **Step 6.4 : Ajouter route + lien sidebar**

Dans `app/src/router/index.ts` :

```ts
import SupervisionView from '@/views/admin/SupervisionView.vue'
// ...
children: [
  { path: 'supervision', name: 'admin-supervision', component: SupervisionView },
  { path: 'devices', name: 'admin-devices', component: DevicesView },
  { path: 'recipients', name: 'admin-recipients', component: RecipientsView },
  { path: '', redirect: { name: 'admin-supervision' } },  // ← landing changée
],
```

Dans `AdminLayout.vue`, ajouter en premier dans la nav :

```vue
<RouterLink
  :to="{ name: 'admin-supervision' }"
  class="block px-3 py-2 rounded hover:bg-slate-800"
  active-class="bg-slate-800"
>
  Supervision
</RouterLink>
```

- [ ] **Step 6.5 : Test manuel**

Login. Vérifier le dashboard. Comparer avec le workflow n8n `Supervision` pour cohérence des nombres.

- [ ] **Step 6.6 : Commit**

```bash
git add -A
git commit -m "feat(p4): add SupervisionView dashboard"
```

---

### Task 7 : Validation utilisateur

- [ ] **Step 7.1 : Demo à l'utilisateur**

Faire un tour complet :
- Supervision avec un device hors ligne (couper temporairement les écritures sur un device test)
- Recipients : ajout d'un externe, invitation d'un membre, suppression
- Devices : édition

Recueillir feedback. Itérer sur les rendus si besoin (taille des cards, libellés, ordre des colonnes).

- [ ] **Step 7.2 : Sauvegarder en mémoire**

P4 terminé : tous les écrans admin opérationnels. Prêt pour P5 (tests + cutover).

---

## Self-Review

- Spec section 2 (périmètre admin) : ✓ Tasks 4, 5, 6
- Spec section 6 (auth members) : ✓ Tasks 1, 3 (invitation, RLS appliquée)
- Spec section 7 (data flow admin) : ✓ tous les composables suivent le pattern useX → loading/error/data
- Spec section 8 (errors) : ✓ chaque vue gère loading/error explicitement
- Pas de placeholders ; toutes les requêtes SQL et tous les composants sont complets
- Cohérence des noms : `useRecipients`, `useDevices`, `useSupervision`, `inviteRecipient`, `update`, `remove`
- Note : le mode "magic link Supabase Auth" n'est pas implémenté (spec dit : peut être ajouté plus tard via toggle). C'est intentionnellement hors P4.

# Recipients Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre aux destinataires `role=admin` de gérer (créer / inviter / éditer / supprimer) les destinataires de leur entreprise depuis `/admin/recipients`, avec invitation automatique par magic-link Supabase Auth.

**Architecture:** UI Vue 3 + Pinia consomme `recipients` directement (RLS limite à la company). La création passe par une Edge Function `invite-recipient` qui détient le `service_role` et appelle `auth.admin.inviteUserByEmail`. Un trigger Postgres déjà en place lie `auth_user_id` au premier login.

**Tech Stack:** Vue 3 + TypeScript + Pinia + Vue Router · Supabase (Postgres + Auth + Edge Functions Deno) · Tailwind + composants `components/ui` existants.

**Spec source:** `docs/superpowers/specs/2026-05-16-recipients-management-design.md`

**Notes contextuelles importantes :**
- Le trigger `on_auth_user_created` qui matche `auth.users.email ↔ recipients.contact_email` existe déjà (`supabase/migrations/20260514100100_recipients_auth_link_trigger.sql`).
- Les RLS de base sur `recipients` (SELECT/INSERT/UPDATE/DELETE scoped à la company) existent déjà (`20260514100200_rls_policies_tenant.sql`) **mais** ne restreignent pas aux admins → à durcir.
- Pattern Edge Function existant : `supabase/functions/recover-link/index.ts` (utilise `preflight`/`ok`/`fail` de `_shared/response.ts`).
- Helpers UI : utiliser les composants existants dans `app/src/components/ui` (ne pas en inventer si un équivalent existe).

---

## File Structure

**Created:**
- `supabase/migrations/20260516100000_recipients_admin_rls.sql` — durcissement RLS (admin-only mutations) + unicité `(lower(contact_email), company_id)`
- `supabase/functions/invite-recipient/index.ts` — Edge function admin-only
- `app/src/composables/useRecipients.ts` — fetch/CRUD wrapper
- `app/src/views/admin/RecipientsView.vue` — page principale
- `app/src/components/recipients/RecipientsTable.vue` — tableau + actions
- `app/src/components/recipients/RecipientFormDrawer.vue` — drawer create/edit
- `app/src/components/recipients/DeviceMultiSelect.vue` — sélecteur devices

**Modified:**
- `app/src/router/guards.ts` — ajoute `requireAdmin`
- `app/src/router/index.ts` — nouvelle route `admin-recipients`
- `app/src/views/admin/AdminLayout.vue:171-179` — placeholder "soon" → router-link `v-if="role==='admin'"`

---

## Task 1: Durcissement RLS + contrainte d'unicité

**Files:**
- Create: `supabase/migrations/20260516100000_recipients_admin_rls.sql`

- [ ] **Step 1: Vérifier qu'aucune donnée existante ne viole la contrainte d'unicité**

Run via Supabase MCP `execute_sql`:

```sql
SELECT lower(contact_email) AS email, company_id, count(*)
FROM recipients
WHERE contact_email IS NOT NULL
GROUP BY 1, 2
HAVING count(*) > 1;
```

Expected: 0 lignes. Si > 0 → STOP et résoudre manuellement (déduplication) avant la migration.

- [ ] **Step 2: Écrire la migration**

```sql
-- 20260516100000_recipients_admin_rls.sql
-- Durcit les policies RLS de `recipients` pour limiter les mutations
-- aux destinataires `role=admin` de la même entreprise, et ajoute une
-- contrainte d'unicité (email × company) pour éviter les doublons.

-- Helper : true si l'appelant est admin de sa company
CREATE OR REPLACE FUNCTION current_recipient_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM recipients
    WHERE auth_user_id = auth.uid()
      AND role = 'admin'
  )
$$;

COMMENT ON FUNCTION current_recipient_is_admin IS
  'Renvoie true si le recipient lié à auth.uid() a role=admin.';

-- Index pour les lookups d''email
CREATE INDEX IF NOT EXISTS idx_recipients_email_company
  ON recipients (lower(contact_email), company_id)
  WHERE contact_email IS NOT NULL;

-- Unicité email (case-insensitive) × company
ALTER TABLE recipients
  ADD CONSTRAINT recipients_email_company_unique
  EXCLUDE (lower(contact_email) WITH =, company_id WITH =)
  WHERE (contact_email IS NOT NULL);

-- Resserrer les policies de mutation : admin-only
DROP POLICY IF EXISTS recipients_insert_own_company ON recipients;
DROP POLICY IF EXISTS recipients_update_own_company ON recipients;
DROP POLICY IF EXISTS recipients_delete_own_company ON recipients;

CREATE POLICY recipients_insert_admin
  ON recipients FOR INSERT
  WITH CHECK (
    company_id = current_recipient_company_id()
    AND current_recipient_is_admin()
  );

CREATE POLICY recipients_update_admin
  ON recipients FOR UPDATE
  USING (
    company_id = current_recipient_company_id()
    AND current_recipient_is_admin()
  )
  WITH CHECK (
    company_id = current_recipient_company_id()
    AND current_recipient_is_admin()
  );

CREATE POLICY recipients_delete_admin
  ON recipients FOR DELETE
  USING (
    company_id = current_recipient_company_id()
    AND current_recipient_is_admin()
  );
```

- [ ] **Step 3: Appliquer la migration**

Via Supabase MCP `apply_migration` avec name `recipients_admin_rls` et le SQL ci-dessus.
Expected: success (vérifier via `list_migrations`).

- [ ] **Step 4: Tester les policies**

Run via `execute_sql` (en tant que postgres / service_role) :

```sql
-- Vérifier l'unicité bloque les doublons
INSERT INTO recipients (company_id, name, contact_email, role)
VALUES (
  (SELECT id FROM companies LIMIT 1),
  'test', 'duplicate@test.local', 'viewer'
);
-- Second insert avec MÊME email & company doit échouer
INSERT INTO recipients (company_id, name, contact_email, role)
VALUES (
  (SELECT id FROM companies LIMIT 1),
  'test2', 'Duplicate@test.local', 'viewer'
);
-- → exclusion_violation attendu
DELETE FROM recipients WHERE contact_email ILIKE 'duplicate@test.local';
```

Expected: second INSERT fail avec `exclusion_violation`, cleanup OK.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260516100000_recipients_admin_rls.sql
git commit -m "feat(p4): admin-only RLS on recipients + unique (email, company)"
```

---

## Task 2: Edge Function `invite-recipient`

**Files:**
- Create: `supabase/functions/invite-recipient/index.ts`

- [ ] **Step 1: Créer la structure de la fonction**

Écrire `supabase/functions/invite-recipient/index.ts` :

```typescript
// Edge Function: invite-recipient
// Contract:
//   POST /functions/v1/invite-recipient
//   Headers: Authorization: Bearer <admin JWT>
//   Body: {
//     name: string,
//     contact_email: string,
//     phone?: string,
//     role: 'admin' | 'viewer',
//     type: 'member' | 'external',
//     allowed_device_ids?: string[] | null,
//     recipient_id?: string  // present = promote existing external → member
//   }
//
// Behavior:
//   1. Decode JWT, fetch caller's recipient, refuse if role!=admin.
//   2. If recipient_id provided: verify same company, send invite (no row change).
//   3. Else: insert new recipient row, send invite if type=member.
//   4. Return { recipient, invited }.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { ok, fail, preflight } from '../_shared/response.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const APP_URL = Deno.env.get('APP_URL') ?? 'https://app.hexa-ai.fr'

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
})

interface InviteBody {
  name?: string
  contact_email?: string
  phone?: string | null
  role?: 'admin' | 'viewer'
  type?: 'member' | 'external'
  allowed_device_ids?: string[] | null
  recipient_id?: string
}

Deno.serve(async (req) => {
  const pf = preflight(req)
  if (pf) return pf
  if (req.method !== 'POST') return fail('METHOD_NOT_ALLOWED', 'Méthode non supportée', 405)

  // 1. Authenticate caller
  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.replace(/^Bearer\s+/i, '')
  if (!jwt) return fail('UNAUTHORIZED', 'JWT manquant', 401)

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData.user) return fail('UNAUTHORIZED', 'JWT invalide', 401)

  // 2. Fetch caller's recipient via service-role (skip RLS)
  const { data: callerRcpt, error: callerErr } = await admin
    .from('recipients')
    .select('id, company_id, role')
    .eq('auth_user_id', userData.user.id)
    .maybeSingle()
  if (callerErr) return fail('DB_ERROR', callerErr.message, 500)
  if (!callerRcpt) return fail('FORBIDDEN', 'Destinataire introuvable', 403)
  if (callerRcpt.role !== 'admin') return fail('FORBIDDEN', 'Réservé aux admins', 403)

  // 3. Parse & validate body
  const body = (await req.json().catch(() => null)) as InviteBody | null
  if (!body) return fail('BAD_REQUEST', 'Body JSON requis', 400)

  const email = (body.contact_email ?? '').trim().toLowerCase()
  const name = (body.name ?? '').trim()
  const role = body.role
  const type = body.type
  if (!name) return fail('INVALID_NAME', 'Nom requis', 400)
  if (!email.includes('@')) return fail('INVALID_EMAIL', 'Email invalide', 400)
  if (role !== 'admin' && role !== 'viewer') return fail('INVALID_ROLE', 'Rôle invalide', 400)
  if (type !== 'member' && type !== 'external') return fail('INVALID_TYPE', 'Type invalide', 400)

  let recipient
  if (body.recipient_id) {
    // Promotion path: existing row, same company
    const { data: existing, error: e } = await admin
      .from('recipients')
      .select('*')
      .eq('id', body.recipient_id)
      .maybeSingle()
    if (e) return fail('DB_ERROR', e.message, 500)
    if (!existing) return fail('NOT_FOUND', 'Destinataire introuvable', 404)
    if (existing.company_id !== callerRcpt.company_id) return fail('FORBIDDEN', 'Hors entreprise', 403)
    recipient = existing
  } else {
    // Create path
    const { data: created, error: insErr } = await admin
      .from('recipients')
      .insert({
        company_id: callerRcpt.company_id,
        name,
        contact_email: email,
        phone: body.phone ?? null,
        role,
        allowed_device_ids: body.allowed_device_ids ?? null,
      })
      .select('*')
      .single()
    if (insErr) {
      const code = insErr.code === '23P01' || insErr.code === '23505' ? 'EMAIL_DUPLICATE' : 'DB_ERROR'
      const status = code === 'EMAIL_DUPLICATE' ? 409 : 500
      return fail(code, insErr.message, status)
    }
    recipient = created
  }

  // 4. Send invite if member
  let invited = false
  if (type === 'member') {
    const { error: invErr } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${APP_URL}/login`,
    })
    if (invErr) {
      console.error('[invite-recipient] invite failed', invErr)
      return fail('INVITE_FAILED', invErr.message, 500)
    }
    invited = true
  }

  return ok({ recipient, invited })
})
```

- [ ] **Step 2: Déployer la fonction**

Via Supabase MCP `deploy_edge_function` avec `name: invite-recipient` et le code ci-dessus.
Expected: success, function ID retourné.

- [ ] **Step 3: Smoke test manuel**

Récupérer un JWT admin via `supabase.auth.signInWithPassword` dans la console navigateur (ou via curl `/auth/v1/token`), puis :

```bash
curl -X POST "$SUPABASE_URL/functions/v1/invite-recipient" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Externe",
    "contact_email": "test-external-001@example.invalid",
    "role": "viewer",
    "type": "external"
  }'
```

Expected: `{ ok: true, data: { recipient: {...}, invited: false } }`.

Vérifier en DB que la ligne existe avec `auth_user_id IS NULL`, puis la supprimer.

- [ ] **Step 4: Smoke test des cas d'erreur**

- Sans JWT → 401 UNAUTHORIZED
- JWT d'un `viewer` → 403 FORBIDDEN
- Email déjà existant pour la company → 409 EMAIL_DUPLICATE
- Body sans nom → 400 INVALID_NAME

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/invite-recipient/
git commit -m "feat(p4): edge function invite-recipient (admin-only, magic-link)"
```

---

## Task 3: Router guard `requireAdmin` + route

**Files:**
- Modify: `app/src/router/guards.ts`
- Modify: `app/src/router/index.ts`

- [ ] **Step 1: Ajouter `requireAdmin` dans `guards.ts`**

Editer `app/src/router/guards.ts` pour ajouter :

```typescript
export const requireAdmin: NavigationGuardWithThis<undefined> = () => {
  const auth = useAuthStore()
  if (!auth.isAuthenticated) return { name: 'login' }
  if (auth.recipient?.role !== 'admin') return { name: 'admin-devices' }
}
```

Le fichier final :

```typescript
import type { NavigationGuardWithThis } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

export const requireAuth: NavigationGuardWithThis<undefined> = (to) => {
  const auth = useAuthStore()
  if (!auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
}

export const requireAdmin: NavigationGuardWithThis<undefined> = () => {
  const auth = useAuthStore()
  if (!auth.isAuthenticated) return { name: 'login' }
  if (auth.recipient?.role !== 'admin') return { name: 'admin-devices' }
}
```

- [ ] **Step 2: Ajouter l'import et la route dans `router/index.ts`**

Editer `app/src/router/index.ts` :

```typescript
import RecipientsView from '@/views/admin/RecipientsView.vue'
import { requireAuth, requireAdmin } from '@/router/guards'
```

Puis dans le tableau `children` de `/admin`, ajouter avant la redirection finale `{ path: '', redirect: ... }` :

```typescript
{
  path: 'recipients',
  name: 'admin-recipients',
  component: RecipientsView,
  beforeEnter: requireAdmin,
},
```

- [ ] **Step 3: Créer un placeholder `RecipientsView.vue` pour valider la compilation**

Créer `app/src/views/admin/RecipientsView.vue` (minimal — sera étoffé en Task 6) :

```vue
<script setup lang="ts">
</script>

<template>
  <div class="p-6">
    <h1 class="text-xl font-semibold">Destinataires</h1>
    <p class="text-sm text-muted-foreground">À implémenter.</p>
  </div>
</template>
```

- [ ] **Step 4: Lancer le build pour vérifier**

Run: `cd app && pnpm build`
Expected: build success, pas d'erreur TypeScript.

- [ ] **Step 5: Commit**

```bash
git add app/src/router/guards.ts app/src/router/index.ts app/src/views/admin/RecipientsView.vue
git commit -m "feat(p4): admin-recipients route + requireAdmin guard"
```

---

## Task 4: Activer l'entrée "Recipients" dans la sidebar

**Files:**
- Modify: `app/src/views/admin/AdminLayout.vue:171-179`

- [ ] **Step 1: Remplacer le placeholder par un router-link admin-only**

Dans `app/src/views/admin/AdminLayout.vue`, remplacer le bloc `<div ...>Recipients<span>soon</span></div>` (lignes ~171-179) par :

```vue
<router-link
  v-if="role === 'admin'"
  :to="{ name: 'admin-recipients' }"
  class="px-3 py-2.5 text-sm rounded-md transition-colors flex items-center gap-3"
  :class="$route.name === 'admin-recipients'
    ? 'bg-secondary text-foreground'
    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'"
>
  <svg viewBox="0 0 24 24" class="size-4 shrink-0" fill="none" stroke="currentColor" stroke-width="1.7">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
  <span>Destinataires</span>
</router-link>
```

Note : la valeur exacte des classes CSS doit suivre le pattern des autres liens du même fichier (par ex. l'entrée "Devices") — adapter en regardant les `<router-link>` voisins ou le `<button>` `isAlarms`.

- [ ] **Step 2: Vérification visuelle**

Lancer `cd app && pnpm dev`, se logger avec un compte admin → "Destinataires" doit apparaître dans la sidebar et naviguer vers `/admin/recipients` (page placeholder).
Se logger avec un compte viewer → l'entrée ne doit PAS apparaître. Si on force `/admin/recipients` dans l'URL, on est redirigé vers `/admin/devices`.

- [ ] **Step 3: Commit**

```bash
git add app/src/views/admin/AdminLayout.vue
git commit -m "feat(p4): sidebar entry 'Destinataires' (admin-only)"
```

---

## Task 5: Composable `useRecipients`

**Files:**
- Create: `app/src/composables/useRecipients.ts`

- [ ] **Step 1: Écrire le composable**

Créer `app/src/composables/useRecipients.ts` :

```typescript
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import type { Database } from '@/types/supabase'

export type Recipient = Database['public']['Tables']['recipients']['Row']

export interface InvitePayload {
  name: string
  contact_email: string
  phone?: string | null
  role: 'admin' | 'viewer'
  type: 'member' | 'external'
  allowed_device_ids?: string[] | null
  recipient_id?: string
}

export function useRecipients() {
  const auth = useAuthStore()
  const items = ref<Recipient[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const members = computed(() => items.value.filter((r) => r.auth_user_id !== null))
  const externals = computed(() => items.value.filter((r) => r.auth_user_id === null))

  async function fetchAll() {
    if (!auth.companyId) return
    loading.value = true
    error.value = null
    const { data, error: err } = await supabase
      .from('recipients')
      .select('*')
      .eq('company_id', auth.companyId)
      .order('name', { ascending: true })
    loading.value = false
    if (err) {
      error.value = err.message
      return
    }
    items.value = data ?? []
  }

  async function invite(payload: InvitePayload) {
    const { data, error: err } = await supabase.functions.invoke('invite-recipient', {
      body: payload,
    })
    if (err) throw new Error(err.message)
    if (!data?.ok) throw new Error(data?.error?.message ?? 'Erreur inconnue')
    await fetchAll()
    return data.data as { recipient: Recipient; invited: boolean }
  }

  async function update(id: string, patch: Partial<Recipient>) {
    const { error: err } = await supabase
      .from('recipients')
      .update(patch)
      .eq('id', id)
    if (err) throw new Error(err.message)
    await fetchAll()
  }

  async function remove(id: string) {
    const { error: err } = await supabase
      .from('recipients')
      .delete()
      .eq('id', id)
    if (err) throw new Error(err.message)
    await fetchAll()
  }

  return { items, members, externals, loading, error, fetchAll, invite, update, remove }
}
```

- [ ] **Step 2: Vérifier que le build TS passe**

Run: `cd app && pnpm build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add app/src/composables/useRecipients.ts
git commit -m "feat(p4): useRecipients composable (fetch/invite/update/delete)"
```

---

## Task 6: DeviceMultiSelect

**Files:**
- Create: `app/src/components/recipients/DeviceMultiSelect.vue`

- [ ] **Step 1: Écrire le composant**

```vue
<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  modelValue: string[] | null
  devices: Array<{ id: string; name: string | null }>
}>()
const emit = defineEmits<{ 'update:modelValue': [val: string[] | null] }>()

const allSelected = computed(() => props.modelValue === null)
const selected = computed(() => new Set(props.modelValue ?? []))

function toggleAll() {
  emit('update:modelValue', allSelected.value ? [] : null)
}

function toggle(id: string) {
  if (allSelected.value) {
    // moving from "all" → explicit list of all except this one
    emit('update:modelValue', props.devices.filter((d) => d.id !== id).map((d) => d.id))
    return
  }
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  emit('update:modelValue', Array.from(next))
}
</script>

<template>
  <div class="space-y-2">
    <label class="flex items-center gap-2 text-sm">
      <input type="checkbox" :checked="allSelected" @change="toggleAll" />
      <span class="font-medium">Tous les devices</span>
    </label>
    <div v-if="!allSelected" class="max-h-48 overflow-y-auto border border-border rounded-md p-2 space-y-1">
      <label v-for="d in devices" :key="d.id" class="flex items-center gap-2 text-sm py-0.5">
        <input
          type="checkbox"
          :checked="selected.has(d.id)"
          @change="toggle(d.id)"
        />
        <span>{{ d.name ?? d.id }}</span>
      </label>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add app/src/components/recipients/DeviceMultiSelect.vue
git commit -m "feat(p4): DeviceMultiSelect component"
```

---

## Task 7: RecipientFormDrawer

**Files:**
- Create: `app/src/components/recipients/RecipientFormDrawer.vue`

- [ ] **Step 1: Écrire le drawer**

```vue
<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import DeviceMultiSelect from './DeviceMultiSelect.vue'
import type { Recipient, InvitePayload } from '@/composables/useRecipients'

const props = defineProps<{
  open: boolean
  recipient: Recipient | null  // null = create mode
  devices: Array<{ id: string; name: string | null }>
}>()
const emit = defineEmits<{
  'update:open': [val: boolean]
  invite: [payload: InvitePayload]
  save: [id: string, patch: Partial<Recipient>]
}>()

const isEdit = computed(() => props.recipient !== null)

const name = ref('')
const email = ref('')
const phone = ref('')
const role = ref<'admin' | 'viewer'>('viewer')
const type = ref<'member' | 'external'>('external')
const allowedDevices = ref<string[] | null>(null)
const submitting = ref(false)
const error = ref<string | null>(null)

watch(
  () => props.open,
  (o) => {
    if (!o) return
    if (props.recipient) {
      name.value = props.recipient.name
      email.value = props.recipient.contact_email ?? ''
      phone.value = props.recipient.phone ?? ''
      role.value = (props.recipient.role as 'admin' | 'viewer') ?? 'viewer'
      type.value = props.recipient.auth_user_id ? 'member' : 'external'
      allowedDevices.value = props.recipient.allowed_device_ids
    } else {
      name.value = ''
      email.value = ''
      phone.value = ''
      role.value = 'viewer'
      type.value = 'external'
      allowedDevices.value = null
    }
    error.value = null
  },
)

function close() {
  if (!submitting.value) emit('update:open', false)
}

async function submit() {
  error.value = null
  if (!name.value.trim()) {
    error.value = 'Nom requis'
    return
  }
  if (!email.value.includes('@')) {
    error.value = 'Email invalide'
    return
  }
  submitting.value = true
  try {
    if (isEdit.value && props.recipient) {
      emit('save', props.recipient.id, {
        name: name.value.trim(),
        phone: phone.value.trim() || null,
        role: role.value,
        allowed_device_ids: allowedDevices.value,
      })
    } else {
      emit('invite', {
        name: name.value.trim(),
        contact_email: email.value.trim().toLowerCase(),
        phone: phone.value.trim() || null,
        role: role.value,
        type: type.value,
        allowed_device_ids: allowedDevices.value,
      })
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center sm:justify-end"
    @click.self="close"
  >
    <div class="bg-background w-full sm:max-w-md h-full sm:h-auto sm:max-h-[90vh] overflow-y-auto border-l border-border p-6 space-y-4">
      <header class="flex items-center justify-between">
        <h2 class="text-lg font-semibold">
          {{ isEdit ? 'Modifier le destinataire' : 'Ajouter un destinataire' }}
        </h2>
        <button @click="close" class="text-muted-foreground hover:text-foreground" aria-label="Fermer">×</button>
      </header>

      <div class="space-y-3">
        <label class="block">
          <span class="text-xs uppercase tracking-wide text-muted-foreground">Nom</span>
          <input v-model="name" class="mt-1 w-full border border-border bg-secondary/30 rounded-md px-3 py-2 text-sm" />
        </label>

        <label class="block">
          <span class="text-xs uppercase tracking-wide text-muted-foreground">Email</span>
          <input
            v-model="email"
            type="email"
            :disabled="isEdit"
            class="mt-1 w-full border border-border bg-secondary/30 rounded-md px-3 py-2 text-sm disabled:opacity-60"
          />
          <span v-if="isEdit" class="text-xs text-muted-foreground">L'email ne peut pas être modifié.</span>
        </label>

        <label class="block">
          <span class="text-xs uppercase tracking-wide text-muted-foreground">Téléphone (optionnel)</span>
          <input v-model="phone" class="mt-1 w-full border border-border bg-secondary/30 rounded-md px-3 py-2 text-sm" />
        </label>

        <div v-if="!isEdit">
          <span class="text-xs uppercase tracking-wide text-muted-foreground">Type</span>
          <div class="mt-1 flex gap-3 text-sm">
            <label class="flex items-center gap-1"><input type="radio" value="member" v-model="type" /> Membre (invite)</label>
            <label class="flex items-center gap-1"><input type="radio" value="external" v-model="type" /> Externe (email)</label>
          </div>
        </div>

        <div>
          <span class="text-xs uppercase tracking-wide text-muted-foreground">Rôle</span>
          <div class="mt-1 flex gap-3 text-sm">
            <label class="flex items-center gap-1"><input type="radio" value="viewer" v-model="role" /> Viewer</label>
            <label class="flex items-center gap-1"><input type="radio" value="admin" v-model="role" /> Admin</label>
          </div>
        </div>

        <div>
          <span class="text-xs uppercase tracking-wide text-muted-foreground">Devices accessibles</span>
          <DeviceMultiSelect v-model="allowedDevices" :devices="devices" class="mt-2" />
        </div>
      </div>

      <p v-if="error" class="text-sm text-red-500">{{ error }}</p>

      <footer class="flex justify-end gap-2 pt-2">
        <button @click="close" class="px-3 py-2 text-sm border border-border rounded-md">Annuler</button>
        <button
          @click="submit"
          :disabled="submitting"
          class="px-3 py-2 text-sm bg-primary text-primary-foreground rounded-md disabled:opacity-60"
        >
          {{ isEdit ? 'Enregistrer' : (type === 'member' ? 'Créer + envoyer l\'invite' : 'Créer') }}
        </button>
      </footer>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add app/src/components/recipients/RecipientFormDrawer.vue
git commit -m "feat(p4): RecipientFormDrawer (create+edit)"
```

---

## Task 8: RecipientsTable

**Files:**
- Create: `app/src/components/recipients/RecipientsTable.vue`

- [ ] **Step 1: Écrire le tableau**

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Recipient } from '@/composables/useRecipients'

const props = defineProps<{
  items: Recipient[]
  search: string
}>()
const emit = defineEmits<{
  edit: [r: Recipient]
  remove: [r: Recipient]
  invite: [r: Recipient]  // promote external → member or resend
}>()

const filtered = computed(() => {
  const q = props.search.trim().toLowerCase()
  if (!q) return props.items
  return props.items.filter(
    (r) =>
      r.name.toLowerCase().includes(q) ||
      (r.contact_email?.toLowerCase().includes(q) ?? false),
  )
})

function deviceLabel(r: Recipient): string {
  if (!r.allowed_device_ids || r.allowed_device_ids.length === 0) {
    return r.allowed_device_ids === null ? 'Tous' : '—'
  }
  return `${r.allowed_device_ids.length}`
}

function type(r: Recipient): 'Membre' | 'Externe' {
  return r.auth_user_id ? 'Membre' : 'Externe'
}

function canInvite(r: Recipient): boolean {
  return r.auth_user_id === null
}
</script>

<template>
  <div class="border border-border rounded-md overflow-hidden">
    <table class="w-full text-sm">
      <thead class="bg-secondary/30 text-xs uppercase tracking-wide text-muted-foreground">
        <tr>
          <th class="text-left px-3 py-2">Nom</th>
          <th class="text-left px-3 py-2">Email</th>
          <th class="text-left px-3 py-2">Téléphone</th>
          <th class="text-left px-3 py-2">Type</th>
          <th class="text-left px-3 py-2">Rôle</th>
          <th class="text-left px-3 py-2">Devices</th>
          <th class="text-right px-3 py-2">Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in filtered" :key="r.id" class="border-t border-border">
          <td class="px-3 py-2">{{ r.name }}</td>
          <td class="px-3 py-2">{{ r.contact_email ?? '—' }}</td>
          <td class="px-3 py-2">{{ r.phone ?? '—' }}</td>
          <td class="px-3 py-2">
            <span class="text-xs px-1.5 py-0.5 rounded border border-border">{{ type(r) }}</span>
          </td>
          <td class="px-3 py-2">{{ r.role }}</td>
          <td class="px-3 py-2">{{ deviceLabel(r) }}</td>
          <td class="px-3 py-2 text-right space-x-2">
            <button
              v-if="canInvite(r)"
              @click="emit('invite', r)"
              class="text-xs text-primary hover:underline"
              :title="r.auth_user_id ? 'Renvoyer l\'invite' : 'Inviter comme membre'"
            >
              Inviter
            </button>
            <button @click="emit('edit', r)" class="text-xs hover:underline">Éditer</button>
            <button @click="emit('remove', r)" class="text-xs text-red-500 hover:underline">Supprimer</button>
          </td>
        </tr>
        <tr v-if="filtered.length === 0">
          <td colspan="7" class="px-3 py-6 text-center text-muted-foreground">Aucun destinataire</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add app/src/components/recipients/RecipientsTable.vue
git commit -m "feat(p4): RecipientsTable + row actions"
```

---

## Task 9: RecipientsView (orchestrateur)

**Files:**
- Modify: `app/src/views/admin/RecipientsView.vue` (remplace le placeholder)

- [ ] **Step 1: Écrire la vue complète**

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useRecipients, type Recipient, type InvitePayload } from '@/composables/useRecipients'
import RecipientsTable from '@/components/recipients/RecipientsTable.vue'
import RecipientFormDrawer from '@/components/recipients/RecipientFormDrawer.vue'

const auth = useAuthStore()
const { items, loading, error, fetchAll, invite, update, remove } = useRecipients()

const devices = ref<Array<{ id: string; name: string | null }>>([])
const search = ref('')
const drawerOpen = ref(false)
const editing = ref<Recipient | null>(null)
const flash = ref<string | null>(null)

async function loadDevices() {
  if (!auth.companyId) return
  const { data } = await supabase
    .from('devices')
    .select('id, name')
    .eq('company_id', auth.companyId)
    .order('name', { ascending: true })
  devices.value = data ?? []
}

onMounted(async () => {
  await Promise.all([fetchAll(), loadDevices()])
})

function openCreate() {
  editing.value = null
  drawerOpen.value = true
}

function openEdit(r: Recipient) {
  editing.value = r
  drawerOpen.value = true
}

async function handleInvite(payload: InvitePayload) {
  try {
    const res = await invite(payload)
    flash.value = res.invited
      ? `Invitation envoyée à ${payload.contact_email}`
      : `Destinataire ${payload.contact_email} créé`
    drawerOpen.value = false
  } catch (e) {
    flash.value = `Erreur : ${(e as Error).message}`
  }
}

async function handleSave(id: string, patch: Partial<Recipient>) {
  try {
    await update(id, patch)
    flash.value = 'Destinataire mis à jour'
    drawerOpen.value = false
  } catch (e) {
    flash.value = `Erreur : ${(e as Error).message}`
  }
}

async function handleRemove(r: Recipient) {
  if (!confirm(`Supprimer ${r.name} ?`)) return
  try {
    await remove(r.id)
    flash.value = `${r.name} supprimé`
  } catch (e) {
    flash.value = `Erreur : ${(e as Error).message}`
  }
}

async function handleResend(r: Recipient) {
  if (!r.contact_email) return
  try {
    const res = await invite({
      recipient_id: r.id,
      name: r.name,
      contact_email: r.contact_email,
      role: (r.role as 'admin' | 'viewer') ?? 'viewer',
      type: 'member',
    })
    flash.value = res.invited
      ? `Invitation envoyée à ${r.contact_email}`
      : 'Invitation traitée'
  } catch (e) {
    flash.value = `Erreur : ${(e as Error).message}`
  }
}
</script>

<template>
  <div class="p-6 space-y-4">
    <header class="flex items-center justify-between">
      <div>
        <h1 class="text-xl font-semibold">Destinataires</h1>
        <p class="text-sm text-muted-foreground">
          Membres (avec accès portail) et externes (email uniquement) pour {{ auth.companyName ?? '—' }}.
        </p>
      </div>
      <button @click="openCreate" class="px-3 py-2 text-sm bg-primary text-primary-foreground rounded-md">
        + Ajouter
      </button>
    </header>

    <input
      v-model="search"
      placeholder="Rechercher (nom, email)"
      class="w-full sm:max-w-xs border border-border bg-secondary/30 rounded-md px-3 py-2 text-sm"
    />

    <p v-if="loading" class="text-sm text-muted-foreground">Chargement…</p>
    <p v-if="error" class="text-sm text-red-500">{{ error }}</p>
    <p v-if="flash" class="text-sm text-primary">{{ flash }}</p>

    <RecipientsTable
      :items="items"
      :search="search"
      @edit="openEdit"
      @remove="handleRemove"
      @invite="handleResend"
    />

    <RecipientFormDrawer
      v-model:open="drawerOpen"
      :recipient="editing"
      :devices="devices"
      @invite="handleInvite"
      @save="handleSave"
    />
  </div>
</template>
```

- [ ] **Step 2: Vérifier le build**

Run: `cd app && pnpm build`
Expected: success.

- [ ] **Step 3: Smoke test E2E manuel**

Lancer `cd app && pnpm dev`, se connecter avec un compte admin :

1. Naviguer vers `/admin/recipients` → liste s'affiche.
2. Cliquer "Ajouter", saisir un externe (`type=externe`, email bidon `*@test.invalid`), submit → toast de succès, ligne visible.
3. Cliquer "Éditer" sur la ligne, changer le rôle, submit → mise à jour visible.
4. Cliquer "Inviter" sur la ligne externe → invite déclenchée (pas d'erreur).
5. Cliquer "Supprimer" → confirmation → ligne retirée.
6. Se déconnecter, se connecter en `viewer` → entrée "Destinataires" absente du menu. Forcer l'URL `/admin/recipients` → redirect `/admin/devices`.

- [ ] **Step 4: Commit**

```bash
git add app/src/views/admin/RecipientsView.vue
git commit -m "feat(p4): RecipientsView — list/create/edit/invite/delete"
```

---

## Task 10: Vérification finale

- [ ] **Step 1: Build complet + lint**

Run: `cd app && pnpm build && pnpm lint`
Expected: pas d'erreur.

- [ ] **Step 2: Vérifier les RLS en pratique**

Dans Supabase MCP, vérifier qu'un viewer ne peut pas écrire :

```sql
-- En tant que viewer (via JWT impersonation si dispo, sinon en local) :
INSERT INTO recipients (company_id, name, role) VALUES (...) RETURNING id;
-- Attendu : 0 lignes (RLS WITH CHECK failed)
```

- [ ] **Step 3: Confirmer que les workflows n8n existants restent fonctionnels**

Lister les workflows actifs qui touchent `recipients` (via mémoire `myhexa-connectivity-alerts`, `myhexa-schema`) et vérifier qu'aucun ne casse — la migration ne change que les policies de mutation côté JWT user, pas les accès `postgres`/`service_role` qu'utilisent les workflows.

- [ ] **Step 4: Commit final si besoin et résumé**

Si tout est OK : pas de commit supplémentaire. Sinon : push de correctifs.

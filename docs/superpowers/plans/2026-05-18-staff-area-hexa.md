# Staff Area Hexa-ai Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre aux membres d'Hexa-ai (recipients de la compagnie `is_hexa_internal=true`) un accès cross-company avec mécanisme "agir comme" pour gérer compagnies et devices clients.

**Architecture:** Une colonne `is_hexa_internal` sur `companies` + deux helpers SQL (`is_hexa_staff`, `is_hexa_staff_admin`) qui dérivent le statut staff depuis les recipients existants. Les policies RLS étendues laissent passer ces helpers en lecture, et conditionnent l'écriture au rôle `admin`. Côté front, un store auth étend `companyId` en `effectiveCompanyId` (override sessionStorage `actAsCompanyId`), un bandeau `<StaffBar>` permet le switch de compagnie, et un espace `/admin/staff/*` ajoute la liste/CRUD compagnies + devices globaux.

**Tech Stack:** Vue 3 + TS + Pinia · Supabase (Postgres RLS) · Tailwind.

**Spec source:** `docs/superpowers/specs/2026-05-18-staff-area-hexa-design.md`

**Important :**
- Helpers DB existants : `current_recipient_company_id()`, `current_recipient_is_admin()`. Les nouveaux helpers staff suivent le même pattern (`SECURITY DEFINER`, `STABLE`).
- Provisioning device : pas d'edge function (le flow n8n reste en place pour les IoT). Le formulaire staff crée une ligne `devices` via INSERT direct (RLS staff admin autorise).
- Compatibilité : aucun changement de comportement pour les users non-staff (le `OR is_hexa_staff()` ne déclenche que pour les recipients Hexa-ai).

---

## File Structure

**Created:**
- `supabase/migrations/20260518120000_companies_is_hexa_internal.sql` — column + index + flag Hexa-ai
- `supabase/migrations/20260518120100_is_hexa_staff_helpers.sql` — helpers SQL
- `supabase/migrations/20260518120200_rls_staff_bypass.sql` — patch RLS toutes tables
- `app/src/composables/useStaffCompanies.ts` — fetch liste compagnies + cache
- `app/src/router/guards.ts:requireStaff` — guard ajouté
- `app/src/components/staff/StaffBar.vue` — bandeau cross-company
- `app/src/components/staff/CompanyPickerDropdown.vue` — dropdown searchable
- `app/src/views/admin/staff/CompaniesView.vue` — liste compagnies
- `app/src/views/admin/staff/CompanyDetailView.vue` — détail (info + devices + recipients)
- `app/src/views/admin/staff/DevicesView.vue` — vue globale devices
- `app/src/views/admin/staff/DeviceNewView.vue` — provisioning manuel

**Modified:**
- `app/src/types/supabase.ts` — regen post-migration
- `app/src/stores/auth.ts` — `isHexaStaff`, `actAsCompanyId`, `effectiveCompanyId`
- `app/src/router/index.ts` — routes `/admin/staff/*` + redirect login
- `app/src/views/admin/AdminLayout.vue` — `<StaffBar>` + entrée sidebar
- `app/src/views/admin/InterventionsView.vue` — `auth.companyId` → `auth.effectiveCompanyId`
- `app/src/views/admin/RecipientsView.vue` — idem
- `app/src/composables/useRecipients.ts` — idem
- `app/src/composables/useDevices.ts` — idem (à vérifier)

---

## Task 1: Migration `companies.is_hexa_internal`

**Files:**
- Create: `supabase/migrations/20260518120000_companies_is_hexa_internal.sql`

- [ ] **Step 1: Pré-check données**

Via Supabase MCP `execute_sql`:

```sql
SELECT id, name FROM public.companies WHERE name ILIKE '%hexa%';
```

Expected : 1 ligne, id `08a472a4-04de-498e-8f88-3aab12925134`. Si plusieurs, demander confirmation au user.

- [ ] **Step 2: Écrire la migration**

```sql
-- companies.is_hexa_internal : marque la compagnie Hexa-ai pour dériver le statut staff.
-- Toute compagnie avec ce flag confère un accès cross-company à ses recipients.

ALTER TABLE public.companies
  ADD COLUMN is_hexa_internal boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_companies_is_hexa_internal
  ON public.companies (is_hexa_internal) WHERE is_hexa_internal;

UPDATE public.companies
  SET is_hexa_internal = true
  WHERE id = '08a472a4-04de-498e-8f88-3aab12925134';

COMMENT ON COLUMN public.companies.is_hexa_internal IS
  'true pour la compagnie Hexa-ai (interne). Les recipients de cette compagnie sont staff (accès cross-company).';
```

- [ ] **Step 3: Appliquer via MCP**

`apply_migration` name=`companies_is_hexa_internal`, query = SQL ci-dessus.
Expected: success.

- [ ] **Step 4: Vérifier**

```sql
SELECT id, name, is_hexa_internal FROM public.companies WHERE is_hexa_internal;
```

Expected: 1 ligne (Hexa-ai).

- [ ] **Step 5: Persister localement + commit**

Écrire le SQL identique dans `supabase/migrations/20260518120000_companies_is_hexa_internal.sql`.

```bash
git add supabase/migrations/20260518120000_companies_is_hexa_internal.sql
git commit -m "feat(staff): companies.is_hexa_internal flag + Hexa-ai mark"
```

---

## Task 2: Helpers SQL `is_hexa_staff` / `is_hexa_staff_admin`

**Files:**
- Create: `supabase/migrations/20260518120100_is_hexa_staff_helpers.sql`

- [ ] **Step 1: Écrire la migration**

```sql
-- Helpers staff Hexa-ai. Dérivent le statut staff du recipient courant
-- attaché à une compagnie avec is_hexa_internal = true.
-- SECURITY DEFINER + search_path verrouillé pour neutraliser un éventuel
-- override par schema malveillant.

CREATE OR REPLACE FUNCTION public.is_hexa_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.recipients r
    JOIN public.companies c ON c.id = r.company_id
    WHERE r.auth_user_id = auth.uid()
      AND c.is_hexa_internal = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_hexa_staff_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.recipients r
    JOIN public.companies c ON c.id = r.company_id
    WHERE r.auth_user_id = auth.uid()
      AND c.is_hexa_internal = true
      AND r.role = 'admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_hexa_staff(), public.is_hexa_staff_admin() TO authenticated;

COMMENT ON FUNCTION public.is_hexa_staff() IS
  'true si le user courant a un recipient dans une compagnie is_hexa_internal=true';
COMMENT ON FUNCTION public.is_hexa_staff_admin() IS
  'true si is_hexa_staff() ET role = admin sur ce recipient';
```

- [ ] **Step 2: Appliquer via MCP**

`apply_migration` name=`is_hexa_staff_helpers`.

- [ ] **Step 3: Tester en SQL anonyme**

```sql
-- Devrait retourner false (pas d'auth)
SELECT public.is_hexa_staff(), public.is_hexa_staff_admin();
```

Expected : `false, false` (auth.uid() est null hors session authentifiée).

- [ ] **Step 4: Persister localement + commit**

```bash
git add supabase/migrations/20260518120100_is_hexa_staff_helpers.sql
git commit -m "feat(staff): is_hexa_staff + is_hexa_staff_admin SQL helpers"
```

---

## Task 3: Patch RLS toutes tables

**Files:**
- Create: `supabase/migrations/20260518120200_rls_staff_bypass.sql`

- [ ] **Step 1: Capturer l'état avant**

Via MCP `execute_sql` :

```sql
SELECT c.relname AS tablename, p.polname,
       pg_get_expr(p.polqual, c.oid) AS using_expr,
       pg_get_expr(p.polwithcheck, c.oid) AS check_expr
FROM pg_policy p
JOIN pg_class c ON c.oid = p.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
ORDER BY tablename, polname;
```

Coller le résultat dans un fichier temp pour comparaison.

- [ ] **Step 2: Écrire la migration**

Pour chaque policy de chaque table avec `company_id`, étendre USING/WITH CHECK. Les policies actuellement présentes (cf. spec) :

```sql
-- RLS staff bypass : ajout du OR is_hexa_staff() en lecture,
-- OR is_hexa_staff_admin() en écriture. Les comportements clients existants
-- sont préservés à l'identique.

-- companies (SELECT)
DROP POLICY IF EXISTS companies_select_own ON public.companies;
CREATE POLICY companies_select_own ON public.companies FOR SELECT TO authenticated
  USING (id = current_recipient_company_id() OR public.is_hexa_staff());

-- devices (SELECT, UPDATE)
DROP POLICY IF EXISTS devices_select_own_company ON public.devices;
CREATE POLICY devices_select_own_company ON public.devices FOR SELECT TO authenticated
  USING (company_id = current_recipient_company_id() OR public.is_hexa_staff());

DROP POLICY IF EXISTS devices_update_own_company ON public.devices;
CREATE POLICY devices_update_own_company ON public.devices FOR UPDATE TO authenticated
  USING (company_id = current_recipient_company_id() OR public.is_hexa_staff_admin())
  WITH CHECK (company_id = current_recipient_company_id() OR public.is_hexa_staff_admin());

-- devices INSERT (nouvelle policy : permet au staff admin de créer des devices)
CREATE POLICY devices_insert_staff_admin ON public.devices FOR INSERT TO authenticated
  WITH CHECK (public.is_hexa_staff_admin());

-- recipients (SELECT, INSERT, UPDATE, DELETE)
DROP POLICY IF EXISTS recipients_select_own_company ON public.recipients;
CREATE POLICY recipients_select_own_company ON public.recipients FOR SELECT TO authenticated
  USING (company_id = current_recipient_company_id() OR public.is_hexa_staff());

DROP POLICY IF EXISTS recipients_insert_admin ON public.recipients;
CREATE POLICY recipients_insert_admin ON public.recipients FOR INSERT TO authenticated
  WITH CHECK (
    (company_id = current_recipient_company_id() AND current_recipient_is_admin())
    OR public.is_hexa_staff_admin()
  );

DROP POLICY IF EXISTS recipients_update_admin ON public.recipients;
CREATE POLICY recipients_update_admin ON public.recipients FOR UPDATE TO authenticated
  USING (
    (company_id = current_recipient_company_id() AND current_recipient_is_admin())
    OR public.is_hexa_staff_admin()
  )
  WITH CHECK (
    (company_id = current_recipient_company_id() AND current_recipient_is_admin())
    OR public.is_hexa_staff_admin()
  );

DROP POLICY IF EXISTS recipients_delete_admin ON public.recipients;
CREATE POLICY recipients_delete_admin ON public.recipients FOR DELETE TO authenticated
  USING (
    (company_id = current_recipient_company_id() AND current_recipient_is_admin())
    OR public.is_hexa_staff_admin()
  );

-- reports (SELECT seul actuellement)
DROP POLICY IF EXISTS reports_select_own_company ON public.reports;
CREATE POLICY reports_select_own_company ON public.reports FOR SELECT TO authenticated
  USING (
    device_id IN (SELECT id FROM devices WHERE company_id = current_recipient_company_id())
    OR public.is_hexa_staff()
  );

-- field_interventions (SELECT, UPDATE)
DROP POLICY IF EXISTS field_interventions_tenant_select ON public.field_interventions;
CREATE POLICY field_interventions_tenant_select ON public.field_interventions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM devices d JOIN recipients r ON r.company_id = d.company_id
      WHERE d.id = field_interventions.device_id AND r.auth_user_id = auth.uid()
    )
    OR public.is_hexa_staff()
  );

DROP POLICY IF EXISTS field_interventions_admin_update ON public.field_interventions;
CREATE POLICY field_interventions_admin_update ON public.field_interventions FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM devices d JOIN recipients r ON r.company_id = d.company_id
      WHERE d.id = field_interventions.device_id AND r.auth_user_id = auth.uid() AND r.role = 'admin'
    )
    OR public.is_hexa_staff_admin()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM devices d JOIN recipients r ON r.company_id = d.company_id
      WHERE d.id = field_interventions.device_id AND r.auth_user_id = auth.uid() AND r.role = 'admin'
    )
    OR public.is_hexa_staff_admin()
  );

-- companies INSERT/UPDATE (staff admin seul)
CREATE POLICY companies_insert_staff_admin ON public.companies FOR INSERT TO authenticated
  WITH CHECK (public.is_hexa_staff_admin());

CREATE POLICY companies_update_staff_admin ON public.companies FOR UPDATE TO authenticated
  USING (public.is_hexa_staff_admin())
  WITH CHECK (public.is_hexa_staff_admin());
```

- [ ] **Step 3: Appliquer via MCP**

`apply_migration` name=`rls_staff_bypass`.
Expected: success.

- [ ] **Step 4: Recapturer après**

Re-exécuter le SELECT du Step 1 et vérifier visuellement :
- Chaque policy SELECT a `OR public.is_hexa_staff()` dans son using.
- Chaque policy UPDATE/INSERT/DELETE a `OR public.is_hexa_staff_admin()`.
- Nouvelles policies `devices_insert_staff_admin`, `companies_insert_staff_admin`, `companies_update_staff_admin` présentes.

- [ ] **Step 5: Smoke test impersonation (optionnel mais conseillé)**

Identifier un recipient Hexa-ai (par email connu). Via MCP :

```sql
-- Identifier un user staff existant
SELECT r.auth_user_id, c.name
FROM recipients r JOIN companies c ON c.id = r.company_id
WHERE c.is_hexa_internal = true;
```

Si aucun user staff existe encore, créer un recipient pour ton compte (cf. Task 9 step 1) avant de tester.

- [ ] **Step 6: Persister localement + commit**

```bash
git add supabase/migrations/20260518120200_rls_staff_bypass.sql
git commit -m "feat(staff): RLS bypass for is_hexa_staff across all tables"
```

---

## Task 4: Régénération types Supabase

**Files:**
- Modify: `app/src/types/supabase.ts`

- [ ] **Step 1: Régénérer via MCP**

`generate_typescript_types` puis remplacer le contenu de `app/src/types/supabase.ts`.

Si MCP indispo, patch manuel :
- Ajouter dans `Tables.companies.Row` : `is_hexa_internal: boolean`.
- Idem `Insert` / `Update` : `is_hexa_internal?: boolean`.
- Ajouter dans `Functions` :

```typescript
is_hexa_staff: { Args: never; Returns: boolean }
is_hexa_staff_admin: { Args: never; Returns: boolean }
```

- [ ] **Step 2: Vérifier le build**

```bash
cd app && pnpm build
```

Expected: succès.

- [ ] **Step 3: Commit**

```bash
git add app/src/types/supabase.ts
git commit -m "feat(staff): regen supabase types"
```

---

## Task 5: Auth store — `effectiveCompanyId` + `actAsCompanyId`

**Files:**
- Modify: `app/src/stores/auth.ts`

- [ ] **Step 1: Étendre le store**

Remplacer le bloc store de bout-en-bout :

```typescript
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/supabase'

type Recipient = Database['public']['Tables']['recipients']['Row']

const ACT_AS_KEY = 'hexa.actAsCompanyId'

export const useAuthStore = defineStore('auth', () => {
  const session = ref<Session | null>(null)
  const recipient = ref<Recipient | null>(null)
  const companyName = ref<string | null>(null)
  const isHexaInternalCompany = ref<boolean>(false)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const isAuthenticated = computed(() => session.value !== null)
  const companyId = computed(() => recipient.value?.company_id ?? null)
  const isHexaStaff = computed(() => isHexaInternalCompany.value)
  const isHexaStaffAdmin = computed(
    () => isHexaInternalCompany.value && recipient.value?.role === 'admin',
  )

  // Pour les staff : compagnie sur laquelle on "agit". Stockée en sessionStorage,
  // perdue à la fermeture de l'onglet.
  const actAsCompanyId = ref<string | null>(
    typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(ACT_AS_KEY) : null,
  )

  watch(actAsCompanyId, (v) => {
    if (typeof sessionStorage === 'undefined') return
    if (v) sessionStorage.setItem(ACT_AS_KEY, v)
    else sessionStorage.removeItem(ACT_AS_KEY)
  })

  function setActAsCompany(id: string | null) {
    if (!isHexaStaff.value) return
    actAsCompanyId.value = id
  }

  // Toutes les vues admin doivent lire ceci à la place de companyId.
  const effectiveCompanyId = computed<string | null>(() => {
    if (isHexaStaff.value && actAsCompanyId.value) return actAsCompanyId.value
    return companyId.value
  })

  async function loadRecipient() {
    if (!session.value) return
    const { data, error: err } = await supabase
      .from('recipients')
      .select('*, companies(name, is_hexa_internal)')
      .eq('auth_user_id', session.value.user.id)
      .maybeSingle()
    if (err) {
      error.value = err.message
      return
    }
    if (data) {
      const { companies, ...rest } = data as Recipient & {
        companies: { name: string; is_hexa_internal: boolean } | null
      }
      recipient.value = rest as Recipient
      companyName.value = companies?.name ?? null
      isHexaInternalCompany.value = companies?.is_hexa_internal ?? false
    } else {
      recipient.value = null
      companyName.value = null
      isHexaInternalCompany.value = false
    }
  }

  async function init() {
    const { data } = await supabase.auth.getSession()
    session.value = data.session
    if (session.value) await loadRecipient()
    supabase.auth.onAuthStateChange(async (_event, newSession) => {
      session.value = newSession
      if (newSession) await loadRecipient()
      else {
        recipient.value = null
        companyName.value = null
        isHexaInternalCompany.value = false
        actAsCompanyId.value = null
      }
    })
  }

  async function signIn(email: string, password: string) {
    loading.value = true
    error.value = null
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    loading.value = false
    if (err) {
      error.value = err.message
      return false
    }
    return true
  }

  async function signOut() {
    await supabase.auth.signOut()
    session.value = null
    recipient.value = null
    companyName.value = null
    isHexaInternalCompany.value = false
    actAsCompanyId.value = null
  }

  return {
    session,
    recipient,
    companyName,
    loading,
    error,
    isAuthenticated,
    companyId,
    isHexaStaff,
    isHexaStaffAdmin,
    actAsCompanyId,
    setActAsCompany,
    effectiveCompanyId,
    init,
    signIn,
    signOut,
  }
})
```

- [ ] **Step 2: Vérifier le build**

```bash
cd app && pnpm build
```

Expected: succès (les vues lisent encore `companyId`, c'est OK — on les migre en Task 7).

- [ ] **Step 3: Commit**

```bash
git add app/src/stores/auth.ts
git commit -m "feat(staff): auth store — isHexaStaff + actAsCompanyId + effectiveCompanyId"
```

---

## Task 6: Composable `useStaffCompanies` + guard `requireStaff`

**Files:**
- Create: `app/src/composables/useStaffCompanies.ts`
- Modify: `app/src/router/guards.ts`

- [ ] **Step 1: Écrire le composable**

```typescript
// app/src/composables/useStaffCompanies.ts
import { computed, ref } from 'vue'
import { supabase } from '@/lib/supabase'

interface StaffCompany {
  id: string
  name: string
  is_hexa_internal: boolean
  created_at: string
  devices_count: number
  recipients_count: number
}

const companies = ref<StaffCompany[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const lastFetch = ref<number>(0)
const TTL_MS = 60_000

async function fetchOnce(force = false) {
  const fresh = Date.now() - lastFetch.value < TTL_MS
  if (!force && fresh && companies.value.length > 0) return
  loading.value = true
  error.value = null
  const { data, error: err } = await supabase
    .from('companies')
    .select('id, name, is_hexa_internal, created_at, devices(count), recipients(count)')
    .order('name')
  loading.value = false
  if (err) {
    error.value = err.message
    return
  }
  type Row = {
    id: string
    name: string
    is_hexa_internal: boolean
    created_at: string
    devices: { count: number }[]
    recipients: { count: number }[]
  }
  companies.value = ((data ?? []) as Row[]).map((c) => ({
    id: c.id,
    name: c.name,
    is_hexa_internal: c.is_hexa_internal,
    created_at: c.created_at,
    devices_count: c.devices?.[0]?.count ?? 0,
    recipients_count: c.recipients?.[0]?.count ?? 0,
  }))
  lastFetch.value = Date.now()
}

export function useStaffCompanies() {
  return {
    companies: computed(() => companies.value),
    loading: computed(() => loading.value),
    error: computed(() => error.value),
    fetch: fetchOnce,
    refresh: () => fetchOnce(true),
  }
}
```

- [ ] **Step 2: Lire `app/src/router/guards.ts`**

```bash
cat app/src/router/guards.ts
```

Identifier les exports existants (`requireAuth`, `requireAdmin`).

- [ ] **Step 3: Ajouter `requireStaff`**

Ajouter à la fin du fichier :

```typescript
import type { NavigationGuard } from 'vue-router'
// (l'import vue-router est probablement déjà en tête de fichier)

export const requireStaff: NavigationGuard = (_to, _from, next) => {
  const auth = useAuthStore()
  if (!auth.isHexaStaff) {
    return next({ name: 'admin-devices' })
  }
  next()
}
```

Si `useAuthStore` n'est pas encore importé dans le fichier, l'ajouter en tête.

- [ ] **Step 4: Vérifier le build**

```bash
cd app && pnpm build
```

Expected: succès.

- [ ] **Step 5: Commit**

```bash
git add app/src/composables/useStaffCompanies.ts app/src/router/guards.ts
git commit -m "feat(staff): useStaffCompanies composable + requireStaff guard"
```

---

## Task 7: Bandeau staff + sidebar entry + rewire vues sur `effectiveCompanyId`

**Files:**
- Create: `app/src/components/staff/StaffBar.vue`
- Create: `app/src/components/staff/CompanyPickerDropdown.vue`
- Modify: `app/src/views/admin/AdminLayout.vue`
- Modify: `app/src/views/admin/InterventionsView.vue` (3 occurrences `auth.companyId` → `auth.effectiveCompanyId`)
- Modify: `app/src/views/admin/RecipientsView.vue` (2 occurrences)
- Modify: `app/src/composables/useRecipients.ts` (2 occurrences)
- Modify: `app/src/composables/useDevices.ts` (vérifier et adapter si besoin)

- [ ] **Step 1: Écrire le dropdown picker**

```vue
<!-- app/src/components/staff/CompanyPickerDropdown.vue -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useStaffCompanies } from '@/composables/useStaffCompanies'

const props = defineProps<{ modelValue: string | null }>()
const emit = defineEmits<{ 'update:modelValue': [id: string | null] }>()

const open = ref(false)
const query = ref('')
const { companies, fetch } = useStaffCompanies()
onMounted(() => fetch())

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return companies.value
  return companies.value.filter((c) => c.name.toLowerCase().includes(q))
})

const currentName = computed(
  () => companies.value.find((c) => c.id === props.modelValue)?.name ?? null,
)

function select(id: string) {
  emit('update:modelValue', id)
  open.value = false
  query.value = ''
}
</script>

<template>
  <div class="relative">
    <button
      type="button"
      class="font-mono text-[11px] uppercase tracking-wider border border-signal/50 bg-signal/10 text-signal px-2.5 py-1 rounded inline-flex items-center gap-1.5 hover:bg-signal/20 transition"
      @click="open = !open"
    >
      {{ currentName ?? 'Choisir une compagnie…' }}
      <span class="text-[10px]">▾</span>
    </button>
    <div
      v-if="open"
      class="absolute top-full left-0 mt-1 w-64 border border-border bg-card rounded-md shadow-lg z-50"
    >
      <input
        v-model="query"
        type="text"
        placeholder="Rechercher…"
        class="w-full px-3 py-2 bg-transparent border-b border-border text-sm font-mono focus:outline-none focus:border-signal"
        @click.stop
      />
      <div class="max-h-72 overflow-y-auto">
        <button
          v-for="c in filtered"
          :key="c.id"
          type="button"
          class="w-full text-left px-3 py-2 text-sm hover:bg-secondary/50 transition flex items-center justify-between"
          @click="select(c.id)"
        >
          <span>{{ c.name }}</span>
          <span
            v-if="c.is_hexa_internal"
            class="font-mono text-[9px] uppercase tracking-wider text-signal"
          >
            interne
          </span>
        </button>
        <p v-if="!filtered.length" class="px-3 py-3 text-sm text-muted-foreground">
          Aucune compagnie
        </p>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Écrire le StaffBar**

```vue
<!-- app/src/components/staff/StaffBar.vue -->
<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import CompanyPickerDropdown from './CompanyPickerDropdown.vue'

const auth = useAuthStore()
const router = useRouter()

function onPick(id: string | null) {
  auth.setActAsCompany(id)
}

function backToStaff() {
  auth.setActAsCompany(null)
  router.push({ name: 'staff-companies' })
}
</script>

<template>
  <div
    class="h-9 border-b border-signal/40 bg-signal/10 text-signal flex items-center gap-4 px-4 sm:px-6 font-mono text-[10px] uppercase tracking-wider"
  >
    <span class="opacity-60">Staff</span>
    <span class="flex items-center gap-2">
      <span>agit comme :</span>
      <CompanyPickerDropdown
        :model-value="auth.actAsCompanyId"
        @update:model-value="onPick"
      />
    </span>
    <span class="opacity-60 hidden sm:inline">
      · {{ auth.isHexaStaffAdmin ? 'admin' : 'viewer' }}
    </span>
    <button
      class="ml-auto inline-flex items-center gap-1 opacity-70 hover:opacity-100 transition"
      type="button"
      @click="backToStaff"
    >
      ↩ retour staff
    </button>
  </div>
</template>
```

- [ ] **Step 3: Brancher dans `AdminLayout.vue`**

Lire `app/src/views/admin/AdminLayout.vue` pour repérer la structure. Au début du `<template>`, juste avant `<header class="h-12 …">`, insérer :

```vue
<StaffBar v-if="auth.isHexaStaff" />
```

En haut du `<script setup>`, ajouter l'import :

```typescript
import StaffBar from '@/components/staff/StaffBar.vue'
```

Ajouter aussi une entrée sidebar visible si staff. Après le bloc Destinataires, ajouter :

```vue
<div v-if="auth.isHexaStaff" class="my-3 border-t border-border" />

<button
  v-if="auth.isHexaStaff"
  :class="[
    'group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition text-left',
    isStaff
      ? 'text-foreground bg-secondary'
      : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50',
  ]"
  @click="goStaff"
>
  <span
    :class="[
      'absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r transition',
      isStaff ? 'bg-signal' : 'bg-transparent',
    ]"
  />
  <svg viewBox="0 0 24 24" class="size-4 shrink-0" fill="none" stroke="currentColor" stroke-width="1.7">
    <path d="M12 2 4 6v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V6l-8-4Z" />
  </svg>
  <span class="tracking-tight">Staff</span>
  <span v-if="isStaff" class="ml-auto font-mono text-[9px] uppercase tracking-widest text-signal">●</span>
</button>
```

Et dans le `<script setup>` :

```typescript
const isStaff = computed(() => String(route.name ?? '').startsWith('staff-'))
function goStaff() { router.push({ name: 'staff-companies' }); closeSidebar() }
```

Ajouter au breadcrumb map :
```typescript
'staff-companies': 'staff / companies',
'staff-company-detail': 'staff / company',
'staff-devices': 'staff / devices',
'staff-device-new': 'staff / new device',
```

- [ ] **Step 4: Rebrancher les vues sur `effectiveCompanyId`**

Dans `app/src/views/admin/InterventionsView.vue`, remplacer toutes les références `auth.companyId` par `auth.effectiveCompanyId`. Vérifier qu'il y a 3 occurrences (load() ×2 + watch()).

Dans `app/src/views/admin/RecipientsView.vue` : pareil.

Dans `app/src/composables/useRecipients.ts` : pareil.

Vérifier aussi `app/src/composables/useDevices.ts` :

```bash
grep -n "auth\.companyId\|companyId" app/src/composables/useDevices.ts
```

Si présent, remplacer par `effectiveCompanyId`.

- [ ] **Step 5: Vérifier le build**

```bash
cd app && pnpm build
```

Expected: succès.

- [ ] **Step 6: Smoke test local**

```bash
cd app && pnpm dev
```

Login avec compte non-staff → vérifier que rien ne change visuellement.

- [ ] **Step 7: Commit**

```bash
git add app/src/components/staff/ app/src/views/admin/AdminLayout.vue app/src/views/admin/InterventionsView.vue app/src/views/admin/RecipientsView.vue app/src/composables/useRecipients.ts
git add app/src/composables/useDevices.ts 2>/dev/null || true
git commit -m "feat(staff): StaffBar + sidebar entry + rewire vues sur effectiveCompanyId"
```

---

## Task 8: Routes + redirect login + vue placeholder `CompaniesView`

**Files:**
- Create: `app/src/views/admin/staff/CompaniesView.vue` (placeholder)
- Create: `app/src/views/admin/staff/CompanyDetailView.vue` (placeholder)
- Create: `app/src/views/admin/staff/DevicesView.vue` (placeholder)
- Create: `app/src/views/admin/staff/DeviceNewView.vue` (placeholder)
- Modify: `app/src/router/index.ts`
- Modify: `app/src/views/auth/LoginView.vue` (redirect post-login conditionnel)

- [ ] **Step 1: Créer les 4 vues placeholder**

```vue
<!-- app/src/views/admin/staff/CompaniesView.vue -->
<script setup lang="ts"></script>
<template>
  <div class="p-6">
    <h1 class="text-xl font-semibold">Compagnies</h1>
    <p class="text-sm text-muted-foreground">À implémenter en Task 9.</p>
  </div>
</template>
```

Idem `CompanyDetailView.vue`, `DevicesView.vue`, `DeviceNewView.vue` avec le titre adapté.

- [ ] **Step 2: Ajouter les routes**

Dans `app/src/router/index.ts`, ajouter les imports :

```typescript
import StaffCompaniesView from '@/views/admin/staff/CompaniesView.vue'
import StaffCompanyDetailView from '@/views/admin/staff/CompanyDetailView.vue'
import StaffDevicesView from '@/views/admin/staff/DevicesView.vue'
import StaffDeviceNewView from '@/views/admin/staff/DeviceNewView.vue'
import { requireAuth, requireAdmin, requireStaff } from '@/router/guards'
```

Et les routes enfants de `/admin`, après `interventions` :

```typescript
{ path: 'staff/companies', name: 'staff-companies', component: StaffCompaniesView, beforeEnter: requireStaff },
{ path: 'staff/companies/:id', name: 'staff-company-detail', component: StaffCompanyDetailView, beforeEnter: requireStaff },
{ path: 'staff/devices', name: 'staff-devices', component: StaffDevicesView, beforeEnter: requireStaff },
{ path: 'staff/devices/new', name: 'staff-device-new', component: StaffDeviceNewView, beforeEnter: requireStaff },
```

- [ ] **Step 3: Adapter le redirect post-login**

Lire `app/src/views/auth/LoginView.vue`, identifier où se fait le `router.push` après `signIn` réussi.

Remplacer par :

```typescript
import { useAuthStore } from '@/stores/auth'
// ...
if (success) {
  // attendre que le recipient soit chargé (loadRecipient est async dans onAuthStateChange)
  await new Promise((r) => setTimeout(r, 100))
  const target = auth.isHexaStaff ? 'staff-companies' : 'admin-devices'
  router.push({ name: target })
}
```

Note : la condition `auth.isHexaStaff` dépend de `loadRecipient` qui tourne dans `onAuthStateChange`. Le délai de 100ms est un workaround simple ; si flaky, ajouter un `watch` qui attend `auth.recipient` non null.

- [ ] **Step 4: Vérifier le build + smoke**

```bash
cd app && pnpm build && pnpm dev
```

Avec un compte staff (cf. Task 9 step 1 si pas encore créé), login → atterrit sur `/admin/staff/companies` (placeholder).

- [ ] **Step 5: Commit**

```bash
git add app/src/views/admin/staff/ app/src/router/index.ts app/src/views/auth/LoginView.vue
git commit -m "feat(staff): routes /admin/staff/* + login redirect for staff users"
```

---

## Task 9: `CompaniesView` complète + `CompanyDetailView`

**Files:**
- Modify: `app/src/views/admin/staff/CompaniesView.vue`
- Modify: `app/src/views/admin/staff/CompanyDetailView.vue`

- [ ] **Step 1 (prérequis) : créer ou vérifier un recipient staff pour ton compte**

Si tu n'as pas encore de recipient Hexa-ai pour `julien.talbourdet@hexa-ai.fr`, via MCP :

```sql
-- Vérifier
SELECT id, auth_user_id, role, contact_email FROM recipients
WHERE company_id = '08a472a4-04de-498e-8f88-3aab12925134';

-- Si manquant, créer (remplacer le UUID auth_user_id par le tien : SELECT id FROM auth.users WHERE email='julien.talbourdet@hexa-ai.fr')
INSERT INTO recipients (company_id, auth_user_id, role, contact_email)
VALUES (
  '08a472a4-04de-498e-8f88-3aab12925134',
  (SELECT id FROM auth.users WHERE email = 'julien.talbourdet@hexa-ai.fr'),
  'admin',
  'julien.talbourdet@hexa-ai.fr'
)
ON CONFLICT DO NOTHING;
```

- [ ] **Step 2: Implémenter `CompaniesView.vue`**

```vue
<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useStaffCompanies } from '@/composables/useStaffCompanies'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/lib/supabase'

const router = useRouter()
const auth = useAuthStore()
const { companies, loading, error, fetch, refresh } = useStaffCompanies()

const showCreate = ref(false)
const newName = ref('')
const creating = ref(false)
const createError = ref<string | null>(null)

onMounted(() => fetch())

const sorted = computed(() => [...companies.value].sort((a, b) => a.name.localeCompare(b.name)))

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR')
}

async function createCompany() {
  const name = newName.value.trim()
  if (!name) { createError.value = 'Nom requis'; return }
  creating.value = true
  createError.value = null
  const { error: err } = await supabase.from('companies').insert({ name })
  creating.value = false
  if (err) { createError.value = err.message; return }
  newName.value = ''
  showCreate.value = false
  await refresh()
}

function openCompany(id: string) {
  router.push({ name: 'staff-company-detail', params: { id } })
}

function enterAs(id: string) {
  auth.setActAsCompany(id)
  router.push({ name: 'admin-devices' })
}
</script>

<template>
  <div class="p-4 sm:p-6 space-y-4">
    <header class="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h1 class="text-xl font-semibold tracking-tight">Compagnies</h1>
        <p class="text-sm text-muted-foreground">Toutes les compagnies clientes (vue staff Hexa-ai).</p>
      </div>
      <button
        v-if="auth.isHexaStaffAdmin"
        type="button"
        class="font-mono text-[10px] uppercase tracking-wider border border-signal/50 text-signal px-3 py-1.5 rounded-md hover:bg-signal-soft transition"
        @click="showCreate = !showCreate"
      >
        + Nouvelle compagnie
      </button>
    </header>

    <div
      v-if="showCreate"
      class="border border-border rounded-md bg-card/40 p-4 flex flex-col sm:flex-row gap-2"
    >
      <input
        v-model="newName"
        type="text"
        placeholder="Nom de la compagnie"
        class="flex-1 bg-transparent border-0 border-b border-border focus:border-signal focus:outline-none px-0 py-2 text-sm font-mono"
        @keydown.enter="createCompany"
      />
      <button
        type="button"
        :disabled="creating"
        class="font-mono text-[11px] uppercase tracking-[0.22em] bg-signal text-primary-foreground px-4 py-2 rounded-md hover:brightness-110 disabled:opacity-50 transition"
        @click="createCompany"
      >
        Créer
      </button>
    </div>
    <p v-if="createError" class="text-sm text-offline">{{ createError }}</p>

    <p v-if="loading && !companies.length" class="text-sm text-muted-foreground">Chargement…</p>
    <p v-if="error" class="text-sm text-offline">{{ error }}</p>

    <div class="border border-border rounded-md bg-card/40 overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-card/60 border-b border-border">
          <tr>
            <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-3">Nom</th>
            <th class="text-right font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-3 w-[100px]">Devices</th>
            <th class="text-right font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-3 w-[120px]">Recipients</th>
            <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-3 w-[120px]">Créée le</th>
            <th class="text-right font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-3 w-[200px]">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="c in sorted"
            :key="c.id"
            class="border-b border-border/50 last:border-0 hover:bg-secondary/40 transition cursor-pointer"
            @click="openCompany(c.id)"
          >
            <td class="px-4 py-3">
              <div class="font-medium flex items-center gap-2">
                {{ c.name }}
                <span v-if="c.is_hexa_internal" class="font-mono text-[9px] uppercase tracking-wider text-signal">interne</span>
              </div>
            </td>
            <td class="px-4 py-3 text-right font-mono tabular text-muted-foreground">{{ c.devices_count }}</td>
            <td class="px-4 py-3 text-right font-mono tabular text-muted-foreground">{{ c.recipients_count }}</td>
            <td class="px-4 py-3 font-mono text-xs text-muted-foreground tabular">{{ fmtDate(c.created_at) }}</td>
            <td class="px-4 py-3 text-right" @click.stop>
              <button
                type="button"
                class="font-mono text-[10px] uppercase tracking-wider border border-signal/50 text-signal px-2.5 py-1 rounded hover:bg-signal-soft transition"
                @click="enterAs(c.id)"
              >
                Entrer →
              </button>
            </td>
          </tr>
          <tr v-if="!sorted.length && !loading">
            <td colspan="5" class="px-4 py-8 text-center text-muted-foreground text-sm">
              Aucune compagnie
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
```

- [ ] **Step 3: Implémenter `CompanyDetailView.vue`**

```vue
<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

interface CompanyDetail {
  id: string
  name: string
  is_hexa_internal: boolean
  created_at: string
}
interface DeviceLite {
  id: string
  name: string | null
  mac: string | null
  status: string | null
}
interface RecipientLite {
  id: string
  contact_email: string | null
  role: string
}

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const company = ref<CompanyDetail | null>(null)
const devices = ref<DeviceLite[]>([])
const recipients = ref<RecipientLite[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

const editing = ref(false)
const editedName = ref('')

const id = computed(() => String(route.params.id ?? ''))

async function load() {
  if (!id.value) return
  loading.value = true
  error.value = null

  const [{ data: c, error: cErr }, { data: ds, error: dErr }, { data: rs, error: rErr }] =
    await Promise.all([
      supabase.from('companies').select('id, name, is_hexa_internal, created_at').eq('id', id.value).maybeSingle(),
      supabase.from('devices').select('id, name, mac, status').eq('company_id', id.value).order('name'),
      supabase.from('recipients').select('id, contact_email, role').eq('company_id', id.value),
    ])

  loading.value = false
  if (cErr) { error.value = cErr.message; return }
  if (dErr) { error.value = dErr.message; return }
  if (rErr) { error.value = rErr.message; return }

  company.value = c as CompanyDetail
  devices.value = (ds ?? []) as DeviceLite[]
  recipients.value = (rs ?? []) as RecipientLite[]
  editedName.value = company.value?.name ?? ''
}

async function saveName() {
  if (!company.value) return
  const name = editedName.value.trim()
  if (!name) return
  const { error: err } = await supabase.from('companies').update({ name }).eq('id', company.value.id)
  if (err) { error.value = err.message; return }
  company.value.name = name
  editing.value = false
}

function enterAs() {
  if (!company.value) return
  auth.setActAsCompany(company.value.id)
  router.push({ name: 'admin-devices' })
}

function provisionDevice() {
  if (!company.value) return
  router.push({ name: 'staff-device-new', query: { company: company.value.id } })
}

onMounted(load)
watch(id, load)
</script>

<template>
  <div class="p-4 sm:p-6 space-y-6">
    <header class="flex items-center justify-between flex-wrap gap-3">
      <div>
        <router-link
          :to="{ name: 'staff-companies' }"
          class="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground hover:text-foreground transition"
        >
          ← Compagnies
        </router-link>
        <div class="mt-1 flex items-center gap-3">
          <h1 v-if="!editing" class="text-xl font-semibold tracking-tight">
            {{ company?.name ?? '—' }}
            <span v-if="company?.is_hexa_internal" class="ml-2 font-mono text-[10px] uppercase tracking-wider text-signal">interne</span>
          </h1>
          <input
            v-else
            v-model="editedName"
            type="text"
            class="text-xl font-semibold tracking-tight bg-transparent border-b border-signal focus:outline-none"
            @keydown.enter="saveName"
            @keydown.escape="editing = false"
          />
          <button
            v-if="auth.isHexaStaffAdmin && !editing"
            type="button"
            class="font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-signal transition"
            @click="editing = true"
          >
            ✎ renommer
          </button>
          <button
            v-if="editing"
            type="button"
            class="font-mono text-[10px] uppercase tracking-wider text-signal"
            @click="saveName"
          >
            ✓ enregistrer
          </button>
        </div>
      </div>
      <button
        type="button"
        class="font-mono text-[11px] uppercase tracking-[0.22em] border border-signal/50 text-signal px-4 py-2 rounded-md hover:bg-signal-soft transition"
        @click="enterAs"
      >
        Entrer comme {{ company?.name ?? '…' }} →
      </button>
    </header>

    <p v-if="loading" class="text-sm text-muted-foreground">Chargement…</p>
    <p v-if="error" class="text-sm text-offline">{{ error }}</p>

    <section class="space-y-2">
      <div class="flex items-center justify-between">
        <h2 class="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          Devices · {{ devices.length }}
        </h2>
        <button
          v-if="auth.isHexaStaffAdmin"
          type="button"
          class="font-mono text-[10px] uppercase tracking-wider border border-signal/50 text-signal px-2.5 py-1 rounded hover:bg-signal-soft transition"
          @click="provisionDevice"
        >
          + Provisionner
        </button>
      </div>
      <div class="border border-border rounded-md bg-card/40 overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-card/60 border-b border-border">
            <tr>
              <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-2">Nom</th>
              <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-2">MAC</th>
              <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-2">Statut</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in devices" :key="d.id" class="border-b border-border/50 last:border-0">
              <td class="px-4 py-2 font-medium">{{ d.name ?? '—' }}</td>
              <td class="px-4 py-2 font-mono text-xs text-muted-foreground">{{ d.mac ?? '—' }}</td>
              <td class="px-4 py-2 font-mono text-xs text-muted-foreground">{{ d.status ?? '—' }}</td>
            </tr>
            <tr v-if="!devices.length">
              <td colspan="3" class="px-4 py-6 text-center text-muted-foreground text-sm">Aucun device</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="space-y-2">
      <h2 class="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
        Recipients · {{ recipients.length }}
      </h2>
      <div class="border border-border rounded-md bg-card/40 overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-card/60 border-b border-border">
            <tr>
              <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-2">Email</th>
              <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-2 w-[120px]">Rôle</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in recipients" :key="r.id" class="border-b border-border/50 last:border-0">
              <td class="px-4 py-2">{{ r.contact_email ?? '—' }}</td>
              <td class="px-4 py-2 font-mono text-xs text-muted-foreground">{{ r.role }}</td>
            </tr>
            <tr v-if="!recipients.length">
              <td colspan="2" class="px-4 py-6 text-center text-muted-foreground text-sm">Aucun recipient</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="text-xs text-muted-foreground">
        Pour inviter un recipient dans cette compagnie, utilise "Entrer comme {{ company?.name ?? '…' }}" puis va dans Destinataires.
      </p>
    </section>
  </div>
</template>
```

- [ ] **Step 4: Build + smoke**

```bash
cd app && pnpm build
```

Login staff → `/admin/staff/companies` → vois la liste, click sur une compagnie → détail, bouton "Entrer" → bascule sur DevicesView de cette compagnie (le bandeau staff montre maintenant le nom de cette compagnie).

- [ ] **Step 5: Commit**

```bash
git add app/src/views/admin/staff/CompaniesView.vue app/src/views/admin/staff/CompanyDetailView.vue
git commit -m "feat(staff): companies list + detail (read + create + rename + enter-as)"
```

---

## Task 10: `DevicesView` global + `DeviceNewView`

**Files:**
- Modify: `app/src/views/admin/staff/DevicesView.vue`
- Modify: `app/src/views/admin/staff/DeviceNewView.vue`

- [ ] **Step 1: Implémenter `DevicesView.vue`**

```vue
<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useStaffCompanies } from '@/composables/useStaffCompanies'

interface DeviceRow {
  id: string
  name: string | null
  mac: string | null
  status: string | null
  company_id: string
  created_at: string
}

const router = useRouter()
const { companies, fetch: fetchCompanies } = useStaffCompanies()

const devices = ref<DeviceRow[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const filterCompany = ref<'all' | string>('all')
const filterStatus = ref<'all' | 'online' | 'offline'>('all')

async function load() {
  loading.value = true
  error.value = null
  const { data, error: err } = await supabase
    .from('devices')
    .select('id, name, mac, status, company_id, created_at')
    .order('name')
  loading.value = false
  if (err) { error.value = err.message; return }
  devices.value = (data ?? []) as DeviceRow[]
}

const companyName = computed(() => {
  const m = new Map<string, string>()
  for (const c of companies.value) m.set(c.id, c.name)
  return m
})

const filtered = computed(() =>
  devices.value.filter((d) => {
    if (filterCompany.value !== 'all' && d.company_id !== filterCompany.value) return false
    if (filterStatus.value !== 'all' && d.status !== filterStatus.value) return false
    return true
  }),
)

function goCompany(id: string) {
  router.push({ name: 'staff-company-detail', params: { id } })
}

function provision() {
  router.push({ name: 'staff-device-new' })
}

onMounted(() => { fetchCompanies(); load() })
watch(filterCompany, () => {})
</script>

<template>
  <div class="p-4 sm:p-6 space-y-4">
    <header class="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h1 class="text-xl font-semibold tracking-tight">Devices (global)</h1>
        <p class="text-sm text-muted-foreground">Tous les devices, toutes compagnies.</p>
      </div>
      <button
        type="button"
        class="font-mono text-[10px] uppercase tracking-wider border border-signal/50 text-signal px-3 py-1.5 rounded-md hover:bg-signal-soft transition"
        @click="provision"
      >
        + Provisionner
      </button>
    </header>

    <div class="flex flex-wrap gap-2">
      <select v-model="filterCompany" class="bg-card border border-border rounded-md px-3 py-1.5 text-sm font-mono">
        <option value="all">Toutes les compagnies</option>
        <option v-for="c in companies" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
      <select v-model="filterStatus" class="bg-card border border-border rounded-md px-3 py-1.5 text-sm font-mono">
        <option value="all">Tous statuts</option>
        <option value="online">Online</option>
        <option value="offline">Offline</option>
      </select>
    </div>

    <p v-if="loading" class="text-sm text-muted-foreground">Chargement…</p>
    <p v-if="error" class="text-sm text-offline">{{ error }}</p>

    <div class="border border-border rounded-md bg-card/40 overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-card/60 border-b border-border">
          <tr>
            <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-3">Nom</th>
            <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-3">MAC</th>
            <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-3">Compagnie</th>
            <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-3 w-[100px]">Statut</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in filtered" :key="d.id" class="border-b border-border/50 last:border-0 hover:bg-secondary/40 transition">
            <td class="px-4 py-3 font-medium">{{ d.name ?? '—' }}</td>
            <td class="px-4 py-3 font-mono text-xs text-muted-foreground">{{ d.mac ?? '—' }}</td>
            <td class="px-4 py-3">
              <button class="hover:text-signal transition" @click="goCompany(d.company_id)">
                {{ companyName.get(d.company_id) ?? d.company_id }}
              </button>
            </td>
            <td class="px-4 py-3 font-mono text-xs text-muted-foreground">{{ d.status ?? '—' }}</td>
          </tr>
          <tr v-if="!filtered.length && !loading">
            <td colspan="4" class="px-4 py-8 text-center text-muted-foreground text-sm">Aucun device</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Implémenter `DeviceNewView.vue`**

```vue
<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useStaffCompanies } from '@/composables/useStaffCompanies'

const route = useRoute()
const router = useRouter()
const { companies, fetch } = useStaffCompanies()

const name = ref('')
const mac = ref('')
const companyId = ref<string>(String(route.query.company ?? ''))
const submitting = ref(false)
const error = ref<string | null>(null)

onMounted(() => fetch())

const canSubmit = computed(() => name.value.trim() && companyId.value)

async function submit() {
  if (!canSubmit.value) return
  submitting.value = true
  error.value = null
  const { data, error: err } = await supabase
    .from('devices')
    .insert({
      name: name.value.trim(),
      mac: mac.value.trim() || null,
      company_id: companyId.value,
    })
    .select('id')
    .single()
  submitting.value = false
  if (err) { error.value = err.message; return }
  router.push({ name: 'staff-company-detail', params: { id: companyId.value } })
}
</script>

<template>
  <div class="p-4 sm:p-6 max-w-xl mx-auto space-y-5">
    <header>
      <router-link :to="{ name: 'staff-devices' }" class="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground hover:text-foreground transition">
        ← Devices
      </router-link>
      <h1 class="mt-1 text-xl font-semibold tracking-tight">Provisionner un device</h1>
    </header>

    <form class="space-y-4" @submit.prevent="submit">
      <div class="space-y-1.5">
        <label class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Nom *</label>
        <input
          v-model="name"
          type="text"
          required
          placeholder="ex. CTP-Aubervilliers-01"
          class="w-full bg-transparent border-0 border-b border-border focus:border-signal focus:outline-none px-0 py-2 text-sm font-mono"
        />
      </div>
      <div class="space-y-1.5">
        <label class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">MAC (optionnel)</label>
        <input
          v-model="mac"
          type="text"
          placeholder="aa:bb:cc:dd:ee:ff"
          class="w-full bg-transparent border-0 border-b border-border focus:border-signal focus:outline-none px-0 py-2 text-sm font-mono"
        />
      </div>
      <div class="space-y-1.5">
        <label class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Compagnie cible *</label>
        <select v-model="companyId" required class="w-full bg-card border border-border rounded-md px-3 py-2 text-sm font-mono">
          <option value="">— Sélectionner —</option>
          <option v-for="c in companies" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
      </div>

      <p v-if="error" class="text-sm text-offline">{{ error }}</p>

      <div class="flex justify-end gap-2">
        <button type="button" class="font-mono text-[11px] uppercase tracking-[0.22em] px-4 py-2 rounded-md border border-border" @click="router.back()">
          Annuler
        </button>
        <button
          type="submit"
          :disabled="!canSubmit || submitting"
          class="font-mono text-[11px] uppercase tracking-[0.22em] bg-signal text-primary-foreground px-4 py-2 rounded-md hover:brightness-110 disabled:opacity-50 transition"
        >
          {{ submitting ? 'Création…' : 'Créer le device' }}
        </button>
      </div>
    </form>
  </div>
</template>
```

- [ ] **Step 3: Build + smoke**

```bash
cd app && pnpm build
```

Login staff → `/admin/staff/devices` → liste globale OK. Click "+ Provisionner" → form. Créer un device de test (compagnie = une compagnie cliente quelconque) → redirect vers son détail compagnie, device visible.

- [ ] **Step 4: Commit**

```bash
git add app/src/views/admin/staff/DevicesView.vue app/src/views/admin/staff/DeviceNewView.vue
git commit -m "feat(staff): global devices list + manual provisioning form"
```

---

## Task 11: Vérification finale

- [ ] **Step 1: Build complet + tests**

```bash
cd app && pnpm build && pnpm test:unit
```

Expected: succès, tests 8/8 (ou plus) passent.

- [ ] **Step 2: Smoke E2E manuel — couvrir le test plan du spec**

1. **Login non-staff** (autre compte client si dispo, ou inverser temporairement `is_hexa_internal=false` pour ton compte) :
   - Bandeau staff invisible.
   - `/admin/staff/companies` redirect vers `/admin/devices`.

2. **Login staff viewer** (créer un recipient role=viewer dans Hexa-ai pour un compte de test) :
   - Bandeau visible.
   - Dropdown liste toutes les compagnies.
   - DevicesView de n'importe quelle compagnie : lecture OK.
   - Bouton "+ Nouvelle compagnie" absent ; tentative INSERT via console refusée par RLS.

3. **Login staff admin** (ton compte) :
   - Bandeau visible avec "admin".
   - Switch CTP → DevicesView devient celle de CTP.
   - Switch BBR Energie → switch instantané.

4. **Création compagnie + provisioning** :
   - "Nouvelle compagnie" → "Staff Test" créée.
   - Détail → "+ Provisionner" → device créé.
   - "Entrer comme Staff Test" → DevicesView montre le device.

5. **Logout + relogin** : `actAsCompanyId` resetté (atterrissage sur `/admin/staff/companies`).

- [ ] **Step 3: Cleanup données de test**

```sql
DELETE FROM devices WHERE company_id IN (SELECT id FROM companies WHERE name = 'Staff Test');
DELETE FROM companies WHERE name = 'Staff Test';
```

- [ ] **Step 4: Status clean**

```bash
git status
```

Expected: branche propre, prête pour PR.

- [ ] **Step 5: Push + PR**

```bash
git push -u origin feat/staff-area
gh pr create --title "feat(staff): espace Hexa-ai cross-company" --body "$(cat <<'EOF'
## Summary
- Flag \`companies.is_hexa_internal\` + helpers \`is_hexa_staff()\` / \`is_hexa_staff_admin()\` qui dérivent le statut staff des recipients existants
- RLS étendu sur toutes les tables avec \`OR is_hexa_staff()\` en lecture, \`OR is_hexa_staff_admin()\` en écriture
- Front : \`effectiveCompanyId\` dans le store auth, bandeau \`<StaffBar>\` avec dropdown switch, espace \`/admin/staff/{companies,devices}\` + provisioning manuel

## Test plan
- [ ] Login non-staff : bandeau invisible, \`/admin/staff/*\` redirect
- [ ] Login staff viewer : lecture OK partout, écriture refusée
- [ ] Login staff admin : switch compagnie instantané, création compagnie + device OK
- [ ] Logout + relogin : actAsCompanyId resetté
EOF
)"
```

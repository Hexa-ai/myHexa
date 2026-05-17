# Signalements / Interventions Split — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Distinguer signalements (anomalies) et interventions (actions tech) dès le scan QR, et séparer leur affichage côté admin sur deux pages dédiées.

**Architecture:** Une colonne `kind` discrimine les deux types en base. Le formulaire public devient un wizard 2 étapes (choix → form variante). Côté admin, une nouvelle page `/admin/interventions` est créée ; la page Alarmes garde signalements + alarmes capteurs.

**Tech Stack:** Vue 3 + TS + Pinia · Supabase (Postgres + Edge Functions Deno) · Tailwind.

**Spec source:** `docs/superpowers/specs/2026-05-17-signalements-interventions-split-design.md`

**Important :**
- Lignes existantes `field_interventions` ont `kind='intervention'` par default (compat n8n).
- `technician_contact` reste le champ email ; un nouveau `technician_phone` est ajouté.
- Contrainte CHECK : au moins un des deux contacts non null.

---

## File Structure

**Created:**
- `supabase/migrations/20260517100000_field_interventions_kind.sql` — kind + phone + CHECK + index
- `app/src/views/admin/InterventionsView.vue` — nouvelle page admin
- `app/src/components/intervention/KindPicker.vue` — écran de choix QR

**Modified:**
- `supabase/functions/submit-intervention/index.ts` — accepte `kind`, `technicianPhone`, valide contact
- `app/src/lib/api.ts` — types `SubmitInterventionInput` étendus
- `app/src/types/supabase.ts` — types regen post-migration (ou patch manuel)
- `app/src/views/public/InterventionView.vue` — split en KindPicker + form variantes
- `app/src/views/admin/AlarmsView.vue` — filtre signalements, retire onglet intervention
- `app/src/views/admin/AdminLayout.vue` — nouvelle entrée sidebar "Interventions"
- `app/src/router/index.ts` — route `admin-interventions`

---

## Task 1: Migration DB

**Files:**
- Create: `supabase/migrations/20260517100000_field_interventions_kind.sql`

- [ ] **Step 1: Pré-check données existantes**

Via Supabase MCP `execute_sql`:

```sql
SELECT count(*) AS total,
       count(*) FILTER (WHERE technician_contact IS NOT NULL) AS with_email,
       count(*) FILTER (WHERE technician_contact IS NULL) AS without_contact
FROM field_interventions;
```

Expected: si `without_contact > 0`, ces lignes violeront la CHECK contrainte. Plan B : noter le compte et passer la CHECK contrainte en `NOT VALID` (pour ne pas re-checker l'existant), ou backfill `technician_contact = 'n/a@legacy.local'`. Sinon : OK.

- [ ] **Step 2: Écrire la migration**

```sql
-- field_interventions : split signalement / intervention
-- 1) kind : 'signalement' (anomalie remontée) | 'intervention' (action tech)
-- 2) technician_phone : optionnel, au moins l'un des deux contacts requis
-- 3) index admin pour onglets filtrés par kind+status+date

ALTER TABLE field_interventions
  ADD COLUMN kind text NOT NULL DEFAULT 'intervention'
    CHECK (kind IN ('signalement', 'intervention'));

ALTER TABLE field_interventions
  ADD COLUMN technician_phone text;

ALTER TABLE field_interventions
  ADD CONSTRAINT field_interventions_contact_present
  CHECK (
    technician_contact IS NOT NULL
    OR technician_phone IS NOT NULL
  ) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_field_interventions_kind_status_created
  ON field_interventions (kind, status, created_at DESC);

COMMENT ON COLUMN field_interventions.kind IS
  'Type de saisie : signalement (anomalie remontée par tout utilisateur) ou intervention (action tech sur site)';
COMMENT ON COLUMN field_interventions.technician_phone IS
  'Téléphone de contact ; au moins technician_contact (email) OU technician_phone doit être renseigné';
```

Note : `NOT VALID` permet d'appliquer la contrainte sans bloquer sur les lignes existantes potentiellement non conformes. Tous les nouveaux INSERT/UPDATE sont contrôlés.

- [ ] **Step 3: Appliquer via Supabase MCP**

`apply_migration` name=`field_interventions_kind`, query = SQL ci-dessus.
Expected: success.

- [ ] **Step 4: Vérifier la contrainte sur un INSERT vide**

```sql
-- Doit échouer (ni email ni phone)
INSERT INTO field_interventions (device_id, technician_name, category, severity, kind)
VALUES (
  (SELECT id FROM devices LIMIT 1),
  'TEST',
  'autre',
  'info',
  'signalement'
);
```

Expected: `check_violation` sur `field_interventions_contact_present`.

- [ ] **Step 5: Persister la migration localement + commit**

Écrire le même SQL dans `supabase/migrations/20260517100000_field_interventions_kind.sql`, puis :

```bash
git add supabase/migrations/20260517100000_field_interventions_kind.sql
git commit -m "feat(p5): field_interventions kind + technician_phone + contact CHECK"
```

---

## Task 2: Régénération types Supabase

**Files:**
- Modify: `app/src/types/supabase.ts`

- [ ] **Step 1: Régénérer via Supabase MCP**

`generate_typescript_types` puis remplacer le contenu de `app/src/types/supabase.ts`.

Si le MCP n'est pas dispo, patch manuel : ajouter dans le bloc `field_interventions.Row`, `.Insert`, `.Update` :
- `kind: 'signalement' | 'intervention'` (Row)
- `kind?: 'signalement' | 'intervention'` (Insert/Update)
- `technician_phone: string | null` (Row)
- `technician_phone?: string | null` (Insert/Update)

- [ ] **Step 2: Vérifier le build**

Run : `cd app && pnpm build`
Expected: succès.

- [ ] **Step 3: Commit**

```bash
git add app/src/types/supabase.ts
git commit -m "feat(p5): regen supabase types — field_interventions kind + phone"
```

---

## Task 3: Edge Function `submit-intervention` étendue

**Files:**
- Modify: `supabase/functions/submit-intervention/index.ts`

- [ ] **Step 1: Modifier la validation et l'INSERT**

Remplacer le bloc parsing/validation par :

```typescript
const VALID_CATEGORIES = ['intervention', 'incident', 'controle', 'autre'] as const
const VALID_SEVERITIES = ['info', 'warning', 'error'] as const
const VALID_KINDS = ['signalement', 'intervention'] as const
type Category = (typeof VALID_CATEGORIES)[number]
type Severity = (typeof VALID_SEVERITIES)[number]
type Kind = (typeof VALID_KINDS)[number]
```

Dans le `Deno.serve(async (req) => {…})`, après le parse du body, ajouter et ajuster :

```typescript
const kind = (body.kind as Kind | undefined) ?? 'intervention'
const technicianPhone = (body.technicianPhone as string | undefined)?.trim() || null
// ... (existing fields)

if (!VALID_KINDS.includes(kind)) return fail('INVALID_KIND', 'Type invalide', 400)
if (!technicianContact && !technicianPhone) {
  return fail('MISSING_CONTACT', 'Email ou téléphone requis', 400)
}
```

Puis dans l'INSERT, ajouter `kind` et `technician_phone` :

```typescript
const { data: row, error: insErr } = await supabase
  .from('field_interventions')
  .insert({
    device_id: deviceId,
    technician_name: technicianName,
    technician_contact: technicianContact,
    technician_phone: technicianPhone,
    category,
    severity,
    message,
    kind,
  })
  .select('id, created_at, device_id')
  .single()
```

- [ ] **Step 2: Déployer via Supabase MCP**

`deploy_edge_function` name=`submit-intervention`. Inclure `_shared/cors.ts` et `_shared/response.ts` comme pour `invite-recipient` (voir plan recipients pour le pattern).

- [ ] **Step 3: Smoke test**

```bash
# Signalement avec email seul
curl -X POST "$SUPABASE_URL/functions/v1/submit-intervention" \
  -H "Authorization: Bearer $ANON" \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId":"<uuid>", "technicianName":"Test",
    "technicianContact":"test@test.invalid",
    "kind":"signalement", "category":"incident", "severity":"warning",
    "message":"smoke"
  }'
# → 200 + ok:true

# Refus si ni email ni téléphone
curl -X POST … -d '{"deviceId":"…","technicianName":"X","kind":"signalement","category":"incident","severity":"info"}'
# → 400 MISSING_CONTACT
```

Cleanup : supprimer la ligne de smoke test après vérification.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/submit-intervention/
git commit -m "feat(p5): submit-intervention accepts kind + technicianPhone + contact CHECK"
```

---

## Task 4: API client typage

**Files:**
- Modify: `app/src/lib/api.ts:88-102`

- [ ] **Step 1: Étendre l'interface**

Remplacer :

```typescript
export interface SubmitInterventionInput {
  deviceId: string
  technicianName: string
  technicianContact?: string | null
  category: 'intervention' | 'incident' | 'controle' | 'autre'
  severity: 'info' | 'warning' | 'error'
  message?: string | null
  photos?: InterventionPhotoInput[]
}
```

par :

```typescript
export type InterventionKind = 'signalement' | 'intervention'

export interface SubmitInterventionInput {
  deviceId: string
  kind: InterventionKind
  technicianName: string
  technicianContact?: string | null
  technicianPhone?: string | null
  category: 'intervention' | 'incident' | 'controle' | 'autre'
  severity: 'info' | 'warning' | 'error'
  message?: string | null
  photos?: InterventionPhotoInput[]
}
```

- [ ] **Step 2: Vérifier le build**

Run : `cd app && pnpm build`
Expected: erreurs TS sur `InterventionView.vue` qui n'envoie pas encore `kind` → c'est attendu, sera corrigé en Task 5.

- [ ] **Step 3: Commit (peut être groupé avec Task 5 si pratique)**

Ne pas commit isolément si build cassé — combiner avec Task 5 ci-dessous.

---

## Task 5: Public `InterventionView` — wizard 2 étapes

**Files:**
- Create: `app/src/components/intervention/KindPicker.vue`
- Modify: `app/src/views/public/InterventionView.vue`

- [ ] **Step 1: Créer `KindPicker.vue`**

```vue
<script setup lang="ts">
import type { InterventionKind } from '@/lib/api'

defineProps<{ deviceName?: string | null }>()
const emit = defineEmits<{ select: [kind: InterventionKind] }>()
</script>

<template>
  <div class="space-y-6">
    <header class="space-y-1">
      <h1 class="text-2xl font-semibold tracking-tight">
        <span class="text-signal">⬢</span> Que voulez-vous faire ?
      </h1>
      <p v-if="deviceName" class="text-sm text-muted-foreground">
        Équipement : <span class="font-mono">{{ deviceName }}</span>
      </p>
    </header>

    <div class="grid sm:grid-cols-2 gap-3">
      <button
        class="border border-border rounded-md bg-card/40 p-5 text-left hover:border-offline/60 hover:bg-offline/5 transition group"
        @click="emit('select', 'signalement')"
      >
        <div class="flex items-center gap-2 mb-2">
          <span class="text-2xl">⚠</span>
          <span class="font-semibold tracking-tight">Signaler une anomalie</span>
        </div>
        <p class="text-sm text-muted-foreground">
          Vous avez constaté un problème sur cet équipement et souhaitez le remonter.
        </p>
      </button>

      <button
        class="border border-border rounded-md bg-card/40 p-5 text-left hover:border-signal/60 hover:bg-signal/5 transition group"
        @click="emit('select', 'intervention')"
      >
        <div class="flex items-center gap-2 mb-2">
          <span class="text-2xl">🔧</span>
          <span class="font-semibold tracking-tight">Consigner une intervention</span>
        </div>
        <p class="text-sm text-muted-foreground">
          Vous êtes intervenu sur cet équipement et souhaitez journaliser l'action.
        </p>
      </button>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Modifier `InterventionView.vue` — état + branchement**

Lire d'abord le fichier complet `app/src/views/public/InterventionView.vue` pour comprendre la structure existante (≈ 316 lignes). Adapter en gardant la même charpente, modifications principales :

a) Importer le picker et ajouter un état `kind` :

```typescript
import KindPicker from '@/components/intervention/KindPicker.vue'
import { submitIntervention, type InterventionPhotoInput, type InterventionKind } from '@/lib/api'

const kind = ref<InterventionKind | null>(null)
const phone = ref('')
```

b) Supprimer le default de `category` (`ref<'intervention' | 'incident' | …>('intervention')`) → forcer `'incident'` côté signalement, garder choix pour intervention.

c) Conditionner l'écran : si `kind === null`, afficher `<KindPicker @select="kind = $event" :device-name="deviceName" />`. Sinon afficher le form existant.

d) Dans le form : afficher la **gravité** (3 boutons radio) uniquement si `kind === 'signalement'`. Afficher la **catégorie** (dropdown actuel) uniquement si `kind === 'intervention'`.

e) Ajouter un champ `Téléphone`, à côté de l'email. Validation : `if (!email.value.trim() && !phone.value.trim()) { error.value = 'Email ou téléphone requis'; return }`.

f) Ajouter un bouton "Retour" en haut du form pour `kind = null`.

g) Lors du submit, payload :

```typescript
const res = await submitIntervention({
  deviceId: deviceId.value,
  kind: kind.value!,
  technicianName: technicianName.value.trim(),
  technicianContact: email.value.trim() || null,
  technicianPhone: phone.value.trim() || null,
  category: kind.value === 'signalement' ? 'incident' : category.value,
  severity: kind.value === 'signalement' ? severity.value : 'info',
  message: message.value.trim() || null,
  photos: photoInputs.value,
})
```

- [ ] **Step 3: Tester en local**

`cd app && pnpm dev`, ouvrir `http://localhost:5173/intervention?d=<uuid_device>` :
- Écran 1 visible avec 2 boutons.
- Clic "Signaler" → form avec champ Gravité, pas de Catégorie.
- Clic "Consigner" → form avec Catégorie, pas de Gravité.
- Submit sans email ni téléphone → message d'erreur.
- Submit avec un des deux → succès, ligne en DB avec bon `kind`.

- [ ] **Step 4: Build + commit**

```bash
cd app && pnpm build  # expected: success
git add app/src/components/intervention/ app/src/views/public/InterventionView.vue app/src/lib/api.ts
git commit -m "feat(p5): public QR — wizard signalement/intervention + email/phone contact"
```

---

## Task 6: Nouvelle route `/admin/interventions` + sidebar

**Files:**
- Create: `app/src/views/admin/InterventionsView.vue`
- Modify: `app/src/router/index.ts`
- Modify: `app/src/views/admin/AdminLayout.vue`

- [ ] **Step 1: Créer la vue (placeholder)**

```vue
<script setup lang="ts">
</script>

<template>
  <div class="p-6">
    <h1 class="text-xl font-semibold">Interventions</h1>
    <p class="text-sm text-muted-foreground">À implémenter en Task 7.</p>
  </div>
</template>
```

- [ ] **Step 2: Ajouter la route**

Dans `app/src/router/index.ts`, ajouter l'import :

```typescript
import InterventionsView from '@/views/admin/InterventionsView.vue'
```

Et la route enfant de `/admin`, avant `recipients` :

```typescript
{ path: 'interventions', name: 'admin-interventions', component: InterventionsView },
```

- [ ] **Step 3: Ajouter l'entrée sidebar dans `AdminLayout.vue`**

Ajouter dans `<script setup>` :

```typescript
const isInterventions = computed(() => route.name === 'admin-interventions')
function goInterventions() { router.push({ name: 'admin-interventions' }); closeSidebar() }
```

Et dans le `breadcrumb` map :
```typescript
'admin-interventions': 'interventions',
```

Dans le template, après le bouton "Alarmes" et avant l'entrée "Destinataires", ajouter (icône clé) :

```vue
<button
  :class="[
    'group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition text-left',
    isInterventions
      ? 'text-foreground bg-secondary'
      : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50',
  ]"
  @click="goInterventions"
>
  <span
    :class="[
      'absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r transition',
      isInterventions ? 'bg-signal' : 'bg-transparent',
    ]"
  />
  <svg viewBox="0 0 24 24" class="size-4 shrink-0" fill="none" stroke="currentColor" stroke-width="1.7">
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  </svg>
  <span class="tracking-tight">Interventions</span>
  <span v-if="isInterventions" class="ml-auto font-mono text-[9px] uppercase tracking-widest text-signal">●</span>
</button>
```

- [ ] **Step 4: Build + smoke**

`cd app && pnpm build` → succès. `pnpm dev` → sidebar montre "Interventions", clic ouvre la page placeholder.

- [ ] **Step 5: Commit**

```bash
git add app/src/views/admin/InterventionsView.vue app/src/router/index.ts app/src/views/admin/AdminLayout.vue
git commit -m "feat(p5): /admin/interventions route + sidebar entry (placeholder)"
```

---

## Task 7: `InterventionsView` complète

**Files:**
- Modify: `app/src/views/admin/InterventionsView.vue`

- [ ] **Step 1: Écrire la vue**

Réutiliser massivement la logique de `AlarmsView.vue` (loadInterventions, filteredInterventions, detail modal, lightbox), mais filtrée sur `kind='intervention'` et auto-suffisante. Squelette :

```vue
<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'

interface InterventionRow {
  id: string
  device_id: string
  created_at: string
  technician_name: string
  technician_contact: string | null
  technician_phone: string | null
  category: 'intervention' | 'incident' | 'controle' | 'autre'
  severity: 'info' | 'warning' | 'error'
  message: string | null
  status: 'open' | 'resolved'
  photo_paths: string[]
}

const auth = useAuthStore()
const router = useRouter()
const items = ref<InterventionRow[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const statusFilter = ref<'open' | 'resolved' | 'all'>('open')
const deviceNameById = ref<Map<string, string>>(new Map())

async function load() {
  if (!auth.companyId) return
  loading.value = true
  // 1. devices for name resolution
  const { data: devs } = await supabase
    .from('devices')
    .select('id, name')
    .eq('company_id', auth.companyId)
  deviceNameById.value = new Map((devs ?? []).map((d) => [d.id, d.name ?? '—']))

  // 2. interventions filtered by kind
  const { data, error: err } = await supabase
    .from('field_interventions')
    .select('*')
    .eq('kind', 'intervention')
    .in('device_id', Array.from(deviceNameById.value.keys()))
    .order('created_at', { ascending: false })
    .limit(200)
  loading.value = false
  if (err) { error.value = err.message; return }
  items.value = (data ?? []) as InterventionRow[]
}

const filtered = computed(() => {
  if (statusFilter.value === 'all') return items.value
  return items.value.filter((r) => r.status === statusFilter.value)
})

function fmt(d: string) {
  return new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}

const SEVERITY_ICON: Record<string, string> = { info: 'ℹ', warning: '⚠', error: '⛔' }

function typeClass(sev: string) {
  if (sev === 'error') return 'bg-offline-soft text-offline'
  if (sev === 'warning') return 'bg-amber/15 text-amber'
  return 'bg-secondary text-muted-foreground'
}

function openDevice(id: string) { router.push({ name: 'admin-device-detail', params: { id } }) }

async function toggleStatus(row: InterventionRow) {
  const next = row.status === 'open' ? 'resolved' : 'open'
  const { error: e } = await supabase
    .from('field_interventions')
    .update({ status: next, resolved_at: next === 'resolved' ? new Date().toISOString() : null })
    .eq('id', row.id)
  if (e) { error.value = e.message; return }
  row.status = next
}

onMounted(load)
watch(() => auth.companyId, load)
</script>

<template>
  <div class="p-6 space-y-4">
    <header class="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h1 class="text-xl font-semibold">Interventions</h1>
        <p class="text-sm text-muted-foreground">Registre des actions terrain (techniciens).</p>
      </div>
      <div class="flex gap-1.5">
        <button
          v-for="s in (['open', 'resolved', 'all'] as const)"
          :key="s"
          :class="[
            'font-mono text-[10px] uppercase tracking-[0.18em] px-3 py-1.5 rounded-md border transition',
            statusFilter === s
              ? 'border-signal/50 text-signal bg-signal-soft'
              : 'border-border text-muted-foreground hover:text-foreground',
          ]"
          @click="statusFilter = s"
        >
          {{ s === 'open' ? 'Ouvertes' : s === 'resolved' ? 'Résolues' : 'Toutes' }}
        </button>
      </div>
    </header>

    <p v-if="loading" class="text-sm text-muted-foreground">Chargement…</p>
    <p v-if="error" class="text-sm text-red-500">{{ error }}</p>

    <div class="border border-border rounded-md bg-card/40 overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-card/60 border-b border-border">
          <tr>
            <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-3 w-[140px]">Date</th>
            <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-3 w-[100px]">Sévérité</th>
            <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-3">Device</th>
            <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-3 w-[120px]">Catégorie</th>
            <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-3">Contact</th>
            <th class="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-3">Message</th>
            <th class="text-right font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-4 py-3 w-[150px]">Statut</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in filtered" :key="row.id" class="border-b border-border/50 last:border-0 hover:bg-secondary/40 transition">
            <td class="px-4 py-3 font-mono text-xs text-muted-foreground tabular whitespace-nowrap">{{ fmt(row.created_at) }}</td>
            <td class="px-4 py-3">
              <span :class="['inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded', typeClass(row.severity)]">
                <span class="text-xs leading-none">{{ SEVERITY_ICON[row.severity] }}</span>
                {{ row.severity }}
              </span>
            </td>
            <td class="px-4 py-3">
              <button class="font-medium hover:text-signal transition text-left" @click="openDevice(row.device_id)">
                {{ deviceNameById.get(row.device_id) || '—' }}
              </button>
            </td>
            <td class="px-4 py-3 font-mono text-xs text-muted-foreground">{{ row.category }}</td>
            <td class="px-4 py-3">
              <div class="font-medium">{{ row.technician_name }}</div>
              <div v-if="row.technician_contact" class="font-mono text-[11px] text-muted-foreground">{{ row.technician_contact }}</div>
              <div v-if="row.technician_phone" class="font-mono text-[11px] text-muted-foreground">{{ row.technician_phone }}</div>
            </td>
            <td class="px-4 py-3 text-muted-foreground text-xs max-w-[360px]">
              <div class="line-clamp-2">{{ row.message || '—' }}</div>
            </td>
            <td class="px-4 py-3 text-right">
              <button
                :class="[
                  'font-mono text-[10px] uppercase tracking-wider px-2.5 py-1 rounded transition',
                  row.status === 'open'
                    ? 'bg-amber/15 text-amber hover:bg-amber/25'
                    : 'bg-signal-soft text-signal hover:bg-signal/20',
                ]"
                @click="toggleStatus(row)"
              >
                {{ row.status === 'open' ? 'Marquer résolue' : '✓ Résolue' }}
              </button>
            </td>
          </tr>
          <tr v-if="!filtered.length && !loading">
            <td colspan="7" class="px-4 py-6 text-center text-muted-foreground">Aucune intervention</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Build + smoke**

`cd app && pnpm build` → succès. Vérifier sur localhost que la page liste les interventions, filtre fonctionne, click sur device redirige.

- [ ] **Step 3: Commit**

```bash
git add app/src/views/admin/InterventionsView.vue
git commit -m "feat(p5): InterventionsView — list/filter/toggle status"
```

---

## Task 8: `AlarmsView` — filtrer signalements + retirer onglet intervention

**Files:**
- Modify: `app/src/views/admin/AlarmsView.vue`

- [ ] **Step 1: Renommer l'onglet `interventions` en `signalements` et adapter les filtres**

a) Dans `<script setup>`, remplacer :
```typescript
const mode = ref<'live' | 'history' | 'interventions'>('live')
```
par :
```typescript
const mode = ref<'live' | 'history' | 'signalements'>('live')
```

b) La fonction `loadInterventions()` doit ajouter `.eq('kind', 'signalement')` :

```typescript
async function loadInterventions() {
  // ...
  const { data, error } = await supabase
    .from('field_interventions')
    .select('...')
    .eq('kind', 'signalement')
    .in('device_id', deviceIds)
    // ...
}
```

c) Renommer les variables internes pour clarté (optionnel, mais recommandé) :
- `interventions` → `signalements`
- `filteredInterventions` → `filteredSignalements`
- `kpiInterventions` → `kpiSignalements`
- `loadInterventions` → `loadSignalements`

Si le renommage est trop intrusif, garder les noms et juste filtrer par `kind`.

d) Dans le fil de l'eau (mode='live'), inclure les signalements ouverts (déjà fait par la fusion actuelle, mais maintenant filtrés par kind). La construction du `mergedLive` reste valide ; les badges "Interv." dans le fil deviennent "Signalement".

- [ ] **Step 2: Adapter les libellés UI**

Dans le template :
- Bouton onglet : "Interventions · {{ kpiInterventions }}" → "Signalements · {{ kpiSignalements }}"
- Texte vide : "Aucune intervention terrain..." → "Aucune signalement..." (corriger l'accord)
- Comments HTML "Interventions" → "Signalements"
- Badge "Interv." dans le fil de l'eau → "Signalement"
- Table de l'onglet : remplacer colonne "Catégorie" par "Gravité" (déjà visible mais doublonnée — vérifier qu'on n'a pas Catégorie+Sévérité ; si oui, retirer Catégorie qui n'a plus de sens pour un signalement)

- [ ] **Step 3: Tester**

- Onglet Signalements ne liste que les `kind='signalement'`.
- Onglet Interventions disparaît côté AlarmsView (l'utilisateur va sur `/admin/interventions`).
- Le badge sidebar "Alarmes" continue de compter `actives + signalements ouverts + interventions ouvertes` — vérifier `useAlarmCounts` (probablement à étendre, voir Task 9).

- [ ] **Step 4: Commit**

```bash
git add app/src/views/admin/AlarmsView.vue
git commit -m "feat(p5): AlarmsView — onglet Signalements (kind=signalement), retire onglet interventions"
```

---

## Task 9: Badge sidebar `useAlarmCounts`

**Files:**
- Modify: `app/src/composables/useAlarmCounts.ts`

- [ ] **Step 1: Lire la version actuelle**

`cat app/src/composables/useAlarmCounts.ts`. Identifier la requête qui compte les "open interventions".

- [ ] **Step 2: Adapter la requête**

Si la fonction fait actuellement `count from field_interventions where status='open'`, garder ce comportement (qui inclura signalements + interventions ouvertes, c'est OK pour le badge global).

Optionnel : exposer deux compteurs distincts (`openSignalements` et `openInterventions`) si on veut afficher la décomposition dans le tooltip de la sidebar. Sinon `useAlarmCounts.open` reste la somme des deux.

Si aucune modification n'est nécessaire (la fonction lit `status='open'` sans filtrer par `kind`), passer cette task et juste vérifier le comportement.

- [ ] **Step 3: Mettre à jour le tooltip du badge sidebar dans `AdminLayout.vue`**

Remplacer `${alarms.active.value} alarmes capteur · ${alarms.open.value} interventions ouvertes` par `${alarms.active.value} alarmes · ${alarms.open.value} ouvertes (signalements + interventions)`.

- [ ] **Step 4: Commit (si modif)**

```bash
git add app/src/composables/useAlarmCounts.ts app/src/views/admin/AdminLayout.vue
git commit -m "feat(p5): badge sidebar — clarify alarmes + signalements + interventions"
```

---

## Task 10: Vérification finale

- [ ] **Step 1: Build complet + tests**

```bash
cd app && pnpm build && pnpm test:unit
```
Expected: build success, tests 8/8 passent.

- [ ] **Step 2: Smoke test E2E manuel**

1. Scanner / ouvrir `/intervention?d=<uuid>` → écran de choix.
2. Signaler une anomalie → form avec gravité (pas de catégorie), email + téléphone (au moins un).
3. Submit avec email seul → succès.
4. Submit avec téléphone seul → succès.
5. Submit sans rien → erreur "Email ou téléphone requis".
6. Consigner une intervention → form avec catégorie (pas de gravité visible).
7. Submit OK.
8. Admin : `/admin` → Alarmes → onglet Signalements liste l'anomalie.
9. Admin : `/admin/interventions` liste l'intervention.
10. Onglet Fil de l'eau dans Alarmes → les deux apparaissent avec source "Alarme" / "Signalement".

- [ ] **Step 3: Vérifier que les workflows n8n ne sont pas cassés**

Lister les workflows qui écrivent dans `field_interventions` (search via n8n MCP) — si certains existent, vérifier qu'ils n'envoient pas plus de paramètres que ce que la table accepte (le default `kind='intervention'` les couvre).

- [ ] **Step 4: Commit final si patches**

```bash
git status   # doit être clean si tout est OK
```

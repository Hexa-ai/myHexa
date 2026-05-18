# Espace Staff Hexa-ai — Design

**Goal :** offrir aux membres d'Hexa-ai un espace `/staff` cross-company pour gérer compagnies, devices, et "agir comme" n'importe quelle compagnie cliente, sans système de rôles parallèle.

**Principe directeur :** le statut staff est **dérivé** d'un fait existant — un user dont le recipient pointe vers la compagnie Hexa-ai (flag `is_hexa_internal=true`) devient staff. Aucune table user-side supplémentaire. Le `role` existant (`admin`/`viewer`) sur le recipient gradue les droits cross-company.

---

## Modèle de données

### Migration `companies.is_hexa_internal`

```sql
ALTER TABLE public.companies
  ADD COLUMN is_hexa_internal boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_companies_is_hexa_internal
  ON public.companies (is_hexa_internal) WHERE is_hexa_internal;

UPDATE public.companies
  SET is_hexa_internal = true
  WHERE id = '08a472a4-04de-498e-8f88-3aab12925134'; -- Hexa-ai

COMMENT ON COLUMN public.companies.is_hexa_internal IS
  'true pour la compagnie Hexa-ai (interne). Les recipients de cette compagnie sont staff (accès cross-company).';
```

### Helpers SQL

```sql
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
```

---

## RLS

Pattern appliqué à toutes les tables avec `company_id` : `companies`, `devices`, `recipients`, `reports`, `field_interventions`, `connectivity_alerts`, et toute autre identifiée par l'audit `pg_policies` avant migration.

**Lecture (USING) :**
```sql
(company_id = current_company_id() OR public.is_hexa_staff())
```

**Écriture (WITH CHECK) :**
```sql
(
  (company_id = current_company_id() AND current_role() = 'admin')
  OR public.is_hexa_staff_admin()
)
```

Conséquences :
- Staff `viewer` : SELECT global, aucun INSERT/UPDATE/DELETE (même pas dans Hexa-ai au-delà de ses droits client habituels).
- Staff `admin` : SELECT + INSERT/UPDATE/DELETE cross-company.
- Users non-staff : comportement strictement inchangé.

La migration RLS commence par un `SELECT tablename, policyname FROM pg_policies WHERE schemaname='public'` capturé en commentaire, puis applique les patches, puis re-capture pour audit.

---

## Front — store auth & "act as"

### Store `useAuthStore` étendu

```ts
// Dérivé du recipient existant
isHexaStaff: ComputedRef<boolean>      // recipient.company.is_hexa_internal === true
isHexaStaffAdmin: ComputedRef<boolean> // isHexaStaff && role === 'admin'

// Sélection cross-company, sessionStorage (perdue à la fermeture d'onglet)
actAsCompanyId: Ref<string | null>
setActAsCompany(id: string | null): void

// Remplace l'usage existant de companyId dans toutes les vues admin
effectiveCompanyId: ComputedRef<string | null>
  // = actAsCompanyId si défini et user staff
  // sinon recipient.company_id
```

Toutes les vues admin (`DevicesView`, `AlarmsView`, `InterventionsView`, `RecipientsView`, `FleetMapView`) lisent désormais `effectiveCompanyId` au lieu de `companyId`. Les `watch(() => auth.companyId, …)` deviennent `watch(() => auth.effectiveCompanyId, …)`.

### Composable `useStaffCompanies`

```ts
export function useStaffCompanies() {
  // Cache 60s. Fetch toutes les compagnies (staff = SELECT global via RLS).
  // Exposé : companies, loading, error, refresh.
  // Inclut un champ dérivé devicesCount via jointure côté query (optionnel MVP).
}
```

### Routing

```ts
// Nouveau guard
function requireStaff(to, from, next) {
  const auth = useAuthStore()
  if (!auth.isHexaStaff) return next({ name: 'admin-devices' })
  next()
}

// Routes nouvelles, enfants de /admin (même AdminLayout)
{ path: 'staff/companies',         name: 'staff-companies',        component: StaffCompaniesView, beforeEnter: requireStaff },
{ path: 'staff/companies/:id',     name: 'staff-company-detail',   component: StaffCompanyDetailView, beforeEnter: requireStaff },
{ path: 'staff/devices',           name: 'staff-devices',          component: StaffDevicesView,    beforeEnter: requireStaff },
{ path: 'staff/devices/new',       name: 'staff-device-new',       component: StaffDeviceNewView,  beforeEnter: requireStaff },

// Redirect post-login : si isHexaStaff → /admin/staff/companies, sinon /admin/devices
```

### `<StaffBar>` (bandeau staff)

Composant monté **au-dessus du header** dans `AdminLayout`, conditionné par `auth.isHexaStaff` :

```
┌──────────────────────────────────────────────────────────────────────┐
│ STAFF · agit comme : [CTP ▾]  · admin                ↩ retour staff  │
└──────────────────────────────────────────────────────────────────────┘
│ ⬢ / admin / devices                                  ● 3 à traiter   │ ← header existant
└──────────────────────────────────────────────────────────────────────┘
```

- Dropdown searchable des compagnies (par nom).
- Badge `viewer` ou `admin` à droite (rappel du droit d'agir).
- "↩ retour staff" → `setActAsCompany(null)` + `router.push({ name: 'staff-companies' })`.
- Couleur de bandeau : `bg-signal/10 border-b border-signal/40 text-signal` (bleu).
- Quand `actAsCompanyId === null`, le dropdown affiche un placeholder "Choisir une compagnie…" et les vues `/admin/*` affichent un état "Sélectionnez une compagnie".

---

## Pages /staff

Toutes utilisent l'`AdminLayout` existant et la sidebar standard, avec une entrée "Staff" supplémentaire visible si `isHexaStaff` (placée tout en bas, séparée par un divider).

### `/admin/staff/companies` — liste

Tableau : `nom · nb devices · nb recipients · créée le · badge "interne" si is_hexa_internal`. Bouton "+ nouvelle compagnie" (staff admin only). Click ligne → détail.

### `/admin/staff/companies/:id` — détail

Trois sections :
- **Info** : nom (éditable inline, staff admin), `is_hexa_internal` (read-only, juste affiché).
- **Devices** : liste compacte (réutilise `DevicesTable` en mode embed), bouton "+ provisionner ici".
- **Recipients** : liste, bouton "+ inviter" (réutilise `RecipientFormDrawer` avec `company_id` pré-rempli).

### `/admin/staff/devices` — vue globale

Réutilise `DevicesTable` + ajoute une colonne "Compagnie" (lien vers `/admin/staff/companies/:id`). Filtres par compagnie + status. Bouton "+ provisionner".

### `/admin/staff/devices/new` — provisioning

Form : `MAC, nom, compagnie cible (dropdown), localisation (optionnel)`. Appelle l'edge function `provision` existante avec un nouveau paramètre `targetCompanyId`. Si l'edge function reçoit `targetCompanyId` ET l'auth user est staff admin, elle bypass le MAC-based one-shot.

### Permissions UI

- Staff viewer : tous les boutons d'action désactivés, tooltip "Lecture seule (staff viewer)".
- Staff admin : full access.
- Drawer/dialog d'édition affiche un footer "agissant en tant que staff Hexa-ai".

---

## Edge cases

- **Staff sans recipient Hexa-ai** : impossible — le statut staff est dérivé du recipient.
- **User staff + recipient dans une autre compagnie** : interdit par contrainte existante (1 recipient par auth_user_id).
- **`actAsCompanyId` pointe sur une compagnie supprimée** : guard côté `effectiveCompanyId` → si la company n'est plus dans `useStaffCompanies`, reset et redirect `/admin/staff/companies`.
- **Staff désactivé en cours de session** (recipient supprimé / company `is_hexa_internal` repassé à false) : la prochaine query RLS échoue → toast "Session expirée" + logout.
- **Onglet Hexa-ai = compagnie cliente vide** : si pas d'`actAsCompanyId`, les vues `/admin/*` affichent "Sélectionnez une compagnie dans le bandeau staff".
- **Provisioning device existant** : rejeté avec erreur claire — la réassignation cross-company est hors MVP.

---

## Test plan

### Unit / DB

- Helpers SQL via seed + `SELECT`. Cas testés :
  - User non-recipient → `is_hexa_staff() = false`.
  - User recipient d'une compagnie cliente → `false`.
  - User recipient Hexa-ai viewer → `is_hexa_staff() = true`, `is_hexa_staff_admin() = false`.
  - User recipient Hexa-ai admin → les deux à `true`.

### Front

- `useAuthStore.effectiveCompanyId` : sans staff, retourne `companyId` ; avec staff + `actAsCompanyId`, retourne celle-ci.
- `useStaffCompanies` : cache 60s, refresh manuel.
- Guard `requireStaff` : redirige les non-staff.

### E2E manuel (obligatoire avant merge)

1. **Login non-staff** → bandeau invisible, `/admin/staff/*` redirect.
2. **Login staff viewer** → bandeau visible, dropdown listant toutes les compagnies, lecture cross-company OK, boutons d'écriture désactivés.
3. **Login staff admin** → bandeau, switch CTP → DevicesView devient celle de CTP, switch BBR Energie → switch instantané.
4. **Création compagnie + provisioning device** → device apparaît dans `/admin/staff/devices` + dans `/admin/devices` quand on "act as" la nouvelle compagnie.
5. **Logout + relogin** → `actAsCompanyId` resetté (sessionStorage perdu).

---

## YAGNI explicite (hors MVP)

- Suppression de compagnie (faisable en SQL si vraiment nécessaire).
- Réassignation d'un device d'une compagnie à une autre.
- Audit log des actions staff.
- Impersonation login avec fake JWT (rester en `actAsCompanyId` côté store).
- Liste/édition globale de tous les recipients dans `/admin/staff/recipients` (un cran sous le détail compagnie, suffisant pour le MVP).

---

## Phasage commits (1 PR, atomic)

1. Migration `is_hexa_internal` + helpers SQL.
2. RLS patch toutes tables avec récap `pg_policies` avant/après.
3. Types Supabase regen + store auth `effectiveCompanyId`.
4. Composable `useStaffCompanies`, guard `requireStaff`, routing.
5. `<StaffBar>` + sidebar entry + branchement vues existantes sur `effectiveCompanyId`.
6. `/admin/staff/companies` (liste + détail + CRUD).
7. `/admin/staff/devices` (liste + provisioning).
8. Smoke E2E + correctifs.

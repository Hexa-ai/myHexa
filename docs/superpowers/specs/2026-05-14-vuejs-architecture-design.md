# Architecture Vue.js — Migration myHexa (front)

**Date :** 2026-05-14
**Statut :** Design validé, en attente de relecture
**Contexte :** Migration de l'UI myHexa de n8n (workflows servant des pages HTML) vers une SPA Vue.js + Supabase. L'ingestion et les notifications restent dans n8n pour le moment.

## 1. Objectifs et contraintes

### Objectifs
- Remplacer les vues HTML servies par n8n (`Report View`, `Token Recovery`, `Supervision`, `Recipients Admin`, `Location Update`, etc.) par une application Vue.js moderne.
- Mettre en place une **vraie authentification** pour les utilisateurs rattachés à une entreprise cliente, tout en gardant les liens email signés pour l'accès ponctuel aux rapports.
- Garantir l'isolation multi-tenant des données via Row Level Security Supabase.

### Contraintes
- **Ne pas casser la prod n8n** : chaque workflow n8n actif reste en place tant que son équivalent Vue.js n'est pas validé en production. Double-run obligatoire.
- L'Edge Function `ingestion` Supabase existe déjà mais le firmware ne basculera que sur décision explicite.
- Les URLs actuelles dans les emails pointent vers l'instance Hostinger n8n — le cutover de domaine se fera en fin de migration.

## 2. Périmètre du MVP

L'app Vue.js gère simultanément :
- **Routes publiques** (accès via lien signé reçu par email) : visualisation de rapports, récupération de lien expiré, mise à jour de localisation device.
- **Routes admin authentifiées** : supervision, gestion des destinataires, gestion des devices.

Workflows n8n concernés : `Report View`, `Report Periodic View`, `Supervision`, `Recipients Admin`, `Token Recovery`, `Location Update`, `Shared Components`.

## 3. Stack technique

| Couche | Choix |
|---|---|
| Framework | Vue 3 (`<script setup>`) + TypeScript |
| Build | Vite |
| Routing | Vue Router (history mode) |
| State | Pinia |
| UI | Tailwind CSS + shadcn-vue |
| Backend | `@supabase/supabase-js` (clé anon côté client) |
| Hébergement | Netlify (build statique, SPA pure) |
| CI | GitHub Actions |
| Tests | Vitest (unit/component) + Playwright (E2E ciblés) |

Pas de SSR/Nuxt : le SEO ne concerne pas l'app (pages privées ou via token signé). SPA pure → CDN Netlify suffit.

## 4. Architecture d'ensemble

```
┌─────────────────────────────────────────────────────────────┐
│  App Vue.js (Netlify, sous-domaine dédié à définir)         │
│  ┌─────────────────────────┐  ┌──────────────────────────┐  │
│  │ Routes publiques        │  │ Routes admin (auth)      │  │
│  │ /r/:token  (rapport)    │  │ /admin/supervision       │  │
│  │ /recover   (form)       │  │ /admin/recipients        │  │
│  │ /location/:token        │  │ /admin/devices           │  │
│  │                         │  │ /login, /logout          │  │
│  │ → fetch() Edge Functions│  │ → supabase-js + RLS      │  │
│  └─────────────────────────┘  └──────────────────────────┘  │
└───────────────┬──────────────────────────┬──────────────────┘
                │                          │
                ▼                          ▼
   ┌────────────────────────┐   ┌──────────────────────────┐
   │ Supabase Edge Functions│   │ Supabase Postgres + Auth │
   │ - view-report          │◄──┤ - tables existantes      │
   │ - recover-link         │   │ - RLS par company_id     │
   │ - location-update      │   │ - auth.users ↔ recipients│
   │ (service_role)         │   │                          │
   └────────────────────────┘   └──────────────────────────┘
                                            ▲
                                            │ writes only
                           ┌────────────────┴─────────────┐
                           │ n8n (Hostinger) — INCHANGÉ   │
                           │ Ingestion, Notifications,    │
                           │ Connectivity Alerts...       │
                           └──────────────────────────────┘
```

**Trois plans cohabitent :**
1. n8n reste **écrivain** des données (ingestion, alertes) — la prod ne bouge pas.
2. Supabase Postgres = **source de vérité** unique.
3. Vue.js = **lecteur** (admin via RLS, public via Edge Functions).

**Approche retenue pour le mix public/auth (Approche 1) :** les pages publiques ne parlent jamais directement à Supabase. Elles appellent une Edge Function qui valide le token, requête la base avec la clé `service_role`, et renvoie un JSON propre. Les pages admin utilisent le SDK Supabase avec la clé anon + session utilisateur ; RLS filtre les rows.

Cette séparation garde la `service_role` hors du navigateur, simplifie le code Vue (un `fetch()` pour le public, le SDK pour le privé), et reflète la séparation logique déjà en place avec n8n.

## 5. Structure de code

L'app vit dans un sous-dossier `app/` du repo actuel (mono-repo léger avec `supabase/` et `docs/`).

```
app/
├── index.html
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── netlify.toml
├── .env.example
├── src/
│   ├── main.ts
│   ├── App.vue
│   ├── router/
│   │   ├── index.ts              ← routes + meta.requiresAuth
│   │   └── guards.ts             ← redirect /login si besoin
│   ├── lib/
│   │   ├── supabase.ts           ← createClient(anon)
│   │   └── api.ts                ← wrapper fetch() pour Edge Functions
│   ├── stores/
│   │   ├── auth.ts               ← session Supabase + currentRecipient
│   │   └── company.ts            ← company courante
│   ├── components/
│   │   ├── ui/                   ← shadcn-vue
│   │   └── domain/               ← composants métier
│   ├── views/
│   │   ├── public/
│   │   │   ├── ReportView.vue
│   │   │   ├── RecoverView.vue
│   │   │   └── LocationView.vue
│   │   ├── auth/
│   │   │   └── LoginView.vue
│   │   └── admin/
│   │       ├── AdminLayout.vue
│   │       ├── SupervisionView.vue
│   │       ├── RecipientsView.vue
│   │       └── DevicesView.vue
│   ├── composables/
│   │   ├── useReport.ts
│   │   ├── useDevices.ts
│   │   └── useRecipients.ts
│   └── types/
│       └── supabase.ts           ← généré par `supabase gen types`
├── tests/
│   ├── unit/
│   └── e2e/
└── package.json
```

**Conventions :**
- Séparation physique `public/` / `auth/` / `admin/` dans `views/`.
- Logique métier dans `composables/`, jamais dans les composants.
- Types Supabase générés via CLI, jamais écrits à la main.
- shadcn-vue installé via CLI dans `components/ui/`, éditable.
- Pas de dossier `utils/` fourre-tout — `lib/` (technique) ou `composables/` (métier).

## 6. Auth & multi-tenant

### Modèle d'identité

`recipients` évolue pour accueillir l'auth :

```sql
ALTER TABLE recipients
  ADD COLUMN auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN role text NOT NULL DEFAULT 'external'
    CHECK (role IN ('member', 'external'));

-- Un member a forcément un auth_user_id lié
ALTER TABLE recipients
  ADD CONSTRAINT recipients_member_has_auth
  CHECK (role = 'external' OR auth_user_id IS NOT NULL);
```

### Création d'un membre

1. Un admin crée le destinataire avec `role = 'member'` via `/admin/recipients`.
2. Edge Function `invite-recipient` → `supabase.auth.admin.inviteUserByEmail()` envoie un email d'invitation.
3. Au premier login, un trigger DB lie `auth.users.id` à `recipients.auth_user_id` par matching email.

### Deux flux d'auth

**Flux 1 — Lien signé (public, sans session)**
- URL `/r/:token` reçue par email.
- `ReportView.vue` fait `fetch('/edge/view-report?token=...')`.
- Edge Function valide signature + expiration, renvoie JSON.
- Aucune session Supabase créée côté navigateur.
- Concerne **tous** les destinataires (members + externes).

**Flux 2 — Login membre (auth Supabase classique)**
- `LoginView.vue` propose **email + password** (Supabase Auth natif, reset password inclus).
- Après login, `authStore` charge le `recipient` joint sur `auth.users.id` → `company_id` connue.
- Router guard sur `meta.requiresAuth` redirige vers `/login?redirect=...` si absent.
- Concerne **uniquement** les membres rattachés à une company.
- Magic link Supabase (vrai magic link de session) pourra être ajouté plus tard via toggle.

### Row Level Security

Politique générique sur chaque table avec `company_id` :

```sql
CREATE POLICY "tenant_isolation_select" ON <table>
  FOR SELECT USING (
    company_id = (
      SELECT company_id FROM recipients
      WHERE auth_user_id = auth.uid()
      LIMIT 1
    )
  );
```

Idem `INSERT/UPDATE/DELETE` avec `WITH CHECK` pour les écritures admin.

**Les Edge Functions publiques bypassent RLS** via `service_role` — c'est voulu, le contrôle d'accès est fait par validation du token.

### Rôles admin granulaires

Hors MVP. Tous les members ont les mêmes droits sur leur company. Ajout futur via colonne `permissions` si besoin.

### Stockage des tokens publics (audit n8n existant — 2026-05-15)

Les workflows n8n actifs (Report View `K6gY6Zcxy29OOJ1v`, Token Recovery `HCXdZ8tnbQ2bDH09`, Location Update `u85ZmX7GSWSUW15u`) utilisent une table **`report_tokens` déjà en place** (pas de signature : lookup DB).

```
report_tokens(token TEXT PK, recipient_id UUID, device_ids TEXT, expires_at TIMESTAMPTZ, created_at TIMESTAMPTZ)
```

Contrats existants à reproduire côté Edge Functions :
- **`GET /report/view?t=<token>&d=<deviceId>`** : valide token (existe + non expiré) + autorisation `deviceId` via `recipients.allowed_device_ids` ou `company_id`, renvoie HTML détail (3 onglets : Données / État / Configuration). Erreur → 410 + form de récupération.
- **`POST /recover-link`** (`email`, `from_url`) : lookup recipient par email, génère un nouveau token, persiste, envoie email avec lien.
- **`POST /location/update`** (`token`, `deviceId`, `address`) : valide token + role admin, géocode (Nominatim/Photon ?), update `devices.latitude/longitude/address`, redirige vers `/report/view?...&saved=1`.

Décision P3 : pas de migration `report_links`, on garde `report_tokens`. Les Edge Functions feront le lookup DB comme les workflows n8n. Migration vers tokens signés (JWT) reportée post-MVP.

## 7. Data flow

### Page publique (lien signé)

```
User clique lien email
        │
        ▼
GET /r/:token (Vue Router → ReportView.vue)
        │
        ▼
onMounted() → api.viewReport(token)
        │
        ▼
fetch(`${EDGE_URL}/view-report?token=...`)
        │
        ├─ 200 → render rapport
        ├─ 401 → router.push('/recover?reason=expired&token=...')
        ├─ 404 → page "Lien invalide"
        └─ 5xx → toast "Service indisponible"
```

Cohérent avec le flow existant `Token Recovery` (workflow n8n `HCXdZ8tnbQ2bDH09`).

### Page admin (auth)

```
User → /admin/devices
        │
        ▼
Router guard → authStore.session ?
        ├─ NON → /login?redirect=/admin/devices
        └─ OUI → DevicesView.vue
                    │
                    ▼
            useDevices() composable
                    │
                    ▼
            supabase.from('devices').select()  ← RLS filtre
                    │
                    ├─ data → store Pinia → render
                    └─ error → toast + log
```

### Contrat Edge Function

Toutes les Edge Functions retournent un JSON uniforme :

```ts
{
  ok: boolean
  data?: T
  error?: {
    code: string      // ex: 'TOKEN_EXPIRED', 'TOKEN_NOT_FOUND'
    message: string   // français, lisible humain
  }
}
```

Le frontend mappe `error.code` → action (redirect, toast).

## 8. Gestion d'erreurs

| Catégorie | Comportement |
|---|---|
| Réseau / 5xx | Toast "Connexion impossible", bouton retry |
| Auth expirée (401) | Public → `/recover`. Admin → logout + `/login` |
| Permission (403) | Page "Accès refusé" (ne devrait pas arriver) |
| Validation (400) | Inline dans formulaire (shadcn `<Form>`) |

Composant transversal `<ErrorBoundary>` pour catcher les erreurs non gérées et afficher un fallback + bouton "recharger".

**Loading states :** skeletons shadcn pour les listes, boutons disabled + spinner pendant mutations. Pas d'optimistic updates au MVP.

## 9. Testing

| Niveau | Outil | Périmètre |
|---|---|---|
| Unit | Vitest | Composables + `lib/api.ts` mocké |
| Composant | Vitest + `@vue/test-utils` | LoginView, formulaires |
| E2E | Playwright | 4 parcours critiques (voir ci-dessous) |

### Parcours E2E (MVP)

1. Lien signé valide → rapport affiché.
2. Lien signé expiré → redirection `/recover` → soumission → email envoyé.
3. Login membre → `/admin/devices` → liste filtrée par company.
4. Login membre → tentative d'accès device d'une autre company → 403 / liste vide (test RLS).

### CI

GitHub Actions sur PR vers `main` :
- `pnpm install`
- `pnpm typecheck` (`vue-tsc --noEmit`)
- `pnpm lint`
- `pnpm test:unit`
- Playwright sur preview Netlify uniquement (manuel ou sur tag)

Netlify déploie auto sur push `main`.

### Tests manuels avant cutover (checklist)

- Ouverture d'un lien signé réel envoyé par n8n vers la nouvelle URL Vue.
- Login d'un membre test → vérification isolation multi-tenant.
- Validation UX/look par l'utilisateur.

## 10. Plan de cutover

Suivant la règle "ne pas casser la prod" :

1. App Vue déployée sur sous-domaine dédié (ex : `app.myhexa.fr`, nom à définir).
2. Pour chaque workflow n8n :
   - construire l'équivalent Vue en parallèle ;
   - tester en double-écriture / shadow ;
   - basculer côté client (changer l'URL dans le node email n8n) **sur décision explicite** ;
   - garder le workflow n8n actif quelques jours en filet de sécurité ;
   - archiver/désactiver ensuite.
3. Édition du domaine principal (passage du domaine Hostinger vers Netlify) **en toute fin de migration**, une fois tous les workflows portés.

## 11. Hors périmètre (à traiter plus tard)

- Migration de l'ingestion (Edge Function existe, firmware basculera plus tard).
- Migration des workflows de notification (Connectivity Alerts, Report Periodic View en mode envoi).
- Rôles admin granulaires (permissions par utilisateur dans une company).
- Optimistic updates / cache offline.
- i18n (FR seulement au MVP).
- App mobile.

## 12. Décisions explicites et raisons

| Décision | Raison |
|---|---|
| SPA pure (pas de Nuxt) | Pages privées, SEO inutile, build statique + CDN Netlify suffit |
| Edge Functions pour le public | Service role hors du navigateur, logique métier centralisée serveur |
| Email + password pour les membres | Demande explicite utilisateur ("auth plus classique") |
| Mono-repo (app/ dans Dev-myHexa) | Migrations Supabase + docs + app au même endroit |
| shadcn-vue | Maîtrise totale du look, components copiés et éditables |
| Netlify | Choix utilisateur, intégration git/CDN simple |
| Pas de TDD intégral | YAGNI ; 4 E2E ciblés + unit sur composables suffisent au MVP |

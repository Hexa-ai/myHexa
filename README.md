# myHexa

> Plateforme web de supervision multi-tenant pour la flotte de boîtiers **Hexa.ai Edge** : monitoring temps réel, rapports périodiques, alarmes, interventions terrain via QR code.

[![Stack](https://img.shields.io/badge/Vue-3-42b883?logo=vue.js&logoColor=white)](#stack) [![Stack](https://img.shields.io/badge/Vite-8-646cff?logo=vite&logoColor=white)](#stack) [![Stack](https://img.shields.io/badge/Tailwind-4-38bdf8?logo=tailwindcss&logoColor=white)](#stack) [![Stack](https://img.shields.io/badge/Supabase-PostgREST-3ecf8e?logo=supabase&logoColor=white)](#stack) [![Stack](https://img.shields.io/badge/Edge%20Functions-Deno-000000?logo=deno&logoColor=white)](#stack)

---

## 1. Vision

myHexa remplace progressivement les workflows n8n qui rendaient la supervision Hexa.ai en HTML server-side. La nouvelle version est une SPA Vue 3 hostée sur Netlify + un backend Supabase (Postgres + RLS + Edge Functions Deno) :

| Persona | Entrée | Surface |
|---|---|---|
| **Membre authentifié** (admin/viewer) | `/login` (email + password) | `/admin/*` — flotte, carte, détail device, rapports, alarmes |
| **Destinataire externe** | Lien token reçu par email | `/report?t=&d=` — vue lecture par token |
| **Technicien terrain** | QR code physique sur le boîtier | `/intervention?d=` — formulaire d'intervention anonyme |

Les workflows n8n existants restent **actifs** côté serveur (`srv1375596.hstgr.cloud`) pour ne rien casser pendant la migration. La phase actuelle est un **double-run** : les Edge Functions répliquent les contrats n8n, les rapports périodiques sont consommés directement depuis la même base Supabase.

## 2. Stack

```
┌─────────────────────────────────────────────────────────────────┐
│  Frontend (Netlify)                                             │
│   Vue 3 + TypeScript + Vite 8                                   │
│   Tailwind CSS 4 + shadcn-vue (Card / Button / Input)           │
│   Pinia (auth) + Vue Router 4                                   │
│   Leaflet (mini-map + flotte) · Chart.js (rapports périodiques) │
│   qrcode (QR intervention)                                      │
└────────────────────────────────────────────┬────────────────────┘
                                             │ HTTPS
┌────────────────────────────────────────────▼────────────────────┐
│  Supabase                                                       │
│   Postgres + RLS (multi-tenant via recipients.company_id)       │
│   Auth (email + password)                                       │
│   Edge Functions Deno (5 routes publiques)                      │
│   Storage (bucket `intervention-photos` privé)                  │
└─────────────────────────────────────────────────────────────────┘
```

## 3. Fonctionnalités

### 3.1 Admin authentifié `/admin/*`

| Route | Description |
|---|---|
| `/admin/devices` | Liste de la flotte : statut online/offline, alarmes, interfaces réseau actives (ETH0/ETH1/WIFI/4G/VPN), bouton Web (Tailscale), bouton VNC, lien rapports, QR intervention |
| `/admin/devices/:id` | Fiche détail : header device, mini-carte Leaflet, tabs Données / État / Configuration, détails par interface réseau (IP/Masque/Passerelle/DNS/Mode/SSID/Signal/Techno/Opérateur), services, formulaire de localisation + VNC + QR |
| `/admin/devices/:id/periodic` | Rapports quotidiens & hebdomadaires avec Chart.js (zoom/pan synchronisé entre tous les charts + plein écran + curseurs synchronisés) |
| `/admin/map` | Carte flotte tous les devices géolocalisés, full-width, markers cliquables |
| `/admin/alarms` | Centre d'alarmes : 3 modes (Fil de l'eau / Historique / Interventions) + filtres device + sévérité, modal détail intervention avec galerie photo et lightbox |

**Refresh automatique** toutes les 2 min sur les pages de monitoring, polling 30s sur le badge global d'alarmes (sidebar + header). Animation pulsante rouge tant qu'il y a au moins une alarme active ou intervention ouverte.

### 3.2 Routes publiques (token)

| Route | Description |
|---|---|
| `/report?t=&d=` | Vue d'un device par token (lien email n8n) — pas de session, lookup `report_tokens` |
| `/report/periodic?t=&d=&type=daily\|weekly[&period=]` | Rapport quotidien/hebdomadaire d'un device par token |
| `/recover?reason=&from=` | Formulaire de récupération de lien (génère + envoie un nouveau token par email) |
| `/intervention?d=` | Formulaire d'intervention terrain ouvert via QR code physique. Upload jusqu'à 5 photos compressées localement (max 1600px / JPEG 0.85) |

### 3.3 Thèmes & responsive

- 🌗 **Light / Dark** : palette teal `#00d4aa` sur navy `#0a0f14` (dark) ou off-white `#f6faf8` (light), inspirée du site hexa-ai.fr. Toggle dans le header, persisté dans `localStorage`, anti-FOUC inline dans `index.html`
- 📱 **Mobile** : sidebar admin transformée en drawer (hamburger), tables réduites en cards verticales sous `md`, KPI strips qui empilent
- 🖥️ **Grand écran** : carte flotte full-width sans cap

### 3.4 Notifications visuelles

- Badge rouge sur l'entrée "Alarmes" de la sidebar avec compteur total (alarmes capteur + interventions ouvertes)
- Bouton "à traiter · N" dans le header (lien direct vers `/admin/alarms`)
- Animation `alarm-flash` (ring shadow pulsant) permanente tant que `total > 0`
- Polling RPC `alarm_counts()` toutes les 30 s, rafraîchissement immédiat au retour d'onglet

### 3.5 QR intervention terrain

- Génération du QR côté admin (composant `QRCodeBlock.vue`, téléchargement PNG/SVG), affiché dans la fiche device + modale accessible depuis la liste
- Le technicien scanne → form mobile avec : nom obligatoire, contact (téléphone/email), catégorie (intervention/incident/contrôle/autre), sévérité (info/warning/error), commentaire, **5 photos max compressées localement**
- Soumission via Edge Function `submit-intervention` (verify_jwt=false) qui upload les photos dans le bucket privé `intervention-photos` puis insère la row (RLS bloque les insert anon, seule la service_role peut écrire)
- Côté admin : liste filtrable (statut ouvert/résolu/toutes), modale détail avec galerie + lightbox plein écran, toggle "Marquer résolu" qui passe `status='resolved' + resolved_at=now()` via RLS

## 4. Schéma DB

Tables Supabase (toutes en RLS company-scopée sauf indication) :

```
companies            ← tenant racine
  ├─ devices         ← boîtiers Hexa.ai Edge (vnc_host, vnc_port, etc.)
  │    └─ reports    ← type ∈ {status, daily, weekly} + payload JSONB
  │         └─ field_interventions  ← QR rapports techniciens (+ photo_paths text[])
  ├─ recipients      ← destinataires (auth_user_id, role: admin/viewer/member/external, allowed_device_ids)
  │    └─ report_tokens  ← lookup tokens pour liens email
  └─ connectivity_alerts ← état des notifs d'offline (par device)
```

**RPC (toutes `security invoker`, RLS appliquée) :**
- `devices_with_latest_status()` — LATERAL JOIN devices + dernier rapport status
- `alarm_history()` — flatten + dédoublonne les `payload.alarm_events` de daily+weekly
- `alarm_counts()` — `{active_alarms, open_interventions}` pour le polling badge
- `current_recipient_company_id()` — helper RLS

**Storage privé `intervention-photos`** :
- Path : `{device_id}/{intervention_id}/<i>.{jpg|png|webp}`
- SELECT RLS : authentifié + recipient de la même company que le device
- INSERT/UPDATE/DELETE : aucune policy → service_role only

## 5. Edge Functions

Toutes en `verify_jwt=false` (public, auth par token query string), partagent `_shared/cors.ts` + `_shared/response.ts` (helpers `ok/fail/preflight`).

| Fonction | Méthode | Contrat |
|---|---|---|
| `view-report` | GET | `?t=&d=` → `{ device, status, role, expiresAt }` |
| `view-periodic-report` | GET | `?t=&d=&type=&period?` → `{ payload, periods, ... }` |
| `recover-link` | POST | `{ email, from_url? }` — délègue à n8n pendant le double-run |
| `location-update` | POST | `{ token, deviceId, address }` — Nominatim geocode + update device |
| `submit-intervention` | POST | `{ deviceId, technicianName, ..., photos[] }` — multipart base64, upload bucket + insert |

## 6. Structure du repo

```
.
├── app/                            # Front Vue 3 + Vite
│   ├── public/                     # favicon Hexa.ai + logos
│   ├── src/
│   │   ├── components/             # DeviceReport, DeviceMap, PeriodicReport, SeriesChart, QRCodeBlock, ErrorBoundary
│   │   ├── composables/            # useDevices, useTheme, useAutoRefresh, useAlarmCounts, useChartSync, useTailscaleReachable, usePeriodicReport
│   │   ├── lib/                    # supabase, api, utils, image (compression client)
│   │   ├── router/                 # routes + guards (requireAuth)
│   │   ├── stores/                 # Pinia (auth)
│   │   ├── types/supabase.ts       # Types générés (Supabase MCP)
│   │   └── views/
│   │       ├── admin/              # AdminLayout, DevicesView, DeviceDetailView, DevicePeriodicView, FleetMapView, AlarmsView
│   │       ├── auth/               # LoginView
│   │       └── public/             # ReportView, PeriodicReportView, RecoverView, InterventionView
│   ├── tests/unit/                 # Vitest
│   ├── package.json
│   └── netlify.toml
├── supabase/
│   └── functions/                  # Edge Functions Deno
│       ├── _shared/                # cors.ts, response.ts
│       ├── view-report/
│       ├── view-periodic-report/
│       ├── recover-link/
│       ├── location-update/
│       └── submit-intervention/
└── docs/
    ├── device-provisioning.md
    ├── reference/                  # contrats payload status
    └── superpowers/specs|plans/    # specs P1..P5 et plans d'exécution
```

## 7. Démarrer en local

### Prérequis

- **Node 22** + **pnpm 11**
- Compte Supabase + variables d'env (voir `app/.env.example`)
- (optionnel) Supabase CLI pour développer les Edge Functions en local

### Setup

```bash
git clone https://github.com/Hexa-ai/myHexa.git
cd myHexa/app
pnpm install
cp .env.example .env.local
# Éditer .env.local avec VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_EDGE_FUNCTIONS_URL
pnpm dev
```

L'app démarre sur `http://localhost:5173`. Login avec un email `recipients.contact_email` qui a `auth_user_id` non-null (à créer côté Supabase Auth, le trigger fait le lien automatiquement).

### Scripts

| Commande | Description |
|---|---|
| `pnpm dev` | Vite dev server (HMR) |
| `pnpm build` | Build production |
| `pnpm preview` | Preview du build |
| `pnpm typecheck` | `vue-tsc --noEmit` |
| `pnpm test:unit` | Vitest |
| `pnpm lint` | ESLint |
| `pnpm format` | Prettier |
| `pnpm types:supabase` | Régénérer `types/supabase.ts` depuis le projet remote |

### Edge Functions

Déploiement via Supabase CLI ou MCP. Code dans `supabase/functions/<name>/index.ts`, imports relatifs vers `_shared/`. Toutes sont déployées en `verify_jwt=false` (auth applicative par token query).

## 8. Sécurité

- **RLS active sur toutes les tables `public.*`** — multi-tenant strict via `recipients.auth_user_id = auth.uid()` joinant sur `company_id`
- **service_role** utilisé uniquement côté Edge Functions, jamais exposé au front
- **Bucket privé** pour les photos d'intervention, URLs signées 30 min côté admin
- **Tokens publics** (32 hex) stockés en table `report_tokens` avec `expires_at` — pas de signature, lookup DB
- **PKCE / refresh tokens** : laissés en configuration Supabase par défaut, persistence localStorage

## 9. Déploiement

- **Frontend** : Netlify, branche `main` → site prod (build `app/`)
  - `netlify.toml` configure le redirect SPA (`/* → /index.html`)
- **Backend** : Supabase managed (migrations versionnées via MCP `apply_migration`)
- **Edge Functions** : déployées via Supabase CLI ou MCP (`deploy_edge_function`)

CI GitHub Actions (`.github/workflows/`) lance typecheck + tests sur chaque push.

## 10. Roadmap

Plans détaillés dans `docs/superpowers/plans/` :

| Phase | Statut | Description |
|---|---|---|
| **P1** | ✅ Done | Bootstrap Vue + Vite + Tailwind + Supabase client + Vitest + ESLint + Prettier + Netlify + CI |
| **P2** | ✅ Done | Migrations auth (`auth_user_id`, `role`, trigger), RLS, authStore, router guards, Login / Admin / Devices views |
| **P3** | ✅ Done | Audit n8n, helpers Edge, 5 fonctions publiques, vues admin riches (carte flotte + détail + rapports périodiques + alarmes), QR interventions, thème dark/light, responsive, refresh auto, notification permanente |
| **P4** | ⏳ Next | Admin CRUD (Companies, Devices, Recipients) — création/édition/suppression |
| **P5** | ⏳ Plan | Tests E2E Playwright + coupure progressive des workflows n8n |

## 11. Crédits

- Design system : inspiré de [hexa-ai.fr](https://www.hexa-ai.fr/) (palette teal, logo officiel)
- Icônes : Lucide / inline SVG
- Cartes : OpenStreetMap + CartoDB tiles via Leaflet
- Géocodage : Nominatim (User-Agent identifié)

---

© Hexa.ai — Tous droits réservés.

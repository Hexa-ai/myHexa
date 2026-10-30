# Front : `app/`

Application monopage **Vue 3 + TypeScript + Vite 8**, styles **Tailwind 4**, composants de base **shadcn-vue** (dossier `src/components/ui/`, config `app/components.json`), état global **Pinia**, graphiques **Chart.js**, cartes **Leaflet**, base de données **supabase-js**. Environ 28 000 lignes dans `app/src` (mesurable avec `wc -l`).

Scripts (`app/package.json`) : `dev`, `build` (`vue-tsc -b && vite build`), `preview`, `lint` (`eslint . --fix`), `format` (`prettier --write src/`), `typecheck` (`vue-tsc --noEmit`), `test:unit` (`vitest run`).

## Démarrage de l'application (`src/main.ts`)

1. crée Pinia ;
2. **restaure la session AVANT d'installer le routeur** (sinon les gardes voient « non connecté » et affichent un flash de la page de login) ;
3. un filet de 6 s monte quand même l'application si la restauration ne répond pas ;
4. charge les styles (`style.css`, `theme-appareil.css`, `pwa.css`), `composables/useTheme` et enregistre le service worker (`lib/pwa.ts`, fichier `public/sw.js`).

## Carte de `src/`

| Dossier | Contenu |
|---|---|
| `router/` | `index.ts` (routes) et `guards.ts` (gardes `requireAuth`, `requireAdmin`, `requireStaff`, `requireStaffAdmin`) |
| `views/` | une vue par écran ; `auth/` (connexion), `admin/` (portail), `admin/staff/` (outils Hexa), `public/` (sans connexion) |
| `components/` | composants réutilisables par thème : `dashboard/`, `alarms/`, `devices/`, `fleet/`, `recipients/`, `staff/`, `intervention/`, `layout/`, `ui/` (shadcn) + quelques composants à la racine (`HistoryChart.vue`, `SeriesChart.vue`, `DeviceMap.vue`, `DeviceReport.vue`…) |
| `composables/` | accès aux données et logique réutilisable (`useDevices`, `useDashboards`, `useHistory`, `useAlarmConfig`…) |
| `stores/` | Pinia : `auth.ts` (session, destinataire, rôles) et `live.ts` (direct) |
| `lib/` | `supabase.ts` (client), `api.ts` (client HTTP des fonctions publiques), `live/` (transport du direct), `pwa.ts`, `vapid.ts`, `image.ts`, `appHeight.ts`, `utils.ts` |
| `types/supabase.ts` | types de la base **générés** (1 015 lignes) — voir « Pièges » |
| `*.css` | `style.css` (variables, thème sombre par défaut), `theme-appareil.css` (style « appareil »), `pwa.css` |

## Routes (`src/router/index.ts`)

| URL | Nom | Vue | Accès |
|---|---|---|---|
| `/` | `home` | redirige vers `staff-companies` (staff) ou `admin-devices` | connecté |
| `/login`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/magic-link`, `/auth/callback`, `/auth/accept` | — | `views/auth/*` | public |
| `/intervention` | `intervention` | `views/public/InterventionView.vue` (formulaire du QR code) | public |
| `/admin/devices`, `/admin/devices/:id` | `admin-devices`, `admin-device-detail` | `DevicesView`, `DeviceDetailView` | connecté |
| `/admin/devices/:id/history` | `admin-device-history` | `DeviceHistoryView` | connecté |
| `/admin/devices/:id/periodic` | — | redirige vers l'historique **[hérité]** | |
| `/admin/dashboards` | `admin-dashboards` | `DashboardsView` | connecté |
| `/admin/dashboard/:scope(device\|project)/:id` | `admin-dashboard` | `DashboardView` | connecté |
| `/admin/dashboard/partage/:d` | `admin-dashboard-shared` | `SharedDashboardView` | connecté |
| `/admin/map`, `/admin/projects`, `/admin/alarms`, `/admin/interventions`, `/admin/updates` | `admin-map`… | `FleetMapView`, `ProjectsView`, `AlarmsView`, `InterventionsView`, `UpdatesView` | connecté |
| `/admin/recipients` | `admin-recipients` | `RecipientsView` | `requireAdmin` |
| `/admin/alarm-recipients` | `admin-alarm-recipients` | `AlarmRecipientsView` | connecté (pas de garde propre) |
| `/admin/notifications` | — | redirige vers `admin-alarm-recipients?tab=box` **[hérité]** | |
| `/admin/staff/companies[/:id]`, `/admin/staff/usage`, `/admin/staff/devices` | `staff-*` | `views/admin/staff/*` | `requireStaff` |
| `/admin/staff/devices/new`, `/admin/staff/devices/:id/edit` | `staff-device-new`, `staff-device-edit` | `DeviceNewView`, `DeviceEditView` | `requireStaffAdmin` |

`/admin` entier est protégé par `requireAuth` (`router/index.ts`, ligne du parent). Les gardes sont dans `router/guards.ts`. **Ces gardes servent à l'ergonomie : la sécurité réelle est la RLS** ([securite-rls.md](../backend/securite-rls.md)).

## Session et rôles (`stores/auth.ts`)

- charge la session Supabase puis la ligne `recipients` de l'utilisateur ;
- `isHexaStaff` = destinataire `admin` d'une entreprise `is_hexa_internal` (même règle que la fonction SQL `is_hexa_staff()`) ; `isHexaStaffAdmin` est un **alias** de `isHexaStaff` **[hérité]** ;
- le staff peut « agir comme » une entreprise (`actAsCompanyId`, `effectiveCompanyId`) : cela ne filtre que l'affichage.

## Comment le front parle au back

1. **Lecture / écriture directe** : `supabase.from('table')` (surtout `devices`, `recipients`, `companies`, `dashboards`…), toujours filtré par la RLS.
2. **RPC** : `supabase.rpc('fonction')`. Principales : `devices_with_latest_status` (`useDevices`), `projects_overview` (`useProjects`), `save_dashboard_widgets`, `share_dashboard`, `shared_dashboard_bundle` (`useDashboards`), `ts_catalog` (`useHistory`), `alarm_counts`, `dismiss_alarm`, `usage_*` (`useUsage`), `fleet_*` (parc), `queue_run_update` / `cancel_device_command` (`UpdatesView`), `weather_for_devices` (`WeatherBlock`). La liste complète est dans [fonctions-sql.md](../backend/fonctions-sql.md).
3. **Edge Functions** via `supabase.functions.invoke(...)` : `ts-read` (`useHistory`, `useAlarmHistory`), `report-run` (`useReports`), `invite-recipient` et `delete-recipient` (`useRecipients`, `useAlarmConfig`), `share-device` (`DeviceDetailView`), `cron-status-email` (envoi manuel depuis `staff/CompanyDetailView`).
4. **`lib/api.ts`** : n'exporte plus que `submitIntervention` (page publique `/intervention`, fonction `submit-intervention`) et `callEdge`, qui n'est utilisé nulle part **[mort]**. Ce module lève une erreur à l'import si `VITE_EDGE_FUNCTIONS_URL` manque.
5. **Realtime** : uniquement dans `lib/live/supabaseSource.ts` (voir [temps-reel.md](../flux/temps-reel.md)).

## Variables de build lues par le code

`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_EDGE_FUNCTIONS_URL`, `VITE_CARTO_API_KEY`, `VITE_VAPID_PUBLIC_KEY` (clé **publique** des notifications push), `VITE_DEVICE_API_URL` (adresse affichée dans la fiche box ; fixée dans `netlify.toml`), et des interrupteurs : `VITE_REALTIME_DIRECT=false` coupe le direct, `VITE_LIVE_SOURCE=mock` simule le direct sans backend, `VITE_LIVE_FAST_MS` raccourcit la durée du direct rapide (tests), `VITE_UI_STYLE=classique` revient à l'ancien style.

## Conventions observées

- Composants en `<script setup lang="ts">`, alias `@/` = `app/src/`.
- Une vue = un fichier `XxxView.vue` ; la logique de données va dans un `composables/useXxx.ts` qui retourne des `ref`/`computed` et des fonctions `load…`/`save…`.
- Les attributs `data-testid` servent aux tests de bout en bout.
- Commentaires et textes d'interface en **français** ; identifiants du code mélangent français et anglais (`useAlarmHistory`, mais `affichage`/`kiosk`).
- Les blocs encore au stade d'essai portent un commentaire `PROTOTYPE` en tête de fichier.
- Pas de tests de composants : seuls les modules sans interface sont testés (voir [exploitation](../exploitation/README.md)).

## Ajouter un écran

1. **Créer la vue** `app/src/views/admin/MonEcranView.vue` (copiez une vue courte comme `InterventionsView.vue` pour la mise en page).
2. **Déclarer la route** dans `app/src/router/index.ts`, sous `/admin` (enfant de `AdminLayout`), avec un `name` du type `admin-mon-ecran`. Ajoutez un garde (`requireAdmin`, `requireStaff`) si l'écran est réservé.
3. **Ajouter l'entrée de menu** dans `app/src/views/admin/AdminLayout.vue` (qui navigue avec `router.push({ name: ... })`) et, pour mobile, `components/layout/MobileTabBar.vue`.
4. **Données** : créez `composables/useMonEcran.ts` avec `supabase.from(...)` ou `supabase.rpc(...)`. Si la table ou la fonction est nouvelle, écrivez d'abord la **migration** avec sa politique RLS ([exploitation](../exploitation/README.md)), puis régénérez `src/types/supabase.ts`.
5. **Vérifier** : `pnpm typecheck`, `pnpm test:unit`, puis testez sur le projet TEST.

## Pièges

- **`types/supabase.ts` est en retard sur la base** : il ne décrit qu'une douzaine de tables et une poignée de fonctions, alors que la base en a bien plus (`dashboards`, `projects`, `ts_vars`…). Les composables récents contournent avec `const sb = supabase as any` (ex. `composables/useProjects.ts`). Régénérer le fichier réglerait une partie des `any`.
- Le direct ne doit **jamais** casser la page : le store `live.ts` absorbe les erreurs et retombe sur les valeurs 30 min.
- Le service worker (`public/sw.js`) ne met en cache que les fichiers de l'application ; aucune donnée Supabase n'est mise en cache.

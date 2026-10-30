# Edge Functions

Dossier : `supabase/functions/<nom>/index.ts` (Deno). Code partagé dans `supabase/functions/_shared/`. Réponses JSON de la forme `{ ok: true, data }` ou `{ ok: false, error: { code, message } }` pour les fonctions qui utilisent `_shared/response.ts` (`ok()`, `fail()`, `preflight()`) ; certaines fonctions plus anciennes répondent à leur façon (`cron-status-email`, `device-ingress`).

**Secrets** : seuls les **noms** des variables d'environnement sont donnés. Les valeurs sont dans les secrets de fonctions de chaque projet Supabase (jamais dans le dépôt). `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` sont fournis par Supabase.

**Authentification** (`supabase/config.toml`, section `functions`) : `verify_jwt = false` pour `device-ingress`, `ts-build`, `report-run` ; `verify_jwt = true` pour `ts-read`. Les commentaires de `realtime-token` demandent aussi `verify_jwt = false`, mais **il n'y a pas d'entrée dans `config.toml`** pour `realtime-token`, `push-alarm` et les `cron-*` (appelés avec `x-cron-secret`, sans JWT). Vérifiez l'option au déploiement (`--no-verify-jwt`) ; voir [exploitation](../exploitation/README.md).

## Vue d'ensemble

| Fonction | Appelée par | Authentification | Lignes |
|---|---|---|---|
| `device-ingress` | les box (via `api.hexa-ai.fr`) | jeton de box (Bearer) | 235 |
| `realtime-token` | les box | jeton de box (Bearer) | 27 (+ `_shared/realtimeToken.ts`) |
| `ts-build` | trigger SQL, cron | `x-cron-secret` | 565 |
| `ts-read` | portail | JWT utilisateur | 160 |
| `analyze-report` | `ts-build` | clé de service | 204 |
| `report-run` | cron, portail | `x-cron-secret` ou JWT | 964 |
| `cron-status-email` | cron, portail staff | `x-cron-secret` ou JWT staff admin | 559 |
| `cron-connectivity-alerts` | cron | `x-cron-secret` | 232 |
| `cron-weather` | cron | `x-cron-secret` | 156 |
| `cron-firmware-releases` | cron | `x-cron-secret` | 77 |
| `push-alarm` | trigger SQL | `x-cron-secret` | 94 |
| `invite-recipient` | portail | JWT (admin d'entreprise ou staff) | 240 |
| `delete-recipient` | portail | JWT (admin ou staff) | 127 |
| `share-device` | portail | JWT (admin propriétaire ou staff) | 118 |
| `submit-intervention` | page publique (QR code) | aucune (public) | 171 |

## Détail

### `device-ingress` — réception des box
- **Rôle** : point d'entrée des box HAI-P200 ; remplace l'ancien workflow n8n « Ingestion ».
- **Entrée** : `POST /provision/<hostname>` (corps `{mac}`), `POST /<hostname>/status`, `POST /<hostname>/report/<period>`, `POST /<hostname>/realtime-token` ; le préfixe `/ingress/` reste accepté.
- **Sortie** : 200 presque toujours (voir [ingestion.md](../flux/ingestion.md) pour la raison) ; provisionnement : 200 avec `{token, id, name}`, 400, 404, 410 ; statut avec bloc `remote` : `{commands: [...]}`.
- **Secrets** : aucun propre (clé de service fournie).
- Exporte `MAC_RE` et `parsePeriod` ; helper de position `_shared/location.ts`.

### `realtime-token` — jeton du direct
- **Rôle** : échange le jeton de la box contre un JWT court (rôle `box_rt`, topic `box:<id>`) pour Supabase Realtime.
- **Sortie** : 200 `{token, expires_at, expires_in, renew_after, device_id, topic, realtime_url, apikey, params}` ; 401, 405, 429 (30 échecs/min/IP), 500.
- **Secrets** : `RT_JWT_SECRET` (signature HS256), `RT_TOKEN_TTL_S` (facultatif, 21 600 s par défaut).
- Même logique que la route `/<hostname>/realtime-token` de `device-ingress`.

### `ts-build` — construction de l'historique
- **Rôle** : construit les fichiers Parquet des jours marqués dans `ts_dirty` : brut du jour, agrégats `1m`/`1h`/`1d`, événements d'alarme ; appelle ensuite `analyze-report`.
- **Entrée** : `POST {device, limit}` ; options `{events_backfill: true}`, `{rebuild_1d: true}`.
- **Secrets** : `CRON_SECRET`. Stockage : bucket `ts-archive`.

### `ts-read` — lecture de l'historique
- **Entrée** : `POST {device, vars[], from, to}` (ms), `dashboard?` pour un tableau partagé, ou `{mode:'alarms', devices[], from, to, …}`.
- **Sortie** : séries au niveau le plus adapté : ≤ 2 j brut, ≤ 21 j agrégat 1 min, ≤ 186 j 1 h, au-delà 1 jour.
- **Secrets** : aucun propre. En-tête de fichier : « PROTOTYPE », mais utilisé en production.

### `analyze-report` — dérives
- **Entrée** : `POST {report_id}` avec la clé de service ; écrit `report_insights` / `device_period_stats` à partir des Parquet journaliers (anomalie à 28 jours, confirmation 7 jours, tendance 12 semaines).
- **Secrets** : `GEMINI_API_KEY` (rédaction des constats).

### `report-run` — rapports programmés
- **Entrée** : cron (`x-cron-secret`, `{}`) traite les modèles échus ; JWT `{action:'preview', dashboard_id, frequency, at?}` génère sans envoyer ; JWT `{action:'run', template_id}` génère et envoie maintenant.
- **Sortie** : HTML + CSV (+ PDF), archivés dans le bucket `reports`, ligne dans `report_runs` ; attend jusqu'à `REPORT_WAIT_HOURS` (6 h) que les rapports journaliers soient arrivés.
- **Secrets** : `CRON_SECRET`, `APP_URL`, `REPORT_MAIL_ALLOW_DOMAIN` (facultatif, limite les destinataires, utile en test), `REPORT_WAIT_HOURS`, et ceux du mailer.

### `cron-status-email` — mail de statut
- **Rôle** : mail récapitulatif aux destinataires abonnés (`recipients.status_email`), avec un résumé rédigé par IA si `companies.status_email_ai`.
- **Entrée** : cron (`x-cron-secret`) ou JWT staff admin avec `{company_id}` (bouton manuel dans `CompanyDetailView.vue`).
- **Secrets** : `CRON_SECRET`, `APP_URL`, `GEMINI_API_KEY` + mailer.
- Code « repris tel quel de la version déployée en prod » lors du réalignement (en-tête du fichier).

### `cron-connectivity-alerts` — perte / retour de liaison
- **Rôle** : mails regroupés par personne lorsqu'une box est silencieuse plus de `connectivity_delay_minutes`, puis au retour ; respecte `alerts_paused_until` (maintenance) ; état dans `connectivity_alerts`. Logique pure dans `logic.ts`.
- **Secrets** : `CRON_SECRET`, `APP_URL`, `ALERT_MAIL_ALLOW_DOMAIN` + mailer. Sans configuration mail : réponse `dry_run`, aucun envoi.

### `cron-weather` — météo
- **Rôle** : relevé toutes les 15 min par site (coordonnées arrondies à ~1 km), prévisions toutes les 3 h ; remplit `weather_sites` et l'historique (`weather_ingest`).
- **Secrets** : `CRON_SECRET`, `WEATHER_PROVIDER`, `OPENWEATHER_API_KEY` (sinon Open-Meteo), `OPEN_METEO_API_KEY`.

### `cron-firmware-releases` — versions firmware
- **Rôle** : lit l'index du dépôt APT public des box (paquet `hai-pxxx-ai`) et enregistre les versions dans `firmware_releases`.
- **Secrets** : `CRON_SECRET`, `FIRMWARE_REPO_URL`.

### `push-alarm` — notifications push
- **Rôle** : envoie les Web Push en attente de `push_alarm_queue` aux abonnements des utilisateurs qui voient la box (`push_targets`) ; supprime les abonnements expirés (404/410). Mode essai : `{test:true, endpoint}`.
- **Secrets** : `CRON_SECRET`, les trois variables `VAPID_*` (clé publique, clé privée, sujet).

### `invite-recipient` — création / mise à jour d'un destinataire
- **Entrée** : `POST {name, contact_email, phone?, role, company_id?, restrict_to_devices?, shared_devices?, recipient_id?}`.
- **Règles** : un admin d'entreprise ne crée que dans son entreprise ; seul le staff peut créer sans entreprise (« invité pur ») ou donner `shared_devices` hors de son entreprise. Tout destinataire a un compte `auth.users` (invitation par mail, lien magique possible).
- **Secrets** : `APP_URL`.

### `delete-recipient`
- **Entrée** : `POST {recipient_id}`. Supprime le destinataire et son compte `auth.users` si plus aucun autre destinataire ne l'utilise (évite les comptes orphelins qui bloquent une ré-invitation).

### `share-device`
- **Entrée** : `POST {device_id, recipient_email}`. Ajoute la box à `recipients.shared_devices` ; réservé à l'admin de l'entreprise propriétaire ou au staff. Voir [partage.md](../flux/partage.md).

### `submit-intervention` — formulaire public du QR code
- **Entrée** : `POST {deviceId, technicianName, technicianContact|technicianPhone, category, severity, kind?, message?, photos[]}` (photos en base64, `MAX_PHOTOS` et taille limitées).
- **Sortie** : crée la ligne `field_interventions` et envoie les photos dans le bucket `intervention-photos`. Réponses d'erreur typées (`MISSING_DEVICE`, `TOO_MANY_PHOTOS`…). Endpoint **public** : à surveiller (pas d'authentification).

## Code partagé (`_shared/`)

| Fichier | Rôle |
|---|---|
| `response.ts`, `cors.ts` | réponses JSON normalisées, CORS |
| `mailer.ts` | envoi via l'API REST Gmail (compte de service avec délégation) ; secrets `GOOGLE_SA_EMAIL`, `GOOGLE_SA_PRIVATE_KEY`, `GMAIL_IMPERSONATE_USER`, `GMAIL_FROM_NAME` (facultatif). SMTP ne fonctionne pas dans l'environnement Edge. |
| `realtimeToken.ts` | émission du jeton direct |
| `location.ts` | lecture et validation de la clé `location` des messages de box |
| `tsparquet.ts`, `tsread.ts` | lecture / écriture Parquet de l'historique |
| `alarms.ts`, `drift.ts`, `weather.ts` | logique d'alarmes, de dérive et de météo |
| `pdfreport.ts`, `svgchart.ts` | rendu des rapports |
| `*_test.ts` | tests Deno de `alarms`, `drift`, `location`, `weather` |

## Hérité / mort

- Les fonctions `view-report`, `recover-link`, `location-update` ne sont plus dans le dépôt (voir `docs/realignement-prod-2026-10.md` pour celles encore déployées en prod).
- `ts-build`, `ts-read` et `report-run` portent « PROTOTYPE, myHexa-test » dans leur en-tête alors qu'elles sont en production.
- Les en-têtes de `supabase/cron-setup.md` citent l'ancien n8n.

# Glossaire

| Terme | Sens dans myHexa | Où le trouver dans le code |
|---|---|---|
| **Box** | boîtier industriel HAI-P200 en 4G, posé chez le client. Dans la base c'est une ligne de `devices`, dans le code on dit souvent `device`. | table `devices` |
| **Entreprise** (company) | un client. Possède des box et des destinataires. | table `companies` |
| **Destinataire** (recipient) | une personne rattachée à une entreprise, avec un compte de connexion et un rôle `admin` ou `viewer`. | table `recipients` |
| **Staff Hexa** | admin d'une entreprise marquée `is_hexa_internal` : voit toutes les entreprises. | fonction SQL `is_hexa_staff()`, `app/src/stores/auth.ts` |
| **Jeton de box** | secret propre à chaque box, envoyé en `Bearer` ; c'est un identifiant de box, pas un JWT. | `devices.token`, `device-ingress` |
| **Provisionnement** | première prise de contact d'une box : elle donne son adresse MAC et reçoit son jeton. | `docs/device-provisioning.md`, RPC `provision_device` |
| **Statut** (status) | message envoyé par la box toutes les 30 minutes : état et dernières valeurs des variables. | RPC `ingest_status` |
| **Rapport journalier** (daily) | message quotidien avec courbes 5 min, compteurs, changements d'état et événements d'alarme. | table `reports`, RPC `ingest_report` |
| **Variable** | une mesure ou un état d'automate (ex. `TT01`, `POMPE`), identifiée par son nom. | `ts_vars`, `variables[].name` du statut |
| **Historique** (ts) | séries temporelles reconstruites en fichiers Parquet à partir des statuts et rapports. | `ts-build`, `ts-read`, bucket `ts-archive` |
| **Favori** | ce mot est utilisé dans le langage de l'équipe, mais **aucune notion « favori » n'existe dans le code ni dans la base** (aucune occurrence dans `app/src` ni `supabase/migrations`). Le plus proche : le tableau de bord **par défaut** d'une box ou d'un projet. | `dashboards.is_default` |
| **Tableau de bord** (dashboard) | page de blocs (widgets) pour une box, un projet ou une liste libre de box. | tables `dashboards`, `dashboard_widgets` ; `app/src/composables/useDashboards.ts` |
| **Widget / bloc** | une tuile d'un tableau de bord : courbe, barres, valeur, jauge, indicateur, carte, statut, image, météo, historique d'alarmes… | `dashboard_widgets.type`, `app/src/components/dashboard/DashboardWidget.vue` |
| **Projet** | regroupement de box d'une entreprise (un site, une affaire). | table `projects`, `project_devices` |
| **Synoptique** | vue schématique d'une installation, avec valeurs animées. Maquette de conception hors dépôt ; les widgets et le direct en reprennent les valeurs. | note de conception hors dépôt |
| **Direct** (temps réel) | valeurs de la box affichées toutes les ~2 s au lieu de toutes les 30 min, via Supabase Realtime. | `app/src/stores/live.ts`, `docs/flux/temps-reel.md` |
| **Direct rapide / lent** | rapide : ~2 s, limité à 15 min puis « Continuer le direct ? ». Lent : ~10 s, sans limite. | `mode: 'fast' \| 'slow'` |
| **Affichage permanent** (kiosque) | écran mural : tableau en direct lent, sans limite de durée ni bandeau. | `dashboards.live_display`, `DashboardView.vue` (`kiosk`) |
| **Présence** | mécanisme Realtime indiquant qui est sur le canal : la box (`role:'box'`) et chaque spectateur (`role:'viewer'`). | `docs/flux/temps-reel.md` |
| **`fmt` / `vars`** | champs de la présence d'un spectateur : `fmt:2` = « je comprends le format compact » ; `vars` = liste des variables voulues. | `app/src/stores/live.ts` |
| **Alarme** | variable d'alarme de la box passée à l'état actif ; peut déclencher push et escalade. | `alarm_*`, `push_alarm_queue` |
| **Escalade** | liste ordonnée de contacts à prévenir pour les alarmes d'une box. | table `device_escalation` |
| **Commande descendante** | ordre du portail vers la box, livré dans la réponse au statut : mise à jour, redémarrage, liste de destinataires… | table `device_commands`, RPC `ingest_remote` |
| **Position 4G** | position approximative donnée par la cellule 4G, envoyée par la box. | `device_locations`, `docs/flux/position-meteo.md` |
| **Partage** | une box d'une entreprise visible par un destinataire d'une autre, ou un tableau partagé. | `recipients.shared_devices`, `dashboard_shares` |
| **Rapport programmé** | mail périodique généré à partir d'un tableau de bord. | `report_templates`, `report_runs`, `report-run` |
| **Mail de statut** | mail récapitulatif envoyé aux destinataires abonnés. | `cron-status-email` |
| **RLS** | Row Level Security de PostgreSQL : règles d'accès ligne par ligne. | `create policy` dans `supabase/migrations/` |
| **Edge Function** | fonction serveur Deno hébergée par Supabase. | `supabase/functions/` |
| **TEST / PROD** | les deux projets Supabase. | `docs/exploitation/README.md` |
| **Thème « appareil »** | style visuel par défaut de l'interface (l'ancien est « classique »). | `app/src/composables/useTheme.ts`, `app/src/theme-appareil.css` |
| **PWA** | l'application installable avec notifications push. | `app/public/sw.js`, `app/public/manifest.webmanifest` |
| **n8n** | ancien outil d'automatisation qui faisait l'ingestion ; **remplacé** par `device-ingress`. | commentaires dans `device-ingress` |

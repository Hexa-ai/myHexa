# Fonctions SQL, déclencheurs et tâches planifiées

Le portail appelle beaucoup de logique **dans la base** (fonctions `public.*` appelées par `supabase.rpc(...)`). Toutes sont accessibles aux seuls rôles `authenticated` et `service_role` (`20261025140000_securite_bascule.sql`). Les noms exacts et signatures sont dans les migrations (`grep -n "function public.<nom>" supabase/migrations/*.sql`, la **dernière** définition fait foi).

## Ingestion et commandes (appelées par `device-ingress`, clé de service)

| Fonction | Rôle |
|---|---|
| `provision_device(p_mac, p_candidate_token)` | première prise de contact : retourne `id`, `name`, `new_token` ou `already_provisioned` |
| `ingest_status(p_token, p_payload)` | enregistre un statut 30 min ; retourne l'identifiant de la box, ou vide si le jeton est inconnu |
| `ingest_report(p_token, p_type, p_payload, p_period_start, p_period_end)` | enregistre un rapport journalier ; retourne l'id du rapport (vide si jeton inconnu ou quota atteint) |
| `ingest_remote(p_token, p_remote, p_running_version)` | traite le bloc `remote` du statut et retourne les commandes en attente |
| `apply_device_location(p_device, p_loc, p_at)` | applique la position 4G (voir [position-meteo.md](../flux/position-meteo.md)) |
| `realtime_box_lookup(p_token, p_ip)` | contrôle du jeton pour le jeton direct (voir [temps-reel.md](../flux/temps-reel.md)) |
| `compute_derived_variables`, `rebuild_derived`, `_derived_interpolate_cumul` | variables dérivées (intégrales de débits en volumes, etc.) à partir du rapport |
| `weather_ingest`, `weather_ingest_series`, `weather_site_key`, `weather_device_sites` | verse la météo dans l'historique des box d'un site |

## Commandes descendantes (appelées depuis le portail)

`queue_run_update`, `queue_reboot`, `queue_send_snapshot`, `queue_alarm_sync`, `cancel_device_command`, `import_alarm_config`, `alarm_desired_recipients`, `alarm_reported_config`, `alarm_resolve_escalation`, `alarm_member_channels`, `alarm_filter_payload` : elles écrivent dans `device_commands` et lisent la configuration d'alarme. Détail : [ingestion.md](../flux/ingestion.md).

## Lecture pour l'écran

| Fonction | Écran / composable |
|---|---|
| `devices_with_latest_status` | liste des box (`useDevices`) |
| `alarm_counts`, `alarm_history`, `dismiss_alarm` | alarmes (`useAlarmCounts`, `AlarmsView`) |
| `list_company_recipients` | destinataires (`useRecipients`) |
| `projects_overview`, `set_devices_project`, `remove_device_from_project`, `project_device_ids` | projets |
| `save_dashboard_widgets`, `share_dashboard`, `unshare_dashboard`, `dashboard_shares_list`, `shared_dashboards_for_me`, `shared_dashboard_bundle`, `dashboard_scope_devices`, `dashboard_scope_devices_checked` | tableaux de bord et partage |
| `ts_catalog`, `ts_num`, `ts_build_try_lock`, `ts_build_unlock`, `ts_buffer_purge` | historique |
| `usage_by_device`, `usage_platform`, `usage_trend`, `usage_snapshot`, `_usage_files`, `_usage_rows` | consommation (écran staff) |
| `fleet_apply`, `fleet_deliver`, `fleet_to_stock`, `fleet_daily_health` | parc |
| `set_company_logo`, `set_company_notifications`, `set_device_alerts_pause`, `connectivity_subscribe_all` | réglages |
| `weather_for_devices` | bloc Météo |
| `report_next_run`, `report_period` | calcul des échéances des rapports programmés |
| `fw_base`, `fw_newer_release`, `greatest_version` | comparaison de versions firmware |
| `push_targets` | destinataires d'une notification push |
| `document_shared_with_me` | partage de documents |

## Déclencheurs

| Déclencheur | Table | Effet |
|---|---|---|
| `ts_after_report` | `reports` (insert / update de `payload`) | **statut** : verse les variables numériques dans `ts_buffer`, met à jour le catalogue `ts_vars` et marque le jour dans `ts_dirty` (la catégorie `position` est exclue). **Rapport journalier** : marque les jours de la période dans `ts_dirty`, puis, si le secret Vault `ts_build_url` existe, appelle `ts-build` via `pg_net` (asynchrone, 120 s). Toute erreur est transformée en avertissement : elle ne bloque jamais l'ingestion — `20261024100000_ts_history_parquet.sql` |
| `push_after_status` | `reports` (update de `payload`) | met en file `push_alarm_queue` et appelle `push-alarm` quand une alarme passe à l'état actif — `20261027090000_push_alarmes.sql` |
| `reports_compute_derived` | `reports` | calcule `derived_payload` (`reports_compute_derived_trg`) |
| `devices_guard_update` | `devices` | limite les colonnes modifiables par un compte client |
| `devices_log_event` | `devices` | écrit le journal `device_events` |
| `devices_normalize`, `devices_clean_candidate`, `devices_project_same_company`, `devices_location_manual` | `devices` | normalisation et contrôles de cohérence (MAC, version candidate, projet de la même entreprise, saisie manuelle de position) |
| `dashboards_check`, `report_templates_check`, `projects_touch` | tableaux, modèles de rapport, projets | contrôles et `updated_at` |
| `on_auth_user_created`, `recipients_cleanup_auth_user` | `auth.users`, `recipients` | liaison destinataire ↔ compte, et suppression des comptes orphelins |
| `*_updated_at` (`set_updated_at`) | `companies`, `devices`, `recipients` | met à jour `updated_at` |

## Tâches planifiées (`cron.schedule` dans les migrations)

| Nom | Horaire (UTC) | Cible | Migration |
|---|---|---|---|
| `cron-connectivity-alerts` | toutes les 15 min | Edge Function du même nom | `20261029220000_cron_connectivity.sql` |
| `weather` | minutes 2, 17, 32, 47 | `cron-weather` | `20261030090000_meteo.sql` |
| `firmware-releases` | minute 7 de chaque heure | `cron-firmware-releases` | `20261029210000_versions_depot.sql` |
| `report-run` | toutes les 15 min | `report-run` | `20261024130000_report_templates_proto.sql` |
| `usage-snapshot` | 03:20 | fonction SQL `usage_snapshot()` | `20261028150000_consommation.sql` |
| `cron-status-email` | selon `supabase/cron-setup.md` | `cron-status-email` | **pas de migration** : à créer à la main |

Les tâches qui appellent une Edge Function utilisent `net.http_post` avec l'en-tête `x-cron-secret`. L'URL et le secret sont lus dans le **Vault** Supabase, par ces noms : `ts_build_url` et `ts_archive_cron_secret` (pour `ts-build`), `report_run_url` (dont on déduit l'URL des autres fonctions en remplaçant `/report-run`) et `cron_secret` (en-tête `x-cron-secret` des autres crons) : voir [exploitation](../exploitation/README.md). Pour vérifier : `select jobname, schedule, active from cron.job;`.

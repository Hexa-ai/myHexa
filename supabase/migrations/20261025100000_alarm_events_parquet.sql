-- PROTOTYPE (myHexa-test) — historique des événements d'alarme en Parquet.
-- Un fichier par box et par mois (events/company=…/device=…/year=YYYY/YYYY-MM.parquet), indexé dans ts_files
-- avec level = 'events' et period = 'YYYY-MM'. Source : alarm_events des rapports journaliers
-- (et des anciens rapports hebdo pour les jours sans journalier, reprise unique).
alter table public.ts_files drop constraint if exists ts_files_level_check;
alter table public.ts_files add constraint ts_files_level_check check (level in ('raw', '1m', '1h', '1d', 'events'));

-- blocs de tableau de bord : historique et statistiques d'alarmes
alter table public.dashboard_widgets drop constraint if exists dashboard_widgets_type_check;
alter table public.dashboard_widgets add constraint dashboard_widgets_type_check check (type in
  ('curve', 'bars', 'value', 'gauge', 'indicator', 'map', 'status', 'image', 'states', 'table', 'text', 'document', 'alarm_history', 'alarm_stats'));

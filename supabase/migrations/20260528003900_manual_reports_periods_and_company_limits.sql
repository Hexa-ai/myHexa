-- CHANGEMENT FAIT À LA MAIN EN PROD (dashboard / époque n8n), jamais enregistré comme migration.
-- Reconstitué depuis le catalogue prod le 2026-10-22 pour que les migrations rejouent la prod à l'identique.
-- NE PAS EXÉCUTER EN PROD : y marquer la version comme appliquée avec
--   supabase migration repair --status applied 20260528003900

alter table public.companies add column if not exists max_daily_reports integer not null default 7;
alter table public.companies add column if not exists max_weekly_reports integer not null default 4;
alter table public.reports add column if not exists period_start date;
alter table public.reports add column if not exists period_end date;
create unique index if not exists reports_status_one_per_device on public.reports using btree (device_id) where (type = 'status'::report_type);
create unique index if not exists reports_unique_period on public.reports using btree (device_id, type, period_start) where (period_start is not null);

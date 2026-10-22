-- Migration appliquée en production le 2026-05-28 (version 20260528003147), recopiée telle quelle depuis
-- supabase_migrations.schema_migrations de la prod lors du réalignement du 2026-10-22.

drop trigger if exists reports_compute_derived on public.reports;
create trigger reports_compute_derived
  before insert or update of payload on public.reports
  for each row
  when (new.type in ('daily','weekly'))
  execute function public.reports_compute_derived_trg();

-- CHANGEMENT FAIT À LA MAIN EN PROD (dashboard / époque n8n), jamais enregistré comme migration.
-- Reconstitué depuis le catalogue prod le 2026-10-22 pour que les migrations rejouent la prod à l'identique.
-- NE PAS EXÉCUTER EN PROD : y marquer la version comme appliquée avec
--   supabase migration repair --status applied 20260520193135

-- Table d'état des alertes de connectivité, utilisée par 20260520193136 et par cron-connectivity-alerts.
create table if not exists public.connectivity_alerts (
  device_id uuid not null primary key references public.devices(id) on delete cascade,
  state text not null check (state = any (array['lost', 'recovered'])),
  last_notified_at timestamptz not null default now()
);
alter table public.connectivity_alerts enable row level security;

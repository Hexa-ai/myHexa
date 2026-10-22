-- Migration appliquée en production le 2026-05-20 (version 20260520200417), recopiée telle quelle depuis
-- supabase_migrations.schema_migrations de la prod lors du réalignement du 2026-10-22.

-- Active pg_cron (planification SQL) et pg_net (HTTP) pour pouvoir
-- déclencher les Edge Functions Supabase depuis des jobs cron.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

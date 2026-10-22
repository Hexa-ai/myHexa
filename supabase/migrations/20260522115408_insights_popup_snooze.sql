-- Migration appliquée en production le 2026-05-22 (version 20260522115408), recopiée telle quelle depuis
-- supabase_migrations.schema_migrations de la prod lors du réalignement du 2026-10-22.

ALTER TABLE public.recipient_device_views ADD COLUMN IF NOT EXISTS popup_snoozed_until timestamptz;

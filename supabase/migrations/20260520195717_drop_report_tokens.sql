-- Migration appliquée en production le 2026-05-20 (version 20260520195717), recopiée telle quelle depuis
-- supabase_migrations.schema_migrations de la prod lors du réalignement du 2026-10-22.

-- Étape 9/10 : la table report_tokens n'a plus de consommateur.
-- Les magic links Supabase Auth remplacent les tokens custom.
DROP TABLE IF EXISTS public.report_tokens;

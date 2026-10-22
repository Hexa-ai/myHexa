-- CHANGEMENT FAIT À LA MAIN EN PROD (dashboard / époque n8n), jamais enregistré comme migration.
-- Reconstitué depuis le catalogue prod le 2026-10-22 pour que les migrations rejouent la prod à l'identique.
-- NE PAS EXÉCUTER EN PROD : y marquer la version comme appliquée avec
--   supabase migration repair --status applied 20260520192906

-- Colonne héritée de n8n, nécessaire à 20260520192907 (qui la découpe puis la supprime).
alter table public.recipients add column if not exists allowed_device_ids uuid[];

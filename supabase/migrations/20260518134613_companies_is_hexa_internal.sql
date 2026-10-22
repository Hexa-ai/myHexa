-- Migration appliquée en production le 2026-05-18 (version 20260518134613), recopiée telle quelle depuis
-- supabase_migrations.schema_migrations de la prod lors du réalignement du 2026-10-22.

ALTER TABLE public.companies
  ADD COLUMN is_hexa_internal boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_companies_is_hexa_internal
  ON public.companies (is_hexa_internal) WHERE is_hexa_internal;

UPDATE public.companies
  SET is_hexa_internal = true
  WHERE id = '08a472a4-04de-498e-8f88-3aab12925134';

COMMENT ON COLUMN public.companies.is_hexa_internal IS
  'true pour la compagnie Hexa-ai (interne). Les recipients de cette compagnie sont staff (accès cross-company).';

-- companies.is_hexa_internal : marque la compagnie Hexa-ai pour dériver le statut staff.
-- Toute compagnie avec ce flag confère un accès cross-company à ses recipients.

ALTER TABLE public.companies
  ADD COLUMN is_hexa_internal boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_companies_is_hexa_internal
  ON public.companies (is_hexa_internal) WHERE is_hexa_internal;

UPDATE public.companies
  SET is_hexa_internal = true
  WHERE id = '08a472a4-04de-498e-8f88-3aab12925134';

COMMENT ON COLUMN public.companies.is_hexa_internal IS
  'true pour la compagnie Hexa-ai (interne). Les recipients de cette compagnie sont staff (accès cross-company).';

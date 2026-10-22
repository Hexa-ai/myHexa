-- Migration appliquée en production le 2026-05-20 (version 20260520195316), recopiée telle quelle depuis
-- supabase_migrations.schema_migrations de la prod lors du réalignement du 2026-10-22.

-- Étape 8 : finalise le modèle unifié.
--   - auth_user_id devient NOT NULL (tous les recipients ont un compte
--     après backfill étape 3)
--   - company_id devient nullable (autorise les guests purs)
--   - allowed_device_ids est dropée (remplacée par restrict_to_devices
--     + shared_devices à l'étape 1)

-- Drop la contrainte unique qui référence l'ancienne colonne avant tout
ALTER TABLE public.recipients
  DROP CONSTRAINT IF EXISTS recipients_email_company_unique;

ALTER TABLE public.recipients
  ALTER COLUMN auth_user_id SET NOT NULL,
  ALTER COLUMN company_id DROP NOT NULL;

ALTER TABLE public.recipients DROP COLUMN IF EXISTS allowed_device_ids;

-- Recrée la contrainte d'unicité email × company_id (gère le cas
-- company_id NULL en EXCLUDE)
ALTER TABLE public.recipients
  ADD CONSTRAINT recipients_email_company_unique
  EXCLUDE (lower(contact_email) WITH =, COALESCE(company_id::text, '') WITH =)
  WHERE (contact_email IS NOT NULL);

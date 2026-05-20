-- Étape 8/10 : finalise le modèle unifié des destinataires.
--   - auth_user_id devient NOT NULL (tous les recipients ont un compte
--     après backfill étape 3)
--   - company_id devient nullable (autorise les guests purs)
--   - allowed_device_ids est dropée (remplacée par restrict_to_devices
--     + shared_devices à l'étape 1)

ALTER TABLE public.recipients
  DROP CONSTRAINT IF EXISTS recipients_email_company_unique;

ALTER TABLE public.recipients
  ALTER COLUMN auth_user_id SET NOT NULL,
  ALTER COLUMN company_id DROP NOT NULL;

ALTER TABLE public.recipients DROP COLUMN IF EXISTS allowed_device_ids;

-- Recrée la contrainte d'unicité email × company_id en gérant le cas
-- company_id NULL (deux guests purs ne peuvent pas avoir le même email).
ALTER TABLE public.recipients
  ADD CONSTRAINT recipients_email_company_unique
  EXCLUDE (lower(contact_email) WITH =, COALESCE(company_id::text, '') WITH =)
  WHERE (contact_email IS NOT NULL);

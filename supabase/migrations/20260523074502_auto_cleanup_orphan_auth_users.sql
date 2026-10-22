-- Migration appliquée en production le 2026-05-23 (version 20260523074502), recopiée telle quelle depuis
-- supabase_migrations.schema_migrations de la prod lors du réalignement du 2026-10-22.

CREATE OR REPLACE FUNCTION public.cleanup_orphan_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF OLD.auth_user_id IS NULL THEN RETURN OLD; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.recipients WHERE auth_user_id = OLD.auth_user_id) THEN
    DELETE FROM auth.users WHERE id = OLD.auth_user_id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS recipients_cleanup_auth_user ON public.recipients;
CREATE TRIGGER recipients_cleanup_auth_user
AFTER DELETE ON public.recipients
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_orphan_auth_user();

DELETE FROM auth.users
WHERE id NOT IN (
  SELECT DISTINCT auth_user_id FROM public.recipients WHERE auth_user_id IS NOT NULL
)
AND email IS NOT NULL
RETURNING id, email;

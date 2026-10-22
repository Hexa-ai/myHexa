-- Migration appliquée en production le 2026-05-14 (version 20260514204245), recopiée telle quelle depuis
-- supabase_migrations.schema_migrations de la prod lors du réalignement du 2026-10-22.

CREATE OR REPLACE FUNCTION link_recipient_to_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE recipients
  SET auth_user_id = NEW.id,
      updated_at   = now()
  WHERE contact_email = NEW.email
    AND auth_user_id IS NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION link_recipient_to_auth_user();

COMMENT ON FUNCTION link_recipient_to_auth_user IS
  'Match auth.users.email ↔ recipients.contact_email au signup, attache auth_user_id';

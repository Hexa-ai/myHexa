-- One-shot backfill : pour chaque recipient sans auth_user_id, créer un
-- auth.users (email confirmé d'office, pas d'email envoyé) et lier les deux.
-- Idempotent : si tous les recipients ont déjà un auth_user_id, no-op.
-- Étape 3/10 de la refonte (cf docs/superpowers/specs/2026-05-20-recipients-unified-model.md).

DO $$
DECLARE
  r RECORD;
  new_uid UUID;
BEGIN
  FOR r IN
    SELECT id, contact_email, name
    FROM public.recipients
    WHERE auth_user_id IS NULL AND contact_email IS NOT NULL
  LOOP
    -- Si l'email existe déjà dans auth.users, le réutiliser
    SELECT id INTO new_uid FROM auth.users WHERE email = r.contact_email LIMIT 1;

    IF new_uid IS NULL THEN
      new_uid := gen_random_uuid();

      INSERT INTO auth.users (
        instance_id, id, aud, role, email,
        encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at, is_sso_user, is_anonymous
      ) VALUES (
        '00000000-0000-0000-0000-000000000000', new_uid, 'authenticated', 'authenticated', r.contact_email,
        '', now(),
        jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
        jsonb_build_object('full_name', r.name, 'backfilled_from_recipient', r.id),
        now(), now(), false, false
      );

      INSERT INTO auth.identities (
        provider_id, user_id, identity_data, provider,
        last_sign_in_at, created_at, updated_at
      ) VALUES (
        new_uid::text, new_uid,
        jsonb_build_object('sub', new_uid::text, 'email', r.contact_email, 'email_verified', true),
        'email',
        now(), now(), now()
      );
    END IF;

    UPDATE public.recipients SET auth_user_id = new_uid WHERE id = r.id;
  END LOOP;
END$$;

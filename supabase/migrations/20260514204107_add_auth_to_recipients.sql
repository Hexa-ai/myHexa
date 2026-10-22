-- Migration appliquée en production le 2026-05-14 (version 20260514204107), recopiée telle quelle depuis
-- supabase_migrations.schema_migrations de la prod lors du réalignement du 2026-10-22.

ALTER TABLE recipients
  ADD COLUMN auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX recipients_auth_user_id_idx ON recipients (auth_user_id);

COMMENT ON COLUMN recipients.auth_user_id IS
  'Lien vers auth.users si le destinataire est member (peut se logger) ; NULL pour les externes (emails only)';

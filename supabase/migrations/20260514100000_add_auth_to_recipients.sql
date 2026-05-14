-- Lier les destinataires à des comptes Supabase Auth.
-- Sémantique : auth_user_id IS NULL = external (emails only), NOT NULL = member (peut se logger).
-- Le `role` existant (admin/viewer) reste pour les permissions intra-entreprise.
ALTER TABLE recipients
  ADD COLUMN auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX recipients_auth_user_id_idx ON recipients (auth_user_id);

COMMENT ON COLUMN recipients.auth_user_id IS
  'Lien vers auth.users si le destinataire est member (peut se logger) ; NULL pour les externes (emails only)';

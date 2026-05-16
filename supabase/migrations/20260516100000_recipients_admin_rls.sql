-- Durcit les policies RLS de `recipients` pour limiter les mutations
-- aux destinataires `role=admin` de la même entreprise, et ajoute une
-- contrainte d'unicité (email × company) pour éviter les doublons.

CREATE OR REPLACE FUNCTION current_recipient_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM recipients
    WHERE auth_user_id = auth.uid()
      AND role = 'admin'
  )
$$;

COMMENT ON FUNCTION current_recipient_is_admin IS
  'Renvoie true si le recipient lié à auth.uid() a role=admin.';

CREATE INDEX IF NOT EXISTS idx_recipients_email_company
  ON recipients (lower(contact_email), company_id)
  WHERE contact_email IS NOT NULL;

ALTER TABLE recipients
  ADD CONSTRAINT recipients_email_company_unique
  EXCLUDE (lower(contact_email) WITH =, company_id WITH =)
  WHERE (contact_email IS NOT NULL);

DROP POLICY IF EXISTS recipients_insert_own_company ON recipients;
DROP POLICY IF EXISTS recipients_update_own_company ON recipients;
DROP POLICY IF EXISTS recipients_delete_own_company ON recipients;

CREATE POLICY recipients_insert_admin
  ON recipients FOR INSERT
  WITH CHECK (
    company_id = current_recipient_company_id()
    AND current_recipient_is_admin()
  );

CREATE POLICY recipients_update_admin
  ON recipients FOR UPDATE
  USING (
    company_id = current_recipient_company_id()
    AND current_recipient_is_admin()
  )
  WITH CHECK (
    company_id = current_recipient_company_id()
    AND current_recipient_is_admin()
  );

CREATE POLICY recipients_delete_admin
  ON recipients FOR DELETE
  USING (
    company_id = current_recipient_company_id()
    AND current_recipient_is_admin()
  );

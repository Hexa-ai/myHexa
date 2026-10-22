-- Migration appliquée en production le 2026-05-14 (version 20260514204418), recopiée telle quelle depuis
-- supabase_migrations.schema_migrations de la prod lors du réalignement du 2026-10-22.

CREATE OR REPLACE FUNCTION current_recipient_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM recipients
  WHERE auth_user_id = auth.uid()
  LIMIT 1
$$;

COMMENT ON FUNCTION current_recipient_company_id IS
  'Renvoie la company_id du recipient connecté ; NULL si pas authentifié ou pas lié';

CREATE POLICY companies_select_own
  ON companies FOR SELECT
  USING (id = current_recipient_company_id());

CREATE POLICY recipients_select_own_company
  ON recipients FOR SELECT
  USING (company_id = current_recipient_company_id());

CREATE POLICY recipients_insert_own_company
  ON recipients FOR INSERT
  WITH CHECK (company_id = current_recipient_company_id());

CREATE POLICY recipients_update_own_company
  ON recipients FOR UPDATE
  USING (company_id = current_recipient_company_id())
  WITH CHECK (company_id = current_recipient_company_id());

CREATE POLICY recipients_delete_own_company
  ON recipients FOR DELETE
  USING (company_id = current_recipient_company_id());

CREATE POLICY devices_select_own_company
  ON devices FOR SELECT
  USING (company_id = current_recipient_company_id());

CREATE POLICY devices_update_own_company
  ON devices FOR UPDATE
  USING (company_id = current_recipient_company_id())
  WITH CHECK (company_id = current_recipient_company_id());

CREATE POLICY reports_select_own_company
  ON reports FOR SELECT
  USING (
    device_id IN (
      SELECT id FROM devices WHERE company_id = current_recipient_company_id()
    )
  );

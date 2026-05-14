-- Helper : renvoie la company_id du recipient lié à auth.uid().
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

-- COMPANIES : un member voit uniquement sa company
CREATE POLICY companies_select_own
  ON companies FOR SELECT
  USING (id = current_recipient_company_id());

-- RECIPIENTS : un member voit/gère les recipients de sa company
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

-- DEVICES : SELECT + UPDATE pour les members de la company (INSERT/DELETE = n8n via service_role/postgres)
CREATE POLICY devices_select_own_company
  ON devices FOR SELECT
  USING (company_id = current_recipient_company_id());

CREATE POLICY devices_update_own_company
  ON devices FOR UPDATE
  USING (company_id = current_recipient_company_id())
  WITH CHECK (company_id = current_recipient_company_id());

-- REPORTS : SELECT only pour les members (écrits par n8n)
CREATE POLICY reports_select_own_company
  ON reports FOR SELECT
  USING (
    device_id IN (
      SELECT id FROM devices WHERE company_id = current_recipient_company_id()
    )
  );

-- RLS staff bypass : ajout du OR is_hexa_staff() en lecture,
-- OR is_hexa_staff_admin() en écriture. Les comportements clients existants
-- sont préservés à l'identique.

-- companies (SELECT)
DROP POLICY IF EXISTS companies_select_own ON public.companies;
CREATE POLICY companies_select_own ON public.companies FOR SELECT TO authenticated
  USING (id = current_recipient_company_id() OR public.is_hexa_staff());

-- devices (SELECT, UPDATE)
DROP POLICY IF EXISTS devices_select_own_company ON public.devices;
CREATE POLICY devices_select_own_company ON public.devices FOR SELECT TO authenticated
  USING (company_id = current_recipient_company_id() OR public.is_hexa_staff());

DROP POLICY IF EXISTS devices_update_own_company ON public.devices;
CREATE POLICY devices_update_own_company ON public.devices FOR UPDATE TO authenticated
  USING (company_id = current_recipient_company_id() OR public.is_hexa_staff_admin())
  WITH CHECK (company_id = current_recipient_company_id() OR public.is_hexa_staff_admin());

-- devices INSERT (nouvelle policy : permet au staff admin de créer des devices)
DROP POLICY IF EXISTS devices_insert_staff_admin ON public.devices;
CREATE POLICY devices_insert_staff_admin ON public.devices FOR INSERT TO authenticated
  WITH CHECK (public.is_hexa_staff_admin());

-- recipients (SELECT, INSERT, UPDATE, DELETE)
DROP POLICY IF EXISTS recipients_select_own_company ON public.recipients;
CREATE POLICY recipients_select_own_company ON public.recipients FOR SELECT TO authenticated
  USING (company_id = current_recipient_company_id() OR public.is_hexa_staff());

DROP POLICY IF EXISTS recipients_insert_admin ON public.recipients;
CREATE POLICY recipients_insert_admin ON public.recipients FOR INSERT TO authenticated
  WITH CHECK (
    (company_id = current_recipient_company_id() AND current_recipient_is_admin())
    OR public.is_hexa_staff_admin()
  );

DROP POLICY IF EXISTS recipients_update_admin ON public.recipients;
CREATE POLICY recipients_update_admin ON public.recipients FOR UPDATE TO authenticated
  USING (
    (company_id = current_recipient_company_id() AND current_recipient_is_admin())
    OR public.is_hexa_staff_admin()
  )
  WITH CHECK (
    (company_id = current_recipient_company_id() AND current_recipient_is_admin())
    OR public.is_hexa_staff_admin()
  );

DROP POLICY IF EXISTS recipients_delete_admin ON public.recipients;
CREATE POLICY recipients_delete_admin ON public.recipients FOR DELETE TO authenticated
  USING (
    (company_id = current_recipient_company_id() AND current_recipient_is_admin())
    OR public.is_hexa_staff_admin()
  );

-- reports (SELECT seul actuellement)
DROP POLICY IF EXISTS reports_select_own_company ON public.reports;
CREATE POLICY reports_select_own_company ON public.reports FOR SELECT TO authenticated
  USING (
    device_id IN (SELECT id FROM devices WHERE company_id = current_recipient_company_id())
    OR public.is_hexa_staff()
  );

-- field_interventions (SELECT, UPDATE)
DROP POLICY IF EXISTS field_interventions_tenant_select ON public.field_interventions;
CREATE POLICY field_interventions_tenant_select ON public.field_interventions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM devices d JOIN recipients r ON r.company_id = d.company_id
      WHERE d.id = field_interventions.device_id AND r.auth_user_id = auth.uid()
    )
    OR public.is_hexa_staff()
  );

DROP POLICY IF EXISTS field_interventions_admin_update ON public.field_interventions;
CREATE POLICY field_interventions_admin_update ON public.field_interventions FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM devices d JOIN recipients r ON r.company_id = d.company_id
      WHERE d.id = field_interventions.device_id AND r.auth_user_id = auth.uid() AND r.role = 'admin'
    )
    OR public.is_hexa_staff_admin()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM devices d JOIN recipients r ON r.company_id = d.company_id
      WHERE d.id = field_interventions.device_id AND r.auth_user_id = auth.uid() AND r.role = 'admin'
    )
    OR public.is_hexa_staff_admin()
  );

-- companies INSERT/UPDATE (staff admin seul)
DROP POLICY IF EXISTS companies_insert_staff_admin ON public.companies;
CREATE POLICY companies_insert_staff_admin ON public.companies FOR INSERT TO authenticated
  WITH CHECK (public.is_hexa_staff_admin());

DROP POLICY IF EXISTS companies_update_staff_admin ON public.companies;
CREATE POLICY companies_update_staff_admin ON public.companies FOR UPDATE TO authenticated
  USING (public.is_hexa_staff_admin())
  WITH CHECK (public.is_hexa_staff_admin());

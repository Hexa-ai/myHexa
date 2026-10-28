-- MYH-010 : un tableau partagé en lecture seule ne doit pas exposer ses modèles de rapport (destinataires, planning)
drop policy if exists report_templates_select on public.report_templates;
create policy report_templates_select on public.report_templates for select to authenticated using (
  can_view_dashboard(dashboard_id) and (is_hexa_staff() or company_id = current_recipient_company_id()));

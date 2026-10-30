-- Archives des rapports (bucket « reports ») illisibles : dans la policy d'origine, `name` non qualifié
-- était résolu en report_templates.name (nom du modèle) au lieu du chemin de l'objet -> condition toujours
-- fausse -> « Object not found » sur voir / PDF / CSV. On qualifie storage.objects.name.
drop policy if exists reports_read on storage.objects;
create policy reports_read on storage.objects for select to authenticated
  using (bucket_id = 'reports' and exists (
    select 1 from public.report_templates t
    where t.id::text = (storage.foldername(objects.name))[2]
      and t.company_id::text = (storage.foldername(objects.name))[1]
      and public.can_view_dashboard(t.dashboard_id)));

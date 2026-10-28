-- MYH-010 : documents dans un tableau partagé en lecture seule.
-- Le destinataire peut lire UNIQUEMENT les documents cités dans un bloc « document » d'un tableau partagé avec lui,
-- appartenant à une box du tableau. Partage retiré / tableau devenu non partageable = accès coupé.
create or replace function public.document_shared_with_me(p_doc uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1
      from device_documents dd
      join dashboard_shares s on true
      join recipients r on r.id = s.recipient_id and r.auth_user_id = auth.uid()
      join dashboard_widgets w on w.dashboard_id = s.dashboard_id and w.type = 'document'
     where dd.id = p_doc
       and coalesce(w.options->'docs', '[]'::jsonb) ? dd.id::text
       and dd.device_id in (select dashboard_scope_devices(s.dashboard_id))
       and dashboard_share_valid(s.dashboard_id))
$$;
grant execute on function public.document_shared_with_me(uuid) to authenticated;

drop policy if exists device_documents_select_shared_dashboard on public.device_documents;
create policy device_documents_select_shared_dashboard on public.device_documents for select to authenticated
  using (document_shared_with_me(id));

drop policy if exists device_docs_storage_select_shared_dashboard on storage.objects;
create policy device_docs_storage_select_shared_dashboard on storage.objects for select to authenticated
  using (bucket_id = 'device-docs' and exists (
    select 1 from public.device_documents dd
     where dd.file_path = storage.objects.name and public.document_shared_with_me(dd.id)));

-- Migration appliquée en production le 2026-05-15 (version 20260515135345), recopiée telle quelle depuis
-- supabase_migrations.schema_migrations de la prod lors du réalignement du 2026-10-22.

alter table public.field_interventions
  add column if not exists photo_paths text[] not null default '{}';

insert into storage.buckets (id, name, public)
values ('intervention-photos', 'intervention-photos', false)
on conflict (id) do nothing;

drop policy if exists "intervention_photos_tenant_read" on storage.objects;
create policy "intervention_photos_tenant_read" on storage.objects
  for select
  to authenticated
  using (
    storage.objects.bucket_id = 'intervention-photos'
    and exists (
      select 1
      from public.devices d
      join public.recipients r on r.company_id = d.company_id
      where d.id::text = split_part(storage.objects.name, '/', 1)
        and r.auth_user_id = auth.uid()
    )
  );

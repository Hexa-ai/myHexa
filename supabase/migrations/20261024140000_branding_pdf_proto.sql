-- PROTOTYPE (myHexa-test uniquement) — logo d'entreprise, images (voyants, blocs image) et PDF des rapports.
-- Bucket public `branding` : chemins <company_id>/logo-<horodatage>.png|jpg (PNG/JPEG seulement : intégrables au PDF, pas de SVG actif) et <company_id>/img/<uuid>.<ext>
-- (lecture publique : logos et pictogrammes ne sont pas sensibles, chemins non devinables ; nécessaire pour les <img> des mails).
-- Écriture réservée aux admins de l'entreprise (et au staff Hexa-AI).

alter table public.companies add column if not exists logo_path text;
alter table public.report_templates add column if not exists attach_pdf boolean not null default true;
alter table public.report_runs add column if not exists pdf_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('branding', 'branding', true, 2097152, array['image/png', 'image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists branding_write on storage.objects;
create policy branding_write on storage.objects for insert to authenticated
  with check (bucket_id = 'branding' and public.can_manage_company(((storage.foldername(name))[1])::uuid));
drop policy if exists branding_update on storage.objects;
create policy branding_update on storage.objects for update to authenticated
  using (bucket_id = 'branding' and public.can_manage_company(((storage.foldername(name))[1])::uuid));
drop policy if exists branding_delete on storage.objects;
create policy branding_delete on storage.objects for delete to authenticated
  using (bucket_id = 'branding' and public.can_manage_company(((storage.foldername(name))[1])::uuid));

-- le logo se change par RPC (les admins d'entreprise n'ont pas forcément le droit de modifier toute la ligne companies)
create or replace function public.set_company_logo(p_company uuid, p_path text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not can_manage_company(p_company) then
    raise exception 'réservé à l''administrateur' using errcode = '42501';
  end if;
  if p_path is not null and split_part(p_path, '/', 1) <> p_company::text then
    raise exception 'chemin invalide' using errcode = '22023';
  end if;
  update companies set logo_path = p_path, updated_at = now() where id = p_company;
end $$;
revoke all on function public.set_company_logo(uuid, text) from public, anon;
grant execute on function public.set_company_logo(uuid, text) to authenticated;

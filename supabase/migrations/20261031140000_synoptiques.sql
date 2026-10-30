-- Synoptiques : tuile de tableau de bord « synoptic » (dessin animé d'une installation, relié aux variables d'une box).
--   * synoptics          : l'objet (entreprise, box concernées, nom, numéro de la version courante) ;
--   * synoptic_versions  : le document JSON de chaque version (jamais modifié : enregistrer = nouvelle version).
-- Droits calqués sur les tableaux de bord : lecture pour qui voit les box (is_device_visible, même entreprise, ou staff),
-- écriture pour qui peut gérer l'entreprise (can_manage_company : administrateur ou staff Hexa-AI).

create table if not exists public.synoptics (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  device_ids uuid[] not null default '{}',
  name text not null check (length(trim(name)) between 1 and 120),
  current_version int not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists synoptics_company_idx on public.synoptics (company_id);

create table if not exists public.synoptic_versions (
  synoptic_id uuid not null references public.synoptics(id) on delete cascade,
  version int not null check (version >= 1),
  doc jsonb not null check (jsonb_typeof(doc) = 'object' and octet_length(doc::text) <= 3000000),
  source text not null default 'manual' check (source in ('manual', 'ai', 'import')),
  created_at timestamptz not null default now(),
  created_by uuid,
  primary key (synoptic_id, version)
);

-- visibilité : staff, ou membre de l'entreprise qui voit toutes les box du synoptique
create or replace function public.can_view_synoptic(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from synoptics s
    where s.id = p_id and (
      is_hexa_staff()
      or (s.company_id = current_recipient_company_id()
          and not exists (select 1 from unnest(s.device_ids) u(id) where not is_device_visible(u.id)))
    ))
$$;
revoke all on function public.can_view_synoptic(uuid) from public, anon;
grant execute on function public.can_view_synoptic(uuid) to authenticated;

-- cohérence : les box appartiennent à l'entreprise ; auteur et date d'horodatage
create or replace function public.synoptics_check() returns trigger language plpgsql set search_path = public as $$
begin
  if exists (select 1 from unnest(new.device_ids) u(id) left join devices d on d.id = u.id
             where d.id is null or d.company_id <> new.company_id) then
    raise exception 'une box n''appartient pas à l''entreprise' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then new.created_by := auth.uid(); end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function public.synoptics_check() from public, anon, authenticated;
drop trigger if exists synoptics_check on public.synoptics;
create trigger synoptics_check before insert or update on public.synoptics for each row execute function public.synoptics_check();

alter table public.synoptics enable row level security;
drop policy if exists synoptics_select on public.synoptics;
create policy synoptics_select on public.synoptics for select to authenticated using (can_view_synoptic(id));
drop policy if exists synoptics_write on public.synoptics;
create policy synoptics_write on public.synoptics for all to authenticated
  using (can_manage_company(company_id))
  with check (can_manage_company(company_id)
              and not exists (select 1 from unnest(device_ids) u(id) where not is_device_visible(u.id)));

alter table public.synoptic_versions enable row level security;
drop policy if exists synoptic_versions_select on public.synoptic_versions;
create policy synoptic_versions_select on public.synoptic_versions for select to authenticated
  using (can_view_synoptic(synoptic_id));
-- pas de policy update / delete : une version n'est jamais modifiée (suppression par cascade du synoptique)
drop policy if exists synoptic_versions_insert on public.synoptic_versions;
create policy synoptic_versions_insert on public.synoptic_versions for insert to authenticated
  with check (exists (select 1 from synoptics s where s.id = synoptic_id and can_manage_company(s.company_id)));

-- enregistrer = nouvelle version (numéro attribué côté base, ligne verrouillée contre deux enregistrements simultanés)
create or replace function public.save_synoptic_version(p_synoptic uuid, p_doc jsonb, p_source text default 'manual')
returns int language plpgsql security invoker set search_path = public as $$
declare v int;
begin
  perform 1 from synoptics where id = p_synoptic for update;
  if not found then
    raise exception 'synoptique introuvable' using errcode = '42501';
  end if;
  select coalesce(max(version), 0) + 1 into v from synoptic_versions where synoptic_id = p_synoptic;
  insert into synoptic_versions (synoptic_id, version, doc, source, created_by)
    values (p_synoptic, v, p_doc, coalesce(p_source, 'manual'), auth.uid());
  update synoptics set current_version = v where id = p_synoptic;
  return v;
end $$;
revoke all on function public.save_synoptic_version(uuid, jsonb, text) from public, anon;
grant execute on function public.save_synoptic_version(uuid, jsonb, text) to authenticated;

-- nouveau type de bloc
alter table public.dashboard_widgets drop constraint if exists dashboard_widgets_type_check;
alter table public.dashboard_widgets add constraint dashboard_widgets_type_check check (type in
  ('curve','bars','value','gauge','indicator','map','status','image','states','table','text','document',
   'alarm_history','alarm_stats','interventions','weather','synoptic'));

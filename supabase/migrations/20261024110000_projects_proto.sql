-- PROTOTYPE (myHexa-test uniquement) — projets : regroupement de box d'une même entreprise (site, machine…).
-- Hiérarchie : entreprise > projet > box. Rattachement facultatif : une box sans projet fonctionne comme avant.
-- Une box appartient à au plus un projet, de la même entreprise que la box.

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  description text,
  address text,
  latitude double precision,   -- facultatif : sinon centre des box du projet
  longitude double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, name)
);
create index if not exists projects_company_idx on public.projects (company_id);

alter table public.devices add column if not exists project_id uuid references public.projects(id) on delete set null;
create index if not exists devices_project_idx on public.devices (project_id);

-- la box et son projet doivent appartenir à la même entreprise
create or replace function public.devices_project_same_company() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.project_id is not null and not exists (
    select 1 from projects p where p.id = new.project_id and p.company_id = new.company_id) then
    raise exception 'le projet n''appartient pas à l''entreprise de la box' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists devices_project_same_company on public.devices;
create trigger devices_project_same_company before insert or update of project_id, company_id on public.devices
  for each row execute function public.devices_project_same_company();

-- droit de gérer les projets d'une entreprise : admin de cette entreprise, ou staff Hexa
create or replace function public.can_manage_company(p_company uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_hexa_staff() or exists (
    select 1 from recipients r where r.auth_user_id = auth.uid() and r.role = 'admin' and r.company_id = p_company)
$$;
grant execute on function public.can_manage_company(uuid) to authenticated;

alter table public.projects enable row level security;
drop policy if exists projects_select on public.projects;
-- visible : membres de l'entreprise, staff, ou toute personne qui voit au moins une box du projet (partage)
create policy projects_select on public.projects for select using (
  is_hexa_staff()
  or company_id = current_recipient_company_id()
  or exists (select 1 from devices d where d.project_id = projects.id and is_device_visible(d.id))
);
drop policy if exists projects_write on public.projects;
create policy projects_write on public.projects for all
  using (can_manage_company(company_id)) with check (can_manage_company(company_id));

create or replace function public.projects_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists projects_touch on public.projects;
create trigger projects_touch before update on public.projects for each row execute function public.projects_touch();

-- (dé)rattacher des box à un projet (p_project null = retirer du projet)
create or replace function public.set_devices_project(p_devices uuid[], p_project uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_company uuid; n int;
begin
  if p_project is not null then
    select company_id into v_company from projects where id = p_project;
    if v_company is null then raise exception 'projet introuvable'; end if;
  end if;
  if exists (select 1 from devices d where d.id = any(p_devices) and not can_manage_company(d.company_id)) then
    raise exception 'droits insuffisants' using errcode = '42501';
  end if;
  update devices set project_id = p_project where id = any(p_devices);
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.set_devices_project(uuid[], uuid) to authenticated;

-- synthèse par projet pour la liste et la carte (box visibles uniquement)
create or replace function public.projects_overview()
returns table (
  id uuid, company_id uuid, name text, description text, address text,
  latitude double precision, longitude double precision,
  devices int, online int, last_connection_at timestamptz, device_ids uuid[], can_manage boolean
) language sql stable security definer set search_path = public as $$
  select p.id, p.company_id, p.name, p.description, p.address,
    coalesce(p.latitude, avg(d.latitude)), coalesce(p.longitude, avg(d.longitude)),
    count(d.id)::int,
    count(d.id) filter (where d.last_connection_at > now() - interval '1 hour')::int,
    max(d.last_connection_at),
    coalesce(array_agg(d.id order by d.name) filter (where d.id is not null), '{}'),
    can_manage_company(p.company_id)
  from projects p
  left join devices d on d.project_id = p.id and is_device_visible(d.id)
  where is_hexa_staff() or p.company_id = current_recipient_company_id()
     or exists (select 1 from devices x where x.project_id = p.id and is_device_visible(x.id))
  group by p.id
  order by p.name
$$;
grant execute on function public.projects_overview() to authenticated;

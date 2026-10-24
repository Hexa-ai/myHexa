-- PROTOTYPE (myHexa-test uniquement) — tableaux de bord configurables.
-- Un tableau de bord appartient à une entreprise et a une portée : une box, un projet, ou une liste libre de box.
-- Ses blocs (widgets) sont communs au tableau de bord (en direct) et aux futurs modèles de rapport (figés).
-- Chaque bloc a une LISTE de sources {device, var} et une opération (sum, mean, min, max) pour les agrégats inter-box.

create table if not exists public.dashboards (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  scope text not null check (scope in ('device', 'project', 'custom')),
  device_id uuid references public.devices(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  device_ids uuid[] not null default '{}',     -- portée 'custom'
  period text not null default '24h',          -- période affichée par défaut : 24h, 7d, 30d, today, month…
  is_default boolean not null default false,   -- tableau de bord par défaut de la box / du projet
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((scope = 'device') = (device_id is not null)),
  check ((scope = 'project') = (project_id is not null))
);
create index if not exists dashboards_company_idx on public.dashboards (company_id);
create index if not exists dashboards_device_idx on public.dashboards (device_id);
create index if not exists dashboards_project_idx on public.dashboards (project_id);
create unique index if not exists dashboards_default_device on public.dashboards (device_id) where is_default and scope = 'device';
create unique index if not exists dashboards_default_project on public.dashboards (project_id) where is_default and scope = 'project';

create table if not exists public.dashboard_widgets (
  id uuid primary key default gen_random_uuid(),
  dashboard_id uuid not null references public.dashboards(id) on delete cascade,
  position int not null default 0,
  type text not null check (type in ('curve', 'bars', 'value', 'gauge', 'status', 'image', 'states', 'table', 'text')),
  width text not null default 'full' check (width in ('1/4', '1/3', '1/2', '2/3', 'full')),
  title text,
  sources jsonb not null default '[]',  -- [{device: uuid, var: text}]
  op text check (op in ('sum', 'mean', 'min', 'max')),  -- combinaison de plusieurs sources
  options jsonb not null default '{}',  -- stat (last/mean/min/max/total), période relative, bucket, champs de statut, url image…
  created_at timestamptz not null default now()
);
create index if not exists dashboard_widgets_dash_idx on public.dashboard_widgets (dashboard_id, position);

-- visibilité : staff, ou membre de l'entreprise qui voit toutes les box de la portée
create or replace function public.can_view_dashboard(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from dashboards d
    where d.id = p_id and (
      is_hexa_staff()
      or (d.company_id = current_recipient_company_id() and (
            (d.scope = 'device' and is_device_visible(d.device_id))
         or (d.scope = 'project' and not exists (
               select 1 from devices x where x.project_id = d.project_id and not is_device_visible(x.id)))
         or (d.scope = 'custom' and not exists (
               select 1 from unnest(d.device_ids) u(id) where not is_device_visible(u.id)))))
    ))
$$;
grant execute on function public.can_view_dashboard(uuid) to authenticated;

alter table public.dashboards enable row level security;
drop policy if exists dashboards_select on public.dashboards;
create policy dashboards_select on public.dashboards for select using (can_view_dashboard(id));
drop policy if exists dashboards_write on public.dashboards;
create policy dashboards_write on public.dashboards for all
  using (can_manage_company(company_id)) with check (can_manage_company(company_id));

alter table public.dashboard_widgets enable row level security;
drop policy if exists dashboard_widgets_select on public.dashboard_widgets;
create policy dashboard_widgets_select on public.dashboard_widgets for select using (can_view_dashboard(dashboard_id));
drop policy if exists dashboard_widgets_write on public.dashboard_widgets;
create policy dashboard_widgets_write on public.dashboard_widgets for all
  using (exists (select 1 from dashboards d where d.id = dashboard_id and can_manage_company(d.company_id)))
  with check (exists (select 1 from dashboards d where d.id = dashboard_id and can_manage_company(d.company_id)));

-- cohérence : la portée appartient à l'entreprise du tableau de bord
create or replace function public.dashboards_check() returns trigger language plpgsql set search_path = public as $$
begin
  if new.scope = 'device' and not exists (select 1 from devices where id = new.device_id and company_id = new.company_id) then
    raise exception 'la box n''appartient pas à l''entreprise' using errcode = '23514';
  end if;
  if new.scope = 'project' and not exists (select 1 from projects where id = new.project_id and company_id = new.company_id) then
    raise exception 'le projet n''appartient pas à l''entreprise' using errcode = '23514';
  end if;
  if new.scope = 'custom' and exists (select 1 from unnest(new.device_ids) u(id) left join devices d on d.id = u.id
                                       where d.id is null or d.company_id <> new.company_id) then
    raise exception 'une box n''appartient pas à l''entreprise' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists dashboards_check on public.dashboards;
create trigger dashboards_check before insert or update on public.dashboards for each row execute function public.dashboards_check();

-- enregistrement atomique des blocs d'un tableau de bord (l'éditeur envoie la liste complète)
create or replace function public.save_dashboard_widgets(p_dashboard uuid, p_widgets jsonb)
returns int language plpgsql security invoker set search_path = public as $$
declare n int;
begin
  delete from dashboard_widgets where dashboard_id = p_dashboard;
  insert into dashboard_widgets (dashboard_id, position, type, width, title, sources, op, options)
  select p_dashboard, (ord - 1)::int, w->>'type', coalesce(w->>'width', 'full'), nullif(w->>'title', ''),
         coalesce(w->'sources', '[]'), nullif(w->>'op', ''), coalesce(w->'options', '{}')
  from jsonb_array_elements(p_widgets) with ordinality as t(w, ord);
  get diagnostics n = row_count;
  update dashboards set updated_at = now() where id = p_dashboard;
  return n;
end $$;
grant execute on function public.save_dashboard_widgets(uuid, jsonb) to authenticated;

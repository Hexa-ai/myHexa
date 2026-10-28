-- Partage entre organisations (28/10/2026, MYH-010)
--
-- Étape 1 : une box partagée par une autre organisation peut être utilisée par l'organisation qui la reçoit,
--   dans SES projets (table project_devices) et SES tableaux de bord. Les tableaux appartiennent à
--   l'organisation qui les construit ; les données restent protégées par la visibilité de la box
--   (is_device_visible) : partage retiré = plus rien d'affiché, sans nettoyage.
-- Étape 2 : un tableau peut être partagé en lecture seule avec un compte d'une autre organisation
--   (table dashboard_shares). Le destinataire voit les blocs du tableau, jamais la fiche des box :
--   lecture des données via ts-read { dashboard } limitée aux box du tableau et aux variables de ses blocs.
--   Seuls les tableaux portant sur les box de l'organisation propriétaire peuvent être partagés
--   (pas de re-partage d'une box reçue).
--
-- Sécurité :
--   - écriture des nouvelles tables uniquement par des fonctions security definer qui vérifient les droits ;
--   - save_dashboard_widgets refuse une source hors du périmètre du tableau ou non visible ;
--   - dashboards : création limitée aux cibles visibles, projet de la même organisation ;
--   - partage de tableau revérifié à chaque lecture (box revendue / changée d'organisation = accès coupé).

-- ───────────────────────── Étape 1 : box partagées dans les projets ─────────────────────────
create table if not exists public.project_devices (
  project_id uuid not null references public.projects(id) on delete cascade,
  device_id uuid not null references public.devices(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (project_id, device_id),
  -- comme pour ses propres box : une box partagée est dans au plus un projet par organisation
  unique (device_id, company_id)
);
comment on table public.project_devices is
  'Box partagées par une autre organisation, rattachées à un projet de l''organisation qui les reçoit. Les box de l''organisation propriétaire restent dans devices.project_id.';
alter table public.project_devices enable row level security;
drop policy if exists project_devices_select on public.project_devices;
create policy project_devices_select on public.project_devices for select to authenticated
  using (is_hexa_staff() or company_id = current_recipient_company_id());
revoke insert, update, delete, truncate on public.project_devices from anon, authenticated;

-- box d'un projet : les siennes + les box partagées rattachées (usage interne)
create or replace function public.project_device_ids(p_project uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select d.id from devices d where d.project_id = p_project
  union
  select pd.device_id from project_devices pd join projects p on p.id = pd.project_id
   where pd.project_id = p_project and pd.company_id = p.company_id
$$;
revoke all on function public.project_device_ids(uuid) from public, anon, authenticated;

-- la box est-elle partagée à au moins un membre de l'organisation ?
create or replace function public.device_shared_with_company(p_device uuid, p_company uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from recipients r where r.company_id = p_company and p_device = any(r.shared_devices))
$$;
revoke all on function public.device_shared_with_company(uuid, uuid) from public, anon, authenticated;

-- rattacher des box à un projet (p_project null = retirer de leur projet, box de l'organisation uniquement)
create or replace function public.set_devices_project(p_devices uuid[], p_project uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_company uuid; n int := 0; d record;
begin
  if p_project is null then
    if exists (select 1 from devices x where x.id = any(p_devices) and not can_manage_company(x.company_id)) then
      raise exception 'droits insuffisants' using errcode = '42501';
    end if;
    update devices set project_id = null where id = any(p_devices);
    get diagnostics n = row_count;
    return n;
  end if;
  select company_id into v_company from projects where id = p_project;
  if v_company is null then raise exception 'projet introuvable'; end if;
  if not can_manage_company(v_company) then
    raise exception 'droits insuffisants' using errcode = '42501';
  end if;
  if exists (select 1 from unnest(p_devices) u(id) where not exists (select 1 from devices x where x.id = u.id)) then
    raise exception 'box introuvable';
  end if;
  for d in select x.id, x.company_id from devices x where x.id = any(p_devices) loop
    if d.company_id = v_company then
      update devices set project_id = p_project where id = d.id;
    elsif is_device_visible(d.id) and device_shared_with_company(d.id, v_company) then
      insert into project_devices (project_id, device_id, company_id) values (p_project, d.id, v_company)
      on conflict (device_id, company_id) do update set project_id = excluded.project_id, created_at = now();
    else
      raise exception 'droits insuffisants' using errcode = '42501';
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;
grant execute on function public.set_devices_project(uuid[], uuid) to authenticated;

-- retirer une box d'un projet donné (propre box ou box partagée)
create or replace function public.remove_device_from_project(p_device uuid, p_project uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_company uuid; n int;
begin
  select company_id into v_company from projects where id = p_project;
  if v_company is null then raise exception 'projet introuvable'; end if;
  if not can_manage_company(v_company) then
    raise exception 'droits insuffisants' using errcode = '42501';
  end if;
  update devices set project_id = null where id = p_device and project_id = p_project and company_id = v_company;
  get diagnostics n = row_count;
  if n = 0 then
    delete from project_devices where project_id = p_project and device_id = p_device;
    get diagnostics n = row_count;
  end if;
  return n;
end $$;
grant execute on function public.remove_device_from_project(uuid, uuid) to authenticated;

-- synthèse par projet : box propres + box partagées rattachées, visibles uniquement
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
  left join devices d on is_device_visible(d.id) and (
       d.project_id = p.id
    or exists (select 1 from project_devices pd where pd.project_id = p.id and pd.device_id = d.id and pd.company_id = p.company_id))
  where is_hexa_staff() or p.company_id = current_recipient_company_id()
     or exists (select 1 from devices x where x.project_id = p.id and is_device_visible(x.id))
  group by p.id
  order by p.name
$$;
grant execute on function public.projects_overview() to authenticated;

-- ───────────────────────── Périmètre d'un tableau ─────────────────────────
create or replace function public.dashboard_scope_devices(p_dashboard uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select d.device_id from dashboards d where d.id = p_dashboard and d.scope = 'device' and d.device_id is not null
  union
  select u.id from dashboards d, project_device_ids(d.project_id) u(id) where d.id = p_dashboard and d.scope = 'project'
  union
  select u.id from dashboards d, unnest(d.device_ids) u(id) where d.id = p_dashboard and d.scope = 'custom'
$$;
revoke all on function public.dashboard_scope_devices(uuid) from public, anon, authenticated;

-- tableau partageable / partage encore valable : toutes ses box appartiennent à l'organisation du tableau
create or replace function public.dashboard_share_valid(p_dashboard uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from dashboards d where d.id = p_dashboard)
     and not exists (
       select 1 from dashboards d, dashboard_scope_devices(d.id) u(id)
         left join devices x on x.id = u.id
        where d.id = p_dashboard and (x.id is null or x.company_id is distinct from d.company_id))
     and not exists (
       select 1 from dashboards d join dashboard_widgets w on w.dashboard_id = d.id,
              jsonb_array_elements(w.sources) s
         left join devices x on x.id = (s->>'device')::uuid
        where d.id = p_dashboard and (x.id is null or x.company_id is distinct from d.company_id))
$$;
revoke all on function public.dashboard_share_valid(uuid) from public, anon, authenticated;

-- ───────────────────────── Étape 2 : partage de tableaux en lecture seule ─────────────────────────
create table if not exists public.dashboard_shares (
  dashboard_id uuid not null references public.dashboards(id) on delete cascade,
  recipient_id uuid not null references public.recipients(id) on delete cascade,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (dashboard_id, recipient_id)
);
comment on table public.dashboard_shares is
  'Tableaux partagés en lecture seule avec un compte (éventuellement d''une autre organisation). Écriture par share_dashboard / unshare_dashboard uniquement.';
alter table public.dashboard_shares enable row level security;
drop policy if exists dashboard_shares_select on public.dashboard_shares;
create policy dashboard_shares_select on public.dashboard_shares for select to authenticated using (
  exists (select 1 from dashboards d where d.id = dashboard_id and can_manage_company(d.company_id))
  or exists (select 1 from recipients r where r.id = recipient_id and r.auth_user_id = auth.uid()));
revoke insert, update, delete, truncate on public.dashboard_shares from anon, authenticated;

create or replace function public.is_dashboard_shared_with_me(p_dashboard uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and exists (select 1 from dashboard_shares s join recipients r on r.id = s.recipient_id
                  where s.dashboard_id = p_dashboard and r.auth_user_id = auth.uid())
     and dashboard_share_valid(p_dashboard)
$$;
grant execute on function public.is_dashboard_shared_with_me(uuid) to authenticated;

-- visibilité d'un tableau : règle existante (box de la même organisation) + box partagées + tableaux partagés
create or replace function public.can_view_dashboard(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from dashboards d
    where d.id = p_id and (
      is_hexa_staff()
      or (d.company_id = current_recipient_company_id() and (
            (d.scope = 'device' and is_device_visible(d.device_id))
         or (d.scope = 'project' and not exists (
               select 1 from project_device_ids(d.project_id) u(id) where not is_device_visible(u.id)))
         or (d.scope = 'custom' and not exists (
               select 1 from unnest(d.device_ids) u(id) where not is_device_visible(u.id)))))
      or is_dashboard_shared_with_me(d.id)
    ))
$$;

-- création / modification : cible visible par l'auteur, projet de la même organisation
create or replace function public.dashboard_target_ok(
  p_company uuid, p_scope text, p_device uuid, p_project uuid, p_devices uuid[])
returns boolean language sql stable security definer set search_path = public as $$
  select case p_scope
    when 'device' then p_device is not null and is_device_visible(p_device)
    when 'project' then exists (select 1 from projects p where p.id = p_project and p.company_id = p_company)
    when 'custom' then not exists (select 1 from unnest(coalesce(p_devices, '{}')) u(id) where not is_device_visible(u.id))
    else false end
$$;
grant execute on function public.dashboard_target_ok(uuid, text, uuid, uuid, uuid[]) to authenticated;

drop policy if exists dashboards_write on public.dashboards;
create policy dashboards_write on public.dashboards for all
  using (can_manage_company(company_id))
  with check (can_manage_company(company_id) and dashboard_target_ok(company_id, scope, device_id, project_id, device_ids));

-- enregistrement des blocs : chaque source doit être une box du tableau, visible par l'auteur
-- dashboard_scope_devices est réservée : save_dashboard_widgets (invoker) passe par cette enveloppe
create or replace function public.dashboard_scope_devices_checked(p_dashboard uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select u from dashboard_scope_devices(p_dashboard) u where can_view_dashboard(p_dashboard)
$$;
grant execute on function public.dashboard_scope_devices_checked(uuid) to authenticated;
create or replace function public.save_dashboard_widgets(p_dashboard uuid, p_widgets jsonb)
returns int language plpgsql security invoker set search_path = public as $$
declare n int; bad int;
begin
  select count(*) into bad
    from jsonb_array_elements(coalesce(p_widgets, '[]')) w, jsonb_array_elements(coalesce(w->'sources', '[]')) s
   where (s->>'device') is null
      or (s->>'device') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or not ((s->>'device')::uuid in (select dashboard_scope_devices_checked(p_dashboard)))
      or not is_device_visible((s->>'device')::uuid);
  if bad > 0 then
    raise exception 'source hors du périmètre du tableau' using errcode = '42501';
  end if;
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

-- partager un tableau avec un compte myHexa existant (adresse mail)
create or replace function public.share_dashboard(p_dashboard uuid, p_email text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_dash dashboards; v_rec recipients; v_count int;
begin
  select * into v_dash from dashboards where id = p_dashboard;
  if v_dash.id is null then raise exception 'tableau introuvable'; end if;
  if not can_manage_company(v_dash.company_id) then
    raise exception 'droits insuffisants' using errcode = '42501';
  end if;
  if not dashboard_share_valid(p_dashboard) then
    raise exception 'seuls les tableaux portant sur les box de votre organisation peuvent être partagés' using errcode = '42501';
  end if;
  select * into v_rec from recipients
   where lower(contact_email) = lower(trim(p_email)) and auth_user_id is not null
   order by (company_id = v_dash.company_id) desc, created_at limit 1;
  if v_rec.id is null then
    raise exception 'aucun compte myHexa actif pour cette adresse' using errcode = 'P0002';
  end if;
  select count(*) into v_count from dashboard_shares where dashboard_id = p_dashboard;
  if v_count >= 50 then raise exception 'limite de 50 partages par tableau atteinte'; end if;
  insert into dashboard_shares (dashboard_id, recipient_id) values (p_dashboard, v_rec.id)
  on conflict do nothing;
  return jsonb_build_object('recipient_id', v_rec.id, 'name', v_rec.name);
end $$;
grant execute on function public.share_dashboard(uuid, text) to authenticated;

create or replace function public.unshare_dashboard(p_dashboard uuid, p_recipient uuid)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not exists (select 1 from dashboards d where d.id = p_dashboard and can_manage_company(d.company_id))
     and not exists (select 1 from recipients r where r.id = p_recipient and r.auth_user_id = auth.uid()) then
    raise exception 'droits insuffisants' using errcode = '42501';
  end if;
  delete from dashboard_shares where dashboard_id = p_dashboard and recipient_id = p_recipient;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.unshare_dashboard(uuid, uuid) to authenticated;

-- partages d'un tableau (pour ses gestionnaires)
create or replace function public.dashboard_shares_list(p_dashboard uuid)
returns table (recipient_id uuid, name text, email text, company text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.id, r.name, r.contact_email, c.name, s.created_at
    from dashboard_shares s join recipients r on r.id = s.recipient_id left join companies c on c.id = r.company_id
    join dashboards d on d.id = s.dashboard_id
   where s.dashboard_id = p_dashboard and can_manage_company(d.company_id)
   order by s.created_at
$$;
grant execute on function public.dashboard_shares_list(uuid) to authenticated;

-- tableaux partagés avec moi
create or replace function public.shared_dashboards_for_me()
returns table (id uuid, name text, company text, scope text, shared_at timestamptz)
language sql stable security definer set search_path = public as $$
  select distinct on (d.id) d.id, d.name, c.name, d.scope, s.created_at
    from dashboard_shares s join recipients r on r.id = s.recipient_id and r.auth_user_id = auth.uid()
    join dashboards d on d.id = s.dashboard_id left join companies c on c.id = d.company_id
   where dashboard_share_valid(d.id)
   order by d.id, s.created_at
$$;
grant execute on function public.shared_dashboards_for_me() to authenticated;

-- droits de lecture d'un destinataire de partage sur UNE box du tableau :
--   { vars: [...], catalog: [...], alarms: bool, alarm_names: [...] | null }  ou null (aucun droit)
create or replace function public.dashboard_read_grant(p_dashboard uuid, p_device uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with ok as (
    select 1 from dashboards d
     where d.id = p_dashboard and is_dashboard_shared_with_me(d.id)
       and p_device in (select dashboard_scope_devices(d.id))),
  src as (
    select w.type, w.options, s->>'var' as var
      from dashboard_widgets w, jsonb_array_elements(w.sources) s
     where w.dashboard_id = p_dashboard and (s->>'device')::uuid = p_device),
  v as (select distinct var from src where coalesce(var, '') <> '' and type not in ('alarm_history', 'alarm_stats')),
  al as (select * from src where type in ('alarm_history', 'alarm_stats'))
  select case when not exists (select 1 from ok) then null else jsonb_build_object(
    'vars', coalesce((select jsonb_agg(var order by var) from v), '[]'),
    'catalog', coalesce((
      select jsonb_agg(jsonb_build_object(
        'var', t.var, 'unit', t.unit, 'category', t.category, 'description', t.description,
        'first_day', t.first_day, 'last_day', t.last_day, 'days', t.days, 'fine', coalesce(t.best_res, 99999) <= 300) order by t.var)
        from ts_vars t where t.device_id = p_device and t.var in (select var from v)), '[]'),
    'alarms', exists (select 1 from al),
    'alarm_names', case
      when not exists (select 1 from al) then '[]'::jsonb
      when exists (select 1 from al where jsonb_array_length(coalesce(options->'alarms', '[]')) = 0) then null
      else (select jsonb_agg(distinct x) from al, jsonb_array_elements_text(options->'alarms') x) end
  ) end
$$;
grant execute on function public.dashboard_read_grant(uuid, uuid) to authenticated;

-- tout ce qu'il faut à l'affichage d'un tableau partagé, sans accès aux box :
--   devices : nom, dernier contact, état en direct réduit aux variables des blocs (+ champs des blocs « statut »),
--             position uniquement si la box figure dans un bloc carte ; catalogs : variables des blocs
create or replace function public.shared_dashboard_bundle(p_dashboard uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_out jsonb := '[]'; v_cat jsonb := '{}'; d record; g jsonb; v_status jsonb; v_payload jsonb;
        v_fields text[]; v_map boolean;
begin
  if not is_dashboard_shared_with_me(p_dashboard) then
    raise exception 'tableau non partagé avec vous' using errcode = '42501';
  end if;
  for d in select x.id, x.name, x.latitude, x.longitude, x.last_connection_at
             from devices x where x.id in (select dashboard_scope_devices(p_dashboard)) order by x.name loop
    g := dashboard_read_grant(p_dashboard, d.id);
    select r.payload into v_payload from reports r where r.device_id = d.id and r.type = 'status' limit 1;
    select coalesce(array_agg(distinct f), '{}') into v_fields
      from dashboard_widgets w, jsonb_array_elements(w.sources) s,
           jsonb_array_elements_text(coalesce(w.options->'fields', '["online","last_seen"]')) f
     where w.dashboard_id = p_dashboard and w.type = 'status' and (s->>'device')::uuid = d.id;
    select exists (select 1 from dashboard_widgets w, jsonb_array_elements(w.sources) s
                    where w.dashboard_id = p_dashboard and w.type = 'map' and (s->>'device')::uuid = d.id) into v_map;
    v_status := jsonb_build_object('variables', coalesce((
      select jsonb_agg(x) from jsonb_array_elements(coalesce(v_payload->'variables', '[]')) x
       where x->>'name' in (select jsonb_array_elements_text(g->'vars'))), '[]'));
    if v_fields && array['version', 'uptime', 'hostname'] then
      v_status := v_status || jsonb_build_object('device', jsonb_strip_nulls(jsonb_build_object(
        'version', case when 'version' = any(v_fields) then v_payload->'device'->'version' end,
        'uptime', case when 'uptime' = any(v_fields) then v_payload->'device'->'uptime' end,
        'hostname', case when 'hostname' = any(v_fields) then v_payload->'device'->'hostname' end)));
    end if;
    if v_fields && array['ip', 'signal'] then
      v_status := v_status || jsonb_build_object('network', (
        select coalesce(jsonb_object_agg(k, jsonb_strip_nulls(jsonb_build_object(
          'ip', case when 'ip' = any(v_fields) then n->'ip' end,
          'signal', case when 'signal' = any(v_fields) then n->'signal' end,
          'connected', n->'connected'))), '{}')
          from jsonb_each(coalesce(v_payload->'network', '{}')) e(k, n)));
    end if;
    if 'services' = any(v_fields) then
      v_status := v_status || jsonb_build_object('services', coalesce(v_payload->'services', '{}'));
    end if;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'id', d.id, 'name', d.name, 'last_connection_at', d.last_connection_at,
      'latitude', case when v_map then d.latitude end, 'longitude', case when v_map then d.longitude end,
      'status_payload', v_status));
    v_cat := v_cat || jsonb_build_object(d.id::text, coalesce(g->'catalog', '[]'));
  end loop;
  return jsonb_build_object('devices', v_out, 'catalogs', v_cat);
end $$;
grant execute on function public.shared_dashboard_bundle(uuid) to authenticated;

-- envois de rapports : un destinataire ne reçoit que les box qu'il voit lui-même
create or replace function public.recipient_sees_devices(p_recipient uuid, p_devices uuid[])
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from unnest(p_devices) u(id) join devices d on d.id = u.id, recipients r
     where r.id = p_recipient and not (
       (r.company_id = d.company_id and (r.restrict_to_devices is null or d.id = any(r.restrict_to_devices)))
       or d.id = any(coalesce(r.shared_devices, '{}'))))
$$;
revoke all on function public.recipient_sees_devices(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.recipient_sees_devices(uuid, uuid[]) to service_role;

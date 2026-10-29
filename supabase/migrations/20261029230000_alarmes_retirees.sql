-- Alarmes actives « retirées » par un administrateur.
-- Cas : une box perdue ou démontée n'envoie plus de statut ; son dernier statut garde des
-- alarmes actives indéfiniment. Un admin de l'entreprise (ou Hexa-AI) peut les retirer.
-- Le retrait ne vaut que pour le statut en cours : dès que la box renvoie un statut, c'est
-- de nouveau la box qui fait foi (si l'alarme y est toujours active, elle réapparaît).
-- Rien n'est supprimé : le statut d'origine reste intact, le retrait est tracé ici.

create table if not exists public.alarm_dismissals (
  device_id uuid not null references public.devices(id) on delete cascade,
  variable_name text not null,
  status_received_at timestamptz not null,
  dismissed_by uuid references auth.users(id) on delete set null,
  dismissed_at timestamptz not null default now(),
  primary key (device_id, variable_name)
);
alter table public.alarm_dismissals enable row level security;
drop policy if exists alarm_dismissals_read on public.alarm_dismissals;
create policy alarm_dismissals_read on public.alarm_dismissals
  for select to authenticated using (public.is_device_visible(device_id));
grant select on public.alarm_dismissals to authenticated;

-- Statut filtré : les alarmes retirées passent à false et portent "dismissed": true
create or replace function public.alarm_filter_payload(p_device uuid, p_payload jsonb, p_received timestamptz)
returns jsonb language sql stable security definer set search_path = public as $$
  select case
    when p_payload is null or jsonb_typeof(p_payload->'variables') <> 'array'
      or not exists (select 1 from alarm_dismissals x where x.device_id = p_device and x.status_received_at >= p_received)
      then p_payload
    else jsonb_set(p_payload, '{variables}', (
      select coalesce(jsonb_agg(
        case when v->>'category' = 'alarm'
               and exists (select 1 from alarm_dismissals x
                            where x.device_id = p_device and x.variable_name = v->>'name'
                              and x.status_received_at >= p_received)
             then v || jsonb_build_object('value', false, 'dismissed', true)
             else v end order by n), '[]'::jsonb)
      from jsonb_array_elements(p_payload->'variables') with ordinality t(v, n)))
  end
$$;
revoke all on function public.alarm_filter_payload(uuid, jsonb, timestamptz) from public, anon;

-- p_variable null : toutes les alarmes actives de la box
create or replace function public.dismiss_alarm(p_device uuid, p_variable text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d record; r record; n int := 0;
begin
  select id, company_id into d from devices where id = p_device;
  if d.id is null or not can_manage_company(d.company_id) then raise exception 'forbidden'; end if;
  select payload, received_at into r from reports
   where device_id = p_device and type = 'status' order by received_at desc limit 1;
  if r.received_at is null then
    return jsonb_build_object('status', 'refused', 'detail', 'aucun statut reçu de cette box');
  end if;
  insert into alarm_dismissals (device_id, variable_name, status_received_at, dismissed_by)
  select p_device, v->>'name', r.received_at, auth.uid()
    from jsonb_array_elements(coalesce(r.payload->'variables', '[]'::jsonb)) v
   where v->>'category' = 'alarm' and v->>'name' is not null
     and coalesce(v->'value', 'null'::jsonb) not in (to_jsonb(0), 'null'::jsonb, to_jsonb(false))
     and (p_variable is null or v->>'name' = p_variable)
  on conflict (device_id, variable_name) do update
    set status_received_at = excluded.status_received_at, dismissed_by = excluded.dismissed_by, dismissed_at = now();
  get diagnostics n = row_count;
  if n = 0 then
    return jsonb_build_object('status', 'refused', 'detail', 'alarme introuvable ou déjà inactive');
  end if;
  return jsonb_build_object('status', 'ok', 'count', n);
end $$;
revoke all on function public.dismiss_alarm(uuid, text) from public, anon;
grant execute on function public.dismiss_alarm(uuid, text) to authenticated;

-- Liste des box : statut filtré
create or replace function public.devices_with_latest_status()
 returns table(id uuid, company_id uuid, company_name text, name text, serial_number text, mac_eth0 text, address text, latitude numeric, longitude numeric, last_connection_at timestamp with time zone, vnc_host text, vnc_port integer, status_payload jsonb, status_received_at timestamp with time zone)
 language sql stable security definer set search_path to 'public'
as $function$
  SELECT
    d.id, d.company_id, c.name AS company_name, d.name,
    d.serial_number, d.mac_eth0, d.address, d.latitude, d.longitude,
    d.last_connection_at, d.vnc_host, d.vnc_port,
    public.alarm_filter_payload(d.id, rep.payload, rep.received_at), rep.received_at
  FROM public.devices d
  LEFT JOIN public.companies c ON c.id = d.company_id
  LEFT JOIN LATERAL (
    SELECT payload, received_at FROM public.reports
    WHERE device_id = d.id AND type = 'status'
    ORDER BY received_at DESC LIMIT 1
  ) rep ON true
  WHERE public.is_device_visible(d.id);
$function$;

-- Compteurs (badge) : alarmes retirées exclues
CREATE OR REPLACE FUNCTION public.alarm_counts(p_company_id uuid)
 RETURNS TABLE(active_alarms integer, open_signalements integer, open_interventions integer, max_severity text)
 LANGUAGE sql
 STABLE
AS $function$
  with caller_shared as (
    select coalesce(shared_devices, '{}'::uuid[]) as ids
    from public.recipients
    where auth_user_id = auth.uid()
      and (p_company_id is null or company_id = p_company_id)
    limit 1
  ),
  visible as (
    select d.id, d.company_id
    from public.devices d
    where p_company_id is null
       or d.company_id = p_company_id
       or d.id = any(coalesce((select ids from caller_shared), '{}'::uuid[]))
  ),
  latest as (
    select v.id as device_id, public.alarm_filter_payload(v.id, rep.payload, rep.received_at) as payload
    from visible v
    left join lateral (
      select payload, received_at
      from public.reports
      where device_id = v.id and type = 'status'
      order by received_at desc
      limit 1
    ) rep on true
  ),
  active_rows as (
    select lower(coalesce(v->>'type_alarm', '')) as sev
    from latest l
    cross join lateral jsonb_array_elements(coalesce(l.payload->'variables','[]'::jsonb)) v
    where v->>'category' = 'alarm'
      and coalesce(v->'value','null'::jsonb) not in (
        to_jsonb(0), 'null'::jsonb, to_jsonb(false)
      )
  ),
  sig_rows as (
    select fi.severity as sev
    from public.field_interventions fi
    join visible v on v.id = fi.device_id
    where fi.status = 'open'
      and fi.kind = 'signalement'
  ),
  intv_count as (
    select count(*)::integer as n
    from public.field_interventions fi
    join visible v on v.id = fi.device_id
    where fi.status = 'open'
      and fi.kind = 'intervention'
  ),
  all_sev as (
    select sev from active_rows
    union all
    select sev from sig_rows
  )
  select
    (select count(*)::integer from active_rows) as active_alarms,
    (select count(*)::integer from sig_rows) as open_signalements,
    (select n from intv_count) as open_interventions,
    case
      when exists (select 1 from all_sev where sev = 'error') then 'error'
      when exists (select 1 from all_sev where sev = 'warning') then 'warning'
      when exists (select 1 from all_sev where sev = 'info') then 'info'
      else null
    end as max_severity;
$function$;
grant execute on function public.alarm_filter_payload(uuid, jsonb, timestamptz) to authenticated;

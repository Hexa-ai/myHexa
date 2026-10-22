-- Ingestion des box HAI-P200 dans Supabase (remplace le workflow n8n « Ingestion », id X33NGxNIjpyUNvvS).
--
-- Trois fonctions SQL appelées UNIQUEMENT par l'Edge Function device-ingress (service_role).
-- Les requêtes reprennent celles du workflow n8n à l'identique, à une exception près
-- (rognage des rapports, cf. ingest_report).

-- 1) /provision/<hostname> : attribue un jeton à la box dont la MAC eth0 est connue
--    et qui n'a pas encore de jeton. Ne régénère jamais un jeton existant.
create or replace function public.provision_device(p_mac text, p_candidate_token text)
returns table (id uuid, name text, already_provisioned boolean, new_token text)
language sql
security definer
set search_path = public
as $$
  with mac_device as (
    select d.id, d.name, d.token as existing_token
    from devices d
    where lower(d.mac_eth0) = lower(p_mac)
    limit 1
  ), updated as (
    update devices set token = p_candidate_token
    where devices.id = (select m.id from mac_device m where m.existing_token is null)
    returning devices.id, devices.token as new_token
  )
  select m.id, m.name, m.existing_token is not null, u.new_token
  from mac_device m
  left join updated u on u.id = m.id
$$;

-- 2) /ingress/<hostname>/status : une seule ligne 'status' par box, écrasée à chaque push.
--    Renvoie l'id de la box, ou null si le jeton est inconnu (rien n'est écrit).
create or replace function public.ingest_status(p_token text, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device uuid;
begin
  select d.id into v_device from devices d where d.token = p_token limit 1;
  if v_device is null then
    return null;
  end if;

  insert into reports (device_id, type, payload, received_at)
  values (v_device, 'status', p_payload, now())
  on conflict (device_id) where type = 'status'
  do update set payload = excluded.payload, received_at = excluded.received_at;

  update devices
  set last_connection_at = now(),
      name = coalesce(p_payload -> 'device' ->> 'hostname', name)
  where id = v_device;

  return v_device;
end;
$$;

-- 3) /ingress/<hostname>/report/<daily|weekly> : upsert sur (device_id, type, period_start)
--    puis ne garde que companies.max_daily_reports / max_weekly_reports rapports.
--    Renvoie l'id du rapport (pour lancer analyze-report), ou null si rien n'a été écrit
--    (jeton inconnu, ou quota de la compagnie à 0).
--    Différence avec n8n : si la box n'a pas de quota lisible, n8n supprimait TOUS ses
--    rapports de ce type (OFFSET NULL) ; ici on ne supprime rien dans ce cas.
create or replace function public.ingest_report(
  p_token text,
  p_type report_type,
  p_payload jsonb,
  p_period_start date,
  p_period_end date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device uuid;
  v_max int;
  v_report uuid;
begin
  if p_type not in ('daily', 'weekly') then
    raise exception 'ingest_report: type % non géré', p_type;
  end if;

  select d.id into v_device from devices d where d.token = p_token limit 1;
  if v_device is null then
    return null;
  end if;

  select case p_type when 'daily' then c.max_daily_reports when 'weekly' then c.max_weekly_reports end
  into v_max
  from devices d join companies c on c.id = d.company_id
  where d.id = v_device;

  if v_max is null or v_max <= 0 then
    return null;
  end if;

  insert into reports (device_id, type, payload, received_at, period_start, period_end)
  values (v_device, p_type, p_payload, now(), p_period_start, p_period_end)
  on conflict (device_id, type, period_start) where period_start is not null
  do update set payload = excluded.payload,
                received_at = excluded.received_at,
                period_end = excluded.period_end
  returning id into v_report;

  delete from reports
  where id in (
    select r.id from reports r
    where r.device_id = v_device and r.type = p_type and r.id <> v_report
    order by r.received_at desc
    offset greatest(0, v_max - 1)
  );

  update devices
  set last_connection_at = now(),
      name = coalesce(p_payload -> 'device' ->> 'hostname', name)
  where id = v_device;

  return v_report;
end;
$$;

revoke all on function public.provision_device(text, text) from public, anon, authenticated;
revoke all on function public.ingest_status(text, jsonb) from public, anon, authenticated;
revoke all on function public.ingest_report(text, report_type, jsonb, date, date) from public, anon, authenticated;
grant execute on function public.provision_device(text, text) to service_role;
grant execute on function public.ingest_status(text, jsonb) to service_role;
grant execute on function public.ingest_report(text, report_type, jsonb, date, date) to service_role;

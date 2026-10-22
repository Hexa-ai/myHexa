-- Migration appliquée en production le 2026-05-15 (version 20260515095639), recopiée telle quelle depuis
-- supabase_migrations.schema_migrations de la prod lors du réalignement du 2026-10-22.

create or replace function public.devices_with_latest_status()
returns table (
  id uuid,
  company_id uuid,
  name text,
  serial_number text,
  mac_eth0 text,
  address text,
  latitude numeric,
  longitude numeric,
  last_connection_at timestamptz,
  status_payload jsonb,
  status_received_at timestamptz
)
language sql
security invoker
stable
as $$
  select
    d.id,
    d.company_id,
    d.name,
    d.serial_number,
    d.mac_eth0,
    d.address,
    d.latitude,
    d.longitude,
    d.last_connection_at,
    rep.payload,
    rep.received_at
  from public.devices d
  left join lateral (
    select payload, received_at
    from public.reports
    where device_id = d.id and type = 'status'
    order by received_at desc
    limit 1
  ) rep on true;
$$;

grant execute on function public.devices_with_latest_status() to anon, authenticated;

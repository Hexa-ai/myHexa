-- Migration appliquée en production le 2026-05-15 (version 20260515101847), recopiée telle quelle depuis
-- supabase_migrations.schema_migrations de la prod lors du réalignement du 2026-10-22.

alter table public.devices
  add column if not exists vnc_host text,
  add column if not exists vnc_port integer not null default 5900;

comment on column public.devices.vnc_host is 'Host (typically Tailscale IP) of the VNC server running on this device. Null disables VNC.';
comment on column public.devices.vnc_port is 'TCP port of the VNC server. Default 5900.';

drop function if exists public.devices_with_latest_status();

create function public.devices_with_latest_status()
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
  vnc_host text,
  vnc_port integer,
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
    d.vnc_host,
    d.vnc_port,
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

-- Position 4G transmise par la box.
-- La box ajoute au premier niveau de son statut (30 min) et de son rapport journalier une clé
--   "location": {latitude, longitude, accuracy_m, source:"cell", approximate:true, resolved_at}
-- (ou null / absente : rien ne change). device-ingress appelle apply_device_location, qui REMPLACE
-- les coordonnées saisies à la main (choix de Julien) ; une saisie manuelle repasse la source à
-- « manual » (trigger) jusqu'au prochain envoi de la box. La météo suit (weather_device_sites lit
-- devices.latitude/longitude).

alter table public.devices
  add column if not exists location_source text,
  add column if not exists location_accuracy_m integer,
  add column if not exists location_at timestamptz;
alter table public.devices drop constraint if exists devices_location_source_check;
alter table public.devices add constraint devices_location_source_check
  check (location_source is null or location_source in ('manual', 'box'));

-- Historique des positions transmises (pour suivre la box) : une ligne seulement si la box a
-- bougé de plus de 50 m ou si la dernière ligne a plus de 24 h.
create table if not exists public.device_locations (
  device_id uuid not null references public.devices(id) on delete cascade,
  at timestamptz not null,
  latitude numeric not null,
  longitude numeric not null,
  accuracy_m integer,
  source text not null default 'cell',
  primary key (device_id, at)
);
create index if not exists device_locations_device_at_idx on public.device_locations (device_id, at desc);
alter table public.device_locations enable row level security;
drop policy if exists device_locations_read on public.device_locations;
create policy device_locations_read on public.device_locations
  for select to authenticated using (public.is_device_visible(device_id));
revoke all on public.device_locations from public, anon, authenticated;
grant select on public.device_locations to authenticated;

-- Saisie manuelle : toute modification des coordonnées qui ne vient pas de apply_device_location
-- remet la source à « manual » (et efface précision / date de la position de la box).
create or replace function public._devices_location_manual()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('app.position_box', true), '') <> '1' then
    new.location_source := 'manual';
    new.location_accuracy_m := null;
    new.location_at := now();
  end if;
  return new;
end $$;
revoke all on function public._devices_location_manual() from public, anon, authenticated;
drop trigger if exists devices_location_manual on public.devices;
create trigger devices_location_manual
  before update of latitude, longitude on public.devices
  for each row
  when (old.latitude is distinct from new.latitude or old.longitude is distinct from new.longitude)
  execute function public._devices_location_manual();

-- Applique la position d'une box. p_loc = objet « location » du contrat ; p_at = horodatage de la
-- position (resolved_at, sinon l'heure de réception). Renvoie {applied, reason, history}.
create or replace function public.apply_device_location(p_device uuid, p_loc jsonb, p_at timestamptz default now())
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  d record; l record;
  v_lat numeric; v_lon numeric; v_acc int; v_at timestamptz;
  v_dist float8; v_hist boolean := false;
begin
  if p_loc is null or jsonb_typeof(p_loc) <> 'object' then
    return jsonb_build_object('applied', false, 'reason', 'absent');
  end if;
  if jsonb_typeof(p_loc -> 'latitude') is distinct from 'number'
     or jsonb_typeof(p_loc -> 'longitude') is distinct from 'number' then
    return jsonb_build_object('applied', false, 'reason', 'invalid');
  end if;
  v_lat := (p_loc ->> 'latitude')::numeric;
  v_lon := (p_loc ->> 'longitude')::numeric;
  if v_lat < -90 or v_lat > 90 or v_lon < -180 or v_lon > 180 or (v_lat = 0 and v_lon = 0) then
    return jsonb_build_object('applied', false, 'reason', 'invalid');
  end if;
  if jsonb_typeof(p_loc -> 'accuracy_m') = 'number' then
    v_acc := case when (p_loc ->> 'accuracy_m')::numeric between 0 and 10000000
                  then round((p_loc ->> 'accuracy_m')::numeric)::int end;
  end if;
  v_at := least(coalesce(p_at, now()), now());

  select id, location_source, location_at into d from devices where id = p_device for update;
  if d.id is null then
    return jsonb_build_object('applied', false, 'reason', 'unknown_device');
  end if;
  -- une position plus ancienne que celle déjà reçue de la box est ignorée
  if d.location_source = 'box' and d.location_at is not null and v_at < d.location_at then
    return jsonb_build_object('applied', false, 'reason', 'stale');
  end if;

  perform set_config('app.position_box', '1', true);
  update devices
     set latitude = round(v_lat, 6), longitude = round(v_lon, 6),
         location_source = 'box', location_accuracy_m = v_acc, location_at = v_at
   where id = p_device;
  perform set_config('app.position_box', '', true);

  select at, latitude, longitude into l from device_locations
   where device_id = p_device order by at desc limit 1;
  if l.at is null then
    v_hist := true;
  else
    -- distance (haversine) en mètres
    v_dist := 2 * 6371000 * asin(least(1, sqrt(
      power(sin(radians((v_lat - l.latitude)::float8) / 2), 2)
      + cos(radians(l.latitude::float8)) * cos(radians(v_lat::float8))
        * power(sin(radians((v_lon - l.longitude)::float8) / 2), 2))));
    v_hist := v_dist > 50 or v_at - l.at > interval '24 hours';
  end if;
  if v_hist then
    insert into device_locations (device_id, at, latitude, longitude, accuracy_m, source)
    values (p_device, v_at, round(v_lat, 6), round(v_lon, 6), v_acc, 'cell')
    on conflict (device_id, at) do nothing;
  end if;
  return jsonb_build_object('applied', true, 'history', v_hist);
end $$;
revoke all on function public.apply_device_location(uuid, jsonb, timestamptz) from public, anon, authenticated;

-- Liste des box : expose l'origine des coordonnées, la précision et la date de la position
drop function if exists public.devices_with_latest_status();
create function public.devices_with_latest_status()
 returns table(id uuid, company_id uuid, company_name text, name text, serial_number text, mac_eth0 text, address text, latitude numeric, longitude numeric, last_connection_at timestamp with time zone, vnc_host text, vnc_port integer, status_payload jsonb, status_received_at timestamp with time zone, location_source text, location_accuracy_m integer, location_at timestamp with time zone)
 language sql stable security definer set search_path to 'public'
as $function$
  SELECT
    d.id, d.company_id, c.name AS company_name, d.name,
    d.serial_number, d.mac_eth0, d.address, d.latitude, d.longitude,
    d.last_connection_at, d.vnc_host, d.vnc_port,
    public.alarm_filter_payload(d.id, rep.payload, rep.received_at), rep.received_at,
    d.location_source, d.location_accuracy_m, d.location_at
  FROM public.devices d
  LEFT JOIN public.companies c ON c.id = d.company_id
  LEFT JOIN LATERAL (
    SELECT payload, received_at FROM public.reports
    WHERE device_id = d.id AND type = 'status'
    ORDER BY received_at DESC LIMIT 1
  ) rep ON true
  WHERE public.is_device_visible(d.id);
$function$;
revoke all on function public.devices_with_latest_status() from public, anon;
grant execute on function public.devices_with_latest_status() to authenticated, service_role;

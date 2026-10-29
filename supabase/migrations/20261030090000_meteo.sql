-- Météo à l'adresse des box.
-- Le portail relève la météo de chaque site (coordonnées de la box, sinon de son projet, arrondies à
-- 0,01° ≈ 1 km : les box d'un même site partagent le relevé) toutes les 15 min (fonction cron-weather).
--   * weather_sites : dernier relevé + prévisions par site (pour les tuiles météo) ;
--   * les mesures sont versées dans l'historique de chaque box comme ses propres variables
--     (Meteo_Temperature, Meteo_Humidite…, catégorie « weather ») : courbes, superpositions, rapports.
-- La catégorie « weather » est ignorée par l'analyse de dérive (qui ne lit que measure / counter).

create table if not exists public.weather_sites (
  site_key text primary key,              -- "45.67,4.75"
  lat float8 not null,
  lon float8 not null,
  provider text,
  current jsonb,                          -- relevé normalisé (temp, feels, humidity, …)
  current_at timestamptz,
  forecast jsonb,                         -- [{t, temp, rain, wind, clouds, code}] sur ~5 j
  forecast_at timestamptz,
  error text,
  updated_at timestamptz not null default now()
);
alter table public.weather_sites enable row level security;
-- aucune policy : lecture par weather_for_devices (filtre de visibilité des box), écriture service role

create or replace function public.weather_site_key(p_lat float8, p_lon float8)
returns text language sql immutable as $$
  select case when p_lat is null or p_lon is null then null
    else to_char(round(p_lat::numeric, 2), 'FM990.00') || ',' || to_char(round(p_lon::numeric, 2), 'FM9990.00') end
$$;

-- box localisées et actives (vues ces 7 derniers jours), avec leur site
create or replace function public.weather_device_sites()
returns table (device_id uuid, site_key text, lat float8, lon float8)
language sql stable security definer set search_path = public as $$
  select d.id, weather_site_key(coalesce(d.latitude, p.latitude)::float8, coalesce(d.longitude, p.longitude)::float8),
         round(coalesce(d.latitude, p.latitude)::numeric, 2)::float8, round(coalesce(d.longitude, p.longitude)::numeric, 2)::float8
  from devices d left join projects p on p.id = d.project_id
  where coalesce(d.latitude, p.latitude) is not null and coalesce(d.longitude, p.longitude) is not null
    and d.last_connection_at > now() - interval '7 days'
$$;

-- relevé d'un site -> historique de chacune de ses box (tampon, catalogue, jour à reconstruire)
-- p_vals : [{var, v, unit, description}]
create or replace function public.weather_ingest(p_site text, p_ts timestamptz, p_vals jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare r record; v_tz text; v_day date; n int := 0;
begin
  for r in select s.device_id from weather_device_sites() s where s.site_key = p_site loop
    select coalesce(nullif(payload -> 'device' ->> 'timezone', ''), 'Europe/Paris') into v_tz
      from reports where device_id = r.device_id and type = 'status' order by received_at desc limit 1;
    begin
      v_day := (p_ts at time zone coalesce(v_tz, 'Europe/Paris'))::date;
    exception when others then
      v_day := (p_ts at time zone 'Europe/Paris')::date;
    end;
    insert into ts_buffer (device_id, day, var, ts, v)
    select r.device_id, v_day, x ->> 'var', p_ts, (x ->> 'v')::float8
    from jsonb_array_elements(p_vals) x where x ->> 'v' is not null
    on conflict do nothing;
    insert into ts_vars (device_id, var, category, unit, description)
    select r.device_id, x ->> 'var', 'weather', x ->> 'unit', x ->> 'description'
    from jsonb_array_elements(p_vals) x where x ->> 'v' is not null
    on conflict (device_id, var) do update
      set category = 'weather', unit = excluded.unit, description = excluded.description;
    insert into ts_dirty (device_id, day) values (r.device_id, v_day)
      on conflict (device_id, day) do update set since = now();
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.weather_device_sites(), public.weather_ingest(text, timestamptz, jsonb) from public, anon, authenticated;

-- tuiles : météo des box visibles par l'utilisateur
create or replace function public.weather_for_devices(p_ids uuid[])
returns table (device_id uuid, site_key text, current jsonb, current_at timestamptz, forecast jsonb, provider text)
language sql stable security definer set search_path = public as $$
  select d.id, w.site_key, w.current, w.current_at, w.forecast, w.provider
  from devices d
  left join projects p on p.id = d.project_id
  join weather_sites w on w.site_key = weather_site_key(coalesce(d.latitude, p.latitude)::float8, coalesce(d.longitude, p.longitude)::float8)
  where d.id = any(p_ids) and is_device_visible(d.id)
$$;
revoke all on function public.weather_for_devices(uuid[]) from public, anon;
grant execute on function public.weather_for_devices(uuid[]) to authenticated;

-- bloc « Météo » des tableaux de bord
alter table public.dashboard_widgets drop constraint if exists dashboard_widgets_type_check;
alter table public.dashboard_widgets add constraint dashboard_widgets_type_check check (type in
  ('curve','bars','value','gauge','indicator','map','status','image','states','table','text','document',
   'alarm_history','alarm_stats','interventions','weather'));

-- relevé toutes les 15 min (décalé de 2 min)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'weather';
    perform cron.schedule('weather', '2,17,32,47 * * * *', $job$
      select net.http_post(
        url := replace((select decrypted_secret from vault.decrypted_secrets where name = 'report_run_url'), '/report-run', '/cron-weather'),
        headers := jsonb_build_object('content-type', 'application/json',
          'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
        body := '{}'::jsonb, timeout_milliseconds := 120000)
    $job$);
  end if;
end $$;

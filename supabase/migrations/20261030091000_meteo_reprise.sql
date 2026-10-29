-- Météo : reprise d'un passé récent (Open-Meteo past_days, test / offre payante) en un seul appel par site.
-- p_points : [{ts, vals:[{var, v, unit, description}]}]
create or replace function public.weather_ingest_series(p_site text, p_points jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare p jsonb; n int := 0;
begin
  for p in select * from jsonb_array_elements(p_points) loop
    n := greatest(n, weather_ingest(p_site, (p ->> 'ts')::timestamptz, p -> 'vals'));
  end loop;
  return n;
end;
$$;
revoke all on function public.weather_ingest_series(text, jsonb) from public, anon, authenticated;

-- PROTOTYPE (myHexa-test) — parc : fuseau déclaré par chaque box et retard de son rapport journalier.
-- Une box réglée sur un autre fuseau que celui du site (souvent UTC) découpe sa journée autrement
-- et génère son journalier à minuit local pour la journée de la veille DANS SON FUSEAU : jusqu'à un jour de retard.
-- retard = réception - fin de la période couverte (time_range.end_ms). Normal : ~1 h.
create or replace function public.fleet_daily_health()
returns table (device_id uuid, tz text, last_day date, period_end timestamptz, received_at timestamptz, lag_hours numeric)
language sql stable security definer set search_path = public as $$
  select distinct on (r.device_id)
    r.device_id,
    r.payload->'metadata'->>'timezone',
    r.period_start::date,
    to_timestamp(((r.payload->'time_range'->>'end_ms')::numeric) / 1000),
    r.received_at,
    round((extract(epoch from r.received_at) - ((r.payload->'time_range'->>'end_ms')::numeric) / 1000) / 3600, 1)
  from reports r
  where public.is_hexa_staff()
    and r.type = 'daily'
    and r.received_at > now() - interval '30 days'
    and r.payload->'time_range'->>'end_ms' is not null
  order by r.device_id, r.received_at desc
$$;
revoke all on function public.fleet_daily_health() from public, anon;
grant execute on function public.fleet_daily_health() to authenticated;

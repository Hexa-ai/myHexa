-- Migration appliquée en production le 2026-05-15 (version 20260515132654), recopiée telle quelle depuis
-- supabase_migrations.schema_migrations de la prod lors du réalignement du 2026-10-22.

create or replace function public.alarm_history()
returns table (
  device_id uuid,
  device_name text,
  ts timestamptz,
  variable_name text,
  description text,
  type_alarm text,
  state_label text
)
language sql
security invoker
stable
as $$
  select distinct on (d.id, (evt->>'timestamp'), evt->>'name', evt->>'state_label')
    d.id as device_id,
    d.name as device_name,
    case
      when evt ? 'timestamp' and (evt->>'timestamp') ~ '^\d+$'
        then to_timestamp((evt->>'timestamp')::bigint / 1000.0)
      else null
    end as ts,
    evt->>'name' as variable_name,
    evt->>'description' as description,
    evt->>'type_alarm' as type_alarm,
    evt->>'state_label' as state_label
  from public.devices d
  join public.reports r on r.device_id = d.id
  cross join lateral jsonb_array_elements(coalesce(r.payload->'alarm_events', '[]'::jsonb)) evt
  where r.type in ('daily', 'weekly')
  order by d.id, (evt->>'timestamp'), evt->>'name', evt->>'state_label';
$$;

grant execute on function public.alarm_history() to anon, authenticated;

-- Migration appliquée en production le 2026-05-15 (version 20260515141211), recopiée telle quelle depuis
-- supabase_migrations.schema_migrations de la prod lors du réalignement du 2026-10-22.

create or replace function public.alarm_counts()
returns table (active_alarms integer, open_interventions integer)
language sql
security invoker
stable
as $$
  with latest as (
    select d.id as device_id, rep.payload
    from public.devices d
    left join lateral (
      select payload
      from public.reports
      where device_id = d.id and type = 'status'
      order by received_at desc
      limit 1
    ) rep on true
  ),
  active as (
    select count(*)::integer as n
    from latest l
    cross join lateral jsonb_array_elements(coalesce(l.payload->'variables','[]'::jsonb)) v
    where v->>'category' = 'alarm'
      and coalesce(v->'value','null'::jsonb) not in (
        to_jsonb(0), 'null'::jsonb, to_jsonb(false)
      )
  ),
  open_intv as (
    select count(*)::integer as n
    from public.field_interventions
    where status = 'open'
  )
  select active.n, open_intv.n from active, open_intv;
$$;

grant execute on function public.alarm_counts() to anon, authenticated;

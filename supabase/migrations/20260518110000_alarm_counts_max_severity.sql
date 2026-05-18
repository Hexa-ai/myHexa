-- alarm_counts : ajout de max_severity (gravité max parmi alarmes capteur + signalements ouverts).
-- Permet de colorer le chip "à traiter" en fonction de la gravité réelle plutôt qu'en rouge fixe.

DROP FUNCTION IF EXISTS public.alarm_counts();

CREATE FUNCTION public.alarm_counts()
RETURNS TABLE(
  active_alarms integer,
  open_signalements integer,
  open_interventions integer,
  max_severity text
)
LANGUAGE sql
STABLE
AS $function$
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
    select severity as sev
    from public.field_interventions
    where status = 'open' and kind = 'signalement'
  ),
  intv_count as (
    select count(*)::integer as n
    from public.field_interventions
    where status = 'open' and kind = 'intervention'
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

COMMENT ON FUNCTION public.alarm_counts() IS
  'Compteurs sidebar/header : alarmes capteur actives, signalements ouverts, interventions ouvertes, et gravité max (error/warning/info) parmi alarmes + signalements';

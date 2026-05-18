-- alarm_counts(p_company_id) : compteurs scoppés à une compagnie donnée.
-- Permet au staff de voir les compteurs de la compagnie sur laquelle il "agit",
-- pas l'agrégat global qu'autorise la RLS.

DROP FUNCTION IF EXISTS public.alarm_counts();
DROP FUNCTION IF EXISTS public.alarm_counts(uuid);

CREATE FUNCTION public.alarm_counts(p_company_id uuid)
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
    where p_company_id is null or d.company_id = p_company_id
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
    select fi.severity as sev
    from public.field_interventions fi
    join public.devices d on d.id = fi.device_id
    where fi.status = 'open'
      and fi.kind = 'signalement'
      and (p_company_id is null or d.company_id = p_company_id)
  ),
  intv_count as (
    select count(*)::integer as n
    from public.field_interventions fi
    join public.devices d on d.id = fi.device_id
    where fi.status = 'open'
      and fi.kind = 'intervention'
      and (p_company_id is null or d.company_id = p_company_id)
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

COMMENT ON FUNCTION public.alarm_counts(uuid) IS
  'Compteurs sidebar/header scoppés à une compagnie (p_company_id). Si NULL, agrège tout ce que RLS laisse voir (utile pour staff sans act-as).';

-- alarm_counts : inclut les devices partagés explicitement au caller via
-- recipients.shared_devices quand p_company_id correspond à sa compagnie native.
-- Sans ça, le badge global n'agrégeait pas les alarmes/signalements/interventions
-- des équipements partagés cross-compagnie.

CREATE OR REPLACE FUNCTION public.alarm_counts(p_company_id uuid)
 RETURNS TABLE(active_alarms integer, open_signalements integer, open_interventions integer, max_severity text)
 LANGUAGE sql
 STABLE
AS $function$
  with caller_shared as (
    select coalesce(shared_devices, '{}'::uuid[]) as ids
    from public.recipients
    where auth_user_id = auth.uid()
      and (p_company_id is null or company_id = p_company_id)
    limit 1
  ),
  visible as (
    select d.id, d.company_id
    from public.devices d
    where p_company_id is null
       or d.company_id = p_company_id
       or d.id = any(coalesce((select ids from caller_shared), '{}'::uuid[]))
  ),
  latest as (
    select v.id as device_id, rep.payload
    from visible v
    left join lateral (
      select payload
      from public.reports
      where device_id = v.id and type = 'status'
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
    select fi.severity as sev
    from public.field_interventions fi
    join visible v on v.id = fi.device_id
    where fi.status = 'open'
      and fi.kind = 'signalement'
  ),
  intv_count as (
    select count(*)::integer as n
    from public.field_interventions fi
    join visible v on v.id = fi.device_id
    where fi.status = 'open'
      and fi.kind = 'intervention'
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

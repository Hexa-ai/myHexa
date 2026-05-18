-- alarm_counts : split signalements vs interventions ouvertes.
-- Le badge sidebar / "à traiter" doit refléter l'urgence (alarmes + signalements),
-- les interventions sont des actions techniciens consignées (non urgentes).

DROP FUNCTION IF EXISTS public.alarm_counts();

CREATE FUNCTION public.alarm_counts()
RETURNS TABLE(active_alarms integer, open_signalements integer, open_interventions integer)
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
  active as (
    select count(*)::integer as n
    from latest l
    cross join lateral jsonb_array_elements(coalesce(l.payload->'variables','[]'::jsonb)) v
    where v->>'category' = 'alarm'
      and coalesce(v->'value','null'::jsonb) not in (
        to_jsonb(0), 'null'::jsonb, to_jsonb(false)
      )
  ),
  open_sig as (
    select count(*)::integer as n
    from public.field_interventions
    where status = 'open' and kind = 'signalement'
  ),
  open_intv as (
    select count(*)::integer as n
    from public.field_interventions
    where status = 'open' and kind = 'intervention'
  )
  select active.n, open_sig.n, open_intv.n from active, open_sig, open_intv;
$function$;

COMMENT ON FUNCTION public.alarm_counts() IS
  'Compteurs sidebar/header : alarmes capteur actives, signalements ouverts, interventions ouvertes';

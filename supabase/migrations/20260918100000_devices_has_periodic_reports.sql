-- devices_with_latest_status : ajoute has_periodic_reports, pour n'afficher
-- l'icône « rapports » que sur les devices qui en ont réellement remonté.
--
-- Seuls 'daily' et 'weekly' comptent : 'status' est la télémétrie, poussée par
-- tout device en service, et la vue périodique ne lit que les deux premiers.
--
-- DROP puis CREATE : Postgres refuse un CREATE OR REPLACE qui change la
-- signature de sortie d'une fonction.

DROP FUNCTION IF EXISTS public.devices_with_latest_status();

CREATE FUNCTION public.devices_with_latest_status()
 RETURNS TABLE(
   id uuid,
   company_id uuid,
   company_name text,
   name text,
   serial_number text,
   mac_eth0 text,
   address text,
   latitude numeric,
   longitude numeric,
   last_connection_at timestamp with time zone,
   vnc_host text,
   vnc_port integer,
   status_payload jsonb,
   status_received_at timestamp with time zone,
   has_periodic_reports boolean
 )
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path = public
AS $function$
  SELECT
    d.id,
    d.company_id,
    c.name AS company_name,
    d.name,
    d.serial_number,
    d.mac_eth0,
    d.address,
    d.latitude,
    d.longitude,
    d.last_connection_at,
    d.vnc_host,
    d.vnc_port,
    rep.payload,
    rep.received_at,
    EXISTS (
      SELECT 1
      FROM public.reports pr
      WHERE pr.device_id = d.id
        AND pr.type IN ('daily', 'weekly')
    ) AS has_periodic_reports
  FROM public.devices d
  LEFT JOIN public.companies c ON c.id = d.company_id
  LEFT JOIN LATERAL (
    SELECT payload, received_at
    FROM public.reports
    WHERE device_id = d.id AND type = 'status'
    ORDER BY received_at DESC
    LIMIT 1
  ) rep ON true
  WHERE public.is_device_visible(d.id);
$function$;

COMMENT ON FUNCTION public.devices_with_latest_status() IS
  'Devices visibles + dernier status. has_periodic_reports : au moins un rapport daily ou weekly, toutes périodes confondues.';

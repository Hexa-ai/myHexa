-- devices_with_latest_status : ajoute company_name (nom de la compagnie
-- propriétaire) pour afficher l'origine d'un device partagé. Passe en
-- SECURITY DEFINER avec filtrage explicite via is_device_visible() — sinon
-- la jointure sur companies est masquée par la RLS et les noms apparaissent
-- en NULL pour les devices partagés.

CREATE OR REPLACE FUNCTION public.devices_with_latest_status()
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
   status_received_at timestamp with time zone
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
    rep.received_at
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

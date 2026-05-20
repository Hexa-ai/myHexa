-- Un staff Hexa doit avoir role='admin' pour bypasser la RLS.
-- Les viewers Hexa-ai redeviennent des recipients normaux, soumis à
-- restrict_to_devices comme n'importe quel autre user.
CREATE OR REPLACE FUNCTION public.is_hexa_staff()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.recipients r
    JOIN public.companies c ON c.id = r.company_id
    WHERE r.auth_user_id = auth.uid()
      AND c.is_hexa_internal = true
      AND r.role = 'admin'
  );
$$;

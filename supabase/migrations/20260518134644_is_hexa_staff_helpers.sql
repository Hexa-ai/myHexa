-- Migration appliquée en production le 2026-05-18 (version 20260518134644), recopiée telle quelle depuis
-- supabase_migrations.schema_migrations de la prod lors du réalignement du 2026-10-22.

CREATE OR REPLACE FUNCTION public.is_hexa_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.recipients r
    JOIN public.companies c ON c.id = r.company_id
    WHERE r.auth_user_id = auth.uid()
      AND c.is_hexa_internal = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_hexa_staff_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
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

GRANT EXECUTE ON FUNCTION public.is_hexa_staff(), public.is_hexa_staff_admin() TO authenticated;

COMMENT ON FUNCTION public.is_hexa_staff() IS
  'true si le user courant a un recipient dans une compagnie is_hexa_internal=true';
COMMENT ON FUNCTION public.is_hexa_staff_admin() IS
  'true si is_hexa_staff() ET role = admin sur ce recipient';

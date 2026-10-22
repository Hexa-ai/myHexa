-- Migration appliquée en production le 2026-05-21 (version 20260521233812), recopiée telle quelle depuis
-- supabase_migrations.schema_migrations de la prod lors du réalignement du 2026-10-22.

CREATE OR REPLACE FUNCTION public.list_company_recipients(p_company_id uuid)
RETURNS SETOF public.recipients
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.*
  FROM public.recipients r
  WHERE
    (
      public.is_hexa_staff()
      OR EXISTS (
        SELECT 1 FROM public.recipients c
        WHERE c.auth_user_id = auth.uid()
          AND c.company_id = p_company_id
      )
    )
    AND (
      r.company_id = p_company_id
      OR (
        r.company_id IS NULL
        AND r.shared_devices && ARRAY(
          SELECT id FROM public.devices WHERE company_id = p_company_id
        )
      )
    )
  ORDER BY r.name;
$$;

GRANT EXECUTE ON FUNCTION public.list_company_recipients(uuid) TO authenticated;

COMMENT ON FUNCTION public.list_company_recipients(uuid) IS
  'Recipients de p_company_id + externes (company_id NULL) ayant un device partagé depuis p_company_id. Caller doit être membre de p_company_id ou staff Hexa.';

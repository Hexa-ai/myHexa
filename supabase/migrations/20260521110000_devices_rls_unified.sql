-- RLS unifiée pour le nouveau modèle d'accès (cf spec
-- docs/superpowers/specs/2026-05-20-recipients-unified-model.md).
-- Sémantique d'un device visible par un user authentifié :
--   - is_hexa_staff() = true, OU
--   - le user a un recipient r tel que :
--       (r.company_id = devices.company_id
--          ET (r.restrict_to_devices IS NULL OR device.id ∈ r.restrict_to_devices))
--       OU device.id ∈ r.shared_devices

CREATE OR REPLACE FUNCTION public.is_device_visible(d_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_hexa_staff() OR EXISTS (
      SELECT 1
      FROM public.recipients r
      JOIN public.devices d ON d.id = d_id
      WHERE r.auth_user_id = auth.uid()
      AND (
        (r.company_id = d.company_id
           AND (r.restrict_to_devices IS NULL OR d_id = ANY(r.restrict_to_devices)))
        OR d_id = ANY(r.shared_devices)
      )
    )
$$;

COMMENT ON FUNCTION public.is_device_visible(uuid) IS
  'Renvoie true si le user authentifié peut voir le device d_id (compagnie native, restriction intra, ou partage explicite).';

-- devices SELECT : refonte
DROP POLICY IF EXISTS devices_select_own_company ON public.devices;
CREATE POLICY devices_select_unified ON public.devices FOR SELECT TO authenticated
  USING (public.is_device_visible(id));

-- reports SELECT : passe par is_device_visible
DROP POLICY IF EXISTS reports_select_own_company ON public.reports;
CREATE POLICY reports_select_unified ON public.reports FOR SELECT TO authenticated
  USING (public.is_device_visible(device_id));

-- field_interventions SELECT
DROP POLICY IF EXISTS field_interventions_tenant_select ON public.field_interventions;
CREATE POLICY field_interventions_select_unified ON public.field_interventions FOR SELECT TO authenticated
  USING (public.is_device_visible(device_id));

-- connectivity_alerts SELECT : nouvelle policy alignée
DROP POLICY IF EXISTS connectivity_alerts_select ON public.connectivity_alerts;
CREATE POLICY connectivity_alerts_select_unified ON public.connectivity_alerts FOR SELECT TO authenticated
  USING (public.is_device_visible(device_id));

-- RPC : liste les destinataires d'une compagnie + les externes (company_id IS NULL)
-- qui ont au moins un device partagé depuis cette compagnie.
-- Utilisée par RecipientsView pour que les admins retrouvent les externes qu'ils
-- ont invités sans avoir à passer par chaque fiche équipement.

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
    -- Le caller doit être staff Hexa OU avoir un recipient dans p_company_id
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

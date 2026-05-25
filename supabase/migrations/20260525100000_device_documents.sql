-- Documents rattachés à un device : plans électriques, analyses fonctionnelles,
-- manuels, photos d'installation. Stockés dans le bucket privé 'device-docs'.
-- Chemin : device-docs/<device_id>/<doc_id>-<filename>

-- 1. Bucket privé
INSERT INTO storage.buckets (id, name, public)
VALUES ('device-docs', 'device-docs', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Table de métadonnées
CREATE TABLE IF NOT EXISTS public.device_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  name text NOT NULL,
  file_path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  kind text NOT NULL CHECK (kind IN ('plan_electrique','analyse_fonctionnelle','manuel','photo','autre')),
  description text,
  uploaded_by uuid REFERENCES public.recipients(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_device_documents_device_created
  ON public.device_documents (device_id, created_at DESC);

ALTER TABLE public.device_documents ENABLE ROW LEVEL SECURITY;

-- Lecture : tous ceux qui voient le device peuvent lister/télécharger les docs
DROP POLICY IF EXISTS device_documents_select_visible ON public.device_documents;
CREATE POLICY device_documents_select_visible
  ON public.device_documents FOR SELECT TO authenticated
  USING (public.is_device_visible(device_id));

-- Écriture (INSERT/DELETE) : admin de la compagnie propriétaire du device, ou staff Hexa
DROP POLICY IF EXISTS device_documents_insert_owner_admin ON public.device_documents;
CREATE POLICY device_documents_insert_owner_admin
  ON public.device_documents FOR INSERT TO authenticated
  WITH CHECK (
    public.is_hexa_staff() OR EXISTS (
      SELECT 1 FROM public.recipients r
      JOIN public.devices d ON d.company_id = r.company_id
      WHERE r.auth_user_id = auth.uid()
        AND r.role = 'admin'
        AND d.id = device_documents.device_id
    )
  );

DROP POLICY IF EXISTS device_documents_delete_owner_admin ON public.device_documents;
CREATE POLICY device_documents_delete_owner_admin
  ON public.device_documents FOR DELETE TO authenticated
  USING (
    public.is_hexa_staff() OR EXISTS (
      SELECT 1 FROM public.recipients r
      JOIN public.devices d ON d.company_id = r.company_id
      WHERE r.auth_user_id = auth.uid()
        AND r.role = 'admin'
        AND d.id = device_documents.device_id
    )
  );

-- 3. Policies sur storage.objects pour le bucket 'device-docs'
-- Le path est de la forme: <device_id>/<filename>, donc le 1er folder
-- correspond au device_id qu'on doit checker contre is_device_visible.
DROP POLICY IF EXISTS device_docs_storage_select ON storage.objects;
CREATE POLICY device_docs_storage_select
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'device-docs'
    AND public.is_device_visible(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS device_docs_storage_insert ON storage.objects;
CREATE POLICY device_docs_storage_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'device-docs'
    AND (
      public.is_hexa_staff() OR EXISTS (
        SELECT 1 FROM public.recipients r
        JOIN public.devices d ON d.company_id = r.company_id
        WHERE r.auth_user_id = auth.uid()
          AND r.role = 'admin'
          AND d.id = ((storage.foldername(name))[1])::uuid
      )
    )
  );

DROP POLICY IF EXISTS device_docs_storage_delete ON storage.objects;
CREATE POLICY device_docs_storage_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'device-docs'
    AND (
      public.is_hexa_staff() OR EXISTS (
        SELECT 1 FROM public.recipients r
        JOIN public.devices d ON d.company_id = r.company_id
        WHERE r.auth_user_id = auth.uid()
          AND r.role = 'admin'
          AND d.id = ((storage.foldername(name))[1])::uuid
      )
    )
  );

COMMENT ON TABLE public.device_documents IS
  'Documents rattachés à un device (plans électriques, analyses fonctionnelles, manuels, photos). Fichiers dans le bucket Storage device-docs, path = <device_id>/<doc_id>-<filename>.';

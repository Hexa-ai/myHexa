-- Étend device_documents avec un flag is_public, et ajoute des policies pour
-- permettre l'accès anonyme (via QR code → page /intervention?d=<device_id>)
-- aux documents marqués publics.

ALTER TABLE public.device_documents
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_device_documents_device_public
  ON public.device_documents (device_id, is_public);

-- Lecture anon : seulement les docs is_public=true
DROP POLICY IF EXISTS device_documents_select_public ON public.device_documents;
CREATE POLICY device_documents_select_public
  ON public.device_documents FOR SELECT TO anon
  USING (is_public = true);

-- Storage anon : lecture des fichiers dont le file_path correspond à un doc public
DROP POLICY IF EXISTS device_docs_storage_select_public ON storage.objects;
CREATE POLICY device_docs_storage_select_public
  ON storage.objects FOR SELECT TO anon
  USING (
    bucket_id = 'device-docs' AND EXISTS (
      SELECT 1 FROM public.device_documents d
      WHERE d.file_path = storage.objects.name AND d.is_public = true
    )
  );

COMMENT ON COLUMN public.device_documents.is_public IS
  'Si true, le document est listé et téléchargeable sur la page publique /intervention?d=<device_id> (accès via QR code sans authentification).';

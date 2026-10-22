-- Migration appliquée en production le 2026-05-25 (version 20260525053700), recopiée telle quelle depuis
-- supabase_migrations.schema_migrations de la prod lors du réalignement du 2026-10-22.

ALTER TABLE public.device_documents ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_device_documents_device_public ON public.device_documents (device_id, is_public);
DROP POLICY IF EXISTS device_documents_select_public ON public.device_documents;
CREATE POLICY device_documents_select_public ON public.device_documents FOR SELECT TO anon USING (is_public = true);
DROP POLICY IF EXISTS device_docs_storage_select_public ON storage.objects;
CREATE POLICY device_docs_storage_select_public ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'device-docs' AND EXISTS (SELECT 1 FROM public.device_documents d WHERE d.file_path = storage.objects.name AND d.is_public = true));

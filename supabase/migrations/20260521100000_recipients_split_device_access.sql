-- Refonte du modèle d'accès aux devices (cf spec
-- docs/superpowers/specs/2026-05-20-recipients-unified-model.md).
-- On splitte recipients.allowed_device_ids en deux colonnes claires :
--   - restrict_to_devices  : limite INTRA-compagnie (NULL = tous)
--   - shared_devices       : AJOUTS depuis d'autres compagnies
-- Étape additive : l'ancienne colonne reste pendant la transition. Drop à
-- l'étape 8.

ALTER TABLE public.recipients
  ADD COLUMN IF NOT EXISTS restrict_to_devices uuid[] NULL,
  ADD COLUMN IF NOT EXISTS shared_devices      uuid[] NULL;

COMMENT ON COLUMN public.recipients.restrict_to_devices IS
  'Si non-NULL : restreint la visibilité intra-compagnie à ces devices. NULL = accès à tous les devices de company_id.';
COMMENT ON COLUMN public.recipients.shared_devices IS
  'Devices d''autres compagnies partagés explicitement avec ce destinataire (additifs au périmètre de company_id).';

-- Backfill : l'ancien allowed_device_ids avait une sémantique restrictive
-- intra-compagnie, donc on le copie tel quel dans restrict_to_devices.
UPDATE public.recipients
SET restrict_to_devices = allowed_device_ids
WHERE allowed_device_ids IS NOT NULL
  AND restrict_to_devices IS NULL;

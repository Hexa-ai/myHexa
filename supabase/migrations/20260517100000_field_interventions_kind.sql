ALTER TABLE field_interventions
  ADD COLUMN kind text NOT NULL DEFAULT 'intervention'
    CHECK (kind IN ('signalement', 'intervention'));

ALTER TABLE field_interventions
  ADD COLUMN technician_phone text;

ALTER TABLE field_interventions
  ADD CONSTRAINT field_interventions_contact_present
  CHECK (
    technician_contact IS NOT NULL
    OR technician_phone IS NOT NULL
  );

CREATE INDEX IF NOT EXISTS idx_field_interventions_kind_status_created
  ON field_interventions (kind, status, created_at DESC);

COMMENT ON COLUMN field_interventions.kind IS
  'Type de saisie : signalement (anomalie remontée par tout utilisateur) ou intervention (action tech sur site)';
COMMENT ON COLUMN field_interventions.technician_phone IS
  'Téléphone de contact ; au moins technician_contact (email) OU technician_phone doit être renseigné';

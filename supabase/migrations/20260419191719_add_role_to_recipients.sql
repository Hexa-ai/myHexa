-- Add role column to recipients (viewer / admin)
-- Viewers can read the Report View page but can't edit the device address.
-- Admins have full access.

ALTER TABLE recipients
  ADD COLUMN role text NOT NULL DEFAULT 'viewer'
  CHECK (role IN ('viewer', 'admin'));

-- Pre-set existing recipients as admin (currently julien + théo, internal users)
UPDATE recipients SET role = 'admin'
WHERE contact_email IN ('julien.talbourdet@hexa-ai.fr', 'theo.sere@hexa-ai.fr');

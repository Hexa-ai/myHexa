-- Add alert state tracking columns to devices for the Connectivity Alerts workflow.
-- alert_state: last computed connectivity state (online / offline / unknown).
-- alert_state_changed_at: when alert_state last changed.
-- The workflow only sends a notification on state transitions, so persisting
-- the previous state in DB prevents repeated notifications while still offline.

ALTER TABLE devices
  ADD COLUMN alert_state text NOT NULL DEFAULT 'unknown'
  CHECK (alert_state IN ('online', 'offline', 'unknown'));

ALTER TABLE devices
  ADD COLUMN alert_state_changed_at timestamptz;

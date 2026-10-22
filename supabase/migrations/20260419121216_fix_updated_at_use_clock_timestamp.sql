-- Migration appliquée en production le 2026-04-19 (version 20260419121216), recopiée telle quelle depuis
-- supabase_migrations.schema_migrations de la prod lors du réalignement du 2026-10-22.

-- Fix: use clock_timestamp() instead of now() in updated_at trigger function.
-- Rationale: now() = transaction_timestamp(), constant within a transaction.
-- clock_timestamp() gives the wall-clock time at the moment of the trigger,
-- which is what "updated_at" should reflect (especially for bulk updates where
-- each row should get its own timestamp).

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = clock_timestamp();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

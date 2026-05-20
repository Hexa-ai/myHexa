-- Per-company control of the recurring status email (replicates the n8n
-- "Daily Status Email" workflow, now triggered by a single daily Supabase
-- cron that decides each morning which companies to include).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status_email_frequency') THEN
    CREATE TYPE status_email_frequency AS ENUM ('none', 'daily', 'weekly');
  END IF;
END$$;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS status_email_frequency status_email_frequency NOT NULL DEFAULT 'weekly';

COMMENT ON COLUMN public.companies.status_email_frequency IS
  'Cadence du résumé status envoyé aux destinataires : none (jamais), daily (chaque matin 7h), weekly (mardi 7h).';

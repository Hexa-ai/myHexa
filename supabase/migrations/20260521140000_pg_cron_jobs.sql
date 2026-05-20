-- Active pg_cron + pg_net et programme les 2 jobs des Edge Functions.
-- Le CRON_SECRET est lu depuis Supabase Vault (entrée 'cron_secret').
--
-- Le user doit configurer la valeur du secret une fois après la migration :
--   SELECT vault.update_secret(
--     (SELECT id FROM vault.secrets WHERE name = 'cron_secret'),
--     '<TON_CRON_SECRET>'
--   );

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Placeholder secret (à updater côté user, cf bloc ci-dessus)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'cron_secret') THEN
    PERFORM vault.create_secret(
      'TO_BE_SET_BY_USER',
      'cron_secret',
      'Secret partagé entre pg_cron et les Edge Functions (header x-cron-secret)'
    );
  END IF;
END$$;

-- cron-connectivity-alerts toutes les 15 min
SELECT cron.schedule(
  'cron-connectivity-alerts',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://mlbezfyjbnjyogogqmem.supabase.co/functions/v1/cron-connectivity-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- cron-status-email tous les jours à 5h UTC (la fonction filtre côté code
-- selon companies.status_email_frequency et le jour de la semaine en Paris)
SELECT cron.schedule(
  'cron-status-email',
  '0 5 * * *',
  $$
  SELECT net.http_post(
    url := 'https://mlbezfyjbnjyogogqmem.supabase.co/functions/v1/cron-status-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

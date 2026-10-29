-- Mise en service : alertes de perte de liaison toutes les 15 min (remplace le workflow n8n
-- « Connectivity Alerts »), et droits des fonctions de versions.
revoke all on function public.fw_newer_release(text) from public, anon;
grant execute on function public.fw_newer_release(text) to authenticated;
revoke all on function public.devices_clean_candidate() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'cron-connectivity-alerts';
    perform cron.schedule('cron-connectivity-alerts', '*/15 * * * *', $job$
      select net.http_post(
        url := replace((select decrypted_secret from vault.decrypted_secrets where name = 'report_run_url'), '/report-run', '/cron-connectivity-alerts'),
        headers := jsonb_build_object('content-type', 'application/json',
          'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
        body := '{}'::jsonb, timeout_milliseconds := 120000)
    $job$);
  end if;
end $$;

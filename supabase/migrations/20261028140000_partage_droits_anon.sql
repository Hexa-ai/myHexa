-- MYH-010 : fonctions du partage réservées aux comptes connectés (PostgreSQL accorde EXECUTE à PUBLIC par défaut)
do $$
declare f text;
begin
  foreach f in array array[
    'public.share_dashboard(uuid, text)', 'public.unshare_dashboard(uuid, uuid)',
    'public.dashboard_shares_list(uuid)', 'public.shared_dashboards_for_me()',
    'public.dashboard_read_grant(uuid, uuid)', 'public.shared_dashboard_bundle(uuid)',
    'public.is_dashboard_shared_with_me(uuid)', 'public.document_shared_with_me(uuid)',
    'public.dashboard_target_ok(uuid, text, uuid, uuid, uuid[])', 'public.dashboard_scope_devices_checked(uuid)',
    'public.set_devices_project(uuid[], uuid)', 'public.remove_device_from_project(uuid, uuid)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

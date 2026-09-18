-- Tests pour devices_with_latest_status().has_periodic_reports
-- Exécution : psql "$DATABASE_URL" -f supabase/tests/devices_has_periodic_reports.sql
-- Tout se joue dans une transaction annulée à la fin : aucune donnée ne subsiste.
--
-- La fonction filtre par is_device_visible(), qui lit auth.uid(). On simule donc
-- un utilisateur authentifié via request.jwt.claims, sinon la fonction ne
-- renverrait aucune ligne et les assertions passeraient à vide.

begin;

do $f$
declare
  v_user     uuid := gen_random_uuid();
  v_company  uuid := gen_random_uuid();
  v_dev_daily   uuid := gen_random_uuid();
  v_dev_weekly  uuid := gen_random_uuid();
  v_dev_status  uuid := gen_random_uuid();
  v_dev_empty   uuid := gen_random_uuid();
  v_flag boolean;
  v_rows int;
begin
  -- Fixtures. auth.users d'abord : le trigger on_auth_user_created cherche un
  -- recipient à rattacher par email et n'en trouve aucun, donc il ne fait rien.
  insert into auth.users (id, email) values (v_user, 'test-hpr@example.invalid');
  insert into companies (id, name) values (v_company, 'Test HPR');
  insert into recipients (company_id, name, contact_email, role, auth_user_id)
    values (v_company, 'Test HPR', 'test-hpr@example.invalid', 'admin', v_user);

  insert into devices (id, company_id, name) values
    (v_dev_daily,  v_company, 'dev-daily'),
    (v_dev_weekly, v_company, 'dev-weekly'),
    (v_dev_status, v_company, 'dev-status-only'),
    (v_dev_empty,  v_company, 'dev-empty');

  insert into reports (device_id, type, payload) values
    (v_dev_daily,  'daily',  '{"variables":[]}'::jsonb),
    (v_dev_daily,  'status', '{"variables":[]}'::jsonb),
    (v_dev_weekly, 'weekly', '{"variables":[]}'::jsonb),
    (v_dev_status, 'status', '{"variables":[]}'::jsonb);

  perform set_config('request.jwt.claims', json_build_object('sub', v_user)::text, true);

  -- Garde-fou : sans lignes visibles, les assertions suivantes seraient vides
  -- et le test passerait pour de mauvaises raisons.
  select count(*) into v_rows from devices_with_latest_status();
  assert v_rows = 4, format('T0 FAIL: attendu 4 devices visibles, obtenu %s', v_rows);
  raise notice 'T0 OK: % devices visibles', v_rows;

  -- T1 : un rapport daily → true
  select has_periodic_reports into v_flag
    from devices_with_latest_status() where id = v_dev_daily;
  assert v_flag, 'T1 FAIL: daily devrait donner true';
  raise notice 'T1 OK: daily → true';

  -- T2 : un rapport weekly → true
  select has_periodic_reports into v_flag
    from devices_with_latest_status() where id = v_dev_weekly;
  assert v_flag, 'T2 FAIL: weekly devrait donner true';
  raise notice 'T2 OK: weekly → true';

  -- T3 : uniquement des status → false. C'est le cas qui motive la feature :
  -- tout device qui pousse sa télémétrie a des rapports 'status', et ça ne doit
  -- pas suffire à afficher l'icône.
  select has_periodic_reports into v_flag
    from devices_with_latest_status() where id = v_dev_status;
  assert not v_flag, 'T3 FAIL: status seul devrait donner false';
  raise notice 'T3 OK: status seul → false';

  -- T4 : aucun rapport → false
  select has_periodic_reports into v_flag
    from devices_with_latest_status() where id = v_dev_empty;
  assert not v_flag, 'T4 FAIL: aucun rapport devrait donner false';
  raise notice 'T4 OK: aucun rapport → false';

  raise notice 'TOUS LES TESTS OK';
end
$f$;

rollback;

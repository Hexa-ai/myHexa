-- Tests pour compute_derived_variables (intégration trapézoïdale)
-- Exécution : psql "$DATABASE_URL" -f supabase/tests/derived_integrals.sql
-- ou via MCP execute_sql, par bloc DO. Échoue à la première assertion violée.

do $f$
declare
  r jsonb; s numeric;
  t0 bigint := (extract(epoch from timestamptz '2026-01-01 00:00:00+00')*1000)::bigint;
begin
  -- T1 : 24h constant 3 m³/h (1 pt/5min) → 72 m³
  r := compute_derived_variables(
    jsonb_build_object('variables', jsonb_build_array(jsonb_build_object(
      'name','Debit_eau','category','measure','unit','m³/h',
      'chart', jsonb_build_object('type','line','points',(
        select jsonb_agg(jsonb_build_object('ts', t0 + i*300000, 'value', 3) order by i)
        from generate_series(0,288) i
      ))
    ))),
    '2026-01-01'::date, '2026-01-02'::date, 'daily', 'UTC'
  );
  s := (r->'variables'->0->'stats'->>'last')::numeric;
  assert abs(s - 72) < 0.5, format('T1 FAIL: expected ~72, got %s', s);
  raise notice 'T1 OK: last=%', s;

  -- T2 : rampe 0→6 m³/h sur 1h (1 pt/min) → 3 m³
  r := compute_derived_variables(
    jsonb_build_object('variables', jsonb_build_array(jsonb_build_object(
      'name','Debit','category','measure','unit','m3/h',
      'chart', jsonb_build_object('type','line','points',(
        select jsonb_agg(jsonb_build_object('ts', t0 + i*60000, 'value', 6.0*i/60.0) order by i)
        from generate_series(0,60) i
      ))))),
    '2026-01-01'::date, '2026-01-02'::date, 'daily', 'UTC'
  );
  s := (r->'variables'->0->'stats'->>'last')::numeric;
  assert abs(s - 3) < 0.05, format('T2 FAIL: got %s', s);
  raise notice 'T2 OK: last=%', s;

  -- T3 : sample négatif → clamp à 0
  r := compute_derived_variables(
    jsonb_build_object('variables', jsonb_build_array(jsonb_build_object(
      'name','Debit','category','measure','unit','m³/h',
      'chart', jsonb_build_object('type','line','points', jsonb_build_array(
        jsonb_build_object('ts', t0,           'value', 3),
        jsonb_build_object('ts', t0 + 300000,  'value', -100),
        jsonb_build_object('ts', t0 + 600000,  'value', 3)
      ))))),
    '2026-01-01'::date, '2026-01-02'::date, 'daily', 'UTC'
  );
  s := (r->'variables'->0->'stats'->>'last')::numeric;
  assert abs(s - 0.25) < 0.01, format('T3 FAIL: got %s', s);
  raise notice 'T3 OK: last=%', s;

  -- T4 : unité non whitelistée → ignorée
  r := compute_derived_variables(
    jsonb_build_object('variables', jsonb_build_array(jsonb_build_object(
      'name','Temp','category','measure','unit','°C',
      'chart', jsonb_build_object('type','line','points', jsonb_build_array(
        jsonb_build_object('ts', t0,'value',20),
        jsonb_build_object('ts', t0+60000,'value',22)
      ))))),
    '2026-01-01'::date, '2026-01-02'::date, 'daily', 'UTC'
  );
  assert jsonb_array_length(r->'variables') = 0, 'T4 FAIL';
  raise notice 'T4 OK';

  -- T5 : 1 seul sample → ignorée
  r := compute_derived_variables(
    jsonb_build_object('variables', jsonb_build_array(jsonb_build_object(
      'name','Debit','category','measure','unit','m³/h',
      'chart', jsonb_build_object('type','line','points', jsonb_build_array(
        jsonb_build_object('ts', t0, 'value', 5)
      ))))),
    '2026-01-01'::date, '2026-01-02'::date, 'daily', 'UTC'
  );
  assert jsonb_array_length(r->'variables') = 0, 'T5 FAIL';
  raise notice 'T5 OK';

  -- T6 : 10 L/min sur 60 min → 600 L (Debit_pompe → Volume_pompe)
  r := compute_derived_variables(
    jsonb_build_object('variables', jsonb_build_array(jsonb_build_object(
      'name','Debit_pompe','category','measure','unit','L/min',
      'chart', jsonb_build_object('type','line','points',(
        select jsonb_agg(jsonb_build_object('ts', t0 + i*60000, 'value', 10) order by i)
        from generate_series(0,60) i
      ))))),
    '2026-01-01'::date, '2026-01-02'::date, 'daily', 'UTC'
  );
  s := (r->'variables'->0->'stats'->>'last')::numeric;
  assert abs(s - 600) < 1, format('T6 FAIL: got %s', s);
  assert r->'variables'->0->>'name' = 'Volume_pompe', format('T6 FAIL name: got %s', r->'variables'->0->>'name');
  raise notice 'T6 OK: last=% name=%', s, r->'variables'->0->>'name';

  -- T7 : collision sur nom dérivé → skip
  r := compute_derived_variables(
    jsonb_build_object('variables', jsonb_build_array(
      jsonb_build_object('name','Volume_eau','category','counter','unit','m³',
        'chart', jsonb_build_object('type','bar','points', jsonb_build_array(
          jsonb_build_object('ts', t0, 'value', 1)))),
      jsonb_build_object('name','Debit_eau','category','measure','unit','m³/h',
        'chart', jsonb_build_object('type','line','points', jsonb_build_array(
          jsonb_build_object('ts', t0,           'value', 3),
          jsonb_build_object('ts', t0 + 300000,  'value', 3))))
    )),
    '2026-01-01'::date, '2026-01-02'::date, 'daily', 'UTC'
  );
  assert jsonb_array_length(r->'variables') = 0, format('T7 FAIL: got %s', r);
  raise notice 'T7 OK';

  -- T8 : puissance kW → Energie kWh
  r := compute_derived_variables(
    jsonb_build_object('variables', jsonb_build_array(jsonb_build_object(
      'name','Puissance_compresseur','category','measure','unit','kW',
      'chart', jsonb_build_object('type','line','points',(
        select jsonb_agg(jsonb_build_object('ts', t0 + i*300000, 'value', 10) order by i)
        from generate_series(0,288) i
      ))))),
    '2026-01-01'::date, '2026-01-02'::date, 'daily', 'UTC'
  );
  s := (r->'variables'->0->'stats'->>'last')::numeric;
  -- 10 kW × 24 h = 240 kWh
  assert abs(s - 240) < 1, format('T8 FAIL: got %s', s);
  assert r->'variables'->0->>'unit' = 'kWh', format('T8 FAIL unit: got %s', r->'variables'->0->>'unit');
  assert r->'variables'->0->>'name' = 'Energie_compresseur', format('T8 FAIL name: got %s', r->'variables'->0->>'name');
  raise notice 'T8 OK: last=% kWh', s;

  raise notice 'All tests passed.';
end
$f$;

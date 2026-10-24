#!/usr/bin/env python3
"""Tests d'intégration de l'historique Parquet (ts-build / ts-read) sur myHexa-TEST. Box factice e2e1. Jamais la prod."""
import json, os, sys, time, urllib.request
REF = "mtwqkfbbtjlntkhfojai"
URL = f"https://{REF}.supabase.co"
D1 = "00000000-0000-0000-0000-00000000e2e1"
DAY = 86400000
env = dict(l.strip().split('=', 1) for l in open(os.path.expanduser('~/.hermes/.env')) if '=' in l and not l.startswith('#'))
TOK = env['SUPABASE_ACCESS_TOKEN'].strip()
CRON = env['MYHEXA_TEST_CRON_SECRET'].strip().strip('"')

def http(url, data=None, headers=None, method=None):
    r = urllib.request.Request(url, data=json.dumps(data).encode() if data is not None else None,
        headers={'Content-Type': 'application/json', 'User-Agent': 'h', **(headers or {})}, method=method)
    try:
        resp = urllib.request.urlopen(r, timeout=150)
        return resp.status, json.loads(resp.read() or b'null')
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        try: return e.code, json.loads(body)
        except Exception: return e.code, body
def sql(q):
    return http(f'https://api.supabase.com/v1/projects/{REF}/database/query', {'query': q}, {'Authorization': 'Bearer ' + TOK})[1]
keys = http(f"https://api.supabase.com/v1/projects/{REF}/api-keys?reveal=true", headers={'Authorization': 'Bearer ' + TOK})[1]
ANON = next(k['api_key'] for k in keys if k['name'] == 'anon')
SR = next(k['api_key'] for k in keys if k['name'] == 'service_role')
_, sess = http(f"{URL}/auth/v1/token?grant_type=password", {'email': env['MYHEXA_TEST_E2E_EMAIL'].strip(), 'password': env['MYHEXA_TEST_E2E_PASSWORD'].strip()}, {'apikey': ANON})
JWT = sess['access_token']

ok = ko = 0
def check(name, cond, info=None):
    global ok, ko
    if cond: ok += 1; print("  OK  ", name)
    else: ko += 1; print("  ÉCHEC", name, json.dumps(info, ensure_ascii=False)[:400] if info is not None else "")

def build():
    return http(f"{URL}/functions/v1/ts-build", {'device': D1, 'limit': 50}, {'x-cron-secret': CRON})
def read(vars_, a, b, jwt=JWT):
    h = {'apikey': ANON}
    if jwt: h['Authorization'] = 'Bearer ' + jwt
    st, r = http(f"{URL}/functions/v1/ts-read", {'device': D1, 'vars': vars_, 'from': a, 'to': b}, h)
    d = r.get('data', {}) if isinstance(r, dict) else {}
    return st, d, {x['var']: x for x in d.get('series', [])}
def info(d):
    return {k: d.get(k) for k in ('level', 'files', 'bucket_s', 'ms')}
def cleanup():
    names = [r['name'] for r in sql(f"select name from storage.objects where bucket_id='ts-archive' and name like '%device={D1}%'")]
    if names:
        http(f"{URL}/storage/v1/object/ts-archive", {'prefixes': names}, {'Authorization': 'Bearer ' + SR, 'apikey': SR}, 'DELETE')
    sql(f"delete from ts_files where device_id='{D1}'; delete from ts_vars where device_id='{D1}'; delete from ts_buffer where device_id='{D1}'; delete from ts_dirty where device_id='{D1}'; delete from reports where device_id='{D1}' and type::text in ('daily','weekly')")

cleanup()
tok = sql(f"select token from devices where id='{D1}'")[0]['token']
co = sql(f"select c.id, c.max_daily_reports m from companies c join devices d on d.company_id=c.id where d.id='{D1}'")[0]
sql(f"update companies set max_daily_reports=greatest(coalesce(max_daily_reports,0),3) where id='{co['id']}'")

print("aucune série temporelle en base")
check("pas de table de séries (ts_series supprimée)", sql("select count(*) n from information_schema.tables where table_name='ts_series'")[0]['n'] == 0)

T0 = 1792620000000  # 2026-10-22 00:00 Europe/Paris
daily = {"metadata": {"timezone": "Europe/Paris"}, "time_range": {"start_ms": T0, "end_ms": T0 + DAY}, "variables": [
    {"name": "TEMP", "category": "measure", "unit": "°C", "stats": {"min": 0, "max": 287, "mean": 143.5},
     "chart": {"type": "line", "points": [{"ts": T0 + i * 300000, "value": float(i)} for i in range(288)]}},
    {"name": "CPT", "category": "counter", "unit": "m3", "stats": {"min": 2, "max": 2, "mean": 2},
     "chart": {"type": "bar", "points": [{"ts": T0 + h * 3600000, "value": 2} for h in range(24)]}},
    {"name": "NIV", "category": "measure", "unit": "m", "stats": {"min": 1.5, "max": 3.5, "mean": 2.25}, "chart": {"type": "line", "points": []}},
    {"name": "POS", "category": "position", "chart": {"type": "map", "points": [{"ts": T0, "lat": 45, "lon": 4}]}},
]}
daily["variables"].append({"name": "Debit_EAU", "category": "measure", "unit": "m3/h", "stats": {"min": 6, "max": 6, "mean": 6},
     "chart": {"type": "line", "points": [{"ts": T0 + i * 300000, "value": 6.0} for i in range(288)]}})
body = json.dumps(daily).replace("'", "''")
r = sql(f"select ingest_report('{tok}', 'daily', '{body}'::jsonb, '2026-10-22', '2026-10-23') id")
check("rapport journalier ingéré", isinstance(r, list) and r[0]['id'], r)
time.sleep(5)  # construction immédiate déclenchée par pg_net
imm = sql(f"select count(*) n from ts_files where device_id='{D1}'")[0]['n']
check("construction immédiate à l'arrivée du rapport (pg_net)", imm >= 4, imm)
st, b = build()
check("ts-build répond sans échec", st == 200 and not b.get('failed'), b)
files = {(f['level'], f['period']): f for f in sql(f"select level, period, path, rows, bytes from ts_files where device_id='{D1}'")}
print("  fichiers :", sorted(files))
check("4 fichiers : brut du jour, semaine 1 min, mois 1 h, année 1 jour",
      {('raw', '2026-10-22'), ('1m', '2026-W43'), ('1h', '2026-10'), ('1d', '2026')} <= set(files), sorted(files))
check("chemin partitionné par entreprise / box / année / mois",
      files.get(('raw', '2026-10-22'), {}).get('path', '') == f"raw/company={co['id']}/device={D1}/year=2026/month=10/2026-10-22.parquet", files.get(('raw', '2026-10-22')))
check("marque retirée après construction", sql(f"select count(*) n from ts_dirty where device_id='{D1}'")[0]['n'] == 0)
cat = {v['var']: v for v in sql(f"select var, category, best_res, first_day from ts_vars where device_id='{D1}'")}
check("catalogue : TEMP courbe 5 min, CPT compteur, position ignorée",
      cat.get('TEMP', {}).get('best_res') == 300 and cat.get('CPT', {}).get('category') == 'counter' and 'POS' not in cat, cat)

print("volumes intégrés (derived_payload)")
dv = sql(f"select v->>'name' n, v->>'unit' u from reports r, jsonb_array_elements(r.derived_payload->'variables') v where r.device_id='{D1}' and r.type::text='daily'")
check("la base a dérivé Volume_EAU", any(x['n'] == 'Volume_EAU' for x in dv), dv)
check("Volume_EAU au catalogue, compteur", cat.get('Volume_EAU', {}).get('category') == 'counter', cat.get('Volume_EAU'))
st, d, s = read(['Volume_EAU'], T0 - DAY, T0 + 2 * DAY)
p = s.get('Volume_EAU', {}).get('points', [])
check("3 jours : Volume_EAU en barres horaires ≈ 6 m3", len(p) >= 23 and abs(p[1][1] - 6) < 0.1 and p[1][0] - p[0][0] == 3600000, p[:3])
st, d, s = read(['Volume_EAU'], T0 - 29 * DAY, T0 + DAY)
p = s.get('Volume_EAU', {}).get('points', [])
check("30 jours : Volume_EAU en barres journalières calées sur minuit local ≈ 144 m3", len(p) == 1 and p[0][0] == T0 and abs(p[0][1] - 144) < 1, p[:3])
st, d, s = read(['Volume_EAU'], T0 - 300 * DAY, T0 + DAY)
p = s.get('Volume_EAU', {}).get('points', [])
check("Volume_EAU 1 jour ≈ 144 m3 (somme, pas moyenne)", p and abs(p[0][1] - 144) < 1, p[:2])

print("lecture ts-read")
st, d, s = read(['TEMP', 'CPT', 'NIV'], T0, T0 + DAY)
check("1 jour -> brut, 1 fichier", st == 200 and d.get('level') == 'raw' and d.get('files') == 1, info(d))
check("TEMP : 288 points bruts, 1er = [t0, 0, 0, 0]", len(s.get('TEMP', {}).get('points', [])) == 288 and s['TEMP']['points'][0] == [T0, 0, 0, 0], s.get('TEMP', {}).get('points', [])[:2])
check("NIV sans courbe : stats du jour", s.get('NIV', {}).get('points') == [[T0, 2.25, 1.5, 3.5]], s.get('NIV'))
st, d, s = read(['NIV'], T0, T0 + DAY)
check("seule la variable demandée est renvoyée", list(s) == ['NIV'], list(s))
st, d, s = read(['TEMP'], T0 - 5 * DAY, T0 + 2 * DAY)
check("7 jours -> agrégat 1 min (fichiers semaine)", d.get('level') == '1m' and d.get('files') >= 1, info(d))
st, d, s = read(['TEMP', 'CPT'], T0 - 29 * DAY, T0 + DAY)
check("30 jours -> agrégat 1 h (fichiers mois), cases d'1 h", d.get('level') == '1h' and d.get('bucket_s') == 3600, info(d))
p = s.get('TEMP', {}).get('points', [])
check("TEMP 1re heure : moy 5.5, min 0, max 11", p and p[0] == [T0, 5.5, 0, 11], p[:1])
check("compteur sur 30 j : total du jour 48 (barres journalières)", s.get('CPT', {}).get('points', [[0, 0]])[0][1:2] == [48], s.get('CPT', {}).get('points', [])[:2])
st, d, s = read(['TEMP', 'CPT', 'NIV'], T0 - 300 * DAY, T0 + DAY)
check("10 mois -> agrégat 1 jour (fichier année)", d.get('level') == '1d', info(d))
check("1 jour TEMP = stats du rapport", s.get('TEMP', {}).get('points', [[0]])[0][1:] == [143.5, 0, 287], s.get('TEMP'))
check("1 jour CPT = somme 48", s.get('CPT', {}).get('points', [[0, 0]])[0][1] == 48, s.get('CPT'))
check("1 jour NIV = stats", s.get('NIV', {}).get('points', [[0]])[0][1:] == [2.25, 1.5, 3.5], s.get('NIV'))

print("statuts 30 min -> tampon -> Parquet")
def status(ts, temp):
    b = json.dumps({"timestamp": ts, "device": {"timezone": "Europe/Paris"}, "variables": [
        {"name": "TEMP", "category": "measure", "value": temp}, {"name": "PRESS", "category": "measure", "unit": "bar", "value": "1.5"},
        {"name": "LIB", "category": "measure", "value": "texte"}]}).replace("'", "''")
    return sql(f"select ingest_status('{tok}', '{b}'::jsonb) id")
status("2026-10-24T10:00:00+02:00", 20); status("2026-10-24T10:30:00+02:00", 30); status("2026-10-24T10:30:00+02:00", 30)
n_temp = sql(f"select count(*) n from ts_buffer where device_id='{D1}' and var='TEMP'")[0]['n']
n_lib = sql(f"select count(*) n from ts_buffer where device_id='{D1}' and var='LIB'")[0]['n']
check("tampon : 2 instants (doublon ignoré), texte ignoré", n_temp == 2 and n_lib == 0, (n_temp, n_lib))
build()
st, d, s = read(['TEMP', 'PRESS'], T0 + 2 * DAY, T0 + 3 * DAY)
check("statuts lus dans le brut du 24/10", [p[1] for p in s.get('TEMP', {}).get('points', [])] == [20, 30] and 'statut 30 min' in s.get('TEMP', {}).get('sources', []), s.get('TEMP'))
check("PRESS (texte numérique) converti", [p[1] for p in s.get('PRESS', {}).get('points', [])] == [1.5, 1.5], s.get('PRESS'))

print("rapport purgé : le Parquet garde l'historique")
sql(f"delete from reports where device_id='{D1}' and type::text='daily'; insert into ts_dirty (device_id, day) values ('{D1}', '2026-10-22')")
build()
st, d, s = read(['TEMP'], T0, T0 + DAY)
check("TEMP toujours là après purge du rapport et reconstruction", len(s.get('TEMP', {}).get('points', [])) == 288, info(d))

print("droits")
st, d, s = read(['TEMP'], T0, T0 + DAY, jwt=None)
check("sans connexion : refusé", st in (401, 403), st)
other = sql(f"""select r.auth_user_id u from recipients r join companies c on c.id=r.company_id where r.auth_user_id is not null
  and c.id <> '{co['id']}' and not c.is_hexa_internal
  and not exists (select 1 from recipients x join companies y on y.id=x.company_id where x.auth_user_id=r.auth_user_id and y.is_hexa_internal) limit 1""")
if other:
    u = other[0]['u']
    r = sql(f"""select set_config('request.jwt.claims', '{{"sub":"{u}","role":"authenticated"}}', true); set local role authenticated;
      select (select count(*) from ts_files where device_id='{D1}') f, ts_catalog('{D1}') c""")
    check("client d'une autre entreprise : index invisible, catalogue refusé", isinstance(r, list) and r[-1]['f'] == 0 and r[-1]['c'] is None, r)
r = sql("set local role authenticated; select count(*) n from ts_buffer")
check("tampon inaccessible aux utilisateurs", isinstance(r, list) and r[-1]['n'] == 0, r)
st, _ = http(f"{URL}/functions/v1/ts-build", {}, {'x-cron-secret': 'faux'})
check("ts-build sans le bon secret : refusé", st == 403, st)
st, _ = http(f"{URL}/storage/v1/object/ts-archive/{files[('raw', '2026-10-22')]['path']}", headers={'Authorization': 'Bearer ' + JWT, 'apikey': ANON})
check("fichiers non téléchargeables directement par un utilisateur", st >= 400, st)

cleanup()
sql(f"update companies set max_daily_reports={co['m'] if co['m'] is not None else 'null'} where id='{co['id']}'")
print(f"\n{ok} OK, {ko} échec(s)")
sys.exit(1 if ko else 0)

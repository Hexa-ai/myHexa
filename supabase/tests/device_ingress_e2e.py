#!/usr/bin/env python3
"""Tests de l'Edge Function device-ingress sur myHexa-TEST uniquement (fausses box).
Usage : test_device_ingress.py [base_url]   (défaut : fonction déployée sur le test)"""
import json, os, sys, time, urllib.request
TEST = "mtwqkfbbtjlntkhfojai"
env = {}
for l in open(os.path.expanduser("~/.hermes/.env")):
    l = l.strip()
    if "=" in l and not l.startswith("#"):
        k, v = l.split("=", 1); env[k] = v.strip().strip('"').strip("'")
BASE = sys.argv[1] if len(sys.argv) > 1 else f"https://{TEST}.supabase.co/functions/v1/device-ingress"

def sql(q):
    r = urllib.request.Request(f"https://api.supabase.com/v1/projects/{TEST}/database/query",
        data=json.dumps({"query": q}).encode(),
        headers={"Authorization": "Bearer " + env["SUPABASE_ACCESS_TOKEN"], "Content-Type": "application/json", "User-Agent": "h"})
    return json.load(urllib.request.urlopen(r, timeout=60))

def post(path, body, token=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    r = urllib.request.Request(BASE + path, data=json.dumps(body).encode(), headers=h, method="POST")
    try:
        resp = urllib.request.urlopen(r, timeout=30); return resp.status, json.loads(resp.read() or b"null")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"null")

ok_count = fail_count = 0
def check(label, cond, detail=""):
    global ok_count, fail_count
    if cond: ok_count += 1; print("  OK  ", label)
    else: fail_count += 1; print("  ÉCHEC", label, detail)

# --- préparation : compagnie de test (quota daily = 2) + 2 fausses box
sql("""
insert into companies (id, name, max_daily_reports, max_weekly_reports)
values ('00000000-0000-0000-0000-00000000e2e0', 'TEST ingestion (Hermes)', 2, 0)
on conflict (id) do update set max_daily_reports = 2, max_weekly_reports = 0;
delete from devices where company_id = '00000000-0000-0000-0000-00000000e2e0';
insert into devices (id, company_id, name, mac_eth0) values
  ('00000000-0000-0000-0000-00000000e2e1', '00000000-0000-0000-0000-00000000e2e0', 'fake-box-01', 'aa:bb:cc:00:00:01'),
  ('00000000-0000-0000-0000-00000000e2e2', '00000000-0000-0000-0000-00000000e2e0', 'fake-box-02', 'AA:BB:CC:00:00:02');
""")
D1 = "00000000-0000-0000-0000-00000000e2e1"

print("provision")
s, b = post("/provision/fake-box-01", {"mac": "pas-une-mac"}); check("MAC invalide -> 400", s == 400 and b == {"error": "invalid mac format"}, (s, b))
s, b = post("/provision/fake-box-01", {"mac": "AA:BB:CC:99:99:99"}); check("MAC inconnue -> 404", s == 404 and b == {"error": "device not registered"}, (s, b))
s, b = post("/provision/fake-box-01", {"mac": "AA:BB:CC:00:00:01"})
check("1er boot -> 200 + jeton 32 hex", s == 200 and len(b.get("token", "")) == 32 and b["id"] == D1 and b["name"] == "fake-box-01", (s, b))
TOKEN = b.get("token")
s, b = post("/provision/fake-box-01", {"mac": "aa:bb:cc:00:00:01"}); check("re-provision (casse différente) -> 410", s == 410 and b == {"error": "already provisioned, contact admin"}, (s, b))
check("jeton stocké en base", sql(f"select token from devices where id='{D1}'")[0]["token"] == TOKEN)

print("status")
status = {"device": {"hostname": "fake-box-01-renamed", "version": "1.3.1"}, "timestamp": "2026-10-22T10:00:00+02:00",
          "variables": [{"name": "DEF_MAJEUR", "category": "alarm", "value": 1}, {"name": "FIT100", "category": "measure", "value": 801.2, "unit": "m³/h"}]}
s, b = post("/ingress/fake-box-01/status", status, "jeton-faux"); check("jeton inconnu -> 200 (compat firmware)", s == 200, (s, b))
check("jeton inconnu -> rien écrit", sql(f"select count(*) n from reports where device_id='{D1}'")[0]["n"] == 0)
s, b = post("/ingress/fake-box-01/status", status, TOKEN); check("status -> 200 + corps n8n", s == 200 and b == {"message": "Workflow was started"}, (s, b))
status["timestamp"] = "2026-10-22T10:01:00+02:00"
post("/ingress/fake-box-01/status", status, TOKEN)
r = sql(f"select count(*) n, max(payload->>'timestamp') ts from reports where device_id='{D1}' and type='status'")[0]
check("une seule ligne status, écrasée", r["n"] == 1 and r["ts"].endswith("10:01:00+02:00"), r)
r = sql(f"select name, last_connection_at > now() - interval '1 minute' fresh from devices where id='{D1}'")[0]
check("nom synchronisé + last_connection_at", r["name"] == "fake-box-01-renamed" and r["fresh"], r)

print("rapports")
def daily(d1, d2, v):
    return {"metadata": {"period_str": f"{d1} 00:00 → {d2} 00:00 (UTC+02:00)"}, "device": {"hostname": "fake-box-01-renamed"},
            "variables": [{"name": "FIT100", "category": "measure", "value": v, "stats": {"mean": float(v), "min": 0.0, "max": 2.0 * v, "median": float(v)}}]}
s, b = post("/ingress/fake-box-01/report/daily", daily("19/10/2026", "20/10/2026", 1), TOKEN); check("daily -> 200", s == 200, (s, b))
post("/ingress/fake-box-01/report/daily", daily("19/10/2026", "20/10/2026", 2), TOKEN)  # retry même période
r = sql(f"select count(*) n, max(period_start)::text ps, max(period_end)::text pe, max((payload->'variables'->0->>'value')::int) v from reports where device_id='{D1}' and type='daily'")[0]
check("retry même période -> dédoublonné, payload mis à jour", r["n"] == 1 and r["v"] == 2, r)
check("period_start/end parsés", r["ps"] == "2026-10-19" and r["pe"] == "2026-10-20", r)
time.sleep(1); post("/ingress/fake-box-01/report/daily", daily("20/10/2026", "21/10/2026", 3), TOKEN)
time.sleep(1); post("/ingress/fake-box-01/report/daily", daily("21/10/2026", "22/10/2026", 4), TOKEN)
r = sql(f"select array_agg(period_start::text order by period_start) p from reports where device_id='{D1}' and type='daily'")[0]
check("quota 2 -> les plus anciens supprimés", r["p"] == ["2026-10-20", "2026-10-21"], r)
s, b = post("/ingress/fake-box-01/report/weekly", daily("12/10/2026", "19/10/2026", 5), TOKEN)
check("weekly avec quota 0 -> 200 mais rien écrit", s == 200 and sql(f"select count(*) n from reports where device_id='{D1}' and type='weekly'")[0]["n"] == 0)
s, b = post("/ingress/fake-box-01/report/monthly", daily("01/09/2026", "01/10/2026", 6), TOKEN); check("période inconnue -> 200, ignorée", s == 200)
s, b = post("/autre/chose", {}); check("route inconnue -> 404", s == 404)

print("routes courtes (sans le préfixe /ingress)")
status["timestamp"] = "2026-10-22T10:02:00+02:00"
s, b = post("/fake-box-01/status", status, TOKEN); check("/<host>/status -> 200", s == 200 and b == {"message": "Workflow was started"}, (s, b))
r = sql(f"select payload->>'timestamp' ts from reports where device_id='{D1}' and type='status'")[0]
check("/<host>/status -> écrit", r["ts"].endswith("10:02:00+02:00"), r)
sql("update companies set max_daily_reports = 3 where id='00000000-0000-0000-0000-00000000e2e0'")
s, b = post("/fake-box-01/report/daily", daily("22/10/2026", "23/10/2026", 7), TOKEN); check("/<host>/report/daily -> 200", s == 200, (s, b))
check("/<host>/report/daily -> écrit", sql(f"select count(*) n from reports where device_id='{D1}' and type='daily' and period_start='2026-10-22'")[0]["n"] == 1)
s, b = post("/fake-box-01", {}); check("/<host> seul -> 404", s == 404)
sql("update companies set max_daily_reports = 2 where id='00000000-0000-0000-0000-00000000e2e0'")

print("analyse IA (analyze-report déclenché en arrière-plan)")
time.sleep(8)
r = sql(f"select count(*) n from device_period_stats where device_id='{D1}'")[0]
check("analyze-report a tourné (device_period_stats rempli)", r["n"] > 0, r)

print("parité avec n8n sur un vrai rapport de prod (copié dans le test)")
real = sql("select r.id, r.payload, r.derived_payload, r.period_start::text ps from reports r where r.type='daily' and r.derived_payload is not null order by r.received_at desc limit 1")[0]
sql(f"update companies set max_daily_reports = 7 where id='00000000-0000-0000-0000-00000000e2e0'")
s, b = post("/ingress/fake-box-01/report/daily", real["payload"], TOKEN)
mine = sql(f"select derived_payload, period_start::text ps from reports where device_id='{D1}' and type='daily' and period_start = '{real['ps']}'")
check("même period_start que n8n", bool(mine) and mine[0]["ps"] == real["ps"], (mine[:1], real["ps"]))
check("même derived_payload que n8n", bool(mine) and mine[0]["derived_payload"] == real["derived_payload"])

print(f"\n{ok_count} OK, {fail_count} échec(s)")
sys.exit(1 if fail_count else 0)

#!/usr/bin/env python3
"""Tests SQL du proto historique (ts_series) sur myHexa-TEST. Box factice e2e1. Jamais la prod."""
import json, os, sys, urllib.request
TEST = "mtwqkfbbtjlntkhfojai"
D1 = "00000000-0000-0000-0000-00000000e2e1"
STAFF = "fa684919-c05c-4fe1-9eb3-cfae44ea2942"
env = dict(l.strip().split('=', 1) for l in open(os.path.expanduser('~/.hermes/.env')) if '=' in l and not l.startswith('#'))

def sql(q):
    r = urllib.request.Request(f'https://api.supabase.com/v1/projects/{TEST}/database/query', data=json.dumps({'query': q}).encode(),
        headers={'Authorization': 'Bearer ' + env['SUPABASE_ACCESS_TOKEN'].strip(), 'Content-Type': 'application/json', 'User-Agent': 'h'})
    try:
        return json.loads(urllib.request.urlopen(r, timeout=120).read())
    except urllib.error.HTTPError as e:
        return {"error": e.read().decode()[:400]}

def as_user(uid, q):
    return sql(f"""select set_config('request.jwt.claims', '{{"sub":"{uid}","role":"authenticated"}}', true);
set local role authenticated;
{q}""")

ok = ko = 0
def check(name, cond, info=None):
    global ok, ko
    if cond: ok += 1; print("  OK  ", name)
    else: ko += 1; print("  ÉCHEC", name, info if info is not None else "")

tok = sql(f"select token from devices where id='{D1}'")[0]["token"]
sql(f"delete from ts_series where device_id='{D1}'; delete from ts_vars where device_id='{D1}'; delete from reports where device_id='{D1}' and type::text in ('daily','weekly')")
co = sql(f"select c.id, c.max_daily_reports m from companies c join devices d on d.company_id=c.id where d.id='{D1}'")[0]
sql(f"update companies set max_daily_reports=greatest(coalesce(max_daily_reports,0),3), max_weekly_reports=greatest(coalesce(max_weekly_reports,0),3) where id='{co['id']}'")

# journalier synthétique : 22/10 minuit local (UTC+2) ; TEMP = 288 pts 5 min (rampe 0..287), CPT = compteur 24 barres de 2,
# NIV = stats seulement, ALM = alarme step
t0 = 1792620000000  # 2026-10-22 00:00 +02:00
daily = {"metadata": {"period_str": "22/10/2026 00:00 → 23/10/2026 00:00 (UTC+02:00)"}, "variables": [
    {"name": "TEMP", "category": "measure", "unit": "°C", "stats": {"min": 0, "max": 287, "mean": 143.5},
     "chart": {"type": "line", "points": [{"ts": t0 + i * 300000, "value": float(i)} for i in range(288)]}},
    {"name": "CPT", "category": "counter", "unit": "m3", "stats": {"min": 0, "max": 2, "mean": 2},
     "chart": {"type": "bar", "points": [{"ts": t0 + h * 3600000, "value": 2} for h in range(24)]}},
    {"name": "NIV", "category": "measure", "unit": "m", "stats": {"min": 1.5, "max": 3.5, "mean": 2.25}, "chart": {"type": "line", "points": []}},
    {"name": "ALM", "category": "alarm", "stats": {}, "chart": {"type": "step", "points": [{"ts": t0, "value": 0}, {"ts": t0 + 3600000 * 10, "value": 1}, {"ts": t0 + 3600000 * 11, "value": 0}]}},
    {"name": "POS", "category": "position", "chart": {"type": "map", "points": [{"ts": t0, "lat": 45, "lon": 4}]}},
]}
body = json.dumps(daily).replace("'", "''")
r = sql(f"select ingest_report('{tok}', 'daily', '{body}'::jsonb, '2026-10-22', '2026-10-23') id")
check("rapport journalier ingéré", isinstance(r, list) and r[0]["id"], r)

print("rapport journalier -> séries")
rows = {(x["var"], x["level"]): x for x in sql(f"select var, level, src, step_s, array_length(v_avg,1) n, v_avg, v_min, v_max from ts_series where device_id='{D1}' and day='2026-10-22'")}
check("TEMP 5m : 288 cases, pas 300 s", rows.get(("TEMP", "5m"), {}).get("n") == 288 and rows[("TEMP", "5m")]["step_s"] == 300, rows.get(("TEMP", "5m")))
h = rows.get(("TEMP", "1h"), {})
check("TEMP 1h : 24 cases, moyenne/min/max de la 1re heure = 5.5/0/11", h.get("n") == 24 and h["v_avg"][0] == 5.5 and h["v_min"][0] == 0 and h["v_max"][0] == 11, h)
d = rows.get(("TEMP", "1d"), {})
check("TEMP 1d : stats du rapport (step_s=-1)", d.get("step_s") == -1 and d["v_avg"] == [143.5] and d["v_max"] == [287], d)
c = rows.get(("CPT", "1d"), {})
check("compteur : 1h direct, 1d = stats du rapport", rows.get(("CPT", "1h"), {}).get("n") == 24 and c.get("v_avg") == [2], (rows.get(("CPT", "1h")), c))
n = rows.get(("NIV", "1d"), {})
check("variable sans courbe : min/moy/max du jour gardés", n.get("v_min") == [1.5] and n.get("v_avg") == [2.25] and n.get("v_max") == [3.5], n)
check("variable sans courbe : pas de 5m inventé", ("NIV", "5m") not in rows)
a = rows.get(("ALM", "pt"), {})
check("alarme : 3 points irréguliers", a.get("n") == 3, a)
check("position ignorée", not any(k[0] == "POS" for k in rows))
cat = sql(f"select category from ts_vars where device_id='{D1}' and var='CPT'")
check("catalogue : catégorie compteur", cat and cat[0]["category"] == "counter", cat)

print("statut -> points 30 min, toutes les variables")
def status(ts, temp, extra=None):
    vs = [{"name": "TEMP", "category": "measure", "unit": "°C", "value": temp}, {"name": "PRESS", "category": "measure", "unit": "bar", "value": "1.5"},
          {"name": "MARCHE", "category": "state", "value": True}, {"name": "LIB", "category": "measure", "value": "texte"}] + (extra or [])
    b = json.dumps({"timestamp": ts, "device": {"timezone": "Europe/Paris"}, "variables": vs}).replace("'", "''")
    return sql(f"select ingest_status('{tok}', '{b}'::jsonb) id")
status("2026-10-23T10:00:00+02:00", 20)
status("2026-10-23T10:30:00+02:00", 30)
status("2026-10-23T10:30:00+02:00", 30)  # doublon
status("2026-10-23T11:00:00+02:00", 40)
p = {x["var"]: x for x in sql(f"select var, ts, v_avg from ts_series where device_id='{D1}' and level='pt' and src='s' and day='2026-10-23'")}
check("statuts : 3 points (doublon ignoré)", len(p.get("TEMP", {}).get("v_avg") or []) == 3, p.get("TEMP"))
check("statut : texte numérique et booléen convertis, texte libre ignoré", p.get("PRESS", {}).get("v_avg") == [1.5] * 3 and p.get("MARCHE", {}).get("v_avg") == [1] * 3 and "LIB" not in p, p)
h1 = sql(f"select v_avg, v_min, v_max from ts_series where device_id='{D1}' and var='TEMP' and level='1h' and src='s' and day='2026-10-23'")
check("statut 1h : 10h = moyenne 25 (min 20, max 30), 11h = 40", h1 and h1[0]["v_avg"][10] == 25 and h1[0]["v_min"][10] == 20 and h1[0]["v_avg"][11] == 40, h1)

print("lecture ts_query")
def tq(vars_, a, b, level="null", uid=STAFF):
    arr = "array[" + ",".join(f"'{v}'" for v in vars_) + "]"
    lv = level if level == "null" else f"'{level}'"
    r = as_user(uid, f"select ts_query('{D1}', {arr}, '{a}', '{b}', {lv}) r")
    return r[0]["r"] if isinstance(r, list) else r
q = tq(["TEMP"], "2026-10-22T00:00:00+02:00", "2026-10-23T00:00:00+02:00")
s0 = q["series"][0] if q.get("series") else {}
check("1 jour -> niveau 5m, 288 points TEMP (+ minuit suivant exclu)", q.get("level") == "5m" and len(s0.get("points", [])) >= 288, (q.get("level"), len(s0.get("points", []))))
check("point = [t_ms, moy, min, max]", s0.get("points", [[0]])[0] == [t0, 0, 0, 0], s0.get("points", [None])[0])
q = tq(["TEMP"], "2026-10-01T00:00:00+02:00", "2026-10-24T00:00:00+02:00")
s0 = q["series"][0] if q.get("series") else {}
check("3 semaines -> niveau 1h ; 22/10 du rapport + 23/10 des statuts", q.get("level") == "1h" and set(s0.get("sources", [])) >= {"1h:r", "1h:s"}, (q.get("level"), s0.get("sources")))
q = tq(["TEMP", "NIV"], "2026-05-01T00:00:00+02:00", "2026-10-24T00:00:00+02:00")
names = {x["var"]: x for x in q.get("series", [])}
check("6 mois -> niveau 1d, NIV disponible via ses stats", q.get("level") == "1d" and "NIV" in names and names["NIV"]["points"][0][1:] == [2.25, 1.5, 3.5], q)
q = tq(["ALM"], "2026-10-22T00:00:00+02:00", "2026-10-23T00:00:00+02:00")
check("alarme : points irréguliers servis tels quels", q.get("series") and len(q["series"][0]["points"]) == 3, q)

print("droits")
other = sql(f"""select r.auth_user_id u from recipients r join companies c on c.id=r.company_id where r.auth_user_id is not null
  and c.id <> '{co['id']}' and not c.is_hexa_internal
  and not exists (select 1 from recipients x join companies y on y.id=x.company_id where x.auth_user_id=r.auth_user_id and y.is_hexa_internal) limit 1""")
if other:
    r = tq(["TEMP"], "2026-10-22T00:00:00+02:00", "2026-10-23T00:00:00+02:00", uid=other[0]["u"])
    check("client d'une autre entreprise : interdit", "forbidden" in json.dumps(r), r)
    r = as_user(other[0]["u"], f"select count(*) n from ts_series where device_id='{D1}'")
    check("RLS : lecture directe de la table filtrée", isinstance(r, list) and r[-1]["n"] == 0, r)
r = as_user(STAFF, f"select ts_ingest_report(gen_random_uuid()) n")
check("ingestion non appelable par un utilisateur", "permission denied" in json.dumps(r), r)
r = tq(["TEMP"], "2026-10-23T00:00:00+02:00", "2026-10-22T00:00:00+02:00")
check("plage inversée refusée", "plage invalide" in json.dumps(r), r)

print("robustesse")
bad = json.dumps({"metadata": {"period_str": "21/10/2026 00:00 → 22/10/2026 00:00 (UTC+02:00)"}, "variables": [{"name": "X", "chart": {"type": "line", "points": "oops"}, "stats": {"mean": "n/a"}}]})
r = sql(f"select ingest_report('{tok}', 'daily', '{bad}'::jsonb, '2026-10-21', '2026-10-22') id")
check("rapport malformé : rapport quand même enregistré", isinstance(r, list) and r[0]["id"], r)

sql(f"delete from ts_series where device_id='{D1}'; delete from ts_vars where device_id='{D1}'; delete from reports where device_id='{D1}' and type::text in ('daily','weekly')")
sql(f"update companies set max_daily_reports={co['m'] if co['m'] is not None else 'null'} where id='{co['id']}'")
print(f"\n{ok} OK, {ko} échec(s)")
sys.exit(1 if ko else 0)

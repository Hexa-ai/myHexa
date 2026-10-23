#!/usr/bin/env python3
"""Tests SQL du proto destinataires/escalade sur myHexa-TEST (box factice e2e1). Jamais la prod."""
import json, os, sys, urllib.request
TEST = "mtwqkfbbtjlntkhfojai"
D1 = "00000000-0000-0000-0000-00000000e2e1"
CO = "00000000-0000-0000-0000-00000000e2e0"
SERPOL = "4a15fe2f-31df-43f4-98e1-a058c25defd7"
STAFF = "fa684919-c05c-4fe1-9eb3-cfae44ea2942"  # hermes-test (staff admin)
env = dict(l.strip().split('=', 1) for l in open(os.path.expanduser('~/.hermes/.env')) if '=' in l and not l.startswith('#'))

def sql(q):
    r = urllib.request.Request(f'https://api.supabase.com/v1/projects/{TEST}/database/query', data=json.dumps({'query': q}).encode(),
        headers={'Authorization': 'Bearer ' + env['SUPABASE_ACCESS_TOKEN'].strip(), 'Content-Type': 'application/json', 'User-Agent': 'h'})
    try:
        return json.loads(urllib.request.urlopen(r, timeout=120).read())
    except urllib.error.HTTPError as e:
        return {"error": e.read().decode()[:400]}

def as_user(uid, q):
    # une transaction : claims + rôle authenticated + requête, résultat de la dernière instruction
    return sql(f"""select set_config('request.jwt.claims', '{{"sub":"{uid}","role":"authenticated"}}', true);
set local role authenticated;
{q}""")

ok = ko = 0
def check(name, cond, info=None):
    global ok, ko
    if cond: ok += 1; print("  OK  ", name)
    else: ko += 1; print("  ÉCHEC", name, info if info is not None else "")

def queue(force=True, recipients=True):
    r = as_user(STAFF, f"select queue_alarm_sync('{D1}', {str(force).lower()}, {str(recipients).lower()}) r")
    return r[0]["r"] if isinstance(r, list) else r

def ack(cmd_id, status="ok"):
    tok = sql(f"select token from devices where id='{D1}'")[0]["token"]
    sql(f"""select ingest_remote('{tok}', '{{"protocol":1,"state":{{"recipients_hash":"h1","escalation_hash":"e1"}},
        "acks":[{{"id":"{cmd_id}","status":"{status}","detail":"t"}}]}}'::jsonb)""")

print("préparation")
sql(f"""delete from device_commands where device_id='{D1}'; delete from device_escalation where device_id='{D1}';
delete from alarm_contacts where company_id='{CO}';
update devices set recipients_hash=null, recipients_hash_ref=null, escalation_hash=null, escalation_hash_ref=null where id='{D1}';
insert into alarm_contacts (id, company_id, name, email) values
 ('00000000-0000-0000-0000-0000000a1a01','{CO}','Alice Test','alice@example.invalid'),
 ('00000000-0000-0000-0000-0000000a1a02','{CO}','Bob Test','bob@example.invalid');
insert into alarm_subscriptions (contact_id, device_id, box_recipient_id) values
 ('00000000-0000-0000-0000-0000000a1a01','{D1}','aaaa0001'), ('00000000-0000-0000-0000-0000000a1a02','{D1}','bbbb0002');""")
esc = {"mode": "escalation", "types": {"error": True, "warning": False, "info": False}, "cumulative": False,
       "stop_on_clear": True, "closure_notice": False,
       "levels": [{"name": "Astreinte", "delay_seconds": 300, "reminders": 1, "members": ["aaaa0001"],
                   "channels": {"email": True, "sms": True, "call": False}, "member_channels": {}},
                  {"name": "Chef", "delay_seconds": 600, "reminders": 0, "members": ["bbbb0002"],
                   "channels": {"email": True, "sms": False, "call": False}, "member_channels": {}}]}
J = lambda o: json.dumps(o).replace("'", "''")

print("escalade : premier envoi")
sql(f"insert into device_escalation (device_id, config) values ('{D1}', '{J(esc)}')")
r = queue()
check("nouvelle escalade -> set_recipients + set_escalation complet", r.get("set_recipients") and r.get("escalation_payload") == esc, r)
order = [x["type"] for x in sql(f"select type from device_commands where device_id='{D1}' and state='queued' order by issued_at, id")]
check("ordre : liste avant escalade", order == ["set_recipients", "set_escalation"], order)
ack(r["set_escalation"])
b = sql(f"select baseline = config same from device_escalation where device_id='{D1}'")[0]["same"]
check("ack ok -> baseline = config", b is True)
r = queue(recipients=False)
check("rien de modifié -> rien à envoyer", r.get("status") == "nothing", r)

print("escalade : envoi différentiel")
sql(f"update device_escalation set config = jsonb_set(config, '{{closure_notice}}', 'true') where device_id='{D1}'")
r = queue(recipients=False)
check("un interrupteur -> payload = cet interrupteur seul", r.get("escalation_payload") == {"closure_notice": True} and not r.get("set_recipients"), r)
ack(r["set_escalation"])
sql(f"update device_escalation set config = jsonb_set(config, '{{levels,0,delay_seconds}}', '120') where device_id='{D1}'")
r = queue(recipients=False)
check("niveau modifié -> levels renvoyé en entier", "levels" in (r.get("escalation_payload") or {}) and len(r["escalation_payload"]["levels"]) == 2, r)
ack(r["set_escalation"], "rejected")
b = sql(f"select baseline->'levels'->0->>'delay_seconds' d from device_escalation where device_id='{D1}'")[0]["d"]
check("ack rejected -> baseline inchangée (toujours « à envoyer »)", b == "300", b)

print("escalade : validation avant envoi")
sql(f"update device_escalation set config = jsonb_set(config, '{{levels,1,members}}', '[]') where device_id='{D1}'")
r = queue(recipients=False); check("niveau sans membre -> refusé", r.get("status") == "refused" and "aucun membre" in r.get("detail", ""), r)
sql(f"update device_escalation set config = jsonb_set(config, '{{levels,1,members}}', '[\"zzzz9999\"]') where device_id='{D1}'")
r = queue(recipients=False); check("membre absent de la box -> refusé", r.get("status") == "refused" and "zzzz9999" in r.get("detail", ""), r)
sql(f"""update device_escalation set config = jsonb_set(jsonb_set(config, '{{levels,1,members}}', '["bbbb0002"]'),
     '{{levels,1,member_channels}}', '{{"aaaa0001":{{"email":true,"sms":false,"call":false}}}}') where device_id='{D1}'""")
r = queue(recipients=False); check("canaux pour un non-membre -> refusé", r.get("status") == "refused" and "aaaa0001" in r.get("detail", ""), r)

print("conflits (modif locale sur la box)")
sql(f"update device_escalation set config = jsonb_set(config, '{{levels,1,member_channels}}', '{{}}') where device_id='{D1}'; update devices set escalation_hash='e2', escalation_hash_ref='e1' where id='{D1}'")
r = queue(force=False, recipients=False); check("escalade modifiée sur la box -> conflit", r.get("status") == "conflict", r)
r = queue(force=True, recipients=False); check("forcer -> envoyé", r.get("status") == "queued", r)

print("droits (RLS) — tout est annulé (rollback implicite : une requête = une transaction, rien d'écrit)")
viewer = sql(f"select r.auth_user_id u from recipients r where r.company_id='{SERPOL}' and r.role<>'admin' and r.auth_user_id is not null limit 1")
other = sql(f"select r.auth_user_id u from recipients r join companies c on c.id=r.company_id where r.company_id<>'{SERPOL}' and not c.is_hexa_internal and r.auth_user_id is not null limit 1")
uy = sql("select id from devices where name='UY10-CCBS'")[0]["id"]
if viewer:
    v = viewer[0]["u"]
    r = as_user(v, f"select count(*) n from alarm_contacts where company_id='{SERPOL}'")
    check("client simple Serpol : voit l'annuaire de son entreprise", isinstance(r, list) and r[0]["n"] > 0, r)
    r = as_user(v, f"with u as (update alarm_contacts set name=name where company_id='{SERPOL}' returning 1) select count(*) n from u")
    check("client simple : ne peut pas modifier", isinstance(r, list) and r[0]["n"] == 0, r)
    r = as_user(v, f"select queue_alarm_sync('{uy}') r")
    check("client simple : ne peut pas envoyer", "forbidden" in json.dumps(r), r)
else:
    print("  (pas de client simple Serpol dans le test)")
if other:
    o = other[0]["u"]
    r = as_user(o, f"select count(*) n from alarm_contacts where company_id='{SERPOL}'")
    check("autre entreprise : ne voit rien", isinstance(r, list) and r[0]["n"] == 0, r)
    r = as_user(o, f"select count(*) n from alarm_subscriptions s join devices d on d.id=s.device_id where d.company_id='{SERPOL}'")
    check("autre entreprise : aucun abonnement visible", isinstance(r, list) and r[0]["n"] == 0, r)
    r = as_user(o, f"with u as (delete from alarm_contacts where company_id='{SERPOL}' returning 1) select count(*) n from u")
    check("autre entreprise : ne peut rien supprimer", isinstance(r, list) and r[0]["n"] == 0, r)
    r = as_user(o, f"select import_alarm_config('{SERPOL}') r")
    check("autre entreprise : import interdit", "forbidden" in json.dumps(r), r)
r = sql(f"select count(*) n from alarm_contacts where company_id='{SERPOL}'")
check("annuaire Serpol intact après les tests de droits", r[0]["n"] == 8, r)

sql(f"delete from device_commands where device_id='{D1}'; delete from device_escalation where device_id='{D1}'; delete from alarm_contacts where company_id='{CO}'; update devices set recipients_hash=null, recipients_hash_ref=null, escalation_hash=null, escalation_hash_ref=null where id='{D1}'")
print(f"\n{ok} OK, {ko} échec(s)")
sys.exit(1 if ko else 0)

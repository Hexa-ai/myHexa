#!/usr/bin/env python3
"""Tests SQL du proto « mise à jour firmware à distance » sur myHexa-TEST (box factice e2e1). Jamais la prod.
Rejoue le cycle décrit dans hai-pxxx-ai docs/remote-commands.md : run_update -> pending x2 -> ok, reboot."""
import json, os, sys, urllib.request
TEST = "mtwqkfbbtjlntkhfojai"
D1 = "00000000-0000-0000-0000-00000000e2e1"
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
    return sql(f"""select set_config('request.jwt.claims', '{{"sub":"{uid}","role":"authenticated"}}', true);
set local role authenticated;
{q}""")

ok = ko = 0
def check(name, cond, info=None):
    global ok, ko
    if cond: ok += 1; print("  OK  ", name)
    else: ko += 1; print("  ÉCHEC", name, info if info is not None else "")

def rpc(q, uid=STAFF):
    r = as_user(uid, f"select {q} r")
    return r[0]["r"] if isinstance(r, list) else r

tok = sql(f"select token from devices where id='{D1}'")[0]["token"]
def push(installed, candidate, running=False, reboot=False, acks=(), version=None):
    st = {"recipients_hash": "h", "escalation_hash": "e",
          "update": {"installed": installed, "candidate": candidate, "install_running": running, "reboot_required": reboot}}
    body = json.dumps({"protocol": 1, "state": st, "acks": list(acks)}).replace("'", "''")
    v = f"'{version}'" if version else "null"
    r = sql(f"select ingest_remote('{tok}', '{body}'::jsonb, {v}) c")
    return r[0]["c"] if isinstance(r, list) else r
def cmd(cid):
    return sql(f"select state, ack_status, ack_detail from device_commands where id='{cid}'")[0]
def cleanup():
    sql(f"delete from device_commands where device_id='{D1}'")

saved = sql(f"select remote_seen_at, running_version, pkg_version, candidate_version, reboot_required, update_running from devices where id='{D1}'")[0]
cleanup()

print("garde-fous")
sql(f"update devices set remote_seen_at=null where id='{D1}'")
r = rpc(f"queue_run_update('{D1}')")
check("box sans pilotage : refus", r.get("status") == "refused" and "1.3.7" in r.get("detail", ""), r)
push("1.3.10", None, version="1.3.10")
r = rpc(f"queue_run_update('{D1}')")
check("déjà à jour (pas de candidate) : refus", r.get("status") == "refused" and "à jour" in r.get("detail", ""), r)
push("1.3.10", "1.3.11", running=True, version="1.3.10")
r = rpc(f"queue_run_update('{D1}')")
check("installation en cours : refus", r.get("status") == "refused" and "en cours" in r.get("detail", ""), r)
r = rpc(f"queue_reboot('{D1}')")
check("reboot pendant une installation : refus", r.get("status") == "refused", r)
push("1.3.11", None, reboot=True, version="1.3.10")
r = rpc(f"queue_run_update('{D1}')")
check("reboot attendu : refus de mettre à jour", r.get("status") == "refused" and "redémarr" in r.get("detail", ""), r)
r = rpc(f"queue_run_update('{D1}', '1.3.11; rm -rf /')")
check("version farfelue : refus", r.get("status") == "refused", r)

print("droits")
viewer = sql("""select r.auth_user_id u from recipients r join companies c on c.id=r.company_id
  where r.auth_user_id is not null and r.role='admin' and not c.is_hexa_internal
  and not exists (select 1 from recipients x join companies y on y.id=x.company_id where x.auth_user_id=r.auth_user_id and y.is_hexa_internal) limit 1""")
if viewer:
    r = rpc(f"queue_run_update('{D1}')", viewer[0]["u"])
    check("admin client : interdit (staff Hexa-AI seulement)", "forbidden" in json.dumps(r), r)
r = sql(f"select count(*) n from device_commands where device_id='{D1}'")
check("aucune commande créée par les refus", r[0]["n"] == 0, r)

print("cycle complet run_update")
cmds = push("1.3.10", "1.3.11", version="1.3.10")
check("rien à servir avant la demande", cmds == [], cmds)
r = rpc(f"queue_run_update('{D1}')")
check("mise à jour programmée vers la candidate", r.get("status") == "queued" and r.get("target") == "1.3.11", r)
cid = r.get("id")
r2 = rpc(f"queue_run_update('{D1}')")
check("une seule à la fois", r2.get("status") == "refused", r2)
cmds = push("1.3.10", "1.3.11", version="1.3.10")
check("servie à la box au push suivant (version null, reboot true)",
      len(cmds) == 1 and cmds[0]["type"] == "run_update" and cmds[0]["payload"] == {"version": None, "reboot": True}, cmds)
r = rpc(f"cancel_device_command('{cid}')")
check("plus annulable une fois envoyée", r.get("status") == "refused", r)
push("1.3.10", "1.3.11", running=True, version="1.3.10",
     acks=[{"id": cid, "type": "run_update", "status": "pending", "detail": "installation started (target=latest)"}])
c = cmd(cid)
check("ack pending 1 -> en cours", c["state"] == "in_progress" and "installation" in c["ack_detail"], c)
cmds = push("1.3.11", None, reboot=True, version="1.3.10",
            acks=[{"id": cid, "type": "run_update", "status": "pending", "detail": "installed, waiting for reboot"}])
check("en cours : pas re-servie", cmds == [], cmds)
push("1.3.11", None, version="1.3.11", acks=[{"id": cid, "type": "run_update", "status": "ok", "detail": "1.3.10 -> 1.3.11"}])
c = cmd(cid)
d = sql(f"select running_version, pkg_version, candidate_version, reboot_required, update_running from devices where id='{D1}'")[0]
check("ack ok -> terminée", c["state"] == "acked" and c["ack_detail"] == "1.3.10 -> 1.3.11", c)
check("versions de la box à jour", d["running_version"] == "1.3.11" and d["candidate_version"] is None and d["reboot_required"] is False, d)

print("rate-limit et redémarrage")
push("1.3.11", "1.3.12", version="1.3.11")
r = rpc(f"queue_run_update('{D1}')")
check("nouvelle mise à jour < 1 h : refus (comme la box)", r.get("status") == "refused" and "heure" in r.get("detail", ""), r)
r = rpc(f"queue_reboot('{D1}', 999)")
check("redémarrage programmé", r.get("status") == "queued", r)
p = sql(f"select payload from device_commands where id='{r.get('id')}'")[0]["payload"]
check("délai borné à 300 s", p == {"delay_seconds": 300}, p)
r2 = rpc(f"cancel_device_command('{r.get('id')}')")
check("annulation tant qu'elle n'est pas partie", r2.get("status") == "cancelled", r2)
check("annulée -> plus servie", push("1.3.11", "1.3.12", version="1.3.11") == [])

cleanup()
sets = ", ".join(f"{k}={'null' if v is None else repr(v) if not isinstance(v, bool) else str(v).lower()}" for k, v in saved.items())
sql(f"update devices set {sets} where id='{D1}'")
print(f"\n{ok} OK, {ko} échec(s)")
sys.exit(1 if ko else 0)

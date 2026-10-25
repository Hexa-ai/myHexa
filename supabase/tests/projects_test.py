#!/usr/bin/env python3
"""Tests SQL du proto projets (myHexa-test) : droits RLS par rôle, cohérence entreprise, synthèse.
Chaque scénario s'exécute dans une transaction annulée (rollback) : aucune trace en base."""
import json, subprocess, sys, os

REF = 'mtwqkfbbtjlntkhfojai'
SERPOL = '4a15fe2f-31df-43f4-98e1-a058c25defd7'
OTHER = '93535c38-1764-444c-b6e0-6cbe341a1b3e'
ADMIN_SERPOL = '6c24e58b-8c91-4676-8f9d-09f101a2d800'
VIEWER_SERPOL = 'c0556e5d-1709-4e75-b56c-3f91a870141e'
ADMIN_OTHER = 'cb8209d5-893d-4de2-9060-b5dc0d0d2895'
HERE = os.path.dirname(os.path.abspath(__file__))
ok = ko = 0


def sql(q):
    r = subprocess.run(['bash', os.path.join(HERE, 'sb_query.sh'), REF, q], capture_output=True, text=True)
    out = r.stdout.strip()
    try:
        return json.loads(out)
    except Exception:
        return {'error': out}


def as_user(uid, body):
    """exécute body sous l'identité uid (rôle authenticated) et renvoie le dernier select ; rollback final."""
    claims = json.dumps({'sub': uid, 'role': 'authenticated'})
    return sql(f"""begin;
select set_config('request.jwt.claims', '{claims}', true);
set local role authenticated;
{body}
rollback;""")


def check(name, cond, info=''):
    global ok, ko
    print(('  ok ' if cond else '  ÉCHEC ') + name, '' if cond else info)
    ok, ko = (ok + 1, ko) if cond else (ok, ko + 1)


def err(r):
    return isinstance(r, dict) and 'error' in r


print('lecture')
r = as_user(VIEWER_SERPOL, 'select count(*) n from projects_overview();')
check('viewer Serpol voit les projets Serpol', not err(r) and r[0]['n'] >= 4, r)
r = as_user(ADMIN_OTHER, f"select count(*) n from projects where company_id='{SERPOL}';")
check("admin d'une autre entreprise ne voit pas les projets Serpol", not err(r) and r[0]['n'] == 0, r)
r = as_user(VIEWER_SERPOL, 'select bool_or(can_manage) m from projects_overview();')
check('viewer : can_manage faux', not err(r) and r[0]['m'] is False, r)

print('écriture')
r = as_user(VIEWER_SERPOL, f"insert into projects (company_id, name) values ('{SERPOL}', 'x viewer');")
check('viewer ne peut pas créer', err(r) and 'row-level security' in r['error'], r)
r = as_user(ADMIN_OTHER, f"insert into projects (company_id, name) values ('{SERPOL}', 'x autre');")
check("admin d'une autre entreprise ne peut pas créer chez Serpol", err(r), r)
r = as_user(ADMIN_SERPOL, f"insert into projects (company_id, name) values ('{SERPOL}', 'x admin'); select count(*) n from projects where name='x admin';")
check('admin Serpol crée un projet', not err(r) and r[0]['n'] == 1, r)
r = as_user(VIEWER_SERPOL, f"select set_devices_project(array(select id from devices where company_id='{SERPOL}' limit 1), null);")
check('viewer ne peut pas (dé)rattacher une box', err(r) and 'droits insuffisants' in r['error'], r)
r = as_user(ADMIN_SERPOL, f"""insert into projects (company_id, name) values ('{SERPOL}', 'x admin2');
select set_devices_project(array(select id from devices where company_id='{SERPOL}' and project_id is null limit 2), (select id from projects where name='x admin2')) n;""")
check('admin Serpol rattache 2 box', not err(r) and r[0]['n'] == 2, r)

print('cohérence')
r = sql(f"""begin;
insert into projects (company_id, name) values ('{OTHER}', 'x autre ent');
update devices set project_id = (select id from projects where name='x autre ent') where id = (select id from devices where company_id='{SERPOL}' limit 1);
rollback;""")
check("une box ne peut pas rejoindre le projet d'une autre entreprise", err(r) and "n'appartient pas" in r['error'], r)
r = sql(f"""begin;
insert into projects (company_id, name) values ('{SERPOL}', 'x suppr');
update devices set project_id = (select id from projects where name='x suppr') where name = 'UECS2' and company_id='{SERPOL}';
delete from projects where name='x suppr';
select count(*) n, bool_and(project_id is null) libre from devices where name='UECS2' and company_id='{SERPOL}';
rollback;""")
check('supprimer un projet garde la box (project_id remis à null)', not err(r) and r[0]['n'] == 1 and r[0]['libre'], r)
r = as_user(ADMIN_SERPOL, "select name, devices, online from projects_overview() order by name;")
check('synthèse : 4 projets de démonstration', not err(r) and len([x for x in r if not x['name'].startswith('x ')]) >= 4, r)

print(f"{ok} OK, {ko} échec(s)")
sys.exit(1 if ko else 0)

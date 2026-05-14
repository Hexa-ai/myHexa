# Supabase Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provisionner le projet Supabase `myHexa` avec le schéma HaiOS (4 tables, 1 enum, RLS, triggers updated_at) via Supabase CLI et connecter n8n en session pooler.

**Architecture:** Supabase CLI local dans `/home/talbourdet/Documents/Dev-myHexa/supabase/`, un seul fichier de migration `init_haios.sql` appliqué via `supabase db push`, credential n8n de type `postgres` créé via le MCP `n8n_manage_credentials`.

**Tech Stack:** Supabase CLI (binaire Linux amd64), Postgres 15 (Supabase Cloud), n8n (instance Hostinger) avec nœud Postgres, MCP n8n-mcp pour la gestion des credentials.

**Spec:** [2026-04-19-supabase-setup-design.md](../specs/2026-04-19-supabase-setup-design.md)

---

## File Structure

```
/home/talbourdet/Documents/Dev-myHexa/
├── supabase/
│   ├── config.toml                                 (généré par `supabase init`, aucune édition)
│   ├── migrations/
│   │   └── <timestamp>_init_haios.sql              (fichier principal à écrire manuellement)
│   ├── seed.sql                                    (généré, vide, aucune édition)
│   └── .gitignore                                  (généré)
└── docs/superpowers/
    ├── specs/2026-04-19-supabase-setup-design.md   (déjà existant)
    └── plans/2026-04-19-supabase-setup.md          (ce document)
```

**Responsabilité des fichiers** :

- `config.toml` : configuration locale du projet Supabase (ports pour l'env local, etc.). Aucune édition nécessaire.
- `migrations/<timestamp>_init_haios.sql` : **le** livrable du sous-projet 2 côté code. Contient le SQL complet du schéma initial.
- `seed.sql` : données de seed pour l'env local. On laisse vide pour l'instant (les données réelles arriveront via le workflow de migration du sous-projet 3).

---

## Task 1: Installer Supabase CLI

**Files:**
- Create: `~/.local/bin/supabase` (binaire, pas dans le repo)

- [ ] **Step 1.1: Vérifier que `~/.local/bin` existe et est dans le PATH**

```bash
mkdir -p ~/.local/bin
echo "$PATH" | tr ':' '\n' | grep -q "$HOME/.local/bin" && echo "in PATH" || echo "NOT in PATH"
```

Expected: `in PATH` sur Ubuntu/Debian standard (via `~/.profile`). Si `NOT in PATH`, ajouter `export PATH="$HOME/.local/bin:$PATH"` dans `~/.bashrc` et sourcer.

- [ ] **Step 1.2: Télécharger et extraire le binaire**

```bash
curl -fsSL https://github.com/supabase/cli/releases/latest/download/supabase_linux_amd64.tar.gz \
  | tar -xz -C ~/.local/bin/
```

Expected: pas d'erreur, le fichier `~/.local/bin/supabase` existe.

- [ ] **Step 1.3: Vérifier l'installation**

```bash
supabase --version
```

Expected: output du type `2.x.y` (version actuelle au moment de l'exécution).

---

## Task 2: Scaffolder le projet Supabase local

**Files:**
- Create: `/home/talbourdet/Documents/Dev-myHexa/supabase/config.toml`
- Create: `/home/talbourdet/Documents/Dev-myHexa/supabase/migrations/` (vide)
- Create: `/home/talbourdet/Documents/Dev-myHexa/supabase/seed.sql`
- Create: `/home/talbourdet/Documents/Dev-myHexa/supabase/.gitignore`

- [ ] **Step 2.1: Initialiser le projet Supabase**

```bash
cd /home/talbourdet/Documents/Dev-myHexa && supabase init
```

Expected: output `Finished supabase init.` + création des fichiers listés ci-dessus.

Lorsque l'init demande « Generate VS Code settings for Deno? » et « Generate IntelliJ Settings for Deno? », répondre `No` aux deux (on n'utilise pas Deno Edge Functions dans ce projet).

- [ ] **Step 2.2: Vérifier la structure générée**

```bash
ls -la /home/talbourdet/Documents/Dev-myHexa/supabase/
```

Expected: `config.toml`, `migrations/`, `seed.sql`, `.gitignore` présents.

---

## Task 3: Écrire la migration `init_haios.sql`

**Files:**
- Create: `/home/talbourdet/Documents/Dev-myHexa/supabase/migrations/<timestamp>_init_haios.sql`

- [ ] **Step 3.1: Générer le nom de fichier avec timestamp Supabase**

La convention Supabase est `YYYYMMDDHHMMSS_name.sql` (timestamp UTC au format compact).

```bash
TS=$(date -u +%Y%m%d%H%M%S)
MIGRATION_FILE="/home/talbourdet/Documents/Dev-myHexa/supabase/migrations/${TS}_init_haios.sql"
echo "$MIGRATION_FILE"
```

Expected: chemin du type `.../migrations/20260419093045_init_haios.sql`. **Noter cette valeur** pour les steps suivants.

- [ ] **Step 3.2: Écrire le contenu SQL complet**

Créer le fichier `$MIGRATION_FILE` avec exactement ce contenu :

```sql
-- ================================================================
-- Init HaiOS schema (Companies, Recipients, Devices, Reports)
-- ================================================================

-- 1. ENUM
CREATE TYPE report_type AS ENUM ('status', 'daily', 'weekly');

-- 2. Helper function (partagée par les triggers updated_at)
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. TABLE companies
CREATE TABLE companies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  contact_name    text,
  contact_email   text,
  phone           text,
  address         text,
  latitude        numeric,
  longitude       numeric,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER companies_updated_at BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4. TABLE recipients
CREATE TABLE recipients (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name            text NOT NULL,
  contact_email   text,
  phone           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON recipients (company_id);

CREATE TRIGGER recipients_updated_at BEFORE UPDATE ON recipients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 5. TABLE devices
CREATE TABLE devices (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  name                text NOT NULL,
  serial_number       text,
  mac_eth0            text,
  token               text UNIQUE,
  invoice_number      text,
  os_version          text,
  os_install_date     date,
  last_connection_at  timestamptz,
  address             text,
  latitude            numeric,
  longitude           numeric,
  has_battery         boolean NOT NULL DEFAULT false,
  has_supercap        boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON devices (company_id);
CREATE INDEX ON devices (token);

CREATE TRIGGER devices_updated_at BEFORE UPDATE ON devices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 6. TABLE reports (append-only, pas de updated_at)
CREATE TABLE reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id     uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  type          report_type NOT NULL,
  payload       jsonb NOT NULL,
  received_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON reports (device_id, type, received_at DESC);

-- 7. RLS (activé partout, 0 policy → tout bloqué sauf service_role)
ALTER TABLE companies  ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices    ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports    ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 3.3: Vérifier que le fichier a été créé et est non-vide**

```bash
wc -l "$MIGRATION_FILE" && head -3 "$MIGRATION_FILE"
```

Expected: nombre de lignes > 80, les premières lignes commencent par les commentaires SQL.

---

## Task 4: Login et link au projet distant myHexa

**Files:** aucun (stockage interne du CLI dans `~/.supabase/`)

- [ ] **Step 4.1: Obtenir un Personal Access Token Supabase**

Option A (recommandée en env terminal-only) : créer un PAT dans le dashboard Supabase.

1. Ouvrir `https://supabase.com/dashboard/account/tokens`
2. Cliquer « Generate new token », nommer `haios-cli-local`, copier la valeur (non réaffichée)
3. Exporter en variable d'environnement dans le shell courant :

```bash
export SUPABASE_ACCESS_TOKEN="sbp_xxx_your_token_here"
```

Option B : `supabase login` (flux navigateur). Ne pas utiliser si session terminale distante sans navigateur.

- [ ] **Step 4.2: Linker au projet myHexa**

```bash
cd /home/talbourdet/Documents/Dev-myHexa
supabase link --project-ref mlbezfyjbnjyogogqmem
```

Si la commande demande le DB password, l'entrer (voir Task 8 pour où le récupérer — on peut sauter cette prompte avec `ENTER` ; elle est requise pour `db push` seulement).

Expected: output `Finished supabase link.` + fichier `supabase/.temp/project-ref` créé.

- [ ] **Step 4.3: Vérifier le lien**

```bash
cat /home/talbourdet/Documents/Dev-myHexa/supabase/.temp/project-ref
```

Expected: `mlbezfyjbnjyogogqmem`.

---

## Task 5: Appliquer la migration (dry-run puis push)

**Files:** aucun côté local. Modifie l'état distant.

- [ ] **Step 5.1: Récupérer le DB password depuis le Dashboard**

1. Ouvrir `https://supabase.com/dashboard/project/mlbezfyjbnjyogogqmem/settings/database`
2. Section « Database Password » → si tu ne le connais pas, cliquer « Reset database password » (⚠️ invalidera toute autre connexion existante au projet)
3. Copier la valeur. **Noter cette valeur** — elle sera réutilisée Task 9.

- [ ] **Step 5.2: Dry-run de la migration**

```bash
cd /home/talbourdet/Documents/Dev-myHexa
supabase db push --dry-run
```

(Le CLI prompt le DB password s'il n'est pas en env. Le coller.)

Expected: le CLI affiche les statements qui seraient exécutés ; aucun changement distant.

- [ ] **Step 5.3: Push réel**

```bash
supabase db push
```

Expected: output terminant par `Finished supabase db push.` Le CLI crée la table interne `supabase_migrations.schema_migrations` et y enregistre le timestamp de la migration.

- [ ] **Step 5.4: Vérifier que la migration est enregistrée**

```bash
supabase migration list --linked
```

Expected: une ligne avec ton timestamp dans la colonne `remote` ET `local`.

---

## Task 6: Vérifier le schéma côté Supabase

**Files:** aucun.

- [ ] **Step 6.1: Lister les tables créées**

Via le Dashboard Supabase → Table Editor → schéma `public` : doivent apparaître `companies`, `recipients`, `devices`, `reports`.

Alternative CLI (optionnel, nécessite `psql` installé) : récupérer le `Transaction connection string` depuis le dashboard et lancer :

```bash
psql "<connection-string>" -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;"
```

Expected: les 4 tables.

- [ ] **Step 6.2: Vérifier l'enum, les triggers, et les indexes**

Dashboard → Database → Enumerated Types : `report_type` avec 3 valeurs (`status`, `daily`, `weekly`).

Dashboard → Database → Functions : `set_updated_at`.

Dashboard → Database → Triggers : `companies_updated_at`, `recipients_updated_at`, `devices_updated_at` (pas de `reports_updated_at`).

Dashboard → Database → Indexes : au moins les index sur `recipients(company_id)`, `devices(company_id)`, `devices(token)`, `reports(device_id, type, received_at desc)`.

- [ ] **Step 6.3: Vérifier RLS activé**

Dashboard → Authentication → Policies → onglet par table : chaque table doit afficher une pastille « RLS enabled » et **0 policy**.

---

## Task 7: Tester le trigger `updated_at`

**Files:** aucun. Test one-shot dans le SQL Editor.

- [ ] **Step 7.1: Insérer un company de test**

Dans Dashboard → SQL Editor, exécuter :

```sql
INSERT INTO companies (name) VALUES ('TEST-trigger-company') RETURNING id, created_at, updated_at;
```

Expected: une ligne retournée. `created_at` et `updated_at` sont identiques (à la microseconde près).

- [ ] **Step 7.2: Sauvegarder la valeur initiale d'`updated_at`**

```sql
SELECT id, updated_at AS initial_updated_at
FROM companies
WHERE name = 'TEST-trigger-company';
```

**Noter** `updated_at` pour comparaison.

- [ ] **Step 7.3: Update la ligne, vérifier que `updated_at` change**

```sql
-- Attendre quelques secondes pour différencier les timestamps
SELECT pg_sleep(2);

UPDATE companies
SET contact_email = 'test@trigger.local'
WHERE name = 'TEST-trigger-company'
RETURNING id, created_at, updated_at;
```

Expected: `updated_at` est maintenant **> created_at** d'au moins 2 secondes.

- [ ] **Step 7.4: Nettoyer la ligne de test**

```sql
DELETE FROM companies WHERE name = 'TEST-trigger-company';
```

Expected: `DELETE 1`.

---

## Task 8: Récupérer les paramètres de connexion pooler

**Files:** aucun.

- [ ] **Step 8.1: Obtenir le Session Pooler Connection String**

1. Dashboard → Project Settings → Database → section « Connection string »
2. Onglet **Session pooler** (important : pas "Transaction" ni "Direct")
3. Copier la chaîne. Elle ressemble à :

```
postgres://postgres.mlbezfyjbnjyogogqmem:[YOUR-PASSWORD]@aws-0-eu-west-3.pooler.supabase.com:5432/postgres
```

- [ ] **Step 8.2: Extraire les 6 paramètres individuels**

Parser la chaîne ci-dessus et noter :

| Paramètre | Valeur attendue |
|---|---|
| `host` | `aws-0-eu-west-3.pooler.supabase.com` *(ou différent selon la région exacte — utiliser ce que le dashboard affiche)* |
| `port` | `5432` |
| `database` | `postgres` |
| `user` | `postgres.mlbezfyjbnjyogogqmem` |
| `password` | celui obtenu à Step 5.1 |
| `ssl` | `require` |

**Noter ces valeurs** pour Task 9.

---

## Task 9: Créer le credential n8n `Supabase myHexa`

**Files:** aucun côté repo. Crée une ressource dans n8n.

- [ ] **Step 9.1: Découvrir le schéma du credential Postgres**

Via MCP :

```
mcp__n8n-mcp__n8n_manage_credentials({
  action: "getSchema",
  credentialType: "postgres"
})
```

Expected: liste des champs requis (`host`, `port`, `database`, `user`, `password`, `ssl`, `allowUnauthorizedCerts`).

- [ ] **Step 9.2: Créer le credential**

```
mcp__n8n-mcp__n8n_manage_credentials({
  action: "create",
  name: "Supabase myHexa",
  type: "postgres",
  data: {
    host: "aws-0-eu-west-3.pooler.supabase.com",
    port: 5432,
    database: "postgres",
    user: "postgres.mlbezfyjbnjyogogqmem",
    password: "<DB_PASSWORD>",
    ssl: "require"
  }
})
```

Expected: `{ success: true, data: { id: "<new_id>", name: "Supabase myHexa", type: "postgres", ... } }`. **Noter l'id** retourné.

- [ ] **Step 9.3: Vérifier dans la liste**

```
mcp__n8n-mcp__n8n_manage_credentials({ action: "list" })
```

Expected: le credential `Supabase myHexa` apparaît.

---

## Task 10: Smoke test n8n → Supabase

**Files:** aucun persistant. Crée un workflow n8n jetable, le teste, puis le supprime.

- [ ] **Step 10.1: Créer un workflow jetable `_TEST Supabase smoke`**

```
mcp__n8n-mcp__n8n_create_workflow({
  name: "_TEST Supabase smoke (jetable)",
  nodes: [
    {
      id: "node-webhook",
      name: "Webhook",
      type: "n8n-nodes-base.webhook",
      typeVersion: 2.1,
      position: [0, 0],
      parameters: { httpMethod: "GET", path: "test-supabase", options: {} },
      webhookId: "test-supabase-smoke"
    },
    {
      id: "node-query",
      name: "Query Supabase",
      type: "n8n-nodes-base.postgres",
      typeVersion: 2.6,
      position: [200, 0],
      parameters: {
        operation: "executeQuery",
        query: "SELECT 1 AS ok, current_database() AS db, current_user AS usr, now() AS ts"
      },
      credentials: {
        postgres: { id: "<CREDENTIAL_ID_FROM_TASK_9>", name: "Supabase myHexa" }
      }
    }
  ],
  connections: {
    "Webhook": { main: [[{ node: "Query Supabase", type: "main", index: 0 }]] }
  }
})
```

Expected: `{ success: true, data: { id: "<WF_ID>" } }`. **Noter l'id** du workflow.

- [ ] **Step 10.2: Valider + activer le workflow**

```
mcp__n8n-mcp__n8n_validate_workflow({ id: "<WF_ID>", options: { profile: "runtime" } })
```

Expected: `valid: true` (warnings OK).

```
mcp__n8n-mcp__n8n_update_partial_workflow({
  id: "<WF_ID>",
  intent: "Activate smoke test workflow",
  operations: [{ type: "activateWorkflow" }]
})
```

- [ ] **Step 10.3: Déclencher et vérifier la réponse**

```
mcp__n8n-mcp__n8n_test_workflow({
  workflowId: "<WF_ID>",
  triggerType: "webhook",
  httpMethod: "GET",
  webhookPath: "test-supabase",
  timeout: 30000
})
```

Lister et récupérer l'exécution :

```
mcp__n8n-mcp__n8n_executions({ action: "list", workflowId: "<WF_ID>", limit: 1 })
```

Puis :

```
mcp__n8n-mcp__n8n_executions({
  action: "get",
  id: "<EXEC_ID>",
  mode: "filtered",
  nodeNames: ["Query Supabase"],
  itemsLimit: -1
})
```

Expected: le node `Query Supabase` en status `success` avec un output item `{ ok: 1, db: "postgres", usr: "postgres.mlbezfyjbnjyogogqmem", ts: "<timestamp>" }`.

- [ ] **Step 10.4: Nettoyer — désactiver et supprimer le workflow de test**

```
mcp__n8n-mcp__n8n_update_partial_workflow({
  id: "<WF_ID>",
  intent: "Deactivate smoke test before delete",
  operations: [{ type: "deactivateWorkflow" }]
})
```

```
mcp__n8n-mcp__n8n_delete_workflow({ id: "<WF_ID>" })
```

Expected: `{ success: true, data: { deleted: true } }`.

---

## Critères de succès (à valider en fin de plan)

- [ ] `supabase --version` fonctionne
- [ ] `/home/talbourdet/Documents/Dev-myHexa/supabase/migrations/<timestamp>_init_haios.sql` existe et contient le SQL complet
- [ ] `supabase migration list --linked` affiche la migration comme appliquée côté remote
- [ ] Dashboard Supabase : 4 tables, 1 enum, 1 function, 3 triggers, RLS ON partout, 0 policy
- [ ] Test `updated_at` trigger sur `companies` : `updated_at > created_at` après UPDATE
- [ ] Credential n8n `Supabase myHexa` créé et listé
- [ ] Smoke test n8n `SELECT 1` réussi via le credential
- [ ] Workflow de smoke test supprimé (pas de pollution)

---

## Self-Review (pour moi, Claude, avant remise)

**Spec coverage** :
- Arborescence locale → Task 2 ✓
- Installation CLI → Task 1 ✓
- SQL complet → Task 3 ✓
- Login + link → Task 4 ✓
- `supabase db push` → Task 5 ✓
- Vérifs post-push → Task 6 ✓
- Test triggers → Task 7 ✓
- Paramètres pooler → Task 8 ✓
- Credential n8n → Task 9 ✓
- Smoke test → Task 10 ✓

**Placeholder scan** :
- `<timestamp>` dans Task 3 : c'est un placeholder généré dynamiquement par `date`, pas un vrai placeholder à remplir — acceptable, expliqué clairement.
- `<DB_PASSWORD>`, `<CREDENTIAL_ID_FROM_TASK_9>`, `<WF_ID>`, `<EXEC_ID>` : valeurs que l'implémenteur note au fil de l'exécution. Chaque référence pointe vers le Task/Step qui les produit. Acceptable.

**Type consistency** :
- Nom du credential `Supabase myHexa` : cohérent entre Task 9 et Task 10 ✓
- Type n8n du node `postgres` : v2.6 (version actuelle) ✓
- Nom du webhook path `test-supabase` : cohérent Task 10.1 → Task 10.3 ✓

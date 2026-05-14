# Data Migration Notion → Supabase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construire un workflow n8n jetable qui migre les données de 3 DB Notion (`Clients`, `Destinataires`, `Equipements`) vers 3 tables Supabase (`companies`, `recipients`, `devices`), avec dry-run, fail-fast et rapport final.

**Architecture:** Un workflow unique avec webhook trigger, 3 phases séquentielles (Companies → Recipients → Devices), UUIDs générés côté n8n via `crypto.randomUUID()`, résolution FK via `$('...').all()`, sanity-check final via count Supabase.

**Tech Stack:** n8n (Webhook + Code + Postgres nodes), MCP `n8n-mcp` pour la construction, credentials `Notion account` (`bZvpOZzcwrJOAA4y`) et `Supabase myHexa` (`Kh5BwREIcIPXrGT5`).

**Spec:** [2026-04-19-data-migration-notion-to-supabase-design.md](../specs/2026-04-19-data-migration-notion-to-supabase-design.md)

---

## File Structure

Le « fichier » de ce sous-projet est le workflow n8n lui-même, construit incrémentalement via `n8n_create_workflow` puis `n8n_update_partial_workflow`. Aucun fichier local à créer.

| Artefact | Responsabilité |
|---|---|
| Workflow n8n `_MIGRATION Notion → Supabase (jetable)` | Conteneur unique des nodes |
| Nodes de phase 1 (Companies) | Fetch, transform, insert companies |
| Nodes de phase 2 (Recipients) | Fetch, transform+FK, insert recipients |
| Nodes de phase 3 (Devices) | Fetch, transform+FK, insert devices |
| Nodes de synthèse | Sanity-check, build report, respond |

**IDs statiques à utiliser dans les paramètres** :
- DB Notion Clients : `34351d7d-ad2f-8089-bae7-da24d6ea38f3`
- DB Notion Destinataires : `34351d7d-ad2f-80e0-a217-cb012eb2ad03`
- DB Notion Equipements : `34351d7d-ad2f-80d6-b151-e4b8c7dbe51e`
- Credential Notion : `bZvpOZzcwrJOAA4y`
- Credential Postgres : `Kh5BwREIcIPXrGT5`

**Stratégie de test** : à chaque fin de phase, un dry-run manuel via `n8n_test_workflow` valide le comportement. Le run réel ne se fait qu'au Task 8.

---

## Task 1: Créer le squelette du workflow (webhook + parse params + truncate)

**Files:**
- Create workflow via `n8n_create_workflow`, notez l'ID retourné comme `<WF_ID>`

- [ ] **Step 1.1: Créer le workflow avec 4 nodes initiaux**

```
n8n_create_workflow({
  name: "_MIGRATION Notion → Supabase (jetable)",
  nodes: [
    {
      id: "node-webhook",
      name: "Webhook",
      type: "n8n-nodes-base.webhook",
      typeVersion: 2.1,
      position: [0, 0],
      parameters: {
        httpMethod: "GET",
        path: "migrate-notion",
        responseMode: "lastNode",
        options: {}
      },
      webhookId: "migrate-notion-trigger"
    },
    {
      id: "node-parse",
      name: "Parse Params",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [200, 0],
      parameters: {
        jsCode: "const q = $input.first().json.query || {};\nconst dry_run = String(q.dry || '0') === '1';\nreturn [{ json: { dry_run, started_at: new Date().toISOString() } }];"
      }
    },
    {
      id: "node-if-dry",
      name: "If Dry Run",
      type: "n8n-nodes-base.if",
      typeVersion: 2.3,
      position: [400, 0],
      parameters: {
        conditions: {
          conditions: [{
            id: "c-dry",
            leftValue: "={{ $json.dry_run }}",
            rightValue: "",
            operator: { type: "boolean", operation: "false", singleValue: true }
          }],
          combinator: "and",
          options: { version: 2, leftValue: "", caseSensitive: true, typeValidation: "strict" }
        },
        options: {}
      }
    },
    {
      id: "node-truncate",
      name: "Truncate Tables",
      type: "n8n-nodes-base.postgres",
      typeVersion: 2.6,
      position: [600, -120],
      parameters: {
        operation: "executeQuery",
        query: "TRUNCATE companies, recipients, devices RESTART IDENTITY CASCADE",
        options: {}
      },
      credentials: {
        postgres: { id: "Kh5BwREIcIPXrGT5", name: "Supabase myHexa" }
      }
    },
    {
      id: "node-placeholder-respond",
      name: "Respond (temp)",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [800, 0],
      parameters: {
        jsCode: "return [{ json: { placeholder: true, parse: $('Parse Params').first().json } }];"
      }
    }
  ],
  connections: {
    "Webhook": { main: [[{ node: "Parse Params", type: "main", index: 0 }]] },
    "Parse Params": { main: [[{ node: "If Dry Run", type: "main", index: 0 }]] },
    "If Dry Run": {
      main: [
        [{ node: "Truncate Tables", type: "main", index: 0 }],
        [{ node: "Respond (temp)", type: "main", index: 0 }]
      ]
    },
    "Truncate Tables": { main: [[{ node: "Respond (temp)", type: "main", index: 0 }]] }
  }
})
```

**Noter** `<WF_ID>` depuis la réponse.

- [ ] **Step 1.2: Valider le workflow**

```
n8n_validate_workflow({ id: "<WF_ID>", options: { profile: "runtime" } })
```

Expected: `valid: true`.

- [ ] **Step 1.3: Activer et tester en dry-run**

```
n8n_update_partial_workflow({ id: "<WF_ID>", intent: "Activate for testing", operations: [{ type: "activateWorkflow" }] })

n8n_test_workflow({
  workflowId: "<WF_ID>",
  triggerType: "webhook",
  httpMethod: "GET",
  webhookPath: "migrate-notion",
  data: {},
  headers: {},
  timeout: 30000
})
```

Le dry-run (`?dry=1`) n'est pas encore passé — ce test lance avec le défaut `dry_run=false`, qui truncate les tables (elles sont vides). C'est OK puisque le Task 2 va commencer par insérer.

Expected: le webhook répond avec `{ placeholder: true, parse: { dry_run: false, started_at: "..." } }`.

- [ ] **Step 1.4: Vérifier l'exécution**

```
n8n_executions({ action: "list", workflowId: "<WF_ID>", limit: 1 })
```

Expected: `status: success`.

---

## Task 2: Phase 1 — Fetch + Transform Companies (sans insert pour l'instant)

**Files:** Modify workflow `<WF_ID>` — ajout de 2 nodes de fetch/transform Companies.

- [ ] **Step 2.1: Ajouter le Code node de fetch paginé Notion Clients**

Le Code node utilise `$helpers.httpRequestWithAuthentication` pour paginer la DB Notion et retourner une liste plate de pages.

```
n8n_update_partial_workflow({
  id: "<WF_ID>",
  intent: "Add Phase 1: Fetch Notion Clients DB (paginated)",
  operations: [{
    type: "addNode",
    node: {
      id: "node-fetch-companies",
      name: "Fetch Companies",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [800, -120],
      parameters: {
        jsCode: "const dbId = '34351d7d-ad2f-8089-bae7-da24d6ea38f3';\nlet cursor;\nconst pages = [];\nlet safety = 0;\ndo {\n  if (++safety > 50) throw new Error('Too many pagination iterations');\n  const body = cursor ? { start_cursor: cursor, page_size: 100 } : { page_size: 100 };\n  const resp = await this.helpers.httpRequestWithAuthentication.call(this, 'notionApi', {\n    method: 'POST',\n    url: `https://api.notion.com/v1/databases/${dbId}/query`,\n    headers: { 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },\n    body,\n    json: true\n  });\n  pages.push(...resp.results);\n  cursor = resp.has_more ? resp.next_cursor : null;\n} while (cursor);\nreturn pages.map(p => ({ json: p }));"
      },
      credentials: {
        notionApi: { id: "bZvpOZzcwrJOAA4y", name: "Notion account" }
      }
    }
  }]
})
```

- [ ] **Step 2.2: Ajouter le Code node de transformation Companies**

```
n8n_update_partial_workflow({
  id: "<WF_ID>",
  intent: "Add Phase 1: Transform Companies",
  operations: [{
    type: "addNode",
    node: {
      id: "node-transform-companies",
      name: "Transform Companies",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [1000, -120],
      parameters: {
        jsCode: "const rt = (p) => p?.rich_text?.map(t => t.plain_text).join('') || null;\nconst title = (p) => p?.title?.map(t => t.plain_text).join('') || null;\nconst email = (p) => p?.email || null;\nconst phone = (p) => p?.phone_number || null;\n\nconst pages = $input.all();\nconst items = pages.map(it => {\n  const page = it.json;\n  const props = page.properties || {};\n  const place = props['Lieu'];\n  return {\n    json: {\n      notion_id: page.id,\n      notion_lieu_raw: place,\n      row: {\n        id: crypto.randomUUID(),\n        name: title(props['Nom']),\n        contact_name: rt(props['Nom contact']),\n        contact_email: email(props['Contact Email']),\n        phone: phone(props['Numéro de téléphone']),\n        address: place?.name ?? place?.address ?? null,\n        latitude: place?.latitude ?? null,\n        longitude: place?.longitude ?? null\n      }\n    }\n  };\n});\nif (!items.length) throw new Error('No Companies fetched from Notion — aborting');\nfor (const it of items) {\n  if (!it.json.row.name) throw new Error(`Company notion_id=${it.json.notion_id} has empty name — fail-fast`);\n}\nreturn items;"
      }
    }
  }]
})
```

**Note** : on expose `notion_lieu_raw` pour inspecter la structure exacte du `Lieu` au dry-run. Supprimable ensuite.

- [ ] **Step 2.3: Connecter les nodes (truncate → fetch → transform, et dry → transform → …)**

On veut que le chemin dry ET le chemin full passent par Fetch + Transform. Seul l'INSERT est conditionnel.

```
n8n_update_partial_workflow({
  id: "<WF_ID>",
  intent: "Wire Phase 1 fetch/transform; both dry and full paths pass through",
  operations: [
    { type: "removeConnection", source: "If Dry Run", target: "Respond (temp)" },
    { type: "removeConnection", source: "Truncate Tables", target: "Respond (temp)" },
    { type: "addConnection", source: "Truncate Tables", target: "Fetch Companies" },
    { type: "addConnection", source: "If Dry Run", target: "Fetch Companies", branch: "false" },
    { type: "addConnection", source: "Fetch Companies", target: "Transform Companies" },
    { type: "addConnection", source: "Transform Companies", target: "Respond (temp)" }
  ]
})
```

- [ ] **Step 2.4: Dry-run pour vérifier le fetch + la structure de `Lieu`**

```
n8n_test_workflow({
  workflowId: "<WF_ID>",
  triggerType: "webhook",
  httpMethod: "GET",
  webhookPath: "migrate-notion?dry=1",
  timeout: 60000
})

n8n_executions({ action: "list", workflowId: "<WF_ID>", limit: 1 })
n8n_executions({
  action: "get",
  id: "<EXEC_ID>",
  mode: "filtered",
  nodeNames: ["Transform Companies"],
  itemsLimit: 3
})
```

Expected: `Transform Companies` output avec `notion_lieu_raw` rempli pour au moins 1 item. Analyser la structure de `notion_lieu_raw` pour confirmer les champs `name`, `latitude`, `longitude` (hypothèse actuelle).

- [ ] **Step 2.5: Si la structure `Lieu` diffère, ajuster le mapping**

Si `notion_lieu_raw` montre par exemple `{ resource_id, address, coordinates: { lat, lng } }`, patcher le Code node via `patchNodeField` :

```
n8n_update_partial_workflow({
  id: "<WF_ID>",
  intent: "Adjust Lieu mapping based on actual Notion structure",
  operations: [{
    type: "patchNodeField",
    nodeName: "Transform Companies",
    fieldPath: "parameters.jsCode",
    patches: [
      { find: "place?.name ?? place?.address ?? null", replace: "<ACTUAL_NAME_EXPR>" },
      { find: "place?.latitude ?? null", replace: "<ACTUAL_LAT_EXPR>" },
      { find: "place?.longitude ?? null", replace: "<ACTUAL_LNG_EXPR>" }
    ]
  }]
})
```

Puis re-dry-run. Si la structure est celle attendue, skipper ce step.

---

## Task 3: Phase 1 — Insert Companies (dans la branche non-dry)

**Files:** Modify workflow `<WF_ID>`.

- [ ] **Step 3.1: Ajouter le Postgres node d'insert en mode insert multiRow**

n8n Postgres node v2.6 supporte `operation: "insert"` qui prend un array d'items et insère chacun dans la même transaction. Les champs de chaque item.json.row sont mappés aux colonnes.

```
n8n_update_partial_workflow({
  id: "<WF_ID>",
  intent: "Add Phase 1: Insert Companies",
  operations: [{
    type: "addNode",
    node: {
      id: "node-insert-companies",
      name: "Insert Companies",
      type: "n8n-nodes-base.postgres",
      typeVersion: 2.6,
      position: [1200, -240],
      parameters: {
        operation: "insert",
        schema: { __rl: true, mode: "list", value: "public" },
        table: { __rl: true, mode: "list", value: "companies" },
        columns: {
          mappingMode: "defineBelow",
          value: {
            id: "={{ $json.row.id }}",
            name: "={{ $json.row.name }}",
            contact_name: "={{ $json.row.contact_name }}",
            contact_email: "={{ $json.row.contact_email }}",
            phone: "={{ $json.row.phone }}",
            address: "={{ $json.row.address }}",
            latitude: "={{ $json.row.latitude }}",
            longitude: "={{ $json.row.longitude }}"
          },
          matchingColumns: [],
          schema: [
            { id: "id", displayName: "id", type: "string", canBeUsedToMatch: true, required: false },
            { id: "name", displayName: "name", type: "string", required: true },
            { id: "contact_name", displayName: "contact_name", type: "string", required: false },
            { id: "contact_email", displayName: "contact_email", type: "string", required: false },
            { id: "phone", displayName: "phone", type: "string", required: false },
            { id: "address", displayName: "address", type: "string", required: false },
            { id: "latitude", displayName: "latitude", type: "number", required: false },
            { id: "longitude", displayName: "longitude", type: "number", required: false }
          ]
        },
        options: {}
      },
      credentials: {
        postgres: { id: "Kh5BwREIcIPXrGT5", name: "Supabase myHexa" }
      }
    }
  }]
})
```

- [ ] **Step 3.2: Brancher l'insert uniquement sur la voie non-dry**

On souhaite le schéma :
```
Transform Companies ──┬──(always)──► Respond (temp)   (pour que dry-run termine)
                      └──(non-dry)──► Insert Companies ──► Respond (temp)
```

Comme n8n n'a pas de vrai « conditional passthrough », on reroute via un IF node :

```
n8n_update_partial_workflow({
  id: "<WF_ID>",
  intent: "Route Transform Companies through dry-aware branch for insert",
  operations: [
    {
      type: "addNode",
      node: {
        id: "node-if-dry-c1",
        name: "If Dry (Companies)",
        type: "n8n-nodes-base.if",
        typeVersion: 2.3,
        position: [1100, -120],
        parameters: {
          conditions: {
            conditions: [{
              id: "c-dry-c1",
              leftValue: "={{ $('Parse Params').first().json.dry_run }}",
              rightValue: "",
              operator: { type: "boolean", operation: "false", singleValue: true }
            }],
            combinator: "and",
            options: { version: 2, leftValue: "", caseSensitive: true, typeValidation: "strict" }
          },
          options: {}
        }
      }
    },
    { type: "removeConnection", source: "Transform Companies", target: "Respond (temp)" },
    { type: "addConnection", source: "Transform Companies", target: "If Dry (Companies)" },
    { type: "addConnection", source: "If Dry (Companies)", target: "Insert Companies", branch: "true" },
    { type: "addConnection", source: "If Dry (Companies)", target: "Respond (temp)", branch: "false" },
    { type: "addConnection", source: "Insert Companies", target: "Respond (temp)" }
  ]
})
```

- [ ] **Step 3.3: Full-run test de Phase 1**

```
n8n_test_workflow({
  workflowId: "<WF_ID>",
  triggerType: "webhook",
  httpMethod: "GET",
  webhookPath: "migrate-notion",
  timeout: 60000
})
```

Le path non-dry truncate + insert. Expected: `status: success`. Vérifier ensuite en SQL :

Créer un workflow jetable de smoke (ou utiliser le dashboard Supabase) pour :
```sql
SELECT count(*) FROM companies;
SELECT id, name, address FROM companies ORDER BY name LIMIT 5;
```

Expected: count > 0 matche le nombre de pages Notion Clients, `name` et `address` remplis pour au moins les premières lignes.

---

## Task 4: Phase 2 — Recipients (fetch + transform+FK + insert)

**Files:** Modify workflow `<WF_ID>`.

- [ ] **Step 4.1: Ajouter Fetch Recipients (Code paginé)**

```
n8n_update_partial_workflow({
  id: "<WF_ID>",
  intent: "Add Phase 2: Fetch Notion Destinataires",
  operations: [{
    type: "addNode",
    node: {
      id: "node-fetch-recipients",
      name: "Fetch Recipients",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [1400, -120],
      parameters: {
        jsCode: "const dbId = '34351d7d-ad2f-80e0-a217-cb012eb2ad03';\nlet cursor;\nconst pages = [];\nlet safety = 0;\ndo {\n  if (++safety > 50) throw new Error('Too many pagination iterations');\n  const body = cursor ? { start_cursor: cursor, page_size: 100 } : { page_size: 100 };\n  const resp = await this.helpers.httpRequestWithAuthentication.call(this, 'notionApi', {\n    method: 'POST',\n    url: `https://api.notion.com/v1/databases/${dbId}/query`,\n    headers: { 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },\n    body,\n    json: true\n  });\n  pages.push(...resp.results);\n  cursor = resp.has_more ? resp.next_cursor : null;\n} while (cursor);\nreturn pages.map(p => ({ json: p }));"
      },
      credentials: {
        notionApi: { id: "bZvpOZzcwrJOAA4y", name: "Notion account" }
      }
    }
  }]
})
```

- [ ] **Step 4.2: Ajouter Transform Recipients + FK resolution**

```
n8n_update_partial_workflow({
  id: "<WF_ID>",
  intent: "Add Phase 2: Transform Recipients with FK resolution",
  operations: [{
    type: "addNode",
    node: {
      id: "node-transform-recipients",
      name: "Transform Recipients",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [1600, -120],
      parameters: {
        jsCode: "const rt = (p) => p?.rich_text?.map(t => t.plain_text).join('') || null;\nconst title = (p) => p?.title?.map(t => t.plain_text).join('') || null;\nconst email = (p) => p?.email || null;\nconst phone = (p) => p?.phone_number || null;\nconst relIds = (p) => (p?.relation || []).map(r => r.id);\n\nconst companiesMap = {};\nfor (const it of $('Transform Companies').all()) {\n  companiesMap[it.json.notion_id] = it.json.row.id;\n}\n\nfunction resolveCompanyFK(ids, ctx) {\n  if (!ids.length) throw new Error(`${ctx} sans relation Clients — company_id requis`);\n  if (ids.length > 1) console.warn(`${ctx} a ${ids.length} relations Clients, on garde la première`);\n  const uuid = companiesMap[ids[0]];\n  if (!uuid) throw new Error(`${ctx} FK non résolvable : notion_company_id=${ids[0]} absent de companies`);\n  return uuid;\n}\n\nconst pages = $input.all();\nconst items = pages.map(it => {\n  const page = it.json;\n  const props = page.properties || {};\n  const ctx = `Recipient notion_id=${page.id}`;\n  const name = title(props['Nom']);\n  if (!name) throw new Error(`${ctx} a un Nom vide — fail-fast`);\n  return {\n    json: {\n      notion_id: page.id,\n      row: {\n        id: crypto.randomUUID(),\n        company_id: resolveCompanyFK(relIds(props['Clients']), ctx),\n        name,\n        contact_email: email(props['Contact Email']),\n        phone: phone(props['Numéro de téléphone'])\n      }\n    }\n  };\n});\nreturn items;"
      }
    }
  }]
})
```

- [ ] **Step 4.3: Ajouter Insert Recipients**

```
n8n_update_partial_workflow({
  id: "<WF_ID>",
  intent: "Add Phase 2: Insert Recipients",
  operations: [{
    type: "addNode",
    node: {
      id: "node-insert-recipients",
      name: "Insert Recipients",
      type: "n8n-nodes-base.postgres",
      typeVersion: 2.6,
      position: [1800, -240],
      parameters: {
        operation: "insert",
        schema: { __rl: true, mode: "list", value: "public" },
        table: { __rl: true, mode: "list", value: "recipients" },
        columns: {
          mappingMode: "defineBelow",
          value: {
            id: "={{ $json.row.id }}",
            company_id: "={{ $json.row.company_id }}",
            name: "={{ $json.row.name }}",
            contact_email: "={{ $json.row.contact_email }}",
            phone: "={{ $json.row.phone }}"
          },
          matchingColumns: [],
          schema: [
            { id: "id", displayName: "id", type: "string", required: false },
            { id: "company_id", displayName: "company_id", type: "string", required: true },
            { id: "name", displayName: "name", type: "string", required: true },
            { id: "contact_email", displayName: "contact_email", type: "string", required: false },
            { id: "phone", displayName: "phone", type: "string", required: false }
          ]
        },
        options: {}
      },
      credentials: {
        postgres: { id: "Kh5BwREIcIPXrGT5", name: "Supabase myHexa" }
      }
    }
  }]
})
```

- [ ] **Step 4.4: Ajouter le IF dry + câbler Phase 2**

```
n8n_update_partial_workflow({
  id: "<WF_ID>",
  intent: "Route Transform Recipients through dry-aware branch",
  operations: [
    {
      type: "addNode",
      node: {
        id: "node-if-dry-r",
        name: "If Dry (Recipients)",
        type: "n8n-nodes-base.if",
        typeVersion: 2.3,
        position: [1700, -120],
        parameters: {
          conditions: {
            conditions: [{
              id: "c-dry-r",
              leftValue: "={{ $('Parse Params').first().json.dry_run }}",
              rightValue: "",
              operator: { type: "boolean", operation: "false", singleValue: true }
            }],
            combinator: "and",
            options: { version: 2, leftValue: "", caseSensitive: true, typeValidation: "strict" }
          },
          options: {}
        }
      }
    },
    { type: "removeConnection", source: "If Dry (Companies)", target: "Respond (temp)" },
    { type: "removeConnection", source: "Insert Companies", target: "Respond (temp)" },
    { type: "addConnection", source: "If Dry (Companies)", target: "Fetch Recipients", branch: "false" },
    { type: "addConnection", source: "Insert Companies", target: "Fetch Recipients" },
    { type: "addConnection", source: "Fetch Recipients", target: "Transform Recipients" },
    { type: "addConnection", source: "Transform Recipients", target: "If Dry (Recipients)" },
    { type: "addConnection", source: "If Dry (Recipients)", target: "Insert Recipients", branch: "true" },
    { type: "addConnection", source: "If Dry (Recipients)", target: "Respond (temp)", branch: "false" },
    { type: "addConnection", source: "Insert Recipients", target: "Respond (temp)" }
  ]
})
```

- [ ] **Step 4.5: Dry-run puis full-run de la Phase 2**

Dry-run :
```
n8n_test_workflow({
  workflowId: "<WF_ID>", triggerType: "webhook", httpMethod: "GET",
  webhookPath: "migrate-notion?dry=1", timeout: 60000
})
```

Expected: succès, pas d'insertion. Inspecter l'exécution sur `Transform Recipients` : chaque item a `row.company_id` rempli (= UUID).

Full-run :
```
n8n_test_workflow({
  workflowId: "<WF_ID>", triggerType: "webhook", httpMethod: "GET",
  webhookPath: "migrate-notion", timeout: 60000
})
```

Expected: success. Vérifier en SQL : `SELECT count(*) FROM recipients;` matche le count Notion Destinataires.

---

## Task 5: Phase 3 — Devices (fetch + transform+FK + insert, avec check doublons token)

**Files:** Modify workflow `<WF_ID>`.

- [ ] **Step 5.1: Ajouter Fetch Devices**

```
n8n_update_partial_workflow({
  id: "<WF_ID>",
  intent: "Add Phase 3: Fetch Notion Equipements",
  operations: [{
    type: "addNode",
    node: {
      id: "node-fetch-devices",
      name: "Fetch Devices",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [2000, -120],
      parameters: {
        jsCode: "const dbId = '34351d7d-ad2f-80d6-b151-e4b8c7dbe51e';\nlet cursor;\nconst pages = [];\nlet safety = 0;\ndo {\n  if (++safety > 50) throw new Error('Too many pagination iterations');\n  const body = cursor ? { start_cursor: cursor, page_size: 100 } : { page_size: 100 };\n  const resp = await this.helpers.httpRequestWithAuthentication.call(this, 'notionApi', {\n    method: 'POST',\n    url: `https://api.notion.com/v1/databases/${dbId}/query`,\n    headers: { 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },\n    body,\n    json: true\n  });\n  pages.push(...resp.results);\n  cursor = resp.has_more ? resp.next_cursor : null;\n} while (cursor);\nreturn pages.map(p => ({ json: p }));"
      },
      credentials: {
        notionApi: { id: "bZvpOZzcwrJOAA4y", name: "Notion account" }
      }
    }
  }]
})
```

- [ ] **Step 5.2: Ajouter Transform Devices + FK + check doublons token**

```
n8n_update_partial_workflow({
  id: "<WF_ID>",
  intent: "Add Phase 3: Transform Devices with FK resolution and token duplicate check",
  operations: [{
    type: "addNode",
    node: {
      id: "node-transform-devices",
      name: "Transform Devices",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [2200, -120],
      parameters: {
        jsCode: "const rt = (p) => p?.rich_text?.map(t => t.plain_text).join('') || null;\nconst title = (p) => p?.title?.map(t => t.plain_text).join('') || null;\nconst num = (p) => (p?.number ?? null);\nconst dateStart = (p) => p?.date?.start || null;\nconst bool = (p) => !!p?.checkbox;\nconst sel = (p) => p?.select?.name || null;\nconst relIds = (p) => (p?.relation || []).map(r => r.id);\n\nconst companiesMap = {};\nfor (const it of $('Transform Companies').all()) {\n  companiesMap[it.json.notion_id] = it.json.row.id;\n}\n\nfunction resolveCompanyFK(ids, ctx) {\n  if (!ids.length) throw new Error(`${ctx} sans relation Clients — company_id requis`);\n  if (ids.length > 1) console.warn(`${ctx} a ${ids.length} relations Clients, on garde la première`);\n  const uuid = companiesMap[ids[0]];\n  if (!uuid) throw new Error(`${ctx} FK non résolvable : notion_company_id=${ids[0]} absent de companies`);\n  return uuid;\n}\n\nconst pages = $input.all();\nconst tokenSeen = {};\nconst items = pages.map(it => {\n  const page = it.json;\n  const props = page.properties || {};\n  const ctx = `Device notion_id=${page.id}`;\n  const name = title(props['Nom']);\n  if (!name) throw new Error(`${ctx} a un Nom vide — fail-fast`);\n  const token = rt(props['Token']) || null;\n  if (token) {\n    if (tokenSeen[token]) throw new Error(`${ctx} token dupliqué : '${token}' déjà utilisé par notion_id=${tokenSeen[token]}`);\n    tokenSeen[token] = page.id;\n  }\n  return {\n    json: {\n      notion_id: page.id,\n      row: {\n        id: crypto.randomUUID(),\n        company_id: resolveCompanyFK(relIds(props['Clients']), ctx),\n        name,\n        serial_number: rt(props['Numéro série']),\n        mac_eth0: sel(props['Adresse MAC Eth0']),\n        token,\n        invoice_number: rt(props['Numéro de facture']),\n        os_version: rt(props['Version Hai-OS']),\n        os_install_date: dateStart(props['Date Installation OS']),\n        last_connection_at: dateStart(props['Dernière Connexion']),\n        address: rt(props['Localisation']),\n        latitude: num(props['Latitude']),\n        longitude: num(props['Longitude']),\n        has_battery: bool(props['Pile']),\n        has_supercap: bool(props['Super Condensateur'])\n      }\n    }\n  };\n});\nreturn items;"
      }
    }
  }]
})
```

- [ ] **Step 5.3: Ajouter Insert Devices**

```
n8n_update_partial_workflow({
  id: "<WF_ID>",
  intent: "Add Phase 3: Insert Devices",
  operations: [{
    type: "addNode",
    node: {
      id: "node-insert-devices",
      name: "Insert Devices",
      type: "n8n-nodes-base.postgres",
      typeVersion: 2.6,
      position: [2400, -240],
      parameters: {
        operation: "insert",
        schema: { __rl: true, mode: "list", value: "public" },
        table: { __rl: true, mode: "list", value: "devices" },
        columns: {
          mappingMode: "defineBelow",
          value: {
            id: "={{ $json.row.id }}",
            company_id: "={{ $json.row.company_id }}",
            name: "={{ $json.row.name }}",
            serial_number: "={{ $json.row.serial_number }}",
            mac_eth0: "={{ $json.row.mac_eth0 }}",
            token: "={{ $json.row.token }}",
            invoice_number: "={{ $json.row.invoice_number }}",
            os_version: "={{ $json.row.os_version }}",
            os_install_date: "={{ $json.row.os_install_date }}",
            last_connection_at: "={{ $json.row.last_connection_at }}",
            address: "={{ $json.row.address }}",
            latitude: "={{ $json.row.latitude }}",
            longitude: "={{ $json.row.longitude }}",
            has_battery: "={{ $json.row.has_battery }}",
            has_supercap: "={{ $json.row.has_supercap }}"
          },
          matchingColumns: [],
          schema: [
            { id: "id", displayName: "id", type: "string", required: false },
            { id: "company_id", displayName: "company_id", type: "string", required: true },
            { id: "name", displayName: "name", type: "string", required: true },
            { id: "serial_number", displayName: "serial_number", type: "string", required: false },
            { id: "mac_eth0", displayName: "mac_eth0", type: "string", required: false },
            { id: "token", displayName: "token", type: "string", required: false },
            { id: "invoice_number", displayName: "invoice_number", type: "string", required: false },
            { id: "os_version", displayName: "os_version", type: "string", required: false },
            { id: "os_install_date", displayName: "os_install_date", type: "dateTime", required: false },
            { id: "last_connection_at", displayName: "last_connection_at", type: "dateTime", required: false },
            { id: "address", displayName: "address", type: "string", required: false },
            { id: "latitude", displayName: "latitude", type: "number", required: false },
            { id: "longitude", displayName: "longitude", type: "number", required: false },
            { id: "has_battery", displayName: "has_battery", type: "boolean", required: false },
            { id: "has_supercap", displayName: "has_supercap", type: "boolean", required: false }
          ]
        },
        options: {}
      },
      credentials: {
        postgres: { id: "Kh5BwREIcIPXrGT5", name: "Supabase myHexa" }
      }
    }
  }]
})
```

- [ ] **Step 5.4: Câbler Phase 3 avec IF dry**

```
n8n_update_partial_workflow({
  id: "<WF_ID>",
  intent: "Route Transform Devices through dry-aware branch",
  operations: [
    {
      type: "addNode",
      node: {
        id: "node-if-dry-d",
        name: "If Dry (Devices)",
        type: "n8n-nodes-base.if",
        typeVersion: 2.3,
        position: [2300, -120],
        parameters: {
          conditions: {
            conditions: [{
              id: "c-dry-d",
              leftValue: "={{ $('Parse Params').first().json.dry_run }}",
              rightValue: "",
              operator: { type: "boolean", operation: "false", singleValue: true }
            }],
            combinator: "and",
            options: { version: 2, leftValue: "", caseSensitive: true, typeValidation: "strict" }
          },
          options: {}
        }
      }
    },
    { type: "removeConnection", source: "If Dry (Recipients)", target: "Respond (temp)" },
    { type: "removeConnection", source: "Insert Recipients", target: "Respond (temp)" },
    { type: "addConnection", source: "If Dry (Recipients)", target: "Fetch Devices", branch: "false" },
    { type: "addConnection", source: "Insert Recipients", target: "Fetch Devices" },
    { type: "addConnection", source: "Fetch Devices", target: "Transform Devices" },
    { type: "addConnection", source: "Transform Devices", target: "If Dry (Devices)" },
    { type: "addConnection", source: "If Dry (Devices)", target: "Insert Devices", branch: "true" },
    { type: "addConnection", source: "If Dry (Devices)", target: "Respond (temp)", branch: "false" },
    { type: "addConnection", source: "Insert Devices", target: "Respond (temp)" }
  ]
})
```

- [ ] **Step 5.5: Dry-run puis full-run Phase 3**

```
n8n_test_workflow({ workflowId: "<WF_ID>", triggerType: "webhook", httpMethod: "GET", webhookPath: "migrate-notion?dry=1", timeout: 90000 })
```

Inspect `Transform Devices` output : doit contenir tous les champs, y compris `token` unique (aucun doublon).

Puis full-run :
```
n8n_test_workflow({ workflowId: "<WF_ID>", triggerType: "webhook", httpMethod: "GET", webhookPath: "migrate-notion", timeout: 90000 })
```

Vérifier : `SELECT count(*) FROM devices;` matche Notion Equipements.

---

## Task 6: Sanity-check + rapport final

**Files:** Modify workflow `<WF_ID>`.

- [ ] **Step 6.1: Remplacer le Respond (temp) par le vrai pipeline final**

```
n8n_update_partial_workflow({
  id: "<WF_ID>",
  intent: "Add sanity-check query + final report, remove temp respond",
  operations: [
    {
      type: "addNode",
      node: {
        id: "node-sanity",
        name: "Sanity Check Counts",
        type: "n8n-nodes-base.postgres",
        typeVersion: 2.6,
        position: [2600, -120],
        parameters: {
          operation: "executeQuery",
          query: "SELECT (SELECT count(*) FROM companies) AS companies, (SELECT count(*) FROM recipients) AS recipients, (SELECT count(*) FROM devices) AS devices",
          options: {}
        },
        credentials: {
          postgres: { id: "Kh5BwREIcIPXrGT5", name: "Supabase myHexa" }
        }
      }
    },
    {
      type: "addNode",
      node: {
        id: "node-report",
        name: "Build Report",
        type: "n8n-nodes-base.code",
        typeVersion: 2,
        position: [2800, -120],
        parameters: {
          jsCode: "const parse = $('Parse Params').first().json;\nconst dry_run = parse.dry_run;\nconst startedAt = new Date(parse.started_at);\nconst completed = new Date();\n\nconst companiesRead = $('Transform Companies').all().length;\nconst recipientsRead = $('Transform Recipients').all().length;\nconst devicesRead = $('Transform Devices').all().length;\n\nconst sb = $input.first().json; // output of Sanity Check\n\nconst report = {\n  dry_run,\n  started_at: parse.started_at,\n  completed_at: completed.toISOString(),\n  duration_ms: completed - startedAt,\n  companies:  { read: companiesRead,  inserted: dry_run ? null : companiesRead,  fk_resolved: null },\n  recipients: { read: recipientsRead, inserted: dry_run ? null : recipientsRead, fk_resolved: recipientsRead },\n  devices:    { read: devicesRead,    inserted: dry_run ? null : devicesRead,    fk_resolved: devicesRead },\n  supabase_counts: { companies: Number(sb.companies), recipients: Number(sb.recipients), devices: Number(sb.devices) },\n  counts_match: dry_run ? null : (Number(sb.companies) === companiesRead && Number(sb.recipients) === recipientsRead && Number(sb.devices) === devicesRead),\n  success: true\n};\nif (!dry_run && !report.counts_match) {\n  report.success = false;\n  report.error = `Supabase counts do not match Notion reads`;\n}\nreturn [{ json: report }];"
        }
      }
    },
    { type: "removeConnection", source: "If Dry (Devices)", target: "Respond (temp)" },
    { type: "removeConnection", source: "Insert Devices", target: "Respond (temp)" },
    { type: "addConnection", source: "If Dry (Devices)", target: "Sanity Check Counts", branch: "false" },
    { type: "addConnection", source: "Insert Devices", target: "Sanity Check Counts" },
    { type: "addConnection", source: "Sanity Check Counts", target: "Build Report" },
    { type: "removeNode", nodeName: "Respond (temp)" }
  ]
})
```

Le dernier node `Build Report` termine le workflow ; n8n répond automatiquement en mode `lastNode` avec son JSON.

- [ ] **Step 6.2: Valider le workflow**

```
n8n_validate_workflow({ id: "<WF_ID>", options: { profile: "runtime" } })
```

Expected: `valid: true`.

---

## Task 7: Dry-run complet final

**Files:** aucun (test).

- [ ] **Step 7.1: Reset la DB avant dry-run pour partir d'un état connu**

Via Dashboard Supabase SQL Editor :
```sql
TRUNCATE companies, recipients, devices RESTART IDENTITY CASCADE;
```

(le dry-run ne truncate pas, donc on doit le faire manuellement pour éviter des résidus des tests précédents)

- [ ] **Step 7.2: Lancer le dry-run et récupérer le rapport**

```
n8n_test_workflow({ workflowId: "<WF_ID>", triggerType: "webhook", httpMethod: "GET", webhookPath: "migrate-notion?dry=1", timeout: 120000 })

n8n_executions({ action: "list", workflowId: "<WF_ID>", limit: 1 })
n8n_executions({ action: "get", id: "<EXEC_ID>", mode: "filtered", nodeNames: ["Build Report"], itemsLimit: 1 })
```

Expected: rapport avec `dry_run: true`, `companies.read > 0`, `recipients.read >= 0`, `devices.read > 0`, `supabase_counts` tous à 0, `counts_match: null`, `success: true`.

---

## Task 8: Run réel + validation manuelle

**Files:** aucun (test).

- [ ] **Step 8.1: Lancer le run réel**

```
n8n_test_workflow({ workflowId: "<WF_ID>", triggerType: "webhook", httpMethod: "GET", webhookPath: "migrate-notion", timeout: 180000 })

n8n_executions({ action: "list", workflowId: "<WF_ID>", limit: 1 })
n8n_executions({ action: "get", id: "<EXEC_ID>", mode: "filtered", nodeNames: ["Build Report"], itemsLimit: 1 })
```

Expected:
- `dry_run: false`
- `companies.read == companies.inserted`, `supabase_counts.companies == companies.read`
- Idem pour recipients et devices
- `counts_match: true`, `success: true`

- [ ] **Step 8.2: Validation relationnelle SQL**

Via Dashboard Supabase SQL Editor, créer un workflow jetable similaire à ceux du sous-projet 2 pour exécuter :

```sql
-- Chaque company a ses devices et recipients raccrochés ?
SELECT c.name,
       (SELECT count(*) FROM devices d WHERE d.company_id = c.id) AS n_devices,
       (SELECT count(*) FROM recipients r WHERE r.company_id = c.id) AS n_recipients
FROM companies c
ORDER BY c.name;
```

Comparer visuellement avec la structure Notion. Expected: cohérent.

```sql
-- Tokens uniques ?
SELECT token, count(*) FROM devices WHERE token IS NOT NULL GROUP BY token HAVING count(*) > 1;
```

Expected: 0 ligne.

```sql
-- Aucune ligne sans FK parente (devrait être impossible grâce aux FK NOT NULL) ?
SELECT 'recipients_missing_fk' AS check, count(*) FROM recipients WHERE company_id IS NULL
UNION ALL
SELECT 'devices_missing_fk', count(*) FROM devices WHERE company_id IS NULL;
```

Expected: 0 pour les deux.

---

## Task 9: Désactiver + garder le workflow (pas de suppression)

**Files:** Modify workflow `<WF_ID>`.

- [ ] **Step 9.1: Désactiver le workflow**

```
n8n_update_partial_workflow({
  id: "<WF_ID>",
  intent: "Deactivate migration workflow after successful run",
  operations: [{ type: "deactivateWorkflow" }]
})
```

**On ne supprime pas** — le workflow reste disponible si on doit relancer la migration après un re-test. La suppression définitive sera faite au sous-projet 5 (décommission Notion).

- [ ] **Step 9.2: Renommer pour indiquer le statut**

```
n8n_update_partial_workflow({
  id: "<WF_ID>",
  intent: "Mark workflow as executed",
  operations: [{ type: "updateName", newName: "_MIGRATION Notion → Supabase (exécutée, inactif)" }]
})
```

---

## Critères de succès (à valider en fin de plan)

- [ ] Workflow créé, validé `runtime`
- [ ] Dry-run final : rapport cohérent, `counts_match: null`, pas d'erreur
- [ ] Run réel : rapport `success: true`, `counts_match: true`
- [ ] Validation SQL : toutes les FK OK, aucun token dupliqué, structure cohérente avec Notion
- [ ] Workflow désactivé et renommé, prêt pour le sous-projet 5

---

## Self-Review

**Spec coverage** :
- Webhook + dry-run param → Task 1 ✓
- Truncate-and-load → Task 1 (node Truncate Tables) ✓
- Phase 1 Companies (fetch + transform + insert) → Tasks 2, 3 ✓
- Phase 2 Recipients + FK resolution → Task 4 ✓
- Phase 3 Devices + FK + token dup check → Task 5 ✓
- Sanity-check counts → Task 6 ✓
- Final JSON report → Task 6 ✓
- Fail-fast sur FK et token dup → dans le JS de Transform nodes (Tasks 4, 5) ✓
- `Lieu` inspection au 1er dry-run → Task 2.4, 2.5 ✓
- Rollback par rerun → commenté dans Task 5, 7, 8 (truncate au début) ✓
- Validation relationnelle finale → Task 8.2 ✓

**Placeholder scan** :
- `<WF_ID>`, `<EXEC_ID>`, `<ACTUAL_*_EXPR>` : valeurs notées au fil de l'exécution ; chaque référence est claire sur son origine.
- Pas de « TBD », « add error handling », « fill in details ».

**Type consistency** :
- Noms de nodes cohérents entre tasks : `Transform Companies`, `Transform Recipients`, `Transform Devices` référencés dans `Build Report` ✓
- `$('Parse Params').first().json.dry_run` utilisé partout identiquement ✓
- `row.id`, `row.company_id`, `row.name` identiques dans toutes les Insert node mappings ✓
- `crypto.randomUUID()` utilisé dans les trois Transform nodes ✓

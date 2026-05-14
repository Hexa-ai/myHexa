# Design — Migration Notion → Supabase : Sous-projet 3 (Migration des données)

**Date** : 2026-04-19
**Auteur** : Julien Talbourdet (avec assistance Claude)
**Statut** : En attente de validation
**Dépend de** : [Sous-projet 1](2026-04-19-notion-to-supabase-migration-discovery-design.md) et [Sous-projet 2](2026-04-19-supabase-setup-design.md)

## Contexte

Les sous-projets 1 & 2 ont livré le schéma cible et le Supabase provisionné (4 tables, 1 enum, 3 triggers, RLS actif, credential n8n `Supabase myHexa` opérationnel). Ce sous-projet 3 couvre la **copie effective des données** des 3 DB Notion (`Clients`, `Destinataires`, `Equipements`) vers les 3 tables Supabase (`companies`, `recipients`, `devices`). `reports` reste vide (le workflow `Ingestion` du sous-projet 4 la remplira en live).

## Scope

**In** :
- Un workflow n8n jetable qui exécute la migration one-shot
- Mode dry-run pour validation préalable
- Rapport final avec counts + sanity-checks
- Stratégie de rerun (truncate-and-load)

**Out** :
- Refactoring des workflows consommateurs (sous-projet 4)
- Archivage Notion (sous-projet 5)
- Migration de l'historique des status reports (décision explicite : non migré)

## Décisions figées

| Point | Décision | Rationale |
|---|---|---|
| Rerun strategy | **Truncate-and-load** en début de workflow | Tables vides au départ, workflow jetable, rerun propre |
| Workflow architecture | **Un seul workflow**, 3 phases séquentielles | UUIDs générés en JS, map via data stream n8n |
| UUIDs | **Générés côté n8n** via `crypto.randomUUID()` | Évite le besoin d'une colonne `notion_id` |
| Mode dry-run | **Oui**, via `?dry=1` sur le webhook | Validation avant vrai run |
| Erreurs par ligne | **Fail-fast** | Cohérent avec fail-fast FK déjà acté |
| Rapport final | **JSON avec counts + sanity-check Supabase** | Vérif post-migration |
| Rôle du workflow | **Jetable**, supprimé après bascule (sous-projet 5) | Pas destiné à tourner en prod |

## Structure du workflow

```
[Webhook GET /migrate-notion ?dry=0|1]
    │
    ↓
[Parse params: dry_run, startedAt]
    │
    ↓  (si not dry_run)
[Postgres: Truncate]
    │     SQL: TRUNCATE companies, recipients, devices RESTART IDENTITY CASCADE
    ↓
────────── PHASE 1: COMPANIES ──────────
[HTTP: POST /v1/databases/{id_clients}/query]  ── paginé (has_more / next_cursor)
    │
    ↓
[Code: Aggregate pages → flat list]
    │
    ↓
[Code: Transform Companies]
    │     output item per page: {notion_id, row: {id, name, ...}}
    ↓  (si not dry_run)
[Postgres: Bulk Insert Companies]
    │     INSERT INTO companies (id, name, ...) VALUES (...),(...),...
    ↓
────────── PHASE 2: RECIPIENTS ──────────
[HTTP: Query Notion Destinataires (paginated)]
    │
    ↓
[Code: Transform Recipients + Resolve FK]
    │     lookup companies via $('Transform Companies').all()
    │     fail si FK non résolvable
    ↓  (si not dry_run)
[Postgres: Bulk Insert Recipients]
    │
    ↓
────────── PHASE 3: DEVICES ──────────
[HTTP: Query Notion Equipements (paginated)]
    │
    ↓
[Code: Transform Devices + Resolve FK]
    │
    ↓  (si not dry_run)
[Postgres: Bulk Insert Devices]
    │
    ↓
[Postgres: Sanity-check counts]
    │     SELECT counts sur les 3 tables
    ↓
[Code: Build final report]
    │
    ↓
[Respond to webhook (200 JSON)]
```

## Extraction Notion : helpers de parsing

Tous les Code nodes de transformation utilisent ces helpers :

```javascript
const rt = (p) => p?.rich_text?.map(t => t.plain_text).join('') || null;
const title = (p) => p?.title?.map(t => t.plain_text).join('') || null;
const email = (p) => p?.email || null;
const phone = (p) => p?.phone_number || null;
const num = (p) => (p?.number ?? null);
const dateStart = (p) => p?.date?.start || null;
const bool = (p) => !!p?.checkbox;
const sel = (p) => p?.select?.name || null;
const relIds = (p) => (p?.relation || []).map(r => r.id);
```

## Mapping par table

### Companies

```javascript
{
  notion_id: page.id,
  row: {
    id: crypto.randomUUID(),
    name: title(props['Nom']),
    contact_name: rt(props['Nom contact']),
    contact_email: email(props['Contact Email']),
    phone: phone(props['Numéro de téléphone']),
    // Notion type "place" — structure brute à inspecter au 1er dry-run.
    // Hypothèse actuelle : { name, latitude, longitude }
    address: props['Lieu']?.name || null,
    latitude: props['Lieu']?.latitude ?? null,
    longitude: props['Lieu']?.longitude ?? null
  }
}
```

**Point d'attention `Lieu`** : le type `place` Notion n'a pas de documentation publique claire. Le premier dry-run loggera la structure brute de la première page pour confirmer. Si les champs diffèrent, on ajuste avant le run réel.

### Recipients

```javascript
{
  notion_id: page.id,
  row: {
    id: crypto.randomUUID(),
    company_id: resolveCompanyFK(relIds(props['Clients'])),
    name: title(props['Nom']),
    contact_email: email(props['Contact Email']),
    phone: phone(props['Numéro de téléphone'])
  }
}
```

### Devices

```javascript
{
  notion_id: page.id,
  row: {
    id: crypto.randomUUID(),
    company_id: resolveCompanyFK(relIds(props['Clients'])),
    name: title(props['Nom']),
    serial_number: rt(props['Numéro série']),
    mac_eth0: sel(props['Adresse MAC Eth0']),
    token: rt(props['Token']) || null,
    invoice_number: rt(props['Numéro de facture']),
    os_version: rt(props['Version Hai-OS']),
    os_install_date: dateStart(props['Date Installation OS']),
    last_connection_at: dateStart(props['Dernière Connexion']),
    address: rt(props['Localisation']),
    latitude: num(props['Latitude']),
    longitude: num(props['Longitude']),
    has_battery: bool(props['Pile']),
    has_supercap: bool(props['Super Condensateur'])
    // Nom Client (dénormalisé) : ignoré (cf. sous-projet 1)
  }
}
```

**Contrainte UNIQUE sur `token`** : si plusieurs devices Notion partagent le même token (anomalie de data), l'INSERT échouera → fail-fast. Sanity check possible en amont, à ajouter dans la Phase 3 Transform : détecter les doublons avant INSERT pour un message d'erreur plus clair.

## Résolution des FK (fail-fast)

```javascript
// Dans Phase 2 & 3 Code nodes :
const companiesItems = $('Transform Companies').all();
const companiesMap = {};
for (const item of companiesItems) {
  companiesMap[item.json.notion_id] = item.json.row.id;
}

function resolveCompanyFK(notionRelIds) {
  if (!notionRelIds.length) {
    throw new Error(`Page Notion sans relation Clients — company_id requis`);
  }
  if (notionRelIds.length > 1) {
    console.warn(`Page Notion avec ${notionRelIds.length} relations Clients, on prend le premier`);
  }
  const firstId = notionRelIds[0];
  const uuid = companiesMap[firstId];
  if (!uuid) {
    throw new Error(`FK non résolvable : notion_company_id=${firstId} non trouvé dans companies`);
  }
  return uuid;
}
```

## Pagination Notion

Notion API retourne max 100 pages par appel. Gestion simple via boucle dans un Code node qui appelle `$helpers.httpRequestWithAuthentication`, ou via un pattern n8n `SplitInBatches` avec `has_more/next_cursor`.

**Approche choisie** : un Code node « Fetch All Pages » qui encapsule la boucle de pagination en utilisant `$helpers.httpRequestWithAuthentication` avec le credential Notion — plus simple qu'un SplitInBatches pour ce cas.

```javascript
// Pseudo-code
let cursor = undefined;
const pages = [];
do {
  const resp = await $helpers.httpRequestWithAuthentication.call(
    this, 'notionApi',
    {
      method: 'POST',
      url: `https://api.notion.com/v1/databases/${dbId}/query`,
      headers: { 'Notion-Version': '2022-06-28' },
      body: cursor ? { start_cursor: cursor, page_size: 100 } : { page_size: 100 }
    }
  );
  pages.push(...resp.results);
  cursor = resp.has_more ? resp.next_cursor : null;
} while (cursor);
return pages.map(p => ({ json: p }));
```

## Insert bulk

Chaque phase se termine par un Postgres `executeQuery` avec un seul `INSERT INTO ... VALUES (...), (...), ...` construit dans le Code node précédent (interpolation sécurisée via n8n SQL params — **utiliser les paramètres positionnels `$1, $2, ...`** du nœud Postgres pour éviter l'injection).

Alternative si la construction devient trop lourde : le nœud Postgres avec `operation: "insert"` en mode batch, qui prend en entrée un array d'objets et fait les INSERT ligne par ligne dans une seule transaction. Plus lisible mais potentiellement plus lent sur gros volume. À décider à l'implémentation selon le nombre total de lignes (probablement < 50, donc peu importe).

## Rapport final

```json
{
  "dry_run": false,
  "started_at": "2026-04-19T12:30:00.000Z",
  "completed_at": "2026-04-19T12:30:03.420Z",
  "duration_ms": 3420,
  "companies":  { "read": 12, "inserted": 12 },
  "recipients": { "read":  4, "inserted":  4, "fk_resolved":  4 },
  "devices":    { "read": 25, "inserted": 25, "fk_resolved": 25 },
  "supabase_counts": { "companies": 12, "recipients": 4, "devices": 25 },
  "counts_match": true,
  "success": true
}
```

**`success: false`** si :
- Une phase lève une exception (fail-fast)
- `counts_match` est faux (divergence entre Notion lu et Supabase inséré)

En mode dry-run :
- Les phases transform s'exécutent mais les inserts/truncate sont skippés
- Le rapport contient `"read"` et `"fk_resolved"` mais `"inserted": null`
- Le sanity-check compte Supabase (devrait être 0 si tables vides)
- `counts_match` n'a pas de sens en dry-run → `null`

## Critères de succès

- [ ] Workflow créé, validé (`validate_workflow` en profil `runtime`), pas d'erreur bloquante
- [ ] Dry-run réussi : rapport cohérent (counts Notion non nuls, fk_resolved = read pour recipients/devices, pas d'exception)
- [ ] Run réel : `success: true`, `counts_match: true`
- [ ] Vérif Supabase post-run : requête manuelle `SELECT * FROM companies LIMIT 3;` montre des données cohérentes (noms, emails)
- [ ] Vérif relationnelle : `SELECT c.name, count(d.id) FROM companies c LEFT JOIN devices d USING (company_id) GROUP BY c.name;` matche la répartition Notion

## Rollback

En cas de migration incorrecte :
- Le workflow commence par TRUNCATE → il suffit de relancer
- Aucune donnée n'est perdue côté Notion (source de vérité jusqu'à décommission sous-projet 5)
- Possible de corriger les helpers / mapping dans le Code node et relancer immédiatement

## Hors scope

- Migration de l'historique des status reports (décidé : non migré)
- Archivage des DB Notion (sous-projet 5)
- Refactoring des workflows consommateurs (sous-projet 4)

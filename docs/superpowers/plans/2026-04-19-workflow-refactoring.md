# Workflow Refactoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refondre 5 workflows n8n (`Ingestion`, `Report View`, `Location Update`, `Supervision`, `TestRepport - DEV`) pour remplacer les nœuds Notion par des nœuds Postgres/Supabase.

**Architecture:** Modification in-place via MCP (`n8n_update_partial_workflow`) avec `patchNodeField`/`updateNode`/`addNode`/`removeNode`. Chaque workflow actif testé individuellement avant de passer au suivant. L'état précédent est récupérable via `n8n_workflow_versions`.

**Tech Stack:** n8n (nœud Postgres v2.6), MCP `n8n-mcp` pour l'édition, credential `Supabase myHexa` (`Kh5BwREIcIPXrGT5`), PostgreSQL JSONB, JOIN LATERAL.

**Spec:** [2026-04-19-workflow-refactoring-design.md](../specs/2026-04-19-workflow-refactoring-design.md)

---

## File Structure

Aucun fichier local — tout se passe dans n8n via MCP.

**IDs à utiliser** :

| Ressource | ID |
|---|---|
| Ingestion | `X33NGxNIjpyUNvvS` |
| Report View | `K6gY6Zcxy29OOJ1v` |
| Location Update | `u85ZmX7GSWSUW15u` |
| Supervision | `ZGaGgRA7xywQzn8h` |
| TestRepport - DEV | `lNN8H7GWvv4dYcqc` |
| Datatable tokens | `RcU1aznrTruL4VC4` |
| Credential Supabase | `Kh5BwREIcIPXrGT5` |

**Stratégie de vérification** : après chaque refactor, lancer un run test et vérifier le succès. Ne jamais désactiver un workflow actif sans son remplacement prêt.

---

## Task 1: Wipe du datatable `RcU1aznrTruL4VC4`

**Files:** aucun.

- [ ] **Step 1.1: Lister les lignes actuelles pour inventaire**

```
mcp__n8n-mcp__n8n_manage_datatable({
  action: "getRows",
  tableId: "RcU1aznrTruL4VC4",
  limit: 100
})
```

Expected: 0 ou plusieurs lignes avec des `device_ids` contenant des Notion page IDs. **Noter le count.**

- [ ] **Step 1.2: Supprimer toutes les lignes (dry-run d'abord)**

```
mcp__n8n-mcp__n8n_manage_datatable({
  action: "deleteRows",
  tableId: "RcU1aznrTruL4VC4",
  filter: {
    filters: [{ columnName: "token", condition: "neq", value: "__impossible_sentinel__" }]
  },
  dryRun: true
})
```

Expected: preview qui liste les lignes qui seraient supprimées. Count = count du Step 1.1.

- [ ] **Step 1.3: Delete réel**

```
mcp__n8n-mcp__n8n_manage_datatable({
  action: "deleteRows",
  tableId: "RcU1aznrTruL4VC4",
  filter: {
    filters: [{ columnName: "token", condition: "neq", value: "__impossible_sentinel__" }]
  }
})
```

Expected: `deleted: <count>`.

- [ ] **Step 1.4: Vérifier que le datatable est vide**

```
mcp__n8n-mcp__n8n_manage_datatable({ action: "getRows", tableId: "RcU1aznrTruL4VC4", limit: 5 })
```

Expected: `rows: []`.

---

## Task 2: Refactor Ingestion

**Files:** Modify workflow `X33NGxNIjpyUNvvS`.

**Strategy:** On ajoute les nouveaux nodes Postgres, on teste sur la data de test, puis on supprime les nodes Notion et on recâble. Le workflow reste actif tout du long, mais on le désactive brièvement pendant le swap.

- [ ] **Step 2.1: Désactiver temporairement Ingestion**

```
mcp__n8n-mcp__n8n_update_partial_workflow({
  id: "X33NGxNIjpyUNvvS",
  intent: "Deactivate during refactor",
  operations: [{ type: "deactivateWorkflow" }]
})
```

- [ ] **Step 2.2: Ajouter le node Postgres `Find Device by Token`**

```
mcp__n8n-mcp__n8n_update_partial_workflow({
  id: "X33NGxNIjpyUNvvS",
  intent: "Add Postgres lookup by token",
  operations: [{
    type: "addNode",
    node: {
      id: "node-pg-find-device",
      name: "Find Device by Token",
      type: "n8n-nodes-base.postgres",
      typeVersion: 2.6,
      position: [-300, -80],
      parameters: {
        operation: "executeQuery",
        query: "SELECT id FROM devices WHERE token = $1 LIMIT 1",
        options: { queryReplacement: "={{ $json.token }}" }
      },
      credentials: {
        postgres: { id: "Kh5BwREIcIPXrGT5", name: "Supabase myHexa" }
      }
    }
  }]
})
```

- [ ] **Step 2.3: Ajouter le node `If valid device`**

```
mcp__n8n-mcp__n8n_update_partial_workflow({
  id: "X33NGxNIjpyUNvvS",
  intent: "Add IF to check device found",
  operations: [{
    type: "addNode",
    node: {
      id: "node-if-device-found",
      name: "If device found",
      type: "n8n-nodes-base.if",
      typeVersion: 2.3,
      position: [-100, -80],
      parameters: {
        conditions: {
          conditions: [{
            id: "c-found",
            leftValue: "={{ $json.id }}",
            rightValue: "",
            operator: { type: "string", operation: "notEmpty", singleValue: true }
          }],
          combinator: "and",
          options: { version: 2, leftValue: "", caseSensitive: true, typeValidation: "strict" }
        },
        options: {}
      }
    }
  }]
})
```

- [ ] **Step 2.4: Ajouter le node `Insert Report`**

```
mcp__n8n-mcp__n8n_update_partial_workflow({
  id: "X33NGxNIjpyUNvvS",
  intent: "Add INSERT into reports",
  operations: [{
    type: "addNode",
    node: {
      id: "node-pg-insert-report",
      name: "Insert Report",
      type: "n8n-nodes-base.postgres",
      typeVersion: 2.6,
      position: [100, -160],
      parameters: {
        operation: "executeQuery",
        query: "INSERT INTO reports (device_id, type, payload, received_at) VALUES ($1, 'status', $2::jsonb, now())",
        options: {
          queryReplacement: "={{ $json.id }},={{ JSON.stringify($('Webhook').first().json.body) }}"
        }
      },
      credentials: {
        postgres: { id: "Kh5BwREIcIPXrGT5", name: "Supabase myHexa" }
      }
    }
  }]
})
```

- [ ] **Step 2.5: Ajouter le node `Update Last Connection`**

```
mcp__n8n-mcp__n8n_update_partial_workflow({
  id: "X33NGxNIjpyUNvvS",
  intent: "Add UPDATE last_connection_at",
  operations: [{
    type: "addNode",
    node: {
      id: "node-pg-update-lastconn",
      name: "Update Last Connection",
      type: "n8n-nodes-base.postgres",
      typeVersion: 2.6,
      position: [300, -160],
      parameters: {
        operation: "executeQuery",
        query: "UPDATE devices SET last_connection_at = now() WHERE id = $1",
        options: { queryReplacement: "={{ $('Find Device by Token').first().json.id }}" }
      },
      credentials: {
        postgres: { id: "Kh5BwREIcIPXrGT5", name: "Supabase myHexa" }
      }
    }
  }]
})
```

- [ ] **Step 2.6: Supprimer les nodes Notion obsolètes**

```
mcp__n8n-mcp__n8n_update_partial_workflow({
  id: "X33NGxNIjpyUNvvS",
  intent: "Remove Notion-based nodes",
  operations: [
    { type: "removeNode", nodeName: "Get many database pages" },
    { type: "removeNode", nodeName: "Get many child blocks" },
    { type: "removeNode", nodeName: "Append a block1" },
    { type: "removeNode", nodeName: "Code in JavaScript1" },
    { type: "removeNode", nodeName: "HTTP Request" },
    { type: "removeNode", nodeName: "Update Derniere connexion" }
  ]
})
```

- [ ] **Step 2.7: Recâbler le workflow**

```
mcp__n8n-mcp__n8n_update_partial_workflow({
  id: "X33NGxNIjpyUNvvS",
  intent: "Wire new Ingestion flow",
  operations: [
    { type: "addConnection", source: "Code in JavaScript", target: "Find Device by Token" },
    { type: "addConnection", source: "Find Device by Token", target: "If device found" },
    { type: "addConnection", source: "If device found", target: "Insert Report", branch: "true" },
    { type: "addConnection", source: "Insert Report", target: "Update Last Connection" }
  ]
})
```

- [ ] **Step 2.8: Valider + réactiver**

```
mcp__n8n-mcp__n8n_validate_workflow({ id: "X33NGxNIjpyUNvvS", options: { profile: "runtime" } })
```

Expected: `valid: true`.

```
mcp__n8n-mcp__n8n_update_partial_workflow({
  id: "X33NGxNIjpyUNvvS",
  intent: "Reactivate after refactor",
  operations: [{ type: "activateWorkflow" }]
})
```

- [ ] **Step 2.9: Test avec un token device réel**

Récupérer un token en SQL (dashboard Supabase ou workflow jetable) :
```sql
SELECT token FROM devices WHERE token IS NOT NULL LIMIT 1;
```

Appeler :
```bash
curl -X POST https://srv1375596.hstgr.cloud/webhook/ingress/test-device/status \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"device":{"hostname":"test","version":"1.0"},"timestamp":"2026-04-19T15:00:00Z","variables":[],"services":{}}'
```

Expected: 200 OK.

- [ ] **Step 2.10: Vérifier en SQL**

```sql
SELECT count(*) FROM reports WHERE type = 'status';
SELECT payload FROM reports ORDER BY received_at DESC LIMIT 1;
SELECT id, name, last_connection_at FROM devices WHERE token = '<TOKEN>';
```

Expected: une ligne dans `reports` avec le payload JSON, et `last_connection_at` récent.

---

## Task 3: Refactor Report View

**Files:** Modify workflow `K6gY6Zcxy29OOJ1v`.

- [ ] **Step 3.1: Désactiver temporairement**

```
mcp__n8n-mcp__n8n_update_partial_workflow({
  id: "K6gY6Zcxy29OOJ1v",
  intent: "Deactivate during refactor",
  operations: [{ type: "deactivateWorkflow" }]
})
```

- [ ] **Step 3.2: Ajouter le Postgres node `Get Device + Last Status`**

```
mcp__n8n-mcp__n8n_update_partial_workflow({
  id: "K6gY6Zcxy29OOJ1v",
  intent: "Add Postgres query: device + last status",
  operations: [{
    type: "addNode",
    node: {
      id: "node-pg-device-status",
      name: "Get Device + Last Status",
      type: "n8n-nodes-base.postgres",
      typeVersion: 2.6,
      position: [-100, -240],
      parameters: {
        operation: "executeQuery",
        query: "SELECT d.id, d.name, d.address, d.latitude, d.longitude, r.payload AS status, r.received_at AS status_received_at FROM devices d LEFT JOIN LATERAL (SELECT payload, received_at FROM reports WHERE device_id = d.id AND type = 'status' ORDER BY received_at DESC LIMIT 1) r ON true WHERE d.id = $1",
        options: { queryReplacement: "={{ $('Validate').first().json.deviceId }}" }
      },
      credentials: {
        postgres: { id: "Kh5BwREIcIPXrGT5", name: "Supabase myHexa" }
      }
    }
  }]
})
```

- [ ] **Step 3.3: Patcher `Build Detail HTML` pour utiliser la nouvelle structure**

Remplacer le code JS qui lit `$input.first().json.status` (parsed depuis blocs) et `$('Get Device Page').first().json.properties.Localisation` par lecture directe du row Postgres :

```
mcp__n8n-mcp__n8n_update_partial_workflow({
  id: "K6gY6Zcxy29OOJ1v",
  intent: "Update Build Detail HTML to read from Postgres row",
  operations: [{
    type: "updateNode",
    nodeName: "Build Detail HTML",
    updates: {
      parameters: {
        jsCode: "function escapeHtml(s) { return String(s ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c])); }\nfunction escapeAttr(s) { return escapeHtml(s); }\nfunction formatUptime(seconds) { if (!seconds || isNaN(seconds)) return '\u2014'; const d = Math.floor(seconds / 86400); const h = Math.floor((seconds % 86400) / 3600); const m = Math.floor((seconds % 3600) / 60); const parts = []; if (d) parts.push(d + 'j'); if (h) parts.push(h + 'h'); if (m || !parts.length) parts.push(m + 'min'); return parts.join(' '); }\nfunction formatDateTime(iso) { if (!iso) return '\u2014'; const d = new Date(iso); if (isNaN(d.getTime())) return '\u2014'; return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }\nfunction formatValue(v, unit) { if (v === null || v === undefined) return '\u2014'; if (typeof v === 'boolean') return v ? 'vrai' : 'faux'; if (typeof v === 'number') { const s = Number.isInteger(v) ? String(v) : v.toFixed(2); return unit ? s + ' ' + escapeHtml(unit) : s; } return String(v); }\nfunction badge(text, bg, fg) { return `<span style=\"display:inline-block;background:${bg};color:${fg};padding:4px 12px;border-radius:4px;font-size:12px;font-weight:600;\">${text}</span>`; }\nfunction hasActiveAlarm(s) { if (!s || !Array.isArray(s.variables)) return false; return s.variables.some(v => v?.category === 'alarm' && v?.value !== 0 && v?.value !== null && v?.value !== false); }\nfunction renderInterface(name, ifc, label) { if (!ifc) return ''; const connected = ifc.connected === true; const dotColor = connected ? '#16a34a' : '#9ca3af'; const rows = []; if (ifc.ip) rows.push(['IP', ifc.ip]); if (ifc.mask) rows.push(['Masque', ifc.mask]); if (ifc.gateway) rows.push(['Passerelle', ifc.gateway]); if (Array.isArray(ifc.dns) && ifc.dns.length) rows.push(['DNS', ifc.dns.join(', ')]); if (ifc.mode) rows.push(['Mode', ifc.mode]); if (ifc.ssid) rows.push(['SSID', ifc.ssid]); if (ifc.signal !== null && ifc.signal !== undefined) rows.push(['Signal', ifc.signal + '%']); if (ifc.technology) rows.push(['Techno', String(ifc.technology).toUpperCase()]); if (ifc.operator) rows.push(['Op\u00e9rateur', ifc.operator]); const details = rows.length ? rows.map(r => `<div style=\"font-size:13px;color:#555;margin-top:2px;\"><span style=\"color:#9ca3af;\">${escapeHtml(r[0])}</span> &nbsp; ${escapeHtml(String(r[1]))}</div>`).join('') : `<div style=\"font-size:13px;color:#9ca3af;\">\u2014</div>`; return `<div style=\"background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:16px;margin-bottom:10px;\"><div style=\"display:flex;align-items:center;gap:10px;margin-bottom:6px;\"><span style=\"display:inline-block;width:8px;height:8px;border-radius:50%;background:${dotColor};\"></span><strong style=\"color:#111;\">${escapeHtml(label)}</strong><span style=\"color:#9ca3af;font-size:12px;font-family:monospace;\">${escapeHtml(name)}</span>${connected ? '' : '<span style=\"color:#9ca3af;font-size:12px;margin-left:auto;\">d\u00e9connect\u00e9</span>'}</div>${details}</div>`; }\nfunction renderVars(variables, category, label) { const vars = (variables || []).filter(v => v?.category === category); if (!vars.length) return ''; const rows = vars.map(v => { const isAct = category === 'alarm' && v.value && v.value !== 0; const rowStyle = isAct ? 'background:#fef2f2;' : ''; const valColor = isAct ? '#b00' : '#111'; const valWeight = isAct ? 'bold' : '500'; return `<tr style=\"${rowStyle}border-bottom:1px solid #f3f4f6;\"><td style=\"padding:10px 16px;color:#111;font-weight:500;\">${escapeHtml(v.name || '')}</td><td style=\"padding:10px 16px;color:#555;font-size:13px;\">${escapeHtml(v.description || '')}</td><td style=\"padding:10px 16px;text-align:right;color:${valColor};font-family:monospace;font-weight:${valWeight};white-space:nowrap;\">${formatValue(v.value, v.unit)}</td></tr>`; }).join(''); return `<h3 style=\"margin:24px 0 10px 0;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;\">${escapeHtml(label)}</h3><table style=\"border-collapse:collapse;width:100%;background:#fff;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;\"><tbody>${rows}</tbody></table>`; }\nfunction renderStatusPill(enabled) { const bg = enabled ? '#16a34a' : '#9ca3af'; const label = enabled ? 'ACTIF' : 'INACTIF'; return `<span style=\"display:inline-block;background:${bg};color:#fff;padding:4px 12px;border-radius:12px;font-size:11px;font-weight:700;letter-spacing:0.8px;vertical-align:middle;\">${label}</span>`; }\nfunction renderServiceRow(name, enabled, isLast) { const border = isLast ? '' : 'border-bottom:1px solid #f3f4f6;'; return `<tr><td style=\"padding:12px 16px;${border}color:#111;font-family:monospace;font-size:13px;\">${escapeHtml(name)}</td><td style=\"padding:12px 16px;${border}text-align:right;white-space:nowrap;\">${renderStatusPill(enabled)}</td></tr>`; }\nfunction renderServices(services) { const entries = Object.entries(services || {}); if (!entries.length) return '<div style=\"background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:16px;color:#9ca3af;\">Aucun service rapport\u00e9.</div>'; const half = Math.ceil(entries.length / 2); const left = entries.slice(0, half); const right = entries.slice(half); const col = (arr) => `<table style=\"border-collapse:collapse;width:100%;background:#fff;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;\"><tbody>${arr.map(([n, s], i) => renderServiceRow(n, s?.enabled === true, i === arr.length - 1)).join('')}</tbody></table>`; return `<table style=\"border-collapse:separate;border-spacing:0;width:100%;\"><tr><td style=\"vertical-align:top;width:50%;padding-right:8px;\">${col(left)}</td><td style=\"vertical-align:top;width:50%;padding-left:8px;\">${right.length ? col(right) : ''}</td></tr></table>`; }\n\nconst row = $input.first().json;\nconst validated = $('Validate').first().json;\nconst deviceId = validated.deviceId;\nconst token = validated?.row?.token || $('Webhook').first().json.query?.t || '';\nconst query = $('Webhook').first().json.query || {};\n\nconst status = row.status || null;\nconst currentAddress = row.address || '';\n\nconst BASE_URL = 'https://srv1375596.hstgr.cloud/webhook';\nconst supervisionUrl = `${BASE_URL}/report/supervision?t=${encodeURIComponent(token)}`;\nconst formAction = BASE_URL + '/location/update';\n\nlet banner = '';\nif (query.saved === '1') { banner = `<div style=\"background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;padding:12px 16px;border-radius:6px;margin-bottom:16px;font-size:14px;\">\u2713 Localisation mise \u00e0 jour avec succ\u00e8s.</div>`; }\nelse if (query.error === 'nogeo') { banner = `<div style=\"background:#fef3c7;border:1px solid #fde68a;color:#92400e;padding:12px 16px;border-radius:6px;margin-bottom:16px;font-size:14px;\">\u26a0 Adresse introuvable. V\u00e9rifiez l'orthographe et r\u00e9essayez.</div>`; }\n\nconst currentAddressDisplay = currentAddress ? `<p style=\"margin:0 0 12px 0;color:#374151;font-size:14px;\"><span style=\"color:#9ca3af;\">Adresse enregistr\u00e9e :</span> <strong>${escapeHtml(currentAddress)}</strong></p>` : `<p style=\"margin:0 0 12px 0;color:#9ca3af;font-size:14px;font-style:italic;\">Aucune adresse renseign\u00e9e.</p>`;\nconst locationSection = `<h2 style=\"margin:28px 0 12px 0;font-size:14px;color:#111;text-transform:uppercase;letter-spacing:0.5px;\">Localisation</h2><div style=\"background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:20px;\">${banner}${currentAddressDisplay}<form action=\"${formAction}\" method=\"POST\" style=\"display:flex;gap:8px;flex-wrap:wrap;align-items:stretch;\"><input type=\"hidden\" name=\"token\" value=\"${escapeAttr(token)}\"><input type=\"hidden\" name=\"deviceId\" value=\"${escapeAttr(deviceId)}\"><input type=\"text\" name=\"address\" value=\"${escapeAttr(currentAddress)}\" placeholder=\"Ex: 12 rue de la Paix, 75002 Paris\" required style=\"flex:1;min-width:220px;padding:10px 14px;font-size:14px;border:1px solid #d1d5db;border-radius:6px;outline:none;\"><button type=\"submit\" style=\"background:#c96112;color:#fff;border:none;padding:10px 20px;font-size:14px;font-weight:600;border-radius:6px;cursor:pointer;\">Enregistrer</button></form></div>`;\n\nlet bodyContent;\nif (!status) { bodyContent = `<div style=\"background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:20px;color:#991b1b;\">Aucun statut disponible pour cet \u00e9quipement.</div>${locationSection}`; }\nelse {\n  const hostname = status?.device?.hostname || row.name || '(inconnu)';\n  const version = status?.device?.version || '\u2014';\n  const timezone = status?.device?.timezone || '\u2014';\n  const uptime = formatUptime(status?.device?.uptime);\n  const timestamp = formatDateTime(row.status_received_at || status?.timestamp);\n  const minsSince = row.status_received_at ? (Date.now() - new Date(row.status_received_at).getTime()) / 60000 : Infinity;\n  const online = minsSince < 30;\n  const alarm = online && hasActiveAlarm(status);\n  const stateBadge = alarm ? badge('Alerte', '#fee2e2', '#991b1b') : online ? badge('En ligne', '#dcfce7', '#166534') : badge('Inactif', '#f3f4f6', '#4b5563');\n  const net = status?.network || {};\n  const networkHtml = [renderInterface('eth0', net.eth0, 'Ethernet 0'), renderInterface('eth1', net.eth1, 'Ethernet 1'), renderInterface('wlan0', net.wlan0, 'Wi-Fi'), renderInterface('wwan0', net.wwan0, '4G / Cellulaire'), renderInterface('tailscale', net.tailscale, 'Tailscale')].filter(Boolean).join('');\n  const varsHtml = [renderVars(status.variables, 'alarm', 'Alarmes'), renderVars(status.variables, 'counter', 'Compteurs'), renderVars(status.variables, 'measure', 'Mesures'), renderVars(status.variables, 'state', '\u00c9tats')].filter(Boolean).join('');\n  const servicesHtml = renderServices(status.services);\n  bodyContent = `<div style=\"display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;gap:16px;\"><div><h1 style=\"margin:0 0 4px 0;font-size:26px;color:#111;\">${escapeHtml(hostname)}</h1><p style=\"margin:0;color:#6b7280;font-size:13px;\">Derni\u00e8re actualisation : ${escapeHtml(timestamp)}</p></div><div>${stateBadge}</div></div><table style=\"width:100%;border-collapse:separate;border-spacing:10px;margin:-10px 0 14px -10px;\"><tr><td style=\"width:33%;background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:14px;\"><div style=\"color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;\">Version</div><div style=\"color:#111;font-size:15px;font-family:monospace;\">${escapeHtml(version)}</div></td><td style=\"width:33%;background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:14px;\"><div style=\"color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;\">Uptime</div><div style=\"color:#111;font-size:15px;\">${escapeHtml(uptime)}</div></td><td style=\"width:33%;background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:14px;\"><div style=\"color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;\">Fuseau</div><div style=\"color:#111;font-size:15px;\">${escapeHtml(timezone)}</div></td></tr></table>${locationSection}<h2 style=\"margin:28px 0 12px 0;font-size:14px;color:#111;text-transform:uppercase;letter-spacing:0.5px;\">R\u00e9seau</h2>${networkHtml}${varsHtml}<h2 style=\"margin:28px 0 12px 0;font-size:14px;color:#111;text-transform:uppercase;letter-spacing:0.5px;\">Services</h2>${servicesHtml}`;\n}\nconst html = `<!DOCTYPE html><html lang=\"fr\"><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>D\u00e9tails \u00e9quipement</title></head><body style=\"font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111;background:#fafafa;margin:0;padding:32px 16px;\"><div style=\"max-width:960px;margin:0 auto;\"><p style=\"margin:0 0 16px 0;\"><a href=\"${supervisionUrl}\" style=\"color:#6b7280;text-decoration:none;font-size:13px;\">\u2190 Retour \u00e0 la supervision</a></p>${bodyContent}<p style=\"margin:32px 0 0 0;color:#9ca3af;font-size:12px;text-align:center;\">Lien \u00e9ph\u00e9m\u00e8re \u00b7 Valide 7 jours</p></div></body></html>`;\nreturn [{ json: { html } }];"
      }
    }
  }]
})
```

- [ ] **Step 3.4: Supprimer les nodes Notion obsolètes**

```
mcp__n8n-mcp__n8n_update_partial_workflow({
  id: "K6gY6Zcxy29OOJ1v",
  intent: "Remove Notion-based nodes",
  operations: [
    { type: "removeNode", nodeName: "Get Device Page" },
    { type: "removeNode", nodeName: "Get Device Blocks" },
    { type: "removeNode", nodeName: "Parse status" }
  ]
})
```

- [ ] **Step 3.5: Recâbler**

```
mcp__n8n-mcp__n8n_update_partial_workflow({
  id: "K6gY6Zcxy29OOJ1v",
  intent: "Wire Postgres query into Report View",
  operations: [
    { type: "addConnection", source: "If valid", target: "Get Device + Last Status", branch: "true" },
    { type: "addConnection", source: "Get Device + Last Status", target: "Build Detail HTML" }
  ]
})
```

- [ ] **Step 3.6: Valider + réactiver**

```
mcp__n8n-mcp__n8n_validate_workflow({ id: "K6gY6Zcxy29OOJ1v", options: { profile: "runtime" } })
mcp__n8n-mcp__n8n_update_partial_workflow({ id: "K6gY6Zcxy29OOJ1v", intent: "Reactivate", operations: [{ type: "activateWorkflow" }] })
```

- [ ] **Step 3.7: Test manuel**

Créer temporairement une ligne dans le datatable avec un token valide et un device UUID :
```
mcp__n8n-mcp__n8n_manage_datatable({
  action: "insertRows",
  tableId: "RcU1aznrTruL4VC4",
  data: [{
    token: "test-manual-" + Date.now(),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
    device_ids: "<UUID_OF_TEST_DEVICE>"
  }],
  returnType: "all"
})
```

Noter le token retourné, puis :
```bash
curl "https://srv1375596.hstgr.cloud/webhook/report/view?t=<TOKEN>&d=<UUID>"
```

Expected: HTML 200 avec le nom du device et la section status (ou fallback "aucun statut" si pas encore de report).

---

## Task 4: Refactor Location Update

**Files:** Modify workflow `u85ZmX7GSWSUW15u`.

- [ ] **Step 4.1: Désactiver**

```
mcp__n8n-mcp__n8n_update_partial_workflow({
  id: "u85ZmX7GSWSUW15u",
  intent: "Deactivate during refactor",
  operations: [{ type: "deactivateWorkflow" }]
})
```

- [ ] **Step 4.2: Ajouter le node Postgres `Update Device Location`**

```
mcp__n8n-mcp__n8n_update_partial_workflow({
  id: "u85ZmX7GSWSUW15u",
  intent: "Add Postgres UPDATE for location",
  operations: [{
    type: "addNode",
    node: {
      id: "node-pg-update-location",
      name: "Update Device Location",
      type: "n8n-nodes-base.postgres",
      typeVersion: 2.6,
      position: [200, -250],
      parameters: {
        operation: "executeQuery",
        query: "UPDATE devices SET address = $1, latitude = $2, longitude = $3 WHERE id = $4",
        options: {
          queryReplacement: "={{ $json.displayName }},={{ $json.latitude }},={{ $json.longitude }},={{ $json.deviceId }}"
        }
      },
      credentials: {
        postgres: { id: "Kh5BwREIcIPXrGT5", name: "Supabase myHexa" }
      }
    }
  }]
})
```

- [ ] **Step 4.3: Supprimer le node Notion**

```
mcp__n8n-mcp__n8n_update_partial_workflow({
  id: "u85ZmX7GSWSUW15u",
  intent: "Remove Notion update node",
  operations: [{ type: "removeNode", nodeName: "Update Notion" }]
})
```

- [ ] **Step 4.4: Recâbler**

```
mcp__n8n-mcp__n8n_update_partial_workflow({
  id: "u85ZmX7GSWSUW15u",
  intent: "Wire Postgres update into Location Update",
  operations: [
    { type: "addConnection", source: "If geocoded", target: "Update Device Location", branch: "true" },
    { type: "addConnection", source: "Update Device Location", target: "Set redirect" }
  ]
})
```

- [ ] **Step 4.5: Valider + réactiver**

```
mcp__n8n-mcp__n8n_validate_workflow({ id: "u85ZmX7GSWSUW15u", options: { profile: "runtime" } })
mcp__n8n-mcp__n8n_update_partial_workflow({ id: "u85ZmX7GSWSUW15u", intent: "Reactivate", operations: [{ type: "activateWorkflow" }] })
```

- [ ] **Step 4.6: Test (réutilise le token du Task 3.7)**

```bash
curl -X POST "https://srv1375596.hstgr.cloud/webhook/location/update" \
  -H "Content-Type: application/json" \
  -d '{"token":"<TOKEN_FROM_TASK_3>","deviceId":"<UUID>","address":"12 rue de la Paix, 75002 Paris"}'
```

Expected: redirect 302. Puis SQL :
```sql
SELECT address, latitude, longitude FROM devices WHERE id = '<UUID>';
```

Expected: `address = 'Paix, Paris, ...'`, lat/lng numériques.

---

## Task 5: Refactor Supervision

**Files:** Modify workflow `ZGaGgRA7xywQzn8h`.

- [ ] **Step 5.1: Désactiver**

```
mcp__n8n-mcp__n8n_update_partial_workflow({
  id: "ZGaGgRA7xywQzn8h",
  intent: "Deactivate during refactor",
  operations: [{ type: "deactivateWorkflow" }]
})
```

- [ ] **Step 5.2: Ajouter le Postgres node `Get Devices with Last Status`**

```
mcp__n8n-mcp__n8n_update_partial_workflow({
  id: "ZGaGgRA7xywQzn8h",
  intent: "Add Postgres query: devices + last status",
  operations: [{
    type: "addNode",
    node: {
      id: "node-pg-devices-status",
      name: "Get Devices with Last Status",
      type: "n8n-nodes-base.postgres",
      typeVersion: 2.6,
      position: [-400, -120],
      parameters: {
        operation: "executeQuery",
        query: "SELECT d.id, d.name, d.address, d.company_id, c.name AS company_name, r.payload AS status, r.received_at AS status_received_at FROM devices d LEFT JOIN companies c ON c.id = d.company_id LEFT JOIN LATERAL (SELECT payload, received_at FROM reports WHERE device_id = d.id AND type = 'status' ORDER BY received_at DESC LIMIT 1) r ON true WHERE d.id = ANY($1::uuid[]) ORDER BY c.name, d.name",
        options: {
          queryReplacement: "={{ '{' + ($('Validate').first().json.row.device_ids || '').split(',').filter(Boolean).join(',') + '}' }}"
        }
      },
      credentials: {
        postgres: { id: "Kh5BwREIcIPXrGT5", name: "Supabase myHexa" }
      }
    }
  }]
})
```

- [ ] **Step 5.3: Patcher `Build Supervision HTML` pour lire la nouvelle structure**

Le code existant itère sur `$input.all()` pour rendre chaque device. Avec Postgres, `$input.all()` contient directement les rows — chaque item a `name`, `company_name`, `status` (jsonb), `status_received_at`. Il faut ajuster la lecture.

```
mcp__n8n-mcp__n8n_update_partial_workflow({
  id: "ZGaGgRA7xywQzn8h",
  intent: "Update Build Supervision HTML to consume Postgres rows directly",
  operations: [{
    type: "updateNode",
    nodeName: "Build Supervision HTML",
    updates: {
      parameters: {
        jsCode: "function escapeHtml(s) { return String(s ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c])); }\nfunction formatDateTime(iso) { if (!iso) return '\u2014'; const d = new Date(iso); if (isNaN(d.getTime())) return '\u2014'; return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }\nfunction hasActiveAlarm(s) { if (!s || !Array.isArray(s.variables)) return false; return s.variables.some(v => v?.category === 'alarm' && v?.value !== 0 && v?.value !== null && v?.value !== false); }\n\nconst rows = $input.all();\nconst token = $('Validate').first().json?.row?.token || $('Webhook').first().json.query?.t || '';\nconst BASE = 'https://srv1375596.hstgr.cloud/webhook/report/view';\n\nconst items = rows.map(it => {\n  const r = it.json;\n  const status = r.status;\n  const recv = r.status_received_at;\n  const minsSince = recv ? (Date.now() - new Date(recv).getTime()) / 60000 : Infinity;\n  const online = minsSince < 30;\n  const alarm = online && hasActiveAlarm(status);\n  const state = alarm ? { label: 'Alerte', bg: '#fee2e2', fg: '#991b1b' } : online ? { label: 'En ligne', bg: '#dcfce7', fg: '#166534' } : { label: 'Inactif', bg: '#f3f4f6', fg: '#4b5563' };\n  const link = `${BASE}?t=${encodeURIComponent(token)}&d=${encodeURIComponent(r.id)}`;\n  return `<tr><td style=\"padding:12px 14px;border-bottom:1px solid #f3f4f6;\"><a href=\"${link}\" style=\"color:#111;text-decoration:none;font-weight:500;\">${escapeHtml(r.name || '(sans nom)')}</a><div style=\"color:#9ca3af;font-size:12px;\">${escapeHtml(r.company_name || '\u2014')}</div></td><td style=\"padding:12px 14px;border-bottom:1px solid #f3f4f6;color:#555;font-size:13px;\">${escapeHtml(r.address || '\u2014')}</td><td style=\"padding:12px 14px;border-bottom:1px solid #f3f4f6;color:#555;font-size:13px;white-space:nowrap;\">${escapeHtml(formatDateTime(recv))}</td><td style=\"padding:12px 14px;border-bottom:1px solid #f3f4f6;text-align:right;\"><span style=\"display:inline-block;background:${state.bg};color:${state.fg};padding:4px 10px;border-radius:4px;font-size:12px;font-weight:600;\">${state.label}</span></td></tr>`;\n}).join('');\n\nconst html = `<!DOCTYPE html><html lang=\"fr\"><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Supervision</title></head><body style=\"font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111;background:#fafafa;margin:0;padding:32px 16px;\"><div style=\"max-width:960px;margin:0 auto;\"><h1 style=\"margin:0 0 24px 0;font-size:24px;\">Supervision</h1><table style=\"border-collapse:collapse;width:100%;background:#fff;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;\"><thead><tr><th style=\"padding:12px 14px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;background:#fafafa;\">\u00c9quipement</th><th style=\"padding:12px 14px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;background:#fafafa;\">Adresse</th><th style=\"padding:12px 14px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;background:#fafafa;\">Dernier rapport</th><th style=\"padding:12px 14px;text-align:right;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;background:#fafafa;\">\u00c9tat</th></tr></thead><tbody>${items}</tbody></table><p style=\"margin:32px 0 0 0;color:#9ca3af;font-size:12px;text-align:center;\">Lien \u00e9ph\u00e9m\u00e8re \u00b7 Valide 7 jours</p></div></body></html>`;\nreturn [{ json: { html } }];"
      }
    }
  }]
})
```

- [ ] **Step 5.4: Supprimer les nodes Notion + loop obsolètes**

```
mcp__n8n-mcp__n8n_update_partial_workflow({
  id: "ZGaGgRA7xywQzn8h",
  intent: "Remove Notion + loop nodes",
  operations: [
    { type: "removeNode", nodeName: "Explode device IDs" },
    { type: "removeNode", nodeName: "Loop devices" },
    { type: "removeNode", nodeName: "Get Device Page" },
    { type: "removeNode", nodeName: "Get Device Blocks" },
    { type: "removeNode", nodeName: "Parse device status" },
    { type: "removeNode", nodeName: "Aggregate devices" }
  ]
})
```

- [ ] **Step 5.5: Recâbler**

```
mcp__n8n-mcp__n8n_update_partial_workflow({
  id: "ZGaGgRA7xywQzn8h",
  intent: "Wire Postgres query into Supervision",
  operations: [
    { type: "addConnection", source: "If valid", target: "Get Devices with Last Status", branch: "true" },
    { type: "addConnection", source: "Get Devices with Last Status", target: "Build Supervision HTML" }
  ]
})
```

- [ ] **Step 5.6: Valider + réactiver**

```
mcp__n8n-mcp__n8n_validate_workflow({ id: "ZGaGgRA7xywQzn8h", options: { profile: "runtime" } })
mcp__n8n-mcp__n8n_update_partial_workflow({ id: "ZGaGgRA7xywQzn8h", intent: "Reactivate", operations: [{ type: "activateWorkflow" }] })
```

- [ ] **Step 5.7: Test**

Créer une ligne datatable avec plusieurs UUIDs de devices :
```
mcp__n8n-mcp__n8n_manage_datatable({
  action: "insertRows",
  tableId: "RcU1aznrTruL4VC4",
  data: [{
    token: "supervision-test-" + Date.now(),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
    device_ids: "<UUID1>,<UUID2>"
  }],
  returnType: "all"
})
```

```bash
curl "https://srv1375596.hstgr.cloud/webhook/report/supervision?t=<TOKEN>"
```

Expected: HTML 200 avec tableau listant les 2 devices.

---

## Task 6: Refactor TestRepport - DEV

**Files:** Modify workflow `lNN8H7GWvv4dYcqc`.

- [ ] **Step 6.1: Ajouter le Postgres node `Get Recipients`**

```
mcp__n8n-mcp__n8n_update_partial_workflow({
  id: "lNN8H7GWvv4dYcqc",
  intent: "Add Postgres query for recipients",
  operations: [{
    type: "addNode",
    node: {
      id: "node-pg-recipients",
      name: "Get Recipients",
      type: "n8n-nodes-base.postgres",
      typeVersion: 2.6,
      position: [-608, 0],
      parameters: {
        operation: "executeQuery",
        query: "SELECT id, company_id, name, contact_email FROM recipients WHERE contact_email IS NOT NULL",
        options: {}
      },
      credentials: {
        postgres: { id: "Kh5BwREIcIPXrGT5", name: "Supabase myHexa" }
      }
    }
  }]
})
```

- [ ] **Step 6.2: Ajouter le Postgres node `Get Company Devices with Status`**

```
mcp__n8n-mcp__n8n_update_partial_workflow({
  id: "lNN8H7GWvv4dYcqc",
  intent: "Add Postgres query: devices of a company with last status",
  operations: [{
    type: "addNode",
    node: {
      id: "node-pg-company-devices",
      name: "Get Company Devices with Status",
      type: "n8n-nodes-base.postgres",
      typeVersion: 2.6,
      position: [0, 112],
      parameters: {
        operation: "executeQuery",
        query: "SELECT d.id, d.name, d.address, r.payload AS status, r.received_at AS status_received_at FROM devices d LEFT JOIN LATERAL (SELECT payload, received_at FROM reports WHERE device_id = d.id AND type = 'status' ORDER BY received_at DESC LIMIT 1) r ON true WHERE d.company_id = $1 ORDER BY d.name",
        options: { queryReplacement: "={{ $json.company_id }}" }
      },
      credentials: {
        postgres: { id: "Kh5BwREIcIPXrGT5", name: "Supabase myHexa" }
      }
    }
  }]
})
```

- [ ] **Step 6.3: Supprimer les nodes Notion obsolètes**

```
mcp__n8n-mcp__n8n_update_partial_workflow({
  id: "lNN8H7GWvv4dYcqc",
  intent: "Remove Notion nodes",
  operations: [
    { type: "removeNode", nodeName: "Get contacts" },
    { type: "removeNode", nodeName: "Get contact company" },
    { type: "removeNode", nodeName: "Get company devices" },
    { type: "removeNode", nodeName: "Loop devices" },
    { type: "removeNode", nodeName: "Get many child blocks" },
    { type: "removeNode", nodeName: "Parse device status" },
    { type: "removeNode", nodeName: "Aggregate devices" }
  ]
})
```

- [ ] **Step 6.4: Recâbler le flow principal**

```
mcp__n8n-mcp__n8n_update_partial_workflow({
  id: "lNN8H7GWvv4dYcqc",
  intent: "Wire new TestRepport-DEV flow",
  operations: [
    { type: "addConnection", source: "Manual Trigger", target: "Get Recipients" },
    { type: "addConnection", source: "Get Recipients", target: "Loop contacts" },
    { type: "addConnection", source: "Loop contacts", target: "Get Company Devices with Status", branch: "true" },
    { type: "addConnection", source: "Get Company Devices with Status", target: "Generate token" }
  ]
})
```

- [ ] **Step 6.5: Patcher `Generate token` pour utiliser les UUIDs**

Le code existant concatène des Notion IDs. On le patche pour consommer les rows Postgres (`item.json.id`) :

```
mcp__n8n-mcp__n8n_update_partial_workflow({
  id: "lNN8H7GWvv4dYcqc",
  intent: "Patch Generate token to use Supabase UUIDs",
  operations: [{
    type: "updateNode",
    nodeName: "Generate token",
    updates: {
      parameters: {
        jsCode: "const devices = $input.all();\nconst deviceIds = devices.map(d => d.json.id).join(',');\nconst token = Array.from({length: 32}, () => Math.floor(Math.random() * 16).toString(16)).join('');\nconst expiresAt = new Date(Date.now() + 7 * 86400 * 1000).toISOString();\nconst recipient = $('Loop contacts').context.currentRunData || $('Loop contacts').first().json;\nreturn [{ json: { token, expires_at: expiresAt, device_ids: deviceIds, recipient_email: recipient.contact_email, recipient_name: recipient.name, devices } }];"
      }
    }
  }]
})
```

- [ ] **Step 6.6: Patcher `Build email` pour utiliser les nouvelles données**

```
mcp__n8n-mcp__n8n_update_partial_workflow({
  id: "lNN8H7GWvv4dYcqc",
  intent: "Patch Build email to use Postgres data",
  operations: [{
    type: "updateNode",
    nodeName: "Build email",
    updates: {
      parameters: {
        jsCode: "const d = $input.first().json;\nconst supervisionUrl = `https://srv1375596.hstgr.cloud/webhook/report/supervision?t=${encodeURIComponent(d.token)}`;\nconst deviceLines = (d.devices || []).map(dev => `<li>${dev.json.name || '(sans nom)'}</li>`).join('');\nconst html = `<!DOCTYPE html><html><body style=\"font-family:sans-serif;color:#111;\"><h2>Rapport \u00e9quipements</h2><p>Bonjour ${d.recipient_name || ''},</p><p>Voici le lien vers votre supervision (valide 7 jours) :</p><p><a href=\"${supervisionUrl}\">${supervisionUrl}</a></p><p>\u00c9quipements inclus :</p><ul>${deviceLines}</ul></body></html>`;\nreturn [{ json: { to: d.recipient_email, subject: 'Votre lien de supervision \u00e9quipements', html } }];"
      }
    }
  }]
})
```

- [ ] **Step 6.7: Valider**

```
mcp__n8n-mcp__n8n_validate_workflow({ id: "lNN8H7GWvv4dYcqc", options: { profile: "runtime" } })
```

- [ ] **Step 6.8: Test manuel**

Workflow garde son Manual Trigger. Exécuter depuis l'UI n8n (ou via `n8n_test_workflow` en recréant un trigger webhook si besoin) et vérifier :
- 2 emails envoyés (un par recipient actif)
- 2 nouvelles lignes dans le datatable `RcU1aznrTruL4VC4`
- Les liens dans les emails pointent bien vers `/report/supervision?t=...` et fonctionnent (HTML rendu correctement)

---

## Task 7: Validation d'ensemble

**Files:** aucun (tests).

- [ ] **Step 7.1: Inventory des workflows touchant Notion**

Lister tous les workflows actifs et vérifier qu'aucun n'utilise plus la credential `bZvpOZzcwrJOAA4y` (Notion) :

```
mcp__n8n-mcp__n8n_list_workflows({ active: true })
```

Pour chaque workflow actif, récupérer la structure et grep `notionApi`. Expected : 0 occurrence.

- [ ] **Step 7.2: Test end-to-end complet**

Scenario :
1. TestRepport-DEV exécuté → emails envoyés → tokens dans datatable
2. Depuis un des emails, cliquer sur le lien supervision → HTML OK
3. Cliquer sur un device → Report View HTML OK
4. Modifier l'adresse via le formulaire → redirect OK, SQL confirme update
5. Envoyer un status via Ingestion (curl) → reports.count +1, last_connection_at updated
6. Rafraîchir Report View → nouveau status affiché

Expected: tout ce scenario fonctionne sans toucher à Notion.

- [ ] **Step 7.3: Commit d'état mémoire**

Mettre à jour `/home/talbourdet/.claude/projects/-home-talbourdet-T-l-chargements/memory/project_notion_supabase_migration.md` pour marquer sous-projet 4 terminé.

---

## Critères de succès (à valider en fin de plan)

- [ ] Datatable `RcU1aznrTruL4VC4` vidé puis repeuplé par TestRepport-DEV
- [ ] Ingestion : push status → reports row insérée + last_connection_at updated
- [ ] Report View : consultation individuelle → HTML cohérent
- [ ] Location Update : POST → UPDATE OK
- [ ] Supervision : dashboard → HTML avec tous les devices du token
- [ ] TestRepport-DEV : 2 emails envoyés avec liens fonctionnels
- [ ] 0 workflow actif n'utilise plus la credential Notion

---

## Self-Review

**Spec coverage** :
- Wipe datatable → Task 1 ✓
- Refactor Ingestion → Task 2 ✓
- Refactor Report View → Task 3 ✓
- Refactor Location Update → Task 4 ✓
- Refactor Supervision → Task 5 ✓
- Refactor TestRepport-DEV → Task 6 ✓
- Requêtes JOIN LATERAL → dans Tasks 3, 5, 6 ✓
- Validation d'ensemble → Task 7 ✓

**Placeholder scan** :
- `<UUID_OF_TEST_DEVICE>`, `<UUID1>`, `<UUID2>`, `<TOKEN>` : à récupérer en SQL/datatable au moment du test, ces valeurs sont documentées dans les steps de récupération (Task 2.9 pour UUID via SELECT, Task 3.7 pour token via insertRows).
- Pas de « TBD », « fill in details ».

**Type consistency** :
- `d.id` (UUID devices) utilisé partout ✓
- `$('Validate').first().json` expression cohérente dans Report View et Supervision ✓
- Credential `Kh5BwREIcIPXrGT5` référencé partout ✓
- IDs des workflows utilisés consistentement ✓

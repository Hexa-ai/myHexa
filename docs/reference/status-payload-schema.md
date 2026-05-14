# Schéma de payload — Status Report (HaiOS device)

**Version** : 1.0 (2026-04-19)
**Contexte** : payload JSON envoyé par les devices HaiOS vers le webhook `POST /webhook/ingress/status` avec header `Authorization: Bearer <device.token>`. Stocké dans Supabase `reports(device_id, type='status', payload jsonb, received_at)`.

Toute évolution du schéma doit être documentée ici avant d'être consommée par les workflows aval (Report View, Supervision, TestRepport-DEV, email rendering).

---

## Structure racine

```json
{
  "timestamp": "<ISO8601 with timezone>",
  "device": { ... },
  "network": { ... },
  "services": { ... },
  "variables": [ ... ]
}
```

| Champ | Type | Obligatoire | Description |
|---|---|---|---|
| `timestamp` | string ISO8601 | oui | Instant de génération du statut côté device |
| `device` | object | oui | Métadonnées du device |
| `network` | object | oui | État des interfaces réseau |
| `services` | object | oui | État on/off des services système |
| `variables` | array | oui | Liste des variables mesurées / états / alarmes / compteurs |

## `device`

```json
{
  "hostname": "hai-dev",
  "timezone": "Europe/Paris",
  "version": "1.2.16",
  "uptime": 5762
}
```

| Champ | Type | Description |
|---|---|---|
| `hostname` | string | Nom d'hôte Linux du device |
| `timezone` | string | Fuseau horaire (tz database) |
| `version` | string | Version de HaiOS (`major.minor.patch`) |
| `uptime` | number | Uptime en secondes depuis le dernier boot |

## `network`

Objet dont les clés sont les noms d'interfaces. **Interfaces connues** : `eth0`, `eth1`, `wlan0`, `wwan0`, `tailscale`. Toute interface peut être absente ou présente selon le matériel.

### Forme commune à toutes les interfaces

```json
{ "connected": true }
```

### `eth0` / `eth1` (Ethernet)

```json
{
  "connected": false,
  "mode": "dhcp",
  "ip": null,
  "mask": null,
  "gateway": null,
  "dns": []
}
```

| Champ | Type | Description |
|---|---|---|
| `connected` | boolean | Interface up et a obtenu une IP |
| `mode` | `"dhcp"` \| `"static"` | Méthode d'adressage |
| `ip` | string \| null | Adresse IPv4 |
| `mask` | string \| null | Masque réseau |
| `gateway` | string \| null | Gateway |
| `dns` | string[] | Serveurs DNS configurés |

### `wlan0` (Wi-Fi)

```json
{
  "connected": true,
  "ssid": "TERRADITA BC",
  "signal": 92,
  "ip": "192.168.130.33",
  "mask": "255.255.255.0",
  "gateway": "192.168.130.254",
  "dns": ["8.8.4.4"]
}
```

| Champ | Type | Description |
|---|---|---|
| `connected` | boolean | Interface associée et a obtenu une IP |
| `ssid` | string \| null | SSID du point d'accès |
| `signal` | number (0-100) \| null | Pourcentage de qualité signal |
| `ip`, `mask`, `gateway`, `dns` | idem ethernet |

### `wwan0` (4G / Cellulaire)

```json
{
  "connected": false,
  "technology": null,
  "operator": null,
  "signal": null
}
```

| Champ | Type | Description |
|---|---|---|
| `connected` | boolean | Modem enregistré + IP obtenue |
| `technology` | `"lte"` \| `"3g"` \| `"5g"` \| null | Génération |
| `operator` | string \| null | Nom opérateur |
| `signal` | number \| null | Niveau de signal (dB ou %) |

### `tailscale`

```json
{
  "connected": true,
  "ip": "100.104.17.86"
}
```

| Champ | Type | Description |
|---|---|---|
| `connected` | boolean | Connexion Tailscale active |
| `ip` | string \| null | IP 100.64.0.0/10 attribuée par Tailscale |

## `services`

Objet dont les clés sont des noms de services. Chaque valeur a la forme `{ "enabled": boolean }`.

**Services connus** (non exhaustif) :
- `dataplug`
- `notification`
- `daily_report`
- `weekly_report`
- `nodered`
- `grafana`
- `postgresql`
- `codesys`
- `ignition_edge`

```json
{
  "dataplug": { "enabled": true },
  "notification": { "enabled": true },
  "nodered": { "enabled": false }
}
```

**Règle d'évolution** : de nouveaux services peuvent être ajoutés par HaiOS à tout moment. Les workflows aval doivent gérer les clés inconnues sans casser (itérer sur `Object.entries`).

## `variables`

Tableau de variables typées, issues des automatismes industriels ou de simulations.

```json
{
  "name": "NiveauCuve",
  "category": "measure",
  "unit": "m³",
  "type_alarm": null,
  "description": null,
  "value": 0.0,
  "timestamp": "2026-04-16T11:15:07.277000+02:00"
}
```

| Champ | Type | Description |
|---|---|---|
| `name` | string | Identifiant unique de la variable (dans le device) |
| `category` | `"alarm"` \| `"measure"` \| `"state"` \| `"counter"` | Nature de la variable |
| `unit` | string \| null | Unité physique (°C, m³, kWh, etc.) |
| `type_alarm` | `"error"` \| `"warning"` \| null | Gravité pour `category === "alarm"`, sinon null |
| `description` | string \| null | Libellé humain |
| `value` | number | Valeur courante. Pour les alarmes : 0 = inactive, ≠ 0 = active. Pour les booléens (state) : 0/1. |
| `timestamp` | string ISO8601 | Dernière mise à jour de cette variable (peut différer du `timestamp` racine) |

### Catégories

| Category | Usage | Convention value |
|---|---|---|
| `alarm` | Alarmes logiques | 0 = inactive, ≠ 0 = active |
| `measure` | Valeurs physiques analogiques | float avec `unit` |
| `state` | États logiques booléens | 0 ou 1 |
| `counter` | Compteurs monotones (kWh, cycles, etc.) | float croissant, `unit` requis |

### `type_alarm` (pour alarms uniquement)

- `error` : alarme critique (afficher en rouge, notification immédiate)
- `warning` : alarme mineure (afficher en orange, notification moindre)

## Exemple complet

```json
{
  "timestamp": "2026-04-17T15:40:39.937725+02:00",
  "device": {
    "hostname": "hai-dev",
    "timezone": "Europe/Paris",
    "version": "1.2.16",
    "uptime": 5762
  },
  "network": {
    "eth0": { "connected": false, "mode": "dhcp", "ip": null, "mask": null, "gateway": null, "dns": [] },
    "eth1": { "connected": false, "mode": "dhcp", "ip": null, "mask": null, "gateway": null, "dns": [] },
    "wlan0": { "connected": true, "ssid": "TERRADITA BC", "signal": 92, "ip": "192.168.130.33", "mask": "255.255.255.0", "gateway": "192.168.130.254", "dns": ["8.8.4.4"] },
    "wwan0": { "connected": false, "technology": null, "operator": null, "signal": null },
    "tailscale": { "connected": true, "ip": "100.104.17.86" }
  },
  "services": {
    "dataplug": { "enabled": true },
    "notification": { "enabled": true },
    "daily_report": { "enabled": true },
    "weekly_report": { "enabled": true },
    "nodered": { "enabled": false },
    "grafana": { "enabled": false },
    "postgresql": { "enabled": false },
    "codesys": { "enabled": false },
    "ignition_edge": { "enabled": false }
  },
  "variables": [
    { "name": "NiveauBas", "category": "alarm", "unit": null, "type_alarm": "error", "description": "Alarme de niveau d'eau trop bas dans la cuve", "value": 0.0, "timestamp": "2026-04-16T09:52:51.976000+02:00" },
    { "name": "NiveauBassin", "category": "measure", "unit": "m³", "type_alarm": null, "description": null, "value": 150.0, "timestamp": "2026-04-16T11:15:07.277000+02:00" },
    { "name": "NiveauCuve", "category": "measure", "unit": "m³", "type_alarm": null, "description": null, "value": 0.0, "timestamp": "2026-04-16T11:15:07.277000+02:00" },
    { "name": "NiveauHaut", "category": "alarm", "unit": null, "type_alarm": "warning", "description": null, "value": 0.0, "timestamp": "2026-04-16T09:52:51.976000+02:00" },
    { "name": "Pompe", "category": "state", "unit": null, "type_alarm": null, "description": null, "value": 0.0, "timestamp": "2026-04-16T11:15:07.277000+02:00" },
    { "name": "Test_Alarme", "category": "alarm", "unit": null, "type_alarm": "error", "description": "Alarme simulee (0/1)", "value": 0.0, "timestamp": "2026-04-16T08:36:22.689000+02:00" },
    { "name": "Test_Compteur", "category": "counter", "unit": "kWh", "type_alarm": null, "description": "Compteur energie simule", "value": 13958.267, "timestamp": "2026-04-16T08:36:22.689000+02:00" },
    { "name": "Test_Etat", "category": "state", "unit": null, "type_alarm": null, "description": "Etat logique simule (0/1)", "value": 1.0, "timestamp": "2026-04-16T08:36:22.689000+02:00" },
    { "name": "Test_Mesure", "category": "measure", "unit": "C", "type_alarm": null, "description": "Temperature simulee (sinus 24h)", "value": 19.721, "timestamp": "2026-04-16T08:36:22.689000+02:00" }
  ]
}
```

---

## Consommateurs actuels

Workflows qui lisent ce payload :

- `Ingestion` — stocke tel quel dans `reports.payload`
- `Report View` — lit le dernier status via `JOIN LATERAL`, affiche tout (réseau, variables, services)
- `Supervision` — liste plusieurs devices, dérive "En ligne / Alerte / Inactif" + ville + interfaces connectées + nb alarmes
- `TestRepport - DEV` — envoie par email le tableau de devices avec résumé

## Dérivations courantes (helpers)

- **Device en ligne** : `(now - timestamp) < 30 minutes`
- **A une alarme active** : `variables.some(v => v.category === 'alarm' && v.value !== 0)`
- **Nombre d'alarmes critiques** : `variables.filter(v => v.category === 'alarm' && v.type_alarm === 'error' && v.value !== 0).length`
- **Interfaces connectées** : `Object.entries(network).filter(([k, v]) => v?.connected === true).map(([k]) => k)`
- **Services actifs** : `Object.entries(services).filter(([k, v]) => v?.enabled === true).map(([k]) => k)`

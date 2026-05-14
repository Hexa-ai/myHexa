# myHexa — Spécification du provisioning device

Document à destination du développeur firmware. Décrit le flux complet entre le device et la plateforme myHexa : du premier boot (provisioning) à l'envoi récurrent du status et des rapports périodiques.

---

## 1. Vue d'ensemble

Chaque device s'authentifie auprès de la plateforme via un **token unique** stocké en base (table `devices.token`). Plutôt que de pré-générer ce token côté admin et de l'embarquer manuellement dans chaque firmware, le device se le procure tout seul au premier boot via l'endpoint `/provision`.

```
┌──────────┐  1) POST /provision (mac)         ┌───────────────┐
│  Device  │ ─────────────────────────────────▶│  myHexa API   │
│ (boot N°1)│◀──────────────────── token ──────│  (n8n + PG)   │
└──────────┘                                   └───────────────┘
      │
      │  2) Stocke token localement (ex. fichier protégé)
      │
      ▼
┌──────────┐  3) POST /ingress/.../status (Bearer token)
│  Device  │ ─────────────────────────────────▶ ...
│ (boot N+1)│
└──────────┘
```

Cycle de vie :
- **Boot 1 (jamais provisionné)** : le device appelle `/provision` → obtient un token → le sauvegarde localement.
- **Boots suivants** : le device a son token en local, il appelle directement `/ingress/.../status` et `/ingress/.../report/...`.
- **Token perdu** (reset usine, swap hardware) : le device appelle `/provision` → réponse 410 → le client doit contacter l'admin pour réinitialiser le token côté serveur (`UPDATE devices SET token = NULL WHERE id = '...'`), puis le device peut retenter.

Tous les endpoints sont en HTTPS sur :
```
https://srv1375596.hstgr.cloud
```

Le préfixe webhook commun est :
```
/webhook/933e5aba-a9b0-4dfc-bc88-a8c28981013e
```

---

## 2. Endpoint `/provision`

### Requête

```
POST https://srv1375596.hstgr.cloud/webhook/933e5aba-a9b0-4dfc-bc88-a8c28981013e/provision/<hostname>
Content-Type: application/json

{
  "mac": "AA:BB:CC:DD:EE:FF"
}
```

- `<hostname>` : le hostname du device (informatif, utilisé pour le routage et la lisibilité dans les logs serveur). N'est **pas** utilisé pour identifier le device en base.
- `mac` (body, requis) : adresse MAC eth0 du device. Séparateurs `:` ou `-` acceptés. Casse insensible.

### Réponses

| Code | Body                                                            | Action côté device                                                                |
| ---- | --------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 200  | `{"token": "<32-hex>", "id": "<uuid>", "name": "<nom>"}`       | Stocker `token` localement et l'utiliser pour les requêtes suivantes.            |
| 400  | `{"error": "invalid mac format"}`                              | Vérifier le format MAC envoyé.                                                    |
| 404  | `{"error": "device not registered"}`                           | Le device n'est pas enregistré en base. Contacter l'admin pour création.          |
| 410  | `{"error": "already provisioned, contact admin"}`              | Token déjà existant. Demander à l'admin de réinitialiser avant nouvelle tentative.|

### Idempotence

Le serveur **ne régénère jamais** un token existant. Si un device qui a déjà un token tente de se re-provisionner, il reçoit **toujours 410** — même avec la bonne MAC. Cette règle empêche un attaquant de récupérer le token d'un autre device en envoyant sa MAC.

### Pré-requis côté admin

Avant le premier boot d'un device, une ligne doit exister dans la table `devices` Supabase avec :
- `mac_eth0` : MAC eth0 attendue du device
- `token` : `NULL` (laissé vide, sera rempli automatiquement)
- `name` : nom du device
- `company_id` : entreprise propriétaire

---

## 3. Endpoint `/ingress/<hostname>/status` (status temps réel)

Une fois provisionné, le device pousse régulièrement son status via :

### Requête

```
POST https://srv1375596.hstgr.cloud/webhook/933e5aba-a9b0-4dfc-bc88-a8c28981013e/ingress/<hostname>/status
Authorization: Bearer <token>
Content-Type: application/json

{
  "device": {
    "hostname": "<hostname>",
    "version": "1.3.1",
    "uptime": 12345,
    "timezone": "Europe/Paris"
  },
  "network": {
    "eth0":      { "connected": true,  "ip": "192.168.1.10", "mask": "255.255.255.0", "gateway": "192.168.1.1", "dns": ["8.8.8.8"], "mode": "dhcp" },
    "eth1":      { "connected": false, "ip": null,           "mask": null,           "gateway": null,          "dns": [],          "mode": "dhcp" },
    "wlan0":     { "connected": true,  "ip": "...",          "ssid": "WIFI_NAME",    "signal": 75,             "..." : "..." },
    "wwan0":     { "connected": true,  "signal": 62,         "operator": "OperatorName", "technology": "lte" },
    "tailscale": { "connected": true,  "ip": "100.x.x.x" }
  },
  "services": {
    "nodered":      { "enabled": true },
    "grafana":      { "enabled": false },
    "postgresql":   { "enabled": true },
    "..."         : { "enabled": "..." }
  },
  "timestamp": "2026-04-29T08:30:00.000+02:00",
  "variables": [
    { "name": "DEF_MAJEUR_S100", "category": "alarm",   "value": 0,    "unit": null,  "type_alarm": "error",   "timestamp": "...", "description": null },
    { "name": "FIT100_Debit",    "category": "measure", "value": 801.2,"unit": "m³/h","type_alarm": null,      "timestamp": "...", "description": null },
    { "name": "TotalCount",      "category": "counter", "value": 12345,"unit": null,  "type_alarm": null,      "timestamp": "...", "description": null }
  ]
}
```

- `Authorization: Bearer <token>` : token reçu lors du provisioning. **Requis sur tous les `/ingress/*`**.
- `<hostname>` : nom du device (informatif côté URL ; l'authentification se fait via le token).
- Le payload entier est stocké tel quel en base (`reports.payload` jsonb).

### Comportement serveur

- Le serveur upserte une seule ligne `reports` par device de type `status` (1 row par device, écrasée à chaque push). Le timestamp `received_at` est mis à jour.
- Le champ `devices.last_connection_at` est mis à jour automatiquement.
- Le champ `devices.name` est synchronisé sur `body.device.hostname` à chaque appel (si fourni).

### Catégories de variables

| Catégorie | Sens                                       | Affichage                                      |
| --------- | ------------------------------------------ | ---------------------------------------------- |
| `alarm`   | État d'alarme. `value: 0` = inactive ; `value: 1` ou autre truthy = active. | Compteur d'alarmes actives, popups carte rouges. |
| `measure` | Mesure analogique (débit, tension, etc.) | Tableau "Mesures".                             |
| `counter` | Compteur cumulatif                         | Tableau "Compteurs".                           |
| `state`   | État booléen / discret                     | Tableau "États".                               |

### Réponse

`200 OK` (pas de body utile). Tout retour autre indique un problème :
- `401 / 403` : token invalide ou expiré côté base.
- `5xx` : erreur serveur, retry recommandé.

### Fréquence recommandée

1 push toutes les 30–60 secondes. Au-delà de 30 minutes sans push, le device est marqué "Inactif" dans la supervision. Au-delà de 1h, une alerte de connexion perdue est déclenchée vers les destinataires.

---

## 4. Endpoint `/ingress/<hostname>/report/<period>` (rapports périodiques)

### Requête

```
POST https://srv1375596.hstgr.cloud/webhook/933e5aba-a9b0-4dfc-bc88-a8c28981013e/ingress/<hostname>/report/<period>
Authorization: Bearer <token>
Content-Type: application/json

{
  "metadata": {
    "period_str": "20/04/2026 00:00 → 21/04/2026 00:00 (UTC+02:00)"
  },
  "device": { "..." : "..." },
  "variables": [ "..." ]
}
```

- `<period>` ∈ `daily` ou `weekly`.
- `metadata.period_str` doit être au format strict :
  ```
  dd/MM/yyyy HH:mm → dd/MM/yyyy HH:mm (UTC±HH:MM)
  ```
  Le serveur parse cette chaîne pour en déduire `period_start` et `period_end` (date inclusive début, date exclusive fin — donc un weekly 20/04 → 27/04 couvre du 20 inclus au 26 inclus).

### Comportement serveur

- Le serveur upserte sur `(device_id, type, period_start)` (dédup en cas de retry).
- Limite de retention par souscription :
  - `companies.max_daily_reports` (default 7) : nombre de rapports `daily` conservés par device.
  - `companies.max_weekly_reports` (default 4) : idem pour `weekly`.
  - Au-delà, les plus anciens sont supprimés.

### Fréquence recommandée

- `daily` : 1 push par jour, après minuit local du device.
- `weekly` : 1 push par semaine, le lundi matin (couvrant la semaine précédente).

---

## 5. Stockage du token côté device

Recommandations :
- Stocker le token dans un fichier protégé (chmod 600, owner root) ou dans un keystore TPM si disponible.
- Ne jamais logger le token en clair.
- Au démarrage du service, vérifier l'existence du fichier :
  - **Existe et lisible** → utiliser le token pour les pushes.
  - **N'existe pas / vide** → appeler `/provision`, sauvegarder le token retourné.
  - **Reçoit un 401 ou 403 lors d'un push** → le token est invalide côté serveur (révoqué). Effacer le fichier local et ré-appeler `/provision`. Si réponse 410, alerter (admin doit réinitialiser).

### Pseudo-code

```python
import os, json, requests, uuid, sys

API_BASE = "https://srv1375596.hstgr.cloud/webhook/933e5aba-a9b0-4dfc-bc88-a8c28981013e"
TOKEN_FILE = "/var/lib/myhexa/token"
HOSTNAME = os.uname().nodename

def get_mac(iface="eth0"):
    with open(f"/sys/class/net/{iface}/address") as f:
        return f.read().strip()

def load_token():
    try:
        with open(TOKEN_FILE) as f:
            return f.read().strip() or None
    except FileNotFoundError:
        return None

def save_token(token):
    os.makedirs(os.path.dirname(TOKEN_FILE), exist_ok=True)
    with open(TOKEN_FILE, "w") as f:
        f.write(token)
    os.chmod(TOKEN_FILE, 0o600)

def provision():
    mac = get_mac()
    url = f"{API_BASE}/provision/{HOSTNAME}"
    r = requests.post(url, json={"mac": mac}, timeout=10)
    if r.status_code == 200:
        token = r.json()["token"]
        save_token(token)
        return token
    elif r.status_code == 410:
        sys.exit("Token déjà provisionné. Contactez l'admin pour réinitialiser.")
    elif r.status_code == 404:
        sys.exit("Device non enregistré côté serveur.")
    else:
        sys.exit(f"Erreur provisioning : {r.status_code} {r.text}")

def push_status(payload):
    token = load_token() or provision()
    url = f"{API_BASE}/ingress/{HOSTNAME}/status"
    headers = {"Authorization": f"Bearer {token}"}
    r = requests.post(url, json=payload, headers=headers, timeout=10)
    if r.status_code in (401, 403):
        # Token révoqué, retenter
        os.remove(TOKEN_FILE)
        token = provision()
        headers["Authorization"] = f"Bearer {token}"
        r = requests.post(url, json=payload, headers=headers, timeout=10)
    return r.status_code == 200
```

---

## 6. Sécurité

- **Tous les endpoints sont en HTTPS uniquement.** Ne jamais désactiver la vérification du certificat.
- **MAC eth0** est la seule pièce d'identification au provisioning. Une fois le token attribué, il devient l'authent unique.
- **Fenêtre de vulnérabilité au provisioning** : entre la création de la ligne `devices` (admin) et le premier boot du device, un attaquant qui connaîtrait la MAC + l'URL pourrait "voler" le slot. Limiter en pré-enregistrant la ligne juste avant déploiement.
- **Détection de compromission** : si un device légitime reçoit 410 alors qu'il est censé être au premier boot, alerter (le slot a été pris). Reset côté admin.
- **Révocation** : `UPDATE devices SET token = NULL WHERE id = '...'` invalide le token. Le device suivra le flow normal de re-provisioning.

---

## 7. Annexes

### Format MAC accepté

```
AA:BB:CC:DD:EE:FF       (préféré)
aa:bb:cc:dd:ee:ff       (casse insensible)
AA-BB-CC-DD-EE-FF       (séparateur `-` accepté)
```

### Génération du token

Le serveur génère 32 caractères hexadécimaux aléatoires (~128 bits d'entropie). Le device n'a aucun calcul cryptographique à faire — il reçoit un opaque blob qu'il stocke et renvoie tel quel.

### Champ `last_connection_at`

Mis à jour à chaque push `/ingress/*` avec succès. Utilisé pour la détection "Inactif" (> 30 min) et "Lost" (> 1h, déclenche alerte).

### Synchronisation `name`

À chaque push `/ingress/.../status`, le serveur fait :
```sql
UPDATE devices SET name = COALESCE(payload.device.hostname, name) WHERE id = ...
```
Donc si le device change de hostname, le `devices.name` suit. Si le payload n'inclut pas `device.hostname`, le nom existant est préservé.

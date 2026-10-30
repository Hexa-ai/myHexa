# Documentation développeur myHexa

Ce dossier explique comment myHexa est construit. Il est écrit pour quelqu'un qui découvre le dépôt. Chaque affirmation renvoie à un fichier ; si le code change, mettez la doc à jour.

## Parcours de lecture conseillé

| Étape | Document | Durée |
|---|---|---|
| 1 | [Glossaire](glossaire.md) | 10 min |
| 2 | [Architecture](architecture.md) | 15 min |
| 3 | [Ingestion des données et commandes](flux/ingestion.md) | 15 min |
| 4 | [Direct temps réel](flux/temps-reel.md) | 15 min |
| 5 | [Front : structure et conventions](front/README.md) | 20 min |
| 6 | [Modèle de données](backend/donnees.md) puis [Droits et RLS](backend/securite-rls.md) | 30 min |
| 7 | [Edge Functions](backend/edge-functions.md) | 20 min |
| 8 | [Exploitation](exploitation/README.md) avant votre première mise en ligne | 15 min |

Les autres pages se lisent au besoin : [position et météo](flux/position-meteo.md), [alertes et mails](flux/alertes-mails.md), [partage](flux/partage.md), [fonctions SQL](backend/fonctions-sql.md).

## Sommaire complet

- [glossaire.md](glossaire.md)
- [architecture.md](architecture.md)
- front/
  - [README.md](front/README.md) — dossiers de `app/src`, routeur, stores, conventions, ajouter un écran
- backend/
  - [donnees.md](backend/donnees.md) — tables et stockage (buckets)
  - [securite-rls.md](backend/securite-rls.md) — rôles et règles d'accès
  - [fonctions-sql.md](backend/fonctions-sql.md) — fonctions SQL / RPC, déclencheurs, tâches planifiées
  - [edge-functions.md](backend/edge-functions.md) — une section par fonction
- flux/
  - [ingestion.md](flux/ingestion.md) — box → portail, et commandes portail → box
  - [temps-reel.md](flux/temps-reel.md) — le direct, contrat v1/v2, présence
  - [position-meteo.md](flux/position-meteo.md)
  - [alertes-mails.md](flux/alertes-mails.md) — alarmes, push, connectivité, mails de statut, rapports
  - [partage.md](flux/partage.md) — partage de box et de tableaux de bord
- exploitation/
  - [README.md](exploitation/README.md) — TEST/PROD, migrations, déploiements, tests, retour arrière

## Documents existants

| Document | Contenu |
|---|---|
| [device-provisioning.md](device-provisioning.md) | contrat côté box : enregistrement, jeton, adresses |
| [reference/status-payload-schema.md](reference/status-payload-schema.md) | format du statut envoyé par la box |
| [realignement-prod-2026-10.md](realignement-prod-2026-10.md) | comment la prod a été réalignée sur le dépôt (octobre 2026) ; liste des fonctions mortes encore déployées en prod |
| [../supabase/cron-setup.md](../supabase/cron-setup.md) | mise en place manuelle de deux crons |
| `superpowers/specs/`, `superpowers/plans/` | anciennes notes de conception et plans de travail (historique, pas à jour) |

## Conventions de cette documentation

- Les chemins sont relatifs à la racine du dépôt.
- « projet TEST » et « projet PROD » désignent les deux projets Supabase ; leurs références sont dans la configuration locale de l'équipe.
- Les mentions **[hérité]** ou **[mort]** signalent du code ou des documents qui ne servent plus.
- Aucune clé, aucun mot de passe : seuls les **noms** des secrets sont cités.

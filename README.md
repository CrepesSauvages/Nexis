# Nexis

Template de bot Discord extensible par plugins.

Un plugin est un dossier déposé dans `plugins/`. Il apporte des commandes, des listeners d'events, des tâches planifiées, une configuration par serveur, des services consommables par d'autres plugins et des routes pour un futur dashboard — sans modifier le core.

## Démarrer

```bash
npm install
cp .env.example .env      # renseigner DISCORD_TOKEN et DISCORD_CLIENT_ID
npm run deploy-commands   # une fois, pour publier /nexis
npm run dev
```

Puis, sur votre serveur Discord : `/nexis list` pour voir les plugins, `/nexis enable example` pour en activer un.

> Le plugin `example` livré écoute `guildMemberAdd`, ce qui exige l'intent **privilégié** `GuildMembers`. Activez-le manuellement dans le [Discord Developer Portal](https://discord.com/developers/applications) (onglet Bot → Privileged Gateway Intents), sinon le bot échoue à se connecter avec une erreur `DisallowedIntents`.

## Configuration

| Variable            | Défaut          | Rôle                                                                                                                        |
| ------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `DISCORD_TOKEN`     | —               | Requis. Token du bot.                                                                                                       |
| `DISCORD_CLIENT_ID` | —               | Requis. Identifiant de l'application.                                                                                       |
| `OWNER_ID`          | —               | Autorise les commandes marquées `owner`, et requis pour `/nexis errors`.                                                    |
| `LOG_LEVEL`         | `info`          | `debug`, `info`, `warn`, `error`.                                                                                           |
| `STORAGE_DRIVER`    | `json`          | `json` ou `sqlite`. `json` fonctionne sur tout Node 22+ ; `sqlite` nécessite une version de Node avec `node:sqlite` stable. |
| `STORAGE_PATH`      | selon le driver | Emplacement des données.                                                                                                    |
| `PLUGINS_DIR`       | `./plugins`     | Répertoire scanné au démarrage.                                                                                             |
| `SENTRY_DSN`        | —               | Optionnel. Active le reporting d'erreurs vers Sentry si renseigné.                                                          |
| `ERROR_LOG_LIMIT`   | `500`           | Nombre d'erreurs conservées dans le buffer local (`/nexis errors`).                                                         |

## Reporting d'erreurs vers Sentry (optionnel)

`@sentry/node` n'est **pas** installé par défaut en production (`npm ci --omit=dev` ne l'installe pas). Pour l'activer :

1. `npm install @sentry/node` dans votre déploiement.
2. Renseignez `SENTRY_DSN` dans votre environnement.

Sans ces deux étapes, le bot fonctionne normalement — seul le buffer local (`/nexis errors`) reste actif.

## Écrire un plugin

Voir **[docs/PLUGINS.md](docs/PLUGINS.md)**, et `plugins/example/` pour un plugin complet.

## Scripts

| Commande                  | Effet                                               |
| ------------------------- | --------------------------------------------------- |
| `npm run dev`             | Démarre avec rechargement au changement de fichier. |
| `npm start`               | Démarre en production.                              |
| `npm test`                | Lance la suite Vitest.                              |
| `npm run lint`            | ESLint avec correction automatique.                 |
| `npm run format`          | Prettier.                                           |
| `npm run deploy-commands` | Publie les commandes globales vers Discord.         |

## Docker

```bash
docker build -t nexis .
docker run --env-file .env -v "$(pwd)/data:/app/data" nexis
```

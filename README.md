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

## Configuration

| Variable            | Défaut          | Rôle                                     |
| ------------------- | --------------- | ---------------------------------------- |
| `DISCORD_TOKEN`     | —               | Requis. Token du bot.                    |
| `DISCORD_CLIENT_ID` | —               | Requis. Identifiant de l'application.    |
| `OWNER_ID`          | —               | Autorise les commandes marquées `owner`. |
| `LOG_LEVEL`         | `info`          | `debug`, `info`, `warn`, `error`.        |
| `STORAGE_DRIVER`    | `json`          | `json` ou `sqlite`.                      |
| `STORAGE_PATH`      | selon le driver | Emplacement des données.                 |
| `PLUGINS_DIR`       | `./plugins`     | Répertoire scanné au démarrage.          |

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

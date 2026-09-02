# Nexis

Template de bot Discord extensible par plugins.

Un plugin est un dossier déposé dans `plugins/`. Il apporte des commandes, des listeners d'events, des tâches planifiées, une configuration par serveur, des services consommables par d'autres plugins et des routes HTTP servies par le dashboard — sans modifier le core.

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

| Variable                | Défaut                  | Rôle                                                                                                                        |
| ----------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `DISCORD_TOKEN`         | —                       | Requis. Token du bot.                                                                                                       |
| `DISCORD_CLIENT_ID`     | —                       | Requis. Identifiant de l'application.                                                                                       |
| `OWNER_ID`              | —                       | Autorise les commandes marquées `owner`, et requis pour `/nexis errors`.                                                    |
| `LOG_LEVEL`             | `info`                  | `debug`, `info`, `warn`, `error`.                                                                                           |
| `STORAGE_DRIVER`        | `json`                  | `json` ou `sqlite`. `json` fonctionne sur tout Node 22+ ; `sqlite` nécessite une version de Node avec `node:sqlite` stable. |
| `STORAGE_PATH`          | selon le driver         | Emplacement des données.                                                                                                    |
| `PLUGINS_DIR`           | `./plugins`             | Répertoire scanné au démarrage.                                                                                             |
| `SENTRY_DSN`            | —                       | Optionnel. Active le reporting d'erreurs vers Sentry si renseigné.                                                          |
| `ERROR_LOG_LIMIT`       | `500`                   | Nombre d'erreurs conservées dans le buffer local (`/nexis errors`).                                                         |
| `DISCORD_CLIENT_SECRET` | —                       | Optionnel. Sa présence active le dashboard. Sans lui, aucun port n'est ouvert.                                              |
| `DASHBOARD_HOST`        | `127.0.0.1`             | Adresse d'écoute du dashboard.                                                                                              |
| `DASHBOARD_PORT`        | `3000`                  | Port d'écoute du dashboard.                                                                                                 |
| `DASHBOARD_BASE_URL`    | `http://localhost:3000` | Origine publique du dashboard, utilisée comme `redirect_uri` OAuth et pour le `Secure` du cookie.                           |

## Reporting d'erreurs vers Sentry (optionnel)

`@sentry/node` n'est **pas** installé par défaut en production (`npm ci --omit=dev` ne l'installe pas). Pour l'activer :

1. `npm install @sentry/node` dans votre déploiement.
2. Renseignez `SENTRY_DSN` dans votre environnement.

Sans ces deux étapes, le bot fonctionne normalement — seul le buffer local (`/nexis errors`) reste actif.

## Dashboard

Le dashboard s'active en renseignant `DISCORD_CLIENT_SECRET` — sans lui,
aucun port n'est ouvert et le bot démarre normalement. Il tourne dans le
process du bot et sert les routes déclarées par les plugins.

Dans le portail développeur Discord, ajouter l'URL de redirection
`<DASHBOARD_BASE_URL>/auth/callback` à l'application, puis ouvrir
`/auth/login` pour se connecter.

L'écoute se fait sur `127.0.0.1` par défaut. Pour exposer le dashboard,
placer un reverse proxy qui termine le TLS devant lui et renseigner
`DASHBOARD_BASE_URL` avec l'URL publique en `https` — le cookie de session
devient alors `Secure`.

## Internationalisation (i18n)

Nexis traduit ses propres commandes (`/nexis`) dans 8 langues : français, anglais, espagnol, allemand, portugais, italien, néerlandais, polonais.

- **Résolution automatique** : chaque utilisateur voit le bot dans sa propre langue Discord (`interaction.locale`), sans configuration.
- **Override par serveur** : `/nexis locale <langue>` force une langue pour tout le monde sur ce serveur, prioritaire sur la langue individuelle de chacun.
- **Pour les auteurs de plugins** : `ctx.t(locale, key, params?)` et `ctx.resolveLocale(interaction)` sont disponibles sur tout `ctx`, pas seulement le plugin interne. Voir `plugins/example/commands/hello.js` pour un exemple d'usage, y compris le pluriel (`Intl.PluralRules`, aucune règle à écrire à la main).
- Les fichiers de traduction du core vivent dans `src/core/i18n/locales/*.json` — une clé absente dans une langue retombe automatiquement sur le français.
- **Traductions d'un plugin** : un dossier `i18n/<langue>.json` à la racine du plugin (au même niveau que `commands/`/`events/`/`jobs/`) est chargé automatiquement au démarrage, avant `setup()`. Les clés y sont écrites sans préfixe (ex. `"greeting": "Bonjour"`) — Nexis les préfixe lui-même avec le nom du plugin pour éviter toute collision, et elles deviennent utilisables via `ctx.t(locale, '<nom-du-plugin>.greeting')`. Seul `fr.json` est nécessaire ; les langues absentes retombent sur le français du plugin. Voir `plugins/example/i18n/` pour un exemple complet.

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

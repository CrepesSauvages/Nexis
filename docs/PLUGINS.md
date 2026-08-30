# Écrire un plugin Nexis

Un plugin est un dossier dans `plugins/` contenant un `index.js` qui exporte deux choses : `manifest` et `setup`.

```
plugins/
└── mon-plugin/
    └── index.js
```

C'est le minimum. Tout le reste est optionnel.

## Le manifeste

```js
export const manifest = {
  name: 'mon-plugin', // requis, kebab-case, unique
  version: '1.0.0', // requis, semver
  description: 'Ce que fait le plugin',
  dependsOn: ['economy'], // plugins dont les services sont utilisés
  allowDM: false, // recevoir les events hors serveur
  config: {
    // schéma de configuration, par serveur
    channelId: { type: 'channel', label: 'Salon', required: true },
    message: { type: 'string', label: 'Message', default: 'Salut' },
  },
};
```

**Types de configuration disponibles :** `string`, `number`, `boolean`, `channel`, `role`, `user`, `select` (avec `options: [...]`).

Chaque entrée exige un `label` — il sera affiché dans le dashboard. `required` et `default` sont mutuellement exclusifs : une valeur par défaut rend le champ non requis par définition.

**À ce jour, une valeur de configuration ne peut être que celle du `default` déclaré dans le manifeste** — il n'existe encore aucun moyen pour un administrateur de serveur de la modifier (`/nexis config` viendra avec le dashboard, pas avant). Un champ `required: true` sans `default` est donc, pour l'instant, impossible à satisfaire : préférez systématiquement donner un `default` sensé à chaque champ plutôt que de le marquer `required` sans en fournir un.

## setup(ctx)

Appelée une fois au démarrage. Le contexte est la seule surface d'API du core.

```js
export const setup = (ctx) => {
  ctx.registerCommand(maCommande);
  ctx.registerEvent('messageCreate', monHandler);
  ctx.registerJob('0 9 * * *', monJob);
  ctx.registerRoute({ method: 'GET', path: '/stats', auth: 'guild-admin', handler });
  ctx.provideService({ maFonction });
  const economy = ctx.useService('economy');
};
```

### Ce que contient `ctx`

| Propriété             | Description                                                                                           |
| --------------------- | ----------------------------------------------------------------------------------------------------- |
| `ctx.client`          | Le client discord.js. Voir la contrainte ci-dessous.                                                  |
| `ctx.logger`          | Logger préfixé `[plugin:mon-plugin]`. Méthodes `debug`, `info`, `warn`, `error`.                      |
| `ctx.storage`         | Clé/valeur, isolé au plugin. `get`, `set`, `delete`, `keys`.                                          |
| `ctx.config(guildId)` | Configuration résolue pour un serveur : défauts du manifeste fusionnés avec les valeurs enregistrées. |

**Contrainte sur `ctx.client` pendant `setup()` :** le client discord.js réel n'existe pas encore à ce stade (`setup()` s'exécute avant sa création). `ctx.client` n'accepte donc qu'un seul usage synchrone pendant `setup()` : le mémoriser tel quel (`const client = ctx.client`) pour vous en servir plus tard, dans un handler par exemple. Lire une de ses propriétés ou appeler une de ses méthodes **de façon synchrone pendant `setup()`** ne fonctionne pas — une lecture de propriété capture `undefined` pour toujours, et un appel de méthode lève une erreur qui exclut silencieusement le plugin du démarrage.

## Commandes

```js
import { SlashCommandBuilder } from 'discord.js';

export const maCommande = {
  data: new SlashCommandBuilder().setName('hello').setDescription('Dit bonjour'),
  permissions: 'guild-admin', // optionnel : 'guild-admin' ou 'owner'
  async execute(interaction, ctx) {
    const config = await ctx.config(interaction.guildId);
    await interaction.reply({ content: config.message, flags: 64 });
  },
};
```

Les commandes sont enregistrées **par serveur**, au moment où un administrateur active le plugin via `/nexis enable`. Un membre ne voit donc que ce qui est réellement actif chez lui.

Si `execute` lève une erreur, le core répond à l'utilisateur avec un identifiant court et écrit la trace complète dans les logs sous ce même identifiant.

## Events

```js
ctx.registerEvent('guildMemberAdd', async (member) => {
  const config = await ctx.config(member.guild.id);
  // ...
});
```

Le core a déjà vérifié que le plugin est activé sur ce serveur — inutile de le refaire.

**Les intents sont calculés automatiquement** depuis les events déclarés. Écouter `messageCreate` active `GuildMessages` et `MessageContent` sans configuration. Un nom d'event inconnu fait échouer le démarrage plutôt que de rester silencieux : voir `src/core/intents.js` pour la liste supportée.

Par défaut, un plugin ne reçoit rien hors serveur. Mettez `allowDM: true` dans le manifeste pour les messages privés.

## Tâches planifiées

```js
ctx.registerJob('0 9 * * *', async (guildId, config) => {
  // Appelé une fois par serveur où le plugin est activé.
});
```

Le core itère lui-même les serveurs actifs et résout la configuration. Le handler reçoit `(guildId, config)`.

Syntaxe cron standard, gérée par [croner](https://github.com/hexagon/croner).

## Conventions de dossiers

`setup()` est la voie complète, mais pour les cas simples les dossiers suffisent — le core les charge tout seul :

```
plugins/mon-plugin/
├── index.js                      # manifest + setup (même vide)
├── commands/
│   └── ping.js
├── events/
│   └── guild-member-add.js
├── jobs/
│   └── daily.js
└── i18n/
    ├── fr.json
    └── en.json
```

**Chaque fichier exporte par défaut une fabrique qui reçoit `ctx`** et retourne sa déclaration :

```js
// commands/ping.js
export default (ctx) => ({
  data: new SlashCommandBuilder().setName('ping').setDescription('Pong'),
  async execute(interaction) {
    await interaction.reply('pong');
  },
});

// events/guild-member-add.js  →  écoute guildMemberAdd
export default (ctx) => async (member) => {
  ctx.logger.info('Nouveau membre', { userId: member.id });
};

// jobs/daily.js
export default (ctx) => ({
  cron: '0 9 * * *',
  handler: async (guildId, config) => {
    ctx.logger.info('Tâche quotidienne', { guildId });
  },
});
```

La fabrique est ce qui donne à un handler d'event ou de job l'accès au logger, au storage et à la config — sans elle, un module chargé par convention n'aurait aucun chemin vers `ctx`.

Le nom du fichier dans `events/` **est** le nom de l'event, en kebab-case : `guild-member-add.js` écoute `guildMemberAdd`.

Les deux voies coexistent : un plugin peut ranger ses commandes dans `commands/` et déclarer ses services dans `setup()`. C'est ce que fait `plugins/example/`. Les fichiers `.test.js` sont ignorés ; un module sans `export default`, ou dont l'export par défaut n'est pas une fonction, est signalé dans les logs et ignoré, sans empêcher le démarrage.

`i18n/` suit une logique différente des trois autres : ce ne sont pas des fabriques `.js`, mais des fichiers JSON purs (`i18n/<langue>.json`), chargés au démarrage — avant `setup()` — plutôt que via `applyConventions`. Les clés s'y écrivent sans préfixe (`"greeting": "Bonjour"`) : Nexis préfixe lui-même chaque clé avec le nom du plugin pour éviter toute collision avec le core ou un autre plugin, et elles deviennent utilisables via `ctx.t(locale, 'mon-plugin.greeting')`. Seul `fr.json` est nécessaire pour un plugin qui utilise ce mécanisme — les langues absentes retombent sur le français **du plugin**, pas sur celui du core. Voir `plugins/example/i18n/` et `plugins/example/commands/hello.js` pour un exemple complet, pluriel compris.

Ce qui n'a **pas** de convention de dossier — `provideService`, `useService` et `registerRoute` — passe nécessairement par `setup()`.

## Storage

```js
await ctx.storage.set('compteur', 42);
await ctx.storage.get('compteur'); // 42
await ctx.storage.keys('user:'); // ['user:1', 'user:2']
await ctx.storage.delete('compteur');
```

Les clés sont automatiquement préfixées par le nom du plugin : un plugin ne peut ni lire ni écrire hors de son espace.

L'interface est volontairement clé/valeur — c'est ce que JSON, SQLite, Postgres et Mongo peuvent tous honorer. Pour de vraies requêtes, `ctx.storage.raw()` donne le handle natif du driver, au prix de la portabilité.

Pensez à préfixer vos clés par serveur si la donnée est propre à un serveur : `` `guild:${guildId}:compteur` ``.

## Services entre plugins

Exposer :

```js
ctx.provideService({
  async solde(userId) {
    /* ... */
  },
});
```

Consommer — le plugin fournisseur **doit** figurer dans `dependsOn` :

```js
export const manifest = { name: 'boutique', version: '1.0.0', dependsOn: ['economy'] };

export const setup = (ctx) => {
  const economy = ctx.useService('economy');
};
```

Sans la déclaration, `useService` lève une erreur au démarrage. C'est délibéré : `dependsOn` détermine l'ordre d'initialisation, donc une dépendance non déclarée fonctionnerait par hasard, jusqu'au jour où elle ne fonctionnerait plus.

Un plugin ne peut pas être activé sur un serveur si ses dépendances n'y sont pas, et un plugin dont d'autres dépendent ne peut pas être désactivé.

## Routes dashboard

```js
ctx.registerRoute({
  method: 'GET',
  path: '/stats',
  auth: 'guild-admin', // 'public' | 'guild-member' | 'guild-admin' | 'owner'
  handler: async ({ guildId }) => ({ total: 42 }),
});
```

Le path final est `/api/plugins/mon-plugin/stats`. **Ces routes sont collectées et validées, mais aucun serveur ne les sert en v1** — le dashboard viendra s'y brancher sans qu'aucun plugin ne change.

## Cycle de vie

Le code d'un plugin est chargé **une seule fois au démarrage**. L'activation par serveur (`/nexis enable`) est un filtre au runtime : elle n'exécute pas `setup()` une seconde fois. Ajouter ou modifier un plugin demande donc de redémarrer le bot.

Si `setup()` lève une erreur, le plugin est écarté et le bot démarre quand même, avec un message dans les logs.

## Commandes d'administration

| Commande                  | Effet                                          |
| ------------------------- | ---------------------------------------------- |
| `/nexis list`             | Liste les plugins et leur état sur ce serveur. |
| `/nexis enable <plugin>`  | Active un plugin ici.                          |
| `/nexis disable <plugin>` | Le désactive.                                  |
| `/nexis info <plugin>`    | Détail, dépendances et configuration courante. |

Toutes exigent la permission « Gérer le serveur ».

## Tester un plugin

`ctx` est un objet ordinaire — un plugin se teste sans Discord :

```js
import { describe, it, expect, vi } from 'vitest';
import { setup } from './index.js';

it('devrait enregistrer sa commande', () => {
  const ctx = { registerCommand: vi.fn(), registerEvent: vi.fn() /* ... */ };
  setup(ctx);
  expect(ctx.registerCommand).toHaveBeenCalledOnce();
});
```

Voir `plugins/example/` pour un plugin complet et ses tests.

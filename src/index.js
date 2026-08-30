import { config as loadDotenv } from 'dotenv';
import { pathToFileURL } from 'node:url';
import { REST } from 'discord.js';
import { loadConfig } from './config.js';
import { createLogger } from './core/logger.js';
import { createStorage } from './core/storage/index.js';
import { createRegistries } from './core/registry/index.js';
import { createGuildConfig } from './core/guild-config.js';
import { loadPlugins } from './core/loader.js';
import { createContext } from './core/context.js';
import { createErrorReporting } from './core/reporting/index.js';
import { translator, registerPluginLocales } from './core/i18n/index.js';
import { loadPluginLocales } from './core/i18n/plugin-locales.js';
import { createClient } from './core/client.js';
import { attachEventDispatcher, attachCommandDispatcher } from './core/dispatcher.js';
import { createScheduler } from './core/scheduler.js';
import { createCommandSync } from './core/command-sync.js';
import { applyConventions } from './core/conventions.js';

/** Plugins internes, toujours disponibles sans activation. */
export const ALWAYS_ENABLED = ['core'];

/**
 * @typedef {object} NexisApp
 * @property {import('./config.js').NexisConfig} config
 * @property {import('./core/storage/driver.js').StorageDriver} storage
 * @property {import('./core/logger.js').Logger} logger
 * @property {import('./core/registry/index.js').Registries} registries
 * @property {ReturnType<typeof createGuildConfig>} guildConfig
 * @property {import('./core/loader.js').LoadedPlugin[]} plugins
 * @property {Map<string, import('./core/context.js').PluginContext>} contexts
 * @property {ReturnType<typeof createScheduler>} scheduler
 * @property {ReturnType<typeof createCommandSync>} commandSync
 * @property {import('discord.js').Client} client
 * @property {() => Promise<void>} shutdown
 */

/**
 * Assemble l'application sans se connecter à Discord.
 *
 * Les fabriques de client et de REST sont injectables : c'est ce qui
 * permet de tester un boot complet en mémoire, sans token ni réseau.
 *
 * @param {object} [options]
 * @param {Record<string, string | undefined>} [options.env]
 * @param {(opts: { eventNames: string[], allowsDM?: boolean }) => import('discord.js').Client} [options.clientFactory]
 * @param {(token: string) => { put: (route: string, options: { body: unknown }) => Promise<unknown> }} [options.restFactory]
 * @returns {Promise<NexisApp>}
 */
export const bootstrap = async ({
  env = process.env,
  clientFactory = createClient,
  restFactory = (token) => {
    const rest = new REST({ version: '10' }).setToken(token);
    return {
      put: (route, options) => rest.put(/** @type {`/${string}`} */ (route), options),
    };
  },
} = {}) => {
  const config = loadConfig(env);

  const storage = await createStorage(config);
  const errorReporting = createErrorReporting({
    storage,
    sentryDsn: config.sentryDsn,
    limit: config.errorLogLimit,
  });
  const logger = createLogger({ level: config.logLevel, onError: errorReporting.reportAll });
  logger.info('Démarrage de Nexis');

  const registries = createRegistries();
  const guildConfig = createGuildConfig({ storage });
  const plugins = await loadPlugins({ dir: config.pluginsDir, logger });

  // Le client doit exister avant setup() — les plugins le reçoivent dans
  // leur contexte. Les events ne sont connus qu'après setup(), donc on
  // crée le client avec la liste finale : setup() ne doit pas s'en servir
  // pour émettre, seulement le mémoriser.
  const contexts = new Map();
  const commandSync = createCommandSync({
    rest: restFactory(config.token),
    clientId: config.clientId,
    registries,
    guildConfig,
    logger,
    alwaysEnabled: ALWAYS_ENABLED,
  });

  /** @type {import('./core/loader.js').LoadedPlugin[]} */
  const active = [];
  const clientRef = { current: /** @type {import('discord.js').Client | null} */ (null) };
  // ctx.client pendant setup() n'accepte qu'un seul usage : le mémoriser tel
  // quel (`const client = ctx.client`) pour s'en servir plus tard. Lire une
  // de ses propriétés pendant setup() capture `undefined` pour toujours (le
  // vrai client n'existe pas encore) ; y appeler une méthode de façon
  // synchrone pendant setup() lève un TypeError, silencieusement absorbé par
  // le try/catch ci-dessous — le plugin est alors exclu sans autre symptôme.
  const clientProxy = new Proxy(
    {},
    {
      get: (_target, property) => {
        /** @type {unknown} */
        const value = clientRef.current?.[/** @type {never} */ (property)];
        // Une propriété différée qui se trouve être une méthode doit rester
        // liée au vrai client : lue via `client.method()` sur le proxy,
        // `this` vaudrait sinon le proxy lui-même (ou son target vide), pas
        // l'instance réelle — ce qui casse toute méthode s'appuyant sur son
        // état interne (champs privés compris).
        return typeof value === 'function' ? value.bind(clientRef.current) : value;
      },
    },
  );

  for (const plugin of plugins) {
    // Enregistré avant createContext()/setup() : un plugin doit pouvoir
    // traduire ses propres textes dès son premier appel à ctx.t, y compris
    // à l'intérieur de setup() lui-même (ex: description de commande).
    registerPluginLocales(plugin.name, await loadPluginLocales(plugin.dir));

    const context = createContext({
      plugin,
      client: /** @type {import('discord.js').Client} */ (/** @type {unknown} */ (clientProxy)),
      storage,
      logger,
      registries,
      guildConfig,
      privileged: plugin.name === 'core',
      plugins,
      commandSync,
      alwaysEnabled: ALWAYS_ENABLED,
      ownerId: config.ownerId,
      errorReporting: { getRecent: errorReporting.getRecent },
      t: translator.t,
    });

    try {
      await plugin.setup(context);
      await applyConventions({ plugin, ctx: context, logger });
      contexts.set(plugin.name, context);
      active.push(plugin);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`Plugin désactivé — son setup a échoué : ${plugin.name}`, {
        plugin: plugin.name,
        reason: err.message,
        stack: err.stack,
      });
    }
  }

  const allowsDM = active.some((plugin) => plugin.manifest.allowDM === true);
  const client = clientFactory({ eventNames: registries.events.eventNames(), allowsDM });
  clientRef.current = client;

  attachEventDispatcher({
    client,
    plugins: active,
    registries,
    guildConfig,
    logger,
    alwaysEnabled: ALWAYS_ENABLED,
  });

  attachCommandDispatcher({
    client,
    contexts,
    registries,
    guildConfig,
    logger,
    alwaysEnabled: ALWAYS_ENABLED,
    ownerId: config.ownerId,
    t: translator.t,
  });

  const scheduler = createScheduler({
    plugins: active,
    registries,
    guildConfig,
    client,
    logger,
    alwaysEnabled: ALWAYS_ENABLED,
  });
  scheduler.start();

  logger.info('Nexis assemblé', {
    plugins: active.length,
    commands: registries.commands.all().length,
    events: registries.events.eventNames().length,
    jobs: registries.jobs.all().length,
    routes: registries.routes.all().length,
  });

  return {
    config,
    storage,
    logger,
    registries,
    guildConfig,
    plugins: active,
    contexts,
    scheduler,
    commandSync,
    client,
    async shutdown() {
      scheduler.stop();
      await client.destroy?.();
      await storage.close();
      logger.info('Nexis arrêté');
    },
  };
};

/** Démarre le bot : boot complet puis connexion à Discord. */
const main = async () => {
  loadDotenv();
  const app = await bootstrap();
  await app.client.login(app.config.token);

  /** @param {string} signal */
  const stop = async (signal) => {
    app.logger.info(`Signal reçu, arrêt en cours`, { signal });
    await app.shutdown();
    process.exit(0);
  };
  process.on('SIGINT', () => stop('SIGINT'));
  process.on('SIGTERM', () => stop('SIGTERM'));
};

// Ne démarre le bot que si ce fichier est le point d'entrée du processus.
// `pathToFileURL` gère correctement les caractères spéciaux (#, ?) d'un
// chemin, contrairement à une concaténation manuelle en `file://${...}`.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Démarrage impossible : ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  });
}

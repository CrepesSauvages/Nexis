import { DependencyError } from './errors.js';
import { namespaced } from './storage/index.js';
import { resolveLocale } from './i18n/locale-resolver.js';

/**
 * @typedef {object} PluginContext
 * @property {import('discord.js').Client} client
 * @property {import('./logger.js').Logger} logger
 * @property {import('./storage/index.js').NamespacedStorage} storage
 * @property {(guildId: string) => Promise<Record<string, unknown>>} config
 * @property {(command: import('./registry/commands.js').CommandDef) => void} registerCommand
 * @property {(eventName: string, handler: Function) => void} registerEvent
 * @property {(cron: string, handler: Function) => void} registerJob
 * @property {(api: object) => void} provideService
 * @property {(name: string) => object} useService
 * @property {(route: import('./registry/routes.js').RouteDef) => void} registerRoute
 * @property {(locale: string, key: string, params?: Record<string, string | number>) => string} t
 * @property {(interaction: { locale?: string, guildId?: string | null }) => Promise<string>} resolveLocale
 * @property {{ plugins: import('./loader.js').LoadedPlugin[], guildConfig: ReturnType<typeof import('./guild-config.js').createGuildConfig>, commandSync: object | undefined, registries: import('./registry/index.js').Registries, alwaysEnabled: string[], ownerId: string | undefined, errorReporting: { getRecent: (count?: number) => Promise<import('./reporting/driver.js').ReportEntry[]> } | undefined }} [core] - réservé au plugin interne
 */

/**
 * Fabrique le contexte remis à setup(). Tout ce qu'un plugin peut faire
 * passe par cet objet : c'est la seule surface d'API du core.
 *
 * @param {object} options
 * @param {import('./loader.js').LoadedPlugin} options.plugin
 * @param {import('discord.js').Client} options.client
 * @param {import('./storage/driver.js').StorageDriver} options.storage
 * @param {import('./logger.js').Logger} options.logger
 * @param {import('./registry/index.js').Registries} options.registries
 * @param {ReturnType<typeof import('./guild-config.js').createGuildConfig>} options.guildConfig
 * @param {boolean} [options.privileged]
 * @param {import('./loader.js').LoadedPlugin[]} [options.plugins]
 * @param {object} [options.commandSync]
 * @param {string[]} [options.alwaysEnabled]
 * @param {string} [options.ownerId]
 * @param {{ getRecent: (count?: number) => Promise<import('./reporting/driver.js').ReportEntry[]> }} [options.errorReporting]
 * @param {(locale: string, key: string, params?: Record<string, string | number>) => string} [options.t]
 * @returns {PluginContext}
 */
export const createContext = ({
  plugin,
  client,
  storage,
  logger,
  registries,
  guildConfig,
  privileged = false,
  plugins = [],
  commandSync = undefined,
  alwaysEnabled = [],
  ownerId = undefined,
  errorReporting = undefined,
  t = (_locale, key) => `[${key}]`,
}) => {
  const { name, manifest } = plugin;
  const declared = manifest.dependsOn ?? [];

  /** @type {PluginContext} */
  const context = {
    client,
    logger: logger.child(`plugin:${name}`),
    storage: namespaced(storage, `plugin:${name}`),
    config: (guildId) => guildConfig.getConfig(guildId, name, manifest.config),

    registerCommand: (command) => registries.commands.add(name, command),
    registerEvent: (eventName, handler) => registries.events.add(name, eventName, handler),
    registerJob: (cron, handler) => registries.jobs.add(name, cron, handler),
    registerRoute: (route) => registries.routes.add(name, route),
    provideService: (api) => registries.services.provide(name, api),

    t,
    resolveLocale: async (interaction) => {
      const override = interaction.guildId
        ? await guildConfig.getLocale(interaction.guildId)
        : undefined;
      return resolveLocale(interaction, override);
    },

    useService: (serviceName) => {
      if (!declared.includes(serviceName)) {
        throw new DependencyError(
          `Le plugin "${name}" utilise le service "${serviceName}" sans le déclarer. ` +
            `Ajoutez "${serviceName}" à dependsOn dans son manifeste.`,
          { plugin: name, service: serviceName },
        );
      }
      if (!registries.services.has(serviceName)) {
        throw new DependencyError(
          `Le plugin "${serviceName}" ne fournit aucun service via provideService()`,
          { plugin: name, service: serviceName },
        );
      }
      return /** @type {object} */ (registries.services.get(serviceName));
    },
  };

  // Cas particulier unique : le plugin interne pilote l'activation.
  if (privileged) {
    context.core = {
      plugins,
      guildConfig,
      commandSync,
      registries,
      alwaysEnabled,
      ownerId,
      errorReporting,
    };
  }

  return context;
};

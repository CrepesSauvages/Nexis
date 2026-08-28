import { Routes } from 'discord.js';

/**
 * @typedef {object} CommandDataWithJSON
 * @property {string} name
 * @property {() => unknown} [toJSON]
 */

/**
 * @typedef {object} CommandDefWithJSON
 * @property {CommandDataWithJSON} data
 * @property {(interaction: unknown, ctx: unknown) => Promise<void> | void} execute
 * @property {'guild-admin' | 'owner'} [permissions]
 */

/**
 * Pousse les slash commands vers Discord.
 *
 * Les commandes des plugins sont enregistrées **par serveur** : un membre
 * ne voit que ce qui est réellement actif chez lui, et les guild commands
 * se propagent immédiatement — contrairement aux commandes globales, que
 * Discord met en cache environ une heure.
 *
 * Les commandes du plugin interne sont globales : elles doivent exister
 * avant qu'un administrateur puisse activer quoi que ce soit.
 *
 * @param {object} options
 * @param {{ put: (route: string, options: { body: unknown }) => Promise<unknown> }} options.rest
 * @param {string} options.clientId
 * @param {import('./registry/index.js').Registries} options.registries
 * @param {ReturnType<typeof import('./guild-config.js').createGuildConfig>} options.guildConfig
 * @param {import('./logger.js').Logger} options.logger
 * @param {string[]} [options.alwaysEnabled]
 */
export const createCommandSync = ({
  rest,
  clientId,
  registries,
  guildConfig,
  logger,
  alwaysEnabled = [],
}) => {
  /**
   * @param {Array<{ plugin: string, command: CommandDefWithJSON }>} entries
   * @returns {unknown[]}
   */
  const toJSON = (entries) =>
    entries.map(({ command }) =>
      typeof command.data.toJSON === 'function' ? command.data.toJSON() : command.data,
    );

  /**
   * @param {string} route
   * @param {unknown[]} body
   * @param {Record<string, string>} context
   */
  const push = async (route, body, context) => {
    try {
      await rest.put(route, { body });
      logger.info('Commandes synchronisées', { ...context, count: body.length });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`Échec de synchronisation des commandes : ${err.message}`, {
        ...context,
        stack: err.stack,
      });
    }
  };

  return {
    /**
     * Recalcule et pousse les commandes d'un serveur. À appeler après
     * chaque activation ou désactivation de plugin.
     * @param {string} guildId
     */
    async syncGuild(guildId) {
      const enabled = await guildConfig.enabledPlugins(guildId);
      const entries = registries.commands
        .all()
        .filter(({ plugin }) => enabled.includes(plugin) && !alwaysEnabled.includes(plugin));

      await push(Routes.applicationGuildCommands(clientId, guildId), toJSON(entries), { guildId });
    },

    /** Pousse les commandes des plugins internes, visibles partout. */
    async syncGlobal() {
      const entries = registries.commands
        .all()
        .filter(({ plugin }) => alwaysEnabled.includes(plugin));

      await push(Routes.applicationCommands(clientId), toJSON(entries), { scope: 'global' });
    },
  };
};

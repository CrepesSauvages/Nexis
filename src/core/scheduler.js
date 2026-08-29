import { Cron } from 'croner';
import { errorMessage, errorStack } from './errors.js';

/**
 * Exécute les tâches planifiées des plugins.
 *
 * Le core itère lui-même les serveurs où le plugin est actif et appelle
 * le handler une fois par serveur, avec la config résolue. Aucun plugin
 * n'a donc à réimplémenter ce filtre — et aucun ne peut se tromper en
 * l'implémentant.
 *
 * @param {object} options
 * @param {import('./loader.js').LoadedPlugin[]} options.plugins
 * @param {import('./registry/index.js').Registries} options.registries
 * @param {ReturnType<typeof import('./guild-config.js').createGuildConfig>} options.guildConfig
 * @param {import('discord.js').Client} options.client
 * @param {import('./logger.js').Logger} options.logger
 * @param {string[]} [options.alwaysEnabled]
 */
export const createScheduler = ({
  plugins,
  registries,
  guildConfig,
  client,
  logger,
  alwaysEnabled = [],
}) => {
  const manifests = new Map(plugins.map((plugin) => [plugin.name, plugin.manifest]));
  /** @type {Cron[]} */
  const crons = [];

  /**
   * @param {{ plugin: string, cron: string, handler: Function }} job
   */
  const runJob = async ({ plugin, handler }) => {
    const schema = manifests.get(plugin)?.config;

    for (const guild of client.guilds.cache.values()) {
      try {
        const active =
          alwaysEnabled.includes(plugin) || (await guildConfig.isEnabled(guild.id, plugin));
        if (!active) continue;

        const config = await guildConfig.getConfig(guild.id, plugin, schema);
        await handler(guild.id, config);
      } catch (error) {
        logger.error(`Erreur dans une tâche planifiée : ${errorMessage(error)}`, {
          plugin,
          guildId: guild.id,
          stack: errorStack(error),
        });
      }
    }
  };

  return {
    runJob,

    /**
     * Programme tous les jobs enregistrés.
     * @returns {number} nombre de jobs effectivement programmés
     */
    start() {
      for (const job of registries.jobs.all()) {
        try {
          crons.push(new Cron(job.cron, () => runJob(job)));
        } catch (error) {
          logger.error(`Expression cron invalide, tâche ignorée : ${errorMessage(error)}`, {
            plugin: job.plugin,
            cron: job.cron,
          });
        }
      }
      return crons.length;
    },

    stop() {
      for (const cron of crons) cron.stop();
      crons.length = 0;
    },
  };
};

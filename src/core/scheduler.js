import { Cron } from 'croner';
import { errorMessage, errorStack } from './errors.js';

/**
 * Serveurs traités en parallèle par une même tâche. Un compromis : en
 * série, une tâche de 200 ms sur mille serveurs tient trois minutes et
 * déborde sur son exécution suivante ; d'un seul bloc, elle ouvrirait
 * mille appels simultanés à Discord.
 */
const DEFAULT_CONCURRENCY = 10;

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
 * @param {string} [options.timezone] - fuseau IANA dans lequel lire les expressions cron
 * @param {number} [options.concurrency]
 */
export const createScheduler = ({
  plugins,
  registries,
  guildConfig,
  client,
  logger,
  alwaysEnabled = [],
  timezone = undefined,
  concurrency = DEFAULT_CONCURRENCY,
}) => {
  const manifests = new Map(plugins.map((plugin) => [plugin.name, plugin.manifest]));
  /** @type {Cron[]} */
  const crons = [];

  /**
   * @param {{ plugin: string, cron: string, handler: Function }} job
   */
  const runJob = async ({ plugin, handler }) => {
    const schema = manifests.get(plugin)?.config;

    /**
     * Un serveur, isolé : son échec ne doit pas priver les autres de leur
     * exécution — même règle que les handlers d'events.
     * @param {{ id: string }} guild
     */
    const runFor = async (guild) => {
      try {
        const active =
          alwaysEnabled.includes(plugin) || (await guildConfig.isEnabled(guild.id, plugin));
        if (!active) return;

        const config = await guildConfig.getConfig(guild.id, plugin, schema);
        await handler(guild.id, config);
      } catch (error) {
        logger.error(`Erreur dans une tâche planifiée : ${errorMessage(error)}`, {
          plugin,
          guildId: guild.id,
          stack: errorStack(error),
        });
      }
    };

    // Par vagues, et non toutes en même temps : voir DEFAULT_CONCURRENCY.
    // Chaque `runFor` avale déjà ses erreurs, `Promise.all` ne peut donc
    // pas rejeter ni écourter la vague.
    const guilds = [...client.guilds.cache.values()];
    for (let index = 0; index < guilds.length; index += concurrency) {
      await Promise.all(guilds.slice(index, index + concurrency).map(runFor));
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
          crons.push(
            new Cron(
              job.cron,
              {
                // Sans cela, une tâche plus lente que son intervalle se
                // recouvre elle-même : deux exécutions concurrentes sur les
                // mêmes serveurs, avec les doublons que cela implique.
                // Le saut est journalisé plutôt que silencieux — c'est le
                // signe que l'intervalle est trop court pour le travail.
                protect: () =>
                  logger.warn('Tâche encore en cours, exécution ignorée', {
                    plugin: job.plugin,
                    cron: job.cron,
                  }),
                ...(timezone ? { timezone } : {}),
              },
              () => runJob(job),
            ),
          );
        } catch (error) {
          logger.error(`Expression cron invalide, tâche ignorée : ${errorMessage(error)}`, {
            plugin: job.plugin,
            cron: job.cron,
          });
        }
      }
      return crons.length;
    },

    /**
     * Les tâches effectivement armées. Utile pour vérifier ce qui tourne
     * — et pour le dire un jour à un administrateur.
     * @returns {Cron[]}
     */
    armed() {
      return [...crons];
    },

    stop() {
      for (const cron of crons) cron.stop();
      crons.length = 0;
    },
  };
};

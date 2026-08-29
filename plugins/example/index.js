/**
 * Un manifeste décrit le plugin sans l'exécuter. Le futur dashboard le
 * lit tel quel pour générer un formulaire de configuration.
 */
export const manifest = {
  name: 'example',
  version: '1.0.0',
  description: 'Plugin de démonstration couvrant tout le contrat Nexis',
  allowDM: false,
  config: {
    greeting: {
      type: 'string',
      label: 'Formule de salutation',
      default: 'Bienvenue',
    },
    announce: {
      type: 'boolean',
      label: 'Envoyer un message privé aux nouveaux membres',
      default: false,
    },
  },
};

/**
 * Appelé une fois au démarrage.
 *
 * La commande et le handler d'event de ce plugin ne sont pas déclarés
 * ici : ils vivent dans `commands/hello.js` et `events/guild-member-add.js`,
 * que le core charge tout seul. Route et service n'ont aucune convention
 * de dossier — ils passent nécessairement par setup(). Le job, lui, a une
 * convention de dossier (`jobs/`) ; il est déclaré ici volontairement pour
 * montrer que les deux voies coexistent sur un même plugin.
 *
 * @param {import('../../src/core/context.js').PluginContext} ctx
 */
export const setup = (ctx) => {
  // Le core appelle ce handler une fois par serveur où le plugin est
  // activé, avec la configuration déjà résolue.
  ctx.registerJob(
    '0 9 * * *',
    /**
     * @param {string} guildId
     * @param {Record<string, unknown>} config
     */
    async (guildId, config) => {
      ctx.logger.info('Récapitulatif quotidien', { guildId, greeting: config.greeting });
    },
  );

  // Collectée et validée maintenant ; servie par le dashboard plus tard.
  ctx.registerRoute({
    method: 'GET',
    path: '/greetings',
    auth: 'guild-admin',
    /** @param {{ guildId: string }} params */
    handler: async ({ guildId }) => ({
      guildId,
      // Le compteur agrège volontairement tous les serveurs : `greeted:`
      // n'est préfixé que par utilisateur (voir hello.js), pas par guild.
      // Une vraie route par serveur préfixerait ses clés par `guildId`,
      // comme le recommande docs/PLUGINS.md (section Storage).
      total: (await ctx.storage.keys('greeted:')).length,
    }),
  });

  // Exposé aux plugins qui déclarent `dependsOn: ['example']`.
  ctx.provideService({
    /** @param {string} guildId */
    async greetingFor(guildId) {
      return (await ctx.config(guildId)).greeting;
    },
  });
};

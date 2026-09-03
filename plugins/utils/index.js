/**
 * Un manifeste décrit le plugin sans l'exécuter. Son schéma `config`
 * existe pour qu'une interface de configuration puisse générer un formulaire, mais rien ne le lit encore.
 */
export const manifest = {
  name: 'utils',
  version: '1.0.0',
  description: 'Commandes et services utilitaires pour les autres plugins',
  allowDM: false,
  config: {},
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
  // Exposé aux plugins qui déclarent `dependsOn: ['example']`.
  ctx.provideService({
    /** @param {string} userId */
    async getUserInfo(userId) {
      const user = await ctx.client.users.fetch(userId).catch(() => null);
      if (!user) return null;

      const guilds = ctx.client.guilds.cache.filter((g) => g.members.cache.has(userId));
      const guildInfos = await Promise.all(
        guilds.map(async (g) => {
          const member = await g.members.fetch(userId).catch(() => null);
          return {
            guildId: g.id,
            guildName: g.name,
            nickname: member?.nickname ?? null,
            joinedAt: member?.joinedAt ?? null,
          };
        }),
      );

      return {
        id: user.id,
        username: user.username,
        discriminator: user.discriminator,
        bot: user.bot,
        createdAt: user.createdAt,
        guilds: guildInfos,
      };
    },
  });
};

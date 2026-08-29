export const manifest = { name: 'client-later-method', version: '1.0.0' };

/**
 * Mémorise `ctx.client` en entier pendant setup() (comme `client-later`),
 * mais appelle ensuite une MÉTHODE dessus plutôt que de lire une propriété.
 * Sans liaison (`bind`) au vrai client dans le proxy, `this` vaudrait le
 * proxy au moment de l'appel — et la méthode de test plante volontairement
 * si `this` n'est pas la vraie instance (champ privé inaccessible sinon).
 * @param {import('../../../../src/core/context.js').PluginContext} ctx
 */
export const setup = (ctx) => {
  const client = ctx.client;
  ctx.registerEvent('guildMemberAdd', async () => {
    await ctx.storage.set(
      'secret',
      /** @type {{ revealSecret: () => string }} */ (
        /** @type {unknown} */ (client)
      ).revealSecret(),
    );
  });
};

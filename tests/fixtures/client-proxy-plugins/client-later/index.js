export const manifest = { name: 'client-later', version: '1.0.0' };

/**
 * Mémorise `ctx.client` en entier pendant setup() — pas une de ses
 * propriétés — et ne le déréférence qu'au moment où l'event arrive,
 * une fois le vrai client en place. C'est le seul usage valide de
 * `ctx.client` pendant setup().
 * @param {import('../../../../src/core/context.js').PluginContext} ctx
 */
export const setup = (ctx) => {
  const client = ctx.client;
  ctx.registerEvent('guildMemberAdd', async () => {
    await ctx.storage.set('guildsSeen', client.guilds.cache.size);
  });
};

export const manifest = {
  name: 'alpha',
  version: '1.0.0',
  description: 'Plugin de test',
  config: {
    greeting: { type: 'string', label: 'Salutation', default: 'Bonjour' },
  },
};

/**
 * @param {import('../../../../src/core/context.js').PluginContext} ctx
 */
export const setup = (ctx) => {
  // Compte les appels reçus : c'est l'observable du test d'intégration.
  ctx.registerEvent('guildMemberAdd', async () => {
    const seen = /** @type {number} */ ((await ctx.storage.get('vus')) ?? 0);
    await ctx.storage.set('vus', seen + 1);
  });
};

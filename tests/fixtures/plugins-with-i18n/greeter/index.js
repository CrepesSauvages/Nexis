export const manifest = { name: 'greeter', version: '1.0.0', description: 'Plugin de test i18n' };

/**
 * @param {import('../../../../src/core/context.js').PluginContext} ctx
 */
export const setup = async (ctx) => {
  // Preuve que les traductions du plugin sont déjà enregistrées au moment
  // où setup() s'exécute — pas seulement plus tard, au premier appel réel.
  ctx.registerJob('0 0 * * *', async () => {});
  await ctx.storage.set('setup_fr', ctx.t('fr', 'greeter.greeting'));
  await ctx.storage.set('setup_en', ctx.t('en', 'greeter.greeting'));
  await ctx.storage.set('setup_de_fallback', ctx.t('de', 'greeter.greeting'));
};

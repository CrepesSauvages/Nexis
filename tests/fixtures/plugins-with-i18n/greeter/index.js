export const manifest = {
  name: 'greeter',
  version: '1.0.0',
  // `desc` et `label.greeting` sont des clés de traduction ; `Salon des logs`
  // n'en est pas une, et doit donc ressortir tel quel. Les deux cas sont
  // nécessaires : sans le second, un helper qui traduirait tout passerait.
  description: 'desc',
  config: {
    greeting: { type: 'string', label: 'label.greeting', default: 'Bonjour' },
    logs: { type: 'channel', label: 'Salon des logs', required: true },
    // `label.mode` est traduite, comme `label.greeting` ci-dessus. Une des
    // options, `option.strict`, est *aussi* une clé de traduction du plugin :
    // un helper qui traduirait tout le schéma (label ET options) la
    // changerait alors que `validateConfigValues` doit continuer à recevoir
    // les valeurs exactes du manifeste — voir tests/core/http/core-routes-schema.test.js.
    mode: { type: 'select', label: 'label.mode', options: ['option.strict', 'doux'] },
  },
};

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

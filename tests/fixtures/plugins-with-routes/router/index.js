export const manifest = {
  name: 'router',
  version: '1.0.0',
  description: 'Fixture exposant deux routes HTTP',
};

/**
 * Dossier de fixtures dédié : les listes exactes de plugins attendues par
 * bootstrap.test.js et loader.test.js portent sur `fixtures/plugins`, et
 * y ajouter un plugin les casserait.
 *
 * @param {import('../../../../src/core/context.js').PluginContext} ctx
 */
export const setup = (ctx) => {
  ctx.registerRoute({
    method: 'GET',
    path: '/ping',
    auth: 'public',
    handler: async () => ({ pong: true }),
  });

  ctx.registerRoute({
    method: 'GET',
    path: '/boom',
    auth: 'public',
    handler: async () => {
      throw new Error('handler cassé');
    },
  });
};

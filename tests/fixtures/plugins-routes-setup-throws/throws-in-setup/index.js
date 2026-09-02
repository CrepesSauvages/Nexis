// Enregistre sa route puis échoue : reproduit le cas où registerRoute()
// s'exécute avant l'exception qui fait exclure le plugin de `active`
// (bootstrap() dans src/index.js). Dossier dédié pour ne pas perturber les
// listes exactes de plugins attendues par tests/bootstrap.test.js et
// tests/core/loader.test.js.
export const manifest = { name: 'throws-in-setup', version: '1.0.0' };

/** @param {import('../../../../src/core/context.js').PluginContext} ctx */
export const setup = (ctx) => {
  ctx.registerRoute({
    method: 'GET',
    path: '/ping',
    auth: 'public',
    handler: async () => ({ pong: true }),
  });
  throw new Error('boom après avoir enregistré une route');
};

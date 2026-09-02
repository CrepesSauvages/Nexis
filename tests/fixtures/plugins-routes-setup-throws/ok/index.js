// Plugin valide, voisin de throws-in-setup : prouve que sa route reste
// servie même quand un autre plugin du même dossier échoue à son setup().
export const manifest = { name: 'ok', version: '1.0.0' };

/** @param {import('../../../../src/core/context.js').PluginContext} ctx */
export const setup = (ctx) => {
  ctx.registerRoute({
    method: 'GET',
    path: '/ping',
    auth: 'public',
    handler: async () => ({ pong: true }),
  });
};

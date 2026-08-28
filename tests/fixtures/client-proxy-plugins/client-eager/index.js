export const manifest = { name: 'client-eager', version: '1.0.0' };

/**
 * Appelle une méthode de `ctx.client` de façon synchrone pendant setup().
 * Le vrai client n'existe pas encore à ce stade : `ctx.client` n'est
 * qu'un proxy vide, `.on` y est `undefined`, et l'appel lève un
 * TypeError — intentionnellement, pour documenter ce piège.
 * @param {import('../../../../src/core/context.js').PluginContext} ctx
 */
export const setup = (ctx) => {
  ctx.client.on('x', () => {});
};

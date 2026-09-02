import { PluginError } from '../errors.js';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const AUTH_LEVELS = ['public', 'guild-member', 'guild-admin', 'owner'];

/**
 * @typedef {object} RouteDef
 * @property {string} method
 * @property {string} path - relatif au plugin, doit commencer par /
 * @property {string} auth
 * @property {Function} handler
 */

/**
 * Registre des routes HTTP : collecte, validation et enregistrement.
 * Lorsque le dashboard est activé, son routeur sert ces routes.
 */
export const createRouteRegistry = () => {
  /** @type {Array<RouteDef & { plugin: string }>} */
  const entries = [];

  return {
    /**
     * @param {string} plugin
     * @param {RouteDef} route
     */
    add(plugin, route) {
      const { method, path, auth, handler } = route ?? {};
      if (!METHODS.includes(method)) {
        throw new PluginError(`Méthode HTTP invalide : "${method}"`, { plugin, method, METHODS });
      }
      if (typeof path !== 'string' || !path.startsWith('/')) {
        throw new PluginError(`Le path doit commencer par "/" : "${path}"`, { plugin, path });
      }
      if (!AUTH_LEVELS.includes(auth)) {
        throw new PluginError(`Niveau auth invalide : "${auth}"`, { plugin, auth, AUTH_LEVELS });
      }
      if (typeof handler !== 'function') {
        throw new PluginError('Handler de route non fonction', { plugin, path });
      }

      const fullPath = `/api/plugins/${plugin}${path}`;
      if (entries.some((entry) => entry.method === method && entry.path === fullPath)) {
        throw new PluginError(`Route déjà déclarée : ${method} ${fullPath}`, { plugin, fullPath });
      }
      entries.push({ plugin, method, path: fullPath, auth, handler });
    },
    /**
     * @returns {Array<RouteDef & { plugin: string }>}
     */
    all() {
      return [...entries];
    },
  };
};

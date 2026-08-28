import { PluginError } from '../errors.js';

export const createServiceRegistry = () => {
  /** @type {Map<string, object>} */
  const entries = new Map();

  return {
    /**
     * @param {string} plugin - le service porte le nom de son plugin
     * @param {object} api
     */
    provide(plugin, api) {
      if (entries.has(plugin)) {
        throw new PluginError(`Le plugin "${plugin}" fournit déjà un service`, { plugin });
      }
      entries.set(plugin, api);
    },
    /**
     * @param {string} plugin
     * @returns {object | undefined}
     */
    get(plugin) {
      return entries.get(plugin);
    },
    /**
     * @param {string} plugin
     * @returns {boolean}
     */
    has(plugin) {
      return entries.has(plugin);
    },
  };
};

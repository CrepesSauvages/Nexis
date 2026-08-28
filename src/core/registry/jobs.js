import { PluginError } from '../errors.js';

export const createJobRegistry = () => {
  /** @type {Array<{ plugin: string, cron: string, handler: Function }>} */
  const entries = [];

  return {
    /**
     * @param {string} plugin
     * @param {string} cron - expression cron acceptée par croner
     * @param {Function} handler
     */
    add(plugin, cron, handler) {
      if (!cron || typeof cron !== 'string') {
        throw new PluginError('Expression cron manquante ou invalide', { plugin, cron });
      }
      if (typeof handler !== 'function') {
        throw new PluginError('Handler de job non fonction', { plugin, cron });
      }
      entries.push({ plugin, cron, handler });
    },
    /**
     * @returns {Array<{ plugin: string, cron: string, handler: Function }>}
     */
    all() {
      return [...entries];
    },
  };
};

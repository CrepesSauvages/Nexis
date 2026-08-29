const KEY = 'core:errors';
const DEFAULT_LIMIT = 500;

/**
 * Reporter local : buffer circulaire écrit dans le storage déjà construit,
 * sous la clé réservée `core:errors` (même convention que les clés `core:*`
 * de guild-config.js). Ne définit aucune nouvelle abstraction de storage.
 *
 * @param {{ storage: import('../../storage/driver.js').StorageDriver, limit?: number }} options
 */
export const createLocalReporter = ({ storage, limit = DEFAULT_LIMIT }) => ({
  /** @param {import('../driver.js').ReportEntry} entry */
  async report(entry) {
    const current = /** @type {import('../driver.js').ReportEntry[]} */ (
      (await storage.get(KEY)) ?? []
    );
    const next = [...current, entry].slice(-limit);
    await storage.set(KEY, next);
  },

  /**
   * @param {number} [count]
   * @returns {Promise<import('../driver.js').ReportEntry[]>}
   */
  async getRecent(count = 25) {
    const current = /** @type {import('../driver.js').ReportEntry[]} */ (
      (await storage.get(KEY)) ?? []
    );
    return current.slice(-count).reverse();
  },
});

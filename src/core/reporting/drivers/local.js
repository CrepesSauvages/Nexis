const KEY = 'core:errors';
const DEFAULT_LIMIT = 500;

/**
 * Reporter local : buffer circulaire écrit dans le storage déjà construit,
 * sous la clé réservée `core:errors` (même convention que les clés `core:*`
 * de guild-config.js). Ne définit aucune nouvelle abstraction de storage.
 *
 * @param {{ storage: import('../../storage/driver.js').StorageDriver, limit?: number }} options
 */
export const createLocalReporter = ({ storage, limit = DEFAULT_LIMIT }) => {
  // Même mécanisme que la file de json.js : `onError` (logger.js) appelle
  // reportAll() sans l'attendre, donc deux report() peuvent partir en même
  // temps. Sans sérialisation, leurs get→set s'entrelacent et le second
  // set() écrase le premier, perdant une entrée en silence. `queue` force
  // chaque get→build→set à attendre la fin du set() précédent. Un échec ne
  // doit pas bloquer les rapports suivants : `queue` avale l'erreur pour
  // continuer à accepter des report(), mais `attempt` (ce que reçoit
  // l'appelant, ici reportAll via son propre .catch()) la propage toujours.
  /** @type {Promise<void>} */
  let queue = Promise.resolve();

  return {
    /**
     * @param {import('../driver.js').ReportEntry} entry
     * @returns {Promise<void>}
     */
    report(entry) {
      const attempt = queue.then(async () => {
        const current = /** @type {import('../driver.js').ReportEntry[]} */ (
          (await storage.get(KEY)) ?? []
        );
        const next = [...current, entry].slice(-limit);
        await storage.set(KEY, next);
      });
      queue = attempt.catch(() => undefined);
      return attempt;
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
  };
};

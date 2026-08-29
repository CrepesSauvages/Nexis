import { ConfigError } from '../errors.js';
import { createJsonDriver } from './drivers/json.js';

/**
 * Fabriques de driver disponibles, chacune paresseuse : `sqlite` n'importe
 * `./drivers/sqlite.js` (donc `node:sqlite`) qu'au moment où ce driver est
 * effectivement demandé. Un import statique ferait échouer le chargement
 * de CE module — et donc tout boot — sur une version de Node où
 * `node:sqlite` n'existe pas, même pour un utilisateur qui ne se sert que
 * du driver `json`.
 * @type {Record<string, (options: { path: string }) => Promise<import('./driver.js').StorageDriver> | import('./driver.js').StorageDriver>}
 */
const FACTORIES = {
  json: createJsonDriver,
  sqlite: async (options) => {
    try {
      const { createSqliteDriver } = await import('./drivers/sqlite.js');
      return createSqliteDriver(options);
    } catch (error) {
      throw new ConfigError(
        'Le driver sqlite nécessite le module natif node:sqlite, indisponible sur cette version de Node. ' +
          'Utilisez STORAGE_DRIVER=json, ou mettez à jour Node.',
        { cause: error instanceof Error ? error.message : String(error) },
      );
    }
  },
};

/**
 * Résout le driver depuis la configuration et l'initialise.
 * @param {Pick<import('../../config.js').NexisConfig, 'storage'>} config
 * @returns {Promise<import('./driver.js').StorageDriver>}
 */
export const createStorage = async (config) => {
  const factory = FACTORIES[/** @type {keyof typeof FACTORIES} */ (config.storage.driver)];
  if (!factory) {
    throw new ConfigError(`Driver de storage inconnu : "${config.storage.driver}"`, {
      driver: config.storage.driver,
      available: Object.keys(FACTORIES),
    });
  }
  const driver = await factory({ path: config.storage.path });
  await driver.init();
  return driver;
};

/**
 * Vue restreinte d'un `StorageDriver` : seules les opérations sûres pour
 * un plugin (données, pas cycle de vie du handle partagé).
 * @typedef {Pick<import('./driver.js').StorageDriver, 'get' | 'set' | 'delete' | 'keys' | 'raw'>} NamespacedStorage
 */

/**
 * Enveloppe un driver dans un préfixe de clés. C'est ce qui garantit
 * qu'un plugin ne peut ni lire ni écrire hors de son espace via
 * get/set/delete/keys. `raw()` reste l'échappatoire documentée du driver
 * sous-jacent : elle expose tout le store, pas la seule tranche du
 * namespace — un plugin qui l'utilise sort volontairement de son espace.
 *
 * `init`/`close` sont volontairement absents du résultat : `ctx.storage`
 * (ce que reçoit chaque plugin) est exactement ce retour, et exposer
 * `close()` permettrait à un plugin de fermer le handle GLOBAL partagé
 * par le core et tous les autres plugins. Le cycle de vie du driver
 * appartient uniquement à `bootstrap()`, sur le driver non namespacé.
 *
 * @param {import('./driver.js').StorageDriver} driver
 * @param {string} prefix
 * @returns {NamespacedStorage}
 */
export const namespaced = (driver, prefix) => {
  /** @param {string} key */
  const full = (key) => `${prefix}:${key}`;

  return {
    get: (key) => driver.get(full(key)),
    set: (key, value) => driver.set(full(key), value),
    delete: (key) => driver.delete(full(key)),
    keys: async (sub = '') => {
      const found = await driver.keys(full(sub));
      return found.map((key) => key.slice(prefix.length + 1));
    },
    raw: () => driver.raw(),
  };
};

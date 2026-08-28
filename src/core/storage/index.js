import { ConfigError } from '../errors.js';
import { createJsonDriver } from './drivers/json.js';
import { createSqliteDriver } from './drivers/sqlite.js';

const FACTORIES = {
  json: createJsonDriver,
  sqlite: createSqliteDriver,
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
  const driver = factory({ path: config.storage.path });
  await driver.init();
  return driver;
};

/**
 * Enveloppe un driver dans un préfixe de clés. C'est ce qui garantit
 * qu'un plugin ne peut ni lire ni écrire hors de son espace via
 * get/set/delete/keys. `raw()` reste l'échappatoire documentée du driver
 * sous-jacent : elle expose tout le store, pas la seule tranche du
 * namespace — un plugin qui l'utilise sort volontairement de son espace.
 * @param {import('./driver.js').StorageDriver} driver
 * @param {string} prefix
 * @returns {import('./driver.js').StorageDriver}
 */
export const namespaced = (driver, prefix) => {
  /** @param {string} key */
  const full = (key) => `${prefix}:${key}`;

  return {
    init: () => driver.init(),
    get: (key) => driver.get(full(key)),
    set: (key, value) => driver.set(full(key), value),
    delete: (key) => driver.delete(full(key)),
    keys: async (sub = '') => {
      const found = await driver.keys(full(sub));
      return found.map((key) => key.slice(prefix.length + 1));
    },
    close: () => driver.close(),
    raw: () => driver.raw(),
  };
};

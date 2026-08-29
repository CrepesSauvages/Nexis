import { ConfigError } from './core/errors.js';

const DRIVERS = ['json', 'sqlite', 'postgres', 'mongo'];
const LOG_LEVELS = ['debug', 'info', 'warn', 'error'];
/** @type {Record<string, string>} */
const DEFAULT_PATHS = { json: './data/nexis.json', sqlite: './data/nexis.db' };

/**
 * @typedef {object} NexisConfig
 * @property {string} token
 * @property {string} clientId
 * @property {string} logLevel
 * @property {{ driver: string, path: string }} storage
 * @property {string} pluginsDir
 * @property {string | undefined} ownerId
 */

/**
 * @param {Record<string, string | undefined>} env
 * @param {string} key
 * @returns {string}
 */
const required = (env, key) => {
  const value = env[key];
  if (!value) {
    throw new ConfigError(`Variable d'environnement requise manquante : ${key}`, { key });
  }
  return value;
};

/**
 * @param {string} value
 * @param {string[]} allowed
 * @param {string} key
 * @returns {string}
 */
const oneOf = (value, allowed, key) => {
  if (!allowed.includes(value)) {
    throw new ConfigError(
      `Valeur invalide pour ${key} : "${value}". Attendu : ${allowed.join(', ')}`,
      {
        key,
        value,
      },
    );
  }
  return value;
};

/**
 * Lit et valide l'environnement. Lève dès la première anomalie —
 * un bot qui démarre à moitié configuré est plus difficile à diagnostiquer
 * qu'un bot qui refuse de démarrer.
 * @param {Record<string, string | undefined>} [env]
 * @returns {NexisConfig}
 */
export const loadConfig = (env = process.env) => {
  const driverValue = env.STORAGE_DRIVER ?? 'json';
  const logLevelValue = env.LOG_LEVEL ?? 'info';
  const driver = oneOf(driverValue, DRIVERS, 'STORAGE_DRIVER');
  const logLevel = oneOf(logLevelValue, LOG_LEVELS, 'LOG_LEVEL');

  const storagePath = env.STORAGE_PATH ?? DEFAULT_PATHS[driver];
  if (!storagePath) {
    throw new ConfigError(
      `Variable d'environnement requise manquante : STORAGE_PATH (chaîne de connexion pour le driver "${driver}")`,
      { driver },
    );
  }
  const pluginsDir = env.PLUGINS_DIR ?? './plugins';

  return {
    token: required(env, 'DISCORD_TOKEN'),
    clientId: required(env, 'DISCORD_CLIENT_ID'),
    logLevel,
    storage: { driver, path: storagePath },
    pluginsDir,
    ownerId: env.OWNER_ID,
  };
};

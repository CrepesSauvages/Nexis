import { ConfigError } from './core/errors.js';

const DRIVERS = ['json', 'sqlite', 'postgres', 'mongo'];
const LOG_LEVELS = ['debug', 'info', 'warn', 'error'];
/** @type {Record<string, string>} */
const DEFAULT_PATHS = { json: './data/nexis.json', sqlite: './data/nexis.db' };

/**
 * Drivers qui ne survivent pas à plusieurs process : `json` tient tout en
 * mémoire et réécrit le fichier entier, `sqlite` ouvre un handle local
 * sans coordination entre process. Sous sharding, chaque shard en aurait
 * sa propre copie et écraserait celle des autres.
 */
const SINGLE_PROCESS_DRIVERS = ['json', 'sqlite'];

/**
 * @typedef {object} ShardingConfig
 * @property {boolean} enabled
 * @property {number} id - identifiant de ce shard, 0 sans sharding
 */

/**
 * @typedef {object} DashboardConfig
 * @property {boolean} enabled
 * @property {string | undefined} clientSecret
 * @property {string} host
 * @property {number} port
 * @property {string} baseUrl
 */

/**
 * @typedef {object} NexisConfig
 * @property {string} token
 * @property {string} clientId
 * @property {string} logLevel
 * @property {{ driver: string, path: string }} storage
 * @property {string} pluginsDir
 * @property {string | undefined} ownerId
 * @property {string | undefined} sentryDsn
 * @property {number} errorLogLimit
 * @property {number} auditLogLimit
 * @property {string | undefined} schedulerTimezone
 * @property {ShardingConfig} sharding
 * @property {DashboardConfig} dashboard
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
 * @param {string | undefined} value
 * @param {number} fallback
 * @param {string} key
 * @returns {number}
 */
const positiveInt = (value, fallback, key) => {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new ConfigError(
      `Valeur invalide pour ${key} : "${value}". Attendu : un entier positif.`,
      {
        key,
        value,
      },
    );
  }
  return n;
};

/**
 * Valide un fuseau horaire IANA. `Intl.DateTimeFormat` est le seul
 * validateur natif : il lève une `RangeError` sur un fuseau inconnu.
 * Mieux vaut refuser au démarrage qu'au premier armement d'une tâche, où
 * l'erreur se lirait comme une expression cron invalide.
 * @param {string | undefined} value
 * @param {string} key
 * @returns {string | undefined}
 */
const timezone = (value, key) => {
  if (!value) return undefined;
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: value });
    return value;
  } catch {
    throw new ConfigError(
      `Valeur invalide pour ${key} : "${value}". Attendu : un fuseau IANA, ex. "Europe/Paris".`,
      { key, value },
    );
  }
};

/**
 * Valide un numéro de port. `0` est accepté : il demande à l'OS un port
 * éphémère, ce dont les tests se servent pour ne jamais entrer en
 * collision d'un fichier de test à l'autre.
 * @param {string | undefined} value
 * @param {number} fallback
 * @param {string} key
 * @returns {number}
 */
const portNumber = (value, fallback, key) => {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 65535) {
    throw new ConfigError(
      `Valeur invalide pour ${key} : "${value}". Attendu : un entier entre 0 et 65535.`,
      { key, value },
    );
  }
  return n;
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

  const errorLogLimit = positiveInt(env.ERROR_LOG_LIMIT, 500, 'ERROR_LOG_LIMIT');
  // Par serveur, contrairement au journal d'erreurs qui est global : un
  // même plafond donnerait un tout autre volume selon le nombre de
  // serveurs, d'où une valeur bien plus basse.
  const auditLogLimit = positiveInt(env.AUDIT_LOG_LIMIT, 200, 'AUDIT_LOG_LIMIT');
  // Absent, les expressions cron se lisent dans le fuseau du système, ce
  // qui est rarement ce que veut un hébergement dont l'horloge est en UTC.
  const schedulerTimezone = timezone(env.SCHEDULER_TIMEZONE, 'SCHEDULER_TIMEZONE');

  // `SHARDING_MANAGER` et `SHARDS` sont posés par discord.js dans
  // l'environnement de chaque shard qu'il lance : ce n'est pas à
  // l'utilisateur de les renseigner.
  const sharded = env.SHARDING_MANAGER === 'true';
  const sharding = { enabled: sharded, id: sharded ? Number(env.SHARDS ?? 0) : 0 };
  if (sharded && SINGLE_PROCESS_DRIVERS.includes(driver)) {
    throw new ConfigError(
      `Le driver "${driver}" ne peut pas être partagé entre plusieurs shards : chacun en tiendrait sa propre copie. ` +
        'Utilisez STORAGE_DRIVER=postgres ou mongo pour un bot shardé.',
      { driver, available: DRIVERS.filter((name) => !SINGLE_PROCESS_DRIVERS.includes(name)) },
    );
  }

  // Le secret OAuth EST l'interrupteur du dashboard : sans lui aucun port
  // n'est ouvert, et une installation qui ne veut que le bot n'a rien à
  // configurer. Port et hôte sont validés même dashboard éteint — une
  // valeur invalide reste une erreur de configuration.
  const dashboardPort = portNumber(env.DASHBOARD_PORT, 3000, 'DASHBOARD_PORT');
  const clientSecret = env.DISCORD_CLIENT_SECRET || undefined;
  const dashboard = {
    enabled: clientSecret !== undefined,
    clientSecret,
    host: env.DASHBOARD_HOST ?? '127.0.0.1',
    port: dashboardPort,
    baseUrl: (env.DASHBOARD_BASE_URL ?? `http://localhost:${dashboardPort}`).replace(/\/+$/, ''),
  };

  return {
    token: required(env, 'DISCORD_TOKEN'),
    clientId: required(env, 'DISCORD_CLIENT_ID'),
    logLevel,
    storage: { driver, path: storagePath },
    pluginsDir,
    ownerId: env.OWNER_ID,
    sentryDsn: env.SENTRY_DSN,
    errorLogLimit,
    auditLogLimit,
    schedulerTimezone,
    sharding,
    dashboard,
  };
};

/** @type {Record<string, number>} */
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

/**
 * @typedef {object} Logger
 * @property {(msg: string, ctx?: Record<string, unknown>) => void} debug
 * @property {(msg: string, ctx?: Record<string, unknown>) => void} info
 * @property {(msg: string, ctx?: Record<string, unknown>) => void} warn
 * @property {(msg: string, ctx?: Record<string, unknown>) => void} error
 * @property {(prefix: string) => Logger} child
 */

/**
 * Crée un logger. Les enfants héritent du niveau et cumulent les préfixes.
 * @param {{ level?: string, prefixes?: string[] }} options
 * @returns {Logger}
 */
export const createLogger = ({ level = 'info', prefixes = [] } = {}) => {
  const threshold = LEVELS[level] ?? LEVELS.info;

  /**
   * @param {string} levelName
   * @param {string} message
   * @param {Record<string, unknown>} [context]
   */
  const write = (levelName, message, context) => {
    if (LEVELS[levelName] < threshold) return;
    const time = new Date().toISOString();
    const tags = prefixes.map((p) => `[${p}]`).join('');
    const suffix = context && Object.keys(context).length ? ` ${JSON.stringify(context)}` : '';
    console.log(`${time} ${levelName.toUpperCase().padEnd(5)} ${tags} ${message}${suffix}`);
  };

  return {
    debug: (msg, ctx) => write('debug', msg, ctx),
    info: (msg, ctx) => write('info', msg, ctx),
    warn: (msg, ctx) => write('warn', msg, ctx),
    error: (msg, ctx) => write('error', msg, ctx),
    child: (prefix) => createLogger({ level, prefixes: [...prefixes, prefix] }),
  };
};

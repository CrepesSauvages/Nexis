import { newErrorId } from './errors.js';

/** @type {Record<string, number>} */
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

/** @type {Record<string, string>} */
const COLORS = { debug: '\x1b[90m', info: '\x1b[36m', warn: '\x1b[33m', error: '\x1b[31m' };
const RESET = '\x1b[0m';

/**
 * @typedef {import('./reporting/driver.js').ReportEntry} ReportEntry
 */

/**
 * @typedef {object} Logger
 * @property {(msg: string, ctx?: Record<string, unknown>) => void} debug
 * @property {(msg: string, ctx?: Record<string, unknown>) => void} info
 * @property {(msg: string, ctx?: Record<string, unknown>) => void} warn
 * @property {(msg: string, ctx?: Record<string, unknown>) => void} error
 * @property {(prefix: string, options?: { level?: string }) => Logger} child
 */

/**
 * Crée un logger. Les enfants héritent du niveau (sauf surcharge explicite)
 * et cumulent les préfixes. `onError` est un point d'extension pur : ce
 * fichier n'importe jamais `storage/` ni `reporting/` — c'est l'appelant
 * (le boot) qui branche un callback réel.
 * @param {{ level?: string, prefixes?: string[], onError?: (entry: ReportEntry) => void }} options
 * @returns {Logger}
 */
export const createLogger = ({ level = 'info', prefixes = [], onError } = {}) => {
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
    const line = `${time} ${levelName.toUpperCase().padEnd(5)} ${tags} ${message}${suffix}`;

    const stream = LEVELS[levelName] >= LEVELS.warn ? process.stderr : process.stdout;
    const colored = stream.isTTY ? `${COLORS[levelName]}${line}${RESET}` : line;
    stream.write(`${colored}\n`);

    if (levelName === 'error' && onError) {
      onError({ id: newErrorId(), timestamp: time, level: 'error', message, context });
    }
  };

  return {
    debug: (msg, ctx) => write('debug', msg, ctx),
    info: (msg, ctx) => write('info', msg, ctx),
    warn: (msg, ctx) => write('warn', msg, ctx),
    error: (msg, ctx) => write('error', msg, ctx),
    child: (prefix, options = {}) =>
      createLogger({ level: options.level ?? level, prefixes: [...prefixes, prefix], onError }),
  };
};

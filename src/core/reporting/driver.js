/**
 * Entrée normalisée déclenchée par un logger.error(). `context.stack` porte
 * la stack trace si l'appelant l'a incluse (convention déjà établie par les
 * ~20 sites d'appel existants du core, ex. `{ ...ctx, stack: errorStack(error) }`).
 *
 * @typedef {object} ReportEntry
 * @property {string} id - même format que newErrorId() (errors.js)
 * @property {string} timestamp - ISO 8601
 * @property {'error'} level - seul .error() déclenche un rapport
 * @property {string} message
 * @property {Record<string, unknown>} [context]
 */

/**
 * Contrat que tout driver de reporting doit honorer. Contrairement au
 * storage (un seul driver actif), plusieurs ErrorReporter peuvent être
 * actifs simultanément — chacun isolé : un report() qui échoue n'empêche
 * jamais les autres reporters de recevoir l'entrée (voir reporting/index.js).
 *
 * @typedef {object} ErrorReporter
 * @property {(entry: ReportEntry) => Promise<void>} report
 */

export {};

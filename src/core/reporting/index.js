import { createLocalReporter } from './drivers/local.js';
import { createSentryReporter } from './drivers/sentry.js';

/**
 * Assemble les reporters actifs. Le reporter local est toujours actif ;
 * Sentry ne l'est que si `sentryDsn` est fourni. Chaque `report()` est
 * isolé : l'échec d'un reporter ne doit jamais empêcher les autres de
 * recevoir l'entrée, ni remonter à l'appelant de logger.error() (même
 * principe d'isolation que le dispatcher — un composant qui échoue n'en
 * fait pas tomber un autre).
 *
 * @param {{ storage: import('../storage/driver.js').StorageDriver, sentryDsn?: string, limit?: number }} options
 */
export const createErrorReporting = ({ storage, sentryDsn, limit }) => {
  const local = createLocalReporter({ storage, limit });
  /** @type {import('./driver.js').ErrorReporter[]} */
  const reporters = [local, ...(sentryDsn ? [createSentryReporter({ dsn: sentryDsn })] : [])];

  return {
    /** @param {import('./driver.js').ReportEntry} entry */
    async reportAll(entry) {
      await Promise.all(
        reporters.map((reporter) =>
          reporter.report(entry).catch((error) => {
            // Jamais via le logger ici : une boucle si le reporting de
            // l'échec de reporting échouait à son tour.
            const message = error instanceof Error ? error.message : String(error);
            console.error(`Échec d'un reporter d'erreur : ${message}`);
          }),
        ),
      );
    },

    getRecent: local.getRecent,
  };
};

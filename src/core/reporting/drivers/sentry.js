/**
 * Reporter Sentry : l'import de `@sentry/node` est différé au premier
 * `report()`, jamais fait à la construction — ce reporter peut donc être
 * construit sans risque même si le package n'est pas installé (ce qui
 * n'arrive que si SENTRY_DSN est absent, cas où ce driver n'est jamais
 * instancié — voir reporting/index.js). Le résultat de l'import est mis
 * en cache : un seul appel à Sentry.init() sur toute la durée du process.
 *
 * @param {{ dsn: string }} options
 * @returns {import('../driver.js').ErrorReporter}
 */
export const createSentryReporter = ({ dsn }) => {
  /** @type {Promise<typeof import('@sentry/node')> | undefined} */
  let sentryPromise;

  const getSentry = () => {
    sentryPromise ??= import('@sentry/node').then((Sentry) => {
      Sentry.init({ dsn });
      return Sentry;
    });
    return sentryPromise;
  };

  return {
    async report(entry) {
      const Sentry = await getSentry();
      const error = new Error(entry.message);
      if (typeof entry.context?.stack === 'string') {
        error.stack = entry.context.stack;
      }
      Sentry.captureException(error, { extra: entry.context });
    },
  };
};

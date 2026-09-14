import { errorMessage, errorStack } from './errors.js';

/** Délai laissé à `shutdown()` avant d'abandonner et de sortir quand même. */
const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Borne une promesse dans le temps. Le minuteur est `unref`é : il ne doit
 * pas, à lui seul, maintenir le process en vie.
 *
 * @param {Promise<unknown>} promise
 * @param {number} ms
 * @returns {Promise<unknown>}
 */
const withTimeout = (promise, ms) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`arrêt non terminé après ${ms} ms, abandon`)),
      ms,
    );
    timer.unref?.();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });

/**
 * Installe les garde-fous du process : les signaux d'arrêt, et les deux
 * erreurs qui échappent à tout try/catch.
 *
 * - `unhandledRejection` : journalisée, sans arrêter le bot. Depuis Node 15,
 *   son absence de traitement tue le process — or une promesse oubliée dans
 *   un plugin ne doit pas emporter les autres, exactement comme un handler
 *   qui lève n'emporte pas ses voisins (dispatcher.js). Passer par
 *   `logger.error` la fait aussi remonter au reporting (Sentry, `/nexis
 *   errors`), ce que le comportement par défaut de Node ne fait pas.
 * - `uncaughtException` : journalisée puis fatale. Contrairement à un rejet,
 *   elle laisse la pile interrompue au milieu de son travail : l'état du
 *   process n'est plus connu, continuer serait un pari.
 *
 * Tout est injectable (`target`, `exit`, `timeoutMs`) pour que ce module se
 * teste sans toucher au vrai `process` ni tuer le lanceur de tests.
 *
 * @param {object} options
 * @param {import('./logger.js').Logger} options.logger
 * @param {() => Promise<void>} options.shutdown
 * @param {NodeJS.EventEmitter} [options.target]
 * @param {(code: number) => void} [options.exit]
 * @param {number} [options.timeoutMs]
 * @returns {{ uninstall: () => void }}
 */
export const installProcessGuards = ({
  logger,
  shutdown,
  target = process,
  exit = (code) => process.exit(code),
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) => {
  let stopping = false;

  /**
   * @param {number} code
   * @returns {Promise<void>}
   */
  const stop = async (code) => {
    // Ni un second Ctrl-C, ni une exception survenue pendant l'arrêt ne
    // doivent relancer `shutdown()` : il n'est pas réentrant (il ferme un
    // serveur, un client et un handle de storage déjà en cours de
    // fermeture).
    if (stopping) return;
    stopping = true;

    try {
      await withTimeout(shutdown(), timeoutMs);
    } catch (error) {
      // Un arrêt raté ne doit pas empêcher de sortir : le superviseur
      // (systemd, Docker) attend la sortie du process, pas sa propreté.
      logger.error(`Arrêt incomplet : ${errorMessage(error)}`, { stack: errorStack(error) });
    }
    exit(code);
  };

  /** @type {Array<[string, (...args: never[]) => void]>} */
  const handlers = [
    [
      'SIGINT',
      () => {
        logger.info('Signal reçu, arrêt en cours', { signal: 'SIGINT' });
        void stop(0);
      },
    ],
    [
      'SIGTERM',
      () => {
        logger.info('Signal reçu, arrêt en cours', { signal: 'SIGTERM' });
        void stop(0);
      },
    ],
    [
      'unhandledRejection',
      (/** @type {unknown} */ reason) => {
        logger.error(`Promesse rejetée sans traitement : ${errorMessage(reason)}`, {
          stack: errorStack(reason),
        });
      },
    ],
    [
      'uncaughtException',
      (/** @type {unknown} */ error) => {
        logger.error(`Exception non interceptée : ${errorMessage(error)}`, {
          stack: errorStack(error),
        });
        void stop(1);
      },
    ],
  ];

  for (const [event, handler] of handlers) {
    target.on(event, /** @type {(...args: unknown[]) => void} */ (handler));
  }

  return {
    uninstall() {
      for (const [event, handler] of handlers) {
        target.off(event, /** @type {(...args: unknown[]) => void} */ (handler));
      }
    },
  };
};

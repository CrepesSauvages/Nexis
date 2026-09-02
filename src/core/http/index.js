import { createSessions } from './session.js';
import { createOAuth } from './oauth.js';
import { createAuthRoutes } from './auth-routes.js';
import { createRouter } from './router.js';
import { createHttpServer } from './server.js';

/**
 * Assemble et démarre le dashboard, ou renonce proprement.
 *
 * Renvoie `undefined` dans les deux cas où il n'y a rien à fermer : le
 * dashboard n'est pas configuré, ou le serveur n'a pas pu écouter. Le bot
 * démarre dans les deux cas.
 *
 * @param {object} options
 * @param {import('../../config.js').NexisConfig} options.config
 * @param {import('../storage/driver.js').StorageDriver} options.storage
 * @param {import('../registry/index.js').Registries} options.registries
 * @param {import('discord.js').Client} options.client
 * @param {import('../logger.js').Logger} options.logger
 * @param {typeof fetch} [options.fetchImpl]
 * @returns {Promise<ReturnType<typeof createHttpServer> | undefined>}
 */
export const startDashboard = async ({
  config,
  storage,
  registries,
  client,
  logger,
  fetchImpl,
}) => {
  const { enabled, clientSecret, host, port, baseUrl } = config.dashboard;
  if (!enabled || !clientSecret) {
    logger.warn('Dashboard désactivé : DISCORD_CLIENT_SECRET absent');
    return undefined;
  }

  const httpLogger = logger.child('http');
  const sessions = createSessions({ storage });
  const oauth = createOAuth({ clientId: config.clientId, clientSecret, baseUrl, fetchImpl });

  const server = createHttpServer({
    router: createRouter({
      // Les endpoints du socle d'abord : une route de plugin ne peut pas
      // les masquer, le registre les préfixant tous par /api/plugins/.
      routes: [
        ...createAuthRoutes({ oauth, sessions, secure: baseUrl.startsWith('https://') }),
        // Le registre type son handler en `Function` générique (routes.js) ;
        // le routeur attend la signature précise (params, io) => unknown.
        // Les deux décrivent le même contrat en pratique — un plugin qui
        // enregistre une route via ctx.registerRoute reçoit déjà ces deux
        // arguments (context.js). Un simple cast suffit, sans élargir le
        // typage public du registre pour ce seul appelant.
        .../** @type {import('./router.js').HttpRoute[]} */ (
          /** @type {unknown} */ (registries.routes.all())
        ),
      ],
      sessions,
      client,
      ownerId: config.ownerId,
      logger: httpLogger,
    }),
    host,
    port,
    logger: httpLogger,
  });

  if (!(await server.listen())) return undefined;
  logger.info('Dashboard démarré', { host, port: server.port() });
  return server;
};

import { createSessions } from './session.js';
import { createOAuth } from './oauth.js';
import { createAuthRoutes } from './auth-routes.js';
import { createPluginAdmin } from '../plugin-admin.js';
import { createCoreRoutes } from './core-routes.js';
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
 * @param {Array<import('../registry/routes.js').RouteDef & { plugin: string }>} options.routes - déjà filtrées aux plugins actifs par bootstrap() (index.js)
 * @param {ReturnType<typeof import('../guild-config.js').createGuildConfig>} options.guildConfig
 * @param {string[]} options.alwaysEnabled
 * @param {import('discord.js').Client} options.client
 * @param {import('../logger.js').Logger} options.logger
 * @param {import('../loader.js').LoadedPlugin[]} options.plugins - plugins actifs
 * @param {{ syncGuild: (guildId: string) => Promise<void> }} options.commandSync
 * @param {typeof fetch} [options.fetchImpl]
 * @returns {Promise<ReturnType<typeof createHttpServer> | undefined>}
 */
export const startDashboard = async ({
  config,
  storage,
  routes,
  guildConfig,
  alwaysEnabled,
  client,
  logger,
  plugins,
  commandSync,
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
  const admin = createPluginAdmin({ plugins, guildConfig, commandSync, alwaysEnabled });

  const server = createHttpServer({
    router: createRouter({
      // L'ordre n'a pas d'incidence sur la protection des endpoints du
      // socle : `createRouter` construit une Map où la dernière entrée
      // gagne en cas de doublon, donc les mettre en premier les rendrait
      // masquables, pas l'inverse. Ce qui les protège réellement, c'est le
      // préfixe /api/plugins/ que le registre impose à tout path de plugin
      // (routes.js) — un plugin ne peut tout simplement pas déclarer un
      // chemin qui collide avec /auth/* ou /api/me.
      routes: [
        ...createAuthRoutes({ oauth, sessions, secure: baseUrl.startsWith('https://') }),
        ...createCoreRoutes({ plugins, guildConfig, admin, client, alwaysEnabled }),
        // Le registre type son handler en `Function` générique (routes.js) ;
        // le routeur attend la signature précise (params, io) => unknown.
        // Les deux décrivent le même contrat en pratique — un plugin qui
        // enregistre une route via ctx.registerRoute reçoit déjà ces deux
        // arguments (context.js). Un simple cast suffit, sans élargir le
        // typage public du registre pour ce seul appelant.
        .../** @type {import('./router.js').HttpRoute[]} */ (/** @type {unknown} */ (routes)),
      ],
      sessions,
      client,
      guildConfig,
      alwaysEnabled,
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

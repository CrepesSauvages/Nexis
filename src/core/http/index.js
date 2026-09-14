import { createSessions } from './session.js';
import { createOAuth } from './oauth.js';
import { createAuthRoutes } from './auth-routes.js';
import { createPluginAdmin } from '../plugin-admin.js';
import { createCommandPerms } from '../command-perms.js';
import { createGuildAccess } from '../guild-access.js';
import { createCoreRoutes } from './core-routes.js';
import { createRouter } from './router.js';
import { createHttpServer } from './server.js';
import { createStaticHandler } from './static.js';
import { errorMessage } from '../errors.js';

/**
 * Ce process sert-il le dashboard ?
 *
 * Un seul le fait : lancés ensemble, les autres shards se heurteraient au
 * port déjà pris. Celui qui le sert interroge les autres au besoin
 * (`guild-access.js`), il n'est donc pas limité aux serveurs de sa propre
 * tranche.
 *
 * @param {import('../../config.js').ShardingConfig} sharding
 * @returns {boolean}
 */
export const servesDashboard = (sharding) => !sharding.enabled || sharding.id === 0;

/** Intervalle du balayage des sessions périmées. */
const SESSION_PURGE_INTERVAL_MS = 60 * 60 * 1000;

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
 * @param {Array<{ name: string, plugin: string, permissions?: 'guild-admin' | 'owner' }>} options.commands - commandes des plugins actifs, déjà filtrées par bootstrap()
 * @param {{ syncGuild: (guildId: string) => Promise<void> }} options.commandSync
 * @param {{ getRecent: (count?: number) => Promise<import('../reporting/driver.js').ReportEntry[]>, clear: () => Promise<void> }} options.errorReporting
 * @param {ReturnType<typeof import('../audit.js').createAudit>} options.audit
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
  commands,
  commandSync,
  audit,
  errorReporting,
  fetchImpl,
}) => {
  if (!servesDashboard(config.sharding)) {
    logger.info('Dashboard servi par un autre shard', { shard: config.sharding.id });
    return undefined;
  }

  const { enabled, clientSecret, host, port, baseUrl } = config.dashboard;
  if (!enabled || !clientSecret) {
    logger.warn('Dashboard désactivé : DISCORD_CLIENT_SECRET absent');
    return undefined;
  }

  const httpLogger = logger.child('http');
  const sessions = createSessions({ storage });
  const oauth = createOAuth({ clientId: config.clientId, clientSecret, baseUrl, fetchImpl });
  const admin = createPluginAdmin({ plugins, guildConfig, commandSync, alwaysEnabled, audit });
  const perms = createCommandPerms({ commands, guildConfig, audit });
  const access = createGuildAccess(client);

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
        ...createAuthRoutes({
          oauth,
          sessions,
          secure: baseUrl.startsWith('https://'),
          ownerId: config.ownerId,
        }),
        ...createCoreRoutes({
          plugins,
          guildConfig,
          admin,
          perms,
          access,
          alwaysEnabled,
          errorReporting,
          audit,
        }),
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
      access,
      guildConfig,
      alwaysEnabled,
      ownerId: config.ownerId,
      logger: httpLogger,
      // Construit sans condition : l'absence de `web/dist` est gérée dans le
      // module, qui rend alors une page d'explication sur la racine.
      fallback: createStaticHandler(),
    }),
    host,
    port,
    logger: httpLogger,
  });

  if (!(await server.listen())) return undefined;
  logger.info('Dashboard démarré', { host, port: server.port() });

  const purge = async () => {
    try {
      const removed = await sessions.purgeExpired();
      if (removed > 0) httpLogger.debug('Sessions périmées supprimées', { removed });
    } catch (error) {
      // Un balayage raté n'est pas un incident : la prochaine heure
      // réessaiera, et `get()` continue de nettoyer ce qu'il relit.
      httpLogger.warn(`Balayage des sessions impossible : ${errorMessage(error)}`);
    }
  };

  // Une première passe immédiate : un bot redémarré plus souvent que
  // l'intervalle ne balaierait jamais autrement.
  void purge();
  const purgeTimer = setInterval(() => void purge(), SESSION_PURGE_INTERVAL_MS);
  // À lui seul, ce minuteur ne doit pas maintenir le process en vie.
  purgeTimer.unref?.();

  return {
    ...server,
    /** Arrête le balayage avant de fermer le serveur. */
    async close() {
      clearInterval(purgeTimer);
      await server.close();
    },
  };
};

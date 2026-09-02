import { HttpError, newErrorId, errorMessage, errorStack } from '../errors.js';
import { parseCookies, readJsonBody, sendJson } from './request.js';
import { SESSION_COOKIE } from './session.js';
import { resolveAuth } from './auth.js';

/**
 * @typedef {object} RouteParams
 * @property {string | undefined} guildId
 * @property {{ id: string, username: string, avatar: string | null } | undefined} user
 * @property {Record<string, string>} query
 * @property {unknown} body
 */

/**
 * @typedef {object} RouteIO
 * @property {import('node:http').IncomingMessage} req
 * @property {import('node:http').ServerResponse} res
 * @property {import('./session.js').StoredSession | undefined} session
 * @property {string | undefined} sessionId
 */

/**
 * @typedef {object} HttpRoute
 * @property {string} method
 * @property {string} path
 * @property {string} auth
 * @property {(params: RouteParams, io: RouteIO) => Promise<unknown> | unknown} handler
 * @property {string} [plugin]
 */

const WITH_BODY = ['POST', 'PUT', 'PATCH'];

/**
 * Fabrique le listener remis à node:http.
 *
 * La correspondance est exacte sur méthode et chemin : le registre de
 * routes stocke déjà des chemins complets, il n'y a aucun paramètre de
 * chemin à analyser.
 *
 * Un handler qui renvoie `undefined` est réputé avoir écrit lui-même sa
 * réponse — c'est ce qui permet aux redirections OAuth et au 204 de
 * déconnexion de cohabiter avec les handlers de plugins, qui se
 * contentent de retourner une valeur.
 *
 * @param {object} options
 * @param {HttpRoute[]} options.routes
 * @param {ReturnType<typeof import('./session.js').createSessions>} options.sessions
 * @param {import('discord.js').Client} options.client
 * @param {string | undefined} options.ownerId
 * @param {import('../logger.js').Logger} options.logger
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void>}
 */
export const createRouter = ({ routes, sessions, client, ownerId, logger }) => {
  const table = new Map(routes.map((route) => [`${route.method} ${route.path}`, route]));

  return async (req, res) => {
    // L'origine est arbitraire : seuls le chemin et la query nous
    // intéressent, et URL exige une base pour accepter une URL relative.
    const url = new URL(req.url ?? '/', 'http://localhost');
    const route = table.get(`${req.method} ${url.pathname}`);
    if (!route) {
      sendJson(res, 404, { error: 'Route inconnue' });
      return;
    }

    try {
      const sessionId = parseCookies(req.headers.cookie)[SESSION_COOKIE];
      const session = await sessions.get(sessionId);
      const guildId = url.searchParams.get('guild') ?? undefined;
      await resolveAuth({ level: route.auth, session, client, guildId, ownerId });

      const body = WITH_BODY.includes(req.method ?? '') ? await readJsonBody(req) : undefined;
      const user = session
        ? { id: session.userId, username: session.username, avatar: session.avatar }
        : undefined;

      const result = await route.handler(
        { guildId, user, query: Object.fromEntries(url.searchParams), body },
        { req, res, session, sessionId },
      );
      if (result !== undefined) sendJson(res, 200, result);
    } catch (error) {
      // Un handler peut avoir déjà écrit avant d'échouer : réécrire
      // provoquerait un ERR_HTTP_HEADERS_SENT qui masquerait la vraie
      // erreur.
      if (res.headersSent) {
        res.end();
        return;
      }
      if (error instanceof HttpError) {
        sendJson(res, error.status, { error: error.message });
        return;
      }
      const errorId = newErrorId();
      logger.error(`Erreur dans une route HTTP : ${errorMessage(error)}`, {
        errorId,
        plugin: route.plugin,
        method: route.method,
        path: route.path,
        stack: errorStack(error),
      });
      sendJson(res, 500, { error: 'Erreur interne', errorId });
    }
  };
};

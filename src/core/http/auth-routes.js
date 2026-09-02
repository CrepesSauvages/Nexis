import { randomBytes } from 'node:crypto';
import { HttpError } from '../errors.js';
import { parseCookies, sendRedirect, serializeCookie } from './request.js';
import { SESSION_COOKIE, SESSION_TTL_MS } from './session.js';

/** Cookie portant le `state` OAuth entre le login et le callback. */
export const OAUTH_STATE_COOKIE = 'nexis_oauth_state';

const STATE_TTL_SECONDS = 600;

/**
 * Les quatre endpoints du socle.
 *
 * Ils ne passent pas par le registre de routes des plugins : leur niveau
 * est `public` et `/api/me` vérifie lui-même la session, faute d'un niveau
 * « connecté, sans serveur ciblé » parmi les quatre que le registre
 * accepte. Élargir AUTH_LEVELS pour ce seul besoin changerait le contrat
 * public offert aux plugins.
 *
 * @param {object} options
 * @param {ReturnType<typeof import('./oauth.js').createOAuth>} options.oauth
 * @param {ReturnType<typeof import('./session.js').createSessions>} options.sessions
 * @param {boolean} options.secure
 * @returns {import('./router.js').HttpRoute[]}
 */
export const createAuthRoutes = ({ oauth, sessions, secure }) => [
  {
    method: 'GET',
    path: '/auth/login',
    auth: 'public',
    handler: (_params, { res }) => {
      const state = randomBytes(16).toString('hex');
      sendRedirect(res, oauth.authorizeUrl(state), [
        serializeCookie(OAUTH_STATE_COOKIE, state, { maxAge: STATE_TTL_SECONDS, secure }),
      ]);
      return undefined;
    },
  },
  {
    method: 'GET',
    path: '/auth/callback',
    auth: 'public',
    handler: async ({ query }, { req, res }) => {
      // Le state pose un secret dans un cookie et le fait revenir par
      // l'URL : un tiers qui fabrique un callback ne connaît pas le
      // cookie, donc ne peut pas nous faire ouvrir une session.
      const expected = parseCookies(req.headers.cookie)[OAUTH_STATE_COOKIE];
      if (!query.state || !expected || query.state !== expected) {
        throw new HttpError(400, 'État OAuth invalide');
      }
      if (!query.code) throw new HttpError(400, 'Code OAuth manquant');

      const accessToken = await oauth.exchangeCode(query.code);
      const user = await oauth.fetchUser(accessToken);
      const guilds = await oauth.fetchGuilds(accessToken);
      const id = await sessions.create({
        userId: user.id,
        username: user.username,
        avatar: user.avatar,
        guilds,
      });

      sendRedirect(res, '/', [
        serializeCookie(SESSION_COOKIE, id, { maxAge: SESSION_TTL_MS / 1000, secure }),
        serializeCookie(OAUTH_STATE_COOKIE, '', { maxAge: 0, secure }),
      ]);
      return undefined;
    },
  },
  {
    method: 'POST',
    path: '/auth/logout',
    auth: 'public',
    handler: async (_params, { res, sessionId }) => {
      await sessions.destroy(sessionId);
      res.writeHead(204, {
        'Set-Cookie': serializeCookie(SESSION_COOKIE, '', { maxAge: 0, secure }),
      });
      res.end();
      return undefined;
    },
  },
  {
    method: 'GET',
    path: '/api/me',
    auth: 'public',
    handler: (_params, { session }) => {
      if (!session) throw new HttpError(401, 'Authentification requise');
      return {
        id: session.userId,
        username: session.username,
        avatar: session.avatar,
        guilds: session.guilds,
      };
    },
  },
];

import { HttpError } from '../errors.js';

const API = 'https://discord.com/api/v10';

/**
 * Client OAuth2 Discord réduit au strict nécessaire du login.
 *
 * `fetchImpl` est injectable : c'est ce qui rend le flux testable sans
 * réseau, comme `clientFactory` et `restFactory` le font déjà pour
 * Discord dans bootstrap().
 *
 * @param {object} options
 * @param {string} options.clientId
 * @param {string} options.clientSecret
 * @param {string} options.baseUrl
 * @param {typeof fetch} [options.fetchImpl]
 */
export const createOAuth = ({ clientId, clientSecret, baseUrl, fetchImpl = fetch }) => {
  const redirectUri = `${baseUrl}/auth/callback`;

  /**
   * @param {string} url
   * @param {string} accessToken
   * @returns {Promise<unknown>}
   */
  const authorized = async (url, accessToken) => {
    const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) {
      throw new HttpError(502, `Discord a répondu ${response.status}`, { url });
    }
    return response.json();
  };

  return {
    /**
     * @param {string} state
     * @returns {string}
     */
    authorizeUrl(state) {
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'identify guilds',
        state,
      });
      return `https://discord.com/oauth2/authorize?${params}`;
    },

    /**
     * @param {string} code
     * @returns {Promise<string>}
     */
    async exchangeCode(code) {
      const url = `${API}/oauth2/token`;
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
        }).toString(),
      });
      if (!response.ok) {
        throw new HttpError(502, `Échange du code OAuth refusé par Discord (${response.status})`, {
          url,
        });
      }
      const payload = /** @type {{ access_token?: string }} */ (await response.json());
      if (!payload.access_token) {
        throw new HttpError(502, 'Réponse OAuth sans access_token', { url });
      }
      return payload.access_token;
    },

    /**
     * @param {string} accessToken
     * @returns {Promise<{ id: string, username: string, avatar: string | null }>}
     */
    async fetchUser(accessToken) {
      const user = /** @type {{ id: string, username: string, avatar: string | null }} */ (
        await authorized(`${API}/users/@me`, accessToken)
      );
      return { id: user.id, username: user.username, avatar: user.avatar };
    },

    /**
     * Ne garde que les quatre champs dont le sélecteur de serveur aura
     * besoin : le reste de la réponse Discord n'a pas à grossir chaque
     * session stockée.
     *
     * @param {string} accessToken
     * @returns {Promise<import('./session.js').SessionGuild[]>}
     */
    async fetchGuilds(accessToken) {
      const guilds = /** @type {import('./session.js').SessionGuild[]} */ (
        await authorized(`${API}/users/@me/guilds`, accessToken)
      );
      return guilds.map(({ id, name, icon, permissions }) => ({ id, name, icon, permissions }));
    },
  };
};

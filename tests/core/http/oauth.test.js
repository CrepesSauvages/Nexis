import { describe, it, expect, vi } from 'vitest';
import { createOAuth } from '../../../src/core/http/oauth.js';

/**
 * @param {{ ok?: boolean, status?: number, payload?: unknown }} response
 * @returns {typeof fetch}
 */
const fakeFetch = ({ ok = true, status = 200, payload = {} } = {}) =>
  /** @type {typeof fetch} */ (
    /** @type {unknown} */ (vi.fn().mockResolvedValue({ ok, status, json: async () => payload }))
  );

/** @param {typeof fetch} fetchImpl */
const oauthWith = (fetchImpl) =>
  createOAuth({
    clientId: 'app1',
    clientSecret: 'secret',
    baseUrl: 'https://nexis.example',
    fetchImpl,
  });

describe('authorizeUrl', () => {
  it("devrait pointer vers l'autorisation Discord avec les bons paramètres", () => {
    const url = new URL(oauthWith(fakeFetch()).authorizeUrl('etat42'));
    expect(url.origin + url.pathname).toBe('https://discord.com/oauth2/authorize');
    expect(url.searchParams.get('client_id')).toBe('app1');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe('identify guilds');
    expect(url.searchParams.get('state')).toBe('etat42');
    expect(url.searchParams.get('redirect_uri')).toBe('https://nexis.example/auth/callback');
  });
});

describe('exchangeCode', () => {
  it("devrait retourner l'access_token renvoyé par Discord", async () => {
    const fetchImpl = fakeFetch({ payload: { access_token: 'jeton' } });
    expect(await oauthWith(fetchImpl).exchangeCode('code1')).toBe('jeton');
  });

  it('devrait poster le code en form-urlencoded avec le secret', async () => {
    const fetchImpl = fakeFetch({ payload: { access_token: 'jeton' } });
    await oauthWith(fetchImpl).exchangeCode('code1');
    const [url, init] = /** @type {import('vitest').Mock} */ (fetchImpl).mock.calls[0];
    expect(url).toBe('https://discord.com/api/v10/oauth2/token');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    const body = new URLSearchParams(String(init.body));
    expect(body.get('code')).toBe('code1');
    expect(body.get('client_secret')).toBe('secret');
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('redirect_uri')).toBe('https://nexis.example/auth/callback');
  });

  it('devrait lever une HttpError 502 si Discord refuse', async () => {
    const fetchImpl = fakeFetch({ ok: false, status: 401 });
    await expect(oauthWith(fetchImpl).exchangeCode('code1')).rejects.toMatchObject({ status: 502 });
  });

  it("devrait lever une HttpError 502 si la réponse n'a pas d'access_token", async () => {
    const fetchImpl = fakeFetch({ payload: {} });
    await expect(oauthWith(fetchImpl).exchangeCode('code1')).rejects.toMatchObject({ status: 502 });
  });
});

describe('fetchUser', () => {
  it("devrait retourner l'identité de l'utilisateur", async () => {
    const fetchImpl = fakeFetch({ payload: { id: 'u1', username: 'thomas', avatar: 'a1' } });
    expect(await oauthWith(fetchImpl).fetchUser('jeton')).toEqual({
      id: 'u1',
      username: 'thomas',
      avatar: 'a1',
    });
  });

  it("devrait porter le jeton en en-tête d'autorisation", async () => {
    const fetchImpl = fakeFetch({ payload: { id: 'u1', username: 'thomas', avatar: null } });
    await oauthWith(fetchImpl).fetchUser('jeton');
    const [url, init] = /** @type {import('vitest').Mock} */ (fetchImpl).mock.calls[0];
    expect(url).toBe('https://discord.com/api/v10/users/@me');
    expect(init.headers.Authorization).toBe('Bearer jeton');
  });

  it('devrait lever une HttpError 502 si Discord répond en erreur', async () => {
    const fetchImpl = fakeFetch({ ok: false, status: 500 });
    await expect(oauthWith(fetchImpl).fetchUser('jeton')).rejects.toMatchObject({ status: 502 });
  });
});

describe('fetchGuilds', () => {
  it('devrait réduire chaque serveur aux quatre champs utiles', async () => {
    const fetchImpl = fakeFetch({
      payload: [
        { id: 'g1', name: 'Un', icon: null, permissions: '8', owner: true, features: ['X'] },
      ],
    });
    expect(await oauthWith(fetchImpl).fetchGuilds('jeton')).toEqual([
      { id: 'g1', name: 'Un', icon: null, permissions: '8' },
    ]);
  });
});

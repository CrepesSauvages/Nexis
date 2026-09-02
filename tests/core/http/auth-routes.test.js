import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJsonDriver } from '../../../src/core/storage/drivers/json.js';
import { createSessions, SESSION_COOKIE } from '../../../src/core/http/session.js';
import { createRouter } from '../../../src/core/http/router.js';
import { createAuthRoutes, OAUTH_STATE_COOKIE } from '../../../src/core/http/auth-routes.js';
import { createGuildConfig } from '../../../src/core/guild-config.js';

/** @type {string} */
let dir;
/** @type {import('../../../src/core/storage/driver.js').StorageDriver} */
let storage;
/** @type {import('node:http').Server | undefined} */
let server;

const fakeOAuth = () => ({
  authorizeUrl: vi.fn((state) => `https://discord.com/oauth2/authorize?state=${state}`),
  exchangeCode: vi.fn().mockResolvedValue('jeton'),
  fetchUser: vi.fn().mockResolvedValue({ id: 'u1', username: 'thomas', avatar: 'a1' }),
  fetchGuilds: vi
    .fn()
    .mockResolvedValue([{ id: 'g1', name: 'Serveur', icon: null, permissions: '8' }]),
});

const start = async () => {
  const oauth = fakeOAuth();
  const sessions = createSessions({ storage });
  const router = createRouter({
    routes: createAuthRoutes({
      oauth:
        /** @type {ReturnType<typeof import('../../../src/core/http/oauth.js').createOAuth>} */ (
          /** @type {unknown} */ (oauth)
        ),
      sessions,
      secure: false,
    }),
    sessions,
    client: /** @type {import('discord.js').Client} */ (
      /** @type {unknown} */ ({ guilds: { cache: new Map() } })
    ),
    guildConfig: createGuildConfig({ storage }),
    ownerId: undefined,
    logger: /** @type {import('../../../src/core/logger.js').Logger} */ (
      /** @type {unknown} */ ({
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        child: vi.fn(),
      })
    ),
  });
  server = createServer(router);
  await new Promise((resolve) => server?.listen(0, '127.0.0.1', () => resolve(undefined)));
  const address = /** @type {import('node:net').AddressInfo} */ (server.address());
  return { base: `http://127.0.0.1:${address.port}`, oauth, sessions };
};

/**
 * Extrait la valeur d'un cookie posé par la réponse.
 * @param {Response} response
 * @param {string} name
 * @returns {string | undefined}
 */
const cookieFrom = (response, name) => {
  const header = response.headers.getSetCookie().find((line) => line.startsWith(`${name}=`));
  return header?.slice(name.length + 1).split(';')[0];
};

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'nexis-authroutes-'));
  storage = createJsonDriver({ path: join(dir, 's.json') });
  await storage.init();
});

afterEach(async () => {
  if (server) await new Promise((resolve) => server?.close(() => resolve(undefined)));
  server = undefined;
  await storage.close();
  await rm(dir, { recursive: true, force: true });
});

describe('GET /auth/login', () => {
  it('devrait rediriger vers Discord', async () => {
    const { base } = await start();
    const response = await fetch(`${base}/auth/login`, { redirect: 'manual' });
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toContain('discord.com/oauth2/authorize');
  });

  it('devrait poser un cookie state qui correspond à celui envoyé à Discord', async () => {
    const { base } = await start();
    const response = await fetch(`${base}/auth/login`, { redirect: 'manual' });
    const state = cookieFrom(response, OAUTH_STATE_COOKIE);
    expect(state).toMatch(/^[0-9a-f]{32}$/);
    expect(response.headers.get('location')).toContain(`state=${state}`);
  });
});

describe('GET /auth/callback', () => {
  it('devrait refuser en 400 sans state', async () => {
    const { base } = await start();
    expect((await fetch(`${base}/auth/callback?code=c1`)).status).toBe(400);
  });

  it('devrait refuser en 400 si le state ne correspond pas au cookie', async () => {
    const { base } = await start();
    const response = await fetch(`${base}/auth/callback?code=c1&state=faux`, {
      headers: { Cookie: `${OAUTH_STATE_COOKIE}=vrai` },
    });
    expect(response.status).toBe(400);
  });

  it('devrait refuser en 400 sans code', async () => {
    const { base } = await start();
    const response = await fetch(`${base}/auth/callback?state=vrai`, {
      headers: { Cookie: `${OAUTH_STATE_COOKIE}=vrai` },
    });
    expect(response.status).toBe(400);
  });

  it("devrait créer la session et rediriger vers l'accueil", async () => {
    const { base, sessions } = await start();
    const response = await fetch(`${base}/auth/callback?code=c1&state=vrai`, {
      headers: { Cookie: `${OAUTH_STATE_COOKIE}=vrai` },
      redirect: 'manual',
    });
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/');
    const id = cookieFrom(response, SESSION_COOKIE);
    expect(await sessions.get(id)).toMatchObject({ userId: 'u1', username: 'thomas' });
  });

  it('devrait poser les en-têtes de durcissement sur la redirection', async () => {
    const { base } = await start();
    const response = await fetch(`${base}/auth/callback?code=c1&state=vrai`, {
      headers: { Cookie: `${OAUTH_STATE_COOKIE}=vrai` },
      redirect: 'manual',
    });
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('devrait effacer le cookie state après usage', async () => {
    const { base } = await start();
    const response = await fetch(`${base}/auth/callback?code=c1&state=vrai`, {
      headers: { Cookie: `${OAUTH_STATE_COOKIE}=vrai` },
      redirect: 'manual',
    });
    const stateCookie = response.headers
      .getSetCookie()
      .find((line) => line.startsWith(`${OAUTH_STATE_COOKIE}=`));
    expect(stateCookie).toContain('Max-Age=0');
  });
});

describe('GET /api/me', () => {
  it('devrait refuser en 401 sans session', async () => {
    const { base } = await start();
    expect((await fetch(`${base}/api/me`)).status).toBe(401);
  });

  it("devrait renvoyer l'identité et les serveurs de la session", async () => {
    const { base, sessions } = await start();
    const id = await sessions.create({
      userId: 'u1',
      username: 'thomas',
      avatar: 'a1',
      guilds: [{ id: 'g1', name: 'Serveur', icon: null, permissions: '8' }],
    });
    const response = await fetch(`${base}/api/me`, {
      headers: { Cookie: `${SESSION_COOKIE}=${id}` },
    });
    expect(await response.json()).toEqual({
      id: 'u1',
      username: 'thomas',
      avatar: 'a1',
      guilds: [{ id: 'g1', name: 'Serveur', icon: null, permissions: '8' }],
    });
  });
});

describe('POST /auth/logout', () => {
  it('devrait détruire la session et expirer le cookie', async () => {
    const { base, sessions } = await start();
    const id = await sessions.create({ userId: 'u1', username: 't', avatar: null, guilds: [] });
    const response = await fetch(`${base}/auth/logout`, {
      method: 'POST',
      headers: { Cookie: `${SESSION_COOKIE}=${id}` },
    });
    expect(response.status).toBe(204);
    expect(await sessions.get(id)).toBeUndefined();
    expect(
      response.headers.getSetCookie().find((line) => line.startsWith(`${SESSION_COOKIE}=`)),
    ).toContain('Max-Age=0');
  });

  it('devrait répondre 204 même sans session', async () => {
    const { base } = await start();
    expect((await fetch(`${base}/auth/logout`, { method: 'POST' })).status).toBe(204);
  });
});

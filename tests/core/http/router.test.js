import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJsonDriver } from '../../../src/core/storage/drivers/json.js';
import { createSessions, SESSION_COOKIE } from '../../../src/core/http/session.js';
import { createRouter } from '../../../src/core/http/router.js';
import { HttpError } from '../../../src/core/errors.js';

/** @type {string} */
let dir;
/** @type {import('../../../src/core/storage/driver.js').StorageDriver} */
let storage;
/** @type {import('node:http').Server | undefined} */
let server;

const silentLogger = () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(),
});

/**
 * Démarre un vrai serveur sur le port 0 : l'OS attribue un port libre,
 * donc aucun risque de collision entre fichiers de test.
 * @param {import('../../../src/core/http/router.js').HttpRoute[]} routes
 * @param {{ ownerId?: string, logger?: ReturnType<typeof silentLogger> }} [options]
 */
const start = async (routes, { ownerId, logger = silentLogger() } = {}) => {
  const sessions = createSessions({ storage });
  const client = /** @type {import('discord.js').Client} */ (
    /** @type {unknown} */ ({ guilds: { cache: new Map() } })
  );
  const router = createRouter({
    routes,
    sessions,
    client,
    ownerId,
    logger: /** @type {import('../../../src/core/logger.js').Logger} */ (
      /** @type {unknown} */ (logger)
    ),
  });
  server = createServer(router);
  await new Promise((resolve) => server?.listen(0, '127.0.0.1', () => resolve(undefined)));
  const address = /** @type {import('node:net').AddressInfo} */ (server.address());
  return { base: `http://127.0.0.1:${address.port}`, sessions, logger };
};

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'nexis-router-'));
  storage = createJsonDriver({ path: join(dir, 's.json') });
  await storage.init();
});

afterEach(async () => {
  if (server) await new Promise((resolve) => server?.close(() => resolve(undefined)));
  server = undefined;
  await storage.close();
  await rm(dir, { recursive: true, force: true });
});

describe('dispatch', () => {
  it('devrait répondre 404 sur un chemin inconnu', async () => {
    const { base } = await start([]);
    expect((await fetch(`${base}/inexistant`)).status).toBe(404);
  });

  it('devrait répondre 404 si la méthode ne correspond pas', async () => {
    const { base } = await start([
      { method: 'GET', path: '/api/x', auth: 'public', handler: () => ({ ok: true }) },
    ]);
    expect((await fetch(`${base}/api/x`, { method: 'POST' })).status).toBe(404);
  });

  it('devrait sérialiser en 200 la valeur retournée par le handler', async () => {
    const { base } = await start([
      { method: 'GET', path: '/api/x', auth: 'public', handler: () => ({ ok: true }) },
    ]);
    const response = await fetch(`${base}/api/x`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it('devrait passer la query au handler', async () => {
    const { base } = await start([
      { method: 'GET', path: '/api/x', auth: 'public', handler: ({ query }) => query },
    ]);
    expect(await (await fetch(`${base}/api/x?a=1&b=2`)).json()).toEqual({ a: '1', b: '2' });
  });

  it('devrait passer le paramètre guild comme guildId', async () => {
    const { base } = await start([
      {
        method: 'GET',
        path: '/api/x',
        auth: 'public',
        handler: ({ guildId }) => ({ guildId: guildId ?? null }),
      },
    ]);
    expect(await (await fetch(`${base}/api/x?guild=g1`)).json()).toEqual({ guildId: 'g1' });
  });

  it('devrait lire le corps JSON des requêtes POST', async () => {
    const { base } = await start([
      { method: 'POST', path: '/api/x', auth: 'public', handler: ({ body }) => body },
    ]);
    const response = await fetch(`${base}/api/x`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ a: 1 }),
    });
    expect(await response.json()).toEqual({ a: 1 });
  });

  it("devrait laisser le handler écrire lui-même la réponse s'il ne retourne rien", async () => {
    const { base } = await start([
      {
        method: 'GET',
        path: '/api/x',
        auth: 'public',
        handler: (_params, { res }) => {
          res.writeHead(204);
          res.end();
          return undefined;
        },
      },
    ]);
    expect((await fetch(`${base}/api/x`)).status).toBe(204);
  });
});

describe('erreurs', () => {
  it('devrait rendre une HttpError avec son statut et son message', async () => {
    const { base } = await start([
      {
        method: 'GET',
        path: '/api/x',
        auth: 'public',
        handler: () => {
          throw new HttpError(418, 'Théière');
        },
      },
    ]);
    const response = await fetch(`${base}/api/x`);
    expect(response.status).toBe(418);
    expect(await response.json()).toEqual({ error: 'Théière' });
  });

  it('devrait rendre 500 avec un errorId sur une erreur inattendue', async () => {
    const { base } = await start([
      {
        method: 'GET',
        path: '/api/x',
        auth: 'public',
        plugin: 'demo',
        handler: () => {
          throw new Error('cassé');
        },
      },
    ]);
    const response = await fetch(`${base}/api/x`);
    expect(response.status).toBe(500);
    const payload = /** @type {{ error: string, errorId: string }} */ (await response.json());
    expect(payload.errorId).toMatch(/^[0-9a-f]{8}$/);
  });

  it("devrait logger l'erreur avec le même errorId que celui rendu", async () => {
    const logger = silentLogger();
    const { base } = await start(
      [
        {
          method: 'GET',
          path: '/api/x',
          auth: 'public',
          plugin: 'demo',
          handler: () => {
            throw new Error('cassé');
          },
        },
      ],
      { logger },
    );
    const payload = /** @type {{ errorId: string }} */ (
      await (await fetch(`${base}/api/x`)).json()
    );
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('cassé'),
      expect.objectContaining({ errorId: payload.errorId, plugin: 'demo' }),
    );
  });

  it('devrait refuser en 401 une route protégée sans session', async () => {
    const { base } = await start([
      { method: 'GET', path: '/api/x', auth: 'guild-admin', handler: () => ({ ok: true }) },
    ]);
    expect((await fetch(`${base}/api/x?guild=g1`)).status).toBe(401);
  });

  it('devrait reconnaître la session portée par le cookie', async () => {
    const { base, sessions } = await start(
      [
        {
          method: 'GET',
          path: '/api/x',
          auth: 'owner',
          handler: (_params, { session }) => ({ user: session?.userId }),
        },
      ],
      { ownerId: 'u1' },
    );
    const id = await sessions.create({ userId: 'u1', username: 't', avatar: null, guilds: [] });
    const response = await fetch(`${base}/api/x`, {
      headers: { Cookie: `${SESSION_COOKIE}=${id}` },
    });
    expect(await response.json()).toEqual({ user: 'u1' });
  });
});

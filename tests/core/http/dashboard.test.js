import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootstrap } from '../../../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, '..', '..', 'fixtures', 'plugins-with-routes');

class FakeClient extends EventEmitter {
  constructor() {
    super();
    this.guilds = { cache: new Map() };
    this.login = vi.fn().mockResolvedValue('ok');
    this.destroy = vi.fn().mockResolvedValue(undefined);
  }
}

/** @type {string} */
let dir;
/** @type {Awaited<ReturnType<typeof bootstrap>> | undefined} */
let app;

/** @param {Record<string, string>} [overrides] */
const boot = async (overrides = {}) => {
  app = await bootstrap({
    env: {
      DISCORD_TOKEN: 'tok',
      DISCORD_CLIENT_ID: 'app1',
      LOG_LEVEL: 'error',
      STORAGE_DRIVER: 'json',
      STORAGE_PATH: join(dir, 'store.json'),
      PLUGINS_DIR: fixtures,
      DISCORD_CLIENT_SECRET: 'secret',
      DASHBOARD_PORT: '0',
      ...overrides,
    },
    clientFactory: () =>
      /** @type {import('discord.js').Client} */ (/** @type {unknown} */ (new FakeClient())),
    restFactory: () => ({ put: async () => undefined }),
  });
  return app;
};

/** @param {Awaited<ReturnType<typeof bootstrap>>} instance */
const baseUrl = (instance) => `http://127.0.0.1:${instance.http?.port()}`;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'nexis-dashboard-'));
});

afterEach(async () => {
  await app?.shutdown();
  app = undefined;
  await rm(dir, { recursive: true, force: true });
});

describe('activation', () => {
  it('devrait démarrer le serveur quand le secret est fourni', async () => {
    const instance = await boot();
    expect(instance.http?.port()).toBeGreaterThan(0);
  });

  it('devrait ne rien démarrer sans DISCORD_CLIENT_SECRET', async () => {
    const instance = await boot({ DISCORD_CLIENT_SECRET: '' });
    expect(instance.http).toBeUndefined();
  });

  it('devrait quand même assembler le bot sans dashboard', async () => {
    const instance = await boot({ DISCORD_CLIENT_SECRET: '' });
    expect(instance.plugins.map((plugin) => plugin.name)).toEqual(['router']);
  });
});

describe('routes de plugins servies', () => {
  it('devrait servir une route publique déclarée par un plugin', async () => {
    const instance = await boot();
    const response = await fetch(`${baseUrl(instance)}/api/plugins/router/ping`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ pong: true });
  });

  it('devrait rendre 500 avec un errorId si le handler échoue', async () => {
    const instance = await boot();
    const response = await fetch(`${baseUrl(instance)}/api/plugins/router/boom`);
    expect(response.status).toBe(500);
    const payload = /** @type {{ errorId: string }} */ (await response.json());
    expect(payload.errorId).toMatch(/^[0-9a-f]{8}$/);
  });

  it("devrait tracer l'incident dans le reporting d'erreurs", async () => {
    const instance = await boot();
    const payload = /** @type {{ errorId: string }} */ (
      await (await fetch(`${baseUrl(instance)}/api/plugins/router/boom`)).json()
    );
    const stored = /** @type {{ id: string }[]} */ (
      (await instance.storage.get('core:errors')) ?? []
    );
    expect(stored.some((entry) => entry.id === payload.errorId)).toBe(true);
  });

  it('devrait exposer les endpoints du socle', async () => {
    const instance = await boot();
    expect((await fetch(`${baseUrl(instance)}/api/me`)).status).toBe(401);
  });
});

describe('cycle de vie', () => {
  it('devrait fermer le serveur au shutdown', async () => {
    const instance = await boot();
    const url = `${baseUrl(instance)}/api/plugins/router/ping`;
    await instance.shutdown();
    app = undefined;
    await expect(fetch(url)).rejects.toThrow();
  });

  it('devrait démarrer le bot sans dashboard si le port est déjà pris', async () => {
    const squatter = createServer(() => {});
    await new Promise((resolve) => squatter.listen(0, '127.0.0.1', () => resolve(undefined)));
    const address = /** @type {import('node:net').AddressInfo} */ (squatter.address());
    try {
      const instance = await boot({ DASHBOARD_PORT: String(address.port) });
      expect(instance.http).toBeUndefined();
    } finally {
      await new Promise((resolve) => squatter.close(() => resolve(undefined)));
    }
  });
});

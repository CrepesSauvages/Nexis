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
const fixturesSetupThrows = join(here, '..', '..', 'fixtures', 'plugins-routes-setup-throws');

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

/**
 * Espionne stderr le temps d'un test, pour observer les `warn` du logger
 * réel : `boot()` tourne à LOG_LEVEL=error, qui les avale silencieusement
 * avant même d'atteindre le flux. Il faut donc relever le niveau (voir
 * appelants) et intercepter l'écriture elle-même, pas un mock de méthode.
 * @returns {{ text: () => string, restore: () => void }}
 */
const captureStderr = () => {
  /** @type {string[]} */
  const chunks = [];
  const spy = vi
    .spyOn(process.stderr, 'write')
    .mockImplementation((chunk, encodingOrCallback, callback) => {
      chunks.push(chunk.toString());
      const done = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback;
      if (typeof done === 'function') done();
      return true;
    });
  return {
    text: () => chunks.join(''),
    restore: () => spy.mockRestore(),
  };
};

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
    const stderr = captureStderr();
    const instance = await boot({ DISCORD_CLIENT_SECRET: '', LOG_LEVEL: 'warn' });
    stderr.restore();
    expect(instance.http).toBeUndefined();
    expect(stderr.text()).toContain('Dashboard désactivé');
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
    const stderr = captureStderr();
    try {
      const instance = await boot({ DASHBOARD_PORT: String(address.port), LOG_LEVEL: 'warn' });
      stderr.restore();
      expect(instance.http).toBeUndefined();
      expect(stderr.text()).toContain('Serveur HTTP en erreur');
    } finally {
      stderr.restore();
      await new Promise((resolve) => squatter.close(() => resolve(undefined)));
    }
  });
});

describe("routes d'un plugin dont setup() échoue", () => {
  it("ne devrait pas servir la route d'un plugin exclu de active", async () => {
    const instance = await boot({ PLUGINS_DIR: fixturesSetupThrows });
    const response = await fetch(`${baseUrl(instance)}/api/plugins/throws-in-setup/ping`);
    expect(response.status).toBe(404);
  });

  it("devrait quand même servir la route d'un plugin voisin resté actif", async () => {
    const instance = await boot({ PLUGINS_DIR: fixturesSetupThrows });
    const response = await fetch(`${baseUrl(instance)}/api/plugins/ok/ping`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ pong: true });
  });
});

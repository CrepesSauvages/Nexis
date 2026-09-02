import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootstrap } from '../../../src/index.js';
import { SESSION_COOKIE, createSessions } from '../../../src/core/http/session.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, '..', '..', 'fixtures', 'plugins');

const ID = '123456789012345678';

class FakeClient extends EventEmitter {
  constructor() {
    super();
    const member = { permissions: { has: () => true } };
    /** @param {string} id */
    const makeGuild = (id) => ({
      id,
      members: { fetch: vi.fn().mockResolvedValue(member) },
      channels: { cache: new Map([[ID, {}]]) },
      roles: { cache: new Map([[ID, {}]]) },
    });
    this.guilds = {
      cache: new Map([
        ['g1', makeGuild('g1')],
        // Présent dans le cache du bot, contrairement à g2 et g3 : seul ce
        // serveur peut démontrer que le filtre ManageGuild fait quelque
        // chose, puisque g2 et g3 sont déjà éliminés avant lui.
        ['g4', makeGuild('g4')],
      ]),
    };
    this.login = vi.fn().mockResolvedValue('ok');
    this.destroy = vi.fn().mockResolvedValue(undefined);
  }
}

/** @type {string} */
let dir;
/** @type {Awaited<ReturnType<typeof bootstrap>> | undefined} */
let app;
/** @type {string} */
let cookie;

const boot = async () => {
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
    },
    clientFactory: () =>
      /** @type {import('discord.js').Client} */ (/** @type {unknown} */ (new FakeClient())),
    restFactory: () => ({ put: async () => undefined }),
  });

  const sessions = createSessions({ storage: app.storage });
  const id = await sessions.create({
    userId: 'u1',
    username: 'thomas',
    avatar: null,
    guilds: [
      { id: 'g1', name: 'Serveur un', icon: null, permissions: '32' },
      { id: 'g2', name: 'Bot absent', icon: null, permissions: '32' },
      { id: 'g3', name: 'Simple membre', icon: null, permissions: '0' },
      { id: 'g4', name: 'Droits insuffisants', icon: null, permissions: '0' },
    ],
  });
  cookie = `${SESSION_COOKIE}=${id}`;
  return `http://127.0.0.1:${app.http?.port()}`;
};

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'nexis-core-api-'));
});

afterEach(async () => {
  await app?.shutdown();
  app = undefined;
  await rm(dir, { recursive: true, force: true });
});

describe('GET /api/core/guilds', () => {
  it('devrait refuser en 401 sans session', async () => {
    const base = await boot();
    expect((await fetch(`${base}/api/core/guilds`)).status).toBe(401);
  });

  it('devrait ne garder que les serveurs où le bot est présent et où on gère', async () => {
    const base = await boot();
    const response = await fetch(`${base}/api/core/guilds`, { headers: { Cookie: cookie } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ id: 'g1', name: 'Serveur un', icon: null }]);
  });
});

describe('GET /api/core/plugins', () => {
  it('devrait refuser en 400 sans paramètre guild', async () => {
    const base = await boot();
    const response = await fetch(`${base}/api/core/plugins`, { headers: { Cookie: cookie } });
    expect(response.status).toBe(400);
  });

  it('devrait refuser en 401 sans session', async () => {
    const base = await boot();
    expect((await fetch(`${base}/api/core/plugins?guild=g1`)).status).toBe(401);
  });

  it('devrait lister chaque plugin avec son manifeste et son état', async () => {
    const base = await boot();
    const response = await fetch(`${base}/api/core/plugins?guild=g1`, {
      headers: { Cookie: cookie },
    });
    expect(response.status).toBe(200);
    const body = /** @type {{
      name: string,
      version: string,
      description: string | null,
      dependsOn: string[],
      alwaysEnabled: boolean,
      enabled: boolean,
      schema: object,
    }[]} */ (await response.json());
    const alpha = body.find((entry) => entry.name === 'alpha');
    expect(alpha).toBeDefined();
    expect(alpha?.version).toBe('1.0.0');
    expect(alpha?.description).toBe('Plugin de test');
    expect(alpha?.dependsOn).toEqual([]);
    expect(alpha?.alwaysEnabled).toBe(false);
    expect(alpha?.enabled).toBe(false);
    expect(alpha).toHaveProperty('schema');
    expect(alpha).toHaveProperty('config');
  });

  it('devrait refléter une activation', async () => {
    const base = await boot();
    await app?.guildConfig.enable('g1', 'alpha');
    const body = /** @type {{ name: string, enabled: boolean }[]} */ (
      await (
        await fetch(`${base}/api/core/plugins?guild=g1`, { headers: { Cookie: cookie } })
      ).json()
    );
    expect(body.find((entry) => entry.name === 'alpha')?.enabled).toBe(true);
  });
});

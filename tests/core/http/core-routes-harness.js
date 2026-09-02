import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { vi } from 'vitest';
import { bootstrap } from '../../../src/index.js';
import { SESSION_COOKIE, createSessions } from '../../../src/core/http/session.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, '..', '..', 'fixtures', 'plugins');

export const ID = '123456789012345678';

export class FakeClient extends EventEmitter {
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

export class CoreRoutesTestHarness {
  constructor() {
    /** @type {string} */
    this.dir = '';
    /** @type {Awaited<ReturnType<typeof bootstrap>> | undefined} */
    this.app = undefined;
    /** @type {string} */
    this.cookie = '';
  }

  /**
   * Démarre le serveur de test et retourne l'URL de base.
   * @returns {Promise<string>}
   */
  async boot() {
    this.app = await bootstrap({
      env: {
        DISCORD_TOKEN: 'tok',
        DISCORD_CLIENT_ID: 'app1',
        LOG_LEVEL: 'error',
        STORAGE_DRIVER: 'json',
        STORAGE_PATH: join(this.dir, 'store.json'),
        PLUGINS_DIR: fixtures,
        DISCORD_CLIENT_SECRET: 'secret',
        DASHBOARD_PORT: '0',
      },
      clientFactory: () =>
        /** @type {import('discord.js').Client} */ (/** @type {unknown} */ (new FakeClient())),
      restFactory: () => ({ put: async () => undefined }),
    });

    const sessions = createSessions({ storage: this.app.storage });
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
    this.cookie = `${SESSION_COOKIE}=${id}`;
    return `http://127.0.0.1:${this.app.http?.port()}`;
  }

  /**
   * Initialise le répertoire temporaire.
   * @returns {Promise<void>}
   */
  async setupTempDir() {
    this.dir = await mkdtemp(join(tmpdir(), 'nexis-core-api-'));
  }

  /**
   * Nettoie après le test.
   * @returns {Promise<void>}
   */
  async cleanup() {
    await this.app?.shutdown();
    this.app = undefined;
    await rm(this.dir, { recursive: true, force: true });
  }
}

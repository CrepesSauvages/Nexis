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
export const i18nFixtures = join(here, '..', '..', 'fixtures', 'plugins-with-i18n');

export const ID = '123456789012345678';

export class FakeClient extends EventEmitter {
  constructor() {
    super();
    const member = { permissions: { has: () => true } };
    // Membre réel du serveur, mais sans « Gérer le serveur ». Sans ce
    // deuxième profil, resolveAuth n'est exercé qu'avec des membres toujours
    // autorisés, et le vrai chemin de refus 403 câblé bout en bout (routeur
    // + auth.js + client) ne l'est jamais.
    const memberWithoutManageGuild = { permissions: { has: () => false } };
    /**
     * @param {string} id
     * @param {{ permissions: { has: () => boolean } }} [memberProfile]
     */
    const makeGuild = (id, memberProfile = member) => ({
      id,
      members: { fetch: vi.fn().mockResolvedValue(memberProfile) },
      channels: {
        cache: new Map([
          [ID, { id: ID, name: 'general', type: 0, rawPosition: 1 }],
          ['c2', { id: 'c2', name: 'annonces', type: 0, rawPosition: 0 }],
        ]),
      },
      roles: {
        cache: new Map([
          [ID, { id: ID, name: 'Staff', hexColor: '#5865f2', position: 5 }],
          ['r2', { id: 'r2', name: '@everyone', hexColor: '#000000', position: 0 }],
        ]),
      },
    });
    this.guilds = {
      cache: new Map([
        ['g1', makeGuild('g1')],
        // Présent dans le cache du bot, contrairement à g2 et g3 : seul ce
        // serveur peut démontrer que le filtre ManageGuild fait quelque
        // chose, puisque g2 et g3 sont déjà éliminés avant lui.
        ['g4', makeGuild('g4')],
        // Membre réel, sans la permission requise : seul serveur qui exerce
        // le refus 403 de resolveAuth plutôt que la coupe faite en amont sur
        // session.guilds.
        ['g5', makeGuild('g5', memberWithoutManageGuild)],
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
   * @param {{ pluginsDir?: string }} [options]
   * @returns {Promise<string>}
   */
  async boot({ pluginsDir = fixtures } = {}) {
    this.app = await bootstrap({
      env: {
        DISCORD_TOKEN: 'tok',
        DISCORD_CLIENT_ID: 'app1',
        LOG_LEVEL: 'error',
        STORAGE_DRIVER: 'json',
        STORAGE_PATH: join(this.dir, 'store.json'),
        PLUGINS_DIR: pluginsDir,
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

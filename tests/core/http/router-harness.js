import { vi } from 'vitest';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJsonDriver } from '../../../src/core/storage/drivers/json.js';
import { createSessions } from '../../../src/core/http/session.js';
import { createRouter } from '../../../src/core/http/router.js';
import { createGuildConfig } from '../../../src/core/guild-config.js';

/**
 * Un logger qui n'écrit rien : les tests d'erreurs vérifient ses appels sans
 * jamais vouloir voir la sortie dans la console.
 * @returns {{
 *   debug: import('vitest').Mock,
 *   info: import('vitest').Mock,
 *   warn: import('vitest').Mock,
 *   error: import('vitest').Mock,
 *   child: import('vitest').Mock,
 * }}
 */
export const silentLogger = () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(),
});

/**
 * Démarre un vrai serveur HTTP par-dessus `createRouter`, pour les tests de
 * bout en bout du routeur.
 *
 * Extrait en module partagé — comme `core-routes-harness.js` l'a été pour
 * `core-routes.test.js` — pour que `dispatch`, `erreurs` et `activation par
 * serveur` restent chacun sous 300 lignes une fois dans des fichiers séparés.
 */
export class RouterTestHarness {
  constructor() {
    /** @type {string} */
    this.dir = '';
    /** @type {import('../../../src/core/storage/driver.js').StorageDriver | undefined} */
    this.storage = undefined;
    /** @type {import('node:http').Server | undefined} */
    this.server = undefined;
  }

  /**
   * Initialise le répertoire temporaire et le stockage du test.
   * @returns {Promise<void>}
   */
  async setupTempDir() {
    this.dir = await mkdtemp(join(tmpdir(), 'nexis-router-'));
    this.storage = createJsonDriver({ path: join(this.dir, 's.json') });
    await this.storage.init();
  }

  /**
   * Démarre le serveur de test sur un port libre (port 0 : l'OS l'attribue,
   * donc aucun risque de collision entre fichiers de test).
   *
   * @param {import('../../../src/core/http/router.js').HttpRoute[]} routes
   * @param {{
   *   ownerId?: string,
   *   logger?: ReturnType<typeof silentLogger>,
   *   client?: import('discord.js').Client,
   *   guildConfig?: ReturnType<typeof createGuildConfig>,
   *   alwaysEnabled?: string[],
   *   fallback?: (res: import('node:http').ServerResponse, pathname: string) => Promise<boolean>,
   * }} [options]
   * @returns {Promise<{
   *   base: string,
   *   sessions: ReturnType<typeof createSessions>,
   *   logger: ReturnType<typeof silentLogger>,
   * }>}
   */
  async start(
    routes,
    { ownerId, logger = silentLogger(), client, guildConfig, alwaysEnabled, fallback } = {},
  ) {
    const storage = /** @type {import('../../../src/core/storage/driver.js').StorageDriver} */ (
      this.storage
    );
    const sessions = createSessions({ storage });
    const resolvedClient =
      client ??
      /** @type {import('discord.js').Client} */ (
        /** @type {unknown} */ ({ guilds: { cache: new Map() } })
      );
    const router = createRouter({
      routes,
      sessions,
      client: resolvedClient,
      guildConfig: guildConfig ?? createGuildConfig({ storage }),
      alwaysEnabled,
      fallback,
      ownerId,
      logger: /** @type {import('../../../src/core/logger.js').Logger} */ (
        /** @type {unknown} */ (logger)
      ),
    });
    this.server = createServer(router);
    await new Promise((resolve) => this.server?.listen(0, '127.0.0.1', () => resolve(undefined)));
    const address = /** @type {import('node:net').AddressInfo} */ (this.server.address());
    return { base: `http://127.0.0.1:${address.port}`, sessions, logger };
  }

  /**
   * Ferme le serveur, le stockage, et nettoie le répertoire temporaire.
   * @returns {Promise<void>}
   */
  async cleanup() {
    if (this.server) {
      await new Promise((resolve) => this.server?.close(() => resolve(undefined)));
    }
    this.server = undefined;
    await this.storage?.close();
    await rm(this.dir, { recursive: true, force: true });
  }
}

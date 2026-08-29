import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJsonDriver } from './storage/drivers/json.js';
import { createRegistries } from './registry/index.js';
import { createGuildConfig } from './guild-config.js';
import { createLogger } from './logger.js';
import { createScheduler } from './scheduler.js';

const silent = () => createLogger({ level: 'error' });

/**
 * @param {string} name
 * @param {Partial<import('./manifest.js').PluginManifest>} [manifest]
 * @returns {import('./loader.js').LoadedPlugin}
 */
const makePlugin = (name, manifest = {}) => ({
  name,
  manifest: { name, version: '1.0.0', ...manifest },
  setup: () => {},
  dir: `/fake/${name}`,
});

/**
 * @param {string[]} guildIds
 * @returns {import('discord.js').Client}
 */
const makeClient = (guildIds) => {
  const cache = new Map(guildIds.map((id) => [id, { id }]));
  return /** @type {import('discord.js').Client} */ ({
    guilds: { cache },
  });
};

/** @type {string} */
let dir;
/** @type {import('./storage/driver.js').StorageDriver} */
let storage;
/** @type {import('./registry/index.js').Registries} */
let registries;
/** @type {ReturnType<typeof createGuildConfig>} */
let guildConfig;

/**
 * @param {import('./loader.js').LoadedPlugin[]} plugins
 * @param {import('discord.js').Client} client
 * @param {object} [overrides]
 * @returns {ReturnType<typeof createScheduler>}
 */
const build = (plugins, client, overrides = {}) =>
  createScheduler({
    plugins,
    registries,
    guildConfig,
    client,
    logger: silent(),
    ...overrides,
  });

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'nexis-sched-'));
  storage = createJsonDriver({ path: join(dir, 's.json') });
  await storage.init();
  registries = createRegistries();
  guildConfig = createGuildConfig({ storage });
});

afterEach(async () => {
  await storage.close();
  await rm(dir, { recursive: true, force: true });
});

describe('runJob', () => {
  it('devrait appeler le handler pour chaque guild activée', async () => {
    const handler = vi.fn();
    registries.jobs.add('stats', '0 9 * * *', handler);
    await guildConfig.enable('g1', 'stats');
    await guildConfig.enable('g2', 'stats');

    const scheduler = build([makePlugin('stats')], makeClient(['g1', 'g2', 'g3']));
    await scheduler.runJob(registries.jobs.all()[0]);

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("ne devrait rien appeler si aucune guild n'est activée", async () => {
    const handler = vi.fn();
    registries.jobs.add('stats', '0 9 * * *', handler);

    const scheduler = build([makePlugin('stats')], makeClient(['g1']));
    await scheduler.runJob(registries.jobs.all()[0]);

    expect(handler).not.toHaveBeenCalled();
  });

  it('devrait passer guildId et config résolue', async () => {
    const handler = vi.fn();
    registries.jobs.add('stats', '0 9 * * *', handler);
    await guildConfig.enable('g1', 'stats');

    const plugin = makePlugin('stats', {
      config: { seuil: { type: 'number', label: 'Seuil', default: 10 } },
    });
    await build([plugin], makeClient(['g1'])).runJob(registries.jobs.all()[0]);

    expect(handler).toHaveBeenCalledWith('g1', { seuil: 10 });
  });

  it("devrait isoler l'erreur d'une guild des autres", async () => {
    const handler = vi.fn((guildId) => {
      if (guildId === 'g1') throw new Error('boum');
    });
    registries.jobs.add('stats', '0 9 * * *', handler);
    await guildConfig.enable('g1', 'stats');
    await guildConfig.enable('g2', 'stats');

    await build([makePlugin('stats')], makeClient(['g1', 'g2'])).runJob(registries.jobs.all()[0]);

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("devrait logger l'erreur avec plugin et guildId", async () => {
    const logger = { ...silent(), error: vi.fn(), child: () => logger };
    registries.jobs.add('stats', '0 9 * * *', () => {
      throw new Error('boum');
    });
    await guildConfig.enable('g1', 'stats');

    const scheduler = build([makePlugin('stats')], makeClient(['g1']), { logger });
    await scheduler.runJob(registries.jobs.all()[0]);

    expect(logger.error.mock.calls[0][1]).toMatchObject({ plugin: 'stats', guildId: 'g1' });
  });

  it("ne devrait pas propager le rejet d'une erreur de storage pendant la vérification d'activation", async () => {
    // `isEnabled` (storage) est appelé AVANT le try/catch de la tâche elle-
    // même : un rejet ici doit être capturé au même titre qu'une erreur du
    // handler, pas laisser un rejet non intercepté remonter à `runJob`.
    const handler = vi.fn();
    registries.jobs.add('stats', '0 9 * * *', handler);
    guildConfig.isEnabled = vi.fn().mockRejectedValue(new Error('storage indisponible'));

    const logger = { ...silent(), error: vi.fn(), child: () => logger };
    const scheduler = build([makePlugin('stats')], makeClient(['g1']), { logger });

    await expect(scheduler.runJob(registries.jobs.all()[0])).resolves.toBeUndefined();
    expect(handler).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledOnce();
    expect(logger.error.mock.calls[0][1]).toMatchObject({ plugin: 'stats', guildId: 'g1' });
  });

  it('devrait exécuter un plugin alwaysEnabled sur toutes les guilds', async () => {
    const handler = vi.fn();
    registries.jobs.add('core', '0 9 * * *', handler);

    const scheduler = build([makePlugin('core')], makeClient(['g1', 'g2']), {
      alwaysEnabled: ['core'],
    });
    await scheduler.runJob(registries.jobs.all()[0]);

    expect(handler).toHaveBeenCalledTimes(2);
  });
});

describe('start et stop', () => {
  it('devrait programmer un cron par job', () => {
    registries.jobs.add('stats', '0 9 * * *', () => {});
    registries.jobs.add('purge', '0 3 * * *', () => {});

    const scheduler = build([makePlugin('stats'), makePlugin('purge')], makeClient([]));
    expect(scheduler.start()).toBe(2);
    scheduler.stop();
  });

  it("devrait écarter un job dont l'expression cron est invalide", () => {
    registries.jobs.add('stats', 'pas du cron', () => {});

    const scheduler = build([makePlugin('stats')], makeClient([]));
    expect(scheduler.start()).toBe(0);
    scheduler.stop();
  });

  it('devrait pouvoir être arrêté sans avoir démarré', () => {
    expect(() => build([], makeClient([])).stop()).not.toThrow();
  });
});

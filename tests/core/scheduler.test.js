import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJsonDriver } from '../../src/core/storage/drivers/json.js';
import { createRegistries } from '../../src/core/registry/index.js';
import { createGuildConfig } from '../../src/core/guild-config.js';
import { createLogger } from '../../src/core/logger.js';
import { createScheduler } from '../../src/core/scheduler.js';

const silent = () => createLogger({ level: 'error' });

/**
 * @param {string} name
 * @param {Partial<import('../../src/core/manifest.js').PluginManifest>} [manifest]
 * @returns {import('../../src/core/loader.js').LoadedPlugin}
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
/** @type {import('../../src/core/storage/driver.js').StorageDriver} */
let storage;
/** @type {import('../../src/core/registry/index.js').Registries} */
let registries;
/** @type {ReturnType<typeof createGuildConfig>} */
let guildConfig;

/**
 * @param {import('../../src/core/loader.js').LoadedPlugin[]} plugins
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

describe('exécution par vagues', () => {
  /**
   * Compte les exécutions simultanées : le maximum observé dit si la
   * concurrence est effectivement bornée.
   */
  const trackingHandler = () => {
    let running = 0;
    let peak = 0;
    const handler = vi.fn(async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setImmediate(resolve));
      running -= 1;
    });
    return { handler, peak: () => peak };
  };

  it('devrait traiter plusieurs serveurs en parallèle', async () => {
    const { handler, peak } = trackingHandler();
    registries.jobs.add('stats', '0 9 * * *', handler);
    for (const id of ['g1', 'g2', 'g3', 'g4']) await guildConfig.enable(id, 'stats');

    const scheduler = build([makePlugin('stats')], makeClient(['g1', 'g2', 'g3', 'g4']), {
      concurrency: 4,
    });
    await scheduler.runJob({ plugin: 'stats', cron: '0 9 * * *', handler });

    expect(handler).toHaveBeenCalledTimes(4);
    expect(peak()).toBeGreaterThan(1);
  });

  it('ne devrait pas dépasser la concurrence demandée', async () => {
    const { handler, peak } = trackingHandler();
    registries.jobs.add('stats', '0 9 * * *', handler);
    const ids = ['g1', 'g2', 'g3', 'g4', 'g5', 'g6'];
    for (const id of ids) await guildConfig.enable(id, 'stats');

    const scheduler = build([makePlugin('stats')], makeClient(ids), { concurrency: 2 });
    await scheduler.runJob({ plugin: 'stats', cron: '0 9 * * *', handler });

    expect(handler).toHaveBeenCalledTimes(6);
    expect(peak()).toBeLessThanOrEqual(2);
  });

  it('ne devrait pas laisser un serveur en échec priver les suivants', async () => {
    const handler = vi.fn(async (/** @type {string} */ guildId) => {
      if (guildId === 'g1') throw new Error('boum');
    });
    registries.jobs.add('stats', '0 9 * * *', handler);
    for (const id of ['g1', 'g2', 'g3']) await guildConfig.enable(id, 'stats');

    const scheduler = build([makePlugin('stats')], makeClient(['g1', 'g2', 'g3']), {
      concurrency: 3,
    });
    await scheduler.runJob({ plugin: 'stats', cron: '0 9 * * *', handler });

    expect(handler).toHaveBeenCalledTimes(3);
  });
});

describe('armement des tâches', () => {
  it('devrait protéger chaque tâche du recouvrement', () => {
    registries.jobs.add('stats', '0 9 * * *', vi.fn());
    const scheduler = build([makePlugin('stats')], makeClient(['g1']));
    scheduler.start();

    // Une fonction plutôt que `true` : le saut est journalisé, pas subi
    // en silence.
    expect(scheduler.armed()[0].options.protect).toBeTypeOf('function');
    scheduler.stop();
  });

  it('devrait armer dans le fuseau demandé', () => {
    registries.jobs.add('stats', '0 9 * * *', vi.fn());
    const scheduler = build([makePlugin('stats')], makeClient(['g1']), {
      timezone: 'Europe/Paris',
    });
    scheduler.start();

    expect(scheduler.armed()[0].options.timezone).toBe('Europe/Paris');
    scheduler.stop();
  });

  it("ne devrait imposer aucun fuseau quand rien n'est configuré", () => {
    registries.jobs.add('stats', '0 9 * * *', vi.fn());
    const scheduler = build([makePlugin('stats')], makeClient(['g1']));
    scheduler.start();

    expect(scheduler.armed()[0].options.timezone).toBeUndefined();
    scheduler.stop();
  });

  it('ne devrait rien armer pour une expression cron invalide', () => {
    registries.jobs.add('stats', 'pas du cron', vi.fn());
    const scheduler = build([makePlugin('stats')], makeClient(['g1']));
    scheduler.start();

    expect(scheduler.armed()).toEqual([]);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJsonDriver } from './storage/drivers/json.js';
import { createRegistries } from './registry/index.js';
import { createGuildConfig } from './guild-config.js';
import { createLogger } from './logger.js';
import { attachEventDispatcher } from './dispatcher.js';

const silent = () => createLogger({ level: 'error' });
const flush = () => new Promise((resolve) => setImmediate(resolve));

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

/** @type {string} */
let dir;
/** @type {import('./storage/driver.js').StorageDriver} */
let storage;
/** @type {import('./registry/index.js').Registries} */
let registries;
/** @type {ReturnType<typeof createGuildConfig>} */
let guildConfig;
/** @type {EventEmitter} */
let client;

/**
 * `client` est un simple EventEmitter en test : suffisant pour émettre les
 * events consommés par `client.on(...)`, mais pas un vrai `Client` discord.js.
 * @returns {import('discord.js').Client}
 */
const asClient = () => /** @type {import('discord.js').Client} */ (client);

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'nexis-disp-'));
  storage = createJsonDriver({ path: join(dir, 's.json') });
  await storage.init();
  registries = createRegistries();
  guildConfig = createGuildConfig({ storage });
  client = new EventEmitter();
});

afterEach(async () => {
  await storage.close();
  await rm(dir, { recursive: true, force: true });
});

describe('attachEventDispatcher', () => {
  it("devrait appeler le handler d'un plugin activé", async () => {
    const handler = vi.fn();
    registries.events.add('welcome', 'guildMemberAdd', handler);
    await guildConfig.enable('g1', 'welcome');

    attachEventDispatcher({
      client: asClient(),
      plugins: [makePlugin('welcome')],
      registries,
      guildConfig,
      logger: silent(),
    });
    client.emit('guildMemberAdd', { guildId: 'g1' });
    await flush();

    expect(handler).toHaveBeenCalledOnce();
  });

  it("ne devrait pas appeler le handler d'un plugin désactivé", async () => {
    const handler = vi.fn();
    registries.events.add('welcome', 'guildMemberAdd', handler);

    attachEventDispatcher({
      client: asClient(),
      plugins: [makePlugin('welcome')],
      registries,
      guildConfig,
      logger: silent(),
    });
    client.emit('guildMemberAdd', { guildId: 'g1' });
    await flush();

    expect(handler).not.toHaveBeenCalled();
  });

  it('devrait isoler une erreur de handler de ses voisins', async () => {
    const boom = vi.fn(() => {
      throw new Error('boum');
    });
    const survivor = vi.fn();
    registries.events.add('a', 'guildMemberAdd', boom);
    registries.events.add('b', 'guildMemberAdd', survivor);
    await guildConfig.enable('g1', 'a');
    await guildConfig.enable('g1', 'b');

    attachEventDispatcher({
      client: asClient(),
      plugins: [makePlugin('a'), makePlugin('b')],
      registries,
      guildConfig,
      logger: silent(),
    });
    client.emit('guildMemberAdd', { guildId: 'g1' });
    await flush();

    expect(boom).toHaveBeenCalledOnce();
    expect(survivor).toHaveBeenCalledOnce();
  });

  it('devrait logger une erreur avec plugin, event et guildId', async () => {
    const logger = { ...silent(), error: vi.fn(), child: () => logger };
    registries.events.add('a', 'guildMemberAdd', () => {
      throw new Error('boum');
    });
    await guildConfig.enable('g1', 'a');

    attachEventDispatcher({
      client: asClient(),
      plugins: [makePlugin('a')],
      registries,
      guildConfig,
      logger,
    });
    client.emit('guildMemberAdd', { guildId: 'g1' });
    await flush();

    expect(logger.error).toHaveBeenCalledOnce();
    expect(logger.error.mock.calls[0][1]).toMatchObject({
      plugin: 'a',
      event: 'guildMemberAdd',
      guildId: 'g1',
    });
  });

  it('devrait attraper aussi les rejets asynchrones', async () => {
    const logger = { ...silent(), error: vi.fn(), child: () => logger };
    registries.events.add('a', 'guildMemberAdd', async () => {
      throw new Error('boum async');
    });
    await guildConfig.enable('g1', 'a');

    attachEventDispatcher({
      client: asClient(),
      plugins: [makePlugin('a')],
      registries,
      guildConfig,
      logger,
    });
    client.emit('guildMemberAdd', { guildId: 'g1' });
    await flush();
    await flush();

    expect(logger.error).toHaveBeenCalledOnce();
  });

  it('devrait ignorer un event hors guild si allowDM est faux', async () => {
    const handler = vi.fn();
    registries.events.add('a', 'messageCreate', handler);

    attachEventDispatcher({
      client: asClient(),
      plugins: [makePlugin('a', { allowDM: false })],
      registries,
      guildConfig,
      logger: silent(),
    });
    client.emit('messageCreate', { guildId: null });
    await flush();

    expect(handler).not.toHaveBeenCalled();
  });

  it('devrait délivrer un event hors guild si allowDM est vrai', async () => {
    const handler = vi.fn();
    registries.events.add('a', 'messageCreate', handler);

    attachEventDispatcher({
      client: asClient(),
      plugins: [makePlugin('a', { allowDM: true })],
      registries,
      guildConfig,
      logger: silent(),
    });
    client.emit('messageCreate', { guildId: null });
    await flush();

    expect(handler).toHaveBeenCalledOnce();
  });

  it('devrait toujours délivrer aux plugins alwaysEnabled', async () => {
    const handler = vi.fn();
    registries.events.add('core', 'guildMemberAdd', handler);

    attachEventDispatcher({
      client: asClient(),
      plugins: [makePlugin('core')],
      registries,
      guildConfig,
      logger: silent(),
      alwaysEnabled: ['core'],
    });
    client.emit('guildMemberAdd', { guildId: 'g1' });
    await flush();

    expect(handler).toHaveBeenCalledOnce();
  });
});

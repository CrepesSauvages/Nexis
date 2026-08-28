import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJsonDriver } from './storage/drivers/json.js';
import { createRegistries } from './registry/index.js';
import { createGuildConfig } from './guild-config.js';
import { createLogger } from './logger.js';
import { attachEventDispatcher, attachCommandDispatcher } from './dispatcher.js';

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

const makeInteraction = (overrides = {}) => ({
  isChatInputCommand: () => true,
  commandName: 'hello',
  guildId: 'g1',
  user: { id: 'u1' },
  memberPermissions: { has: () => true },
  replied: false,
  deferred: false,
  reply: vi.fn(),
  followUp: vi.fn(),
  ...overrides,
});

describe('attachCommandDispatcher', () => {
  const attach = (options = {}) =>
    attachCommandDispatcher({
      client: asClient(),
      contexts: new Map([['welcome', /** @type {never} */ ({ marker: 'ctx' })]]),
      registries,
      guildConfig,
      logger: silent(),
      ...options,
    });

  it("devrait exécuter la commande d'un plugin activé", async () => {
    const execute = vi.fn();
    registries.commands.add('welcome', { data: { name: 'hello' }, execute });
    await guildConfig.enable('g1', 'welcome');
    attach();

    client.emit('interactionCreate', makeInteraction());
    await flush();

    expect(execute).toHaveBeenCalledOnce();
  });

  it('devrait passer le contexte du plugin à execute', async () => {
    const execute = vi.fn();
    registries.commands.add('welcome', { data: { name: 'hello' }, execute });
    await guildConfig.enable('g1', 'welcome');
    attach();

    client.emit('interactionCreate', makeInteraction());
    await flush();

    expect(execute.mock.calls[0][1]).toEqual({ marker: 'ctx' });
  });

  it("devrait ignorer une interaction qui n'est pas une commande", async () => {
    const execute = vi.fn();
    registries.commands.add('welcome', { data: { name: 'hello' }, execute });
    attach();

    client.emit('interactionCreate', makeInteraction({ isChatInputCommand: () => false }));
    await flush();

    expect(execute).not.toHaveBeenCalled();
  });

  it("devrait répondre plutôt qu'exécuter si le plugin est désactivé", async () => {
    const execute = vi.fn();
    registries.commands.add('welcome', { data: { name: 'hello' }, execute });
    attach();

    const interaction = makeInteraction();
    client.emit('interactionCreate', interaction);
    await flush();

    expect(execute).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledOnce();
  });

  it('devrait refuser une commande guild-admin sans la permission', async () => {
    const execute = vi.fn();
    registries.commands.add('welcome', {
      data: { name: 'hello' },
      execute,
      permissions: 'guild-admin',
    });
    await guildConfig.enable('g1', 'welcome');
    attach();

    const interaction = makeInteraction({ memberPermissions: { has: () => false } });
    client.emit('interactionCreate', interaction);
    await flush();

    expect(execute).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledOnce();
  });

  it('devrait refuser une commande owner à un autre utilisateur', async () => {
    const execute = vi.fn();
    registries.commands.add('welcome', {
      data: { name: 'hello' },
      execute,
      permissions: 'owner',
    });
    await guildConfig.enable('g1', 'welcome');
    attach({ ownerId: 'patron' });

    client.emit('interactionCreate', makeInteraction());
    await flush();

    expect(execute).not.toHaveBeenCalled();
  });

  it('devrait autoriser le propriétaire sur une commande owner', async () => {
    const execute = vi.fn();
    registries.commands.add('welcome', {
      data: { name: 'hello' },
      execute,
      permissions: 'owner',
    });
    await guildConfig.enable('g1', 'welcome');
    attach({ ownerId: 'u1' });

    client.emit('interactionCreate', makeInteraction());
    await flush();

    expect(execute).toHaveBeenCalledOnce();
  });

  it("devrait répondre avec un id d'erreur si execute échoue", async () => {
    registries.commands.add('welcome', {
      data: { name: 'hello' },
      execute: () => {
        throw new Error('boum');
      },
    });
    await guildConfig.enable('g1', 'welcome');
    attach();

    const interaction = makeInteraction();
    client.emit('interactionCreate', interaction);
    await flush();

    expect(interaction.reply).toHaveBeenCalledOnce();
    expect(interaction.reply.mock.calls[0][0].content).toMatch(/[a-f0-9]{8}/);
  });

  it("devrait utiliser followUp si l'interaction a déjà répondu", async () => {
    registries.commands.add('welcome', {
      data: { name: 'hello' },
      execute: () => {
        throw new Error('boum');
      },
    });
    await guildConfig.enable('g1', 'welcome');
    attach();

    const interaction = makeInteraction({ replied: true });
    client.emit('interactionCreate', interaction);
    await flush();

    expect(interaction.followUp).toHaveBeenCalledOnce();
    expect(interaction.reply).not.toHaveBeenCalled();
  });

  it('devrait ignorer une commande inconnue', async () => {
    attach();
    const interaction = makeInteraction({ commandName: 'fantôme' });
    client.emit('interactionCreate', interaction);
    await flush();
    expect(interaction.reply).toHaveBeenCalledOnce();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJsonDriver } from './storage/drivers/json.js';
import { createRegistries } from './registry/index.js';
import { createGuildConfig } from './guild-config.js';
import { createLogger } from './logger.js';
import { attachCommandDispatcher } from './dispatcher.js';

const silent = () => createLogger({ level: 'error' });
const flush = () => new Promise((resolve) => setImmediate(resolve));

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

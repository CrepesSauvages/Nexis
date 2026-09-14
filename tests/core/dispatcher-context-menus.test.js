import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJsonDriver } from '../../src/core/storage/drivers/json.js';
import { createRegistries } from '../../src/core/registry/index.js';
import { USER_CONTEXT_MENU, MESSAGE_CONTEXT_MENU } from '../../src/core/registry/commands.js';
import { createGuildConfig } from '../../src/core/guild-config.js';
import { createLogger } from '../../src/core/logger.js';
import { attachCommandDispatcher } from '../../src/core/dispatcher.js';
import { translator } from '../../src/core/i18n/index.js';

const silent = () => createLogger({ level: 'error' });
const flush = () => new Promise((resolve) => setImmediate(resolve));

/** @type {string} */
let dir;
/** @type {import('../../src/core/storage/driver.js').StorageDriver} */
let storage;
/** @type {import('../../src/core/registry/index.js').Registries} */
let registries;
/** @type {ReturnType<typeof createGuildConfig>} */
let guildConfig;
/** @type {EventEmitter} */
let client;

/** @returns {import('discord.js').Client} */
const asClient = () => /** @type {import('discord.js').Client} */ (client);

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'nexis-ctx-'));
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

/**
 * Une doublure n'implémente que le prédicat qui la concerne : c'est
 * exactement ce que fait discord.js, dont un seul des trois prédicats rend
 * vrai pour une interaction donnée.
 */
const makeUserMenu = (overrides = {}) => ({
  isUserContextMenuCommand: () => true,
  commandName: 'Signaler',
  guildId: 'g1',
  user: { id: 'u1' },
  memberPermissions: { has: () => true },
  replied: false,
  deferred: false,
  reply: vi.fn(),
  followUp: vi.fn(),
  ...overrides,
});

const makeMessageMenu = (overrides = {}) =>
  makeUserMenu({
    isUserContextMenuCommand: () => false,
    isMessageContextMenuCommand: () => true,
    ...overrides,
  });

describe('attachCommandDispatcher — menus contextuels', () => {
  const attach = (options = {}) =>
    attachCommandDispatcher({
      client: asClient(),
      contexts: new Map([['moderation', /** @type {never} */ ({ marker: 'ctx' })]]),
      registries,
      guildConfig,
      logger: silent(),
      ...options,
    });

  it('devrait exécuter un menu contextuel utilisateur', async () => {
    const execute = vi.fn();
    registries.commands.add('moderation', {
      data: { name: 'Signaler', type: USER_CONTEXT_MENU },
      execute,
    });
    await guildConfig.enable('g1', 'moderation');
    attach();

    client.emit('interactionCreate', makeUserMenu());
    await flush();

    expect(execute).toHaveBeenCalledOnce();
    expect(execute.mock.calls[0][1]).toEqual({ marker: 'ctx' });
  });

  it('devrait exécuter un menu contextuel message', async () => {
    const execute = vi.fn();
    registries.commands.add('moderation', {
      data: { name: 'Signaler', type: MESSAGE_CONTEXT_MENU },
      execute,
    });
    await guildConfig.enable('g1', 'moderation');
    attach();

    client.emit('interactionCreate', makeMessageMenu());
    await flush();

    expect(execute).toHaveBeenCalledOnce();
  });

  it('devrait router chaque type vers son propre handler à nom égal', async () => {
    const slash = vi.fn();
    const menu = vi.fn();
    registries.commands.add('moderation', { data: { name: 'Signaler' }, execute: slash });
    registries.commands.add('moderation', {
      data: { name: 'Signaler', type: USER_CONTEXT_MENU },
      execute: menu,
    });
    await guildConfig.enable('g1', 'moderation');
    attach();

    client.emit('interactionCreate', makeUserMenu());
    await flush();

    expect(menu).toHaveBeenCalledOnce();
    expect(slash).not.toHaveBeenCalled();
  });

  it("devrait répondre plutôt qu'exécuter si le plugin est désactivé", async () => {
    const execute = vi.fn();
    registries.commands.add('moderation', {
      data: { name: 'Signaler', type: USER_CONTEXT_MENU },
      execute,
    });
    attach();

    const interaction = makeUserMenu();
    client.emit('interactionCreate', interaction);
    await flush();

    expect(execute).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledOnce();
  });

  it('devrait refuser un menu contextuel guild-admin sans la permission', async () => {
    const execute = vi.fn();
    registries.commands.add('moderation', {
      data: { name: 'Signaler', type: USER_CONTEXT_MENU },
      execute,
      permissions: 'guild-admin',
    });
    await guildConfig.enable('g1', 'moderation');
    attach();

    const interaction = makeUserMenu({ memberPermissions: { has: () => false } });
    client.emit('interactionCreate', interaction);
    await flush();

    expect(execute).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledOnce();
  });

  it('devrait répondre un identifiant traçable quand le handler lève', async () => {
    registries.commands.add('moderation', {
      data: { name: 'Signaler', type: USER_CONTEXT_MENU },
      execute: () => {
        throw new Error('boum');
      },
    });
    await guildConfig.enable('g1', 'moderation');
    attach({ t: translator.t });

    const interaction = makeUserMenu();
    client.emit('interactionCreate', interaction);
    await flush();

    expect(interaction.reply).toHaveBeenCalledOnce();
    const content = /** @type {string} */ (interaction.reply.mock.calls[0][0].content);
    expect(content).toMatch(/^Une erreur est survenue\. Référence : `[a-f0-9]{8}`$/);
  });
});

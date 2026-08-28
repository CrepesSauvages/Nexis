import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJsonDriver } from './storage/drivers/json.js';
import { createRegistries } from './registry/index.js';
import { createGuildConfig } from './guild-config.js';
import { createLogger } from './logger.js';
import { createCommandSync } from './command-sync.js';

const silent = () => createLogger({ level: 'error' });

/**
 * @param {string} name
 */
const command = (name) => ({
  data: { name, toJSON: () => ({ name }) },
  execute: () => {},
});

/** @type {string} */
let dir;
/** @type {import('./storage/driver.js').StorageDriver} */
let storage;
/** @type {import('./registry/index.js').Registries} */
let registries;
/** @type {ReturnType<typeof createGuildConfig>} */
let guildConfig;
/** @type {{ put: any }} */
let rest;

const build = (overrides = {}) =>
  createCommandSync({
    rest,
    clientId: 'app1',
    registries,
    guildConfig,
    logger: silent(),
    ...overrides,
  });

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'nexis-sync-'));
  storage = createJsonDriver({ path: join(dir, 's.json') });
  await storage.init();
  registries = createRegistries();
  guildConfig = createGuildConfig({ storage });
  rest = { put: vi.fn().mockResolvedValue([]) };
});

afterEach(async () => {
  await storage.close();
  await rm(dir, { recursive: true, force: true });
});

describe('syncGuild', () => {
  it('devrait pousser les commandes des plugins activés', async () => {
    registries.commands.add('welcome', command('hello'));
    await guildConfig.enable('g1', 'welcome');

    await build().syncGuild('g1');

    expect(rest.put).toHaveBeenCalledOnce();
    expect(rest.put.mock.calls[0][1].body).toEqual([{ name: 'hello' }]);
  });

  it('devrait exclure les commandes des plugins désactivés', async () => {
    registries.commands.add('welcome', command('hello'));

    await build().syncGuild('g1');

    expect(rest.put.mock.calls[0][1].body).toEqual([]);
  });

  it('devrait exclure les commandes globales du plugin interne', async () => {
    registries.commands.add('core', command('nexis'));
    registries.commands.add('welcome', command('hello'));
    await guildConfig.enable('g1', 'welcome');

    await build({ alwaysEnabled: ['core'] }).syncGuild('g1');

    expect(rest.put.mock.calls[0][1].body).toEqual([{ name: 'hello' }]);
  });

  it('devrait cibler la route de la guild concernée', async () => {
    await build().syncGuild('g1');
    expect(rest.put.mock.calls[0][0]).toContain('g1');
  });

  it('devrait logger et ne pas propager une erreur réseau', async () => {
    const logger = { ...silent(), error: vi.fn(), child: () => logger };
    rest.put.mockRejectedValue(new Error('429'));

    await expect(build({ logger }).syncGuild('g1')).resolves.not.toThrow();
    expect(logger.error).toHaveBeenCalledOnce();
  });
});

describe('syncGlobal', () => {
  it('devrait pousser uniquement les commandes alwaysEnabled', async () => {
    registries.commands.add('core', command('nexis'));
    registries.commands.add('welcome', command('hello'));

    await build({ alwaysEnabled: ['core'] }).syncGlobal();

    expect(rest.put.mock.calls[0][1].body).toEqual([{ name: 'nexis' }]);
  });

  it('devrait pousser un tableau vide si aucun plugin global', async () => {
    registries.commands.add('welcome', command('hello'));
    await build().syncGlobal();
    expect(rest.put.mock.calls[0][1].body).toEqual([]);
  });

  it('ne devrait pas cibler une guild', async () => {
    await build({ alwaysEnabled: ['core'] }).syncGlobal();
    expect(rest.put.mock.calls[0][0]).not.toContain('guilds');
  });
});

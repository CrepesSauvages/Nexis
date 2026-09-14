import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJsonDriver } from '../../src/core/storage/drivers/json.js';
import { createRegistries } from '../../src/core/registry/index.js';
import { createGuildConfig } from '../../src/core/guild-config.js';
import { createLogger } from '../../src/core/logger.js';
import { PermissionFlagsBits } from 'discord.js';
import { createCommandSync } from '../../src/core/command-sync.js';

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
/** @type {import('../../src/core/storage/driver.js').StorageDriver} */
let storage;
/** @type {import('../../src/core/registry/index.js').Registries} */
let registries;
/** @type {ReturnType<typeof createGuildConfig>} */
let guildConfig;
/** @type {{ put: ReturnType<typeof vi.fn<(route: string, options: { body: unknown }) => Promise<unknown>>> }} */
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

describe('permissions par défaut poussées à Discord', () => {
  /**
   * `data` passe par une fabrique plutôt que par un littéral en ligne :
   * `CommandDef['data']` ne déclare pas `toJSON`, et TypeScript refuse une
   * propriété en trop sur un littéral posé directement à l'appel.
   *
   * @param {string} name
   * @param {Record<string, unknown>} [extra] - champs du JSON réellement poussé
   */
  const dataWithJson = (name, extra = {}) => ({ name, toJSON: () => ({ name, ...extra }) });

  /** @returns {Record<string, unknown>} le premier corps poussé */
  const firstPushed = () =>
    /** @type {Record<string, unknown>[]} */ (rest.put.mock.calls[0][1].body)[0];

  /**
   * @param {object} command
   * @returns {Promise<Record<string, unknown>>}
   */
  const pushed = async (command) => {
    registries.commands.add('welcome', {
      data: dataWithJson('hello'),
      execute: () => {},
      ...command,
    });
    await guildConfig.enable('g1', 'welcome');
    await build().syncGuild('g1');
    return firstPushed();
  };

  it('devrait masquer une commande guild-admin derrière « Gérer le serveur »', async () => {
    const json = await pushed({ permissions: 'guild-admin' });
    expect(json.default_member_permissions).toBe(PermissionFlagsBits.ManageGuild.toString());
  });

  it('devrait masquer une commande owner à tous les membres', async () => {
    const json = await pushed({ permissions: 'owner' });
    expect(json.default_member_permissions).toBe('0');
  });

  it('ne devrait rien imposer à une commande sans niveau déclaré', async () => {
    const json = await pushed({});
    expect(json.default_member_permissions).toBeUndefined();
  });

  it('devrait respecter un default_member_permissions déjà posé par le plugin', async () => {
    registries.commands.add('welcome', {
      data: dataWithJson('hello', { default_member_permissions: '8' }),
      execute: () => {},
      permissions: 'guild-admin',
    });
    await guildConfig.enable('g1', 'welcome');
    await build().syncGuild('g1');

    expect(firstPushed().default_member_permissions).toBe('8');
  });

  it("ne devrait pas muter la donnée du plugin en l'absence de toJSON", async () => {
    const data = { name: 'hello' };
    registries.commands.add('welcome', { data, execute: () => {}, permissions: 'guild-admin' });
    await guildConfig.enable('g1', 'welcome');
    await build().syncGuild('g1');

    expect(data).toEqual({ name: 'hello' });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJsonDriver } from '../../src/core/storage/drivers/json.js';
import { createRegistries } from '../../src/core/registry/index.js';
import { createGuildConfig } from '../../src/core/guild-config.js';
import { createContext } from '../../src/core/context.js';
import { createLogger } from '../../src/core/logger.js';
import { DependencyError } from '../../src/core/errors.js';

const noop = () => {};
/** @type {string} */
let dir;
/** @type {import('../../src/core/storage/driver.js').StorageDriver} */
let storage;
/** @type {import('../../src/core/registry/index.js').Registries} */
let registries;
/** @type {ReturnType<typeof createGuildConfig>} */
let guildConfig;

/**
 * @param {string} name
 * @param {Partial<import('../../src/core/manifest.js').PluginManifest>} [manifest]
 * @returns {import('../../src/core/loader.js').LoadedPlugin}
 */
const makePlugin = (name, manifest = {}) => ({
  name,
  manifest: { name, version: '1.0.0', ...manifest },
  setup: noop,
  dir: `/fake/${name}`,
});

/**
 * @param {import('../../src/core/loader.js').LoadedPlugin} plugin
 * @param {Partial<Parameters<typeof createContext>[0]>} [extra]
 */
const makeContext = (plugin, extra = {}) =>
  createContext({
    plugin,
    client: /** @type {never} */ ({}),
    storage,
    logger: createLogger({ level: 'error' }),
    registries,
    guildConfig,
    ...extra,
  });

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'nexis-ctx-'));
  storage = createJsonDriver({ path: join(dir, 's.json') });
  await storage.init();
  registries = createRegistries();
  guildConfig = createGuildConfig({ storage });
});

afterEach(async () => {
  await storage.close();
  await rm(dir, { recursive: true, force: true });
});

describe('enregistrement', () => {
  it('devrait enregistrer une commande sous le nom du plugin', () => {
    makeContext(makePlugin('welcome')).registerCommand({ data: { name: 'hello' }, execute: noop });
    const entry = /** @type {{ plugin: string }} */ (registries.commands.get('hello'));
    expect(entry.plugin).toBe('welcome');
  });

  it('devrait enregistrer un event', () => {
    makeContext(makePlugin('welcome')).registerEvent('guildMemberAdd', noop);
    expect(registries.events.handlersFor('guildMemberAdd')).toHaveLength(1);
  });

  it('devrait enregistrer un job', () => {
    makeContext(makePlugin('welcome')).registerJob('0 9 * * *', noop);
    expect(registries.jobs.all()[0].plugin).toBe('welcome');
  });

  it('devrait enregistrer une route préfixée', () => {
    makeContext(makePlugin('welcome')).registerRoute({
      method: 'GET',
      path: '/stats',
      auth: 'public',
      handler: noop,
    });
    expect(registries.routes.all()[0].path).toBe('/api/plugins/welcome/stats');
  });
});

describe('services', () => {
  it('devrait exposer un service fourni', () => {
    const api = { greet: noop };
    makeContext(makePlugin('economy')).provideService(api);
    expect(registries.services.get('economy')).toBe(api);
  });

  it('devrait résoudre un service déclaré dans dependsOn', () => {
    makeContext(makePlugin('economy')).provideService({ pay: noop });
    const shop = makeContext(makePlugin('shop', { dependsOn: ['economy'] }));
    expect(shop.useService('economy')).toHaveProperty('pay');
  });

  it('devrait refuser un service non déclaré dans dependsOn', () => {
    makeContext(makePlugin('economy')).provideService({ pay: noop });
    const shop = makeContext(makePlugin('shop'));
    expect(() => shop.useService('economy')).toThrow(DependencyError);
  });

  it("devrait nommer dependsOn dans le message d'erreur", () => {
    const shop = makeContext(makePlugin('shop'));
    expect(() => shop.useService('economy')).toThrow(/dependsOn/);
  });

  it('devrait signaler un service déclaré mais jamais fourni', () => {
    const shop = makeContext(makePlugin('shop', { dependsOn: ['economy'] }));
    expect(() => shop.useService('economy')).toThrow(DependencyError);
  });
});

describe('storage scopé', () => {
  it('devrait écrire dans son propre namespace', async () => {
    await makeContext(makePlugin('welcome')).storage.set('streak', 3);
    expect(await storage.get('plugin:welcome:streak')).toBe(3);
  });

  it("ne devrait pas voir les données d'un autre plugin", async () => {
    await makeContext(makePlugin('a')).storage.set('secret', 'x');
    expect(await makeContext(makePlugin('b')).storage.get('secret')).toBeUndefined();
  });
});

describe('config', () => {
  it('devrait retourner les défauts du manifeste', async () => {
    const plugin = makePlugin('welcome', {
      config: { msg: { type: 'string', label: 'Message', default: 'Salut' } },
    });
    expect(await makeContext(plugin).config('g1')).toEqual({ msg: 'Salut' });
  });

  it('devrait refléter les valeurs enregistrées', async () => {
    const plugin = makePlugin('welcome', {
      config: { msg: { type: 'string', label: 'Message', default: 'Salut' } },
    });
    await guildConfig.setConfig('g1', 'welcome', { msg: 'Yo' });
    expect(await makeContext(plugin).config('g1')).toEqual({ msg: 'Yo' });
  });
});

describe('logger', () => {
  it('devrait préfixer avec le nom du plugin', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    createContext({
      plugin: makePlugin('welcome'),
      client: /** @type {never} */ ({}),
      storage,
      logger: createLogger({ level: 'info' }),
      registries,
      guildConfig,
    }).logger.info('prêt');
    expect(spy.mock.calls[0][0]).toContain('[plugin:welcome]');
    spy.mockRestore();
  });
});

describe('accès privilégié', () => {
  it('ne devrait pas exposer core par défaut', () => {
    expect(makeContext(makePlugin('welcome')).core).toBeUndefined();
  });

  it('devrait exposer core à un plugin privilégié', () => {
    const ctx = makeContext(makePlugin('core'), { privileged: true, plugins: [makePlugin('a')] });
    expect(ctx.core?.plugins).toHaveLength(1);
    expect(ctx.core?.guildConfig).toBe(guildConfig);
  });
});

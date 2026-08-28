import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { bootstrap } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, 'fixtures', 'plugins');
const flush = () => new Promise((resolve) => setImmediate(resolve));

class FakeClient extends EventEmitter {
  constructor() {
    super();
    this.guilds = { cache: new Map() };
    this.login = vi.fn().mockResolvedValue('ok');
    this.destroy = vi.fn().mockResolvedValue(undefined);
  }
}

/**
 * FakeClient est un simple EventEmitter en test, pas un vrai Client
 * discord.js — suffisant pour piloter tout le trajet d'un event, sans
 * connexion réseau.
 * @returns {import('discord.js').Client}
 */
const fakeClient = () =>
  /** @type {import('discord.js').Client} */ (/** @type {unknown} */ (new FakeClient()));

/**
 * @param {import('discord.js').Client} client
 * @param {string} event
 * @param {unknown} payload
 */
const emit = (client, event, payload) =>
  /** @type {import('node:events').EventEmitter} */ (client).emit(event, payload);

/** @type {string} */
let dir;
/** @type {Awaited<ReturnType<typeof bootstrap>> | undefined} */
let app;

const boot = async (overrides = {}) => {
  app = await bootstrap({
    env: {
      DISCORD_TOKEN: 'tok',
      DISCORD_CLIENT_ID: 'app1',
      LOG_LEVEL: 'error',
      STORAGE_DRIVER: 'json',
      STORAGE_PATH: join(dir, 'store.json'),
      PLUGINS_DIR: fixtures,
      ...overrides,
    },
    clientFactory: fakeClient,
    restFactory: () => ({ put: vi.fn().mockResolvedValue([]) }),
  });
  return app;
};

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'nexis-boot-'));
});

afterEach(async () => {
  await app?.shutdown();
  app = undefined;
  await rm(dir, { recursive: true, force: true });
});

describe('bootstrap', () => {
  it('devrait charger les plugins valides des fixtures', async () => {
    const { plugins } = await boot();
    expect(plugins.map((p) => p.name).sort()).toEqual(['alpha', 'beta']);
  });

  it('devrait construire un contexte par plugin', async () => {
    const { contexts } = await boot();
    expect(contexts.get('alpha')).toBeDefined();
    expect(contexts.get('beta')).toBeDefined();
  });

  it('devrait démarrer malgré un plugin invalide dans le répertoire', async () => {
    const { plugins } = await boot();
    expect(plugins.map((p) => p.name)).not.toContain('Broken');
  });

  it('devrait exposer un storage fonctionnel', async () => {
    const { storage } = await boot();
    await storage.set('test', 1);
    expect(await storage.get('test')).toBe(1);
  });

  it('ne devrait pas se connecter à Discord', async () => {
    const { client } = await boot();
    expect(client.login).not.toHaveBeenCalled();
  });

  it('devrait rejeter si la configuration est invalide', async () => {
    await expect(
      bootstrap({ env: { DISCORD_CLIENT_ID: 'app1' }, clientFactory: fakeClient }),
    ).rejects.toThrow(/DISCORD_TOKEN/);
  });
});

describe('boot complet — comportement', () => {
  it("devrait délivrer un event au plugin qui l'a déclaré", async () => {
    // Le plugin fixture `alpha` déclare guildMemberAdd dans son setup et
    // écrit dans son storage à chaque appel — on observe donc le trajet
    // complet : listener attaché au boot, filtre guild, handler, storage.
    const { client, guildConfig, storage } = await boot();
    await guildConfig.enable('g1', 'alpha');

    emit(client, 'guildMemberAdd', { guildId: 'g1' });
    await flush();

    expect(await storage.get('plugin:alpha:vus')).toBe(1);
  });

  it("ne devrait pas délivrer l'event si le plugin est désactivé", async () => {
    const { client, storage } = await boot();

    emit(client, 'guildMemberAdd', { guildId: 'g1' });
    await flush();

    expect(await storage.get('plugin:alpha:vus')).toBeUndefined();
  });

  it('devrait activer puis désactiver un plugin sur une guild', async () => {
    const { guildConfig } = await boot();
    await guildConfig.enable('g1', 'alpha');
    expect(await guildConfig.isEnabled('g1', 'alpha')).toBe(true);
    await guildConfig.disable('g1', 'alpha');
    expect(await guildConfig.isEnabled('g1', 'alpha')).toBe(false);
  });

  it('devrait persister les activations entre deux boots', async () => {
    const first = await boot();
    await first.guildConfig.enable('g1', 'alpha');
    await first.shutdown();
    app = undefined;

    const second = await boot();
    expect(await second.guildConfig.isEnabled('g1', 'alpha')).toBe(true);
  });

  it('devrait fermer proprement le storage au shutdown', async () => {
    const booted = await boot();
    await booted.shutdown();
    app = undefined;
    expect(booted.client.destroy).toHaveBeenCalledOnce();
  });
});

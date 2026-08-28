import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJsonDriver } from './storage/drivers/json.js';
import { createGuildConfig } from './guild-config.js';

/** @type {string} */
let dir;
/** @type {import('./storage/driver.js').StorageDriver} */
let storage;
/** @type {ReturnType<typeof createGuildConfig>} */
let guildConfig;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'nexis-gc-'));
  storage = createJsonDriver({ path: join(dir, 's.json') });
  await storage.init();
  guildConfig = createGuildConfig({ storage });
});

afterEach(async () => {
  await storage.close();
  await rm(dir, { recursive: true, force: true });
});

describe('activation des plugins', () => {
  it('devrait démarrer sans aucun plugin activé', async () => {
    expect(await guildConfig.enabledPlugins('g1')).toEqual([]);
  });

  it('devrait activer un plugin', async () => {
    await guildConfig.enable('g1', 'welcome');
    expect(await guildConfig.isEnabled('g1', 'welcome')).toBe(true);
  });

  it('devrait désactiver un plugin', async () => {
    await guildConfig.enable('g1', 'welcome');
    await guildConfig.disable('g1', 'welcome');
    expect(await guildConfig.isEnabled('g1', 'welcome')).toBe(false);
  });

  it('devrait isoler les guilds entre elles', async () => {
    await guildConfig.enable('g1', 'welcome');
    expect(await guildConfig.isEnabled('g2', 'welcome')).toBe(false);
  });

  it('devrait tolérer une double activation', async () => {
    await guildConfig.enable('g1', 'welcome');
    await guildConfig.enable('g1', 'welcome');
    expect(await guildConfig.enabledPlugins('g1')).toEqual(['welcome']);
  });

  it("devrait tolérer la désactivation d'un plugin inactif", async () => {
    await expect(guildConfig.disable('g1', 'absent')).resolves.not.toThrow();
  });

  it('devrait persister les activations dans le storage', async () => {
    await guildConfig.enable('g1', 'welcome');
    expect(await storage.get('core:guild:g1:enabled')).toEqual(['welcome']);
  });

  it('devrait relire depuis le storage après invalidation du cache', async () => {
    await storage.set('core:guild:g1:enabled', ['injecté']);
    guildConfig.invalidate('g1');
    expect(await guildConfig.enabledPlugins('g1')).toEqual(['injecté']);
  });

  it('ne devrait pas exposer une référence mutable au cache', async () => {
    await guildConfig.enable('g1', 'welcome');
    const plugins1 = await guildConfig.enabledPlugins('g1');
    plugins1.push('mutated');
    const plugins2 = await guildConfig.enabledPlugins('g1');
    expect(plugins2).toEqual(['welcome']);
  });
});

describe('configuration des plugins', () => {
  const schema = {
    message: { type: 'string', label: 'Message', default: 'Salut' },
    channelId: { type: 'channel', label: 'Salon', required: true },
  };

  it('devrait retourner les valeurs par défaut du schéma', async () => {
    expect(await guildConfig.getConfig('g1', 'welcome', schema)).toEqual({ message: 'Salut' });
  });

  it('devrait fusionner les valeurs stockées avec les défauts', async () => {
    await guildConfig.setConfig('g1', 'welcome', { channelId: '99' });
    expect(await guildConfig.getConfig('g1', 'welcome', schema)).toEqual({
      message: 'Salut',
      channelId: '99',
    });
  });

  it('devrait laisser une valeur stockée écraser son défaut', async () => {
    await guildConfig.setConfig('g1', 'welcome', { message: 'Yo' });
    expect((await guildConfig.getConfig('g1', 'welcome', schema)).message).toBe('Yo');
  });

  it('devrait fusionner les écritures successives', async () => {
    await guildConfig.setConfig('g1', 'welcome', { message: 'Yo' });
    await guildConfig.setConfig('g1', 'welcome', { channelId: '99' });
    const config = await guildConfig.getConfig('g1', 'welcome', schema);
    expect(config).toEqual({ message: 'Yo', channelId: '99' });
  });

  it('devrait isoler la config entre plugins', async () => {
    await guildConfig.setConfig('g1', 'welcome', { message: 'Yo' });
    expect(await guildConfig.getConfig('g1', 'autre', {})).toEqual({});
  });

  it('devrait retourner un objet vide sans schéma ni valeurs', async () => {
    expect(await guildConfig.getConfig('g1', 'welcome', undefined)).toEqual({});
  });
});

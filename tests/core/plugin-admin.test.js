import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJsonDriver } from '../../src/core/storage/drivers/json.js';
import { createGuildConfig } from '../../src/core/guild-config.js';
import { createPluginAdmin } from '../../src/core/plugin-admin.js';

/** @type {string} */
let dir;
/** @type {import('../../src/core/storage/driver.js').StorageDriver} */
let storage;
/** @type {ReturnType<typeof createGuildConfig>} */
let guildConfig;
/** @type {{ syncGuild: import('vitest').Mock }} */
let commandSync;

/**
 * @param {string} name
 * @param {string[]} [dependsOn]
 * @returns {import('../../src/core/loader.js').LoadedPlugin}
 */
const fakePlugin = (name, dependsOn) =>
  /** @type {import('../../src/core/loader.js').LoadedPlugin} */ (
    /** @type {unknown} */ ({
      name,
      dir: `/plugins/${name}`,
      manifest: { name, version: '1.0.0', ...(dependsOn ? { dependsOn } : {}) },
      setup: () => {},
    })
  );

const build = () =>
  createPluginAdmin({
    plugins: [fakePlugin('core'), fakePlugin('alpha'), fakePlugin('beta', ['alpha'])],
    guildConfig,
    commandSync: /** @type {{ syncGuild: (guildId: string) => Promise<void> }} */ (
      /** @type {unknown} */ (commandSync)
    ),
    alwaysEnabled: ['core'],
  });

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'nexis-admin-'));
  storage = createJsonDriver({ path: join(dir, 's.json') });
  await storage.init();
  guildConfig = createGuildConfig({ storage });
  commandSync = { syncGuild: vi.fn().mockResolvedValue(undefined) };
});

afterEach(async () => {
  await storage.close();
  await rm(dir, { recursive: true, force: true });
});

describe('enable', () => {
  it('devrait activer un plugin et resynchroniser les commandes', async () => {
    const admin = build();
    expect(await admin.enable('g1', 'alpha')).toEqual({ ok: true });
    expect(await guildConfig.isEnabled('g1', 'alpha')).toBe(true);
    expect(commandSync.syncGuild).toHaveBeenCalledWith('g1');
  });

  it('devrait refuser un plugin inconnu', async () => {
    expect(await build().enable('g1', 'fantome')).toEqual({ ok: false, reason: 'not_found' });
  });

  it('devrait refuser un plugin interne', async () => {
    expect(await build().enable('g1', 'core')).toEqual({ ok: false, reason: 'always_enabled' });
  });

  it('devrait refuser un plugin déjà activé', async () => {
    const admin = build();
    await admin.enable('g1', 'alpha');
    expect(await admin.enable('g1', 'alpha')).toEqual({ ok: false, reason: 'already_enabled' });
  });

  it('devrait refuser un plugin dont une dépendance est inactive', async () => {
    expect(await build().enable('g1', 'beta')).toEqual({
      ok: false,
      reason: 'missing_deps',
      deps: ['alpha'],
    });
  });

  it('ne devrait rien écrire quand il refuse', async () => {
    const admin = build();
    await admin.enable('g1', 'beta');
    expect(await guildConfig.isEnabled('g1', 'beta')).toBe(false);
    expect(commandSync.syncGuild).not.toHaveBeenCalled();
  });

  it('devrait accepter un plugin dont la dépendance est activée', async () => {
    const admin = build();
    await admin.enable('g1', 'alpha');
    expect(await admin.enable('g1', 'beta')).toEqual({ ok: true });
  });
});

describe('disable', () => {
  it('devrait désactiver un plugin et resynchroniser les commandes', async () => {
    const admin = build();
    await admin.enable('g1', 'alpha');
    commandSync.syncGuild.mockClear();
    expect(await admin.disable('g1', 'alpha')).toEqual({ ok: true });
    expect(await guildConfig.isEnabled('g1', 'alpha')).toBe(false);
    expect(commandSync.syncGuild).toHaveBeenCalledWith('g1');
  });

  it('devrait refuser un plugin inconnu', async () => {
    expect(await build().disable('g1', 'fantome')).toEqual({ ok: false, reason: 'not_found' });
  });

  it('devrait refuser un plugin interne', async () => {
    expect(await build().disable('g1', 'core')).toEqual({ ok: false, reason: 'always_enabled' });
  });

  it('devrait refuser tant qu un plugin actif en dépend', async () => {
    const admin = build();
    await admin.enable('g1', 'alpha');
    await admin.enable('g1', 'beta');
    expect(await admin.disable('g1', 'alpha')).toEqual({
      ok: false,
      reason: 'has_dependents',
      deps: ['beta'],
    });
  });

  it('devrait réussir sur un plugin déjà inactif', async () => {
    expect(await build().disable('g1', 'alpha')).toEqual({ ok: true });
  });
});

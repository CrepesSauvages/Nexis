import { describe, it, expect, vi } from 'vitest';
import { startShardManager } from '../src/shard-manager.js';
import { ConfigError } from '../src/core/errors.js';

const shardedEnv = {
  DISCORD_TOKEN: 'tok',
  DISCORD_CLIENT_ID: 'app1',
  LOG_LEVEL: 'error',
  STORAGE_DRIVER: 'postgres',
  STORAGE_PATH: 'postgres://localhost/nexis',
};

/** Gestionnaire réduit à ce que `startShardManager` consulte. */
const fakeManager = () => ({
  on: vi.fn(),
  spawn: vi.fn().mockResolvedValue(undefined),
  shards: new Map([[0, { id: 0, on: vi.fn() }]]),
});

/**
 * @param {Record<string, string | undefined>} env
 * @returns {Promise<{ manager: ReturnType<typeof fakeManager>, options: Record<string, unknown> }>}
 */
const start = async (env) => {
  const manager = fakeManager();
  /** @type {Record<string, unknown>} */
  let options = {};
  await startShardManager({
    env,
    managerFactory: (_file, received) => {
      options = /** @type {Record<string, unknown>} */ (received);
      return /** @type {never} */ (manager);
    },
    // Les vrais garde-fous poseraient des écouteurs SIGINT et
    // uncaughtException sur le process du lanceur de tests.
    installGuards: /** @type {never} */ (() => ({ uninstall: () => {} })),
  });
  return { manager, options };
};

describe('startShardManager', () => {
  it('devrait lancer les shards', async () => {
    const { manager } = await start(shardedEnv);
    expect(manager.spawn).toHaveBeenCalledOnce();
  });

  it('devrait demander à Discord le nombre de shards par défaut', async () => {
    const { options } = await start(shardedEnv);
    expect(options).toMatchObject({ token: 'tok', totalShards: 'auto', respawn: true });
  });

  it('devrait respecter un nombre de shards imposé', async () => {
    const { options } = await start({ ...shardedEnv, TOTAL_SHARDS: '4' });
    expect(options.totalShards).toBe(4);
  });

  it('devrait refuser un driver mono-process avant de lancer quoi que ce soit', async () => {
    const managerFactory = vi.fn();
    await expect(
      startShardManager({
        env: { ...shardedEnv, STORAGE_DRIVER: 'json', STORAGE_PATH: './data/nexis.json' },
        managerFactory: /** @type {never} */ (managerFactory),
        installGuards: /** @type {never} */ (() => ({ uninstall: () => {} })),
      }),
    ).rejects.toThrow(ConfigError);

    // Aucun process enfant n'a été lancé : l'erreur tombe dans le lanceur.
    expect(managerFactory).not.toHaveBeenCalled();
  });

  it('devrait écouter la naissance des shards', async () => {
    const { manager } = await start(shardedEnv);
    expect(manager.on).toHaveBeenCalledWith('shardCreate', expect.any(Function));
  });
});

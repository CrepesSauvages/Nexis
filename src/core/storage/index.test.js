import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStorage, namespaced } from './index.js';
import { ConfigError } from '../errors.js';

/** @type {string} */
let dir;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'nexis-store-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('createStorage', () => {
  it('devrait résoudre et initialiser le driver json', async () => {
    const storage = await createStorage({
      storage: { driver: 'json', path: join(dir, 's.json') },
    });
    await storage.set('a', 1);
    expect(await storage.get('a')).toBe(1);
    await storage.close();
  });

  it('devrait lever une ConfigError pour un driver inconnu', async () => {
    await expect(createStorage({ storage: { driver: 'redis', path: 'x' } })).rejects.toThrow(
      ConfigError,
    );
  });
});

describe('namespaced', () => {
  /** @type {import('./driver.js').StorageDriver} */
  let storage;

  beforeEach(async () => {
    storage = await createStorage({ storage: { driver: 'json', path: join(dir, 's.json') } });
  });

  afterEach(async () => {
    await storage.close();
  });

  it('devrait préfixer les clés écrites', async () => {
    await namespaced(storage, 'plugin:welcome').set('streak', 5);
    expect(await storage.get('plugin:welcome:streak')).toBe(5);
  });

  it('devrait relire ses propres clés', async () => {
    const scoped = namespaced(storage, 'plugin:welcome');
    await scoped.set('streak', 5);
    expect(await scoped.get('streak')).toBe(5);
  });

  it("ne devrait pas voir les clés d'un autre namespace", async () => {
    await namespaced(storage, 'plugin:a').set('secret', 'x');
    expect(await namespaced(storage, 'plugin:b').get('secret')).toBeUndefined();
  });

  it('devrait retourner les clés sans le préfixe', async () => {
    const scoped = namespaced(storage, 'plugin:welcome');
    await scoped.set('a', 1);
    await scoped.set('b', 2);
    expect((await scoped.keys('')).sort()).toEqual(['a', 'b']);
  });

  it('devrait limiter keys() à son namespace', async () => {
    await namespaced(storage, 'plugin:a').set('x', 1);
    const scopedB = namespaced(storage, 'plugin:b');
    await scopedB.set('y', 2);
    expect(await scopedB.keys('')).toEqual(['y']);
  });

  it('devrait supprimer dans son namespace', async () => {
    const scoped = namespaced(storage, 'plugin:welcome');
    await scoped.set('a', 1);
    await scoped.delete('a');
    expect(await storage.get('plugin:welcome:a')).toBeUndefined();
  });

  it('ne devrait pas exposer init/close — un plugin ne doit pas pouvoir fermer le storage partagé', async () => {
    const scoped = /** @type {Record<string, unknown>} */ (
      /** @type {unknown} */ (namespaced(storage, 'plugin:welcome'))
    );
    expect(scoped.close).toBeUndefined();
    expect(scoped.init).toBeUndefined();

    // Le handle non namespacé, lui, doit toujours pouvoir être fermé
    // normalement — c'est le rôle exclusif de bootstrap()/shutdown().
    await expect(storage.close()).resolves.toBeUndefined();
  });
});
